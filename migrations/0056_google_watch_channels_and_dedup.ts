import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Google Calendar bidirectional webhook sync — foundation tables (part 1 of 4).
 *
 * 1. google_calendar_watch_channels — one row per active watch channel. Stores
 *    the channel token we generate (used to validate incoming Google webhooks),
 *    the resource/channel IDs Google returns, and the sync token for incremental
 *    event fetches. Also tracks expiry so the renewal cron can renew 3 days early.
 *
 * 2. google_webhook_notifications — deduplication log. Google can deliver the
 *    same notification more than once. We insert (channel_id, message_number)
 *    with a unique constraint; duplicate inserts are silently ignored.
 *
 * Safe to run against production:
 *   - CREATE TABLE IF NOT EXISTS is idempotent.
 *   - No existing tables or columns are altered.
 *   - CASCADE delete on vendor_account_id means watch records clean up
 *     automatically when a vendor account is deleted.
 */
export async function up() {
  // 1. Watch channels
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS google_calendar_watch_channels (
      id                 varchar      PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id  varchar      NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      calendar_id        text         NOT NULL,
      channel_id         text         NOT NULL,
      channel_token      text         NOT NULL,
      resource_id        text,
      expires_at         timestamptz  NOT NULL,
      sync_token         text,
      last_sync_at       timestamptz,
      created_at         timestamptz  NOT NULL DEFAULT now(),
      updated_at         timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT google_calendar_watch_channels_channel_id_unique UNIQUE (channel_id),
      CONSTRAINT google_calendar_watch_channels_vendor_calendar_unique UNIQUE (vendor_account_id, calendar_id)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_google_watch_channels_channel_id
      ON google_calendar_watch_channels (channel_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_google_watch_channels_expires_at
      ON google_calendar_watch_channels (expires_at);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_google_watch_channels_vendor_account
      ON google_calendar_watch_channels (vendor_account_id);
  `);

  // 2. Webhook notification deduplication log
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS google_webhook_notifications (
      id                 varchar      PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id  varchar      NOT NULL,
      channel_id         text         NOT NULL,
      message_number     bigint       NOT NULL,
      resource_id        text         NOT NULL,
      resource_state     text,
      processed_at       timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT google_webhook_notifications_channel_message_unique UNIQUE (channel_id, message_number)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_google_webhook_notifications_channel_id
      ON google_webhook_notifications (channel_id);
  `);

  console.log("[0056] google_calendar_watch_channels + google_webhook_notifications created.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_google_webhook_notifications_channel_id;`);
  await db.execute(sql`DROP TABLE IF EXISTS google_webhook_notifications;`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_google_watch_channels_vendor_account;`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_google_watch_channels_expires_at;`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_google_watch_channels_channel_id;`);
  await db.execute(sql`DROP TABLE IF EXISTS google_calendar_watch_channels;`);
  console.log("[0056] down: google watch channels + dedup log removed.");
}
