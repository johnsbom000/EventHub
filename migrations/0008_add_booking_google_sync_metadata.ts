import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists google_event_id text,
      add column if not exists google_calendar_id text,
      add column if not exists google_sync_status text,
      add column if not exists google_last_synced_at timestamp,
      add column if not exists google_sync_error text;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists google_sync_error,
      drop column if exists google_last_synced_at,
      drop column if exists google_sync_status,
      drop column if exists google_calendar_id,
      drop column if exists google_event_id;
  `);
}
