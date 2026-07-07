import assert from "node:assert/strict";

import {
  MAX_PAYOUT_TRANSFER_RETRIES,
  payoutTransferFailureBlockedReason,
  isAutoPayoutCandidate,
} from "../server/lib/routeUtils";

// ── Retry count → blocked reason transitions ─────────────────────────────────
// Mirrors the SQL CASE in processSinglePayoutCandidate's transfer-failure
// catch block: attempts below the cap stay auto-retryable, the cap and beyond
// are parked for admin-only reprocessing.

assert.equal(MAX_PAYOUT_TRANSFER_RETRIES, 10);
assert.equal(payoutTransferFailureBlockedReason(1), "transfer_failed");
assert.equal(payoutTransferFailureBlockedReason(5), "transfer_failed");
assert.equal(
  payoutTransferFailureBlockedReason(MAX_PAYOUT_TRANSFER_RETRIES - 1),
  "transfer_failed"
);
assert.equal(
  payoutTransferFailureBlockedReason(MAX_PAYOUT_TRANSFER_RETRIES),
  "transfer_failed_permanent"
);
assert.equal(
  payoutTransferFailureBlockedReason(MAX_PAYOUT_TRANSFER_RETRIES + 1),
  "transfer_failed_permanent"
);

// ── Auto-payout candidate predicate ──────────────────────────────────────────
// Mirrors the WHERE clause of the auto-payout worker's candidate query
// (runAutoPayoutTickWithResult in backgroundJobs.ts).

const base = {
  paymentType: "booking",
  stripeTransferId: null,
  payoutStatus: "eligible",
  payoutBlockedReason: null,
};

// Normal pipeline states are selected.
assert.equal(isAutoPayoutCandidate({ ...base }), true);
assert.equal(isAutoPayoutCandidate({ ...base, payoutStatus: "not_ready" }), true);
assert.equal(isAutoPayoutCandidate({ ...base, paymentType: "travel_fee" }), true);

// A retryable transfer failure re-enters the pipeline...
assert.equal(
  isAutoPayoutCandidate({
    ...base,
    payoutStatus: "blocked",
    payoutBlockedReason: "transfer_failed",
  }),
  true
);

// ...but a permanent one never does (admin endpoint only).
assert.equal(
  isAutoPayoutCandidate({
    ...base,
    payoutStatus: "blocked",
    payoutBlockedReason: "transfer_failed_permanent",
  }),
  false
);

// Other blocked reasons are not auto-retried either.
for (const reason of [
  "active_dispute",
  "customer_dispute_open",
  "missing_transfer_requirements",
  "stripe_charge_not_found",
  "transfer_after_ineligible_manual_recovery",
  "refund_after_payout_manual_recovery",
  "travel_fee_hold",
]) {
  assert.equal(
    isAutoPayoutCandidate({ ...base, payoutStatus: "blocked", payoutBlockedReason: reason }),
    false,
    `blocked/${reason} must not be auto-retried`
  );
}

// 'scheduled' rows are actively claimed by a processor — never re-selected
// (stuck claims belong to stale-claim recovery, not the candidate query).
assert.equal(isAutoPayoutCandidate({ ...base, payoutStatus: "scheduled" }), false);

// Terminal / already-moved states.
assert.equal(isAutoPayoutCandidate({ ...base, payoutStatus: "paid" }), false);
assert.equal(isAutoPayoutCandidate({ ...base, payoutStatus: "cancelled" }), false);
assert.equal(isAutoPayoutCandidate({ ...base, stripeTransferId: "tr_123" }), false);

// Security deposits never ride the payout pipeline.
assert.equal(isAutoPayoutCandidate({ ...base, paymentType: "security_deposit" }), false);

console.log("payout-retry-eligibility: all assertions passed");
