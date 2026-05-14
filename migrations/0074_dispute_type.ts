import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds dispute_type to booking_disputes.
 *
 * Dispute types:
 *   damage_claim          — vendor claims customer damaged rental items (existing behavior)
 *   travel_fee_cancellation — customer cancelled after vendor made travel commitments;
 *                             vendor uploads proof of travel spend for admin review
 *   not_as_advertised     — customer claims service/item didn't match the listing
 *
 * Existing rows are backfilled to 'damage_claim' (the only type that existed before).
 *
 * Safe to run against production:
 *   - Column added with a NOT NULL default so no rows break.
 *   - Idempotent: IF NOT EXISTS guard prevents double-apply errors.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE booking_disputes
      ADD COLUMN IF NOT EXISTS dispute_type text NOT NULL DEFAULT 'damage_claim';
  `);

  // Backfill is handled by the DEFAULT above — all existing rows get 'damage_claim'.
  console.log("[0074] Added dispute_type to booking_disputes.");
}
