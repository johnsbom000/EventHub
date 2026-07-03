import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add payments.vendor_absorbs_stripe_fees — a per-payment snapshot of whether
 * the vendor bears Stripe's payment-processing fee on this booking.
 *
 * We are switching the platform so vendors absorb Stripe's processing fee
 * (customer pays the clean list price; the fee is deducted from the vendor's
 * payout). The framing is "Stripe charges to use Stripe — EventHub still takes
 * no cut." See VENDOR_ABSORBS_STRIPE_FEES in server/lib/constants.ts.
 *
 * The payout amount is recomputed fresh at payout time, so a *global* constant
 * flip would retroactively deduct from bookings already made under the old
 * "keep 100%" promise. To scope this to NEW bookings only, the policy decision
 * is captured on each payment row at creation time and read from the row at
 * every payout computation — never from the live global constant.
 *
 * Existing rows default to false (they keep 100%, exactly as booked). New rows
 * inherit the constant's value at insert time.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS payments
      ADD COLUMN IF NOT EXISTS vendor_absorbs_stripe_fees boolean NOT NULL DEFAULT false
  `);

  console.log("[0141] payments.vendor_absorbs_stripe_fees added (default false; new bookings set at creation).");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS payments
      DROP COLUMN IF EXISTS vendor_absorbs_stripe_fees
  `);

  console.log("[0141] down: payments.vendor_absorbs_stripe_fees dropped.");
}
