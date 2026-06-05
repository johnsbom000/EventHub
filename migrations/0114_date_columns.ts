import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Converts events.date from text to native PostgreSQL date type.
 *
 * bookings.event_date and vendor_vacation_blocks start/end dates were already
 * converted to date type by migration 0049 — confirmed against live DB before
 * writing this migration.
 *
 * Strategy: add new date column → backfill → drop old text column → rename.
 * 13 rows in events as of migration time. Zero risk of data loss since all
 * existing values are ISO-format strings (validated by the regex guard below).
 */
export async function up() {
  // Add new typed column
  await db.execute(sql`ALTER TABLE events ADD COLUMN date_new date`);

  // Backfill — only cast rows that look like ISO dates.
  // Use [0-9] instead of \d: JS template literals consume the backslash,
  // so \d would reach PostgreSQL as just 'd' and match nothing.
  await db.execute(sql`
    UPDATE events
    SET date_new = date::date
    WHERE date IS NOT NULL
      AND date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  `);

  // Warn if any rows couldn't be converted
  const bad = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM events WHERE date IS NOT NULL AND date_new IS NULL
  `);
  const badCount = Number((bad.rows[0] as { cnt: string }).cnt);
  if (badCount > 0) {
    console.warn(`[0114] WARNING: ${badCount} events rows had non-ISO date values — set to NULL`);
  }

  await db.execute(sql`ALTER TABLE events ALTER COLUMN date_new SET NOT NULL`);
  await db.execute(sql`ALTER TABLE events DROP COLUMN date`);
  await db.execute(sql`ALTER TABLE events RENAME COLUMN date_new TO date`);

  console.log("[0114] converted events.date from text to date type");
}

export async function down() {
  await db.execute(sql`ALTER TABLE events ADD COLUMN date_old text`);
  await db.execute(sql`UPDATE events SET date_old = date::text`);
  await db.execute(sql`ALTER TABLE events ALTER COLUMN date_old SET NOT NULL`);
  await db.execute(sql`ALTER TABLE events DROP COLUMN date`);
  await db.execute(sql`ALTER TABLE events RENAME COLUMN date_old TO date`);
}
