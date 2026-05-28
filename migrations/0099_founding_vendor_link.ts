import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // Add timing + bonus fields for the updated Founding Vendor program
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      ADD COLUMN IF NOT EXISTS founding_holiday_ends_at    timestamp,
      ADD COLUMN IF NOT EXISTS founding_rate_ends_at       timestamp,
      ADD COLUMN IF NOT EXISTS founding_visibility_ends_at timestamp,
      ADD COLUMN IF NOT EXISTS founding_referral_bonus_bookings_remaining integer NOT NULL DEFAULT 0
  `);

  // Global invite tokens — admin generates one and shares it publicly.
  // Any vendor who signs up via this token gets Founding Vendor status.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS founding_vendor_invites (
      id         serial      PRIMARY KEY,
      token      varchar(32) NOT NULL UNIQUE,
      active     boolean     NOT NULL DEFAULT true,
      created_at timestamp   NOT NULL DEFAULT now()
    )
  `);

  // Seed an initial token on first run
  await db.execute(sql`
    INSERT INTO founding_vendor_invites (token)
    SELECT replace(gen_random_uuid()::text, '-', '')
    WHERE NOT EXISTS (
      SELECT 1 FROM founding_vendor_invites WHERE active = true
    )
  `);

  console.log("[0099] added founding vendor timing/bonus fields and invite tokens table.");
}

export async function down() {
  await db.execute(sql`DROP TABLE IF EXISTS founding_vendor_invites`);
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      DROP COLUMN IF EXISTS founding_holiday_ends_at,
      DROP COLUMN IF EXISTS founding_rate_ends_at,
      DROP COLUMN IF EXISTS founding_visibility_ends_at,
      DROP COLUMN IF EXISTS founding_referral_bonus_bookings_remaining
  `);
}
