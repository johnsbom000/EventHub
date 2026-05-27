import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Replaces the single-column unique index on stripe_payment_intent_id with a
 * composite unique index on (stripe_payment_intent_id, payment_type).
 *
 * WHY: A booking with a security deposit creates two payment rows that share
 * the same PaymentIntent — one for the service charge (payment_type='booking')
 * and one for the deposit (payment_type='security_deposit'). The old index only
 * allowed one row per PI, so the security_deposit row was silently dropped by
 * onConflictDoNothing(), leaving the auto-refund job with nothing to act on.
 */
export async function up() {
  // Drop the old single-column unique constraint.
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_payments_stripe_payment_intent_unique
  `);

  // New composite unique: one row per (PI, payment_type) pair.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_pi_type_unique
      ON payments (stripe_payment_intent_id, payment_type)
      WHERE stripe_payment_intent_id IS NOT NULL
  `);

  console.log("[0096] replaced PI-only unique index with (PI, payment_type) composite unique index");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_payments_pi_type_unique`);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_unique
      ON payments (stripe_payment_intent_id)
      WHERE stripe_payment_intent_id IS NOT NULL
  `);
}
