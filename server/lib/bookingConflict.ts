import { parseIntegerValue } from "./routeUtils";

// Pure booking-conflict / double-booking capacity helpers.
//
// Kept free of any DB import so the capacity decisions are unit-testable in a
// plain node process (see tests/booking-conflict-integrity.test.ts). The
// booking-create path (server/routers/bookings.ts) and the pre-check service
// (server/services/bookingService.ts) both build on these.

/**
 * Resolve which listing id and capacity a booking conflict-check should use.
 *
 * For a dependent package the container is the shared-capacity pool: every
 * package_item variant draws from the container's single quantity, so we check
 * against the CONTAINER id and the container's quantity (C3/M9). For every other
 * listing we check against the listing itself and its own available quantity.
 */
export function resolvePackageConflictTarget(params: {
  isDependentPackage: boolean;
  containerId: string | null;
  containerQuantity: number | null;
  listingId: string | null;
  listingAvailableQuantity: number;
}): { conflictCheckListingId: string; conflictCheckQuantity: number } {
  if (params.isDependentPackage) {
    return {
      conflictCheckListingId: params.containerId ?? "",
      conflictCheckQuantity: Math.max(1, Math.floor((params.containerQuantity ?? 1) || 1)),
    };
  }
  return {
    conflictCheckListingId: params.listingId ?? "",
    conflictCheckQuantity: params.listingAvailableQuantity,
  };
}

/**
 * Sum reserved units across overlapping booking rows. A row with a null/zero/
 * negative quantity counts as one unit (a booking always reserves at least one).
 */
export function sumReservedUnits(rows: Array<{ quantity?: number | null }>): number {
  return rows.reduce((total, row) => {
    const quantity = parseIntegerValue(row.quantity);
    return total + (quantity && quantity > 0 ? quantity : 1);
  }, 0);
}

/** True when accepting `requestedQuantity` more units would exceed `capacity`. */
export function exceedsCapacity(reservedUnits: number, requestedQuantity: number, capacity: number): boolean {
  const requested = Math.max(1, Math.floor(requestedQuantity || 1));
  const cap = Math.max(1, Math.floor(capacity || 1));
  return reservedUnits + requested > cap;
}
