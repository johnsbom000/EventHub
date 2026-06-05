import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Converts three text/varchar columns to proper PostgreSQL enum types so invalid
 * values are rejected at the DB level. Follows the same DDL pattern used in 0095.
 *
 * Columns converted:
 *   vendor_listings.listing_type  → listing_type_enum
 *   vendor_discounts.discount_type → discount_type_enum
 *   travel_fee_proposals.status    → travel_fee_proposal_status_enum
 */
export async function up() {
  // ── vendor_listings.listing_type ──────────────────────────────────────────
  // Use DO block to avoid failure if the type already exists (idempotent re-run).
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE listing_type_enum AS ENUM ('single', 'package_container', 'package_item', 'addon');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  // Drop default before type change — PG can't auto-cast defaults to enum.
  await db.execute(sql`
    ALTER TABLE vendor_listings ALTER COLUMN listing_type DROP DEFAULT
  `);
  await db.execute(sql`
    ALTER TABLE vendor_listings
    ALTER COLUMN listing_type TYPE listing_type_enum
    USING listing_type::listing_type_enum
  `);
  await db.execute(sql`
    ALTER TABLE vendor_listings ALTER COLUMN listing_type SET DEFAULT 'single'
  `);

  // ── vendor_discounts.discount_type ────────────────────────────────────────
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE discount_type_enum AS ENUM ('promo_code', 'public_sale');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.execute(sql`
    ALTER TABLE vendor_discounts
    ALTER COLUMN discount_type TYPE discount_type_enum
    USING discount_type::discount_type_enum
  `);

  // ── travel_fee_proposals.status ───────────────────────────────────────────
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE travel_fee_proposal_status_enum AS ENUM ('pending', 'accepted', 'declined', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  // Drop the partial unique index (predicate uses text comparison; must rebuild after type change).
  await db.execute(sql`
    DROP INDEX IF EXISTS travel_fee_proposals_booking_pending_unique
  `);
  // Drop default before type change.
  await db.execute(sql`
    ALTER TABLE travel_fee_proposals ALTER COLUMN status DROP DEFAULT
  `);
  await db.execute(sql`
    ALTER TABLE travel_fee_proposals
    ALTER COLUMN status TYPE travel_fee_proposal_status_enum
    USING status::travel_fee_proposal_status_enum
  `);
  await db.execute(sql`
    ALTER TABLE travel_fee_proposals ALTER COLUMN status SET DEFAULT 'pending'
  `);
  // Recreate the partial unique index now that the column is the correct enum type.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS travel_fee_proposals_booking_pending_unique
    ON travel_fee_proposals (booking_id)
    WHERE status = 'pending'
  `);

  console.log("[0112] converted listing_type, discount_type, travel_fee_proposal status to enums");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_listings ALTER COLUMN listing_type TYPE text USING listing_type::text
  `);
  await db.execute(sql`DROP TYPE IF EXISTS listing_type_enum`);

  await db.execute(sql`
    ALTER TABLE vendor_discounts ALTER COLUMN discount_type TYPE varchar USING discount_type::text
  `);
  await db.execute(sql`DROP TYPE IF EXISTS discount_type_enum`);

  await db.execute(sql`
    ALTER TABLE travel_fee_proposals ALTER COLUMN status TYPE varchar(20) USING status::text
  `);
  await db.execute(sql`DROP TYPE IF EXISTS travel_fee_proposal_status_enum`);
}
