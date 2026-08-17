import { FREE_TIER_MAX_ACTIVE_LISTINGS } from "../lib/constants";

/**
 * Single source of truth for "what can this vendor do" under the freemium + Pro
 * model. Pure and synchronous: it takes the already-loaded vendor account row and
 * returns capability flags. No I/O, so it's cheap to call on every request and
 * trivially unit-testable.
 *
 * SECURITY: `isPro` drives FEE WAIVER (a Pro subscription is the only thing that
 * removes the vendor commission) and `hasProFeatures` drives PAYWALL GATES. Keep
 * this the ONLY place either is derived. Never set isPro true for a commission
 * vendor: that waives their commission and Modal B earns nothing.
 */

export type VendorSubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "comp";

/** The subset of vendor_accounts columns this helper needs. */
export interface VendorSubscriptionFields {
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  compEndsAt?: Date | string | null;
  subscriptionCurrentPeriodEnd?: Date | string | null;
  subscriptionCancelAtPeriodEnd?: boolean | null;
  /**
   * Commission pricing test. Optional so every existing caller compiles
   * unchanged; absent or unrecognised means 'subscription'.
   */
  pricingModel?: string | null;
}

export type VendorPricingModel = "subscription" | "commission";

function normalizePricingModel(value: string | null | undefined): VendorPricingModel {
  return value === "commission" ? "commission" : "subscription";
}

export interface VendorEntitlements {
  /**
   * Has a paid/trialing/comp Pro SUBSCRIPTION. Drives FEE WAIVER only.
   * Commission vendors are deliberately false here — see hasProFeatures.
   */
  isPro: boolean;
  /**
   * Can use Pro FEATURES. True for Pro subscribers AND for commission vendors,
   * who pay per booking instead of per month. Every feature gate uses this.
   */
  hasProFeatures: boolean;
  /** Max simultaneously-active listings. Infinity for Pro, FREE_TIER cap for Free. */
  maxActiveListings: number;
  canUseAnalytics: boolean;
  canUseGoogleSync: boolean;
  /** Create & manage discount / promo codes. Pro only. */
  canUseDiscounts: boolean;
  /** Reply to customer reviews (reputation management). Pro only. */
  canManageReviews: boolean;
  /** Create add-on listings (standalone bookable upgrades). Pro only. */
  canCreateAddons: boolean;
  /** False for commission vendors — there is nothing to upgrade to. */
  showUpgradePrompts: boolean;
  plan: "free" | "pro" | "commission";
  status: VendorSubscriptionStatus;
  /**
   * Why the vendor is in this state — drives client banners. One of:
   * "active" | "trialing" | "comp" | "past_due" | "comp_expired" | "canceled" | "free".
   */
  reason: string;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(value: string | null | undefined): VendorSubscriptionStatus {
  switch (value) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "comp":
      return value;
    default:
      return "none";
  }
}

/**
 * Returns true while a complimentary grant is still in effect (not yet expired).
 */
export function isCompActive(account: VendorSubscriptionFields, now: Date): boolean {
  if (normalizeStatus(account.subscriptionStatus) !== "comp") return false;
  const compEndsAt = toDate(account.compEndsAt);
  // A comp grant with no end date is treated as still active (defensive).
  return !compEndsAt || compEndsAt > now;
}

export function getVendorEntitlements(
  account: VendorSubscriptionFields,
  now: Date = new Date()
): VendorEntitlements {
  const status = normalizeStatus(account.subscriptionStatus);

  // Pro is in effect when: a paid subscription is trialing/active, OR a payment is
  // failing but Stripe is still retrying (past_due — keep Pro through dunning), OR
  // an unexpired complimentary grant is in effect.
  let isPro = false;
  let reason: string;

  if (status === "active") {
    isPro = true;
    reason = "active";
  } else if (status === "trialing") {
    isPro = true;
    reason = "trialing";
  } else if (status === "past_due") {
    // Kept Pro during Stripe's retry window; UI shows an "update card" banner.
    isPro = true;
    reason = "past_due";
  } else if (status === "comp") {
    if (isCompActive(account, now)) {
      isPro = true;
      reason = "comp";
    } else {
      isPro = false;
      reason = "comp_expired";
    }
  } else if (status === "canceled") {
    isPro = false;
    reason = "canceled";
  } else {
    isPro = false;
    reason = "free";
  }

  const pricingModel = normalizePricingModel(account.pricingModel);
  const isCommission = pricingModel === "commission";
  const hasProFeatures = isPro || isCommission;

  return {
    isPro,
    hasProFeatures,
    maxActiveListings: hasProFeatures ? Infinity : FREE_TIER_MAX_ACTIVE_LISTINGS,
    canUseAnalytics: hasProFeatures,
    canUseGoogleSync: hasProFeatures,
    canUseDiscounts: hasProFeatures,
    canManageReviews: hasProFeatures,
    canCreateAddons: hasProFeatures,
    showUpgradePrompts: !isCommission,
    plan: isCommission ? "commission" : isPro ? "pro" : "free",
    status,
    reason,
  };
}
