import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_accounts
    add column if not exists active_profile_id varchar;
  `);

  await db.execute(sql`
    alter table vendor_profiles
    add column if not exists profile_name text;
  `);

  await db.execute(sql`
    update vendor_profiles
    set profile_name = coalesce(nullif(profile_name, ''), 'Vendor Profile')
    where coalesce(nullif(profile_name, ''), '') = '';
  `);

  await db.execute(sql`
    alter table bookings
    add column if not exists vendor_profile_id varchar;
  `);

  await db.execute(sql`
    do $$
    declare c record;
    begin
      for c in
        select conname
        from pg_constraint
        where conrelid = 'vendor_profiles'::regclass
          and contype = 'u'
          and pg_get_constraintdef(oid) like '%(account_id)%'
      loop
        execute format('alter table vendor_profiles drop constraint %I', c.conname);
      end loop;
    end $$;
  `);

  await db.execute(sql`
    create index if not exists idx_vendor_profiles_account_id
    on vendor_profiles (account_id);
  `);

  await db.execute(sql`
    create index if not exists idx_vendor_listings_profile_id
    on vendor_listings (profile_id);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_vendor_profile_id
    on bookings (vendor_profile_id);
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'vendor_accounts_active_profile_id_fk'
      ) then
        alter table vendor_accounts
        add constraint vendor_accounts_active_profile_id_fk
        foreign key (active_profile_id)
        references vendor_profiles(id)
        on delete set null;
      end if;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'bookings_vendor_profile_id_fk'
      ) then
        alter table bookings
        add constraint bookings_vendor_profile_id_fk
        foreign key (vendor_profile_id)
        references vendor_profiles(id)
        on delete set null;
      end if;
    end $$;
  `);

  await db.execute(sql`
    update vendor_accounts va
    set active_profile_id = src.profile_id
    from (
      select distinct on (vp.account_id)
        vp.account_id,
        vp.id as profile_id
      from vendor_profiles vp
      order by vp.account_id, vp.created_at asc nulls last, vp.id asc
    ) src
    where va.id = src.account_id
      and (va.active_profile_id is null or va.active_profile_id = '');
  `);

  await db.execute(sql`
    update vendor_profiles vp
    set profile_name = coalesce(nullif(vp.profile_name, ''), nullif((vp.online_profiles ->> 'profileBusinessName'), ''), nullif(va.business_name, ''), 'Vendor Profile')
    from vendor_accounts va
    where va.id = vp.account_id;
  `);

  await db.execute(sql`
    update vendor_listings vl
    set profile_id = src.profile_id
    from (
      select distinct on (vp.account_id)
        vp.account_id,
        vp.id as profile_id
      from vendor_profiles vp
      order by vp.account_id, vp.created_at asc nulls last, vp.id asc
    ) src
    where vl.account_id = src.account_id
      and vl.profile_id is null;
  `);

  await db.execute(sql`
    update bookings b
    set vendor_profile_id = owner.profile_id
    from (
      select distinct on (bi.booking_id)
        bi.booking_id,
        vl.profile_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where vl.profile_id is not null
      order by bi.booking_id, vl.profile_id
    ) owner
    where b.id = owner.booking_id
      and b.vendor_profile_id is null;
  `);

  await db.execute(sql`
    update bookings b
    set vendor_profile_id = src.profile_id
    from (
      select distinct on (vp.account_id)
        vp.account_id,
        vp.id as profile_id
      from vendor_profiles vp
      order by vp.account_id, vp.created_at asc nulls last, vp.id asc
    ) src
    where b.vendor_profile_id is null
      and b.vendor_account_id = src.account_id;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
    drop constraint if exists bookings_vendor_profile_id_fk;
  `);

  await db.execute(sql`
    alter table vendor_accounts
    drop constraint if exists vendor_accounts_active_profile_id_fk;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_vendor_profile_id;
  `);

  await db.execute(sql`
    drop index if exists idx_vendor_listings_profile_id;
  `);

  await db.execute(sql`
    drop index if exists idx_vendor_profiles_account_id;
  `);

  await db.execute(sql`
    alter table bookings
    drop column if exists vendor_profile_id;
  `);

  await db.execute(sql`
    alter table vendor_profiles
    drop column if exists profile_name;
  `);

  await db.execute(sql`
    alter table vendor_accounts
    drop column if exists active_profile_id;
  `);
}
