import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Restricts the payout-sync trigger function (migration 0028) to payment
//   rows of payment_type = 'booking'.
//
//   The trigger mirrors payout_status / payout_eligible_at /
//   payout_blocked_reason / paid_out_at from payments onto the parent booking.
//   When it was written, one booking had one payment row. Today a booking can
//   also carry 'security_deposit' and 'travel_fee' rows on the same
//   booking_id — a travel-fee payout (or deposit state change) would OVERWRITE
//   the booking's payout fields with the sidecar row's state, corrupting the
//   booking-level payout view.
//
//   Only the function body changes (CREATE OR REPLACE); the trigger itself
//   (trg_sync_booking_payout_from_payment, AFTER UPDATE ON payments) is
//   untouched and keeps pointing at this function.
//
// Idempotent: CREATE OR REPLACE FUNCTION.

export async function up() {
  await db.execute(sql`
    create or replace function fn_sync_booking_payout_from_payment()
    returns trigger as $$
    begin
      if new.booking_id is null then
        return new;
      end if;

      -- Only the primary 'booking' payment row drives booking-level payout
      -- state. Sidecar rows (security_deposit, travel_fee) track their own
      -- payout lifecycle and must never overwrite the booking's.
      if new.payment_type <> 'booking' then
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

  console.log(
    "[0145] fn_sync_booking_payout_from_payment now ignores non-'booking' payment rows."
  );
}

export async function down() {
  // Restore the 0028 function body (no payment_type guard).
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

  console.log("[0145] down: restored the unguarded 0028 trigger function body.");
}
