export const DISPUTE_WINDOW_HOURS = 24;

export type BookingDisputeLifecycleStatus =
  | "filed"
  | "vendor_responded"
  | "resolved_refund"
  | "resolved_payout";

export type PayoutEligibilityInput = {
  bookingStatus: unknown;
  paymentStatus: unknown;
  payoutStatus: unknown;
  payoutBlockedReason: unknown;
  disputeStatus: unknown;
  bookingDisputeStatus: unknown;
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

function isActiveBookingDispute(status: unknown): boolean {
  const normalized = normalizePaymentStateValue(status);
  return normalized === "filed" || normalized === "vendor_responded";
}

function isRefundResolvedBookingDispute(status: unknown): boolean {
  return normalizePaymentStateValue(status) === "resolved_refund";
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

function deriveAdjustedVendorPayoutAmount(
  input: Pick<
    PayoutEligibilityInput,
    "vendorNetPayoutAmount" | "actualStripeFeeAmount" | "refundedAmount" | "vendorAbsorbsStripeFees"
  >
) {
  const baseVendorNet = Math.max(0, parseIntegerValue(input.vendorNetPayoutAmount) ?? 0);
  const actualStripeFee = Math.max(0, parseIntegerValue(input.actualStripeFeeAmount) ?? 0);
  const refundedAmount = Math.max(0, parseIntegerValue(input.refundedAmount) ?? 0);
  const vendorNetAfterFeeModel = input.vendorAbsorbsStripeFees
    ? Math.max(0, baseVendorNet - actualStripeFee)
    : baseVendorNet;
  return Math.max(0, vendorNetAfterFeeModel - refundedAmount);
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
  const bookingDisputeStatus = normalizePaymentStateValue(input.bookingDisputeStatus);

  const computedEligibleAt =
    explicitEligibleAt ??
    (bookingEndAt ? new Date(bookingEndAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000) : null);

  if (alreadyTransferred) {
    if (
      paymentStatus === "disputed" ||
      disputeStatus === "needs_response" ||
      disputeStatus === "under_review" ||
      isActiveBookingDispute(bookingDisputeStatus)
    ) {
      return {
        eligible: false,
        payoutStatus: "blocked",
        payoutEligibleAt: computedEligibleAt,
        payoutBlockedReason: "dispute_after_payout_manual_recovery",
        adjustedPayoutAmount: 0,
      };
    }
    if (isRefundResolvedBookingDispute(bookingDisputeStatus)) {
      return {
        eligible: false,
        payoutStatus: "blocked",
        payoutEligibleAt: computedEligibleAt,
        payoutBlockedReason: "dispute_refund_after_payout_manual_recovery",
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

  if (bookingStatus === "cancelled" || bookingStatus === "failed" || bookingStatus === "expired") {
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

  if (isActiveBookingDispute(bookingDisputeStatus)) {
    return {
      eligible: false,
      payoutStatus: "blocked",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "customer_dispute_open",
      adjustedPayoutAmount,
    };
  }

  if (isRefundResolvedBookingDispute(bookingDisputeStatus)) {
    return {
      eligible: false,
      payoutStatus: "cancelled",
      payoutEligibleAt: computedEligibleAt,
      payoutBlockedReason: "dispute_refund_approved",
      adjustedPayoutAmount: 0,
    };
  }

  if (paymentStatus === "disputed" || disputeStatus === "needs_response" || disputeStatus === "under_review") {
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
