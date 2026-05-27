import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // Add founding vendor fields to vendor_accounts
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      ADD COLUMN IF NOT EXISTS is_founding_vendor boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS founding_vendor_number integer,
      ADD COLUMN IF NOT EXISTS founding_benefit_bookings_used integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS founding_benefits_activated_at timestamp,
      ADD COLUMN IF NOT EXISTS referral_code varchar(20)
  `);

  // Unique partial index: no two founding vendors share the same slot number
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_founding_vendor_number_unique_idx
    ON vendor_accounts (founding_vendor_number)
    WHERE founding_vendor_number IS NOT NULL
  `);

  // Unique index on referral_code
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_referral_code_unique_idx
    ON vendor_accounts (referral_code)
    WHERE referral_code IS NOT NULL
  `);

  // Create enum type for referral status (migration 0090 will add 'rewarded')
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE vendor_referral_status AS ENUM ('pending', 'completed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `);

  // Vendor referrals table for tracking vendor-to-vendor referrals
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_referrals (
      id serial PRIMARY KEY,
      referrer_vendor_id varchar NOT NULL REFERENCES vendor_accounts(id),
      referred_vendor_id varchar NOT NULL REFERENCES vendor_accounts(id),
      status vendor_referral_status NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT now(),
      completed_at timestamp
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_referrals_referrer_idx ON vendor_referrals (referrer_vendor_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS vendor_referrals_referred_idx ON vendor_referrals (referred_vendor_id)
  `);

  console.log("[0089] added founding vendor fields and vendor_referrals table.");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS vendor_referrals`);
  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_referral_code_unique_idx`);
  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_founding_vendor_number_unique_idx`);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      DROP COLUMN IF EXISTS is_founding_vendor,
      DROP COLUMN IF EXISTS founding_vendor_number,
      DROP COLUMN IF EXISTS founding_benefit_bookings_used,
      DROP COLUMN IF EXISTS founding_benefits_activated_at,
      DROP COLUMN IF EXISTS referral_code
  `);
}
