import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Travel fee proposal system.
 *
 * Business rule: travel/delivery is free for events inside the listing's
 * service radius. If the customer's event address is outside the radius,
 * the vendor is notified and can propose a travel/delivery fee
 * post-booking. The customer must accept before payment is collected.
 *
 * Changes:
 *
 * 1. bookings — two new columns:
 *    - event_location_lat / event_location_lng  (double precision, nullable)
 *      Coordinates captured at booking creation from the customer's
 *      eventLocation geocoded address. Used for radius distance checks.
 *    - outside_service_radius  (boolean, not null, default false)
 *      Set to true at booking creation when the event falls outside the
 *      listing's service_radius_miles. Drives the "propose fee" UI prompt.
 *
 * 2. payment_type enum — add 'travel_fee' value.
 *    Used on the payment_schedules row created when a proposal is accepted.
 *
 * 3. notification_type enum — add three values:
 *    - travel_fee_proposed  : sent to customer when vendor submits a proposal
 *    - travel_fee_accepted  : sent to vendor when customer accepts
 *    - travel_fee_declined  : sent to vendor when customer declines
 *
 * 4. New table: travel_fee_proposals
 *    One row per proposal per booking. Only one 'pending' row per booking
 *    is allowed at a time (partial unique index).
 *
 * Safe to run against production:
 *   - All new columns are nullable or have defaults.
 *   - ALTER TYPE ADD VALUE is non-blocking in PostgreSQL 10+.
 *   - IF NOT EXISTS / CREATE TABLE IF NOT EXISTS guards make this idempotent.
 *
 * NOTE: ALTER TYPE ADD VALUE cannot run inside an explicit transaction block.
 * Each enum alter is issued as a standalone statement — that is fine because
 * db.execute() sends individual statements outside of Drizzle's transaction wrapper.
 */
export async function up() {
  // ── 1. Add coordinate + radius-flag columns to bookings ──────────────────────
  await db.execute(sql`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS event_location_lat    double precision,
      ADD COLUMN IF NOT EXISTS event_location_lng    double precision,
      ADD COLUMN IF NOT EXISTS outside_service_radius boolean NOT NULL DEFAULT false;
  `);

  // ── 2. Extend payment_type enum ───────────────────────────────────────────────
  await db.execute(sql`
    ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'travel_fee';
  `);

  // ── 3. Extend notification_type enum ─────────────────────────────────────────
  await db.execute(sql`
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'travel_fee_proposed';
  `);

  await db.execute(sql`
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'travel_fee_accepted';
  `);

  await db.execute(sql`
    ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'travel_fee_declined';
  `);

  // ── 4. Create travel_fee_proposals table ──────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS travel_fee_proposals (
      id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id          varchar NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      vendor_account_id   varchar NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      amount_cents        integer NOT NULL,
      reason              text,
      -- 'pending' | 'accepted' | 'declined' | 'cancelled'
      status              varchar(20) NOT NULL DEFAULT 'pending',
      payment_schedule_id varchar REFERENCES payment_schedules(id) ON DELETE SET NULL,
      proposed_at         timestamptz NOT NULL DEFAULT now(),
      responded_at        timestamptz,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Only one active (pending) proposal per booking at a time.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS travel_fee_proposals_booking_pending_unique
      ON travel_fee_proposals (booking_id)
      WHERE status = 'pending';
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_travel_fee_proposals_booking_id
      ON travel_fee_proposals (booking_id, created_at DESC);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_travel_fee_proposals_vendor_account_id
      ON travel_fee_proposals (vendor_account_id);
  `);

  console.log("[0070] Travel fee proposals: booking columns, enum values, and table created.");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS travel_fee_proposals;`);

  await db.execute(sql`
    ALTER TABLE bookings
      DROP COLUMN IF EXISTS event_location_lat,
      DROP COLUMN IF EXISTS event_location_lng,
      DROP COLUMN IF EXISTS outside_service_radius;
  `);

  // PostgreSQL does not support removing enum values — no-op for enum changes.
  console.log("[0070] down: travel_fee_proposals table and booking columns dropped. Enum values remain (PostgreSQL limitation).");
}
