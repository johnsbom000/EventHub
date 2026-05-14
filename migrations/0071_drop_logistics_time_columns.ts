import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drop item_needed_by_time and item_done_by_time from bookings.
 *
 * These fields ("When do you need this setup by?" / "When can it be taken down?")
 * have been removed from checkout. bookingStartAt/bookingEndAt are now always
 * driven by eventStartTime/eventEndTime, which is what syncs to Google Calendar.
 */
export async function up() {
  await db.execute(sql`
    alter table bookings
      drop column if exists item_needed_by_time,
      drop column if exists item_done_by_time
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      add column if not exists item_needed_by_time text,
      add column if not exists item_done_by_time text
  `);
}
