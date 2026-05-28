import { sql } from "drizzle-orm";
import { db } from "../server/db";

// Migration 0089 recorded as applied but its ALTER TABLE never landed in the
// current DB (likely a schema reset after the migration was marked done).
// Re-applies all 0089 founding vendor columns idempotently.
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      ADD COLUMN IF NOT EXISTS is_founding_vendor boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS founding_vendor_number integer,
      ADD COLUMN IF NOT EXISTS founding_benefit_bookings_used integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS founding_benefits_activated_at timestamp,
      ADD COLUMN IF NOT EXISTS referral_code varchar(20)
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_founding_vendor_number_unique_idx
    ON vendor_accounts (founding_vendor_number)
    WHERE founding_vendor_number IS NOT NULL
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_referral_code_unique_idx
    ON vendor_accounts (referral_code)
    WHERE referral_code IS NOT NULL
  `);

  console.log("[0101] backfilled missing founding vendor columns from migration 0089.");
}
