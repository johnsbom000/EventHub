import type { CancellationPolicy, PolicyTier } from "./cancellationPolicyPresets";

export interface RefundCalculation {
  /** Days between cancellation date and event date (may be negative if past event). */
  daysUntilEvent: number;
  /** The winning tier, or null if no tiers matched (should not happen with a valid policy). */
  matchedTier: PolicyTier | null;
  /** Refund percentage from the matched tier (0–100). */
  grossRefundPercentage: number;
  /** Refund in cents for the booking payment (does not include security deposit — that is handled separately). */
  grossRefundCents: number;
  /** Platform fee handling note for display purposes. */
  platformFeeNote: string;
}

/**
 * Calculate the booking payment refund for a customer cancellation.
 *
 * IMPORTANT: Always call this with the booking's cancellation_policy_snapshot,
 * never with the live vendor policy.
 *
 * This function calculates the refund on the booking payment only. The security
 * deposit is handled separately — it is always fully refunded on customer
 * cancellation regardless of tier (it is a damage protection mechanism, not a
 * cancellation fee). See the security deposit refund flow in routes.ts.
 *
 * Platform fee rule: commission is retained only on the non-refunded portion.
 * EventHub's effective commission = platformFee * (1 - grossRefundCents / totalAmountCents).
 *
 * Timezone: daysUntilEvent is calculated in the event's local timezone (eventTimezone).
 * Falls back to UTC if timezone is null/invalid.
 *
 * @param totalAmountCents - The booking payment amount (NOT including security deposit).
 * @param eventDate - YYYY-MM-DD string of the event date.
 * @param eventTimezone - IANA timezone string (e.g. "America/Chicago"). Falls back to UTC.
 * @param cancellationDate - The Date when the cancellation is requested.
 * @param policy - The policy object (always from the booking's snapshot).
 */
export function calculateRefund(params: {
  totalAmountCents: number;
  eventDate: string;
  eventTimezone: string | null | undefined;
  cancellationDate: Date;
  policy: CancellationPolicy;
}): RefundCalculation {
  const { totalAmountCents, eventDate, eventTimezone, cancellationDate, policy } = params;

  // ── Step 1: Compute days until event in the event's local timezone ─────────
  // We compare the calendar date of the cancellation (in the event timezone) to
  // the event date. This prevents a customer cancelling at 11pm Pacific from
  // falling into a worse tier than one cancelling at 11pm Eastern.
  const tz = eventTimezone || "UTC";
  let daysUntilEvent: number;
  try {
    const cancellationLocalDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(cancellationDate); // returns "YYYY-MM-DD"

    const [cy, cm, cd] = cancellationLocalDate.split("-").map(Number);
    const [ey, em, ed] = eventDate.split("-").map(Number);

    // Days difference (positive = event is in the future)
    const cancellationMs = Date.UTC(cy, cm - 1, cd);
    const eventMs = Date.UTC(ey, em - 1, ed);
    daysUntilEvent = Math.floor((eventMs - cancellationMs) / (1000 * 60 * 60 * 24));
  } catch {
    // Fallback: simple UTC calculation
    const cancellationDay = new Date(cancellationDate);
    cancellationDay.setUTCHours(0, 0, 0, 0);
    const [ey, em, ed] = eventDate.split("-").map(Number);
    const eventDay = Date.UTC(ey, em - 1, ed);
    daysUntilEvent = Math.floor((eventDay - cancellationDay.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ── Step 2: Find the matching tier ────────────────────────────────────────
  // Sort tiers descending. Walk until days_before_event <= daysUntilEvent.
  // The first match where daysUntilEvent >= tier.days_before_event wins.
  const sortedTiers = [...policy.tiers].sort((a, b) => b.days_before_event - a.days_before_event);

  let matchedTier: PolicyTier | null = null;
  for (const tier of sortedTiers) {
    if (daysUntilEvent >= tier.days_before_event) {
      matchedTier = tier;
      break;
    }
  }

  // If no tier matched (edge case: all tiers have days_before_event > daysUntilEvent),
  // use the lowest tier (minimum refund).
  if (!matchedTier && sortedTiers.length > 0) {
    matchedTier = sortedTiers[sortedTiers.length - 1];
  }

  const grossRefundPercentage = matchedTier?.refund_percentage ?? 0;

  // ── Step 3: Refund amount ─────────────────────────────────────────────────
  const grossRefundCents = Math.floor(totalAmountCents * grossRefundPercentage / 100);

  // ── Step 4: Platform fee note ─────────────────────────────────────────────
  // Commission is retained only on the non-refunded portion.
  const refundedFraction = totalAmountCents > 0 ? grossRefundCents / totalAmountCents : 0;
  const platformFeeNote = refundedFraction === 0
    ? "The platform service fee is not refunded."
    : refundedFraction === 1
    ? "The platform service fee is fully refunded."
    : `The platform service fee is partially refunded (${Math.round(refundedFraction * 100)}% of the fee is returned).`;

  return {
    daysUntilEvent,
    matchedTier,
    grossRefundPercentage,
    grossRefundCents,
    platformFeeNote,
  };
}
