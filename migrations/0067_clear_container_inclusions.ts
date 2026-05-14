import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Clears whats_included and whats_not_included on all package_container rows.
 *
 * Why: package_container listings show pricing/inclusions through their
 * package_item child rows. The container-level inclusion fields are
 * meaningless — customers never see them. Child rows carry their own
 * whats_included / whats_not_included per package tier.
 *
 * The columns are NOT dropped — they are still used by single, addon,
 * and package_item rows. Only the container rows are cleared.
 *
 * A server-side guard in PATCH /api/vendor/listings/:id prevents
 * autosaves from repopulating these fields on container rows going forward.
 *
 * Safe to run against production:
 *   - UPDATE with a WHERE on an indexed column (idx_vendor_listings_type).
 *   - Idempotent: running twice has no effect.
 *   - No schema changes, no column drops, no FK changes.
 *
 * Manual rollback: no automated down() — cleared array data cannot be
 * recovered without a DB snapshot, and this data has no product value.
 */
export async function up() {
  await db.execute(sql`
    update vendor_listings
    set
      whats_included     = '{}',
      whats_not_included = '{}'
    where listing_type = 'package_container';
  `);

  console.log("[0067] Cleared whats_included / whats_not_included on all package_container rows.");
}
