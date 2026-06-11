import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Repurpose stripe_webhook_events.processed_at as a "successfully processed"
 * marker instead of a "received" timestamp.
 *
 * Background: the webhook handler inserted the dedupe row (processed_at
 * defaulting to now()) BEFORE processing the event, then short-circuited any
 * redelivery as a duplicate. If processing threw after the insert, Stripe's
 * retry was treated as a duplicate and the event was never processed —
 * leaving paid bookings stuck in "payment pending" with no recovery path.
 *
 * After this migration the handler inserts rows with processed_at = NULL,
 * sets processed_at = now() only after processing succeeds, and only
 * short-circuits redeliveries whose row has a non-null processed_at.
 *
 * Safe to run against production:
 * - Existing rows keep their processed_at values and are therefore treated
 *   as already processed (no historical replay).
 * - DROP DEFAULT / DROP NOT NULL are no-ops when already applied, so the
 *   migration is idempotent.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS stripe_webhook_events
      ALTER COLUMN processed_at DROP DEFAULT
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS stripe_webhook_events
      ALTER COLUMN processed_at DROP NOT NULL
  `);

  console.log("[0126] stripe_webhook_events.processed_at is now a nullable processed marker.");
}

export async function down() {
  await db.execute(sql`
    UPDATE stripe_webhook_events SET processed_at = now() WHERE processed_at IS NULL
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS stripe_webhook_events
      ALTER COLUMN processed_at SET DEFAULT now()
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS stripe_webhook_events
      ALTER COLUMN processed_at SET NOT NULL
  `);

  console.log("[0126] down: restored processed_at NOT NULL DEFAULT now().");
}
