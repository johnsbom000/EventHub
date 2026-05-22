import { RefreshCw, Cloud, ShieldCheck } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
// Mirror of server/lib/cancellationPolicyPresets.ts — kept in sync manually.

export interface PolicyTier {
  days_before_event: number;
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

// ─── Tier rendering helpers ───────────────────────────────────────────────────

interface RenderedTier {
  timeLabel: string;
  refundLabel: string;
  pct: number;
}

function renderTiers(tiers: PolicyTier[]): RenderedTier[] {
  if (!tiers.length) return [];
  const sorted = [...tiers].sort((a, b) => b.days_before_event - a.days_before_event);

  return sorted.map((tier, i) => {
    const lowerBound = tier.days_before_event;
    const prevDays = i > 0 ? sorted[i - 1].days_before_event : null;

    // Time window label
    let timeLabel: string;
    if (i === 0) {
      // Best (most notice) tier
      if (lowerBound === 0) {
        timeLabel = "Any time";
      } else {
        timeLabel = `${lowerBound}+ days before event`;
      }
    } else if (lowerBound === 0) {
      // Non-refundable window at the end
      const windowDays = prevDays!;
      timeLabel = `Within ${windowDays} day${windowDays === 1 ? "" : "s"} of event`;
    } else {
      // Middle tier — show range
      const upperBound = prevDays! - 1;
      if (upperBound === lowerBound) {
        timeLabel = `${lowerBound} day${lowerBound === 1 ? "" : "s"} before event`;
      } else {
        timeLabel = `${lowerBound}–${upperBound} days before event`;
      }
    }

    // Refund label
    let refundLabel: string;
    if (tier.refund_percentage === 100) {
      refundLabel = "Full refund";
    } else if (tier.refund_percentage === 0) {
      refundLabel = "No refund";
    } else {
      refundLabel = `${tier.refund_percentage}% refund`;
    }

    return { timeLabel, refundLabel, pct: tier.refund_percentage };
  });
}

function tierColorClass(pct: number): string {
  if (pct === 100) return "text-green-700";
  if (pct >= 50)   return "text-amber-600";
  if (pct > 0)     return "text-orange-600";
  return "text-muted-foreground";
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CancellationPolicyDisplayProps {
  policy: CancellationPolicy;
}

export function CancellationPolicyDisplay({ policy }: CancellationPolicyDisplayProps) {
  const tiers = renderTiers(policy.tiers);

  return (
    <div className="space-y-2">
      {/* Tier rows */}
      <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {tiers.map((row, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 bg-background px-3 py-2"
          >
            <span className="text-xs text-muted-foreground">{row.timeLabel}</span>
            <span className={`text-xs font-medium shrink-0 ${tierColorClass(row.pct)}`}>
              {row.refundLabel}
            </span>
          </div>
        ))}
      </div>

      {/* Optional features */}
      {(policy.allow_reschedule || policy.weather_clause || policy.force_majeure_clause) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
          {policy.allow_reschedule && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              Rescheduling allowed
            </span>
          )}
          {policy.weather_clause && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Cloud className="h-3 w-3" />
              Weather clause
            </span>
          )}
          {policy.force_majeure_clause && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" />
              Force majeure clause
            </span>
          )}
        </div>
      )}

      {/* Vendor notes */}
      {policy.notes && (
        <p className="text-[11px] text-muted-foreground leading-relaxed italic">
          {policy.notes}
        </p>
      )}
    </div>
  );
}
