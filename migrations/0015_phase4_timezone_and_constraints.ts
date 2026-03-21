import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_profiles
      add column if not exists operating_timezone text;
  `);

  await db.execute(sql`
    update vendor_profiles
    set operating_timezone = 'UTC'
    where operating_timezone is null or btrim(operating_timezone) = '';
  `);

  await db.execute(sql`
    alter table vendor_profiles
      alter column operating_timezone set default 'UTC';
  `);

  await db.execute(sql`
    alter table vendor_profiles
      alter column operating_timezone set not null;
  `);

  await db.execute(sql`
    alter table bookings
      add column if not exists vendor_timezone_snapshot text;
  `);

  await db.execute(sql`
    update bookings b
    set vendor_timezone_snapshot = source.operating_timezone
    from (
      select
        b2.id as booking_id,
        coalesce(
          nullif(vp.operating_timezone, ''),
          nullif(vl_profile.operating_timezone, ''),
          'UTC'
        ) as operating_timezone
      from bookings b2
      left join vendor_profiles vp on vp.id = b2.vendor_profile_id
      left join vendor_listings vl on vl.id = b2.listing_id
      left join vendor_profiles vl_profile on vl_profile.id = vl.profile_id
    ) source
    where b.id = source.booking_id
      and (b.vendor_timezone_snapshot is null or btrim(b.vendor_timezone_snapshot) = '');
  `);

  await db.execute(sql`
    alter table bookings
      alter column vendor_timezone_snapshot set default 'UTC';
  `);

  await db.execute(sql`
    update bookings
    set vendor_timezone_snapshot = 'UTC'
    where vendor_timezone_snapshot is null or btrim(vendor_timezone_snapshot) = '';
  `);

  await db.execute(sql`
    alter table bookings
      alter column google_sync_status set default 'pending';
  `);

  await db.execute(sql`
    update bookings
    set google_sync_status = 'pending'
    where google_sync_status is null or btrim(google_sync_status) = '';
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_vendor_timezone_snapshot
    on bookings (vendor_timezone_snapshot);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_listing_window_active
    on bookings (listing_id, booking_start_at, booking_end_at)
    where listing_id is not null and status <> 'cancelled';
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_vendor_account_window
    on bookings (vendor_account_id, booking_start_at, booking_end_at)
    where vendor_account_id is not null and booking_start_at is not null and booking_end_at is not null;
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'bookings_time_window_positive_check'
      ) then
        alter table bookings
        add constraint bookings_time_window_positive_check
        check (
          booking_start_at is null
          or booking_end_at is null
          or booking_end_at > booking_start_at
        )
        not valid;
      end if;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'bookings_pricing_unit_snapshot_check'
      ) then
        alter table bookings
        add constraint bookings_pricing_unit_snapshot_check
        check (
          pricing_unit_snapshot is null
          or pricing_unit_snapshot in ('per_day', 'per_hour')
        )
        not valid;
      end if;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'bookings_vendor_timezone_snapshot_not_blank_check'
      ) then
        alter table bookings
        add constraint bookings_vendor_timezone_snapshot_not_blank_check
        check (
          vendor_timezone_snapshot is null
          or btrim(vendor_timezone_snapshot) <> ''
        )
        not valid;
      end if;
    end $$;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_vendor_timezone_snapshot_not_blank_check;
  `);

  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_pricing_unit_snapshot_check;
  `);

  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_time_window_positive_check;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_vendor_timezone_snapshot;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_vendor_account_window;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_listing_window_active;
  `);

  await db.execute(sql`
    alter table bookings
      alter column google_sync_status drop default;
  `);

  await db.execute(sql`
    alter table bookings
      drop column if exists vendor_timezone_snapshot;
  `);

  await db.execute(sql`
    alter table vendor_profiles
      drop column if exists operating_timezone;
  `);
}
