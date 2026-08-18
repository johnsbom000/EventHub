import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import { and, desc, eq, gte, isNull, sql as drizzleSql } from "drizzle-orm";

import { db } from "./db";
import { aiReplyUsage, vendorFaqDocuments, type VendorAccount } from "@shared/schema";
import { detectChatCircumvention } from "@shared/circumvention";
import {
  AI_REPLY_MODEL,
  AI_INCLUDED_RESPONSES_PER_PERIOD,
  AI_OVERAGE_PRICE_CENTS,
} from "./lib/constants";
import { getVendorEntitlements, isCommissionVendor } from "./services/entitlementsService";
import {
  getBookingChatContextById,
  listVendorInquiryChannels,
} from "./services/chatService";
import {
  getRecentMessagesForChannel,
  toStreamBookingChannelId,
  type StreamReplyMessage,
} from "./streamChat";
import { reportAiReplyOverage } from "./stripe";
import { logger } from "./lib/logger";

// Largest slice of FAQ text we feed the model. A few pages is plenty of context;
// this caps cost and keeps the prompt well inside the window. ~40k chars ≈ ~10k tokens.
const FAQ_TEXT_MAX_CHARS = 40_000;
const HISTORY_MESSAGE_LIMIT = 12;
const DRAFTS_RETURNED = 2;

/** Typed error so the router can map service failures to HTTP status codes. */
export class AiReplyError extends Error {
  constructor(
    public code: string,
    public status: number,
    message?: string
  ) {
    super(message || code);
    this.name = "AiReplyError";
  }
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) {
    throw new AiReplyError("ai_not_configured", 503, "ANTHROPIC_API_KEY is not configured");
  }
  if (!cachedClient) cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── PDF extraction ────────────────────────────────────────────────────────────

export async function extractPdfText(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = String(result?.text || "")
      // Strip control chars (keep newlines/tabs) and clamp length.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .slice(0, FAQ_TEXT_MAX_CHARS)
      .trim();
    return { text, pageCount: Number(result?.total) || 0 };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

// ─── FAQ document persistence ───────────────────────────────────────────────────

export async function getActiveFaq(vendorAccountId: string) {
  const rows = await db
    .select()
    .from(vendorFaqDocuments)
    .where(
      and(
        eq(vendorFaqDocuments.vendorAccountId, vendorAccountId),
        isNull(vendorFaqDocuments.deletedAt)
      )
    )
    .orderBy(desc(vendorFaqDocuments.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveVendorFaq(params: {
  vendorAccountId: string;
  storageUrl: string;
  originalFilename: string | null;
  extractedText: string;
  pageCount: number;
}) {
  // One active FAQ per vendor — soft-delete any existing one, then insert the new.
  await db
    .update(vendorFaqDocuments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(vendorFaqDocuments.vendorAccountId, params.vendorAccountId),
        isNull(vendorFaqDocuments.deletedAt)
      )
    );

  const [row] = await db
    .insert(vendorFaqDocuments)
    .values({
      vendorAccountId: params.vendorAccountId,
      storageUrl: params.storageUrl,
      originalFilename: params.originalFilename,
      extractedText: params.extractedText,
      charCount: params.extractedText.length,
      pageCount: params.pageCount || null,
    })
    .returning();
  return row;
}

export async function deleteVendorFaq(vendorAccountId: string) {
  await db
    .update(vendorFaqDocuments)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(vendorFaqDocuments.vendorAccountId, vendorAccountId),
        isNull(vendorFaqDocuments.deletedAt)
      )
    );
}

// ─── Credit accounting ──────────────────────────────────────────────────────────

function computePeriodBounds(account: VendorAccount): { start: Date; resetsAt: Date } {
  const end = account.subscriptionCurrentPeriodEnd
    ? new Date(account.subscriptionCurrentPeriodEnd)
    : null;
  if (end && !Number.isNaN(end.getTime())) {
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    return { start, resetsAt: end };
  }
  // Fallback for comp/no-period accounts: calendar month in UTC.
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, resetsAt };
}

export interface AiCreditState {
  includedPerPeriod: number;
  used: number;
  remaining: number;
  periodResetsAt: string;
  overagePriceCents: number;
}

export async function getAiCreditState(account: VendorAccount): Promise<AiCreditState> {
  const { start, resetsAt } = computePeriodBounds(account);
  const rows = await db
    .select({ count: drizzleSql<number>`count(*)::int` })
    .from(aiReplyUsage)
    .where(
      and(
        eq(aiReplyUsage.vendorAccountId, account.id),
        gte(aiReplyUsage.createdAt, start)
      )
    );
  const used = rows[0]?.count ?? 0;
  return {
    includedPerPeriod: AI_INCLUDED_RESPONSES_PER_PERIOD,
    used,
    remaining: Math.max(0, AI_INCLUDED_RESPONSES_PER_PERIOD - used),
    periodResetsAt: resetsAt.toISOString(),
    overagePriceCents: AI_OVERAGE_PRICE_CENTS,
  };
}

export async function getAiSettings(account: VendorAccount) {
  const credits = await getAiCreditState(account);
  return {
    enabled: account.aiRepliesEnabled === true,
    // Mirrors the enforcement in generateSuggestedReplies: commission vendors
    // have no subscription to meter overage against, so the UI must not show
    // overage as on when generation will hard-stop at the allowance.
    overageEnabled: account.aiOverageEnabled === true && !isCommissionVendor(account),
    // Whether pay-as-you-go can be turned on AT ALL. False for commission
    // vendors, who hard-stop at the allowance. The client needs this to avoid
    // telling them to "turn on pay-as-you-go in Billing" — a remedy that does
    // not exist for them, and whose toggle would visibly snap back.
    overageAvailable: !isCommissionVendor(account),
    ...credits,
  };
}

// ─── Prompt construction ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  "You draft suggested reply messages for an event-services vendor talking with a customer",
  "inside EventHub's in-app chat. The vendor will review, edit, and send your draft — you never",
  "send anything yourself.",
  "",
  "Rules:",
  `- Produce exactly ${DRAFTS_RETURNED} alternative replies the vendor could send next.`,
  "- Continue the VENDOR's voice (warm, professional, concise — 1-3 short sentences each).",
  "- Answer the customer's latest question using the vendor's FAQ when relevant.",
  "- NEVER include phone numbers, email addresses, external links, social handles, or any",
  "  suggestion to move the conversation off EventHub. Keep everything on-platform.",
  "- If you don't know something, say the vendor will follow up — do not invent specifics",
  "  (prices, dates, policies) that aren't in the FAQ or conversation.",
].join("\n");

const REPLIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["replies"],
  properties: {
    replies: {
      type: "array",
      items: { type: "string" },
      description: `${DRAFTS_RETURNED} alternative reply messages the vendor could send.`,
    },
  },
} as const;

function buildContextBlock(vendorName: string, faqText: string): string {
  const parts = [`Vendor business name: ${vendorName || "the vendor"}.`];
  if (faqText.trim()) {
    parts.push("", "Vendor FAQ (reference this when answering):", faqText.trim());
  } else {
    parts.push("", "The vendor has not provided an FAQ.");
  }
  return parts.join("\n");
}

function toAnthropicMessages(
  history: StreamReplyMessage[]
): Anthropic.MessageParam[] {
  // Customer turns → user, vendor turns → assistant, so the model continues the
  // vendor's side. The API requires the first message to be a user turn, so drop
  // any leading vendor (assistant) messages.
  const mapped = history.map((m) => ({
    role: (m.role === "customer" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));
  while (mapped.length > 0 && mapped[0].role === "assistant") mapped.shift();
  // Anthropic requires a trailing user turn for generation; if the last message is
  // the vendor's own, append a nudge so the model drafts the next reply.
  if (mapped.length === 0 || mapped[mapped.length - 1].role === "assistant") {
    mapped.push({
      role: "user",
      content: "(Draft the vendor's next reply to continue this conversation.)",
    });
  }
  return mapped;
}

// ─── Conversation ownership ─────────────────────────────────────────────────────

// Stream channel-id prefixes (must match BOOKING_CHANNEL_PREFIX / INQUIRY_CHANNEL_PREFIX
// in streamChat.ts, where they are not exported).
const BOOKING_CHANNEL_ID_PREFIX = "booking_";
const INQUIRY_CHANNEL_ID_PREFIX = "inquiry_";

/** Resolve a booking and require it to belong to the calling vendor. Returns the booking id. */
async function assertBookingOwnedBy(account: VendorAccount, bookingId: string): Promise<string> {
  const booking = await getBookingChatContextById(bookingId);
  if (!booking) {
    throw new AiReplyError("ai_not_found", 404, "Booking not found");
  }
  if (!booking.vendorAccountId || booking.vendorAccountId !== account.id) {
    throw new AiReplyError("ai_forbidden", 403, "You do not have access to this conversation");
  }
  return booking.bookingId;
}

/**
 * Resolve the Stream channel for a draft request, enforcing that the underlying
 * conversation belongs to the calling vendor BEFORE any chat history is read.
 * A raw channelId is never trusted: booking channels are re-derived from the
 * ownership-checked booking id, and inquiry channels must appear in the caller's
 * own inquiry list. Anything unverifiable is rejected.
 */
async function resolveAuthorizedChannel(
  account: VendorAccount,
  params: { bookingId?: string; channelId?: string }
): Promise<{ channelId: string; verifiedBookingId: string | null }> {
  const bookingId = params.bookingId?.trim();
  const channelId = params.channelId?.trim();

  if (bookingId) {
    const verified = await assertBookingOwnedBy(account, bookingId);
    return { channelId: toStreamBookingChannelId(verified), verifiedBookingId: verified };
  }

  if (channelId) {
    if (channelId.startsWith(BOOKING_CHANNEL_ID_PREFIX)) {
      const candidate = channelId.slice(BOOKING_CHANNEL_ID_PREFIX.length);
      const verified = await assertBookingOwnedBy(account, candidate);
      return { channelId: toStreamBookingChannelId(verified), verifiedBookingId: verified };
    }
    if (channelId.startsWith(INQUIRY_CHANNEL_ID_PREFIX)) {
      const inquiries = await listVendorInquiryChannels(account.id);
      if (!inquiries.some((inquiry) => inquiry.inquiryChannelId === channelId)) {
        throw new AiReplyError("ai_forbidden", 403, "You do not have access to this conversation");
      }
      return { channelId, verifiedBookingId: null };
    }
    throw new AiReplyError("ai_forbidden", 403, "You do not have access to this conversation");
  }

  throw new AiReplyError("ai_bad_request", 400, "A bookingId or channelId is required");
}

// ─── Draft generation ───────────────────────────────────────────────────────────

export interface GenerateResult {
  replies: string[];
  used: number;
  remaining: number;
  isOverage: boolean;
}

export async function generateSuggestedReplies(params: {
  account: VendorAccount;
  bookingId?: string;
  channelId?: string;
}): Promise<GenerateResult> {
  const { account } = params;

  // Gate: Pro features (subscription OR commission model) + feature toggle +
  // monthly credit allowance.
  const entitlements = getVendorEntitlements(account);
  if (!entitlements.hasProFeatures) {
    throw new AiReplyError("ai_pro_required", 403, "AI replies are a Pro feature");
  }
  if (account.aiRepliesEnabled !== true) {
    throw new AiReplyError("ai_disabled", 403, "AI replies are turned off");
  }

  const credits = await getAiCreditState(account);
  // Overage billing requires a Stripe SUBSCRIPTION to attach the metered item to.
  // Commission vendors have none (every billing route 403s them), so
  // reportAiReplyOverage would push meter events at a customer with no metered
  // subscription item — usage recorded, never invoiced, cost uncapped. Hard-stop
  // them at the included allowance instead of metering into the void. Metering
  // commission vendors properly is separate, larger work.
  const overageEnabled = account.aiOverageEnabled === true && !isCommissionVendor(account);
  let isOverage = false;
  if (credits.remaining <= 0) {
    if (!overageEnabled) {
      throw new AiReplyError("ai_limit_reached", 429, "Monthly AI reply limit reached");
    }
    isOverage = true;
  }

  // Resolve the Stream channel and gather context. Ownership is enforced here,
  // before any chat history leaves Stream.
  const { channelId, verifiedBookingId } = await resolveAuthorizedChannel(account, params);

  const [history, faq] = await Promise.all([
    getRecentMessagesForChannel(channelId, HISTORY_MESSAGE_LIMIT),
    getActiveFaq(account.id),
  ]);

  const client = getClient();
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT },
    { type: "text", text: buildContextBlock(account.businessName, faq?.extractedText || "") },
  ];

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: AI_REPLY_MODEL,
      max_tokens: 1024,
      system: systemBlocks,
      messages: toAnthropicMessages(history),
      // Haiku 4.5 supports structured outputs but NOT the effort parameter — do
      // not pass output_config.effort here (it returns a 400).
      output_config: { format: { type: "json_schema", schema: REPLIES_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (err: any) {
    logger.error({ err: err?.message || String(err) }, "[ai-reply] generation failed");
    throw new AiReplyError("ai_generation_failed", 502, "Could not generate a reply");
  }

  const replies = parseReplies(response);
  // Hold drafts to the same off-platform policy as typed messages.
  const safeReplies = replies
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && !detectChatCircumvention(r).blocked)
    .slice(0, DRAFTS_RETURNED);

  if (safeReplies.length === 0) {
    throw new AiReplyError("ai_generation_failed", 502, "No usable reply was generated");
  }

  // Log usage (drives the credit meter + per-vendor cost visibility).
  const inputTokens = Number(response.usage?.input_tokens) || 0;
  const outputTokens = Number(response.usage?.output_tokens) || 0;
  await db.insert(aiReplyUsage).values({
    vendorAccountId: account.id,
    bookingId: verifiedBookingId,
    inputTokens,
    outputTokens,
    repliesReturned: safeReplies.length,
    isOverage,
  });

  // Bill overage to Stripe (best-effort — a metering hiccup must not fail the draft).
  if (isOverage) {
    try {
      await reportAiReplyOverage(account);
    } catch (err: any) {
      logger.error(
        { err: err?.message || String(err), vendorAccountId: account.id },
        "[ai-reply] overage metering failed"
      );
    }
  }

  return {
    replies: safeReplies,
    used: credits.used + 1,
    remaining: Math.max(0, credits.remaining - 1),
    isOverage,
  };
}

function parseReplies(response: Anthropic.Message): string[] {
  const text = (response.content || [])
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.replies)) {
      return parsed.replies.map((r: unknown) => String(r));
    }
  } catch {
    // Structured outputs should guarantee valid JSON; fall through on the rare miss.
  }
  return [];
}
