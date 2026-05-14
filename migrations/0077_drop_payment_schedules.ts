import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drops the payment_schedules table and the foreign-key columns that pointed
 * to it from travel_fee_proposals and payments.
 *
 * The new checkout flow creates a Stripe PaymentIntent directly from
 * POST /api/bookings/:bookingId/initialize-payment — no intermediate schedule
 * row is needed. Booking payment status is now tracked via the `payments`
 * table directly (excluding security_deposit rows).
 *
 * Safe to run against production:
 *   - DROP COLUMN IF EXISTS / DROP TABLE IF EXISTS are no-ops when already absent.
 *   - Cascading FK is removed before the table is dropped.
 */
export async function up() {
  // 1. Remove FK column from travel_fee_proposals
  await db.execute(sql`
    ALTER TABLE travel_fee_proposals
      DROP COLUMN IF EXISTS payment_schedule_id;
  `);

  // 2. Remove FK column from payments
  await db.execute(sql`
    ALTER TABLE payments
      DROP COLUMN IF EXISTS schedule_id;
  `);

  // 3. Drop the now-unused payment_schedules table
  await db.execute(sql`
    DROP TABLE IF EXISTS payment_schedules;
  `);

  console.log("[0077] Dropped payment_schedules table and removed schedule_id / payment_schedule_id FK columns.");
}
