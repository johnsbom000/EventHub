import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds listing type discrimination and parent-child architecture to vendor_listings.
 *
 * New columns on vendor_listings:
 *   - listing_type TEXT NOT NULL DEFAULT 'single'
 *       Values: 'single' | 'package_container' | 'package_item' | 'addon'
 *       All existing rows get 'single' — zero data changes to current listings.
 *   - parent_listing_id VARCHAR REFERENCES vendor_listings(id) ON DELETE CASCADE
 *       NULL for top-level listings. Set on package_item and addon child rows.
 *   - package_availability_mode TEXT
 *       'dependent' | 'independent'. Only meaningful on package_container rows.
 *       NULL on single and addon listings.
 *   - service_area_override BOOLEAN NOT NULL DEFAULT false
 *       When true on a package_item, use the item's own service area fields
 *       rather than inheriting from the parent container.
 *   - sort_order INTEGER NOT NULL DEFAULT 0
 *       Display ordering for package_item children under a container.
 *
 * BROWSE SAFETY:
 *   After this migration, all browse/search queries MUST filter:
 *     WHERE listing_type NOT IN ('package_item', 'addon')
 *   Failure to do so would expose child rows in browse results.
 *   Indexes below support this filter efficiently.
 *
 * Safe to run against production:
 *   - ADD COLUMN IF NOT EXISTS is instant in PostgreSQL.
 *   - Default values on new columns require no backfill.
 *   - Self-referential FK is safe on an existing table.
 */
export async function up() {
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists listing_type text not null default 'single',
      add column if not exists parent_listing_id varchar references vendor_listings(id) on delete cascade,
      add column if not exists package_availability_mode text,
      add column if not exists service_area_override boolean not null default false,
      add column if not exists sort_order integer not null default 0;
  `);

  // Index: fast lookup of all child rows by parent (package tabs, addon catalog)
  await db.execute(sql`
    create index if not exists idx_vendor_listings_parent_id
      on vendor_listings(parent_listing_id)
      where parent_listing_id is not null;
  `);

  // Index: browse/search filter — only top-level bookable listings
  await db.execute(sql`
    create index if not exists idx_vendor_listings_type
      on vendor_listings(listing_type);
  `);

  console.log("[0063] listing_type, parent_listing_id, package_availability_mode, service_area_override, sort_order added to vendor_listings.");
}

export async function down() {
  await db.execute(sql`drop index if exists idx_vendor_listings_parent_id;`);
  await db.execute(sql`drop index if exists idx_vendor_listings_type;`);

  await db.execute(sql`
    alter table vendor_listings
      drop column if exists listing_type,
      drop column if exists parent_listing_id,
      drop column if exists package_availability_mode,
      drop column if exists service_area_override,
      drop column if exists sort_order;
  `);

  console.log("[0063] Reverted listing_type columns from vendor_listings.");
}
