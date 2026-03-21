import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_profiles
      add column if not exists active boolean not null default true;
  `);

  await db.execute(sql`
    alter table vendor_profiles
      add column if not exists deactivated_at timestamp;
  `);

  await db.execute(sql`
    update vendor_profiles
    set active = true
    where active is null;
  `);

  await db.execute(sql`
    alter table vendor_accounts
      add column if not exists deleted_at timestamp;
  `);

  await db.execute(sql`
    create index if not exists idx_vendor_profiles_account_active
    on vendor_profiles (account_id, active);
  `);
}

export async function down() {
  await db.execute(sql`
    drop index if exists idx_vendor_profiles_account_active;
  `);

  await db.execute(sql`
    alter table vendor_accounts
      drop column if exists deleted_at;
  `);

  await db.execute(sql`
    alter table vendor_profiles
      drop column if exists deactivated_at;
  `);

  await db.execute(sql`
    alter table vendor_profiles
      drop column if exists active;
  `);
}
