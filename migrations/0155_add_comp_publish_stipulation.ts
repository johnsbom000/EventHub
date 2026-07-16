import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Launch-comp publish stipulation: vendors who claimed a launch-campaign comp
 * slot must publish their first listing within 7 days of account creation
 * (+3 grace days once Stripe Connect onboarding has been started) or the comp
 * is revoked and the slot returns to the campaign pool.
 *
 * New vendor_accounts columns:
 *  - comp_source: which flow granted the current comp ('launch_2026' for the
 *    campaign, 'manual' for admin grants). The enforcement job ONLY targets
 *    'launch_2026' — manual comps are never revoked by it.
 *  - first_listing_published_at: stamped the first time the vendor publishes a
 *    listing (activation). Persists even if the listing is later unpublished,
 *    so a vendor who met the stipulation once can never be revoked.
 *  - comp_publish_nudge_sent_at: day-5 "publish or lose your spot" email sent
 *    (once per grant).
 *  - comp_revoked_at: when the enforcement job revoked the comp (audit trail +
 *    guard against double-processing).
 *
 * Backfills (this ships after the campaign went live):
 *  - comp_source='launch_2026' for existing comp grants whose comp_ends_at sits
 *    ~180 days after account creation — the campaign's exact signature (granted
 *    at provision time). Manual grants (365-day default, or to older accounts)
 *    don't match the window.
 *  - first_listing_published_at for vendors who already have an active listing,
 *    approximated by that listing's created_at.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS; backfills only fill NULLs.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS comp_source text,
      ADD COLUMN IF NOT EXISTS first_listing_published_at timestamptz,
      ADD COLUMN IF NOT EXISTS comp_publish_nudge_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS comp_revoked_at timestamptz
  `);

  const compSourceBackfill = await db.execute(sql`
    UPDATE vendor_accounts
    SET comp_source = 'launch_2026'
    WHERE comp_source IS NULL
      AND subscription_status = 'comp'
      AND comp_ends_at IS NOT NULL
      AND comp_ends_at BETWEEN created_at + interval '179 days'
                           AND created_at + interval '181 days'
  `);

  const publishBackfill = await db.execute(sql`
    UPDATE vendor_accounts va
    SET first_listing_published_at = sub.first_active
    FROM (
      SELECT account_id, MIN(created_at) AS first_active
      FROM vendor_listings
      WHERE status = 'active'
      GROUP BY account_id
    ) sub
    WHERE sub.account_id = va.id
      AND va.first_listing_published_at IS NULL
  `);

  console.log(
    `[0155] comp publish stipulation columns added; backfilled comp_source for ` +
      `${(compSourceBackfill as any)?.rowCount ?? "?"} campaign grant(s), ` +
      `first_listing_published_at for ${(publishBackfill as any)?.rowCount ?? "?"} vendor(s).`
  );
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS comp_source,
      DROP COLUMN IF EXISTS first_listing_published_at,
      DROP COLUMN IF EXISTS comp_publish_nudge_sent_at,
      DROP COLUMN IF EXISTS comp_revoked_at
  `);

  console.log("[0155] down: comp publish stipulation columns dropped.");
}
