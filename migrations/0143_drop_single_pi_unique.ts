import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Drops the single-column unique index on payments.stripe_payment_intent_id
//   (idx_payments_stripe_payment_intent_unique, created by migration 0120) if
//   it exists.
//
//   The payment model intentionally stores MULTIPLE rows per PaymentIntent —
//   one per payment_type ('booking' + 'security_deposit' share a PI). The
//   correct uniqueness is the composite partial index
//   idx_payments_pi_type_unique on (stripe_payment_intent_id, payment_type).
//   On a database where the single-column unique survives, every security
//   deposit row insert is silently swallowed by onConflictDoNothing().
//
//   Healthy databases (dev verified 2026-07-07, prod expected) no longer have
//   the single-column index, so this is a no-op backstop there. The real
//   landmine was fresh databases: 0120 recreated the index on every new
//   environment. That recreate block is removed from 0120 in the same branch;
//   this migration cleans up any database that already built it.
//
// Idempotent: DROP INDEX IF EXISTS.

export async function up() {
  await db.execute(sql`
    drop index if exists idx_payments_stripe_payment_intent_unique;
  `);

  console.log(
    "[0143] Dropped idx_payments_stripe_payment_intent_unique (if it existed). " +
      "Uniqueness is enforced by the composite idx_payments_pi_type_unique."
  );
}

export async function down() {
  // Intentionally NOT recreating the single-column unique index: on any
  // database with a security-deposit payment row it would fail to build, and
  // recreating it would reintroduce the swallowed-insert bug this migration
  // removes. Down is a no-op.
  console.log("[0143] down: no-op (single-column PI unique index stays dropped).");
}
