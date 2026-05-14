/**
 * Cancellation policy types and preset definitions.
 *
 * Presets are seed data used to pre-fill the policy editor.
 * Once a vendor selects a preset, their policy is stored as a regular
 * editable policy — presets have no ongoing behavioral significance.
 */

export interface PolicyTier {
  /** Minimum days before event for this tier to apply (inclusive lower bound). */
  days_before_event: number;
  /** Percentage of total paid that is refunded (0–100). */
  refund_percentage: number;
}

export interface CancellationPolicy {
  preset_type: "flexible" | "moderate" | "strict" | "custom";
  tiers: PolicyTier[];
  allow_reschedule: boolean;
  reschedule_window_months: number;
  weather_clause: boolean;
  force_majeure_clause: boolean;
  notes?: string | null;
}

// ── Preset definitions ─────────────────────────────────────────────────────

export const PRESET_FLEXIBLE: CancellationPolicy = {
  preset_type: "flexible",
  tiers: [
    { days_before_event: 7, refund_percentage: 100 },
    { days_before_event: 3, refund_percentage: 50 },
    { days_before_event: 0, refund_percentage: 0 },
  ],
  allow_reschedule: true,
  reschedule_window_months: 12,
  weather_clause: false,
  force_majeure_clause: false,
};

export const PRESET_MODERATE: CancellationPolicy = {
  preset_type: "moderate",
  tiers: [
    { days_before_event: 30, refund_percentage: 100 },
    { days_before_event: 14, refund_percentage: 50 },
    { days_before_event: 7,  refund_percentage: 25 },
    { days_before_event: 0,  refund_percentage: 0 },
  ],
  allow_reschedule: true,
  reschedule_window_months: 12,
  weather_clause: false,
  force_majeure_clause: true,
};

export const PRESET_STRICT: CancellationPolicy = {
  preset_type: "strict",
  tiers: [
    { days_before_event: 60, refund_percentage: 100 },
    { days_before_event: 30, refund_percentage: 50 },
    { days_before_event: 0,  refund_percentage: 0 },
  ],
  allow_reschedule: true,
  reschedule_window_months: 12,
  weather_clause: false,
  force_majeure_clause: true,
};

export const PRESETS: Record<"flexible" | "moderate" | "strict", CancellationPolicy> = {
  flexible: PRESET_FLEXIBLE,
  moderate: PRESET_MODERATE,
  strict:   PRESET_STRICT,
};

/**
 * Auto-select preset based on listing category.
 * Rental → Moderate, everything else → Strict.
 */
export function defaultPresetForCategory(category: string | null | undefined): CancellationPolicy {
  const cat = (category || "").toLowerCase();
  if (cat.includes("rental") || cat.includes("equipment")) return PRESET_MODERATE;
  return PRESET_STRICT;
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface PolicyValidationError {
  field: string;
  message: string;
}

export function validatePolicy(policy: CancellationPolicy): PolicyValidationError[] {
  const errors: PolicyValidationError[] = [];

  if (!Array.isArray(policy.tiers) || policy.tiers.length === 0) {
    errors.push({ field: "tiers", message: "At least one refund tier is required." });
    return errors;
  }

  const seenDays = new Set<number>();
  let prevDays = Infinity;
  let prevRefund = -1;

  // Expect tiers sorted descending by days_before_event
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

    // Refund % must be non-increasing as days decreases (can't have a better refund when less notice given)
    if (prevRefund !== -1 && tier.refund_percentage > prevRefund) {
      errors.push({
        field: "tiers",
        message: `Refund percentages must be non-increasing as days_before_event decreases (worse notice = worse refund).`,
      });
    }
    prevRefund = tier.refund_percentage;
    prevDays = tier.days_before_event;
  }

  if (typeof policy.reschedule_window_months !== "number" || policy.reschedule_window_months < 1) {
    errors.push({ field: "reschedule_window_months", message: "reschedule_window_months must be at least 1." });
  }

  return errors;
}
