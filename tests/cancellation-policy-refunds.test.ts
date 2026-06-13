import assert from "node:assert/strict";

import { calculateRefund } from "../server/lib/calculateRefund";
import { policyFromListingWizard } from "../server/lib/cancellationPolicyPresets";

const cancellationDate = new Date("2026-06-12T12:00:00.000Z");

function calculate(policy: string, window: number | null, eventDate: string, amount = 10_000) {
  return calculateRefund({
    totalAmountCents: amount,
    eventDate,
    eventTimezone: "America/Denver",
    cancellationDate,
    policy: policyFromListingWizard(policy, window),
  });
}

assert.equal(calculate("cancel_anytime", null, "2026-06-13").grossRefundCents, 10_000);
assert.equal(calculate("no_cancellations", null, "2026-07-01").grossRefundCents, 0);

const outsideWindow = calculate("cancel_within_hours", 48, "2026-06-15");
assert.equal(outsideWindow.grossRefundPercentage, 100);
assert.equal(outsideWindow.grossRefundCents, 10_000);

const insideWindow = calculate("cancel_within_hours", 48, "2026-06-13");
assert.equal(insideWindow.grossRefundPercentage, 0);
assert.equal(insideWindow.grossRefundCents, 0);

const partialAmount = calculate("cancel_anytime", null, "2026-06-13", 5_525);
assert.equal(partialAmount.grossRefundCents, 5_525);

console.log("cancellation-policy-refunds tests passed");
