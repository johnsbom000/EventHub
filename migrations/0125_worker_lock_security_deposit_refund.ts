import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Seeds the missing worker_locks row for the security-deposit auto-refund job.
 *
 * The job (runSecurityDepositRefundJob in routes.ts) has been fully implemented
 * since migration 0069 added the worker_locks table, but the seed INSERT in
 * 0069 only included 'payout' and 'booking_expiry'. Without this row,
 * tryAcquireWorkerLock always returns false (UPDATE finds no matching row)
 * and the job logs "lock held by another instance — skipping" on every tick.
 *
 * Safe to run against production: ON CONFLICT DO NOTHING is idempotent.
 */
export async function up() {
  await db.execute(sql`
    INSERT INTO worker_locks (lock_id)
    VALUES ('security_deposit_refund')
    ON CONFLICT (lock_id) DO NOTHING
  `);

  console.log("[0082] seeded worker_locks row for security_deposit_refund job.");
}

export async function down() {
  await db.execute(sql`
    DELETE FROM worker_locks WHERE lock_id = 'security_deposit_refund'
  `);

  console.log("[0082] down: removed security_deposit_refund worker_locks row.");
}
