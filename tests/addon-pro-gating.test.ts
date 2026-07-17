import assert from "node:assert/strict";

import { getVendorEntitlements } from "../server/services/entitlementsService";

const now = new Date("2026-07-17T12:00:00.000Z");

// Free vendor (no subscription) → add-ons blocked.
{
  const ent = getVendorEntitlements({ subscriptionStatus: "none" }, now);
  assert.equal(ent.isPro, false);
  assert.equal(ent.canCreateAddons, false, "free vendor cannot create add-ons");
}

// Active Pro → add-ons allowed.
{
  const ent = getVendorEntitlements({ subscriptionStatus: "active" }, now);
  assert.equal(ent.isPro, true);
  assert.equal(ent.canCreateAddons, true, "active Pro can create add-ons");
}

// Trialing Pro → add-ons allowed.
{
  const ent = getVendorEntitlements({ subscriptionStatus: "trialing" }, now);
  assert.equal(ent.canCreateAddons, true, "trialing Pro can create add-ons");
}

// Past-due (still Pro during dunning) → add-ons allowed.
{
  const ent = getVendorEntitlements({ subscriptionStatus: "past_due" }, now);
  assert.equal(ent.canCreateAddons, true, "past_due keeps add-ons during retry window");
}

// Active comp grant → add-ons allowed.
{
  const ent = getVendorEntitlements(
    { subscriptionStatus: "comp", compEndsAt: new Date(now.getTime() + 86_400_000) },
    now,
  );
  assert.equal(ent.canCreateAddons, true, "active comp can create add-ons");
}

// Expired comp grant → back to Free, add-ons blocked.
{
  const ent = getVendorEntitlements(
    { subscriptionStatus: "comp", compEndsAt: new Date(now.getTime() - 86_400_000) },
    now,
  );
  assert.equal(ent.isPro, false);
  assert.equal(ent.canCreateAddons, false, "expired comp cannot create add-ons");
}

// Canceled → add-ons blocked (the downgrade case publish-gating defends against).
{
  const ent = getVendorEntitlements({ subscriptionStatus: "canceled" }, now);
  assert.equal(ent.canCreateAddons, false, "canceled vendor cannot create add-ons");
}

// canCreateAddons must track isPro exactly — it is the sole add-on paywall signal.
for (const status of ["none", "active", "trialing", "past_due", "canceled"] as const) {
  const ent = getVendorEntitlements({ subscriptionStatus: status }, now);
  assert.equal(ent.canCreateAddons, ent.isPro, `canCreateAddons mirrors isPro for ${status}`);
}

console.log("addon-pro-gating.test.ts: all assertions passed");
