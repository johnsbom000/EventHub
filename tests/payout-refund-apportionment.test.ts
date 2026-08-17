import assert from "node:assert/strict";

import { computePayoutEligibility, type PayoutEligibilityInput } from "../server/payoutEligibility";
import { VENDOR_FEE_RATE, CUSTOMER_FEE_RATE } from "../server/lib/constants";

/**
 * Pins vendor payout apportionment on PARTIAL refunds at NON-ZERO fee rates.
 *
 * Why this test exists: while VENDOR_FEE_RATE and CUSTOMER_FEE_RATE were both 0,
 * the payment row's amount (subtotal + customerFee) and the vendor's net
 * (subtotal − platformFee) were the SAME number, so "vendorNet − refunded" and
 * "vendorNet × (1 − refunded/amount)" agreed exactly. No test in the suite could
 * distinguish them. The moment the rates went non-zero the 1:1 subtraction began
 * short-paying vendors by p × (vendorFee + customerFee) of subtotal on every
 * partial refund. This file is the regression guard for that.
 *
 * The rule (server/lib/calculateRefund.ts): "commission is retained only on the
 * non-refunded portion."
 */

const now = new Date("2026-03-21T12:00:00.000Z");
const bookingEndAt = new Date("2026-03-15T12:00:00.000Z"); // 72h hold elapsed

// ── The canonical scenario from the fee-rate rollout ────────────────────────
// $1000 subtotal, standard (non-Pro) vendor, 50% cancellation tier.
const SUBTOTAL = 100_000;
const CUSTOMER_FEE = Math.round(SUBTOTAL * CUSTOMER_FEE_RATE); // 5%  → $50.00
const PLATFORM_FEE = Math.round(SUBTOTAL * VENDOR_FEE_RATE); //  8%  → $80.00
const PAYMENT_AMOUNT = SUBTOTAL + CUSTOMER_FEE; // payments.amount = serviceOnlyTotal
const VENDOR_NET = SUBTOTAL - PLATFORM_FEE; // booking.vendorPayout

// Guard the premise: these must be genuinely different numbers, otherwise this
// whole test is vacuous again (as it was at rate 0).
{
  assert.equal(VENDOR_FEE_RATE > 0, true, "vendor fee rate must be non-zero");
  assert.equal(CUSTOMER_FEE_RATE > 0, true, "customer fee rate must be non-zero");
  assert.notEqual(PAYMENT_AMOUNT, VENDOR_NET, "payment amount and vendor net must differ");
  assert.equal(PAYMENT_AMOUNT, 105_000);
  assert.equal(VENDOR_NET, 92_000);
}

const baseInput: PayoutEligibilityInput = {
  bookingStatus: "cancelled",
  paymentStatus: "partially_refunded",
  payoutStatus: "not_ready",
  payoutBlockedReason: null,
  disputeStatus: null,
  disputeCaseStatus: null,
  paidOutAt: null,
  payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"),
  bookingEndAt,
  totalAmount: PAYMENT_AMOUNT,
  refundedAmount: 0,
  vendorNetPayoutAmount: VENDOR_NET,
  actualStripeFeeAmount: 0,
  stripeConnectedAccountId: "acct_apportion",
  stripeChargeId: "ch_apportion",
  stripeTransferId: null,
  vendorAbsorbsStripeFees: false,
  paymentType: "booking",
  bookingCancellationReason: "customer: changed plans",
};

// ── 50% cancellation tier: the exact regression ─────────────────────────────
{
  const refund = Math.round(PAYMENT_AMOUNT * 0.5); // $525.00
  assert.equal(refund, 52_500);

  const result = computePayoutEligibility({ ...baseInput, refundedAmount: refund }, now);

  assert.equal(result.eligible, true, "customer-cancel retained payout is eligible");
  assert.equal(result.payoutStatus, "eligible");
  // Documented rule: (1 − p) × vendorNet, p = 0.5.
  assert.equal(result.adjustedPayoutAmount, 46_000, "50% tier → vendor keeps half their net");
  // The 1:1 bug produced 92000 − 52500 = 39500. Assert we are NOT that.
  assert.notEqual(result.adjustedPayoutAmount, 39_500, "must not deduct the refund 1:1");
}

// ── Platform take on the retained portion stays at the intended rate ────────
{
  const refund = Math.round(PAYMENT_AMOUNT * 0.5);
  const result = computePayoutEligibility({ ...baseInput, refundedAmount: refund }, now);

  const retainedFromCustomer = PAYMENT_AMOUNT - refund; // $525.00 kept
  const platformTake = retainedFromCustomer - result.adjustedPayoutAmount;
  // Retained half of (customerFee + platformFee) = (5000 + 8000)/2 = 6500.
  assert.equal(platformTake, 6_500, "platform keeps only the retained share of both fees");
  const takeRate = platformTake / retainedFromCustomer;
  assert.ok(
    Math.abs(takeRate - (CUSTOMER_FEE + PLATFORM_FEE) / PAYMENT_AMOUNT) < 1e-9,
    `take rate ${takeRate} must equal the headline combined rate, not balloon with p`
  );
}

// ── Tier sweep: every fraction apportions, none subtracts ───────────────────
{
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const refund = Math.round(PAYMENT_AMOUNT * p);
    const result = computePayoutEligibility({ ...baseInput, refundedAmount: refund }, now);
    const expected = Math.round(VENDOR_NET * (1 - refund / PAYMENT_AMOUNT));
    assert.equal(result.adjustedPayoutAmount, expected, `p=${p} apportioned`);
    assert.ok(result.adjustedPayoutAmount >= 0, `p=${p} never negative`);
  }
}

// ── Full refund still floors at exactly 0 ───────────────────────────────────
{
  const full = computePayoutEligibility({ ...baseInput, refundedAmount: PAYMENT_AMOUNT }, now);
  assert.equal(full.adjustedPayoutAmount, 0, "full refund → no payout");

  // Over-refund (deposit lumped in by a legacy/untagged refund) cannot go negative.
  const over = computePayoutEligibility({ ...baseInput, refundedAmount: PAYMENT_AMOUNT * 3 }, now);
  assert.equal(over.adjustedPayoutAmount, 0, "over-refund clamps at 0");
}

// ── No refund → the vendor's full net, untouched ────────────────────────────
{
  const none = computePayoutEligibility({ ...baseInput, refundedAmount: 0 }, now);
  assert.equal(none.adjustedPayoutAmount, VENDOR_NET);
}

// ── Pro vendor (vendor fee waived): apportionment still holds ───────────────
{
  // Pro waives the 8% commission, but the customer fee is universal, so the
  // payment amount still exceeds the vendor's net and the two rules still differ.
  const proVendorNet = SUBTOTAL; // no platform fee withheld
  const refund = Math.round(PAYMENT_AMOUNT * 0.5);
  const result = computePayoutEligibility(
    { ...baseInput, vendorNetPayoutAmount: proVendorNet, refundedAmount: refund },
    now
  );
  assert.equal(result.adjustedPayoutAmount, 50_000, "Pro vendor keeps half of their full subtotal");
  assert.notEqual(result.adjustedPayoutAmount, proVendorNet - refund, "not a 1:1 deduction");
}

// ── Stripe fee is absorbed in FULL, not apportioned ─────────────────────────
{
  // Stripe does not return processing fees on refunds, so a vendor who absorbs
  // them bears the whole cost regardless of the refunded fraction.
  const stripeFee = 3_100;
  const refund = Math.round(PAYMENT_AMOUNT * 0.5);
  const result = computePayoutEligibility(
    {
      ...baseInput,
      refundedAmount: refund,
      actualStripeFeeAmount: stripeFee,
      vendorAbsorbsStripeFees: true,
    },
    now
  );
  assert.equal(result.adjustedPayoutAmount, 46_000 - stripeFee, "apportion net, then full Stripe fee");
}

// ── Missing payment amount fails safe (never pay against an unknown base) ───
{
  const unknown = computePayoutEligibility(
    { ...baseInput, totalAmount: 0, refundedAmount: 10_000 },
    now
  );
  assert.equal(unknown.adjustedPayoutAmount, 0, "unverifiable base → 0, not a 1:1 guess");

  // But with no refund at all, a missing amount must not zero a clean payout.
  const cleanUnknown = computePayoutEligibility(
    { ...baseInput, totalAmount: 0, refundedAmount: 0 },
    now
  );
  assert.equal(cleanUnknown.adjustedPayoutAmount, VENDOR_NET, "no refund → untouched");
}

console.log("payout-refund-apportionment tests passed");
