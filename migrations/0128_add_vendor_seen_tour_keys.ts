import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add vendor_accounts.seen_tour_keys — the set of per-page dashboard tours a
 * vendor has already seen. Previously tracked only in browser localStorage,
 * which is per-device and cleared on logout, so tours replayed on new
 * devices/browsers or when the page was closed before dismissal. Moving the
 * source of truth to the server makes each tour show once per vendor account.
 *
 * Stored as a text[] of tour keys (e.g. {dashboard,bookings,payments}).
 * Defaults to empty array for everyone.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS seen_tour_keys text[] NOT NULL DEFAULT '{}'
  `);

  console.log("[0128] vendor_accounts.seen_tour_keys added (default '{}').");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS seen_tour_keys
  `);

  console.log("[0128] down: vendor_accounts.seen_tour_keys dropped.");
}
