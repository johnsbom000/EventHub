import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Cleans up the legacy vendor-account-level cancellation policy system.
 *
 * Background:
 *   Migration 0062 added a vendor_cancellation_policies table and a
 *   cancellation_policy_override column on vendor_listings, intending to support
 *   an account-wide default policy that listings could optionally override.
 *   That design was abandoned — vendors now set a policy per listing during
 *   listing creation, and no UI was ever built to write to either the table or
 *   the override column. Both are empty in production.
 *
 * What this migration does:
 *   1. Adds cancellation_policy (text) and cancellation_policy_days (integer)
 *      as proper columns on vendor_listings — the canonical home for the
 *      per-listing policy chosen during wizard creation.
 *   2. Backfills both columns from listing_data JSONB for all existing rows.
 *   3. Drops cancellation_policy_override (dead column, nothing ever wrote to it).
 *   4. Drops the vendor_cancellation_policies table (dead table, never populated).
 *
 * Safe to run against production:
 *   - ADD COLUMN IF NOT EXISTS is instant in PostgreSQL.
 *   - Backfill UPDATE touches only rows where listing_data contains the field.
 *   - DROP COLUMN and DROP TABLE are safe because both objects are confirmed empty.
 */
export async function up() {
  // 1. Add the two new columns
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists cancellation_policy text,
      add column if not exists cancellation_policy_days integer;
  `);

  // 2. Backfill from listing_data
  await db.execute(sql`
    update vendor_listings
    set
      cancellation_policy      = listing_data->>'cancellationPolicy',
      cancellation_policy_days = (listing_data->>'cancellationPolicyDays')::integer
    where listing_data is not null
      and listing_data->>'cancellationPolicy' is not null;
  `);

  // 3. Drop the dead override column
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists cancellation_policy_override;
  `);

  // 4. Drop the dead vendor-account-level policy table
  await db.execute(sql`
    drop table if exists vendor_cancellation_policies;
  `);

  console.log(
    "[0083] Cancellation policy cleanup: added per-listing columns, backfilled, dropped legacy override column and vendor_cancellation_policies table."
  );
}

export async function down() {
  // Re-add the override column (restores schema shape; data is lost)
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists cancellation_policy_override jsonb;
  `);

  // Re-create the vendor_cancellation_policies table (empty; data is lost)
  await db.execute(sql`
    create table if not exists vendor_cancellation_policies (
      id                       varchar primary key default gen_random_uuid(),
      vendor_id                varchar not null unique references vendor_accounts(id) on delete cascade,
      preset_type              text not null default 'moderate',
      tiers                    jsonb not null default '[]'::jsonb,
      deposit_required         boolean not null default false,
      deposit_percentage       integer not null default 0,
      allow_reschedule         boolean not null default false,
      reschedule_window_months integer not null default 12,
      weather_clause           boolean not null default false,
      force_majeure_clause     boolean not null default false,
      notes                    text,
      created_at               timestamptz not null default now(),
      updated_at               timestamptz not null default now()
    );
  `);

  // Drop the new columns
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists cancellation_policy,
      drop column if exists cancellation_policy_days;
  `);

  console.log("[0083] down(): restored legacy cancellation policy schema (data not restored).");
}
