import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drops the bookings.add_on_ids text array column.
 *
 * The column stored add-on listing IDs as a denormalized array with no FK safety.
 * The booking_items join table (added in 0065) is the canonical, normalized source
 * of truth for all add-on line items. The add_on_ids column was written at booking
 * creation but never read back from the DB for any business logic.
 *
 * The booking creation route was updated to stop writing to this column before
 * this migration was added.
 */
export async function up() {
  await db.execute(sql`ALTER TABLE bookings DROP COLUMN IF EXISTS add_on_ids`);
  console.log("[0113] dropped bookings.add_on_ids");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE bookings ADD COLUMN add_on_ids text[] NOT NULL DEFAULT '{}'
  `);
}
