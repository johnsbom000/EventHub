import { db } from "../db";
import { and, eq, sql } from "drizzle-orm";
import { compCampaigns, vendorAccounts } from "@shared/schema";
import { logger } from "../lib/logger";

// The launch offer: first N signups get comp Pro (see migration 0153). Kept as a
// constant so the provision handler and any admin tooling target the same row.
export const LAUNCH_CAMPAIGN_KEY = "launch_2026";

// Publish-stipulation policy (deadline + Stripe grace) lives in a pure module
// so it can be unit-tested without a DB; re-exported here for consumers.
export {
  PUBLISH_DEADLINE_DAYS,
  STRIPE_GRACE_DAYS,
  getCompPublishDeadline,
} from "../lib/compPublishPolicy";

/**
 * Return a claimed slot to the campaign pool (used when a comp is revoked for
 * missing the publish stipulation). Guarded so the counter never goes negative.
 */
export async function releaseCampaignSlot(): Promise<void> {
  await db
    .update(compCampaigns)
    .set({ slotsClaimed: sql`${compCampaigns.slotsClaimed} - 1` })
    .where(
      and(eq(compCampaigns.key, LAUNCH_CAMPAIGN_KEY), sql`${compCampaigns.slotsClaimed} > 0`)
    );
}

/**
 * Atomically claim a slot in the active launch campaign and, if one was
 * available, grant the vendor complimentary ("comp") Pro for the campaign's
 * duration.
 *
 * The claim is a single conditional UPDATE
 * (`SET slots_claimed = slots_claimed + 1 WHERE slots_claimed < slots_total`),
 * which Postgres row-locks — so exactly `slots_total` vendors are ever comped,
 * with no overshoot under concurrent signups.
 *
 * Never throws to the caller: on any error it returns `{ comped: false }` so
 * vendor provisioning is never blocked by the campaign. If the grant write fails
 * after a slot was claimed, the slot is released so it isn't silently lost.
 */
export async function tryGrantCampaignComp(
  vendorAccountId: string,
  now: Date = new Date()
): Promise<{ comped: boolean; compDays?: number }> {
  let claimedDays: number | null = null;
  try {
    const [claimed] = await db
      .update(compCampaigns)
      .set({ slotsClaimed: sql`${compCampaigns.slotsClaimed} + 1` })
      .where(
        and(
          eq(compCampaigns.key, LAUNCH_CAMPAIGN_KEY),
          eq(compCampaigns.active, true),
          sql`${compCampaigns.slotsClaimed} < ${compCampaigns.slotsTotal}`
        )
      )
      .returning({ compDays: compCampaigns.compDays });

    if (!claimed) return { comped: false };
    claimedDays = claimed.compDays;

    const compEndsAt = new Date(now.getTime() + claimedDays * 24 * 60 * 60 * 1000);
    await db
      .update(vendorAccounts)
      .set({
        subscriptionPlan: "pro",
        subscriptionStatus: "comp",
        compEndsAt,
        subscriptionUpdatedAt: now,
        // Campaign grants carry the publish stipulation; 'manual' grants don't.
        compSource: LAUNCH_CAMPAIGN_KEY,
        // Fresh grant → fresh reminders (so the 7d/1d emails fire for this grant).
        compReminder7dSentAt: null,
        compReminder1dSentAt: null,
        // Fresh grant → fresh publish-stipulation state.
        compPublishNudgeSentAt: null,
        compRevokedAt: null,
      })
      .where(eq(vendorAccounts.id, vendorAccountId));

    logger.info(
      `[comp-campaign] Granted ${claimedDays}-day comp Pro to vendor ${vendorAccountId} (${LAUNCH_CAMPAIGN_KEY}).`
    );
    return { comped: true, compDays: claimedDays };
  } catch (err: any) {
    // Release the claimed slot so a failed grant doesn't permanently consume it.
    if (claimedDays !== null) {
      await releaseCampaignSlot().catch(() => {});
    }
    logger.warn(`[comp-campaign] Failed to grant comp to vendor ${vendorAccountId}:`, err?.message || err);
    return { comped: false };
  }
}
