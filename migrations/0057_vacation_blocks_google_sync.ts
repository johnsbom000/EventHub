import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Google Calendar bidirectional webhook sync — vacation block linkage (part 2 of 4).
 *
 * Extends vendor_vacation_blocks with three new columns so EventHub can:
 *   - Know which Google Calendar event a vacation block was synced to/from
 *   - Distinguish manually-created blocks from Google-imported ones
 *
 * New columns:
 *   google_event_id    — the Google Calendar event ID this block is linked to
 *   google_calendar_id — which calendar the event lives in
 *   source             — 'manual' (default, covers all existing rows) or 'google_calendar'
 *
 * Safe to run against production:
 *   - ADD COLUMN IF NOT EXISTS with DEFAULT does not rewrite the table.
 *   - All existing rows get source = 'manual' automatically.
 *   - Nullable google_event_id / google_calendar_id leave existing rows untouched.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_vacation_blocks
      ADD COLUMN IF NOT EXISTS google_event_id    text,
      ADD COLUMN IF NOT EXISTS google_calendar_id text,
      ADD COLUMN IF NOT EXISTS source             text NOT NULL DEFAULT 'manual';
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_vacation_blocks_source
      ON vendor_vacation_blocks (vendor_id, source);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_vacation_blocks_google_event
      ON vendor_vacation_blocks (google_event_id)
      WHERE google_event_id IS NOT NULL;
  `);

  console.log("[0057] vendor_vacation_blocks: google_event_id, google_calendar_id, source added.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_vendor_vacation_blocks_google_event;`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_vendor_vacation_blocks_source;`);
  await db.execute(sql`
    ALTER TABLE vendor_vacation_blocks
      DROP COLUMN IF EXISTS google_event_id,
      DROP COLUMN IF EXISTS google_calendar_id,
      DROP COLUMN IF EXISTS source;
  `);
  console.log("[0057] down: vacation block google sync columns removed.");
}
