import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds event_timezone to the bookings table.
 *
 * Stores the IANA timezone of the event location (e.g. "America/Chicago"),
 * derived at booking creation time from the event address lat/lng using geo-tz.
 *
 * Nullable — older bookings and edge cases (no address provided) will have NULL.
 * Consumers should fall back to vendor_timezone_snapshot when NULL.
 *
 * Safe to run against production:
 *   - ADD COLUMN with no NOT NULL constraint and no default is instant in PostgreSQL.
 *   - Existing rows get NULL, which is the correct sentinel for "unknown".
 */
export async function up() {
  await db.execute(sql`
    alter table bookings
    add column if not exists event_timezone text;
  `);

  console.log("[0060] bookings.event_timezone column added.");
}

export async function down() {
  await db.execute(sql`
    alter table bookings
    drop column if exists event_timezone;
  `);

  console.log("[0060] bookings.event_timezone column removed.");
}
