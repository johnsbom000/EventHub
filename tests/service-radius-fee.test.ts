import assert from "node:assert/strict";

import {
  getListingLogisticsFeeSummaryCents,
  resolveBookingConfirmationRequirement,
} from "../server/lib/routeUtils";
import { buildListingLogisticsPayload } from "../client/src/lib/listingLogistics";

// Service center: downtown Salt Lake City. Radius 30 miles.
const CENTER = { lat: 40.7608, lng: -111.891 };
const INSIDE = { lat: 40.79, lng: -111.9 }; // ~2 miles from center
const OUTSIDE = { lat: 42.0, lng: -111.9 }; // ~85 miles north of center

function summary(opts: {
  travelOffered?: boolean;
  travelFeeEnabled?: boolean;
  travelFeeType?: string | null;
  travelFeeAmountCents?: number | null;
  servesOutsideRadius?: boolean;
  event?: { lat: number; lng: number } | null;
}) {
  return getListingLogisticsFeeSummaryCents({
    listingData: {},
    canonical: {
      travelOffered: opts.travelOffered ?? true,
      travelFeeEnabled: opts.travelFeeEnabled ?? true,
      travelFeeType: opts.travelFeeType ?? "flat",
      travelFeeAmountCents: opts.travelFeeAmountCents ?? 5000,
      servesOutsideRadius: opts.servesOutsideRadius ?? false,
      serviceRadiusMiles: 30,
      listingServiceCenterLat: CENTER.lat,
      listingServiceCenterLng: CENTER.lng,
    },
    event: opts.event === undefined ? INSIDE : opts.event,
  });
}

// ── Inside radius + flat → charge flat, no proposal, not blocked ──────────────
{
  const r = summary({ travelFeeType: "flat", event: INSIDE });
  assert.equal(r.travelFlatFeeCents, 5000, "inside+flat charges the flat fee");
  assert.equal(r.feeProposalPending, false);
  assert.equal(r.blockedOutsideRadius, false);
  assert.equal(r.isOutsideRadius, false);
}

// ── Inside radius + variable → no auto fee, proposal expected ─────────────────
{
  const r = summary({ travelFeeType: "variable", event: INSIDE });
  assert.equal(r.travelFlatFeeCents, 0, "inside+variable does not auto-charge");
  assert.equal(r.feeProposalPending, true, "inside+variable expects a proposal");
  assert.equal(r.blockedOutsideRadius, false);
}

// ── Outside radius + served → no auto fee, proposal replaces flat ─────────────
{
  const r = summary({ travelFeeType: "flat", servesOutsideRadius: true, event: OUTSIDE });
  assert.equal(r.isOutsideRadius, true);
  assert.equal(r.travelFlatFeeCents, 0, "outside does not charge the inside flat fee");
  assert.equal(r.feeProposalPending, true, "outside+served expects a proposal");
  assert.equal(r.blockedOutsideRadius, false);
}

// ── Outside radius + NOT served → blocked ─────────────────────────────────────
{
  const r = summary({ travelFeeType: "flat", servesOutsideRadius: false, event: OUTSIDE });
  assert.equal(r.isOutsideRadius, true);
  assert.equal(r.blockedOutsideRadius, true, "outside + not served → blocked");
  assert.equal(r.travelFlatFeeCents, 0);
}

// ── Missing event coords → treated as inside (permissive) ─────────────────────
{
  const r = summary({ travelFeeType: "flat", event: null });
  assert.equal(r.isOutsideRadius, false, "missing coords → inside");
  assert.equal(r.travelFlatFeeCents, 5000, "missing coords still charges flat");
  assert.equal(r.blockedOutsideRadius, false);
}

// ── travelOffered = false → radius irrelevant, never blocks/charges ──────────
{
  const r = summary({ travelOffered: false, travelFeeEnabled: false, event: OUTSIDE });
  assert.equal(r.isOutsideRadius, false, "non-traveling listing ignores radius");
  assert.equal(r.blockedOutsideRadius, false);
  assert.equal(r.travelFlatFeeCents, 0);
  assert.equal(r.feeProposalPending, false);
}

// ── Legacy per_mile / per_hour normalize to variable (proposal) ──────────────
{
  const r = summary({ travelFeeType: "per_mile", event: INSIDE });
  assert.equal(r.travelFlatFeeCents, 0, "legacy per_mile does not auto-charge");
  assert.equal(r.feeProposalPending, true, "legacy per_mile → proposal");
}

// ── resolveBookingConfirmationRequirement ─────────────────────────────────────
{
  // instant + no proposal → confirmed
  assert.equal(
    resolveBookingConfirmationRequirement({ isInstantBooking: true, feeProposalPending: false }).initialStatus,
    "confirmed",
  );
  // instant + proposal pending → pending (must confirm)
  assert.equal(
    resolveBookingConfirmationRequirement({ isInstantBooking: true, feeProposalPending: true }).initialStatus,
    "pending",
  );
  // request-to-book → pending regardless
  assert.equal(
    resolveBookingConfirmationRequirement({ isInstantBooking: false, feeProposalPending: false }).initialStatus,
    "pending",
  );
  assert.equal(
    resolveBookingConfirmationRequirement({ isInstantBooking: true, feeProposalPending: true }).requiresVendorConfirmation,
    true,
  );
}

// ── buildListingLogisticsPayload (shared wizard/edit-page writer) ─────────────
{
  // Service: the travel toggle drives travelOffered — a title-only edit must
  // round-trip travel config unchanged (regression: edit page once wiped it).
  const service = buildListingLogisticsPayload({
    category: "Service",
    servesOutsideRadius: true,
    travelOffered: true,
    deliveryIncluded: false, // wizard stores an explicit false for Services
    feeEnabled: true,
    feeType: "flat",
    feeAmountCents: 5000,
  });
  assert.equal(service.travelOffered, true, "Service keeps travelOffered despite deliveryIncluded:false");
  assert.equal(service.travelFeeEnabled, true);
  assert.equal(service.travelFeeType, "flat");
  assert.equal(service.travelFeeAmountCents, 5000);
  assert.equal(service.servesOutsideRadius, true);
  assert.equal(service.deliveryOffered, false, "Service never writes delivery flags on");
}

{
  // Rental: the delivery toggle drives travelOffered; variable fee carries no amount.
  const rental = buildListingLogisticsPayload({
    category: "Rental",
    servesOutsideRadius: false,
    travelOffered: false,
    deliveryIncluded: true,
    feeEnabled: true,
    feeType: "variable",
    feeAmountCents: 5000,
  });
  assert.equal(rental.travelOffered, true, "Rental maps deliveryIncluded → travelOffered");
  assert.equal(rental.travelFeeType, "variable");
  assert.equal(rental.travelFeeAmountCents, null, "variable fee never persists an amount");
  assert.equal(rental.deliveryOffered, true);
  assert.equal(rental.pickupOffered, true);
}

{
  // Category with neither section (Venue): everything forced off.
  const venue = buildListingLogisticsPayload({
    category: "Venue",
    servesOutsideRadius: true,
    travelOffered: true,
    deliveryIncluded: true,
    feeEnabled: true,
    feeType: "flat",
    feeAmountCents: 5000,
  });
  assert.equal(venue.travelOffered, false);
  assert.equal(venue.travelFeeEnabled, false);
  assert.equal(venue.travelFeeType, null);
  assert.equal(venue.servesOutsideRadius, false);
}

{
  // Fee cannot be enabled when the vendor doesn't travel/deliver at all.
  const notOffered = buildListingLogisticsPayload({
    category: "Service",
    servesOutsideRadius: false,
    travelOffered: false,
    deliveryIncluded: false,
    feeEnabled: true,
    feeType: "flat",
    feeAmountCents: 5000,
  });
  assert.equal(notOffered.travelFeeEnabled, false, "fee gated on offered");
  assert.equal(notOffered.travelFeeType, null);
  assert.equal(notOffered.travelFeeAmountCents, null);
}

console.log("service-radius-fee.test.ts: all assertions passed");
