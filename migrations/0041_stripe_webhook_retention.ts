import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add expires_at retention column to stripe_webhook_events.
 *
 * Background: full Stripe webhook payloads are stored indefinitely with no TTL,
 * causing unbounded storage growth and retaining sensitive payment metadata
 * longer than necessary. A 90-day window covers any realistic audit or dispute
 * lookback period.
 *
 * The companion cleanup job (server/jobs/stripeWebhookCleanup.ts) runs on a
 * schedule to delete expired rows. This migration only adds the column and index.
 *
 * Safe to run against production:
 * - Column is added with NOT NULL DEFAULT so all rows receive a value immediately.
 * - Existing rows are backfilled to processed_at + 90 days (past rows may
 *   already be expired — the cleanup job handles deletion on its first run).
 */
export async function up() {
  // 1. Add column with default (applied to all existing rows instantly)
  await db.execute(sql`
    ALTER TABLE stripe_webhook_events
      ADD COLUMN IF NOT EXISTS expires_at timestamp
      NOT NULL DEFAULT (now() + interval '90 days');
  `);

  // 2. Backfill existing rows relative to when they were processed
  //    (overrides the now()-based default with the correct historical anchor)
  await db.execute(sql`
    UPDATE stripe_webhook_events
    SET expires_at = processed_at + interval '90 days'
    WHERE processed_at IS NOT NULL;
  `);

  // 3. Index for efficient cleanup queries
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_expires_at
      ON stripe_webhook_events (expires_at);
  `);

  console.log("[0041] stripe_webhook_events.expires_at retention column added (90-day TTL).");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_stripe_webhook_events_expires_at;`);
  await db.execute(sql`ALTER TABLE stripe_webhook_events DROP COLUMN IF EXISTS expires_at;`);
}
