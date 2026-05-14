import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Convert booking_start_at and booking_end_at from
 * `timestamp without time zone` to `timestamp with time zone` (timestamptz).
 *
 * Root cause of wrong Google Calendar times: node-postgres interprets
 * `timestamp without time zone` values using the server's local timezone
 * (America/Denver / MDT = UTC-6), applying a double-offset when the stored
 * values are already correct UTC. `timestamptz` stores the timezone offset
 * and is read back as UTC, eliminating the double-shift.
 *
 * Values are cast via `AT TIME ZONE 'UTC'` to preserve the stored instant
 * (treat the existing raw bytes as UTC before converting the column type).
 */
export async function up() {
  await db.execute(sql`
    alter table bookings
      alter column booking_start_at type timestamp with time zone
        using booking_start_at at time zone 'UTC',
      alter column booking_end_at type timestamp with time zone
        using booking_end_at at time zone 'UTC'
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      alter column booking_start_at type timestamp without time zone
        using booking_start_at at time zone 'UTC',
      alter column booking_end_at type timestamp without time zone
        using booking_end_at at time zone 'UTC'
  `);
}
