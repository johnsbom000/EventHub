import { logger } from "./logger";
import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";

/**
 * Opaque ownership token returned by tryAcquireWorkerLock. It is the exact
 * locked_at value the acquiring UPDATE wrote; releaseWorkerLock only releases
 * when the row still carries this value, so an instance that overran its
 * staleness window can never release a successor's lock.
 *
 * Kept as the ::text rendering of the timestamptz (never a JS Date): Postgres
 * timestamps carry microseconds, which a Date round-trip would truncate and the
 * release comparison would then never match.
 */
export type WorkerLockToken = string;

/**
 * Distributed worker lock using the worker_locks table.
 *
 * Atomically claims the lock by updating the row only when locked_at is older
 * than `staleAfterMs`. Only the instance whose UPDATE returns a row may proceed.
 * Works correctly in connection-pooled environments — no session-level advisory
 * lock subtleties.
 *
 * Returns the ownership token if the lock was acquired (caller must pass it to
 * releaseWorkerLock). Returns null if another instance holds the lock — caller
 * should skip this tick.
 *
 * Fails CLOSED on DB errors: a transient outage means this tick is skipped, and
 * staleness-based expiry guarantees the next healthy tick can acquire — a missed
 * tick self-heals, whereas failing open lets two instances run the same money
 * job concurrently during a DB blip.
 */
export async function tryAcquireWorkerLock(
  lockId: string,
  staleAfterMs: number
): Promise<WorkerLockToken | null> {
  try {
    // Self-seed the lock row. Acquisition is UPDATE-only, so a lock whose row was
    // never seeded (e.g. a new worker added without a seed migration) would match
    // zero rows forever and the job would silently skip every tick. Inserting at
    // epoch here makes the row immediately acquirable and keeps seeding in lockstep
    // with the code that uses the lock.
    await db.execute(drizzleSql`
      INSERT INTO worker_locks (lock_id, locked_at)
      VALUES (${lockId}, '1970-01-01'::timestamptz)
      ON CONFLICT (lock_id) DO NOTHING
    `);
    const staleAt = new Date(Date.now() - staleAfterMs);
    const result = await db.execute(drizzleSql`
      UPDATE worker_locks
      SET locked_at = now()
      WHERE lock_id = ${lockId}
        AND locked_at < ${staleAt}
      RETURNING locked_at::text AS locked_at
    `);
    const rows: Array<{ locked_at?: string | null }> = Array.isArray(result)
      ? result
      : (result as any).rows ?? [];
    const token = typeof rows[0]?.locked_at === "string" ? rows[0].locked_at : null;
    return token || null;
  } catch (err: any) {
    logger.warn(`[worker-lock] tryAcquire failed for "${lockId}":`, err?.message || err);
    return null;
  }
}

/**
 * Releases the worker lock by resetting locked_at to epoch — but only when the
 * row still holds the caller's acquisition token. A late release from an
 * instance whose lock already went stale (and was re-acquired by a successor)
 * is a no-op instead of yanking the successor's lock away.
 */
export async function releaseWorkerLock(lockId: string, token: WorkerLockToken): Promise<void> {
  try {
    await db.execute(drizzleSql`
      UPDATE worker_locks
      SET locked_at = '1970-01-01'::timestamptz
      WHERE lock_id = ${lockId}
        AND locked_at = ${token}::timestamptz
    `);
  } catch (err: any) {
    logger.warn(`[worker-lock] release failed for "${lockId}":`, err?.message || err);
  }
}
