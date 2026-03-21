import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists listing_id varchar references vendor_listings(id),
      add column if not exists item_needed_by_time text,
      add column if not exists item_done_by_time text,
      add column if not exists listing_title_snapshot text,
      add column if not exists pricing_unit_snapshot text,
      add column if not exists unit_price_cents_snapshot integer,
      add column if not exists instant_book_snapshot boolean;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists instant_book_snapshot,
      drop column if exists unit_price_cents_snapshot,
      drop column if exists pricing_unit_snapshot,
      drop column if exists listing_title_snapshot,
      drop column if exists item_done_by_time,
      drop column if exists item_needed_by_time,
      drop column if exists listing_id;
  `);
}
