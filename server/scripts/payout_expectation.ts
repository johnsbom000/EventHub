/**
 * READ-ONLY payout expectation lookup.
 *
 * Given a booking ID, prints the expected vendor payout date + amount and the
 * current payout status for every payment row on that booking. Does NOT write
 * anything and does NOT touch Stripe — it only reads the DB and runs the same
 * pure eligibility logic the auto-payout job uses.
 *
 * Run against PRODUCTION explicitly (local .env is the dev DB):
 *   DATABASE_URL="<prod-neon-url>" npx tsx server/scripts/payout_expectation.ts <bookingId>
 */
import { eq, asc } from "drizzle-orm";
import { db, pool } from "../db";
import { bookings, disputeCases, payments } from "@shared/schema";
import { computePayoutEligibility, DISPUTE_WINDOW_HOURS } from "../payoutEligibility";
import { AUTO_PAYOUT_INTERVAL_MS } from "../lib/constants";

const bookingId = process.argv[2];
if (!bookingId) {
  console.error("Usage: tsx server/scripts/payout_expectation.ts <bookingId>");
  process.exit(1);
}

const fmt = (cents: number | null | undefined) =>
  cents == null ? "—" : `$${(cents / 100).toFixed(2)}`;
const fmtDate = (d: Date | null) => (d ? d.toISOString() : "—");

async function main() {
  try {
    // dispute_cases.booking_id is UNIQUE (one case per booking), so this
    // left join can't fan out the payment rows.
    const data = await db
      .select({
        paymentId: payments.id,
        paymentType: payments.paymentType,
        bookingStatus: bookings.status,
        bookingEndAt: bookings.bookingEndAt,
        bookingCancellationReason: bookings.cancellationReason,
        paymentStatus: payments.status,
        payoutStatus: payments.payoutStatus,
        payoutBlockedReason: payments.payoutBlockedReason,
        disputeStatus: payments.disputeStatus,
        disputeCaseStatus: disputeCases.status,
        paidOutAt: payments.paidOutAt,
        payoutEligibleAt: payments.payoutEligibleAt,
        totalAmount: payments.totalAmount,
        amount: payments.amount,
        refundedAmount: payments.refundAmount,
        vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
        actualStripeFeeAmount: payments.actualStripeFeeAmount,
        stripeFeeEstimate: payments.stripeProcessingFeeEstimate,
        vendorAbsorbsStripeFees: payments.vendorAbsorbsStripeFees,
        stripeConnectedAccountId: payments.stripeConnectedAccountId,
        stripeChargeId: payments.stripeChargeId,
        stripeTransferId: payments.stripeTransferId,
        stripePaymentIntentId: payments.stripePaymentIntentId,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .leftJoin(disputeCases, eq(disputeCases.bookingId, bookings.id))
      .where(eq(payments.bookingId, bookingId))
      .orderBy(asc(payments.createdAt));

    if (!data.length) {
      console.log(`No payment rows found for booking ${bookingId}.`);
      console.log("(Double-check the booking ID and that you're pointed at the prod DB.)");
      return;
    }

    const now = new Date();
    console.log(`\nBooking ${bookingId} — ${data.length} payment row(s). Now=${now.toISOString()}\n`);

    for (const r of data) {
      const result = computePayoutEligibility(
        {
          bookingStatus: r.bookingStatus,
          paymentStatus: r.paymentStatus,
          payoutStatus: r.payoutStatus,
          payoutBlockedReason: r.payoutBlockedReason,
          disputeStatus: r.disputeStatus,
          disputeCaseStatus: r.disputeCaseStatus,
          paidOutAt: r.paidOutAt,
          payoutEligibleAt: r.payoutEligibleAt,
          bookingEndAt: r.bookingEndAt,
          totalAmount: r.totalAmount,
          refundedAmount: r.refundedAmount,
          vendorNetPayoutAmount: r.vendorNetPayoutAmount,
          actualStripeFeeAmount: r.actualStripeFeeAmount ?? r.stripeFeeEstimate,
          stripeConnectedAccountId: r.stripeConnectedAccountId,
          stripeChargeId: r.stripeChargeId,
          stripeTransferId: r.stripeTransferId,
          vendorAbsorbsStripeFees: Boolean(r.vendorAbsorbsStripeFees),
          paymentType: r.paymentType,
          bookingCancellationReason: r.bookingCancellationReason,
        },
        now
      );

      const eligibleAt = result.payoutEligibleAt;
      let expectation: string;
      if (r.stripeTransferId || r.paidOutAt) {
        expectation = `ALREADY PAID OUT — transfer ${r.stripeTransferId ?? "(pending persist)"} at ${fmtDate(r.paidOutAt)}`;
      } else if (result.eligible) {
        expectation = `ELIGIBLE NOW — next auto-payout tick will send it (job runs every ${AUTO_PAYOUT_INTERVAL_MS / 60000} min)`;
      } else if (eligibleAt && now < eligibleAt) {
        const hrs = ((eligibleAt.getTime() - now.getTime()) / 3.6e6).toFixed(1);
        expectation = `HELD — transfer expected on/after ${fmtDate(eligibleAt)} (~${hrs}h from now), then next 10-min tick. Blocked reason: ${result.payoutBlockedReason ?? "hold window"}`;
      } else {
        expectation = `NOT PAYABLE right now — status=${result.payoutStatus}, reason=${result.payoutBlockedReason ?? "—"}`;
      }

      console.log("────────────────────────────────────────────────────────");
      console.log(`payment ${r.paymentId}  [${r.paymentType}]`);
      console.log(`  PaymentIntent : ${r.stripePaymentIntentId ?? "—"}`);
      console.log(`  charge        : ${r.stripeChargeId ?? "—"}`);
      console.log(`  connected acct: ${r.stripeConnectedAccountId ?? "— (MISSING — would block payout)"}`);
      console.log(`  payment status: ${r.paymentStatus}   booking: ${r.bookingStatus}`);
      console.log(`  event end     : ${fmtDate(r.bookingEndAt)}`);
      console.log(`  +${DISPUTE_WINDOW_HOURS}h hold → eligible at: ${fmtDate(eligibleAt)}`);
      console.log(`  charged total : ${fmt(r.totalAmount)}   refunded: ${fmt(r.refundedAmount)}`);
      console.log(`  vendor net    : ${fmt(r.vendorNetPayoutAmount)}   absorbs Stripe fee: ${Boolean(r.vendorAbsorbsStripeFees)} (est ${fmt(r.actualStripeFeeAmount ?? r.stripeFeeEstimate)})`);
      console.log(`  => EXPECTED PAYOUT AMOUNT: ${fmt(result.adjustedPayoutAmount)}`);
      console.log(`  => ${expectation}`);
    }

    console.log("\nNote: this is the platform→vendor transfer date. The vendor's");
    console.log("bank deposit then follows Stripe's connected-account payout schedule");
    console.log("(a separate Stripe Dashboard setting, typically a rolling ~2 days).\n");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
