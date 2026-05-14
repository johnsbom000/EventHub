import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Backfill booking_start_at and booking_end_at where they are NULL.
 *
 * Bookings have two timing representations:
 *   event_date (date)         — used in emails and vendor approval UI
 *   booking_start_at (ts)     — used for Google Calendar sync and payout window
 *   booking_end_at   (ts)     — used for payout eligibility
 *
 * These are set separately and can drift. Specifically, bookings created before
 * canonical timing was introduced (migrations 0009/0013) may have event_date set
 * but booking_start_at/booking_end_at NULL.
 *
 * Backfill strategy:
 *   - If event_start_time is set, derive booking_start_at from event_date + event_start_time
 *     using vendor_timezone_snapshot (default UTC if missing).
 *   - If event_end_time is set, derive booking_end_at similarly.
 *   - If no times are set (all-day booking), set booking_start_at to midnight of event_date
 *     and booking_end_at to midnight of the following day (full calendar day block).
 *
 * This ensures Google Calendar receives a valid time range for every booking,
 * preventing overlap/double-booking detection from silently failing on old rows.
 *
 * Safe to run against production:
 *   - Only updates rows where booking_start_at IS NULL AND event_date IS NOT NULL.
 *   - Existing bookings with timestamps set are untouched.
 */
export async function up() {
  // Backfill rows where we have start time
  await db.execute(sql`
    UPDATE bookings
    SET
      booking_start_at = COALESCE(
        -- Parse explicit start time with timezone
        CASE
          WHEN event_start_time IS NOT NULL AND event_start_time <> ''
          THEN (event_date::text || ' ' || event_start_time)::timestamptz
                AT TIME ZONE COALESCE(NULLIF(vendor_timezone_snapshot,''), 'UTC')
          ELSE NULL
        END,
        -- Fall back to midnight of event_date in vendor timezone
        (event_date::text || ' 00:00:00')::timestamptz
          AT TIME ZONE COALESCE(NULLIF(vendor_timezone_snapshot,''), 'UTC')
      ),
      booking_end_at = COALESCE(
        -- Parse explicit end time with timezone
        CASE
          WHEN event_end_time IS NOT NULL AND event_end_time <> ''
          THEN (event_date::text || ' ' || event_end_time)::timestamptz
                AT TIME ZONE COALESCE(NULLIF(vendor_timezone_snapshot,''), 'UTC')
          ELSE NULL
        END,
        -- For all-day bookings: end at midnight the next day (full-day block)
        (event_date::text || ' 00:00:00')::timestamptz
          AT TIME ZONE COALESCE(NULLIF(vendor_timezone_snapshot,''), 'UTC')
          + interval '1 day'
      ),
      updated_at = now()
    WHERE booking_start_at IS NULL
      AND event_date IS NOT NULL;
  `);

  console.log("[0054] booking_start_at / booking_end_at backfilled from event_date.");
}

export async function down() {
  // Cannot safely reverse — we cannot know which rows had NULL before the backfill.
  console.log("[0054] down: no-op; booking timing backfill is not reversible.");
}
