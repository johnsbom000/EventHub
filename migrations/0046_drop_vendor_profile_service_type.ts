import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drop vendor_profiles.service_type
 *
 * Listing categories (Rentals, Services, Venues, Catering) are now chosen
 * per listing in the create-listing wizard and stored on vendor_listings.category.
 * Collecting a vendor-level service type during onboarding was redundant and
 * has been removed from the application code.
 *
 * Safe to run against production:
 *  - ALTER TABLE … DROP COLUMN is transactional in PostgreSQL.
 *  - No other tables reference this column.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS service_type;
  `);

  console.log("[0046] Dropped vendor_profiles.service_type.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_profiles
      ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'unspecified';
  `);

  console.log("[0046] Restored vendor_profiles.service_type (filled with 'unspecified').");
}
