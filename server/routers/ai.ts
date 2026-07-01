import type { Express } from "express";
import multer from "multer";

import { db } from "../db";
import { eq } from "drizzle-orm";
import { vendorAccounts } from "@shared/schema";
import { getVendorAccountFromRequest, requireVendorAuth0 } from "../services/vendorAuth";
import { getVendorEntitlements } from "../services/entitlementsService";
import { resolveStoredUploadPath } from "../lib/objectStorage";
import { persistUploadedFile } from "../lib/imageUpload";
import { messagingRateLimiter, uploadRateLimiter, mutationRateLimiter } from "../lib/rateLimiters";
import { logRouteError } from "../lib/routeHelpers";
import {
  generateSuggestedReplies,
  extractPdfText,
  saveVendorFaq,
  getActiveFaq,
  deleteVendorFaq,
  getAiSettings,
  AiReplyError,
} from "../aiReplyService";

/**
 * AI reply assistant routes (Pro-gated, metered). Generates suggested replies for
 * vendors in the chat section (never auto-sends), manages the optional FAQ PDF the
 * model references, and exposes the per-vendor settings + credit meter.
 */
export function registerAiRoutes(app: Express): void {
  const faqUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype === "application/pdf");
    },
  });

  // POST /api/vendor/ai/suggest-reply — generate (don't send) draft replies.
  app.post(
    "/api/vendor/ai/suggest-reply",
    messagingRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.status(404).json({ error: "vendor_not_found" });

        const bookingId =
          typeof req.body?.bookingId === "string" ? req.body.bookingId.trim() : undefined;
        const channelId =
          typeof req.body?.channelId === "string" ? req.body.channelId.trim() : undefined;

        const result = await generateSuggestedReplies({ account, bookingId, channelId });
        return res.json(result);
      } catch (err: any) {
        if (err instanceof AiReplyError) {
          return res.status(err.status).json({ error: err.code, message: err.message });
        }
        logRouteError("/api/vendor/ai/suggest-reply", err);
        return res.status(500).json({ error: "ai_error", message: "Could not generate a reply" });
      }
    }
  );

  // GET /api/vendor/ai/settings — feature state + credit meter for the billing UI.
  app.get("/api/vendor/ai/settings", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(404).json({ error: "vendor_not_found" });
      const isPro = getVendorEntitlements(account).isPro;
      const settings = await getAiSettings(account);
      return res.json({ isPro, ...settings });
    } catch (err: any) {
      logRouteError("/api/vendor/ai/settings", err);
      return res.status(500).json({ error: "ai_error" });
    }
  });

  // POST /api/vendor/ai/settings — toggle the feature and/or pay-as-you-go overage.
  app.post(
    "/api/vendor/ai/settings",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.status(404).json({ error: "vendor_not_found" });

        const updates: { aiRepliesEnabled?: boolean; aiOverageEnabled?: boolean } = {};
        if (typeof req.body?.enabled === "boolean") updates.aiRepliesEnabled = req.body.enabled;
        if (typeof req.body?.overageEnabled === "boolean")
          updates.aiOverageEnabled = req.body.overageEnabled;

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({ error: "no_changes" });
        }

        await db.update(vendorAccounts).set(updates).where(eq(vendorAccounts.id, account.id));

        // Return fresh settings (re-read so the meter + toggles reflect the write).
        const [fresh] = await db
          .select()
          .from(vendorAccounts)
          .where(eq(vendorAccounts.id, account.id))
          .limit(1);
        const isPro = getVendorEntitlements(fresh ?? account).isPro;
        const settings = await getAiSettings(fresh ?? account);
        return res.json({ isPro, ...settings });
      } catch (err: any) {
        logRouteError("/api/vendor/ai/settings POST", err);
        return res.status(500).json({ error: "ai_error" });
      }
    }
  );

  // GET /api/vendor/ai/faq — metadata for the current FAQ document (or null).
  app.get("/api/vendor/ai/faq", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(404).json({ error: "vendor_not_found" });
      const faq = await getActiveFaq(account.id);
      return res.json(
        faq
          ? {
              filename: faq.originalFilename,
              charCount: faq.charCount,
              pageCount: faq.pageCount,
              updatedAt: faq.updatedAt,
            }
          : null
      );
    } catch (err: any) {
      logRouteError("/api/vendor/ai/faq GET", err);
      return res.status(500).json({ error: "ai_error" });
    }
  });

  // POST /api/vendor/ai/faq — upload/replace the FAQ PDF the AI references.
  app.post(
    "/api/vendor/ai/faq",
    uploadRateLimiter,
    ...requireVendorAuth0,
    faqUpload.single("file"),
    async (req: any, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.status(404).json({ error: "vendor_not_found" });
        if (!getVendorEntitlements(account).isPro) {
          return res.status(403).json({ error: "ai_pro_required", message: "AI replies are a Pro feature" });
        }

        const fileBuffer = req?.file?.buffer as Buffer | undefined;
        const originalName: string = req?.file?.originalname ?? "faq.pdf";
        if (!fileBuffer) {
          return res.status(400).json({ error: "bad_file", message: "Only PDF allowed (max 10MB)." });
        }

        const { text, pageCount } = await extractPdfText(fileBuffer);
        if (!text || text.length < 20) {
          return res
            .status(422)
            .json({ error: "no_text", message: "Couldn't read any text from that PDF." });
        }

        // Store the raw PDF durably. persistUploadedFile requires object storage
        // in production (throws on failure) — never writes to ephemeral disk there.
        const { storagePath } = await persistUploadedFile(fileBuffer, "vendor-faq", {
          contentType: "application/pdf",
          ext: "pdf",
        });
        const storageUrl = resolveStoredUploadPath(storagePath) ?? storagePath;

        const saved = await saveVendorFaq({
          vendorAccountId: account.id,
          storageUrl,
          originalFilename: originalName,
          extractedText: text,
          pageCount,
        });

        return res.json({
          filename: saved.originalFilename,
          charCount: saved.charCount,
          pageCount: saved.pageCount,
        });
      } catch (err: any) {
        logRouteError("/api/vendor/ai/faq POST", err);
        return res.status(500).json({ error: "ai_error", message: "Upload failed" });
      }
    }
  );

  // DELETE /api/vendor/ai/faq — soft-delete the active FAQ (raw PDF retained for audit).
  app.delete("/api/vendor/ai/faq", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(404).json({ error: "vendor_not_found" });
      await deleteVendorFaq(account.id);
      return res.json({ ok: true });
    } catch (err: any) {
      logRouteError("/api/vendor/ai/faq DELETE", err);
      return res.status(500).json({ error: "ai_error" });
    }
  });
}
