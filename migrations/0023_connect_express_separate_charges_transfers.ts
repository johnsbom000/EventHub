import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    do $$
    begin
      alter type payment_status add value if not exists 'requires_action';
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      alter type payment_status add value if not exists 'succeeded';
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      alter type payment_status add value if not exists 'partially_refunded';
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      create type payout_status as enum (
        'not_ready',
        'eligible',
        'scheduled',
        'paid',
        'blocked',
        'cancelled'
      );
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    alter table bookings
      add column if not exists payout_status payout_status not null default 'not_ready',
      add column if not exists payout_eligible_at timestamptz,
      add column if not exists paid_out_at timestamptz,
      add column if not exists payout_blocked_reason text;
  `);

  await db.execute(sql`
    alter table payments
      add column if not exists stripe_charge_id text,
      add column if not exists stripe_connected_account_id text,
      add column if not exists total_amount integer,
      add column if not exists platform_fee_amount integer,
      add column if not exists vendor_gross_amount integer,
      add column if not exists vendor_net_payout_amount integer,
      add column if not exists stripe_processing_fee_estimate integer,
      add column if not exists actual_stripe_fee_amount integer,
      add column if not exists refunded_amount integer default 0,
      add column if not exists dispute_status text,
      add column if not exists payout_status payout_status not null default 'not_ready',
      add column if not exists payout_eligible_at timestamptz,
      add column if not exists payout_scheduled_at timestamptz,
      add column if not exists paid_out_at timestamptz,
      add column if not exists payout_blocked_reason text,
      add column if not exists payout_adjusted_amount integer;
  `);

  await db.execute(sql`
    update payments p
    set
      total_amount = coalesce(p.total_amount, p.amount),
      platform_fee_amount = coalesce(p.platform_fee_amount, p.platform_fee),
      vendor_net_payout_amount = coalesce(p.vendor_net_payout_amount, p.vendor_payout),
      refunded_amount = coalesce(p.refunded_amount, p.refund_amount, 0)
  `);

  await db.execute(sql`
    update payments p
    set vendor_gross_amount = coalesce(
      p.vendor_gross_amount,
      b.subtotal_amount_cents,
      p.total_amount,
      p.amount
    )
    from bookings b
    where b.id = p.booking_id
  `);

  await db.execute(sql`
    update payments p
    set stripe_connected_account_id = coalesce(p.stripe_connected_account_id, va.stripe_connect_id)
    from vendor_accounts va
    where va.id = p.vendor_account_id
  `);

  await db.execute(sql`
    update payments p
    set payout_status = case
      when p.stripe_transfer_id is not null then 'paid'::payout_status
      when coalesce(p.refunded_amount, p.refund_amount, 0) >= coalesce(p.total_amount, p.amount, 0)
        and coalesce(p.total_amount, p.amount, 0) > 0
        then 'cancelled'::payout_status
      when p.status::text = 'disputed' then 'blocked'::payout_status
      else coalesce(p.payout_status, 'not_ready'::payout_status)
    end
  `);

  await db.execute(sql`
    update bookings b
    set payout_status = case
      when b.status in ('cancelled', 'failed', 'expired') then 'cancelled'::payout_status
      when b.payment_status::text = 'refunded' then 'cancelled'::payout_status
      when b.payment_status::text = 'disputed' then 'blocked'::payout_status
      else coalesce(b.payout_status, 'not_ready'::payout_status)
    end
  `);

  await db.execute(sql`
    update bookings b
    set payout_eligible_at = coalesce(
      b.payout_eligible_at,
      case
        when b.booking_end_at is not null then b.booking_end_at + interval '48 hours'
        else null
      end
    )
    where b.payout_eligible_at is null
  `);

  await db.execute(sql`
    create index if not exists idx_payments_payout_status_eligible_at
    on payments (payout_status, payout_eligible_at);
  `);

  await db.execute(sql`
    create index if not exists idx_payments_stripe_charge_id
    on payments (stripe_charge_id);
  `);

  await db.execute(sql`
    create index if not exists idx_payments_stripe_transfer_id
    on payments (stripe_transfer_id);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_payout_status_eligible_at
    on bookings (payout_status, payout_eligible_at);
  `);
}

export async function down() {
  await db.execute(sql`
    drop index if exists idx_bookings_payout_status_eligible_at;
  `);

  await db.execute(sql`
    drop index if exists idx_payments_stripe_transfer_id;
  `);

  await db.execute(sql`
    drop index if exists idx_payments_stripe_charge_id;
  `);

  await db.execute(sql`
    drop index if exists idx_payments_payout_status_eligible_at;
  `);

  await db.execute(sql`
    alter table payments
      drop column if exists payout_adjusted_amount,
      drop column if exists payout_blocked_reason,
      drop column if exists paid_out_at,
      drop column if exists payout_scheduled_at,
      drop column if exists payout_eligible_at,
      drop column if exists payout_status,
      drop column if exists dispute_status,
      drop column if exists refunded_amount,
      drop column if exists actual_stripe_fee_amount,
      drop column if exists stripe_processing_fee_estimate,
      drop column if exists vendor_net_payout_amount,
      drop column if exists vendor_gross_amount,
      drop column if exists platform_fee_amount,
      drop column if exists total_amount,
      drop column if exists stripe_connected_account_id,
      drop column if exists stripe_charge_id;
  `);

  await db.execute(sql`
    alter table bookings
      drop column if exists payout_blocked_reason,
      drop column if exists paid_out_at,
      drop column if exists payout_eligible_at,
      drop column if exists payout_status;
  `);
}
