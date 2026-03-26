import { sql } from "drizzle-orm";

import { db } from "../server/db";

const PRE_REPAIR_RUN_LABEL = "0025_pre_repair";
const POST_REPAIR_RUN_LABEL = "0025_post_repair";

export async function up() {
  // Ensure source-of-truth external identity column exists.
  await db.execute(sql`
    alter table users
      add column if not exists auth0_sub text;
  `);

  // Persistent audit report for duplicate/conflict detection and repair traceability.
  await db.execute(sql`
    create table if not exists vendor_identity_hardening_reports (
      id bigserial primary key,
      run_label text not null,
      issue_type text not null,
      issue_key text not null,
      account_ids text[] not null default '{}'::text[],
      user_ids text[] not null default '{}'::text[],
      auth0_subs text[] not null default '{}'::text[],
      emails text[] not null default '{}'::text[],
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists idx_vendor_identity_hardening_reports_run_label
      on vendor_identity_hardening_reports (run_label, issue_type, created_at desc);
  `);

  await db.execute(sql`
    delete from vendor_identity_hardening_reports
    where run_label in (${PRE_REPAIR_RUN_LABEL}, ${POST_REPAIR_RUN_LABEL});
  `);

  // -------------------------
  // Backfill (unambiguous only)
  // -------------------------

  // Link vendor_accounts.user_id from email when no conflicting active ownership exists.
  await db.execute(sql`
    update vendor_accounts va
    set user_id = u.id
    from users u
    where va.deleted_at is null
      and va.user_id is null
      and lower(va.email) = lower(u.email)
      and not exists (
        select 1
        from vendor_accounts other
        where other.id <> va.id
          and other.deleted_at is null
          and other.user_id = u.id
      );
  `);

  // Backfill users.auth0_sub from linked vendor accounts when mapping is unique.
  await db.execute(sql`
    update users u
    set auth0_sub = src.auth0_sub
    from (
      select
        va.user_id,
        max(va.auth0_sub) as auth0_sub
      from vendor_accounts va
      where va.deleted_at is null
        and va.user_id is not null
        and nullif(btrim(va.auth0_sub), '') is not null
      group by va.user_id
      having count(distinct va.auth0_sub) = 1
    ) src
    where u.id = src.user_id
      and nullif(btrim(u.auth0_sub), '') is null
      and not exists (
        select 1
        from users other
        where other.id <> u.id
          and other.auth0_sub = src.auth0_sub
      );
  `);

  // Link vendor_accounts.user_id from auth0_sub when available and non-conflicting.
  await db.execute(sql`
    update vendor_accounts va
    set user_id = u.id
    from users u
    where va.deleted_at is null
      and va.user_id is null
      and nullif(btrim(va.auth0_sub), '') is not null
      and u.auth0_sub = va.auth0_sub
      and not exists (
        select 1
        from vendor_accounts other
        where other.id <> va.id
          and other.deleted_at is null
          and other.user_id = u.id
      );
  `);

  // Backfill vendor_accounts.auth0_sub from linked user rows when non-conflicting.
  await db.execute(sql`
    update vendor_accounts va
    set auth0_sub = u.auth0_sub
    from users u
    where va.deleted_at is null
      and va.user_id = u.id
      and nullif(btrim(va.auth0_sub), '') is null
      and nullif(btrim(u.auth0_sub), '') is not null
      and not exists (
        select 1
        from vendor_accounts other
        where other.id <> va.id
          and other.deleted_at is null
          and other.auth0_sub = u.auth0_sub
      );
  `);

  // Backfill users.auth0_sub from vendor email fallback when unambiguous.
  await db.execute(sql`
    update users u
    set auth0_sub = src.auth0_sub
    from (
      select
        lower(va.email) as email_key,
        max(va.auth0_sub) as auth0_sub
      from vendor_accounts va
      where va.deleted_at is null
        and nullif(btrim(va.auth0_sub), '') is not null
      group by lower(va.email)
      having count(distinct va.auth0_sub) = 1
    ) src
    where lower(u.email) = src.email_key
      and nullif(btrim(u.auth0_sub), '') is null
      and not exists (
        select 1
        from users other
        where other.id <> u.id
          and other.auth0_sub = src.auth0_sub
      );
  `);

  // -------------------------
  // Pre-repair detection report
  // -------------------------

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      account_ids,
      user_ids,
      auth0_subs,
      emails,
      details
    )
    select
      ${PRE_REPAIR_RUN_LABEL},
      'duplicate_vendor_accounts_by_user_id',
      va.user_id,
      array_agg(va.id order by va.created_at asc nulls last, va.id asc),
      array_agg(distinct va.user_id),
      array_remove(array_agg(distinct nullif(btrim(va.auth0_sub), '')), null),
      array_agg(va.email order by va.created_at asc nulls last, va.id asc),
      jsonb_build_object(
        'accountCount',
        count(*),
        'activeCount',
        count(*) filter (where coalesce(va.active, true))
      )
    from vendor_accounts va
    where va.deleted_at is null
      and va.user_id is not null
    group by va.user_id
    having count(*) > 1;
  `);

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      account_ids,
      user_ids,
      auth0_subs,
      emails,
      details
    )
    select
      ${PRE_REPAIR_RUN_LABEL},
      'duplicate_vendor_accounts_by_auth0_sub',
      va.auth0_sub,
      array_agg(va.id order by va.created_at asc nulls last, va.id asc),
      array_remove(array_agg(distinct va.user_id), null),
      array_agg(distinct va.auth0_sub),
      array_agg(va.email order by va.created_at asc nulls last, va.id asc),
      jsonb_build_object(
        'accountCount',
        count(*),
        'activeCount',
        count(*) filter (where coalesce(va.active, true))
      )
    from vendor_accounts va
    where va.deleted_at is null
      and nullif(btrim(va.auth0_sub), '') is not null
    group by va.auth0_sub
    having count(*) > 1;
  `);

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      user_ids,
      auth0_subs,
      emails,
      details
    )
    select
      ${PRE_REPAIR_RUN_LABEL},
      'duplicate_users_by_auth0_sub',
      u.auth0_sub,
      array_agg(u.id order by u.created_at asc nulls last, u.id asc),
      array_agg(distinct u.auth0_sub),
      array_agg(u.email order by u.created_at asc nulls last, u.id asc),
      jsonb_build_object('userCount', count(*))
    from users u
    where nullif(btrim(u.auth0_sub), '') is not null
    group by u.auth0_sub
    having count(*) > 1;
  `);

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      account_ids,
      user_ids,
      emails,
      details
    )
    select
      ${PRE_REPAIR_RUN_LABEL},
      'suspicious_email_linked_duplicates',
      lower(va.email),
      array_agg(va.id order by va.created_at asc nulls last, va.id asc),
      array_remove(array_agg(distinct va.user_id), null),
      array_agg(va.email order by va.created_at asc nulls last, va.id asc),
      jsonb_build_object(
        'accountCount',
        count(*),
        'distinctUserCount',
        count(distinct va.user_id)
      )
    from vendor_accounts va
    where va.deleted_at is null
    group by lower(va.email)
    having count(*) > 1;
  `);

  // -------------------------
  // Deterministic duplicate repair for vendor_accounts
  // -------------------------
  // Canonical account pick rule:
  // 1) highest active business usage score (bookings/payments/listings/profiles)
  // 2) stripe connection present
  // 3) active account flag
  // 4) oldest created_at
  // 5) stable id tie-breaker
  await db.execute(sql`
    do $$
    declare
      chain_updates integer := 0;
    begin
      create temporary table if not exists tmp_vendor_account_merge_map (
        duplicate_account_id varchar primary key,
        canonical_account_id varchar not null,
        reason text not null
      ) on commit drop;

      with account_activity as (
        select
          va.id,
          va.user_id,
          va.auth0_sub,
          va.created_at,
          coalesce(va.active, true) as active_flag,
          case when nullif(btrim(va.stripe_connect_id), '') is not null then 1 else 0 end as has_stripe,
          (select count(*) from vendor_profiles vp where vp.account_id = va.id) as profile_count,
          (select count(*) from vendor_listings vl where vl.account_id = va.id) as listing_count,
          (select count(*) from bookings b where b.vendor_account_id = va.id) as booking_count,
          (select count(*) from payments p where p.vendor_account_id = va.id) as payment_count
        from vendor_accounts va
        where va.deleted_at is null
      ),
      duplicate_groups as (
        select 'user_id'::text as reason, aa.user_id as identity_key
        from account_activity aa
        where aa.user_id is not null
        group by aa.user_id
        having count(*) > 1

        union all

        select 'auth0_sub'::text as reason, aa.auth0_sub as identity_key
        from account_activity aa
        where nullif(btrim(aa.auth0_sub), '') is not null
        group by aa.auth0_sub
        having count(*) > 1
      ),
      ranked_accounts as (
        select
          dg.reason,
          dg.identity_key,
          aa.id as account_id,
          row_number() over (
            partition by dg.reason, dg.identity_key
            order by
              (
                aa.booking_count * 1000
                + aa.payment_count * 1000
                + aa.listing_count * 100
                + aa.profile_count * 100
              ) desc,
              aa.has_stripe desc,
              case when aa.active_flag then 1 else 0 end desc,
              aa.created_at asc nulls last,
              aa.id asc
          ) as rank_in_group
        from duplicate_groups dg
        inner join account_activity aa
          on (dg.reason = 'user_id' and aa.user_id = dg.identity_key)
          or (dg.reason = 'auth0_sub' and aa.auth0_sub = dg.identity_key)
      ),
      canonical_accounts as (
        select
          reason,
          identity_key,
          account_id as canonical_account_id
        from ranked_accounts
        where rank_in_group = 1
      )
      insert into tmp_vendor_account_merge_map (
        duplicate_account_id,
        canonical_account_id,
        reason
      )
      select
        ra.account_id as duplicate_account_id,
        ca.canonical_account_id,
        ra.reason
      from ranked_accounts ra
      inner join canonical_accounts ca
        on ca.reason = ra.reason
       and ca.identity_key = ra.identity_key
      where ra.rank_in_group > 1
      on conflict (duplicate_account_id) do update
      set canonical_account_id = excluded.canonical_account_id,
          reason = case
            when tmp_vendor_account_merge_map.reason = excluded.reason then tmp_vendor_account_merge_map.reason
            else tmp_vendor_account_merge_map.reason || ',' || excluded.reason
          end;

      -- If one duplicate maps to multiple canonicals, keep it unresolved for manual repair.
      delete from tmp_vendor_account_merge_map map
      where exists (
        select 1
        from (
          select
            duplicate_account_id,
            count(distinct canonical_account_id) as canonical_count
          from tmp_vendor_account_merge_map
          group by duplicate_account_id
          having count(distinct canonical_account_id) > 1
        ) conflicts
        where conflicts.duplicate_account_id = map.duplicate_account_id
      );

      -- Collapse mapping chains (A -> B, B -> C => A -> C).
      loop
        update tmp_vendor_account_merge_map map
        set canonical_account_id = next_map.canonical_account_id
        from tmp_vendor_account_merge_map next_map
        where map.canonical_account_id = next_map.duplicate_account_id
          and map.canonical_account_id <> next_map.canonical_account_id;

        get diagnostics chain_updates = row_count;
        exit when chain_updates = 0;
      end loop;

      -- Remove no-op/self mappings.
      delete from tmp_vendor_account_merge_map
      where duplicate_account_id = canonical_account_id;

      -- Record automatic merges for audit.
      insert into vendor_identity_hardening_reports (
        run_label,
        issue_type,
        issue_key,
        account_ids,
        details
      )
      select
        '0025_post_repair',
        'auto_merged_vendor_account',
        map.duplicate_account_id,
        array[map.duplicate_account_id, map.canonical_account_id],
        jsonb_build_object('reason', map.reason)
      from tmp_vendor_account_merge_map map;

      -- Prevent unique collisions after remap in google mapping table.
      with normalized as (
        select
          gm.id,
          coalesce(map.canonical_account_id, gm.vendor_account_id) as target_vendor_account_id,
          gm.google_calendar_id,
          gm.google_event_id,
          row_number() over (
            partition by
              coalesce(map.canonical_account_id, gm.vendor_account_id),
              gm.google_calendar_id,
              gm.google_event_id
            order by gm.created_at asc nulls last, gm.id asc
          ) as duplicate_rank
        from google_calendar_event_mappings gm
        left join tmp_vendor_account_merge_map map
          on map.duplicate_account_id = gm.vendor_account_id
      )
      delete from google_calendar_event_mappings gm
      using normalized norm
      where gm.id = norm.id
        and norm.duplicate_rank > 1;

      -- Repoint dependent rows to canonical account.
      update vendor_profiles vp
      set account_id = map.canonical_account_id
      from tmp_vendor_account_merge_map map
      where vp.account_id = map.duplicate_account_id;

      update vendor_listings vl
      set account_id = map.canonical_account_id
      from tmp_vendor_account_merge_map map
      where vl.account_id = map.duplicate_account_id;

      update bookings b
      set vendor_account_id = map.canonical_account_id
      from tmp_vendor_account_merge_map map
      where b.vendor_account_id = map.duplicate_account_id;

      update payments p
      set vendor_account_id = map.canonical_account_id
      from tmp_vendor_account_merge_map map
      where p.vendor_account_id = map.duplicate_account_id;

      update booking_disputes bd
      set vendor_account_id = map.canonical_account_id
      from tmp_vendor_account_merge_map map
      where bd.vendor_account_id = map.duplicate_account_id;

      update review_replies rr
      set vendor_account_id = map.canonical_account_id
      from tmp_vendor_account_merge_map map
      where rr.vendor_account_id = map.duplicate_account_id;

      update google_calendar_event_mappings gm
      set vendor_account_id = map.canonical_account_id
      from tmp_vendor_account_merge_map map
      where gm.vendor_account_id = map.duplicate_account_id;

      -- If canonical account has no active_profile_id, assign oldest profile after merge.
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
        and (va.active_profile_id is null or btrim(va.active_profile_id) = '');

      -- Soft-retire merged duplicate accounts while preserving history.
      update vendor_accounts va
      set
        active = false,
        deleted_at = coalesce(va.deleted_at, now()),
        user_id = null,
        auth0_sub = null,
        active_profile_id = null,
        email = concat('retired+', va.id, '@eventhub.merged'),
        business_name = concat('[Merged] ', coalesce(nullif(va.business_name, ''), 'Vendor'))
      from tmp_vendor_account_merge_map map
      where va.id = map.duplicate_account_id;
    end $$;
  `);

  // -------------------------
  // Post-repair detection report
  // -------------------------

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      account_ids,
      user_ids,
      auth0_subs,
      emails,
      details
    )
    select
      ${POST_REPAIR_RUN_LABEL},
      'duplicate_vendor_accounts_by_user_id',
      va.user_id,
      array_agg(va.id order by va.created_at asc nulls last, va.id asc),
      array_agg(distinct va.user_id),
      array_remove(array_agg(distinct nullif(btrim(va.auth0_sub), '')), null),
      array_agg(va.email order by va.created_at asc nulls last, va.id asc),
      jsonb_build_object(
        'accountCount',
        count(*),
        'activeCount',
        count(*) filter (where coalesce(va.active, true))
      )
    from vendor_accounts va
    where va.deleted_at is null
      and va.user_id is not null
    group by va.user_id
    having count(*) > 1;
  `);

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      account_ids,
      user_ids,
      auth0_subs,
      emails,
      details
    )
    select
      ${POST_REPAIR_RUN_LABEL},
      'duplicate_vendor_accounts_by_auth0_sub',
      va.auth0_sub,
      array_agg(va.id order by va.created_at asc nulls last, va.id asc),
      array_remove(array_agg(distinct va.user_id), null),
      array_agg(distinct va.auth0_sub),
      array_agg(va.email order by va.created_at asc nulls last, va.id asc),
      jsonb_build_object(
        'accountCount',
        count(*),
        'activeCount',
        count(*) filter (where coalesce(va.active, true))
      )
    from vendor_accounts va
    where va.deleted_at is null
      and nullif(btrim(va.auth0_sub), '') is not null
    group by va.auth0_sub
    having count(*) > 1;
  `);

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      user_ids,
      auth0_subs,
      emails,
      details
    )
    select
      ${POST_REPAIR_RUN_LABEL},
      'duplicate_users_by_auth0_sub',
      u.auth0_sub,
      array_agg(u.id order by u.created_at asc nulls last, u.id asc),
      array_agg(distinct u.auth0_sub),
      array_agg(u.email order by u.created_at asc nulls last, u.id asc),
      jsonb_build_object('userCount', count(*))
    from users u
    where nullif(btrim(u.auth0_sub), '') is not null
    group by u.auth0_sub
    having count(*) > 1;
  `);

  await db.execute(sql`
    insert into vendor_identity_hardening_reports (
      run_label,
      issue_type,
      issue_key,
      account_ids,
      user_ids,
      auth0_subs,
      emails,
      details
    )
    select
      ${POST_REPAIR_RUN_LABEL},
      'unlinked_active_vendor_account',
      va.id,
      array[va.id],
      case when va.user_id is null then '{}'::text[] else array[va.user_id] end,
      case when nullif(btrim(va.auth0_sub), '') is null then '{}'::text[] else array[va.auth0_sub] end,
      array[va.email],
      jsonb_build_object(
        'hasUserId',
        va.user_id is not null,
        'hasAuth0Sub',
        nullif(btrim(va.auth0_sub), '') is not null
      )
    from vendor_accounts va
    where va.deleted_at is null
      and (va.user_id is null or nullif(btrim(va.auth0_sub), '') is null);
  `);

  // Guard: never add uniqueness protections while unresolved identity duplicates remain.
  await db.execute(sql`
    do $$
    declare unresolved_count integer;
    begin
      select count(*) into unresolved_count
      from (
        select 1
        from vendor_accounts va
        where va.deleted_at is null
          and va.user_id is not null
        group by va.user_id
        having count(*) > 1

        union all

        select 1
        from vendor_accounts va
        where va.deleted_at is null
          and nullif(btrim(va.auth0_sub), '') is not null
        group by va.auth0_sub
        having count(*) > 1

        union all

        select 1
        from users u
        where nullif(btrim(u.auth0_sub), '') is not null
        group by u.auth0_sub
        having count(*) > 1
      ) unresolved;

      if unresolved_count > 0 then
        raise exception
          'Identity hardening blocked: unresolved duplicate ownership remains. Inspect vendor_identity_hardening_reports for run_label=%.',
          '0025_post_repair';
      end if;
    end $$;
  `);

  // -------------------------
  // Constraint hardening (safe only after clean detection/repair pass)
  // -------------------------
  await db.execute(sql`
    create unique index if not exists users_auth0_sub_unique_idx
      on users (auth0_sub)
      where auth0_sub is not null and btrim(auth0_sub) <> '';
  `);

  await db.execute(sql`
    create unique index if not exists vendor_accounts_user_id_active_unique_idx
      on vendor_accounts (user_id)
      where user_id is not null and deleted_at is null;
  `);

  await db.execute(sql`
    create unique index if not exists vendor_accounts_auth0_sub_active_unique_idx
      on vendor_accounts (auth0_sub)
      where auth0_sub is not null and btrim(auth0_sub) <> '' and deleted_at is null;
  `);
}

export async function down() {
  // Roll back index hardening only; keep identity/backfill data changes.
  await db.execute(sql`
    drop index if exists vendor_accounts_auth0_sub_active_unique_idx;
  `);

  await db.execute(sql`
    drop index if exists vendor_accounts_user_id_active_unique_idx;
  `);

  await db.execute(sql`
    drop index if exists users_auth0_sub_unique_idx;
  `);
}
