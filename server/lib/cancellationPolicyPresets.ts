/**
 * Cancellation policy types and conversion utilities.
 *
 * Vendors set their cancellation policy in the listing wizard. That choice is
 * converted to a CancellationPolicy object here and snapshotted onto each
 * booking at checkout. Refund logic always reads the snapshot — never the
 * live listing policy.
 */

export interface PolicyTier {
  /** Minimum days before event for this tier to apply (inclusive lower bound). */
  days_before_event: number;
  /** Percentage of total paid that is refunded (0–100). */
  refund_percentage: number;
}

export interface CancellationPolicy {
  preset_type: string;
  tiers: PolicyTier[];
  allow_reschedule: boolean;
  reschedule_window_months: number;
  weather_clause: boolean;
  force_majeure_clause: boolean;
  notes?: string | null;
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface PolicyValidationError {
  field: string;
  message: string;
}

/** Wizard policy values, in sync with the client listing wizard. */
export const CANCELLATION_POLICY_VALUES = [
  "cancel_anytime",
  "cancel_within_hours",
  "cancel_within_days",
  "no_cancellations",
] as const;

export type ListingCancellationPolicyValue = (typeof CANCELLATION_POLICY_VALUES)[number];

/**
 * Resolve the persisted listing policy columns (`cancellation_policy` +
 * `cancellation_policy_days`) from the wizard's `listingData` fields.
 *
 * The wizard sends `cancellationPolicy` plus a window number in
 * `cancellationPolicyHours` (the column name says "days" but stores hours for
 * `cancel_within_hours` — `policyFromListingWizard` divides by 24). Invalid or
 * missing input defaults to `cancel_anytime` with no window, matching the
 * historical full-refund-anytime default.
 *
 * @param policy - raw policy string (e.g. listingData.cancellationPolicy)
 * @param window - raw window number; hours for cancel_within_hours, days for cancel_within_days
 */
export function resolveListingPolicyColumns(
  policy: unknown,
  window: unknown
): { cancellationPolicy: ListingCancellationPolicyValue; cancellationPolicyDays: number | null } {
  const policyRaw = typeof policy === "string" ? policy.trim() : "";
  const resolvedPolicy: ListingCancellationPolicyValue =
    (CANCELLATION_POLICY_VALUES as readonly string[]).includes(policyRaw)
      ? (policyRaw as ListingCancellationPolicyValue)
      : "cancel_anytime";

  let cancellationPolicyDays: number | null = null;
  if (resolvedPolicy === "cancel_within_hours" || resolvedPolicy === "cancel_within_days") {
    const n = typeof window === "number" ? window : Number(window);
    cancellationPolicyDays = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  return { cancellationPolicy: resolvedPolicy, cancellationPolicyDays };
}

/**
 * Convert the listing wizard's simple policy string + window into a full CancellationPolicy.
 * The `days` param stores hours for `cancel_within_hours` and days for `cancel_within_days`.
 */
export function policyFromListingWizard(
  policy: string | null | undefined,
  days: number | null | undefined
): CancellationPolicy {
  const n = typeof days === "number" && days > 0 ? days : null;

  switch (policy) {
    case "cancel_anytime":
      return {
        preset_type: "custom",
        tiers: [{ days_before_event: 0, refund_percentage: 100 }],
        allow_reschedule: false,
        reschedule_window_months: 1,
        weather_clause: false,
        force_majeure_clause: false,
      };

    case "cancel_within_hours": {
      const windowDays = Math.max(1, Math.ceil((n ?? 48) / 24));
      return {
        preset_type: "custom",
        tiers: [
          { days_before_event: windowDays, refund_percentage: 100 },
          { days_before_event: 0, refund_percentage: 0 },
        ],
        allow_reschedule: false,
        reschedule_window_months: 1,
        weather_clause: false,
        force_majeure_clause: false,
      };
    }

    case "cancel_within_days": {
      const windowDays = Math.max(1, n ?? 7);
      return {
        preset_type: "custom",
        tiers: [
          { days_before_event: windowDays, refund_percentage: 100 },
          { days_before_event: 0, refund_percentage: 0 },
        ],
        allow_reschedule: false,
        reschedule_window_months: 1,
        weather_clause: false,
        force_majeure_clause: false,
      };
    }

    case "no_cancellations":
      return {
        preset_type: "custom",
        tiers: [{ days_before_event: 0, refund_percentage: 0 }],
        allow_reschedule: false,
        reschedule_window_months: 1,
        weather_clause: false,
        force_majeure_clause: false,
      };

    default:
      // Pre-policy bookings had no policy disclosed — full refund is the fair default.
      return {
        preset_type: "custom",
        tiers: [{ days_before_event: 0, refund_percentage: 100 }],
        allow_reschedule: false,
        reschedule_window_months: 1,
        weather_clause: false,
        force_majeure_clause: false,
      };
  }
}

export function validatePolicy(policy: CancellationPolicy): PolicyValidationError[] {
  const errors: PolicyValidationError[] = [];

  if (!Array.isArray(policy.tiers) || policy.tiers.length === 0) {
    errors.push({ field: "tiers", message: "At least one refund tier is required." });
    return errors;
  }

  const seenDays = new Set<number>();
  let prevRefund = -1;

  const sorted = [...policy.tiers].sort((a, b) => b.days_before_event - a.days_before_event);

  for (const tier of sorted) {
    if (typeof tier.days_before_event !== "number" || !Number.isFinite(tier.days_before_event) || tier.days_before_event < 0) {
      errors.push({ field: "tiers", message: `days_before_event must be a non-negative number.` });
    }
    if (typeof tier.refund_percentage !== "number" || tier.refund_percentage < 0 || tier.refund_percentage > 100) {
      errors.push({ field: "tiers", message: `refund_percentage must be 0–100.` });
    }
    if (seenDays.has(tier.days_before_event)) {
      errors.push({ field: "tiers", message: `Duplicate days_before_event value: ${tier.days_before_event}.` });
    }
    seenDays.add(tier.days_before_event);

    if (prevRefund !== -1 && tier.refund_percentage > prevRefund) {
      errors.push({
        field: "tiers",
        message: `Refund percentages must be non-increasing as days_before_event decreases (worse notice = worse refund).`,
      });
    }
    prevRefund = tier.refund_percentage;
  }

  if (typeof policy.reschedule_window_months !== "number" || policy.reschedule_window_months < 1) {
    errors.push({ field: "reschedule_window_months", message: "reschedule_window_months must be at least 1." });
  }

  return errors;
}
