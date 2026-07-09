import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Makes users.email uniqueness case-insensitive.
//
//   The original users_email_unique constraint is case-SENSITIVE, so
//   'User@x.com' and 'user@x.com' could coexist as two different accounts,
//   while every login path treats emails case-insensitively (auth lookups
//   already compare on lower(email)). One admin auto-provision path also
//   inserted the raw-cased Auth0 email (fixed in server/auth.ts alongside
//   this migration).
//
//   Steps:
//     1. GUARD: if any case-insensitive duplicate emails exist, ABORT loudly,
//        listing the addresses. Picking a survivor automatically could orphan
//        a real account's bookings/payments — dedup is a manual decision.
//        (Dev verified clean 2026-07-07; run the same query on prod before
//        deploying this wave.)
//     2. Normalize stored emails to lowercase.
//     3. Create a unique index on lower(email).
//     4. Drop the old case-sensitive users_email_unique constraint.
//
// Idempotent: the guard is a no-op on clean data, the UPDATE converges,
// CREATE INDEX / DROP CONSTRAINT use IF (NOT) EXISTS.

export async function up() {
  // 1. Fail loudly on case-insensitive duplicates.
  await db.execute(sql`
    do $$
    declare
      dupes text;
    begin
      select string_agg(email_ci || ' (' || n || ' rows)', ', ')
      into dupes
      from (
        select lower(email) as email_ci, count(*) as n
        from users
        where email is not null
        group by 1
        having count(*) > 1
      ) d;

      if dupes is not null then
        raise exception
          '[0148] Cannot enforce case-insensitive email uniqueness: duplicate emails exist and must be manually merged first: %. No rows were changed.',
          dupes;
      end if;
    end $$;
  `);

  // 2. Normalize stored casing so equality lookups and the display value agree.
  await db.execute(sql`
    update users
    set email = lower(email)
    where email is not null
      and email <> lower(email);
  `);

  // 3. Case-insensitive unique index.
  await db.execute(sql`
    create unique index if not exists users_email_ci_unique
      on users (lower(email));
  `);

  // 4. The old case-sensitive constraint is now redundant.
  await db.execute(sql`
    alter table users drop constraint if exists users_email_unique;
  `);

  console.log("[0148] users.email uniqueness is now case-insensitive (users_email_ci_unique).");
}

export async function down() {
  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conrelid = 'users'::regclass
          and conname = 'users_email_unique'
      ) then
        alter table users add constraint users_email_unique unique (email);
      end if;
    end $$;
  `);

  await db.execute(sql`
    drop index if exists users_email_ci_unique;
  `);

  console.log("[0148] down: restored case-sensitive users_email_unique.");
}
