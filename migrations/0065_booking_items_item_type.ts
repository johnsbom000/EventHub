import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds item_type discriminator column to booking_items.
 *
 * New column: booking_items.item_type TEXT NOT NULL DEFAULT 'base'
 *   Values:
 *     'base'    — the primary listing or package selection (one per booking)
 *     'addon'   — an add-on line item (zero or more per booking)
 *
 * How booking_items rows are used per booking type:
 *
 *   Single listing booking:
 *     1x item_type='base', listingId = the listing
 *
 *   Package booking:
 *     1x item_type='base', listingId = the package_item child listing
 *     Nx item_type='addon', listingId = each selected addon listing
 *
 *   A-la-carte combined add-on booking (no parent listing):
 *     bookings.listingId = NULL
 *     bookings.listingTitleSnapshot = 'A-la-carte Bundle'
 *     Nx item_type='addon', listingId = each selected addon listing
 *
 * The item_type column enables:
 *   - Correct server-side price recomputation (sum addons separately)
 *   - Shared add-on quantity checks (query all booking_items where
 *     listingId = addon_id regardless of parent)
 *   - Clean display in booking receipts and confirmations
 *
 * Safe to run against production:
 *   - ADD COLUMN IF NOT EXISTS with a DEFAULT is instant in PostgreSQL.
 *   - All existing booking_items rows get 'base' — correct for current data
 *     since booking_items today only snapshot the primary listing.
 */
export async function up() {
  await db.execute(sql`
    alter table booking_items
      add column if not exists item_type text not null default 'base';
  `);

  // Index: fast aggregate queries for add-on availability checks
  await db.execute(sql`
    create index if not exists idx_booking_items_type_listing
      on booking_items(item_type, listing_id)
      where listing_id is not null;
  `);

  console.log("[0065] item_type column added to booking_items.");
}

export async function down() {
  await db.execute(sql`drop index if exists idx_booking_items_type_listing;`);

  await db.execute(sql`
    alter table booking_items drop column if exists item_type;
  `);

  console.log("[0065] item_type column removed from booking_items.");
}
