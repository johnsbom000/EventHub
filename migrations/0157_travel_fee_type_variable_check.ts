import { sql } from "drizzle-orm";

import { db } from "../server/db";

/**
 * Repair the travel_fee_type CHECK constraint for the 0156 fee model.
 *
 * 0146 added chk_vendor_listings_travel_fee_type allowing ('flat','per_mile',
 * 'per_hour'), but 0156 made ('flat','variable') the canonical fee types — so on
 * any environment that ran both, every write of 'variable' (the app's only
 * non-flat type) failed with 23514. 0156 now drops the stale CHECK up front for
 * environments that have not run it yet; this migration fixes the ones that have:
 *
 *   1. drop the stale CHECK (no-op where the edited 0156 already dropped it);
 *   2. re-run 0156's per_mile/per_hour → 'variable' normalization (no-op where
 *      0156 completed);
 *   3. backfill travel_offered for legacy free-delivery listings
 *      (delivery_offered = true with no fee), which 0156's fee-gated backfill
 *      skipped — without this, radius/serve-outside enforcement is silently
 *      disabled for those listings;
 *   4. re-add the CHECK widened to ('flat','variable'), NOT VALID per the 0146
 *      pattern so pre-existing junk values cannot abort the deploy.
 *
 * Idempotent: DROP IF EXISTS + guarded UPDATEs + re-ADD converge on the same
 * state on re-run.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_listings
      DROP CONSTRAINT IF EXISTS chk_vendor_listings_travel_fee_type
  `);

  await db.execute(sql`
    UPDATE vendor_listings
      SET travel_fee_type = 'variable'
      WHERE travel_fee_type IN ('per_mile', 'per_hour')
  `);

  // Free delivery is still "vendor goes to the customer": these rows must have
  // travel_offered = true or the post-0156 radius logic never evaluates them.
  // Runs after 0156's serves_outside_radius backfill (step 2), so it cannot
  // pollute that signal.
  await db.execute(sql`
    UPDATE vendor_listings
      SET travel_offered = true
      WHERE delivery_offered = true AND travel_offered = false
  `);

  await db.execute(sql`
    ALTER TABLE vendor_listings
      ADD CONSTRAINT chk_vendor_listings_travel_fee_type
      CHECK (travel_fee_type IS NULL OR travel_fee_type IN ('flat','variable'))
      NOT VALID
  `);

  console.log(
    "[0157] travel_fee_type CHECK widened to ('flat','variable'); normalized legacy types; backfilled travel_offered for free-delivery listings.",
  );
}

export async function down() {
  // Restore 0146's original constraint. NOT VALID, so rows already holding
  // 'variable' do not abort the down-migration (they only fail on future writes,
  // which is the pre-0157 behavior this down intentionally returns to).
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_listings
      DROP CONSTRAINT IF EXISTS chk_vendor_listings_travel_fee_type
  `);
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ADD CONSTRAINT chk_vendor_listings_travel_fee_type
      CHECK (travel_fee_type IS NULL OR travel_fee_type IN ('flat','per_mile','per_hour'))
      NOT VALID
  `);
  console.log("[0157] down: restored the 0146 travel_fee_type CHECK.");
}
