import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists whats_not_included text[] not null default '{}'::text[];
  `);
}

export async function down() {
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists whats_not_included;
  `);
}
