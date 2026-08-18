import type { FeeRates } from "../services/feeRatesService";

/**
 * Travel/delivery-fee charge breakdown.
 *
 * Travel fees carry the customer service fee exactly like every other booking
 * payment. This mirrors the main booking path (server/routers/bookings.ts,
 * "── Fees ──" block) one-for-one:
 *
 *   chargedAmount    = travelFee + customerFee     ← what the card is charged
 *   vendorGross      = travelFee                   ← the customer fee NEVER
 *                                                     touches the vendor's side
 *   platformFee      = travelFee × vendorFeeRate   ← vendor-side commission
 *   vendorNetPayout  = travelFee − platformFee     ← what the vendor receives
 *   platformRetained = customerFee + platformFee   ← == charged − vendorNetPayout
 *
 * REVENUE/DISCLOSURE CONTRACT: every surface that quotes a travel fee to the
 * CUSTOMER before they pay must quote `chargedAmountCents` (or show the full
 * fee + service-fee + total breakdown). Quoting `travelFeeCents` alone would
 * charge the card more than the page says.
 *
 * Rates MUST come from resolveFeeRates() — this helper deliberately accepts a
 * resolved FeeRates and never reads VENDOR_FEE_RATE / CUSTOMER_FEE_RATE itself,
 * so feeRatesService stays the single rate authority.
 */
export interface TravelFeeChargeBreakdown {
  /** The vendor-proposed travel/delivery fee (vendor-side gross). */
  travelFeeCents: number;
  /** Customer service fee, added ON TOP of the travel fee. */
  customerFeeCents: number;
  /** What the customer's card is actually charged. */
  chargedAmountCents: number;
  /** Vendor-side commission, deducted FROM the travel fee. */
  platformFeeCents: number;
  /** Vendor gross before commission — identical to travelFeeCents by design. */
  vendorGrossCents: number;
  /** What the vendor is owed for this travel fee (before Stripe's fee). */
  vendorNetPayoutCents: number;
  /** Platform's total take on the charge (customer fee + commission). */
  platformRetainedCents: number;
}

export function computeTravelFeeCharge(
  travelFeeCents: number,
  rates: FeeRates
): TravelFeeChargeBreakdown {
  const base = Math.max(0, Math.round(travelFeeCents));
  const customerFeeCents = Math.round(base * rates.customerFeeRate);
  const platformFeeCents = Math.round(base * rates.vendorFeeRate);
  const chargedAmountCents = base + customerFeeCents;
  const vendorNetPayoutCents = Math.max(0, base - platformFeeCents);

  return {
    travelFeeCents: base,
    customerFeeCents,
    chargedAmountCents,
    platformFeeCents,
    vendorGrossCents: base,
    vendorNetPayoutCents,
    // Derived, never independently computed: the platform keeps whatever the
    // customer paid that the vendor is not owed.
    platformRetainedCents: chargedAmountCents - vendorNetPayoutCents,
  };
}

/** The proposal fields the breakdown resolver needs. */
export interface TravelFeeProposalLike {
  bookingId: string;
  amountCents: number;
  vendorAccountId: string;
  status: string;
  createdAt: Date | null;
}

/**
 * Decide, per proposal, whether its breakdown comes from the PERSISTED charge
 * or from a live-rate derivation, and produce it.
 *
 *   pending / declined / expired → nothing was charged, so the only meaningful
 *       quote is a derivation from the vendor's LIVE rates. For a pending
 *       proposal that is also the CORRECT quote: it is what the customer would
 *       pay by accepting right now.
 *   accepted → the money already moved and the rates in force at that moment
 *       were captured on the `payments` row. Those persisted numbers are
 *       authoritative; re-deriving would silently rewrite the economics of a
 *       charge the customer already paid (feeRatesService: "changing a rate
 *       later never rewrites the economics of existing bookings"), so an old
 *       proposal would re-render in chat at a total contradicting its receipt
 *       and the customer's Stripe statement.
 *
 * `payments` has no proposal_id column, so an accepted proposal is paired with
 * its charge by amount: the accept handler writes vendorGrossAmount = the
 * proposal's amountCents by construction (vendorGross IS the travel fee — the
 * customer fee never touches the vendor's side). Rows are claimed greedily in
 * charge order so two accepted proposals at the same amount map to two distinct
 * rows rather than both reading the first.
 *
 * Kept pure (no db access) so the persisted-beats-live-rates rule is testable.
 */
export function resolveTravelFeeProposalBreakdowns<T extends TravelFeeProposalLike>(
  proposals: T[],
  opts: {
    /** bookingId → travel-fee `payments` rows for that booking, OLDEST FIRST. */
    paidRowsByBooking: Map<string, PersistedTravelFeePaymentColumns[]>;
    /** Live rates for a vendor, or null/undefined when unresolvable. */
    ratesForVendor: (vendorAccountId: string) => FeeRates | null | undefined;
  }
): Array<T & TravelFeeChargeBreakdown> {
  const unclaimed = new Map<string, Array<{ row: PersistedTravelFeePaymentColumns; claimed: boolean }>>();
  opts.paidRowsByBooking.forEach((rows, bookingId) => {
    unclaimed.set(
      bookingId,
      rows.map((row) => ({ row, claimed: false }))
    );
  });

  const claimPaidRow = (bookingId: string, amountCents: number) => {
    const bucket = unclaimed.get(bookingId);
    if (!bucket) return null;
    const match = bucket.find((entry) => !entry.claimed && entry.row.vendorGrossAmount === amountCents);
    if (!match) return null;
    match.claimed = true;
    return match.row;
  };

  // Claim in charge order (oldest proposal first) no matter what order the
  // caller wants them back in; the caller's order is restored at the end.
  const claimOrder = proposals
    .map((proposal, index) => ({ proposal, index }))
    .sort((a, b) => (a.proposal.createdAt?.getTime() ?? 0) - (b.proposal.createdAt?.getTime() ?? 0));

  const out = new Array<T & TravelFeeChargeBreakdown>(proposals.length);
  for (const { proposal, index } of claimOrder) {
    if (proposal.status === "accepted") {
      const persisted = breakdownFromPersistedTravelFeePayment(
        claimPaidRow(proposal.bookingId, proposal.amountCents)
      );
      if (persisted) {
        out[index] = { ...proposal, ...persisted };
        continue;
      }
      // EXPLICIT FALLBACK: legacy data only — an accepted proposal whose
      // payments row is missing, or predates the persisted breakdown columns.
      // Deriving from live rates is wrong in principle (it drifts when a rate
      // changes) but it is the only number available, and returning nothing
      // would blank the proposal out of chat history. Falls through below.
    }
    const rates = opts.ratesForVendor(proposal.vendorAccountId);
    // No resolvable vendor (deleted account) → no rates to apply, so the
    // breakdown collapses to the bare fee. Harmless: accept requires a live
    // connected account, so such a proposal can never be charged at all.
    out[index] = {
      ...proposal,
      ...computeTravelFeeCharge(proposal.amountCents, rates ?? { vendorFeeRate: 0, customerFeeRate: 0 }),
    };
  }
  return out;
}

/**
 * The subset of a `payments` row that carries a travel fee's charge-time
 * economics. Column names match `shared/schema.ts` deliberately.
 */
export interface PersistedTravelFeePaymentColumns {
  /** payments.amount — the CUSTOMER-side charged total (fee + service fee). */
  amount: number | null;
  /** payments.vendor_gross_amount — the travel fee itself. */
  vendorGrossAmount: number | null;
  /** payments.platform_fee_amount — vendor-side commission at charge time. */
  platformFeeAmount: number | null;
  /** payments.vendor_net_payout_amount — what the vendor is owed. */
  vendorNetPayoutAmount: number | null;
}

/**
 * Rebuild a charge breakdown from the values PERSISTED when the travel fee was
 * charged, instead of re-deriving it from today's rates.
 *
 * Rates are captured at charge time and stored; stored values are authoritative
 * (see feeRatesService: "changing a rate later never rewrites the economics of
 * existing bookings"). Any surface that describes an ALREADY-CHARGED travel fee
 * must read these numbers — re-deriving would make a historical charge re-render
 * at a rate the customer was never charged, contradicting their receipt and
 * their Stripe statement.
 *
 * Returns `null` when the row cannot supply the economics (missing row, or a
 * legacy row written before these columns were populated). Callers are expected
 * to fall back to `computeTravelFeeCharge` in that case — an explicitly worse
 * but non-fatal answer.
 */
export function breakdownFromPersistedTravelFeePayment(
  row: PersistedTravelFeePaymentColumns | null | undefined
): TravelFeeChargeBreakdown | null {
  if (!row) return null;

  const chargedAmountCents = row.amount;
  const vendorGrossCents = row.vendorGrossAmount;
  // Both customer-side numbers come from these two columns (`payments` has no
  // customer-fee column — the fee is recoverable as amount − vendorGross), so
  // without them there is nothing authoritative to report.
  if (typeof chargedAmountCents !== "number" || typeof vendorGrossCents !== "number") return null;

  // The vendor side needs only ONE of the pair persisted; the other is its
  // complement against the gross. If neither is present the row predates the
  // breakdown entirely and the caller should derive.
  const hasPlatformFee = typeof row.platformFeeAmount === "number";
  const hasVendorNet = typeof row.vendorNetPayoutAmount === "number";
  if (!hasPlatformFee && !hasVendorNet) return null;

  const platformFeeCents = hasPlatformFee
    ? (row.platformFeeAmount as number)
    : vendorGrossCents - (row.vendorNetPayoutAmount as number);
  const vendorNetPayoutCents = hasVendorNet
    ? (row.vendorNetPayoutAmount as number)
    : vendorGrossCents - (row.platformFeeAmount as number);

  return {
    travelFeeCents: vendorGrossCents,
    // Never negative even if a row is malformed; the identities below stay
    // anchored to the two columns the customer actually paid against.
    customerFeeCents: Math.max(0, chargedAmountCents - vendorGrossCents),
    chargedAmountCents,
    platformFeeCents,
    vendorGrossCents,
    vendorNetPayoutCents,
    platformRetainedCents: chargedAmountCents - vendorNetPayoutCents,
  };
}
