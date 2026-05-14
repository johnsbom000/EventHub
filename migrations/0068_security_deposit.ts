import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds security deposit support to vendor_listings and bookings.
 *
 * vendor_listings:
 *   - security_deposit_enabled (boolean, default false) — vendor opt-in
 *   - security_deposit_cents  (integer, nullable)       — fixed amount in cents
 *
 * bookings:
 *   - security_deposit_cents        (integer, nullable) — snapshotted at booking time
 *   - security_deposit_refunded_at  (timestamptz, nullable) — set when deposit is refunded to customer
 *
 * Payout behaviour:
 *   The security deposit is collected as part of the customer's total charge but is
 *   never included in the vendor's payout amount. After the event dispute window
 *   passes with no active vendor claim, the deposit is refunded to the customer.
 *   If a vendor dispute is open, the deposit is held until admin resolves the case.
 *
 * Safe to run against production:
 *   - All new columns are nullable / have defaults — no existing rows break.
 *   - Idempotent: IF NOT EXISTS guards prevent double-apply errors.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ADD COLUMN IF NOT EXISTS security_deposit_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS security_deposit_cents    integer;
  `);

  await db.execute(sql`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS security_deposit_cents       integer,
      ADD COLUMN IF NOT EXISTS security_deposit_refunded_at timestamptz;
  `);

  console.log("[0068] Added security deposit columns to vendor_listings and bookings.");
}
