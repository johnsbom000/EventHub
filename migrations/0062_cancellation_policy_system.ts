import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds the vendor cancellation policy system.
 *
 * New table: vendor_cancellation_policies
 *   - One row per vendor account (unique FK).
 *   - Stores tiered refund rules as JSON, deposit config, and optional flags.
 *   - preset_type is informational (drives UI state), not behaviorally enforced.
 *
 * New column: vendor_listings.cancellation_policy_override (jsonb, nullable)
 *   - Same shape as the policy object. NULL means "use vendor default".
 *
 * New column: bookings.cancellation_policy_snapshot (jsonb, nullable)
 *   - Written at booking creation time — copy of the effective policy at that moment.
 *   - NULL on pre-policy bookings; cancel route falls back to 100% refund.
 *
 * All changes are safe to run against production:
 *   - CREATE TABLE IF NOT EXISTS is idempotent.
 *   - ADD COLUMN IF NOT EXISTS is instant in PostgreSQL.
 */
export async function up() {
  await db.execute(sql`
    create table if not exists vendor_cancellation_policies (
      id                    varchar primary key default gen_random_uuid(),
      vendor_id             varchar not null unique references vendor_accounts(id) on delete cascade,
      preset_type           text not null default 'moderate',
      tiers                 jsonb not null default '[]'::jsonb,
      deposit_required      boolean not null default false,
      deposit_percentage    integer not null default 0,
      allow_reschedule      boolean not null default false,
      reschedule_window_months integer not null default 12,
      weather_clause        boolean not null default false,
      force_majeure_clause  boolean not null default false,
      notes                 text,
      created_at            timestamptz not null default now(),
      updated_at            timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    alter table vendor_listings
      add column if not exists cancellation_policy_override jsonb;
  `);

  await db.execute(sql`
    alter table bookings
      add column if not exists cancellation_policy_snapshot jsonb;
  `);

  console.log("[0062] Cancellation policy system tables and columns added.");
}

export async function down() {
  await db.execute(sql`drop table if exists vendor_cancellation_policies;`);

  await db.execute(sql`
    alter table vendor_listings drop column if exists cancellation_policy_override;
  `);

  await db.execute(sql`
    alter table bookings drop column if exists cancellation_policy_snapshot;
  `);

  console.log("[0062] Cancellation policy system tables and columns removed.");
}
