import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Some payment records were created before the vendor completed Stripe onboarding,
//   leaving stripe_connected_account_id as null. Those payments are permanently stuck
//   in a "blocked" payout state because the worker requires this field to transfer funds.
//
//   This migration backfills the missing value from the vendor's current stripe_connect_id,
//   but ONLY for payments that:
//     - are still awaiting payout (not_ready, eligible, or scheduled)
//     - belong to a vendor account that has since completed Stripe onboarding
//
//   It never overwrites an existing value, never touches already-paid or cancelled payments,
//   and never touches payments whose vendor account still has no Stripe ID.
//
// Safe to run against production. Additive only — no deletes, no overwrites.

export async function up() {
  // payments.vendor_account_id does not exist in this DB (schema drift from db:push).
  // Join via bookings.vendor_account_id instead, which does exist.
  await db.execute(sql`
    update payments p
    set stripe_connected_account_id = va.stripe_connect_id
    from bookings b
    inner join vendor_accounts va on va.id = b.vendor_account_id
    where b.id = p.booking_id
      and p.stripe_connected_account_id is null
      and va.stripe_connect_id is not null
      and p.payout_status in ('not_ready', 'eligible', 'scheduled');
  `);
}

export async function down() {
  // This backfill cannot be automatically reversed — we don't know which rows
  // were null before. If rollback is needed, identify affected rows via:
  //   select * from payments where stripe_connected_account_id is not null
  //     and payout_status in ('not_ready', 'eligible', 'scheduled')
  // and null them out manually after verifying with the vendor's account history.
}
