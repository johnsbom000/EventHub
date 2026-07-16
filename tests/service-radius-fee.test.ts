import assert from "node:assert/strict";

import {
  getListingLogisticsFeeSummaryCents,
  resolveBookingConfirmationRequirement,
} from "../server/lib/routeUtils";

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

console.log("service-radius-fee.test.ts: all assertions passed");
