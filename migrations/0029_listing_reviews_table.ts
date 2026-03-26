import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    create table if not exists listing_reviews (
      id varchar primary key default gen_random_uuid()::varchar,
      listing_id varchar not null references vendor_listings(id) on delete cascade,
      booking_id varchar references bookings(id) on delete set null,
      vendor_account_id varchar references vendor_accounts(id) on delete set null,
      user_id varchar references users(id) on delete set null,
      rating integer not null check (rating between 1 and 5),
      title text,
      body text not null,
      is_published boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists idx_listing_reviews_listing_id
      on listing_reviews (listing_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists idx_listing_reviews_vendor_account_id
      on listing_reviews (vendor_account_id);
  `);

  await db.execute(sql`
    create unique index if not exists listing_reviews_booking_id_unique_idx
      on listing_reviews (booking_id) where booking_id is not null;
  `);
}

export async function down() {
  await db.execute(sql`
    drop index if exists listing_reviews_booking_id_unique_idx;
  `);

  await db.execute(sql`
    drop index if exists idx_listing_reviews_vendor_account_id;
  `);

  await db.execute(sql`
    drop index if exists idx_listing_reviews_listing_id;
  `);

  await db.execute(sql`
    drop table if exists listing_reviews;
  `);
}
