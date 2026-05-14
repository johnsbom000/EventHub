import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Creates the listing_addon_links join table.
 *
 * This table represents the many-to-many relationship between parent listings
 * (any listing_type that can have add-ons attached) and add-on listings
 * (listing_type = 'addon').
 *
 * A vendor uses the "Attach Add-ons" step in the wizard to create these links.
 * The same add-on can be attached to multiple parent listings — and its quantity
 * pool is shared across all of them. The availability check for add-ons must
 * query booking_items by listing_id across ALL bookings (not filtered by parent).
 *
 * Cascade behavior:
 *   - If the parent listing is deleted → link row is deleted (ON DELETE CASCADE).
 *   - If the add-on listing is deleted → link row is deleted (ON DELETE CASCADE).
 *   - Neither cascade deletes the other listing — only the link record.
 *
 * Safe to run against production:
 *   - CREATE TABLE IF NOT EXISTS is idempotent.
 */
export async function up() {
  await db.execute(sql`
    create table if not exists listing_addon_links (
      id              varchar primary key default gen_random_uuid(),
      parent_listing_id varchar not null references vendor_listings(id) on delete cascade,
      addon_listing_id  varchar not null references vendor_listings(id) on delete cascade,
      created_at      timestamptz not null default now(),

      unique (parent_listing_id, addon_listing_id)
    );
  `);

  // Fast lookup: "which add-ons are attached to this parent listing?"
  await db.execute(sql`
    create index if not exists idx_addon_links_parent
      on listing_addon_links(parent_listing_id);
  `);

  // Fast lookup: "which parent listings use this add-on?" (for shared-quantity checks)
  await db.execute(sql`
    create index if not exists idx_addon_links_addon
      on listing_addon_links(addon_listing_id);
  `);

  console.log("[0064] listing_addon_links table created.");
}

export async function down() {
  await db.execute(sql`drop table if exists listing_addon_links;`);

  console.log("[0064] listing_addon_links table dropped.");
}
