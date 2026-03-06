import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id text NOT NULL UNIQUE,
      event_type text NOT NULL,
      livemode boolean NOT NULL DEFAULT false,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      processed_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
    ON stripe_webhook_events (processed_at DESC);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id
    ON payments (stripe_payment_intent_id);
  `);

  await db.execute(sql`
    UPDATE users
    SET role = 'admin'
    WHERE lower(email) = lower('eventhubglobal@gmail.com');
  `);
}

export async function down() {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_payments_stripe_payment_intent_id;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS idx_stripe_webhook_events_processed_at;
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS stripe_webhook_events;
  `);
}
