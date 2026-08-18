import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Grandfathering for pre-existing vendors.
 *
 * Every vendor who signed up before the 8% vendor commission went live was told
 * EventHub is free to use. Flipping VENDOR_FEE_RATE from 0 to 0.08 would have
 * silently started charging them, so `fee_exempt` permanently waives the VENDOR
 * commission for that cohort. resolveFeeRates() checks it FIRST — see
 * server/services/feeRatesService.ts.
 *
 * Scope, decided deliberately:
 *   - It waives the VENDOR fee only. The 5% CUSTOMER service fee still applies
 *     to their bookings, because that is charged to the customer, not the vendor.
 *   - It waives FEES, not feature gates. An exempt free-tier vendor keeps the
 *     free-tier listing cap they have today; anyone already comp'd to Pro keeps
 *     Pro. The point is that nothing changes for them, not that they are upgraded.
 *
 * THE BACKFILL IS THE POINT, and it is why this is written as add-with-default-
 * true-then-flip-default rather than an explicit UPDATE:
 *
 *   1. ADD COLUMN ... DEFAULT true  → Postgres materializes `true` on every row
 *      that exists right now, atomically, in one statement.
 *   2. ALTER COLUMN ... SET DEFAULT false → every row inserted AFTER this point
 *      (i.e. every new signup, including the whole commission-arm cohort) gets
 *      false and pays standard rates.
 *
 * A plain `UPDATE vendor_accounts SET fee_exempt = true` would NOT be idempotent:
 * a re-run after launch would retroactively grandfather every new signup and
 * silently zero out the experiment's entire vendor-side revenue. This form is
 * safe to re-run — ADD COLUMN IF NOT EXISTS is skipped and SET DEFAULT is a no-op.
 *
 * The cutover is therefore "whoever exists when this migration runs", which is
 * deploy time. That is the intended definition.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS fee_exempt boolean NOT NULL DEFAULT true
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ALTER COLUMN fee_exempt SET DEFAULT false
  `);
  console.log("[0164] vendor_accounts.fee_exempt added; existing vendors grandfathered, new signups default false.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS fee_exempt
  `);
  console.log("[0164] down: fee_exempt dropped.");
}
