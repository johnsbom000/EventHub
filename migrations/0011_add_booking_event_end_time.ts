import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists event_end_time text;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists event_end_time;
  `);
}
