import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table notifications
      add column if not exists archived boolean not null default false
  `);
}

export async function down() {
  await db.execute(sql`
    alter table notifications drop column if exists archived
  `);
}
