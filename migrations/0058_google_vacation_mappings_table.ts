import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Google Calendar bidirectional webhook sync — vacation mapping table (part 3 of 4).
 *
 * Creates google_calendar_vacation_mappings to link a Google Calendar event to a
 * vendor vacation block. This is intentionally a separate table from
 * google_calendar_event_mappings (which is listing-scoped and must stay that way).
 *
 * Used for:
 *   - Looking up which vacation block to delete when a Google event is removed
 *   - Preventing duplicate vacation blocks if the same Google event is processed twice
 *
 * Safe to run against production:
 *   - CREATE TABLE IF NOT EXISTS is idempotent.
 *   - No existing tables or columns are altered.
 *   - CASCADE deletes on both FKs keep the table self-cleaning.
 */
export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS google_calendar_vacation_mappings (
      id                 varchar      PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id  varchar      NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      google_event_id    text         NOT NULL,
      google_calendar_id text         NOT NULL,
      vacation_block_id  varchar      NOT NULL REFERENCES vendor_vacation_blocks(id) ON DELETE CASCADE,
      mapping_source     text         NOT NULL DEFAULT 'google_calendar',
      created_at         timestamptz  NOT NULL DEFAULT now(),
      updated_at         timestamptz  NOT NULL DEFAULT now(),
      CONSTRAINT google_calendar_vacation_mappings_unique
        UNIQUE (vendor_account_id, google_calendar_id, google_event_id)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_google_vacation_mappings_vendor_calendar
      ON google_calendar_vacation_mappings (vendor_account_id, google_calendar_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_google_vacation_mappings_vacation_block
      ON google_calendar_vacation_mappings (vacation_block_id);
  `);

  console.log("[0058] google_calendar_vacation_mappings table created.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_google_vacation_mappings_vacation_block;`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_google_vacation_mappings_vendor_calendar;`);
  await db.execute(sql`DROP TABLE IF EXISTS google_calendar_vacation_mappings;`);
  console.log("[0058] down: google_calendar_vacation_mappings removed.");
}
