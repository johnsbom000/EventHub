/**
 * Detection script for the C2 deposit-refund bug: the security-deposit
 * auto-refund job used to call Stripe with NO amount. Because the deposit
 * shares one PaymentIntent with the booking payment, that refunded the ENTIRE
 * remaining charge — the vendor's service money included.
 *
 * For every booking with `security_deposit_refunded_at` set, this compares the
 * Stripe charge's cumulative `amount_refunded` against the recorded deposit
 * amount and flags likely over-refunds.
 *
 * DETECTION + REPORT ONLY. Repairing an over-refund (re-charging a customer or
 * compensating a vendor) is a business decision — this script NEVER moves
 * money and has no --apply mode.
 *
 * Run with:
 *   npx tsx --env-file .env server/scripts/detect_wrong_deposit_refunds.ts
 */

import { db, pool } from "../db";
import { sql as drizzleSql } from "drizzle-orm";

type Row = {
  bookingId: string;
  bookingStatus: string;
  eventDate: string | null;
  depositRefundedAt: string | null;
  depositPaymentId: string | null;
  depositCents: number | null;
  depositRecordedRefundCents: number | null;
  paymentIntentId: string | null;
  recordedRefundTotalCents: number | null;
  cancellationReason: string | null;
  vendorName: string | null;
  customerEmail: string | null;
};

function dollars(cents: number | null | undefined): string {
  return `$${(((cents ?? 0) as number) / 100).toFixed(2)}`;
}

async function main() {
  console.log("\n── Wrong deposit refunds (detection only) ─────────────────\n");

  const result: any = await db.execute(drizzleSql`
    select
      b.id                                as "bookingId",
      b.status                            as "bookingStatus",
      b.event_date::text                  as "eventDate",
      b.security_deposit_refunded_at::text as "depositRefundedAt",
      b.cancellation_reason               as "cancellationReason",
      dep.id                              as "depositPaymentId",
      dep.amount                          as "depositCents",
      dep.refund_amount                   as "depositRecordedRefundCents",
      dep.stripe_payment_intent_id        as "paymentIntentId",
      (
        select coalesce(sum(coalesce(p2.refund_amount, 0)), 0)::int
        from payments p2
        where p2.booking_id = b.id
      )                                   as "recordedRefundTotalCents",
      va.business_name                    as "vendorName",
      u.email                             as "customerEmail"
    from bookings b
    join payments dep
      on dep.booking_id = b.id and dep.payment_type = 'security_deposit'
    left join vendor_accounts va on va.id = b.vendor_account_id
    left join users u on u.id = b.customer_id
    where b.security_deposit_refunded_at is not null
    order by b.security_deposit_refunded_at desc
  `);

  const rows: Row[] = (result.rows as Row[]) ?? [];
  console.log(`Found ${rows.length} booking(s) with a refunded security deposit to check.\n`);

  const { stripe } = await import("../stripe");
  let overRefunded = 0;
  let clean = 0;
  let unverifiable = 0;

  for (const row of rows) {
    if (!row.paymentIntentId) {
      unverifiable += 1;
      console.log(`  ⚠️  ${row.bookingId} — deposit row has no PaymentIntent id; cannot verify`);
      continue;
    }

    let chargeAmount = 0;
    let amountRefunded = 0;
    let chargeId = "";
    try {
      const intent = await stripe.paymentIntents.retrieve(row.paymentIntentId, {
        expand: ["latest_charge"],
      });
      const charge = intent.latest_charge as import("stripe").Stripe.Charge | null;
      if (!charge || typeof charge === "string") {
        unverifiable += 1;
        console.log(`  ⚠️  ${row.bookingId} — PI ${row.paymentIntentId} has no expanded charge; skipping`);
        continue;
      }
      chargeAmount = charge.amount;
      amountRefunded = charge.amount_refunded;
      chargeId = charge.id;
    } catch (err: any) {
      unverifiable += 1;
      console.log(`  ⚠️  ${row.bookingId} — Stripe lookup failed (${err?.message || err}); skipping`);
      continue;
    }

    const depositCents = row.depositCents ?? 0;
    // The deposit job should only ever have refunded the deposit itself. Any
    // Stripe refund total beyond what our payment rows collectively recorded
    // is money that left the platform without an owning row — for a booking
    // whose only expected refund is the deposit, that is the C2 signature.
    const recordedTotal = row.recordedRefundTotalCents ?? 0;
    const excessVsRecorded = amountRefunded - recordedTotal;
    const wholeChargeRefunded = amountRefunded >= chargeAmount && depositCents < chargeAmount;

    if (excessVsRecorded > 0 || wholeChargeRefunded) {
      overRefunded += 1;
      console.log(
        `  🚨 OVER-REFUND ${row.bookingId} (${row.bookingStatus})\n` +
          `      charge ${chargeId}: captured ${dollars(chargeAmount)}, refunded ${dollars(amountRefunded)}\n` +
          `      deposit ${dollars(depositCents)} (row ${row.depositPaymentId}, recorded refund ${dollars(row.depositRecordedRefundCents)})\n` +
          `      all rows recorded refunds: ${dollars(recordedTotal)} → unattributed excess ${dollars(Math.max(0, excessVsRecorded))}` +
          (wholeChargeRefunded ? "  [entire charge refunded]" : "") +
          `\n      vendor=${row.vendorName ?? "?"}  customer=${row.customerEmail ?? "?"}  event=${row.eventDate ?? "?"}` +
          (row.cancellationReason ? `  cancellation: ${row.cancellationReason}` : "")
      );
    } else {
      clean += 1;
    }
  }

  console.log("\n── Summary ──────────────────────────────");
  console.log(`  Checked:       ${rows.length}`);
  console.log(`  Over-refunded: ${overRefunded}`);
  console.log(`  Clean:         ${clean}`);
  console.log(`  Unverifiable:  ${unverifiable}`);
  if (overRefunded > 0) {
    console.log(
      "\n  ⚠️  Over-refunds detected. This script never moves money — each case needs a\n" +
        "  business decision (vendor compensation / customer follow-up) before any repair."
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
