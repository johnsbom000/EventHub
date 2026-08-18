import assert from "node:assert/strict";

import { resolveFeeRates } from "../server/services/feeRatesService";
import { VENDOR_FEE_RATE, CUSTOMER_FEE_RATE } from "../server/lib/constants";

const now = new Date("2026-08-17T12:00:00.000Z");

// The customer fee is universal — both models, every subscription status.
for (const model of ["subscription", "commission"] as const) {
  for (const status of ["none", "active", "trialing", "past_due", "canceled"] as const) {
    const rates = resolveFeeRates({ subscriptionStatus: status, pricingModel: model }, now);
    assert.equal(
      rates.customerFeeRate,
      CUSTOMER_FEE_RATE,
      `customer fee is universal for ${model}/${status}`,
    );
  }
}

// Modal A, free tier → pays the vendor fee.
{
  const rates = resolveFeeRates({ subscriptionStatus: "none" }, now);
  assert.equal(rates.vendorFeeRate, VENDOR_FEE_RATE, "Starter pays the vendor fee");
}

// Modal A, paid Pro → vendor fee waived. This is the ONLY waiver.
{
  const rates = resolveFeeRates({ subscriptionStatus: "active" }, now);
  assert.equal(rates.vendorFeeRate, 0, "paid Pro waives the vendor fee");
}

// Modal A, trialing Pro → also waived (isPro is true during the reverse trial).
{
  const rates = resolveFeeRates({ subscriptionStatus: "trialing" }, now);
  assert.equal(rates.vendorFeeRate, 0, "trialing Pro waives the vendor fee");
}

// Modal A, canceled → back to paying.
{
  const rates = resolveFeeRates({ subscriptionStatus: "canceled" }, now);
  assert.equal(rates.vendorFeeRate, VENDOR_FEE_RATE, "canceled Pro pays the vendor fee again");
}

// ── Modal B: ALWAYS pays the vendor fee, no matter what ──────────────────────
// A commission vendor has full Pro FEATURES but no Pro SUBSCRIPTION, so nothing
// waives their fee. This is the revenue model — if it ever returns 0, Modal B
// earns nothing.
for (const status of ["none", "active", "trialing", "past_due", "canceled", "comp"] as const) {
  const rates = resolveFeeRates({ subscriptionStatus: status, pricingModel: "commission" }, now);
  assert.equal(
    rates.vendorFeeRate,
    VENDOR_FEE_RATE,
    `commission vendor ALWAYS pays the vendor fee (status ${status})`,
  );
}

// Absent pricingModel behaves as subscription.
{
  const a = resolveFeeRates({ subscriptionStatus: "none" }, now);
  const b = resolveFeeRates({ subscriptionStatus: "none", pricingModel: "subscription" }, now);
  assert.deepEqual(a, b, "absent pricingModel === subscription");
}

// ── Grandfathered vendors (migration 0164) ───────────────────────────────────
// These are real people who joined when EventHub was free and were told it would
// stay that way. Their VENDOR fee is waived permanently, in every state.
for (const status of ["none", "active", "trialing", "past_due", "canceled", "comp"] as const) {
  const rates = resolveFeeRates({ subscriptionStatus: status, feeExempt: true }, now);
  assert.equal(
    rates.vendorFeeRate,
    0,
    `grandfathered vendor never pays the vendor fee (status ${status})`,
  );
}

// The CUSTOMER fee is NOT waived by grandfathering — it is charged to the
// customer at checkout, not deducted from the vendor.
{
  const rates = resolveFeeRates({ subscriptionStatus: "none", feeExempt: true }, now);
  assert.equal(
    rates.customerFeeRate,
    CUSTOMER_FEE_RATE,
    "grandfathering waives the vendor fee only, never the customer service fee",
  );
}

// Exemption outranks the commission model. Structurally unreachable (0164 only
// backfills rows that predate the commission arm) but asserted so that a future
// reordering of resolveFeeRates cannot silently start billing this cohort.
{
  const rates = resolveFeeRates(
    { subscriptionStatus: "none", pricingModel: "commission", feeExempt: true },
    now,
  );
  assert.equal(rates.vendorFeeRate, 0, "fee exemption wins over the commission model");
}

// Absent/false/null feeExempt must charge the standard rate. `undefined` means
// "column not selected" and MUST NOT be read as exempt — that would waive the
// vendor fee for everyone the moment a partial select forgot the column.
for (const value of [undefined, null, false] as const) {
  const rates = resolveFeeRates({ subscriptionStatus: "none", feeExempt: value }, now);
  assert.equal(
    rates.vendorFeeRate,
    VENDOR_FEE_RATE,
    `feeExempt=${String(value)} must NOT waive the vendor fee`,
  );
}

// A grandfathered vendor who later buys Pro still pays 0 — same answer by a
// different route, but it must not throw or produce a non-zero rate.
{
  const rates = resolveFeeRates({ subscriptionStatus: "active", feeExempt: true }, now);
  assert.equal(rates.vendorFeeRate, 0, "grandfathered + Pro is still 0");
}

// Rates are always finite, non-negative numbers below 1 — never NaN/undefined,
// which would silently produce NaN money downstream.
for (const model of ["subscription", "commission"] as const) {
  const rates = resolveFeeRates({ subscriptionStatus: "none", pricingModel: model }, now);
  for (const [name, value] of Object.entries(rates)) {
    assert.equal(Number.isFinite(value), true, `${name} is finite for ${model}`);
    assert.equal(value >= 0 && value < 1, true, `${name} is a sane rate for ${model}`);
  }
}

console.log("fee-rates-resolution.test.ts: all assertions passed");
