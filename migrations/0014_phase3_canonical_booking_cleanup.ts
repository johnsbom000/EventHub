import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists vendor_account_id varchar,
      add column if not exists vendor_profile_id varchar,
      add column if not exists listing_id varchar,
      add column if not exists booking_start_at timestamp,
      add column if not exists booking_end_at timestamp,
      add column if not exists listing_title_snapshot text,
      add column if not exists pricing_unit_snapshot text,
      add column if not exists unit_price_cents_snapshot integer,
      add column if not exists instant_book_snapshot boolean,
      add column if not exists google_event_id text,
      add column if not exists google_calendar_id text,
      add column if not exists google_sync_status text,
      add column if not exists google_last_synced_at timestamp,
      add column if not exists google_sync_error text;
  `);

  await db.execute(sql`
    create table if not exists booking_items (
      id varchar primary key default gen_random_uuid(),
      booking_id varchar not null references bookings(id) on delete cascade,
      listing_id varchar references vendor_listings(id) on delete set null,
      title text,
      quantity integer not null default 1,
      unit_price_cents integer not null default 0,
      total_price_cents integer not null default 0,
      item_data jsonb not null default '{}'::jsonb,
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    );
  `);

  await db.execute(sql`
    create table if not exists google_calendar_event_mappings (
      id varchar primary key default gen_random_uuid(),
      vendor_account_id varchar not null references vendor_accounts(id) on delete cascade,
      google_event_id text not null,
      google_calendar_id text not null,
      listing_id varchar not null references vendor_listings(id) on delete cascade,
      mapping_source text not null default 'manual',
      mapping_status text not null default 'reviewed',
      created_at timestamp not null default now(),
      updated_at timestamp not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists google_calendar_event_mappings_vendor_calendar_event_idx
    on google_calendar_event_mappings (vendor_account_id, google_calendar_id, google_event_id);
  `);

  await db.execute(sql`
    create index if not exists idx_google_calendar_event_mappings_listing_id
    on google_calendar_event_mappings (listing_id);
  `);

  await db.execute(sql`
    create index if not exists idx_booking_items_booking_id
    on booking_items (booking_id);
  `);

  await db.execute(sql`
    create index if not exists idx_booking_items_listing_id
    on booking_items (listing_id);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_vendor_account_created
    on bookings (vendor_account_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_vendor_profile_created
    on bookings (vendor_profile_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_listing_time_window
    on bookings (listing_id, booking_start_at, booking_end_at);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_google_sync_status
    on bookings (google_sync_status);
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'bookings_vendor_account_id_fk'
      ) then
        alter table bookings
        add constraint bookings_vendor_account_id_fk
        foreign key (vendor_account_id)
        references vendor_accounts(id)
        on delete set null;
      end if;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'bookings_listing_id_fk'
      ) then
        alter table bookings
        add constraint bookings_listing_id_fk
        foreign key (listing_id)
        references vendor_listings(id)
        on delete set null;
      end if;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'vendor_id'
      ) then
        execute $q$
          update bookings
          set vendor_account_id = vendor_id
          where vendor_account_id is null
            and vendor_id is not null
        $q$;
      end if;
    end $$;
  `);

  await db.execute(sql`
    update bookings b
    set listing_id = src.listing_id
    from (
      select
        bi.booking_id,
        min(bi.listing_id) as listing_id
      from booking_items bi
      where bi.listing_id is not null
      group by bi.booking_id
      having count(distinct bi.listing_id) = 1
    ) src
    where b.id = src.booking_id
      and b.listing_id is null;
  `);

  await db.execute(sql`
    update bookings b
    set vendor_account_id = vl.account_id
    from vendor_listings vl
    where b.vendor_account_id is null
      and b.listing_id = vl.id
      and vl.account_id is not null;
  `);

  await db.execute(sql`
    update bookings b
    set vendor_account_id = src.account_id
    from (
      select
        bi.booking_id,
        min(vl.account_id) as account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where vl.account_id is not null
      group by bi.booking_id
      having count(distinct vl.account_id) = 1
    ) src
    where b.id = src.booking_id
      and b.vendor_account_id is null;
  `);

  await db.execute(sql`
    update bookings b
    set vendor_profile_id = vl.profile_id
    from vendor_listings vl
    where b.vendor_profile_id is null
      and b.listing_id = vl.id
      and vl.profile_id is not null;
  `);

  await db.execute(sql`
    update bookings b
    set vendor_profile_id = src.profile_id
    from (
      select
        bi.booking_id,
        min(vl.profile_id) as profile_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where vl.profile_id is not null
      group by bi.booking_id
      having count(distinct vl.profile_id) = 1
    ) src
    where b.id = src.booking_id
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

  await db.execute(sql`
    update bookings b
    set listing_title_snapshot = src.listing_title
    from (
      select
        b2.id as booking_id,
        coalesce(
          nullif(trim(vl.title), ''),
          nullif(trim(bi.title), ''),
          nullif(trim(bi.item_data->>'listingTitle'), '')
        ) as listing_title
      from bookings b2
      left join vendor_listings vl on vl.id = b2.listing_id
      left join lateral (
        select
          bi.title,
          bi.item_data
        from booking_items bi
        where bi.booking_id = b2.id
        order by bi.id asc
        limit 1
      ) bi on true
    ) src
    where b.id = src.booking_id
      and (b.listing_title_snapshot is null or btrim(b.listing_title_snapshot) = '')
      and src.listing_title is not null;
  `);

  await db.execute(sql`
    update bookings b
    set pricing_unit_snapshot = src.pricing_unit
    from (
      select
        b2.id as booking_id,
        coalesce(
          nullif(lower(trim(vl.pricing_unit)), ''),
          case
            when lower(coalesce(vl.listing_data->>'pricingUnit', vl.listing_data->'pricing'->>'unit', '')) in ('per_day', 'per_hour')
              then lower(coalesce(vl.listing_data->>'pricingUnit', vl.listing_data->'pricing'->>'unit'))
            else null
          end,
          'per_day'
        ) as pricing_unit
      from bookings b2
      left join vendor_listings vl on vl.id = b2.listing_id
    ) src
    where b.id = src.booking_id
      and b.pricing_unit_snapshot is null
      and src.pricing_unit is not null;
  `);

  await db.execute(sql`
    update bookings b
    set unit_price_cents_snapshot = src.unit_price_cents
    from (
      select
        b2.id as booking_id,
        coalesce(
          vl.price_cents,
          bi.unit_price_cents,
          case
            when bi.quantity is not null and bi.quantity > 0 and bi.total_price_cents is not null
              then (bi.total_price_cents / bi.quantity)
            else null
          end
        ) as unit_price_cents
      from bookings b2
      left join vendor_listings vl on vl.id = b2.listing_id
      left join lateral (
        select
          bi.unit_price_cents,
          bi.total_price_cents,
          bi.quantity
        from booking_items bi
        where bi.booking_id = b2.id
        order by bi.id asc
        limit 1
      ) bi on true
    ) src
    where b.id = src.booking_id
      and b.unit_price_cents_snapshot is null
      and src.unit_price_cents is not null;
  `);

  await db.execute(sql`
    update bookings b
    set instant_book_snapshot = src.instant_book_enabled
    from (
      select
        b2.id as booking_id,
        vl.instant_book_enabled
      from bookings b2
      left join vendor_listings vl on vl.id = b2.listing_id
    ) src
    where b.id = src.booking_id
      and b.instant_book_snapshot is null
      and src.instant_book_enabled is not null;
  `);

  await db.execute(sql`
    update bookings
    set google_sync_status = 'pending'
    where google_sync_status is null
       or btrim(google_sync_status) = '';
  `);

  await db.execute(sql`
    update bookings b
    set
      booking_start_at = to_date(b.event_date, 'YYYY-MM-DD')::timestamp
        + make_interval(
          hours => split_part(b.event_start_time, ':', 1)::int,
          mins => split_part(b.event_start_time, ':', 2)::int
        ),
      booking_end_at = to_date(b.event_date, 'YYYY-MM-DD')::timestamp
        + make_interval(
          hours => split_part(b.event_end_time, ':', 1)::int,
          mins => split_part(b.event_end_time, ':', 2)::int
        )
    where b.booking_start_at is null
      and b.booking_end_at is null
      and coalesce(lower(b.pricing_unit_snapshot), 'per_day') = 'per_hour'
      and to_char(to_date(b.event_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = b.event_date
      and b.event_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and b.event_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and b.event_end_time > b.event_start_time;
  `);

  await db.execute(sql`
    update bookings b
    set
      booking_start_at = to_date(b.event_date, 'YYYY-MM-DD')::timestamp
        + make_interval(
          hours => split_part(b.item_needed_by_time, ':', 1)::int,
          mins => split_part(b.item_needed_by_time, ':', 2)::int
        ),
      booking_end_at = to_date(b.event_date, 'YYYY-MM-DD')::timestamp
        + make_interval(
          hours => split_part(b.item_done_by_time, ':', 1)::int,
          mins => split_part(b.item_done_by_time, ':', 2)::int
        )
    where b.booking_start_at is null
      and b.booking_end_at is null
      and coalesce(lower(b.pricing_unit_snapshot), 'per_day') = 'per_day'
      and to_char(to_date(b.event_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = b.event_date
      and b.item_needed_by_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and b.item_done_by_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and b.item_done_by_time > b.item_needed_by_time;
  `);

  await db.execute(sql`
    update bookings b
    set
      booking_start_at = to_date(b.event_date, 'YYYY-MM-DD')::timestamp
        + make_interval(
          hours => split_part(b.event_start_time, ':', 1)::int,
          mins => split_part(b.event_start_time, ':', 2)::int
        ),
      booking_end_at = to_date(b.event_date, 'YYYY-MM-DD')::timestamp
        + make_interval(
          hours => split_part(b.event_end_time, ':', 1)::int,
          mins => split_part(b.event_end_time, ':', 2)::int
        )
    where b.booking_start_at is null
      and b.booking_end_at is null
      and coalesce(lower(b.pricing_unit_snapshot), 'per_day') = 'per_day'
      and to_char(to_date(b.event_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = b.event_date
      and b.event_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and b.event_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and b.event_end_time > b.event_start_time;
  `);

  await db.execute(sql`
    update bookings b
    set
      booking_start_at = to_date(b.event_date, 'YYYY-MM-DD')::timestamp,
      booking_end_at = (to_date(b.event_date, 'YYYY-MM-DD')::timestamp + interval '1 day')
    where b.booking_start_at is null
      and b.booking_end_at is null
      and to_char(to_date(b.event_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = b.event_date;
  `);
}

export async function down() {
  // Phase 3 migration is mostly additive/backfill and intentionally non-destructive on rollback.
}
