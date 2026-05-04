import { sql as drizzleSql } from "drizzle-orm";
import { db } from "../db";

export type StripeWebhookCleanupResult = {
  deletedCount: number;
  cutoffAt: string;
};

type LoggerLike = Pick<Console, "log" | "warn">;

function extractRowCount(result: any): number {
  // Drizzle raw execute returns { rowCount } or { rows }
  if (typeof result?.rowCount === "number") return result.rowCount;
  if (Array.isArray(result?.rows)) return result.rows.length;
  return 0;
}

/**
 * Delete expired stripe_webhook_events rows (expires_at < now()).
 *
 * Run this on a recurring schedule (e.g. nightly) to enforce the 90-day
 * retention window added by migration 0041. Deleting in capped batches
 * avoids long-running transactions on large tables.
 */
export async function runStripeWebhookCleanupJob(options?: {
  batchSize?: number;
  logger?: LoggerLike;
}): Promise<StripeWebhookCleanupResult> {
  const logger = options?.logger ?? console;
  const batchSize = Number.isFinite(options?.batchSize)
    ? Math.max(1, Math.floor(options!.batchSize!))
    : 500;

  const cutoffAt = new Date().toISOString();

  const result = await db.execute(drizzleSql`
    DELETE FROM stripe_webhook_events
    WHERE id IN (
      SELECT id FROM stripe_webhook_events
      WHERE expires_at < now()
      LIMIT ${batchSize}
    )
  `);

  const deletedCount = extractRowCount(result);

  if (deletedCount > 0) {
    logger.log(
      "[stripe-webhook-cleanup] deleted %d expired row(s) (cutoff: %s)",
      deletedCount,
      cutoffAt
    );
  }

  return { deletedCount, cutoffAt };
}
