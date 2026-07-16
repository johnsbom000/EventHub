import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db";
import { vendorAccounts, vendorListings } from "@shared/schema";
import { sendCompPublishNudgeEmail, sendCompRevokedEmail } from "../email";
import {
  LAUNCH_CAMPAIGN_KEY,
  getCompPublishDeadline,
  releaseCampaignSlot,
} from "../services/compCampaignService";

const DAY_MS = 24 * 60 * 60 * 1000;

// Day-5 nudge for a 7-day deadline: enough runway to act, late enough to matter.
const NUDGE_AFTER_DAYS = 5;

type JobLogger = { log: (msg: string) => void; warn: (msg: string) => void };

export type CompPublishEnforcementJobResult = {
  nudgesSent: number;
  revoked: number;
  selfHealed: number;
};

/**
 * Daily job enforcing the launch-comp publish stipulation: vendors who claimed
 * a launch-campaign slot must publish their first listing within 7 days of
 * account creation (+3 grace days once Stripe Connect onboarding was started —
 * see getCompPublishDeadline, the same rule the dashboard banner displays).
 *
 *  - Day 5+: one "publish or lose your spot" nudge email per grant.
 *  - Past deadline: comp revoked (back to Free), the slot returned to the
 *    campaign pool, and a notice email sent.
 *
 * Only targets comp_source='launch_2026' — manual/admin comps are never touched.
 * A vendor is only ever revoked if they have NO active listing AND no
 * first_listing_published_at stamp: if an active listing exists without the
 * stamp (a publish path the stamp missed), the job stamps it and moves on
 * instead of revoking.
 */
export async function runCompPublishEnforcementJob(opts: {
  serverUrl: string;
  logger?: JobLogger;
}): Promise<CompPublishEnforcementJobResult> {
  const { serverUrl, logger } = opts;
  const now = new Date();
  const nudgeCutoff = new Date(now.getTime() - NUDGE_AFTER_DAYS * DAY_MS);

  const candidates = await db
    .select({
      id: vendorAccounts.id,
      email: vendorAccounts.email,
      businessName: vendorAccounts.businessName,
      createdAt: vendorAccounts.createdAt,
      stripeConnectId: vendorAccounts.stripeConnectId,
      compPublishNudgeSentAt: vendorAccounts.compPublishNudgeSentAt,
    })
    .from(vendorAccounts)
    .where(
      and(
        eq(vendorAccounts.subscriptionStatus, "comp"),
        eq(vendorAccounts.compSource, LAUNCH_CAMPAIGN_KEY),
        isNull(vendorAccounts.compRevokedAt),
        isNull(vendorAccounts.firstListingPublishedAt),
        isNull(vendorAccounts.deletedAt),
        lte(vendorAccounts.createdAt, nudgeCutoff)
      )
    );

  let nudgesSent = 0;
  let revoked = 0;
  let selfHealed = 0;

  for (const vendor of candidates) {
    try {
      // Self-heal: an active listing without the first-publish stamp means some
      // publish path missed stamping. Stamp it now — never revoke this vendor.
      const [activeListing] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(and(eq(vendorListings.accountId, vendor.id), eq(vendorListings.status, "active")))
        .limit(1);
      if (activeListing) {
        await db
          .update(vendorAccounts)
          .set({ firstListingPublishedAt: now })
          .where(and(eq(vendorAccounts.id, vendor.id), isNull(vendorAccounts.firstListingPublishedAt)));
        selfHealed++;
        continue;
      }

      const { deadline, graceApplied } = getCompPublishDeadline(vendor);

      if (now >= deadline) {
        // Revoke — guarded so a publish or plan change that landed after the
        // candidate query makes this a no-op.
        const [updated] = await db
          .update(vendorAccounts)
          .set({
            subscriptionPlan: "free",
            subscriptionStatus: "none",
            compEndsAt: null,
            compRevokedAt: now,
            subscriptionUpdatedAt: now,
          })
          .where(
            and(
              eq(vendorAccounts.id, vendor.id),
              eq(vendorAccounts.subscriptionStatus, "comp"),
              isNull(vendorAccounts.firstListingPublishedAt)
            )
          )
          .returning({ id: vendorAccounts.id });
        if (!updated) continue;

        revoked++;
        logger?.log(
          `[comp-publish-enforcement] revoked launch comp for vendor ${vendor.id} (no listing published by ${deadline.toISOString()})`
        );

        // Return the slot to the pool so the next signup can claim it. Failure
        // here must not undo the revoke — log and move on.
        await releaseCampaignSlot().catch((err: any) =>
          logger?.warn(
            `[comp-publish-enforcement] slot release failed after revoking ${vendor.id}: ${err?.message || err}`
          )
        );

        if (vendor.email) {
          await sendCompRevokedEmail(vendor.email, {
            recipientName: vendor.businessName || "there",
            businessName: vendor.businessName || "your business",
            serverUrl,
          }).catch((err: any) =>
            logger?.warn(
              `[comp-publish-enforcement] revoked email failed for ${vendor.email}: ${err?.message || err}`
            )
          );
        }
        continue;
      }

      // Inside the window at day 5+: one nudge per grant. A thrown send leaves
      // the stamp unset so the next daily tick retries.
      if (!vendor.compPublishNudgeSentAt && vendor.email) {
        const daysLeft = Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS));
        await sendCompPublishNudgeEmail(vendor.email, {
          recipientName: vendor.businessName || "there",
          businessName: vendor.businessName || "your business",
          daysLeft,
          deadline,
          graceApplied,
          serverUrl,
        });
        await db
          .update(vendorAccounts)
          .set({ compPublishNudgeSentAt: now })
          .where(eq(vendorAccounts.id, vendor.id));
        nudgesSent++;
      }
    } catch (err: any) {
      logger?.warn(
        `[comp-publish-enforcement] failed for vendor ${vendor.id}: ${err?.message || err}`
      );
    }
  }

  if (nudgesSent || revoked || selfHealed) {
    logger?.log(
      `[comp-publish-enforcement] nudged ${nudgesSent}, revoked ${revoked}, self-healed ${selfHealed}`
    );
  }
  return { nudgesSent, revoked, selfHealed };
}
