import assert from "node:assert/strict";

import {
  resolvePackageConflictTarget,
  sumReservedUnits,
  exceedsCapacity,
} from "../server/lib/bookingConflict";
import { normalizeTravelFeeType } from "../server/lib/routeUtils";
import { resolveListingPolicyColumns } from "../server/lib/cancellationPolicyPresets";

// ─────────────────────────────────────────────────────────────────────────────
// C3 / M9 — dependent-package container pool conflict target
//
// A dependent package's variants all draw from the CONTAINER's single capacity
// pool. The conflict check must therefore target the container id + container
// quantity, not the individual package_item, or sibling bookings are invisible
// and the pool oversells.
// ─────────────────────────────────────────────────────────────────────────────
{
  const target = resolvePackageConflictTarget({
    isDependentPackage: true,
    containerId: "container-1",
    containerQuantity: 2,
    listingId: "package-item-A",
    listingAvailableQuantity: 99, // the package_item's own quantity is irrelevant in dependent mode
  });
  assert.equal(target.conflictCheckListingId, "container-1", "dependent → lock/count the container id");
  assert.equal(target.conflictCheckQuantity, 2, "dependent → capacity is the container quantity");
}

// Independent / plain listing: check against the listing itself.
{
  const target = resolvePackageConflictTarget({
    isDependentPackage: false,
    containerId: "container-1",
    containerQuantity: 2,
    listingId: "listing-9",
    listingAvailableQuantity: 3,
  });
  assert.equal(target.conflictCheckListingId, "listing-9");
  assert.equal(target.conflictCheckQuantity, 3);
}

// Container quantity floors to at least 1 even when null/0.
{
  const target = resolvePackageConflictTarget({
    isDependentPackage: true,
    containerId: "c",
    containerQuantity: null,
    listingId: "p",
    listingAvailableQuantity: 5,
  });
  assert.equal(target.conflictCheckQuantity, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// sumReservedUnits — a booking always reserves ≥ 1 unit
// ─────────────────────────────────────────────────────────────────────────────
{
  assert.equal(sumReservedUnits([]), 0, "no overlaps → 0 reserved");
  assert.equal(sumReservedUnits([{ quantity: 2 }, { quantity: 3 }]), 5, "sums explicit quantities");
  assert.equal(
    sumReservedUnits([{ quantity: null }, { quantity: 0 }, { quantity: -4 }]),
    3,
    "null/zero/negative each count as one unit"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// exceedsCapacity — the dependent-pool oversell scenario (C3/M9)
//
// Container capacity 2. Variant A already booked ×2 for the window → pool full.
// A variant-B request for the same window must be rejected (oversell), whereas
// with only 1 reserved the same request fits.
// ─────────────────────────────────────────────────────────────────────────────
{
  const capacity = 2;
  const reservedByVariantA = sumReservedUnits([{ quantity: 2 }]);
  assert.equal(
    exceedsCapacity(reservedByVariantA, 1, capacity),
    true,
    "variant A ×2 fills the 2-unit pool → variant B ×1 must be rejected"
  );

  const reservedPartial = sumReservedUnits([{ quantity: 1 }]);
  assert.equal(
    exceedsCapacity(reservedPartial, 1, capacity),
    false,
    "1 reserved of 2 → a further single unit still fits"
  );

  // Exact fill is allowed; one more is not.
  assert.equal(exceedsCapacity(0, 2, capacity), false, "booking the full pool at once is allowed");
  assert.equal(exceedsCapacity(2, 1, capacity), true, "one unit beyond a full pool is rejected");
}

// ─────────────────────────────────────────────────────────────────────────────
// M5 (3d) — package routes must normalize travelFeeType instead of persisting
// arbitrary client strings.
// ─────────────────────────────────────────────────────────────────────────────
{
  // Canonical fee types are "flat" and "variable". Legacy per_mile/per_hour normalize
  // to "variable" (both route to the post-booking proposal flow).
  assert.equal(normalizeTravelFeeType("flat"), "flat");
  assert.equal(normalizeTravelFeeType("variable"), "variable");
  assert.equal(normalizeTravelFeeType("per_mile"), "variable");
  assert.equal(normalizeTravelFeeType("per_hour"), "variable");
  assert.equal(normalizeTravelFeeType("PER_MILE"), "variable", "case-insensitive");
  assert.equal(normalizeTravelFeeType("  flat  "), "flat", "trimmed");
  assert.equal(normalizeTravelFeeType("nonsense"), null, "junk → null");
  assert.equal(normalizeTravelFeeType(""), null);
  assert.equal(normalizeTravelFeeType(undefined), null);
  assert.equal(normalizeTravelFeeType(42 as unknown), null);
}

// ─────────────────────────────────────────────────────────────────────────────
// M5 (3d) — cancellation policy must resolve to an allowed preset; junk falls
// back to cancel_anytime and the window is only kept for windowed policies.
// ─────────────────────────────────────────────────────────────────────────────
{
  assert.deepEqual(resolveListingPolicyColumns("no_cancellations", 5), {
    cancellationPolicy: "no_cancellations",
    cancellationPolicyDays: null,
  });
  assert.deepEqual(resolveListingPolicyColumns("cancel_within_hours", 48), {
    cancellationPolicy: "cancel_within_hours",
    cancellationPolicyDays: 48,
  });
  assert.deepEqual(resolveListingPolicyColumns("evil'; drop table bookings; --", 3), {
    cancellationPolicy: "cancel_anytime",
    cancellationPolicyDays: null,
  });
  assert.deepEqual(resolveListingPolicyColumns(undefined, undefined), {
    cancellationPolicy: "cancel_anytime",
    cancellationPolicyDays: null,
  });
}

console.log("booking-conflict-integrity.test.ts: all assertions passed");
