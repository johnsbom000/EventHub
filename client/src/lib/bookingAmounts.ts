type BookingAmountFields = {
  totalAmount?: number | null;
  platformFee?: number | null;
  vendorPayout?: number | null;
  /**
   * The customer service fee actually charged, persisted at booking time.
   * AUTHORITATIVE — always prefer this over deriving the fee as a residual.
   */
  customerFeeAmountCents?: number | null;
  /**
   * Refundable damage deposit. Rides the same charge as the booking but is
   * returned to the customer and never reaches the vendor, so it is neither
   * revenue nor part of any fee base.
   */
  securityDepositCents?: number | null;
};

export function normalizeAmountToCents(value: unknown): number {
  const n = Number(value ?? 0);
  // The current booking flow always writes amounts in cents.
  // Decimal values (legacy dollars written as e.g. 370.00) are scaled up.
  // Any legacy rows that stored whole-dollar integers will need a one-time
  // data migration to correct the stored values — do not add heuristics here.
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isInteger(n)) return Math.round(n * 100);
  return Math.round(n);
}

/**
 * Vendor-facing money breakdown for one booking.
 *
 * The customer fee used to be derived as `totalAmount − listingPrice`. That
 * residual silently swallowed the SECURITY DEPOSIT, because `totalAmount`
 * includes it and `listingPrice` does not — so a $1,200 booking with a $500
 * refundable deposit showed the vendor a "$560 customer service fee" against a
 * real $60, i.e. EventHub appearing to take 54.7% instead of 13%. The deposit
 * is refunded to the customer and never touches the vendor's payout.
 *
 * The fee charged is persisted per booking, so read it rather than infer it.
 * The residual survives only as a fallback for legacy rows, and now subtracts
 * the deposit.
 */
export function deriveBookingAmounts(booking: BookingAmountFields, vendorFeeRate: number) {
  const customerTotalCents = normalizeAmountToCents(booking.totalAmount ?? 0);
  const vendorFeeCents = normalizeAmountToCents(booking.platformFee ?? 0);
  const storedPayoutCents = normalizeAmountToCents(booking.vendorPayout ?? 0);
  const securityDepositCents = normalizeAmountToCents(booking.securityDepositCents ?? 0);
  // `null` means the column was never populated (legacy row) — fall back.
  // A stored 0 is a real value and must NOT trigger the fallback.
  const storedCustomerFee =
    booking.customerFeeAmountCents == null
      ? null
      : normalizeAmountToCents(booking.customerFeeAmountCents);

  if (storedPayoutCents > 0 || vendorFeeCents > 0) {
    const listingPriceCents = Math.max(0, storedPayoutCents + vendorFeeCents);
    const customerFeeCents =
      storedCustomerFee ??
      // Legacy fallback: the residual, with the deposit removed so a refundable
      // deposit is never presented to the vendor as a fee EventHub collected.
      Math.max(0, customerTotalCents - listingPriceCents - securityDepositCents);
    return {
      customerTotalCents,
      listingPriceCents,
      customerFeeCents,
      vendorFeeCents,
      securityDepositCents,
      estimatedPayoutCents: storedPayoutCents > 0 ? storedPayoutCents : Math.max(0, listingPriceCents - vendorFeeCents),
    };
  }

  // Fallback if a legacy row is missing BOTH fee and payout columns. Work from
  // the service portion only — the deposit is not part of any fee base.
  const serviceTotalCents = Math.max(0, customerTotalCents - securityDepositCents);
  const listingPriceCents =
    storedCustomerFee != null
      ? Math.max(0, serviceTotalCents - storedCustomerFee)
      : Math.max(0, Math.round(serviceTotalCents / 1.05));
  const customerFeeCents = storedCustomerFee ?? Math.max(0, serviceTotalCents - listingPriceCents);
  const derivedVendorFeeCents = Math.max(0, Math.round(listingPriceCents * vendorFeeRate));
  const estimatedPayoutCents = Math.max(0, listingPriceCents - derivedVendorFeeCents);
  return {
    customerTotalCents,
    listingPriceCents,
    customerFeeCents,
    vendorFeeCents: derivedVendorFeeCents,
    securityDepositCents,
    estimatedPayoutCents,
  };
}
