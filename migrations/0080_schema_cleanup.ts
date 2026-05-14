import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Schema cleanup — correctness and performance fixes
 *
 * 1. security_deposit_refunded_at: convert timestamp → timestamptz
 *    All other booking time columns are timestamptz. This one was missing the
 *    timezone parameter, which can cause incorrect comparisons with timestamptz
 *    columns (e.g., booking_end_at) in the security deposit refund job.
 *
 * 2. Partial index on bookings for the security deposit auto-refund job
 *    The job runs every ~70 min and scans bookings with no index support.
 *    A partial index on event-complete bookings pending refund prevents a
 *    full table scan as bookings grow.
 *
 * Safe to run against production:
 *   - ALTER COLUMN TYPE timestamp → timestamptz is safe in PostgreSQL when
 *     no timezone conversion is needed (timestamp AT TIME ZONE 'UTC').
 *   - CREATE INDEX CONCURRENTLY does not lock the table.
 *   - Both steps are independently safe and non-destructive.
 */
export async function up() {
  // Step 1: convert security_deposit_refunded_at to timestamptz
  await db.execute(sql`
    ALTER TABLE bookings
      ALTER COLUMN security_deposit_refunded_at
        TYPE timestamptz
        USING security_deposit_refunded_at AT TIME ZONE 'UTC'
  `);

  // Step 2: partial index for the security deposit refund job
  // Covers: WHERE security_deposit_cents > 0 AND security_deposit_refunded_at IS NULL
  await db.execute(sql`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_security_deposit_pending
      ON bookings (booking_end_at DESC)
      WHERE security_deposit_cents > 0
        AND security_deposit_refunded_at IS NULL
  `);
}
