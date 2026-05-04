import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add owner personal detail columns to vendor_accounts.
 *
 * Background: vendor onboarding only collected business information.
 * We need the owner's real name and personal phone so that:
 *   1. Vendors who book other vendors are identified by their personal
 *      name at checkout (not their business name).
 *   2. We have reliable personal contact info independent of Auth0,
 *      which only guarantees a name for Google OAuth signups.
 *
 * Columns are nullable — existing vendors are not forced to re-onboard.
 * They will be prompted to fill in these fields on their next onboarding
 * pass or through a future profile settings flow.
 *
 * Safe to run against production:
 *   - All three columns are added with ADD COLUMN IF NOT EXISTS.
 *   - No existing rows are modified.
 *   - No NOT NULL constraints are added.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      ADD COLUMN IF NOT EXISTS owner_first_name text,
      ADD COLUMN IF NOT EXISTS owner_last_name  text,
      ADD COLUMN IF NOT EXISTS owner_phone      text;
  `);

  console.log("[0042] vendor_accounts: owner_first_name, owner_last_name, owner_phone columns added.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      DROP COLUMN IF EXISTS owner_first_name,
      DROP COLUMN IF EXISTS owner_last_name,
      DROP COLUMN IF EXISTS owner_phone;
  `);
}
