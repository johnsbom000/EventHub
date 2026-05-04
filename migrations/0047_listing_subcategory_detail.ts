import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Migration 0047 — Add subcategory_detail to vendor_listings
 *
 * Catering and Venues support two classification levels:
 *   subcategory        → the "type"   (e.g. "Full-Service Catering" / "Indoor")
 *   subcategory_detail → the "detail" (e.g. "Italian" cuisine / "Ballrooms" subtype)
 *
 * Rentals and Services remain single-level (subcategory_detail stays NULL).
 * Safe to run: uses IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_listings
    ADD COLUMN IF NOT EXISTS subcategory_detail text;
  `);
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_listings
    DROP COLUMN IF EXISTS subcategory_detail;
  `);
}
