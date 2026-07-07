import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add payments.payout_transfer_retry_count — how many times the payout worker's
 * Stripe transfer for this payment has failed.
 *
 * Previously a single failed transfer parked the payout at
 * payout_status = 'blocked' / payout_blocked_reason = 'transfer_failed' forever:
 * the auto-payout candidate query excludes 'blocked', so a transient Stripe
 * error meant the vendor was never paid without manual admin intervention.
 *
 * With this counter the worker re-selects 'blocked'/'transfer_failed' rows and
 * retries the transfer; after MAX_PAYOUT_TRANSFER_RETRIES (10) failures the
 * reason flips to 'transfer_failed_permanent', which only the admin payout
 * endpoint can reprocess. The counter resets to 0 when a transfer succeeds.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS payments
      ADD COLUMN IF NOT EXISTS payout_transfer_retry_count integer NOT NULL DEFAULT 0
  `);

  console.log("[0142] payments.payout_transfer_retry_count added (default 0).");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS payments
      DROP COLUMN IF EXISTS payout_transfer_retry_count
  `);

  console.log("[0142] down: payments.payout_transfer_retry_count dropped.");
}
