import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    do $$
    begin
      create type booking_dispute_status as enum (
        'filed',
        'vendor_responded',
        'resolved_refund',
        'resolved_payout'
      );
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    create table if not exists booking_disputes (
      id varchar primary key default gen_random_uuid(),
      booking_id varchar not null references bookings(id) on delete cascade,
      customer_id varchar not null references users(id) on delete cascade,
      vendor_account_id varchar references vendor_accounts(id) on delete set null,
      reason text not null,
      details text,
      status booking_dispute_status not null default 'filed',
      vendor_response text,
      admin_decision text,
      admin_notes text,
      filed_at timestamptz not null default now(),
      vendor_responded_at timestamptz,
      resolved_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists booking_disputes_booking_id_idx
    on booking_disputes (booking_id);
  `);

  await db.execute(sql`
    create index if not exists booking_disputes_status_idx
    on booking_disputes (status);
  `);

  await db.execute(sql`
    create index if not exists booking_disputes_filed_at_idx
    on booking_disputes (filed_at desc);
  `);
}

export async function down() {
  await db.execute(sql`
    drop index if exists booking_disputes_filed_at_idx;
  `);

  await db.execute(sql`
    drop index if exists booking_disputes_status_idx;
  `);

  await db.execute(sql`
    drop index if exists booking_disputes_booking_id_idx;
  `);

  await db.execute(sql`
    drop table if exists booking_disputes;
  `);

  await db.execute(sql`
    do $$
    begin
      drop type if exists booking_dispute_status;
    exception
      when dependent_objects_still_exist then null;
    end $$;
  `);
}
