import assert from "node:assert/strict";

import { isCommissionVendor } from "../server/services/feeRatesService";

// A commission vendor must be recognisable from the account row alone, so every
// billing route can reject them before touching Stripe.
{
  assert.equal(isCommissionVendor({ pricingModel: "commission" }), true);
  assert.equal(isCommissionVendor({ pricingModel: "subscription" }), false);
  assert.equal(isCommissionVendor({}), false, "absent pricingModel is subscription");
  assert.equal(isCommissionVendor({ pricingModel: null }), false);
  assert.equal(isCommissionVendor({ pricingModel: "banana" }), false, "unknown value is subscription");
}

console.log("pricing-model-exclusivity.test.ts: all assertions passed");
