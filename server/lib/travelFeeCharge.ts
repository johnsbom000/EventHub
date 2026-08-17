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
