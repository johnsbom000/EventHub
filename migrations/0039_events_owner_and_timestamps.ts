import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add customer ownership and timestamps to the events table.
 *
 * Background: the events table had no customer_id FK, making it impossible to
 * query "all events for this customer" without joining through bookings. Events
 * also had no updated_at column and no format constraint on the date field.
 *
 * Safe to run against production:
 * - customer_id is nullable; backfilled from bookings where a match exists.
 * - updated_at has a DEFAULT so existing rows receive a value.
 * - Date format check is added as NOT VALID so it applies only to new rows,
 *   avoiding a full-table validation that could fail on legacy data.
 */
export async function up() {
  // 1. Add customer_id FK (nullable — events can exist before a booking is made)
  await db.execute(sql`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS customer_id varchar
      REFERENCES users(id) ON DELETE SET NULL;
  `);

  // 2. Backfill customer_id from the first confirmed booking that references each event
  await db.execute(sql`
    UPDATE events e
    SET customer_id = b.customer_id
    FROM (
      SELECT DISTINCT ON (event_id) event_id, customer_id
      FROM bookings
      WHERE event_id IS NOT NULL
        AND customer_id IS NOT NULL
      ORDER BY event_id, created_at ASC
    ) b
    WHERE b.event_id = e.id
      AND e.customer_id IS NULL;
  `);

  // 3. Add updated_at with a default (no backfill needed — existing rows get now())
  await db.execute(sql`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();
  `);

  // 4. Index for customer-scoped event lookups
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_events_customer_id
      ON events (customer_id)
      WHERE customer_id IS NOT NULL;
  `);

  // 5. Add date format check as NOT VALID (enforces new rows only; avoids full scan)
  await db.execute(sql`
    ALTER TABLE events
      ADD CONSTRAINT events_date_format_check
      CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      NOT VALID;
  `);

  console.log("[0039] events.customer_id FK, updated_at, and date format check added.");
}

export async function down() {
  await db.execute(sql`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_date_format_check;`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_events_customer_id;`);
  await db.execute(sql`ALTER TABLE events DROP COLUMN IF EXISTS updated_at;`);
  await db.execute(sql`ALTER TABLE events DROP COLUMN IF EXISTS customer_id;`);
}
