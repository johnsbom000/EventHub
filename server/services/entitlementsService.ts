import { FREE_TIER_MAX_ACTIVE_LISTINGS } from "../lib/constants";

/**
 * Single source of truth for "what can this vendor do" under the freemium + Pro
 * model. Pure and synchronous: it takes the already-loaded vendor account row and
 * returns capability flags. No I/O, so it's cheap to call on every request and
 * trivially unit-testable.
 *
 * SECURITY: every paywall gate (listing cap, analytics, Google sync) trusts the
 * `isPro` flag computed here. A wrong value is a paywall bypass — keep this the
 * ONLY place `isPro` is derived.
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
}

export interface VendorEntitlements {
  isPro: boolean;
  /** Max simultaneously-active listings. Infinity for Pro, FREE_TIER cap for Free. */
  maxActiveListings: number;
  canUseAnalytics: boolean;
  canUseGoogleSync: boolean;
  plan: "free" | "pro";
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

  return {
    isPro,
    maxActiveListings: isPro ? Infinity : FREE_TIER_MAX_ACTIVE_LISTINGS,
    canUseAnalytics: isPro,
    canUseGoogleSync: isPro,
    plan: isPro ? "pro" : "free",
    status,
    reason,
  };
}
