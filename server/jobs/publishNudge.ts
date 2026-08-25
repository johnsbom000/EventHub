import { db } from "../db";
import { vendorAccounts, vendorListings } from "@shared/schema";
import { eq, and, isNull, lte, sql } from "drizzle-orm";
import { sendPublishNudgeEmail } from "../email";

export interface JobLogger {
  log: (msg: string, ...args: any[]) => void;
  warn: (msg: string, ...args: any[]) => void;
}

export interface PublishNudgeJobResult {
  candidates: number;
  sent: number;
  failed: number;
  skippedNoSlug: number;
}

/**
 * How long a vendor gets to publish on their own before we nudge.
 *
 * Long enough that someone who signs up intending to finish the same evening is
 * not interrupted, short enough that we reach them while EventHub is still a
 * thing they remember doing.
 */
const NUDGE_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Emails vendors who signed up but never published an active listing.
 *
 * Eligibility is deliberately narrow:
 *   - zero listings in 'active' status. This is the state the email actually
 *     describes ("your storefront is empty"), and it is stricter than
 *     first_listing_published_at, which is never cleared once set and so stays
 *     stamped for a vendor who later unpublished everything.
 *   - signed up at least NUDGE_AFTER_DAYS ago.
 *   - publish_nudge_sent_at IS NULL. Migration 0167 backfilled every vendor that
 *     existed at deploy time, so this job only ever contacts newer signups and
 *     cannot duplicate the manual send that went out on 2026-08-25.
 *   - not soft-deleted, and has a shop slug (the email's central link is the
 *     vendor's storefront; without a slug that link would be broken).
 *
 * The stamp is written per-vendor immediately after a successful send, never
 * batched, so a crash mid-run cannot cause a second email on the next tick. A
 * send that fails is left unstamped on purpose: the next run retries exactly
 * those and nothing else.
 */
export async function runPublishNudgeJob(opts: {
  serverUrl: string;
  logger?: JobLogger;
}): Promise<PublishNudgeJobResult> {
  const { serverUrl, logger } = opts;
  const cutoff = new Date(Date.now() - NUDGE_AFTER_DAYS * DAY_MS);

  const candidates = await db
    .select({
      id: vendorAccounts.id,
      email: vendorAccounts.email,
      businessName: vendorAccounts.businessName,
      shopSlug: vendorAccounts.shopSlug,
      activeListings: sql<number>`count(${vendorListings.id})`.mapWith(Number),
    })
    .from(vendorAccounts)
    .leftJoin(
      vendorListings,
      and(eq(vendorListings.accountId, vendorAccounts.id), eq(vendorListings.status, "active")),
    )
    .where(
      and(
        isNull(vendorAccounts.publishNudgeSentAt),
        isNull(vendorAccounts.deletedAt),
        lte(vendorAccounts.createdAt, cutoff),
      ),
    )
    .groupBy(
      vendorAccounts.id,
      vendorAccounts.email,
      vendorAccounts.businessName,
      vendorAccounts.shopSlug,
    )
    // A vendor who already published needs no nudge. Filtering in HAVING keeps
    // this to one query rather than fetching every account and counting in JS.
    .having(sql`count(${vendorListings.id}) = 0`);

  let sent = 0;
  let failed = 0;
  let skippedNoSlug = 0;

  for (const vendor of candidates) {
    if (!vendor.shopSlug?.trim()) {
      // Left UNSTAMPED deliberately: this is a data problem, not a decision not
      // to contact them. Once the slug exists they become eligible again.
      skippedNoSlug++;
      logger?.warn(`[publish-nudge] ${vendor.email} has no shop slug; skipping`);
      continue;
    }
    if (!vendor.email?.trim()) {
      failed++;
      continue;
    }

    try {
      const result = await sendPublishNudgeEmail(vendor.email, {
        businessName: vendor.businessName,
        shopSlug: vendor.shopSlug,
        serverUrl,
      });

      // `skipped` means Resend was not configured and NOTHING went out. Stamping
      // on that would permanently suppress the nudge for this vendor on the
      // strength of an email that was never delivered.
      if (!result.sent) {
        failed++;
        logger?.warn(
          `[publish-nudge] send to ${vendor.email} did not go out: ${result.reason ?? "unknown"}`,
        );
        continue;
      }

      await db
        .update(vendorAccounts)
        .set({ publishNudgeSentAt: new Date() })
        .where(eq(vendorAccounts.id, vendor.id));
      sent++;
    } catch (err: any) {
      failed++;
      logger?.warn(`[publish-nudge] send to ${vendor.email} threw: ${err?.message || err}`);
    }
  }

  if (candidates.length) {
    logger?.log(
      `[publish-nudge] ${candidates.length} candidate(s): ${sent} sent, ${failed} failed, ${skippedNoSlug} without a slug`,
    );
  }

  return { candidates: candidates.length, sent, failed, skippedNoSlug };
}
