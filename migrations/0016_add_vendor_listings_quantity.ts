import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists quantity integer;
  `);

  await db.execute(sql`
    update vendor_listings
    set quantity = case
      when coalesce(listing_data ->> 'quantity', '') ~ '^\s*[+-]?\d+(\.\d+)?\s*$' then
        least(2147483647, greatest(1, floor((listing_data ->> 'quantity')::numeric)))::int
      else 1
    end
    where quantity is null;
  `);

  await db.execute(sql`
    update vendor_listings
    set quantity = 1
    where quantity is null or quantity < 1;
  `);

  await db.execute(sql`
    alter table vendor_listings
      alter column quantity set default 1;
  `);

  await db.execute(sql`
    alter table vendor_listings
      alter column quantity set not null;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists quantity;
  `);
}
