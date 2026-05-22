import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds per-actor dismissal timestamps to bookings so that vendors and customers
 * can independently hide expired or failed bookings from their dashboards without
 * permanently deleting any data.
 *
 * - vendor_dismissed_at  — set when a vendor dismisses an expired/failed booking
 * - customer_dismissed_at — set when a customer dismisses an expired/failed booking
 *
 * Both columns are nullable; null means the booking has not been dismissed by
 * that actor and should still appear in their list.
 */
export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists vendor_dismissed_at   timestamptz,
      add column if not exists customer_dismissed_at timestamptz;
  `);

  console.log("[0084] Added vendor_dismissed_at and customer_dismissed_at to bookings.");
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists vendor_dismissed_at,
      drop column if exists customer_dismissed_at;
  `);

  console.log("[0084] down(): removed vendor_dismissed_at and customer_dismissed_at from bookings.");
}
