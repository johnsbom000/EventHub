// ---------------------------------------------------------------------------
// Per-row refund attribution (C6)
// ---------------------------------------------------------------------------
//
// A booking payment and its security deposit share a single Stripe
// PaymentIntent / charge. Stripe's `charge.refunded` webhook only tells us the
// CUMULATIVE `amount_refunded` on the charge — writing that raw total onto one
// payment row (as the old handler did) corrupts every row that shares the PI.
//
// This module splits a charge's refund list back onto the individual payment
// rows. Every refund we issue is tagged with `metadata.paymentRowId` (see
// `refundBookingPayment`), so the common path is an exact per-row split. For
// legacy refunds created before tagging existed, and for refunds initiated from
// the Stripe dashboard (which carry no metadata), we fall back to a
// deposit-first allocation of the untagged remainder.
//
// The function is PURE and DB-free. It is idempotent by construction: it always
// re-derives each row's total attributed refund from the COMPLETE refund list,
// so replaying the same webhook (or a later one carrying earlier refunds) yields
// the same result rather than accumulating.

export type RefundLike = {
  amount?: number | null;
  metadata?: Record<string, string> | null;
};

export type ApportionmentPaymentRow = {
  id: string;
  /** 'booking' | 'security_deposit' | 'travel_fee' */
  paymentType?: string | null;
  /** The row's own charge amount in cents (its refund ceiling). */
  amount: number;
  /** Refund already recorded on the row (authoritative for deposit rows). */
  refundAmount?: number | null;
};

function toNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function isDepositType(paymentType: string | null | undefined): boolean {
  return (paymentType ?? "").toLowerCase() === "security_deposit";
}

function isBookingType(paymentType: string | null | undefined): boolean {
  return (paymentType ?? "").toLowerCase() === "booking";
}

/**
 * Attribute a charge's refunds to the payment rows that share its PaymentIntent.
 *
 * @param refunds     Every refund on the charge (e.g. from `listRefundsForCharge`).
 * @param paymentRows The payment rows for the shared PaymentIntent.
 * @returns Map of paymentRowId → total refunded cents attributable to that row,
 *          clamped to `[0, row.amount]`.
 */
export function apportionChargeRefunds(
  refunds: RefundLike[],
  paymentRows: ApportionmentPaymentRow[]
): Map<string, number> {
  const rowsById = new Map(paymentRows.map((r) => [r.id, r]));
  const attributed = new Map<string, number>();
  for (const r of paymentRows) attributed.set(r.id, 0);

  // 1) Sum tagged refunds directly onto their row; collect the untagged/legacy
  //    remainder for deposit-first fallback allocation.
  let untagged = 0;
  for (const refund of refunds ?? []) {
    const amt = toNonNegativeInt(refund?.amount);
    if (amt <= 0) continue;
    const rowId =
      typeof refund?.metadata?.paymentRowId === "string" ? refund.metadata.paymentRowId : "";
    if (rowId && rowsById.has(rowId)) {
      attributed.set(rowId, (attributed.get(rowId) ?? 0) + amt);
    } else {
      untagged += amt;
    }
  }

  // 2) Clamp each row's tagged total to its charge amount (a row can never be
  //    refunded more than it was charged).
  for (const r of paymentRows) {
    attributed.set(r.id, Math.min(attributed.get(r.id) ?? 0, toNonNegativeInt(r.amount)));
  }

  // 3) Reserve each deposit row's already-recorded refund. The deposit job /
  //    dispute settlement write the deposit's refund authoritatively, so it is
  //    the "− deposit row's recorded refundAmount" term of the fallback: the
  //    deposit's known refund is held back so untagged charge refunds flow to
  //    the booking row instead of being re-attributed to the deposit.
  for (const r of paymentRows) {
    if (!isDepositType(r.paymentType)) continue;
    const recorded = Math.min(toNonNegativeInt(r.refundAmount), toNonNegativeInt(r.amount));
    attributed.set(r.id, Math.max(attributed.get(r.id) ?? 0, recorded));
  }

  // 4) Allocate the untagged remainder deposit-first, then booking, then any
  //    other rows — each capped at its remaining charge capacity. Anything left
  //    over (should never happen — refunds cannot exceed the charge) is dropped.
  if (untagged > 0) {
    const ordered = [
      ...paymentRows.filter((r) => isDepositType(r.paymentType)),
      ...paymentRows.filter((r) => isBookingType(r.paymentType)),
      ...paymentRows.filter((r) => !isDepositType(r.paymentType) && !isBookingType(r.paymentType)),
    ];
    for (const r of ordered) {
      if (untagged <= 0) break;
      const room = Math.max(0, toNonNegativeInt(r.amount) - (attributed.get(r.id) ?? 0));
      const take = Math.min(untagged, room);
      if (take > 0) {
        attributed.set(r.id, (attributed.get(r.id) ?? 0) + take);
        untagged -= take;
      }
    }
  }

  return attributed;
}
