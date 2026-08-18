import assert from "node:assert/strict";

import {
  computeTravelFeeCharge,
  breakdownFromPersistedTravelFeePayment,
  resolveTravelFeeProposalBreakdowns,
} from "../server/lib/travelFeeCharge";
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

// ── ACCEPTED proposals read the PERSISTED charge, never today's rates ───────
//
// The regression this pins: `withTravelFeeChargeBreakdown` used to call
// computeTravelFeeCharge(row.amountCents, liveRates) for EVERY proposal
// regardless of status. That is correct for a pending proposal (nothing has
// been charged; the live-rate quote is what accepting now would cost) but wrong
// for an accepted one — the money already moved at the rates captured on the
// `payments` row, and stored values are authoritative (feeRatesService: "changing
// a rate later never rewrites the economics of existing bookings").
//
// It is invisible while CUSTOMER_FEE_RATE holds still, so the test MOVES it: a
// charge settled at 5% must keep reporting $210.00 after the live rate becomes
// 7%, or the chat history would re-render at $214.00 and contradict both the
// receipt and the customer's Stripe statement.
{
  const VENDOR = "va_travel";
  const BOOKING = "bk_travel";

  // The world AFTER a rate change. Derived from resolveFeeRates() output rather
  // than assembled from constants, so this stays a hypothetical *future* value
  // of the one rate authority, not a second place that invents rates.
  const futureRates = { ...rates, customerFeeRate: 0.07 };
  assert.notEqual(futureRates.customerFeeRate, rates.customerFeeRate, "the rate must actually move");

  // What the accept handler persisted when the fee was really charged, at 5%.
  const persistedAt5Pct = {
    amount: charge.chargedAmountCents, //          210_00 — the card's charge
    vendorGrossAmount: charge.vendorGrossCents, // 200_00 — the fee itself
    platformFeeAmount: charge.platformFeeCents, //  16_00
    vendorNetPayoutAmount: charge.vendorNetPayoutCents, // 184_00
  };

  const acceptedProposal = {
    id: "p_accepted",
    bookingId: BOOKING,
    vendorAccountId: VENDOR,
    amountCents: TRAVEL_FEE,
    status: "accepted",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
  };
  const pendingProposal = {
    id: "p_pending",
    bookingId: BOOKING,
    vendorAccountId: VENDOR,
    amountCents: TRAVEL_FEE,
    status: "pending",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
  };

  // Endpoints return newest-first; the resolver must preserve caller order.
  const [pendingOut, acceptedOut] = resolveTravelFeeProposalBreakdowns(
    [pendingProposal, acceptedProposal],
    {
      paidRowsByBooking: new Map([[BOOKING, [persistedAt5Pct]]]),
      // Rates have MOVED since the charge.
      ratesForVendor: () => futureRates,
    }
  );

  assert.equal(pendingOut.id, "p_pending", "caller order preserved");
  assert.equal(acceptedOut.id, "p_accepted", "caller order preserved");

  // The accepted one is frozen at what was actually charged.
  assert.equal(acceptedOut.chargedAmountCents, 210_00, "accepted keeps the $210.00 it was charged");
  assert.equal(acceptedOut.customerFeeCents, 10_00, "accepted keeps its 5% service fee");
  assert.equal(acceptedOut.travelFeeCents, 200_00);
  assert.equal(acceptedOut.platformFeeCents, 16_00, "accepted keeps its charge-time commission");
  assert.equal(acceptedOut.vendorNetPayoutCents, 184_00);
  assert.equal(acceptedOut.platformRetainedCents, 26_00);

  // The pending one — nothing charged yet — correctly quotes the NEW rate.
  assert.equal(pendingOut.chargedAmountCents, 214_00, "pending quotes today's 7%");
  assert.equal(pendingOut.customerFeeCents, 14_00);

  // The whole point: same amount, same vendor, different answers by status.
  assert.notEqual(
    acceptedOut.chargedAmountCents,
    pendingOut.chargedAmountCents,
    "a settled charge must NOT track a later rate change"
  );

  // A declined proposal was never charged either → derives like pending.
  const [declinedOut] = resolveTravelFeeProposalBreakdowns(
    [{ ...pendingProposal, id: "p_declined", status: "declined" }],
    { paidRowsByBooking: new Map([[BOOKING, [persistedAt5Pct]]]), ratesForVendor: () => futureRates }
  );
  assert.equal(declinedOut.chargedAmountCents, 214_00, "declined derives, it has no charge");

  // ── Two accepted proposals on one booking, charged at DIFFERENT rates ─────
  // Each must read its OWN persisted row, in charge order — not both the first.
  {
    const first = { ...acceptedProposal, id: "p_first", createdAt: new Date("2026-03-01T00:00:00.000Z") };
    const second = { ...acceptedProposal, id: "p_second", createdAt: new Date("2026-05-01T00:00:00.000Z") };
    const persistedAt7Pct = {
      amount: 214_00,
      vendorGrossAmount: 200_00,
      platformFeeAmount: 16_00,
      vendorNetPayoutAmount: 184_00,
    };

    const [secondOut, firstOut] = resolveTravelFeeProposalBreakdowns(
      // Newest-first, as the endpoints order them — pairing must still follow
      // charge order, not response order.
      [second, first],
      {
        paidRowsByBooking: new Map([[BOOKING, [persistedAt5Pct, persistedAt7Pct]]]), // oldest first
        ratesForVendor: () => futureRates,
      }
    );
    assert.equal(firstOut.id, "p_first");
    assert.equal(secondOut.id, "p_second");
    assert.equal(firstOut.chargedAmountCents, 210_00, "the older charge keeps its 5% total");
    assert.equal(secondOut.chargedAmountCents, 214_00, "the newer charge keeps its 7% total");
    assert.notEqual(
      firstOut.chargedAmountCents,
      secondOut.chargedAmountCents,
      "same-amount proposals must claim distinct payments rows"
    );
  }

  // ── Legacy data: accepted, but no usable persisted row ────────────────────
  // Documented fallback — derive rather than throw or blank the row out.
  {
    const [noRow] = resolveTravelFeeProposalBreakdowns([acceptedProposal], {
      paidRowsByBooking: new Map(),
      ratesForVendor: () => futureRates,
    });
    assert.equal(noRow.chargedAmountCents, 214_00, "missing payments row falls back to derivation");

    const [legacyRow] = resolveTravelFeeProposalBreakdowns([acceptedProposal], {
      paidRowsByBooking: new Map([
        [
          BOOKING,
          [{ amount: null, vendorGrossAmount: null, platformFeeAmount: null, vendorNetPayoutAmount: null }],
        ],
      ]),
      ratesForVendor: () => futureRates,
    });
    assert.equal(legacyRow.chargedAmountCents, 214_00, "unpopulated columns fall back to derivation");
  }

  // ── The persisted reader itself ───────────────────────────────────────────
  {
    assert.equal(breakdownFromPersistedTravelFeePayment(null), null);
    assert.equal(
      breakdownFromPersistedTravelFeePayment({ ...persistedAt5Pct, amount: null }),
      null,
      "no charged total → nothing authoritative to report"
    );
    // Only ONE of the vendor-side pair is required; the other is its complement.
    const fromNet = breakdownFromPersistedTravelFeePayment({ ...persistedAt5Pct, platformFeeAmount: null });
    assert.equal(fromNet?.platformFeeCents, 16_00, "commission recovered as gross − net");
    const fromFee = breakdownFromPersistedTravelFeePayment({ ...persistedAt5Pct, vendorNetPayoutAmount: null });
    assert.equal(fromFee?.vendorNetPayoutCents, 184_00, "net recovered as gross − commission");
    assert.equal(
      breakdownFromPersistedTravelFeePayment({
        ...persistedAt5Pct,
        platformFeeAmount: null,
        vendorNetPayoutAmount: null,
      }),
      null,
      "no vendor side at all → derive instead"
    );
  }
}

console.log("travel-fee-customer-fee: all assertions passed");
