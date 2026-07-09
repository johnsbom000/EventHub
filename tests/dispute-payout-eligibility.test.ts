import assert from "node:assert/strict";

import {
  DISPUTE_WINDOW_HOURS,
  computePayoutEligibility,
  deriveDisputeWindowCloseAt,
  isDisputeWindowOpen,
  type PayoutEligibilityInput,
} from "../server/payoutEligibility";

const now = new Date("2026-03-21T12:00:00.000Z");
// Far enough back that the 72h hold window has elapsed by `now`.
const bookingEndAt = new Date("2026-03-15T12:00:00.000Z");

const baseInput: PayoutEligibilityInput = {
  bookingStatus: "completed",
  paymentStatus: "succeeded",
  payoutStatus: "not_ready",
  payoutBlockedReason: null,
  disputeStatus: null,
  disputeCaseStatus: null,
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
  // ── Window math (72h) ──────────────────────────────────────────────────────
  assert.equal(DISPUTE_WINDOW_HOURS, 72);
  const closeAt = deriveDisputeWindowCloseAt(bookingEndAt);
  assert.ok(closeAt instanceof Date);
  assert.equal(closeAt?.toISOString(), "2026-03-18T12:00:00.000Z");

  assert.equal(isDisputeWindowOpen(bookingEndAt, new Date("2026-03-16T12:00:00.000Z")), true);
  assert.equal(isDisputeWindowOpen(bookingEndAt, closeAt!), false);

  // ── Hold window not elapsed ─────────────────────────────────────────────────
  const beforeClose = computePayoutEligibility(
    { ...baseInput, bookingEndAt: new Date("2026-03-21T10:00:00.000Z") },
    now
  );
  assert.equal(beforeClose.eligible, false);
  assert.equal(beforeClose.payoutStatus, "not_ready");
  assert.equal(beforeClose.payoutBlockedReason, "hold_window_not_elapsed");

  // ── Happy path: eligible after window, no dispute ───────────────────────────
  const eligibleNoDispute = computePayoutEligibility(baseInput, now);
  assert.equal(eligibleNoDispute.eligible, true);
  assert.equal(eligibleNoDispute.payoutStatus, "eligible");
  assert.equal(eligibleNoDispute.adjustedPayoutAmount, 9200);

  // ── Dispute case blocks ─────────────────────────────────────────────────────
  const blockedByDisputeCase = computePayoutEligibility(
    { ...baseInput, disputeCaseStatus: "open" },
    now
  );
  assert.equal(blockedByDisputeCase.eligible, false);
  assert.equal(blockedByDisputeCase.payoutStatus, "blocked");
  assert.equal(blockedByDisputeCase.payoutBlockedReason, "customer_dispute_open");

  const blockedByStripeDispute = computePayoutEligibility(
    { ...baseInput, disputeStatus: "needs_response" },
    now
  );
  assert.equal(blockedByStripeDispute.eligible, false);
  assert.equal(blockedByStripeDispute.payoutStatus, "blocked");
  assert.equal(blockedByStripeDispute.payoutBlockedReason, "active_dispute");

  // ── M11 — 'resolving' claim state counts as an active dispute ───────────────
  // While a settlement handler holds the case in 'resolving' (its Stripe calls
  // in flight), the not-yet-transferred payout must stay blocked exactly like
  // an 'open' case.
  const blockedByResolvingCase = computePayoutEligibility(
    { ...baseInput, disputeCaseStatus: "resolving" },
    now
  );
  assert.equal(blockedByResolvingCase.eligible, false);
  assert.equal(blockedByResolvingCase.payoutStatus, "blocked");
  assert.equal(blockedByResolvingCase.payoutBlockedReason, "customer_dispute_open");

  // ...and on the already-transferred branch it routes to manual recovery too.
  const transferredResolvingCase = computePayoutEligibility(
    {
      ...baseInput,
      paidOutAt: new Date("2026-03-19T12:00:00.000Z"),
      stripeTransferId: "tr_123",
      disputeCaseStatus: "resolving",
    },
    now
  );
  assert.equal(transferredResolvingCase.eligible, false);
  assert.equal(transferredResolvingCase.payoutStatus, "blocked");
  assert.equal(
    transferredResolvingCase.payoutBlockedReason,
    "dispute_after_payout_manual_recovery"
  );

  // ── 1g — warning_* Stripe statuses block, except warning_closed ─────────────
  for (const warn of ["warning_needs_response", "warning_under_review"]) {
    const blocked = computePayoutEligibility({ ...baseInput, disputeStatus: warn }, now);
    assert.equal(blocked.payoutStatus, "blocked", `${warn} should block`);
    assert.equal(blocked.payoutBlockedReason, "active_dispute", `${warn} reason`);
  }
  // warning_closed is resolved — payout proceeds.
  const warningClosed = computePayoutEligibility(
    { ...baseInput, disputeStatus: "warning_closed" },
    now
  );
  assert.equal(warningClosed.eligible, true);
  assert.equal(warningClosed.payoutStatus, "eligible");

  // 1g on the already-transferred path — warning_* routes to manual recovery.
  const transferredWarning = computePayoutEligibility(
    {
      ...baseInput,
      paidOutAt: new Date("2026-03-19T12:00:00.000Z"),
      stripeTransferId: "tr_123",
      disputeStatus: "warning_needs_response",
    },
    now
  );
  assert.equal(transferredWarning.payoutStatus, "blocked");
  assert.equal(transferredWarning.payoutBlockedReason, "dispute_after_payout_manual_recovery");

  // ── C7 — retained-payout allowance matrix ───────────────────────────────────
  // A post-window customer cancellation on the BOOKING row is paid to the vendor
  // (vendorNet − refunded), NOT hard-cancelled.
  const customerRetainedElapsed = computePayoutEligibility(
    {
      ...baseInput,
      bookingStatus: "cancelled",
      paymentType: "booking",
      bookingCancellationReason: "customer: changed plans",
      payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"), // hold elapsed
    },
    now
  );
  assert.equal(customerRetainedElapsed.eligible, true, "customer retained → eligible");
  assert.equal(customerRetainedElapsed.payoutStatus, "eligible");
  assert.equal(customerRetainedElapsed.adjustedPayoutAmount, 9200, "vendorNet − refunded");

  // Same, but the 72h hold has NOT elapsed yet → not_ready (still held for vendor).
  const customerRetainedHeld = computePayoutEligibility(
    {
      ...baseInput,
      bookingStatus: "cancelled",
      paymentType: "booking",
      bookingCancellationReason: "customer_cancel",
      payoutEligibleAt: new Date("2026-03-25T12:00:00.000Z"), // future
    },
    now
  );
  assert.equal(customerRetainedHeld.eligible, false);
  assert.equal(customerRetainedHeld.payoutStatus, "not_ready");
  assert.equal(customerRetainedHeld.payoutBlockedReason, "hold_window_not_elapsed");

  // Retained portion net of refunds: a partial refund shrinks the payout.
  const customerRetainedPartialRefund = computePayoutEligibility(
    {
      ...baseInput,
      bookingStatus: "cancelled",
      paymentType: "booking",
      bookingCancellationReason: "customer: partial",
      refundedAmount: 2000,
      payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"),
    },
    now
  );
  assert.equal(customerRetainedPartialRefund.eligible, true);
  assert.equal(customerRetainedPartialRefund.adjustedPayoutAmount, 7200, "9200 − 2000 refunded");

  // Non-customer cancel reasons stay a HARD cancel (no retained payout).
  for (const reason of [
    "vendor_cancellation",
    "vendor: emergency",
    "no_response_auto_cancel",
    "payment_refunded",
    "admin_dispute_refund",
    "expired",
  ]) {
    const hardCancel = computePayoutEligibility(
      {
        ...baseInput,
        bookingStatus: "cancelled",
        paymentType: "booking",
        bookingCancellationReason: reason,
        payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"),
      },
      now
    );
    assert.equal(hardCancel.payoutStatus, "cancelled", `${reason} → cancelled`);
    assert.equal(hardCancel.payoutBlockedReason, "booking_not_payable", `${reason} reason`);
    assert.equal(hardCancel.adjustedPayoutAmount, 0, `${reason} amount 0`);
  }

  // A held travel_fee on a customer-cancelled booking must STILL hard-cancel
  // (auto-refunds to the customer) — only booking-type payments are retained.
  const travelOnCustomerCancel = computePayoutEligibility(
    {
      ...baseInput,
      bookingStatus: "cancelled",
      paymentType: "travel_fee",
      bookingCancellationReason: "customer: changed plans",
      payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"),
    },
    now
  );
  assert.equal(travelOnCustomerCancel.payoutStatus, "cancelled", "travel_fee not retained");
  assert.equal(travelOnCustomerCancel.payoutBlockedReason, "booking_not_payable");

  // Fully-refunded booking on a customer cancel → cancelled (fully_refunded),
  // even though the retained guard was bypassed.
  const fullyRefundedCustomerCancel = computePayoutEligibility(
    {
      ...baseInput,
      bookingStatus: "cancelled",
      paymentType: "booking",
      bookingCancellationReason: "customer_cancel",
      refundedAmount: 12000,
      payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"),
    },
    now
  );
  assert.equal(fullyRefundedCustomerCancel.payoutStatus, "cancelled");
  assert.equal(fullyRefundedCustomerCancel.payoutBlockedReason, "fully_refunded");

  // Open dispute on a customer-retained cancel still blocks (dispute wins).
  const disputeOnRetained = computePayoutEligibility(
    {
      ...baseInput,
      bookingStatus: "cancelled",
      paymentType: "booking",
      bookingCancellationReason: "customer_cancel",
      disputeCaseStatus: "open",
      payoutEligibleAt: new Date("2026-03-18T12:00:00.000Z"),
    },
    now
  );
  assert.equal(disputeOnRetained.payoutStatus, "blocked");
  assert.equal(disputeOnRetained.payoutBlockedReason, "customer_dispute_open");

  // Inputs omitted (legacy caller) → the cancelled guard behaves exactly as
  // before: a cancelled booking hard-cancels the payout.
  const legacyCancelled = computePayoutEligibility({ ...baseInput, bookingStatus: "cancelled" }, now);
  assert.equal(legacyCancelled.payoutStatus, "cancelled");
  assert.equal(legacyCancelled.payoutBlockedReason, "booking_not_payable");
}

run();
console.log("dispute-payout-eligibility tests passed");
