import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Vendor Discount System
 *
 * Adds three tables and two columns to support:
 *  - Promo codes: vendor-created codes for % off specific listings
 *  - Public sales: advertised % off auto-applied at checkout
 *  - Redemption tracking with usage cap enforcement
 *
 * Safe to run against production:
 *  - All CREATE TABLE statements use IF NOT EXISTS.
 *  - All ALTER TABLE statements use IF NOT EXISTS (PG 9.6+).
 *  - No existing rows modified.
 */
export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_discounts (
      id                  varchar  PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id   varchar  NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      discount_type       varchar  NOT NULL CHECK (discount_type IN ('promo_code', 'public_sale')),
      code                varchar,
      percent_off         integer  NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
      starts_at           timestamp NOT NULL,
      ends_at             timestamp NOT NULL CHECK (ends_at > starts_at),
      max_uses            integer,
      used_count          integer  NOT NULL DEFAULT 0,
      active              boolean  NOT NULL DEFAULT true,
      created_at          timestamp NOT NULL DEFAULT NOW(),
      updated_at          timestamp NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS vendor_discounts_vendor_active_idx
      ON vendor_discounts (vendor_account_id, active, starts_at);

    CREATE UNIQUE INDEX IF NOT EXISTS vendor_discounts_code_unique_idx
      ON vendor_discounts (code)
      WHERE code IS NOT NULL;

    CREATE TABLE IF NOT EXISTS discount_listings (
      discount_id  varchar NOT NULL REFERENCES vendor_discounts(id) ON DELETE CASCADE,
      listing_id   varchar NOT NULL REFERENCES vendor_listings(id)  ON DELETE CASCADE,
      PRIMARY KEY (discount_id, listing_id)
    );

    CREATE INDEX IF NOT EXISTS discount_listings_listing_idx
      ON discount_listings (listing_id);

    CREATE TABLE IF NOT EXISTS discount_redemptions (
      id           varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
      discount_id  varchar   NOT NULL REFERENCES vendor_discounts(id) ON DELETE CASCADE,
      booking_id   varchar   NOT NULL REFERENCES bookings(id)         ON DELETE CASCADE,
      redeemed_at  timestamp NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS discount_redemptions_discount_idx
      ON discount_redemptions (discount_id, redeemed_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_booking_unique_idx
      ON discount_redemptions (booking_id);

    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS applied_discount_id  varchar REFERENCES vendor_discounts(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS discount_amount_cents integer;
  `);

  console.log("[0048] vendor discount system tables and columns created.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE bookings
      DROP COLUMN IF EXISTS discount_amount_cents,
      DROP COLUMN IF EXISTS applied_discount_id;

    DROP TABLE IF EXISTS discount_redemptions;
    DROP TABLE IF EXISTS discount_listings;
    DROP TABLE IF EXISTS vendor_discounts;
  `);
}
