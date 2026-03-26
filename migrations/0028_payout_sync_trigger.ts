import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Adds a PostgreSQL trigger that automatically mirrors payout state from the
//   payments table to the bookings table whenever a payment row is updated.
//
//   Before this migration, every code path that updated payments.payout_status
//   had to also manually update bookings.payout_status — 17 separate call sites,
//   some of which ran outside a transaction. If any of those writes failed or were
//   missed, the two records would silently disagree.
//
//   With this trigger, payments is the single source of truth. The trigger fires
//   inside the same transaction as the payment update, so they can never drift.
//   The explicit bookings payout writes in application code are removed after this
//   migration runs.
//
//   The trigger syncs: payout_status, payout_eligible_at, payout_blocked_reason,
//   paid_out_at — exactly the fields that were being dual-written.
//
// Safe to run against production. Additive only — no data changes, no column drops.

export async function up() {
  await db.execute(sql`
    create or replace function fn_sync_booking_payout_from_payment()
    returns trigger as $$
    begin
      if new.booking_id is null then
        return new;
      end if;

      if (
        new.payout_status      is distinct from old.payout_status      or
        new.payout_eligible_at is distinct from old.payout_eligible_at or
        new.payout_blocked_reason is distinct from old.payout_blocked_reason or
        new.paid_out_at        is distinct from old.paid_out_at
      ) then
        update bookings
        set
          payout_status         = new.payout_status,
          payout_eligible_at    = new.payout_eligible_at,
          payout_blocked_reason = new.payout_blocked_reason,
          paid_out_at           = coalesce(new.paid_out_at, paid_out_at),
          updated_at            = now()
        where id = new.booking_id;
      end if;

      return new;
    end;
    $$ language plpgsql;
  `);

  await db.execute(sql`
    drop trigger if exists trg_sync_booking_payout_from_payment on payments;
  `);

  await db.execute(sql`
    create trigger trg_sync_booking_payout_from_payment
    after update on payments
    for each row
    execute function fn_sync_booking_payout_from_payment();
  `);
}

export async function down() {
  await db.execute(sql`
    drop trigger if exists trg_sync_booking_payout_from_payment on payments;
  `);
  await db.execute(sql`
    drop function if exists fn_sync_booking_payout_from_payment();
  `);
}
