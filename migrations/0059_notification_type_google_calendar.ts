import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Google Calendar bidirectional webhook sync — notification types (part 4 of 4).
 *
 * Adds three new values to the notification_type enum:
 *   google_calendar_booking_updated — booking dates changed via Google Calendar
 *   google_calendar_booking_deleted — booking event deleted in Google Calendar
 *   google_calendar_sync_error      — watch channel renewal failed or sync issue
 *
 * Uses ALTER TYPE ADD VALUE which is safe and non-blocking in PostgreSQL 10+.
 * IF NOT EXISTS guard makes this idempotent.
 *
 * Safe to run against production:
 *   - ADD VALUE does not rewrite the enum or any table using it.
 *   - Existing rows with existing enum values are completely unaffected.
 *   - IF NOT EXISTS prevents errors on re-runs.
 */
export async function up() {
  await db.execute(sql`
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'google_calendar_booking_updated';
  `);

  await db.execute(sql`
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'google_calendar_booking_deleted';
  `);

  await db.execute(sql`
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'google_calendar_sync_error';
  `);

  console.log("[0059] notification_type enum: google calendar values added.");
}

export async function down() {
  // PostgreSQL does not support removing enum values.
  // The values are harmless if present but unused.
  console.log("[0059] down: enum values cannot be removed in PostgreSQL — no-op.");
}
