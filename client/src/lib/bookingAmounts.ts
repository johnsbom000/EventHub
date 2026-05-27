type BookingAmountFields = {
  totalAmount?: number | null;
  platformFee?: number | null;
  vendorPayout?: number | null;
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

export function deriveBookingAmounts(booking: BookingAmountFields, vendorFeeRate: number) {
  const customerTotalCents = normalizeAmountToCents(booking.totalAmount ?? 0);
  const vendorFeeCents = normalizeAmountToCents(booking.platformFee ?? 0);
  const storedPayoutCents = normalizeAmountToCents(booking.vendorPayout ?? 0);

  if (storedPayoutCents > 0 || vendorFeeCents > 0) {
    const listingPriceCents = Math.max(0, storedPayoutCents + vendorFeeCents);
    const customerFeeCents = Math.max(0, customerTotalCents - listingPriceCents);
    return {
      customerTotalCents,
      listingPriceCents,
      customerFeeCents,
      vendorFeeCents,
      estimatedPayoutCents: storedPayoutCents > 0 ? storedPayoutCents : Math.max(0, listingPriceCents - vendorFeeCents),
    };
  }

  // Fallback if legacy row is missing fee/payout columns.
  const listingPriceCents = Math.max(0, Math.round(customerTotalCents / 1.05));
  const customerFeeCents = Math.max(0, customerTotalCents - listingPriceCents);
  const derivedVendorFeeCents = Math.max(0, Math.round(listingPriceCents * vendorFeeRate));
  const estimatedPayoutCents = Math.max(0, listingPriceCents - derivedVendorFeeCents);
  return {
    customerTotalCents,
    listingPriceCents,
    customerFeeCents,
    vendorFeeCents: derivedVendorFeeCents,
    estimatedPayoutCents,
  };
}
