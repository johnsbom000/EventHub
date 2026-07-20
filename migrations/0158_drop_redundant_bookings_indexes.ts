import { sql } from "drizzle-orm";

import { db } from "../server/db";

/**
 * Drop three redundant/unused indexes on `bookings`.
 *
 * `bookings` carried 22 indexes; every booking write (create, confirm, cancel,
 * payment-status, payout) maintains all of them. Prod `pg_stat_user_indexes`
 * showed the three below at 0 scans, and each is either strictly covered by
 * another index or references a column no query filters on:
 *
 *   1. idx_bookings_listing_window_active
 *      (listing_id, booking_start_at, booking_end_at) WHERE listing_id IS NOT
 *      NULL AND status <> 'cancelled'. Strict subset of
 *      idx_bookings_listing_window_active_quantity (same leading columns +
 *      booked_quantity, WHERE status <> 'cancelled'), which backs the
 *      double-booking recount. Any query this served is served by that one.
 *
 *   2. idx_bookings_vendor_profile_id
 *      (vendor_profile_id). Strict left-prefix of
 *      idx_bookings_vendor_profile_created (vendor_profile_id, created_at DESC,
 *      35 prod scans) — equality lookups on vendor_profile_id use the composite.
 *
 *   3. idx_bookings_vendor_timezone_snapshot
 *      (vendor_timezone_snapshot). No code path filters on this column; a btree
 *      over a timezone label serves no query.
 *
 * Deliberately NOT touched (they back the double-booking conflict path per the
 * CLAUDE.md guardrail): idx_bookings_listing_time_window and
 * idx_bookings_listing_window_active_quantity. Three other 0-scan indexes
 * (idx_bookings_vendor_account_window, idx_bookings_booking_start_at,
 * idx_bookings_google_sync_status) are left in place pending a query-path
 * review — they are not superset-covered, so a seq-scan regression is possible.
 *
 * None of these three are declared in shared/schema.ts (they were created in
 * migrations 0005/0015), so no schema.ts change accompanies this drop.
 *
 * Idempotent: DROP INDEX IF EXISTS converges on the same state on re-run.
 * Manual rollback would recreate the indexes from their 0005/0015 definitions.
 */
export async function up() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_bookings_listing_window_active`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_bookings_vendor_profile_id`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_bookings_vendor_timezone_snapshot`);

  console.log(
    "[0158] Dropped redundant bookings indexes: idx_bookings_listing_window_active, idx_bookings_vendor_profile_id, idx_bookings_vendor_timezone_snapshot.",
  );
}
