import assert from "node:assert/strict";

import { deriveBookingAmounts } from "../client/src/lib/bookingAmounts";

/**
 * The vendor-facing fee breakdown derived the customer service fee as
 * `totalAmount − listingPrice`. That residual silently swallowed the SECURITY
 * DEPOSIT, because totalAmount includes it and listingPrice does not.
 *
 * On a $1,200 booking with a $500 refundable deposit the vendor was shown a
 * "$560 customer service fee" against a real $60 — EventHub appearing to take
 * 54.7% instead of 13%, on the exact screen a vendor opens to check what they
 * earned. With the commission going live this is the most likely trigger for a
 * "you're overcharging me" support ticket.
 */

const VENDOR_FEE_RATE = 0.08;

// $1,200 booking, commission vendor, $500 refundable deposit.
//   subtotal 120000 · customerFee 6000 · platformFee 9600 · deposit 50000
//   total = 120000 + 6000 + 50000 = 176000
const booking = {
  totalAmount: 176000,
  platformFee: 9600,
  vendorPayout: 110400,
  customerFeeAmountCents: 6000,
  securityDepositCents: 50000,
};

{
  const a = deriveBookingAmounts(booking, VENDOR_FEE_RATE);

  assert.equal(a.customerFeeCents, 6000, "customer fee is the persisted $60, not the $560 residual");
  assert.notEqual(a.customerFeeCents, 56000, "the deposit must never be reported as a service fee");
  assert.equal(a.securityDepositCents, 50000, "deposit is surfaced as its own line");
  assert.equal(a.listingPriceCents, 120000, "listing price is payout + commission");
  assert.equal(a.vendorFeeCents, 9600, "commission is the persisted 8%");
  assert.equal(a.estimatedPayoutCents, 110400, "payout is the persisted value");

  // The breakdown must reconcile to what the customer actually paid.
  assert.equal(
    a.listingPriceCents + a.customerFeeCents + a.securityDepositCents,
    a.customerTotalCents,
    "listing + service fee + deposit must equal the customer total",
  );

  // What the vendor perceives EventHub taking must be the real 13%.
  const perceivedTake = a.customerFeeCents + a.vendorFeeCents;
  assert.equal(perceivedTake, 15600, "apparent take is $156");
  assert.equal(
    Math.round((perceivedTake / a.listingPriceCents) * 1000) / 10,
    13.0,
    "apparent take rate is 13%, not 54.7%",
  );
}

// ── A stored 0 fee is a real value, not a missing one ───────────────────────
// A Pro subscriber or grandfathered vendor legitimately has platformFee 0.
// Treating 0 as "missing" would fall back to the residual and reintroduce the bug.
{
  const proBooking = {
    totalAmount: 176000,
    platformFee: 0,
    vendorPayout: 120000,
    customerFeeAmountCents: 6000,
    securityDepositCents: 50000,
  };
  const a = deriveBookingAmounts(proBooking, VENDOR_FEE_RATE);
  assert.equal(a.vendorFeeCents, 0, "a Pro/grandfathered vendor is shown 0 commission");
  assert.equal(a.customerFeeCents, 6000, "customer fee still correct at 0 commission");
  assert.equal(
    a.listingPriceCents + a.customerFeeCents + a.securityDepositCents,
    a.customerTotalCents,
    "breakdown still reconciles at 0 commission",
  );
}

// ── No deposit: unchanged behaviour ─────────────────────────────────────────
{
  const a = deriveBookingAmounts(
    { totalAmount: 126000, platformFee: 9600, vendorPayout: 110400, customerFeeAmountCents: 6000 },
    VENDOR_FEE_RATE,
  );
  assert.equal(a.securityDepositCents, 0);
  assert.equal(a.customerFeeCents, 6000);
  assert.equal(a.listingPriceCents + a.customerFeeCents, a.customerTotalCents, "sums with no deposit");
}

// ── Legacy row with no persisted customer fee: residual, deposit removed ────
{
  const a = deriveBookingAmounts(
    { totalAmount: 176000, platformFee: 9600, vendorPayout: 110400, securityDepositCents: 50000 },
    VENDOR_FEE_RATE,
  );
  assert.equal(
    a.customerFeeCents,
    6000,
    "legacy fallback subtracts the deposit before deriving the fee",
  );
}

// ── Legacy row missing fee AND payout: still must not count the deposit ─────
{
  const a = deriveBookingAmounts(
    { totalAmount: 176000, customerFeeAmountCents: 6000, securityDepositCents: 50000 },
    VENDOR_FEE_RATE,
  );
  assert.equal(a.customerFeeCents, 6000, "persisted fee wins in the legacy branch too");
  assert.equal(a.listingPriceCents, 120000, "listing price excludes the deposit");
  assert.ok(a.listingPriceCents < a.customerTotalCents, "sanity");
}

console.log("vendor-fee-display.test.ts: all assertions passed");
