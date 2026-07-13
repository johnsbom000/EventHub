import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add payments.success_effects_sent — the exactly-once guard for the one-time
 * side effects a booking payment fires on success (vendor "payment received"
 * notification, customer receipt email, vendor "booking confirmed" email, eager
 * Stream Chat channel).
 *
 * F10: those side effects were gated purely on the in-process
 * `alreadyProcessed` transition. If the process died after the DB commit but
 * before the fire-and-forget sends finished, the receipt/notification/chat were
 * lost with no recovery path. This column lets a background sweep
 * (payment_effects_sweep) find succeeded booking payments whose effects never
 * settled and re-fire them. `firePaymentSucceededSideEffects` sets the flag true
 * only AFTER the sends settle (at-least-once: a crash mid-send may re-fire one
 * duplicate receipt, preferred over silent loss).
 *
 * BACKFILL (must run in this same migration, before the sweep worker ships):
 * every already-succeeded payment predates the sweep and already had its effects
 * fired (or is old enough not to matter), so mark them sent. Without this, the
 * first sweep tick would re-send receipts for every historical succeeded
 * payment. The sweep additionally bounds itself to paid_at within 7 days, but
 * the backfill is the authoritative guard.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS; the backfill only flips still-false
 * rows so a re-run is a no-op.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS payments
      ADD COLUMN IF NOT EXISTS success_effects_sent boolean NOT NULL DEFAULT false
  `);

  const result: any = await db.execute(sql`
    UPDATE payments
    SET success_effects_sent = true
    WHERE status = 'succeeded'
      AND success_effects_sent = false
  `);
  const count = typeof result?.rowCount === "number" ? result.rowCount : "?";
  console.log(
    `[0151] payments.success_effects_sent added (default false); backfilled ${count} already-succeeded row(s) to true.`
  );
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS payments
      DROP COLUMN IF EXISTS success_effects_sent
  `);

  console.log("[0151] down: payments.success_effects_sent dropped.");
}
