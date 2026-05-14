import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds stripe_customer_id to the users table.
 *
 * This is required for the two-PaymentIntent checkout flow where the security
 * deposit is charged silently against the same payment method used for the
 * booking total — without asking the customer to enter card details twice.
 *
 * Stripe Customer objects are created on-demand at checkout for any user who
 * doesn't yet have one, and the ID is persisted here.
 *
 * Safe to run against production:
 *   - Nullable column — no existing rows break.
 *   - Idempotent: IF NOT EXISTS guard prevents double-apply errors.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS stripe_customer_id text;
  `);

  console.log("[0073] Added stripe_customer_id to users.");
}
