import { logger } from "./logger";
import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";

/**
 * Distributed worker lock using the worker_locks table.
 *
 * Atomically claims the lock by updating the row only when locked_at is older
 * than `staleAfterMs`. Only the instance whose UPDATE returns a row may proceed.
 * Works correctly in connection-pooled environments — no session-level advisory
 * lock subtleties.
 *
 * Returns true if the lock was acquired (caller must call releaseWorkerLock).
 * Returns false if another instance holds the lock — caller should skip this tick.
 * Fails open on DB errors so a transient outage never permanently stalls workers.
 */
export async function tryAcquireWorkerLock(lockId: string, staleAfterMs: number): Promise<boolean> {
  try {
    const staleAt = new Date(Date.now() - staleAfterMs);
    const result = await db.execute(drizzleSql`
      UPDATE worker_locks
      SET locked_at = now()
      WHERE lock_id = ${lockId}
        AND locked_at < ${staleAt}
      RETURNING lock_id
    `);
    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
    return rows.length > 0;
  } catch (err: any) {
    // Fail open — a DB error should not permanently stall the worker.
    logger.warn(`[worker-lock] tryAcquire failed for "${lockId}":`, err?.message || err);
    return true;
  }
}

/**
 * Releases the worker lock by resetting locked_at to epoch.
 * The next tick on any instance can then immediately acquire it.
 */
export async function releaseWorkerLock(lockId: string): Promise<void> {
  try {
    await db.execute(drizzleSql`
      UPDATE worker_locks
      SET locked_at = '1970-01-01'::timestamptz
      WHERE lock_id = ${lockId}
    `);
  } catch (err: any) {
    logger.warn(`[worker-lock] release failed for "${lockId}":`, err?.message || err);
  }
}
