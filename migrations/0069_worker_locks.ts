import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add a worker_locks table for distributed worker coordination.
 *
 * Problem: background workers (auto-payout, booking expiry) run in-process on
 * a setInterval. An in-process `tickInFlight` flag prevents re-entrancy within
 * one instance, but if Railway briefly runs two instances during a rolling deploy,
 * both instances would pick up the same payout candidates and potentially
 * double-transfer money.
 *
 * Solution: a lightweight timestamp-based lock table. Each worker attempts an
 * atomic UPDATE on its row. Only the instance that wins the UPDATE (returns 1 row)
 * may proceed. The `locked_at` timestamp acts as both the lock holder signal and
 * a staleness timeout — if a process crashes without releasing, the next worker
 * tick after the stale window can reclaim it.
 *
 * Works correctly in connection-pooled environments (unlike pg_advisory_lock which
 * is session-scoped and requires the unlock to run on the same connection).
 *
 * Safe to run against production:
 *   - CREATE TABLE IF NOT EXISTS is idempotent.
 *   - Seed INSERT uses ON CONFLICT DO NOTHING so re-runs are safe.
 */
export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS worker_locks (
      lock_id    text        PRIMARY KEY,
      locked_at  timestamptz NOT NULL DEFAULT '1970-01-01'::timestamptz
    )
  `);

  // Seed one row per worker. locked_at defaults to epoch so the first tick
  // always wins immediately on a fresh deploy.
  await db.execute(sql`
    INSERT INTO worker_locks (lock_id)
    VALUES ('payout'), ('booking_expiry')
    ON CONFLICT (lock_id) DO NOTHING
  `);

  console.log("[0069] worker_locks table created and seeded.");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS worker_locks`);
  console.log("[0069] down: worker_locks table removed.");
}
