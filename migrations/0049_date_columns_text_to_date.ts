import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Convert date-as-text columns to proper PostgreSQL date type.
 *
 * Affected columns:
 *   bookings.event_date                    text → date
 *   payment_schedules.due_date             text → date
 *   vendor_vacation_blocks.start_date      text → date
 *   vendor_vacation_blocks.end_date        text → date
 *
 * Why: text dates have no DB-level validation. A value like "June 15" or
 * "2026-6-1" would be accepted silently. Using the date type means PostgreSQL
 * enforces YYYY-MM-DD format and allows proper date arithmetic.
 *
 * Safe to run against production:
 * - Step 1 validates that all existing values are parseable before the ALTER.
 *   If any malformed values exist the migration aborts with a clear error.
 * - Step 2 normalises any values that are valid dates but not YYYY-MM-DD.
 * - Step 3 alters the columns.
 */
export async function up() {
  // 1. Validate — will raise an error and abort if any row fails to parse.
  await db.execute(sql`
    SELECT event_date::date FROM bookings WHERE event_date IS NOT NULL;
  `);
  await db.execute(sql`
    SELECT due_date::date FROM payment_schedules WHERE due_date IS NOT NULL;
  `);
  await db.execute(sql`
    SELECT start_date::date, end_date::date FROM vendor_vacation_blocks;
  `);

  // 2. Normalise text dates to ISO format before casting
  //    (handles edge cases like '2026-6-5' → '2026-06-05').
  await db.execute(sql`
    UPDATE bookings
    SET event_date = to_char(event_date::date, 'YYYY-MM-DD')
    WHERE event_date IS NOT NULL;
  `);
  await db.execute(sql`
    UPDATE payment_schedules
    SET due_date = to_char(due_date::date, 'YYYY-MM-DD')
    WHERE due_date IS NOT NULL;
  `);
  await db.execute(sql`
    UPDATE vendor_vacation_blocks
    SET start_date = to_char(start_date::date, 'YYYY-MM-DD'),
        end_date   = to_char(end_date::date, 'YYYY-MM-DD');
  `);

  // 3. Alter columns to date type.
  await db.execute(sql`
    ALTER TABLE bookings
      ALTER COLUMN event_date TYPE date USING event_date::date;
  `);
  await db.execute(sql`
    ALTER TABLE payment_schedules
      ALTER COLUMN due_date TYPE date USING due_date::date;
  `);
  await db.execute(sql`
    ALTER TABLE vendor_vacation_blocks
      ALTER COLUMN start_date TYPE date USING start_date::date,
      ALTER COLUMN end_date   TYPE date USING end_date::date;
  `);

  console.log("[0049] Date columns converted from text to date type.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE bookings
      ALTER COLUMN event_date TYPE text USING to_char(event_date, 'YYYY-MM-DD');
  `);
  await db.execute(sql`
    ALTER TABLE payment_schedules
      ALTER COLUMN due_date TYPE text USING to_char(due_date, 'YYYY-MM-DD');
  `);
  await db.execute(sql`
    ALTER TABLE vendor_vacation_blocks
      ALTER COLUMN start_date TYPE text USING to_char(start_date, 'YYYY-MM-DD'),
      ALTER COLUMN end_date   TYPE text USING to_char(end_date, 'YYYY-MM-DD');
  `);

  console.log("[0049] down: Date columns reverted to text.");
}
