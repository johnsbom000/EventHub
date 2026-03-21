import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists booking_start_at timestamp,
      add column if not exists booking_end_at timestamp;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists booking_end_at,
      drop column if exists booking_start_at;
  `);
}
