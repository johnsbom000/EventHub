import assert from "node:assert/strict";

import { getVendorEntitlements } from "../server/services/entitlementsService";

const now = new Date("2026-08-17T12:00:00.000Z");

// ── Modal B: commission vendors get every feature, but are NOT isPro ──────────
// This is THE invariant of the commission pricing test. isPro drives fee waiver;
// if a commission vendor were isPro, resolveFeeRates would waive their 8% and
// Modal B would earn nothing.
{
  const ent = getVendorEntitlements(
    { subscriptionStatus: "none", pricingModel: "commission" },
    now,
  );
  assert.equal(ent.isPro, false, "commission vendor is NOT isPro — isPro waives fees");
  assert.equal(ent.hasProFeatures, true, "commission vendor has full feature access");
  assert.equal(ent.maxActiveListings, Infinity, "commission vendor has no listing cap");
  assert.equal(ent.canUseAnalytics, true);
  assert.equal(ent.canUseGoogleSync, true);
  assert.equal(ent.canUseDiscounts, true);
  assert.equal(ent.canManageReviews, true);
  assert.equal(ent.canCreateAddons, true);
  assert.equal(ent.plan, "commission");
  assert.equal(ent.showUpgradePrompts, false, "commission vendor sees no upgrade UI");
}

// A commission vendor stays non-Pro regardless of subscription status noise.
for (const status of ["none", "canceled", "trialing", "active", "past_due"] as const) {
  const ent = getVendorEntitlements({ subscriptionStatus: status, pricingModel: "commission" }, now);
  assert.equal(ent.hasProFeatures, true, `commission keeps features for status ${status}`);
  assert.equal(ent.showUpgradePrompts, false, `commission hides upgrade UI for status ${status}`);
  assert.equal(ent.plan, "commission", `commission plan label for status ${status}`);
}

// ── Modal A: unchanged behavior ──────────────────────────────────────────────
{
  const ent = getVendorEntitlements({ subscriptionStatus: "none" }, now);
  assert.equal(ent.isPro, false);
  assert.equal(ent.hasProFeatures, false, "free subscription vendor has no Pro features");
  assert.equal(ent.plan, "free");
  assert.equal(ent.showUpgradePrompts, true, "free subscription vendor sees upgrade UI");
}

{
  const ent = getVendorEntitlements({ subscriptionStatus: "active" }, now);
  assert.equal(ent.isPro, true);
  assert.equal(ent.hasProFeatures, true);
  assert.equal(ent.plan, "pro");
  assert.equal(ent.showUpgradePrompts, true, "Pro vendor still sees billing/upgrade surfaces");
}

// Omitting pricingModel entirely must behave exactly like 'subscription', so
// every pre-existing caller keeps working unchanged.
for (const status of ["none", "active", "trialing", "past_due", "canceled"] as const) {
  const withOut = getVendorEntitlements({ subscriptionStatus: status }, now);
  const withSub = getVendorEntitlements({ subscriptionStatus: status, pricingModel: "subscription" }, now);
  assert.deepEqual(withOut, withSub, `absent pricingModel === 'subscription' for ${status}`);
}

// An unrecognised pricingModel value must fall back to 'subscription' (safe
// direction: never hand out free Pro features on bad data).
{
  const ent = getVendorEntitlements({ subscriptionStatus: "none", pricingModel: "banana" }, now);
  assert.equal(ent.hasProFeatures, false, "unknown pricing model falls back to subscription");
  assert.equal(ent.plan, "free");
}

// ── hasProFeatures must be exactly (isPro OR commission) ─────────────────────
for (const status of ["none", "active", "trialing", "past_due", "canceled"] as const) {
  for (const model of ["subscription", "commission"] as const) {
    const ent = getVendorEntitlements({ subscriptionStatus: status, pricingModel: model }, now);
    assert.equal(
      ent.hasProFeatures,
      ent.isPro || model === "commission",
      `hasProFeatures === isPro || commission for ${status}/${model}`,
    );
  }
}

console.log("pricing-model-entitlements.test.ts: all assertions passed");
