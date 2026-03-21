import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    create table if not exists google_calendar_event_mappings (
      id varchar primary key default gen_random_uuid(),
      vendor_account_id varchar not null references vendor_accounts(id) on delete cascade,
      google_event_id text not null,
      google_calendar_id text not null,
      listing_id varchar not null references vendor_listings(id) on delete cascade,
      mapping_source text not null default 'manual',
      mapping_status text not null default 'reviewed',
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists google_calendar_event_mappings_vendor_calendar_event_idx
    on google_calendar_event_mappings (vendor_account_id, google_calendar_id, google_event_id);
  `);
}

export async function down() {
  await db.execute(sql`
    drop table if exists google_calendar_event_mappings;
  `);
}
