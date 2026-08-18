export const DISPUTE_WINDOW_HOURS = 72;

export type PayoutEligibilityInput = {
  bookingStatus: unknown;
  paymentStatus: unknown;
  payoutStatus: unknown;
  payoutBlockedReason: unknown;
  disputeStatus: unknown;
  disputeCaseStatus: unknown;
  paidOutAt: unknown;
  payoutEligibleAt: unknown;
  bookingEndAt: unknown;
  totalAmount: unknown;
  refundedAmount: unknown;
  vendorNetPayoutAmount: unknown;
  actualStripeFeeAmount: unknown;
  stripeConnectedAccountId: unknown;
  stripeChargeId: unknown;
  stripeTransferId: unknown;
  vendorAbsorbsStripeFees: boolean;
  // C7 — retained-payout support. Optional so any existing caller that omits
  // them behaves exactly as before (the retained-cancel bypass simply never
  // triggers). Only a customer cancellation of a booking-type payment can hold
  // the vendor's retained portion; every other cancel path stays a hard cancel.
  paymentType?: unknown;
  bookingCancellationReason?: unknown;
};

export type PayoutEligibilityResult = {
  eligible: boolean;
  payoutStatus: "not_ready" | "eligible" | "paid" | "blocked" | "cancelled";
  payoutEligibleAt: Date | null;
  payoutBlockedReason: string | null;
  adjustedPayoutAmount: number;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePaymentStateValue(value: unknown): string {
  return asTrimmedString(value).toLowerCase();
}

function parseIntegerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function toCanonicalPaymentStatus(value: unknown): string {
  const normalized = normalizePaymentStateValue(value);
  if (!normalized) return "pending";
  if (
    normalized === "pending" ||
    normalized === "requires_action" ||
    normalized === "partial" ||
    normalized === "partially_refunded" ||
    normalized === "paid" ||
    normalized === "succeeded" ||
    normalized === "refunded" ||
    normalized === "failed" ||
    normalized === "disputed"
  ) {
    return normalized;
  }
  return normalized;
}

function isActiveDisputeCase(status: unknown): boolean {
  const normalized = normalizePaymentStateValue(status);
  // 'resolving' (M11) is a transient claim state held while a settlement's
  // Stripe calls are in flight — payouts must stay blocked until it lands on
  // 'resolved', so it counts as active alongside 'open'/'pending_review'.
  return normalized === "open" || normalized === "pending_review" || normalized === "resolving";
}

// A Stripe dispute-status value that must block a payout recompute. Alongside
// the classic needs_response / under_review, any `warning_*` state (early-fraud
// warning / inquiry — a dispute brewing) blocks too, EXCEPT `warning_closed`,
// which is the resolved/cleared terminal state.
function isBlockingDisputeStatus(normalizedStatus: string): boolean {
  if (normalizedStatus === "needs_response" || normalizedStatus === "under_review") return true;
  if (normalizedStatus.startsWith("warning_") && normalizedStatus !== "warning_closed") return true;
  return false;
}

export function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

export function deriveDisputeWindowCloseAt(eventEndedAt: unknown): Date | null {
  const endedAt = toDateOrNull(eventEndedAt);
  if (!endedAt) return null;
  return new Date(endedAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000);
}

export function isDisputeWindowOpen(eventEndedAt: unknown, now = new Date()): boolean {
  const endedAt = toDateOrNull(eventEndedAt);
  const closesAt = deriveDisputeWindowCloseAt(eventEndedAt);
  if (!endedAt || !closesAt) return false;
  return now >= endedAt && now < closesAt;
}

/**
 * The vendor's payout after refunds.
 *
 * A refund is a fraction of the CUSTOMER-side payment row amount
 * (`payments.amount` = serviceOnlyTotal = discountedSubtotal + customerFee),
 * while the vendor's net is a different, smaller number
 * (`vendorNet` = discountedSubtotal − platformFee). Deducting the refund from
 * the payout 1:1 therefore charges the vendor for money that was never theirs —
 * the customer fee and the platform's own commission — so the platform's take on
 * the retained portion balloons as the refund fraction grows.
 *
 * The rule (documented in lib/calculateRefund.ts) is that commission is retained
 * only on the NON-REFUNDED portion, i.e. the vendor keeps `(1 − p)` of their net
 * for refund fraction `p`. So we apportion rather than subtract.
 *
 * Worked example ($1000 subtotal, 8% vendor / 5% customer, 50% cancellation tier):
 *   payment amount = 1000 + 50 = $1050; vendorNet = 1000 − 80 = $920
 *   refund = 50% of $1050 = $525  →  p = 0.5
 *   apportioned payout = 920 × 0.5 = $460   (old 1:1 code gave $920 − $525 = $395,
 *   which quietly lifted the platform's take on the retained half from 13% to ~25%)
 *
 * This was arithmetically invisible while both fee rates were 0 (payment amount
 * == vendorNet, so subtraction and apportionment agreed exactly). It became a
 * real mis-payment the moment the rates went non-zero.
 *
 * The Stripe processing fee is deducted in FULL (not apportioned) when the vendor
 * absorbs it: Stripe does not return processing fees on refunds, so the cost is
 * incurred whole regardless of how much of the charge was refunded.
 */
function deriveAdjustedVendorPayoutAmount(
  input: Pick<
    PayoutEligibilityInput,
    | "vendorNetPayoutAmount"
    | "actualStripeFeeAmount"
    | "refundedAmount"
    | "vendorAbsorbsStripeFees"
    | "totalAmount"
  >
) {
  const baseVendorNet = Math.max(0, parseIntegerValue(input.vendorNetPayoutAmount) ?? 0);
  const actualStripeFee = Math.max(0, parseIntegerValue(input.actualStripeFeeAmount) ?? 0);
  const refundedAmount = Math.max(0, parseIntegerValue(input.refundedAmount) ?? 0);
  const paymentAmount = Math.max(0, parseIntegerValue(input.totalAmount) ?? 0);

  // Fraction of the vendor's net they keep. A refund at or beyond the full
  // payment amount floors the payout at 0; a refund with no known payment
  // amount to apportion against is treated as a full refund (fail safe — never
  // pay out against an amount we cannot verify).
  let retainedFraction: number;
  if (refundedAmount <= 0) {
    retainedFraction = 1;
  } else if (paymentAmount <= 0 || refundedAmount >= paymentAmount) {
    retainedFraction = 0;
  } else {
    retainedFraction = 1 - refundedAmount / paymentAmount;
  }

  const retainedVendorNet = Math.round(baseVendorNet * retainedFraction);
  return input.vendorAbsorbsStripeFees
    ? Math.max(0, retainedVendorNet - actualStripeFee)
    : Math.max(0, retainedVendorNet);
}

export function computePayoutEligibility(input: PayoutEligibilityInput, now = new Date()): PayoutEligibilityResult {
  const bookingStatus = normalizePaymentStateValue(input.bookingStatus);
  const paymentStatus = toCanonicalPaymentStatus(input.paymentStatus);
  const disputeStatus = normalizePaymentStateValue(input.disputeStatus);
  const payoutBlockedReason = asTrimmedString(input.payoutBlockedReason);
  const paidOutAt = toDateOrNull(input.paidOutAt);
  const explicitEligibleAt = toDateOrNull(input.payoutEligibleAt);
  const bookingEndAt = toDateOrNull(input.bookingEndAt);
  const totalAmount = Math.max(0, parseIntegerValue(input.totalAmount) ?? 0);
  const refundedAmount = Math.max(0, parseIntegerValue(input.refundedAmount) ?? 0);
  const adjustedPayoutAmount = deriveAdjustedVendorPayoutAmount(input);
  const alreadyTransferred = Boolean(paidOutAt || asTrimmedString(input.stripeTransferId));
  const disputeCaseStatus = normalizePaymentStateValue(input.disputeCaseStatus);
  const paymentType = normalizePaymentStateValue(input.paymentType);
  const bookingCancellationReason = normalizePaymentStateValue(input.bookingCancellationReason);

  const computedEligibleAt =
    explicitEligibleAt ??
    (bookingEndAt ? new Date(bookingEndAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000) : null);

  if (alreadyTransferred) {
    if (
      paymentStatus === "disputed" ||
      isBlockingDisputeStatus(disputeStatus) ||
      isActiveDisputeCase(disputeCaseStatus)
    ) {
      return {
        eligible: false,
        payoutStatus: "blocked",
        payoutEligibleAt: computedEligibleAt,
        payoutBlockedReason: "dispute_after_payout_manual_recovery",
        adjustedPayoutAmount: 0,
      };
    }
    if (payoutBlockedReason === "refund_after_payout_manual_recovery" || refundedAmount > 0) {
      return {
        eligible: false,
        payoutStatus: "blocked",
        payoutEligibleAt: computedEligibleAt,
        payoutBlockedReason: "refund_after_payout_manual_recovery",
        adjustedPayoutAmount: 0,
      };
    }
    return {
      eligible: false,
      payoutStatus: "paid",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: null,
      adjustedPayoutAmount,
    };
  }

  // C7 — retained payout on a post-window CUSTOMER cancellation. When a customer
  // cancels after the refund window closes, the policy retains the booking
  // amount for the vendor (binary window: 100% refund before, 0% after). The
  // booking row is deliberately kept out of the hard-cancel below so it can flow
  // through the normal hold → eligible → payout pipeline. Guarded tightly:
  //  - paymentType must be 'booking' (held travel fees on a cancelled booking
  //    must still auto-refund, never pay the vendor);
  //  - the cancellation reason must be customer-initiated ('customer…'). Only
  //    customer cancels write that prefix — vendor cancel / no-response / expiry
  //    / webhook full-refund / payment-failed never match.
  const isRetainedCustomerCancel =
    bookingStatus === "cancelled" &&
    paymentType === "booking" &&
    bookingCancellationReason.startsWith("customer");

  if (
    (bookingStatus === "cancelled" && !isRetainedCustomerCancel) ||
    bookingStatus === "failed" ||
    bookingStatus === "expired"
  ) {
    return {
      eligible: false,
      payoutStatus: "cancelled",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "booking_not_payable",
      adjustedPayoutAmount: 0,
    };
  }

  if (paymentStatus === "failed") {
    return {
      eligible: false,
      payoutStatus: "cancelled",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "payment_failed",
      adjustedPayoutAmount: 0,
    };
  }

  if (paymentStatus === "pending" || paymentStatus === "requires_action" || !paymentStatus) {
    return {
      eligible: false,
      payoutStatus: "not_ready",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "payment_not_succeeded",
      adjustedPayoutAmount,
    };
  }

  if (isActiveDisputeCase(disputeCaseStatus)) {
    return {
      eligible: false,
      payoutStatus: "blocked",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "customer_dispute_open",
      adjustedPayoutAmount,
    };
  }

  if (paymentStatus === "disputed" || isBlockingDisputeStatus(disputeStatus)) {
    return {
      eligible: false,
      payoutStatus: "blocked",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "active_dispute",
      adjustedPayoutAmount,
    };
  }

  if (payoutBlockedReason === "refund_under_review") {
    return {
      eligible: false,
      payoutStatus: "blocked",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason,
      adjustedPayoutAmount,
    };
  }

  if (totalAmount > 0 && refundedAmount >= totalAmount) {
    return {
      eligible: false,
      payoutStatus: "cancelled",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "fully_refunded",
      adjustedPayoutAmount: 0,
    };
  }

  if (!computedEligibleAt) {
    return {
      eligible: false,
      payoutStatus: "blocked",
      payoutEligibleAt: null,
      payoutBlockedReason: "missing_event_end_at",
      adjustedPayoutAmount,
    };
  }

  if (now < computedEligibleAt) {
    return {
      eligible: false,
      payoutStatus: "not_ready",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "hold_window_not_elapsed",
      adjustedPayoutAmount,
    };
  }

  if (!asTrimmedString(input.stripeConnectedAccountId)) {
    return {
      eligible: false,
      payoutStatus: "blocked",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "missing_connected_account",
      adjustedPayoutAmount,
    };
  }

  if (!asTrimmedString(input.stripeChargeId)) {
    return {
      eligible: false,
      payoutStatus: "blocked",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "missing_charge_linkage",
      adjustedPayoutAmount,
    };
  }

  if (adjustedPayoutAmount <= 0) {
    return {
      eligible: false,
      payoutStatus: "cancelled",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "no_vendor_payout_remaining",
      adjustedPayoutAmount: 0,
    };
  }

  return {
    eligible: true,
    payoutStatus: "eligible",
    payoutEligibleAt: computedEligibleAt,
    payoutBlockedReason: null,
    adjustedPayoutAmount,
  };
}
