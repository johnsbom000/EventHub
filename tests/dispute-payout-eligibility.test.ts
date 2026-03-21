import assert from "node:assert/strict";

import {
  DISPUTE_WINDOW_HOURS,
  computePayoutEligibility,
  deriveDisputeWindowCloseAt,
  isDisputeWindowOpen,
  type PayoutEligibilityInput,
} from "../server/payoutEligibility";

const now = new Date("2026-03-21T12:00:00.000Z");
const bookingEndAt = new Date("2026-03-20T12:00:00.000Z");

const baseInput: PayoutEligibilityInput = {
  bookingStatus: "completed",
  paymentStatus: "succeeded",
  payoutStatus: "not_ready",
  payoutBlockedReason: null,
  disputeStatus: null,
  bookingDisputeStatus: null,
  paidOutAt: null,
  payoutEligibleAt: null,
  bookingEndAt,
  totalAmount: 12000,
  refundedAmount: 0,
  vendorNetPayoutAmount: 9200,
  actualStripeFeeAmount: 0,
  stripeConnectedAccountId: "acct_123",
  stripeChargeId: "ch_123",
  stripeTransferId: null,
  vendorAbsorbsStripeFees: false,
};

function run() {
  const closeAt = deriveDisputeWindowCloseAt(bookingEndAt);
  assert.ok(closeAt instanceof Date);
  assert.equal(closeAt?.toISOString(), "2026-03-21T12:00:00.000Z");
  assert.equal(DISPUTE_WINDOW_HOURS, 24);

  assert.equal(isDisputeWindowOpen(bookingEndAt, new Date("2026-03-20T18:00:00.000Z")), true);
  assert.equal(isDisputeWindowOpen(bookingEndAt, closeAt!), false);

  const beforeClose = computePayoutEligibility(
    {
      ...baseInput,
      bookingEndAt: new Date("2026-03-21T10:00:00.000Z"),
    },
    now
  );
  assert.equal(beforeClose.eligible, false);
  assert.equal(beforeClose.payoutStatus, "not_ready");
  assert.equal(beforeClose.payoutBlockedReason, "hold_window_not_elapsed");

  const eligibleNoDispute = computePayoutEligibility(baseInput, now);
  assert.equal(eligibleNoDispute.eligible, true);
  assert.equal(eligibleNoDispute.payoutStatus, "eligible");

  const blockedByDispute = computePayoutEligibility(
    {
      ...baseInput,
      bookingDisputeStatus: "filed",
    },
    now
  );
  assert.equal(blockedByDispute.eligible, false);
  assert.equal(blockedByDispute.payoutStatus, "blocked");
  assert.equal(blockedByDispute.payoutBlockedReason, "customer_dispute_open");

  const resolvedRefund = computePayoutEligibility(
    {
      ...baseInput,
      bookingDisputeStatus: "resolved_refund",
    },
    now
  );
  assert.equal(resolvedRefund.eligible, false);
  assert.equal(resolvedRefund.payoutStatus, "cancelled");
  assert.equal(resolvedRefund.payoutBlockedReason, "dispute_refund_approved");

  const resolvedPayout = computePayoutEligibility(
    {
      ...baseInput,
      bookingDisputeStatus: "resolved_payout",
    },
    now
  );
  assert.equal(resolvedPayout.eligible, true);
  assert.equal(resolvedPayout.payoutStatus, "eligible");
}

run();
console.log("dispute-payout-eligibility tests passed");
