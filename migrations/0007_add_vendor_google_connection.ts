import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_accounts
      add column if not exists google_access_token text,
      add column if not exists google_refresh_token text,
      add column if not exists google_token_expires_at timestamp,
      add column if not exists google_calendar_id text,
      add column if not exists google_connection_status text default 'disconnected';
  `);

  await db.execute(sql`
    update vendor_accounts
    set google_connection_status = 'disconnected'
    where google_connection_status is null;
  `);

  await db.execute(sql`
    alter table vendor_accounts
    alter column google_connection_status set not null;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table vendor_accounts
      drop column if exists google_connection_status,
      drop column if exists google_calendar_id,
      drop column if exists google_token_expires_at,
      drop column if exists google_refresh_token,
      drop column if exists google_access_token;
  `);
}
