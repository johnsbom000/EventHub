import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists review_prompt_sent boolean not null default false;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists review_prompt_sent;
  `);
}
