import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds dimension columns to vendor_listings.
 *
 * These columns store physical dimensions for Rental-category listings and
 * package_item child rows. Previously dimensions were buried in the listingData
 * jsonb blob — moving them to typed columns makes them queryable and explicit.
 *
 * New columns:
 *   dimension_unit   TEXT              — 'inches' | 'feet' | 'meters' | 'centimeters'
 *   dimension_width  DOUBLE PRECISION  — numeric value in the chosen unit
 *   dimension_length DOUBLE PRECISION
 *   dimension_height DOUBLE PRECISION
 *
 * All columns are nullable. Non-rental listings simply leave them NULL.
 * No backfill needed — existing rows get NULL, which is the correct default.
 *
 * Safe to run against production:
 *   ADD COLUMN IF NOT EXISTS with no NOT NULL constraint is instant in PostgreSQL.
 */
export async function up() {
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists dimension_unit   text,
      add column if not exists dimension_width  double precision,
      add column if not exists dimension_length double precision,
      add column if not exists dimension_height double precision;
  `);

  console.log("[0066] dimension_unit, dimension_width, dimension_length, dimension_height added to vendor_listings.");
}

export async function down() {
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists dimension_unit,
      drop column if exists dimension_width,
      drop column if exists dimension_length,
      drop column if exists dimension_height;
  `);

  console.log("[0066] Dimension columns removed from vendor_listings.");
}
