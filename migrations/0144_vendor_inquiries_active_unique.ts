import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   1. Replaces the full unique index on vendor_inquiries
//      (vendor_account_id, customer_id) with a PARTIAL unique index that only
//      applies to rows WHERE status = 'active'.
//
//      The full index (migration 0105) guarantees a 500 on re-inquiry: once an
//      inquiry converts to a booking (status = 'converted'), the customer can
//      never start a new inquiry with the same vendor — the insert hits the
//      unique index. The application invariant is "at most one ACTIVE inquiry
//      per (vendor, customer) pair", which the partial index encodes exactly.
//
//   2. Re-points the initial_listing_id foreign key to ON DELETE SET NULL, so
//      deleting a listing detaches the inquiry instead of blocking the delete
//      (the FK was created with the default NO ACTION).
//
// Defensive pre-step: if any (vendor, customer) pair somehow has multiple
// active rows (possible only on a DB missing the 0105 index), all but the
// newest are closed before the partial index is built.
//
// Idempotent: duplicate-collapse is a no-op on clean data; index create/drop
// use IF (NOT) EXISTS; the FK swap is guarded on the current delete rule.

export async function up() {
  // 1. Collapse duplicate ACTIVE pairs — keep the newest row per pair.
  await db.execute(sql`
    with ranked as (
      select id,
             row_number() over (
               partition by vendor_account_id, customer_id
               order by updated_at desc, created_at desc, id desc
             ) as rn
      from vendor_inquiries
      where status = 'active'
    )
    update vendor_inquiries vi
    set status = 'closed', updated_at = now()
    from ranked
    where vi.id = ranked.id
      and ranked.rn > 1;
  `);

  // 2. Swap the full unique index for the active-only partial unique index.
  await db.execute(sql`
    drop index if exists vendor_inquiries_vendor_customer_unique_idx;
  `);

  await db.execute(sql`
    create unique index if not exists vendor_inquiries_vendor_customer_active_unique_idx
      on vendor_inquiries (vendor_account_id, customer_id)
      where status = 'active';
  `);

  // 3. initial_listing_id FK -> ON DELETE SET NULL. The constraint name varies
  //    by environment (raw-SQL vs drizzle naming), so locate it by column.
  await db.execute(sql`
    do $$
    declare
      fk record;
    begin
      for fk in
        select con.conname
        from pg_constraint con
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum = any (con.conkey)
        where con.conrelid = 'vendor_inquiries'::regclass
          and con.contype = 'f'
          and con.confrelid = 'vendor_listings'::regclass
          and att.attname = 'initial_listing_id'
          and con.confdeltype <> 'n' -- 'n' = SET NULL; skip when already correct
      loop
        execute format('alter table vendor_inquiries drop constraint %I', fk.conname);
      end loop;

      if not exists (
        select 1
        from pg_constraint con
        join pg_attribute att
          on att.attrelid = con.conrelid
         and att.attnum = any (con.conkey)
        where con.conrelid = 'vendor_inquiries'::regclass
          and con.contype = 'f'
          and att.attname = 'initial_listing_id'
      ) then
        alter table vendor_inquiries
          add constraint vendor_inquiries_initial_listing_id_fkey
          foreign key (initial_listing_id)
          references vendor_listings(id)
          on delete set null;
      end if;
    end $$;
  `);

  console.log(
    "[0144] vendor_inquiries: partial unique (active-only) installed, " +
      "initial_listing_id FK is ON DELETE SET NULL."
  );
}

export async function down() {
  // Restoring the full unique index would fail on any pair with both an
  // active and a converted/closed row, so down only restores it when safe.
  await db.execute(sql`
    drop index if exists vendor_inquiries_vendor_customer_active_unique_idx;
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1
        from vendor_inquiries
        group by vendor_account_id, customer_id
        having count(*) > 1
      ) then
        create unique index if not exists vendor_inquiries_vendor_customer_unique_idx
          on vendor_inquiries (vendor_account_id, customer_id);
      end if;
    end $$;
  `);

  console.log("[0144] down: partial unique dropped; full unique restored only if data allows.");
}
