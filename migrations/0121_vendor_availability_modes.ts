import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  // 1. Add shop_active boolean to vendor_accounts (default true = open)
  await db.execute(sql`
    alter table vendor_accounts
      add column if not exists shop_active boolean not null default true;
  `);

  // 2. Create vendor_vacation_blocks table
  await db.execute(sql`
    create table if not exists vendor_vacation_blocks (
      id          varchar primary key default gen_random_uuid(),
      vendor_id   varchar not null references vendor_accounts(id) on delete cascade,
      start_date  text not null,
      end_date    text not null,
      created_at  timestamp with time zone not null default now()
    );
  `);

  // 3. Index for fast lookups by vendor
  await db.execute(sql`
    create index if not exists idx_vendor_vacation_blocks_vendor_id
      on vendor_vacation_blocks (vendor_id);
  `);
}

export async function down() {
  await db.execute(sql`
    drop table if exists vendor_vacation_blocks;
  `);
  await db.execute(sql`
    alter table vendor_accounts
      drop column if exists shop_active;
  `);
}
