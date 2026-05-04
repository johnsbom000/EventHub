import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Apply the listing_status enum to vendor_listings.status.
 *
 * Background: listingStatusEnum was defined in shared/schema.ts but the column
 * was left as unconstrained text, allowing any string to be stored. This migration
 * creates the enum type (idempotent) and alters the column to enforce valid values.
 *
 * Safe to run against production:
 * - Backfills any non-conforming rows to 'draft' before the type cast.
 * - Uses DO block so the CREATE TYPE is idempotent.
 */
export async function up() {
  // 1. Create the enum type (no-op if it already exists from a prior schema push)
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE listing_status AS ENUM ('draft', 'pending', 'active', 'inactive', 'deleted');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 2. Backfill any non-conforming values before the cast (prevents ALTER failure)
  await db.execute(sql`
    UPDATE vendor_listings
    SET status = 'draft'
    WHERE status NOT IN ('draft', 'pending', 'active', 'inactive', 'deleted');
  `);

  // 3. Alter the column to the enum type
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ALTER COLUMN status TYPE listing_status
      USING status::listing_status;
  `);

  console.log("[0035] vendor_listings.status now enforced as listing_status enum.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ALTER COLUMN status TYPE text
      USING status::text;
  `);
  // The enum type is left in place — dropping it would require CASCADE and
  // risks breaking other references. Remove manually if truly needed.
}
