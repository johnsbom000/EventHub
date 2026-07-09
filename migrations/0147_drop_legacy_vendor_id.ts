import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Drops the legacy `vendor_id` column from bookings, payments and
//   review_replies where it still exists.
//
//   `vendor_id` dates from the pre-`vendor_accounts` identity model
//   (migration 0001) and was created as REFERENCES vendor_accounts(id)
//   ON DELETE CASCADE. Nothing writes or reads it anymore (migrations
//   0129–0131 already made it nullable for that reason), but the CASCADE is a
//   booby-trap: any hard delete of a vendor_accounts row would silently
//   cascade-delete bookings/payments/review history. Dropping the column
//   drops the FK (and its CASCADE) with it.
//
//   Safety gate: if any row still has a non-NULL vendor_id, the migration
//   ABORTS with a clear error instead of destroying data — that would mean
//   some environment still populates the column and needs investigation.
//
//   Fresh databases created from shared/schema.ts never had the column
//   (dev verified 2026-07-07) — the existence guard makes this a no-op there.
//
// Idempotent: guarded on column existence; DROP COLUMN IF EXISTS.

const TABLES = ["bookings", "payments", "review_replies"] as const;

export async function up() {
  for (const table of TABLES) {
    await db.execute(
      sql.raw(`
        do $$
        declare
          populated bigint;
        begin
          if exists (
            select 1
            from information_schema.columns
            where table_name = '${table}'
              and column_name = 'vendor_id'
          ) then
            execute 'select count(*) from ${table} where vendor_id is not null'
              into populated;

            if populated > 0 then
              raise exception
                '[0147] Refusing to drop ${table}.vendor_id: % row(s) still have a non-NULL value. Investigate why this environment still populates the legacy column before re-running.',
                populated;
            end if;

            alter table ${table} drop column if exists vendor_id;
          end if;
        end $$;
      `)
    );
  }

  console.log(
    "[0147] Legacy vendor_id dropped (where present) from bookings, payments, review_replies."
  );
}

export async function down() {
  // Recreates the columns as plain nullable varchars WITHOUT the ON DELETE
  // CASCADE foreign key — reintroducing the cascade booby-trap on rollback
  // would be worse than the schema drift. Data is not restorable (it was
  // asserted all-NULL before the drop, so nothing is lost).
  for (const table of TABLES) {
    await db.execute(
      sql.raw(`alter table ${table} add column if not exists vendor_id varchar;`)
    );
  }

  console.log("[0147] down: vendor_id columns restored as nullable varchar (no FK).");
}
