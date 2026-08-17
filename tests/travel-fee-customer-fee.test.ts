import assert from "node:assert/strict";

import { computeTravelFeeCharge } from "../server/lib/travelFeeCharge";
import { resolveFeeRates } from "../server/services/feeRatesService";
import { computePayoutEligibility, type PayoutEligibilityInput } from "../server/payoutEligibility";
import { VENDOR_FEE_RATE, CUSTOMER_FEE_RATE } from "../server/lib/constants";

/**
 * Pins travel-fee economics at NON-ZERO fee rates.
 *
 * Travel fees used to be the ONLY money on the platform that skipped the
 * "universal" customer service fee: the proposal path applied the vendor
 * commission but charged the customer the bare proposal amount. This file pins
 * the corrected shape — the customer fee rides ON TOP of the proposal, the
 * vendor's side is untouched by it — and guards the disclosure invariant that
 * the charged amount is exactly what a customer-facing surface must quote.
 *
 * Canonical scenario: a $200.00 travel fee from a standard (non-Pro,
 * commission-paying) vendor at 8% vendor / 5% customer.
 *   customer charged  = 200 + 5%  = $210.00
 *   vendor receives   = 200 − 8%  = $184.00
 *   platform retains              =  $26.00
 */

const TRAVEL_FEE = 200_00;

// ── Guard the premise ───────────────────────────────────────────────────────
// If either rate ever goes back to 0 this whole file silently becomes vacuous
// (charged == fee == vendor net), exactly as it was before the rate rollout.
{
  assert.equal(VENDOR_FEE_RATE > 0, true, "vendor fee rate must be non-zero");
  assert.equal(CUSTOMER_FEE_RATE > 0, true, "customer fee rate must be non-zero");
  assert.equal(VENDOR_FEE_RATE, 0.08);
  assert.equal(CUSTOMER_FEE_RATE, 0.05);
}

// ── Rates come from resolveFeeRates(), never from the constants ─────────────
// A standard commission vendor: pays the vendor fee, customer pays the service fee.
const rates = resolveFeeRates({ subscriptionStatus: "none", pricingModel: "commission" });
{
  assert.equal(rates.vendorFeeRate, VENDOR_FEE_RATE, "commission vendor pays the vendor fee");
  assert.equal(rates.customerFeeRate, CUSTOMER_FEE_RATE, "customer fee is universal");
  assert.ok(rates.vendorFeeRate > 0 && rates.customerFeeRate > 0, "both rates non-zero");
}

// ── The headline numbers ────────────────────────────────────────────────────
const charge = computeTravelFeeCharge(TRAVEL_FEE, rates);
{
  assert.equal(charge.travelFeeCents, 200_00, "the vendor's proposed fee is unchanged");
  assert.equal(charge.customerFeeCents, 10_00, "5% service fee on a $200 travel fee");
  assert.equal(charge.chargedAmountCents, 210_00, "customer is charged $210.00");
  assert.equal(charge.platformFeeCents, 16_00, "8% commission on a $200 travel fee");
  assert.equal(charge.vendorNetPayoutCents, 184_00, "vendor receives $184.00");
  assert.equal(charge.platformRetainedCents, 26_00, "platform retains $26.00");

  // The three numbers must be genuinely distinct — the pre-rollout bug was
  // invisible precisely because they collapsed onto one another at rate 0.
  assert.notEqual(charge.chargedAmountCents, charge.travelFeeCents, "charge exceeds the fee");
  assert.notEqual(charge.chargedAmountCents, charge.vendorNetPayoutCents);
  assert.notEqual(charge.travelFeeCents, charge.vendorNetPayoutCents);
}

// ── The accounting identity holds by construction ───────────────────────────
{
  assert.equal(
    charge.platformRetainedCents,
    charge.chargedAmountCents - charge.vendorNetPayoutCents,
    "platform take == charged − vendor net"
  );
  assert.equal(
    charge.platformRetainedCents,
    charge.customerFeeCents + charge.platformFeeCents,
    "platform take == customer fee + commission"
  );
  // The customer fee is NEVER part of the vendor's side.
  assert.equal(charge.vendorGrossCents, charge.travelFeeCents, "vendor gross == the fee itself");
  assert.equal(
    charge.vendorNetPayoutCents,
    charge.vendorGrossCents - charge.platformFeeCents,
    "vendor net is derived from the vendor-side gross only"
  );
  // The customer fee is recoverable from the persisted payments row, which has
  // no dedicated customer-fee column: amount − vendorGrossAmount.
  assert.equal(
    charge.chargedAmountCents - charge.vendorGrossCents,
    charge.customerFeeCents,
    "customer fee is recoverable as amount − vendorGrossAmount"
  );
}

// ── Pro (subscription) vendor: commission waived, service fee still charged ──
{
  const proRates = resolveFeeRates({ subscriptionStatus: "active", pricingModel: "subscription" });
  assert.equal(proRates.vendorFeeRate, 0, "Pro waives the commission");
  assert.equal(proRates.customerFeeRate, CUSTOMER_FEE_RATE, "but never the customer fee");

  const proCharge = computeTravelFeeCharge(TRAVEL_FEE, proRates);
  assert.equal(proCharge.chargedAmountCents, 210_00, "customer still charged $210.00");
  assert.equal(proCharge.vendorNetPayoutCents, 200_00, "Pro vendor keeps the whole fee");
  assert.equal(proCharge.platformRetainedCents, 10_00, "platform keeps only the service fee");
}

// ── Payout apportionment reads the charged total, not the fee ───────────────
// payments.amount / totalAmount for a travel fee are the CUSTOMER-side charge,
// so a partial refund apportions the vendor's net over $210, not $200.
{
  const input: PayoutEligibilityInput = {
    bookingStatus: "completed",
    paymentStatus: "partially_refunded",
    payoutStatus: "not_ready",
    payoutBlockedReason: null,
    disputeStatus: null,
    disputeCaseStatus: null,
    paidOutAt: null,
    payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"),
    bookingEndAt: new Date("2026-03-15T12:00:00.000Z"),
    totalAmount: charge.chargedAmountCents,
    refundedAmount: 0,
    vendorNetPayoutAmount: charge.vendorNetPayoutCents,
    actualStripeFeeAmount: 0,
    stripeConnectedAccountId: "acct_travel",
    stripeChargeId: "ch_travel",
    stripeTransferId: null,
    vendorAbsorbsStripeFees: false,
    paymentType: "travel_fee",
    bookingCancellationReason: null,
  };

  const clean = computePayoutEligibility(input, new Date("2026-03-21T12:00:00.000Z"));
  assert.equal(clean.adjustedPayoutAmount, 184_00, "no refund → the vendor's full $184.00");

  const half = computePayoutEligibility(
    { ...input, refundedAmount: Math.round(charge.chargedAmountCents / 2) },
    new Date("2026-03-21T12:00:00.000Z")
  );
  // 10500/21000 = exactly 50% → 184_00 × 0.5.
  assert.equal(half.adjustedPayoutAmount, 92_00, "half the charge refunded → half the vendor net");

  const full = computePayoutEligibility(
    { ...input, refundedAmount: charge.chargedAmountCents },
    new Date("2026-03-21T12:00:00.000Z")
  );
  assert.equal(full.adjustedPayoutAmount, 0, "full refund of the charge → no payout");
}

// ── Rounding stays coherent at awkward amounts ──────────────────────────────
{
  for (const fee of [1, 99, 333, 1_01, 7_777, 12_345, 100_000_00]) {
    const c = computeTravelFeeCharge(fee, rates);
    assert.equal(c.chargedAmountCents, c.travelFeeCents + c.customerFeeCents, `fee=${fee} charge sums`);
    assert.equal(
      c.platformRetainedCents,
      c.chargedAmountCents - c.vendorNetPayoutCents,
      `fee=${fee} platform take identity`
    );
    assert.ok(c.vendorNetPayoutCents >= 0, `fee=${fee} vendor net never negative`);
    assert.ok(c.vendorNetPayoutCents <= c.travelFeeCents, `fee=${fee} vendor never gets the service fee`);
    assert.ok(c.chargedAmountCents >= c.travelFeeCents, `fee=${fee} charge never below the fee`);
  }
}

// ── Zero / negative input degrades safely ──────────────────────────────────
{
  const zero = computeTravelFeeCharge(0, rates);
  assert.equal(zero.chargedAmountCents, 0);
  assert.equal(zero.vendorNetPayoutCents, 0);
  assert.equal(zero.platformRetainedCents, 0);

  const negative = computeTravelFeeCharge(-500, rates);
  assert.equal(negative.travelFeeCents, 0, "negative fee clamps to 0");
  assert.equal(negative.chargedAmountCents, 0);
}

console.log("travel-fee-customer-fee: all assertions passed");
