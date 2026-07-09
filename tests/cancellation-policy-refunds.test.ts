import assert from "node:assert/strict";

import { calculateRefund } from "../server/lib/calculateRefund";
import {
  policyFromListingWizard,
  resolveListingPolicyColumns,
} from "../server/lib/cancellationPolicyPresets";
import { buildCanonicalListingColumns } from "../server/lib/routeUtils";

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

// ── C7 retained-portion math: retained = amount − grossRefundCents ───────────
// The retained portion is what the vendor is paid when a customer cancels
// AFTER the policy window closes (0% refund → full amount retained). Pin the
// math the booking cancel handler uses to size the retained payout.
const retained = (amount: number, grossRefundCents: number) => Math.max(0, amount - grossRefundCents);

// Post-window (no refund) → the whole booking amount is retained for the vendor.
assert.equal(retained(10_000, insideWindow.grossRefundCents), 10_000);
// Within-window (full refund) → nothing retained (hard cancel).
assert.equal(retained(10_000, outsideWindow.grossRefundCents), 0);
// no_cancellations after the fact retains everything.
assert.equal(retained(10_000, calculate("no_cancellations", null, "2026-07-01").grossRefundCents), 10_000);

// ── resolveListingPolicyColumns: wizard payload → persisted columns ──────────
assert.deepEqual(resolveListingPolicyColumns("cancel_within_hours", 48), {
  cancellationPolicy: "cancel_within_hours",
  cancellationPolicyDays: 48,
});
// hours window only applies to windowed policies; ignored for anytime/none
assert.deepEqual(resolveListingPolicyColumns("cancel_anytime", 48), {
  cancellationPolicy: "cancel_anytime",
  cancellationPolicyDays: null,
});
assert.deepEqual(resolveListingPolicyColumns("no_cancellations", null), {
  cancellationPolicy: "no_cancellations",
  cancellationPolicyDays: null,
});
// string window is coerced; invalid/zero windows drop to null
assert.deepEqual(resolveListingPolicyColumns("cancel_within_hours", "48"), {
  cancellationPolicy: "cancel_within_hours",
  cancellationPolicyDays: 48,
});
assert.deepEqual(resolveListingPolicyColumns("cancel_within_hours", 0), {
  cancellationPolicy: "cancel_within_hours",
  cancellationPolicyDays: null,
});
// unknown / missing policy defaults to the historical full-refund-anytime value
assert.deepEqual(resolveListingPolicyColumns("garbage", 10), {
  cancellationPolicy: "cancel_anytime",
  cancellationPolicyDays: null,
});
assert.deepEqual(resolveListingPolicyColumns(undefined, undefined), {
  cancellationPolicy: "cancel_anytime",
  cancellationPolicyDays: null,
});

// ── buildCanonicalListingColumns: persists policy from listingData ───────────
const classification = { category: null, subcategory: null } as const;

const created = buildCanonicalListingColumns({
  listingDataRaw: { cancellationPolicy: "cancel_within_hours", cancellationPolicyHours: 48 },
  classification,
});
assert.equal(created.cancellationPolicy, "cancel_within_hours");
assert.equal(created.cancellationPolicyDays, 48);

// missing policy in listingData → default, not undefined (prevents NULL columns)
const noPolicy = buildCanonicalListingColumns({ listingDataRaw: {}, classification });
assert.equal(noPolicy.cancellationPolicy, "cancel_anytime");
assert.equal(noPolicy.cancellationPolicyDays, null);

// partial update without a policy falls back to the existing column (no wipe)
const preserved = buildCanonicalListingColumns({
  listingDataRaw: { title: "Edited title" },
  existingCanonical: { cancellationPolicy: "no_cancellations" },
  classification,
});
assert.equal(preserved.cancellationPolicy, "no_cancellations");

console.log("cancellation-policy-refunds tests passed");
