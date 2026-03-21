import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_listing_id_fkey;
  `);

  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_listing_id_fk;
  `);

  await db.execute(sql`
    alter table bookings
      add constraint bookings_listing_id_fk
      foreign key (listing_id)
      references vendor_listings(id)
      on delete set null;
  `);

  await db.execute(sql`
    alter table booking_items
      drop constraint if exists booking_items_listing_id_fkey;
  `);

  await db.execute(sql`
    alter table booking_items
      add constraint booking_items_listing_id_fkey
      foreign key (listing_id)
      references vendor_listings(id)
      on delete set null;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table booking_items
      drop constraint if exists booking_items_listing_id_fkey;
  `);

  await db.execute(sql`
    alter table booking_items
      add constraint booking_items_listing_id_fkey
      foreign key (listing_id)
      references vendor_listings(id);
  `);

  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_listing_id_fk;
  `);

  await db.execute(sql`
    alter table bookings
      add constraint bookings_listing_id_fkey
      foreign key (listing_id)
      references vendor_listings(id);
  `);
}
