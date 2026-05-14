import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds withheld_amount_cents to dispute_cases.
 *
 * When an admin resolves a damage-claim dispute with a partial refund,
 * this column records how many cents of the security deposit were withheld
 * (i.e. not returned to the customer). The remainder is refunded via Stripe.
 *
 * A NULL value means the case was resolved without a partial withhold
 * (either full refund, full payout, or auto-refunded by the 48h job).
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE dispute_cases
      ADD COLUMN IF NOT EXISTS withheld_amount_cents integer;
  `);

  console.log("[0079] Added withheld_amount_cents to dispute_cases.");
}
