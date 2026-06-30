import { sql as drizzleSql } from "drizzle-orm";
import { db } from "../db";
import { ANALYTICS_RETENTION_DAYS } from "../lib/constants";

export type DataRetentionCleanupResult = {
  deletedByTable: Record<string, number>;
  cutoffAt: string;
};

type LoggerLike = Pick<Console, "log" | "warn">;

function extractRowCount(result: any): number {
  // Drizzle raw execute returns { rowCount } or { rows }
  if (typeof result?.rowCount === "number") return result.rowCount;
  if (Array.isArray(result?.rows)) return result.rows.length;
  return 0;
}

// Append-only tables and the predicate identifying rows past the retention
// window. `notifications` uses its own expires_at column (90-day default);
// the analytics logs use a fixed day-window on their timestamp column.
// All four tables have an `id` primary key, so the batched delete-by-id
// subquery pattern works uniformly. Predicates are hardcoded constants — no
// user input — so raw SQL is safe here.
const TARGETS: Array<{ table: string; predicate: string }> = [
  { table: "notifications", predicate: "expires_at < now()" },
  {
    table: "web_traffic",
    predicate: `"timestamp" < now() - make_interval(days => ${ANALYTICS_RETENTION_DAYS})`,
  },
  {
    table: "listing_traffic",
    predicate: `occurred_at < now() - make_interval(days => ${ANALYTICS_RETENTION_DAYS})`,
  },
  {
    table: "event_log",
    predicate: `created_at < now() - make_interval(days => ${ANALYTICS_RETENTION_DAYS})`,
  },
];

/**
 * Trim old rows from append-only log tables so they don't grow unbounded.
 *
 * Deletes in capped batches per table, looping until a batch comes back short
 * (or a per-table iteration cap is hit) so an existing backlog drains over a
 * few daily runs without ever holding a long transaction. Time-window deletes
 * are naturally idempotent, so no worker lock is required.
 *
 * Touches ONLY anonymous analytics/notification logs — nothing financial or
 * operational. Run on a recurring (e.g. daily) schedule.
 */
export async function runDataRetentionCleanupJob(options?: {
  batchSize?: number;
  logger?: LoggerLike;
}): Promise<DataRetentionCleanupResult> {
  const logger = options?.logger ?? console;
  const batchSize = Number.isFinite(options?.batchSize)
    ? Math.max(1, Math.floor(options!.batchSize!))
    : 1000;
  const MAX_ITERATIONS = 50; // bound runtime: up to batchSize * 50 rows/table/run

  const cutoffAt = new Date().toISOString();
  const deletedByTable: Record<string, number> = {};

  for (const { table, predicate } of TARGETS) {
    let tableTotal = 0;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const result = await db.execute(
        drizzleSql.raw(
          `DELETE FROM ${table} WHERE id IN (` +
            `SELECT id FROM ${table} WHERE ${predicate} LIMIT ${batchSize}` +
            `)`
        )
      );
      const n = extractRowCount(result);
      tableTotal += n;
      if (n < batchSize) break; // drained for this run
    }

    deletedByTable[table] = tableTotal;
    if (tableTotal > 0) {
      logger.log("[data-retention] deleted %d row(s) from %s", tableTotal, table);
    }
  }

  return { deletedByTable, cutoffAt };
}
