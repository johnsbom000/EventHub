import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds 'pro_trial_ending' to the notification_type enum.
 *
 * Why: the day-27 "your Pro trial ends soon" nudge (Treatment B of the Pro-trial
 * A/B test) creates an in-app notification of this type, fired from the
 * customer.subscription.trial_will_end webhook.
 *
 * Safe to run against production:
 *   - Adding an enum value is non-destructive.
 *   - Idempotent: ADD VALUE IF NOT EXISTS makes re-runs a no-op.
 *
 * Note: `ALTER TYPE ... ADD VALUE` cannot run inside an explicit transaction
 * block. The migration runner (server/migrate.ts) calls up() WITHOUT wrapping it
 * in a transaction, so the ALTER TYPE below is issued as its own statement.
 */
export async function up() {
  await db.execute(sql`
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pro_trial_ending';
  `);

  console.log("[0152] Added 'pro_trial_ending' to notification_type enum.");
}

export async function down() {
  // Postgres cannot drop a single enum value; leaving the value in place is
  // harmless (nothing references it once the feature is removed).
  console.log("[0152] down: no-op — Postgres cannot drop an individual enum value.");
}
