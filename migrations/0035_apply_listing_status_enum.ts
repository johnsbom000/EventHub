import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * NOTE: This file shares the 0035 prefix with 0035_drop_password_columns.ts.
 * Both run correctly because the migration runner tracks by full filename.
 * Alphabetical sort means this file (apply_listing_status_enum) runs BEFORE
 * 0035_drop_password_columns.ts — no dependency between them.
 * Future migrations must use strictly sequential numbers (0048, 0049, ...).
 *
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

  // 1b. Ensure 'deleted' exists in the enum — a prior schema push may have
  //     created listing_status without this value.
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TYPE listing_status ADD VALUE IF NOT EXISTS 'deleted';
    EXCEPTION WHEN others THEN NULL;
    END $$;
  `);

  // 2. Backfill any non-conforming values before the cast (prevents ALTER failure)
  await db.execute(sql`
    UPDATE vendor_listings
    SET status = 'draft'
    WHERE status NOT IN ('draft', 'pending', 'active', 'inactive', 'deleted');
  `);

  // 3. Drop the text DEFAULT first — PostgreSQL cannot auto-cast a text default
  //    to an enum type during ALTER COLUMN TYPE.
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ALTER COLUMN status DROP DEFAULT;
  `);

  // 4. Alter the column to the enum type
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ALTER COLUMN status TYPE listing_status
      USING status::listing_status;
  `);

  // 5. Restore the default using the enum literal
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ALTER COLUMN status SET DEFAULT 'draft'::listing_status;
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
