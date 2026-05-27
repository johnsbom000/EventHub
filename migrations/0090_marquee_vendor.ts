import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // Rename founding vendor columns to marquee vendor
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN is_founding_vendor TO is_marquee_vendor
  `);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN founding_vendor_number TO marquee_vendor_number
  `);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN founding_benefit_bookings_used TO marquee_holiday_bookings_used
  `);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN founding_benefits_activated_at TO marquee_activated_at
  `);

  // Drop old index, recreate with new name
  await db.execute(sql`
    DROP INDEX IF EXISTS vendor_accounts_founding_vendor_number_unique_idx
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_marquee_vendor_number_unique_idx
    ON vendor_accounts (marquee_vendor_number)
    WHERE marquee_vendor_number IS NOT NULL
  `);

  // Add time-based expiry columns for each benefit window
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      ADD COLUMN IF NOT EXISTS marquee_holiday_ends_at timestamp,
      ADD COLUMN IF NOT EXISTS marquee_rate_ends_at timestamp,
      ADD COLUMN IF NOT EXISTS marquee_customer_fee_ends_at timestamp,
      ADD COLUMN IF NOT EXISTS marquee_visibility_ends_at timestamp,
      ADD COLUMN IF NOT EXISTS marquee_holiday_bonus_bookings integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS marquee_consecutive_inactive_months integer NOT NULL DEFAULT 0
  `);

  // Add 'rewarded' to vendor referral status enum
  await db.execute(sql`
    ALTER TYPE vendor_referral_status ADD VALUE IF NOT EXISTS 'rewarded'
  `);

  console.log("[0090] renamed founding → marquee columns and added benefit window timestamps.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      DROP COLUMN IF EXISTS marquee_consecutive_inactive_months,
      DROP COLUMN IF EXISTS marquee_holiday_bonus_bookings,
      DROP COLUMN IF EXISTS marquee_visibility_ends_at,
      DROP COLUMN IF EXISTS marquee_customer_fee_ends_at,
      DROP COLUMN IF EXISTS marquee_rate_ends_at,
      DROP COLUMN IF EXISTS marquee_holiday_ends_at
  `);

  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_marquee_vendor_number_unique_idx`);

  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN marquee_activated_at TO founding_benefits_activated_at
  `);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN marquee_holiday_bookings_used TO founding_benefit_bookings_used
  `);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN marquee_vendor_number TO founding_vendor_number
  `);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      RENAME COLUMN is_marquee_vendor TO is_founding_vendor
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_founding_vendor_number_unique_idx
    ON vendor_accounts (founding_vendor_number)
    WHERE founding_vendor_number IS NOT NULL
  `);
}
