import type { Express } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { vendorAccounts } from "@shared/schema";
import {
  getVendorAccountFromRequest,
  requireVendorAuth0,
} from "../services/vendorAuth";
import { ensureStripeCustomer } from "../services/paymentService";
import { getVendorEntitlements, isCompActive } from "../services/entitlementsService";
import { deactivateExtraActiveListingsForFreeTier } from "../services/bookingService";
import { disconnectGoogleCalendarForVendor } from "../google";
import { appUrl, logRouteError, respondWithInternalServerError } from "../lib/routeHelpers";
import { mutationRateLimiter } from "../lib/rateLimiters";
import {
  STRIPE_PRICE_PRO_MONTHLY,
  STRIPE_PRICE_PRO_ANNUAL,
  STRIPE_COUPON_PRO,
  PRO_TRIAL_PERIOD_DAYS,
} from "../lib/constants";

/**
 * Vendor Pro subscription billing routes. Stripe Billing only — never touches the
 * Connect payout flow. The vendor is billed as a normal Stripe Customer
 * (users.stripe_customer_id, reused from the booking checkout flow).
 */
export function registerBillingRoutes(app: Express) {
  // Resolve which Stripe Price the requested interval maps to. Price IDs come
  // from server config, never from the client (prevents billing tampering).
  function priceIdForInterval(interval: string): string | null {
    if (interval === "annual") return STRIPE_PRICE_PRO_ANNUAL || null;
    if (interval === "monthly") return STRIPE_PRICE_PRO_MONTHLY || null;
    return null;
  }

  // GET /api/vendor/billing/status — entitlements + billing period info for the
  // billing page and any client-side gating.
  app.get("/api/vendor/billing/status", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(404).json({ error: "Vendor account not found" });

      const ent = getVendorEntitlements(account);
      return res.json({
        plan: ent.plan,
        status: ent.status,
        reason: ent.reason,
        isPro: ent.isPro,
        currentPeriodEnd: account.subscriptionCurrentPeriodEnd ?? null,
        cancelAtPeriodEnd: account.subscriptionCancelAtPeriodEnd ?? false,
        compEndsAt: account.compEndsAt ?? null,
        hasStripeSubscription: Boolean(account.stripeSubscriptionId),
      });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/vendor/billing/checkout — start a Pro subscription via Stripe
  // Checkout. Body: { interval: "monthly" | "annual" }.
  app.post("/api/vendor/billing/checkout", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(404).json({ error: "Vendor account not found" });
      if (!account.userId || !account.email) {
        return res.status(400).json({ error: "Vendor account is missing identity for billing" });
      }

      const interval = typeof req.body?.interval === "string" ? req.body.interval.trim() : "monthly";
      const priceId = priceIdForInterval(interval);
      if (!priceId) {
        return res.status(400).json({ error: "billing_not_configured", message: "Pro pricing is not configured." });
      }

      // If they already have a live subscription, send them to the portal to
      // manage it instead of creating a duplicate.
      const ent = getVendorEntitlements(account);
      if (account.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(ent.status)) {
        return res.status(409).json({ error: "already_subscribed", message: "You already have an active Pro subscription." });
      }

      const stripeCustomerId = await ensureStripeCustomer(account.userId, account.email);

      // Grant the free trial only to vendors who have never held a paid
      // subscription (prevents repeat-trial abuse on resubscribe).
      const trialPeriodDays = account.stripeSubscriptionId ? 0 : PRO_TRIAL_PERIOD_DAYS;

      // The launch coupon is a `forever` discount, so the discounted rate is the
      // permanent price — but Stripe's hosted page shows the pre-discount amount
      // with a discount line, which reads as a temporary teaser. Spell out the
      // ongoing price under the submit button so vendors know it never rises.
      // Labels mirror the launch prices in client UpgradeModal/ProTrialModal.
      const priceLabel = interval === "annual" ? "$290/year" : "$29/month";
      const submitMessage =
        trialPeriodDays > 0
          ? `Free for ${trialPeriodDays} days. After your trial, your Launch Offer rate is ${priceLabel}.`
          : `Your Launch Offer rate is ${priceLabel}.`;

      const base = appUrl();
      const { createSubscriptionCheckoutSession } = await import("../stripe");
      const session = await createSubscriptionCheckoutSession({
        stripeCustomerId,
        priceId,
        vendorAccountId: account.id,
        trialPeriodDays,
        couponId: STRIPE_COUPON_PRO || undefined,
        submitMessage,
        successUrl: `${base}/vendor/dashboard?checkout=success`,
        cancelUrl: `${base}/vendor/dashboard?checkout=cancelled`,
      });

      return res.json({ url: session.url });
    } catch (err: any) {
      logRouteError("/api/vendor/billing/checkout", err);
      return res.status(500).json({ error: "Unable to start checkout" });
    }
  });

  // POST /api/vendor/billing/portal — open the Stripe Billing Portal to manage an
  // existing subscription (update card, switch plan, cancel).
  app.post("/api/vendor/billing/portal", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(404).json({ error: "Vendor account not found" });
      if (!account.userId || !account.email) {
        return res.status(400).json({ error: "Vendor account is missing identity for billing" });
      }

      const stripeCustomerId = await ensureStripeCustomer(account.userId, account.email);
      const base = appUrl();
      const { createBillingPortalSession } = await import("../stripe");
      const session = await createBillingPortalSession({
        stripeCustomerId,
        returnUrl: `${base}/vendor/dashboard`,
      });

      return res.json({ url: session.url });
    } catch (err: any) {
      logRouteError("/api/vendor/billing/portal", err);
      return res.status(500).json({ error: "Unable to open billing portal" });
    }
  });
}

/**
 * Lazy expiry check for complimentary Pro grants. Called on the hot vendor path
 * (/api/vendor/me) so no cron is needed: if a vendor's comp grant has expired,
 * flip them to Free and trim their extra active listings down to the free cap.
 *
 * Returns the effective subscription fields to use for this request (so callers
 * don't need to re-read the row). Stripe-billed trial→active transitions are
 * handled by webhooks, so they don't need this.
 */
export async function reconcileVendorSubscriptionState<
  T extends {
    id: string;
    subscriptionPlan?: string | null;
    subscriptionStatus?: string | null;
    compEndsAt?: Date | string | null;
  }
>(account: T, now: Date = new Date()): Promise<T> {
  if (account.subscriptionStatus === "comp" && !isCompActive(account, now)) {
    await db
      .update(vendorAccounts)
      .set({
        subscriptionPlan: "free",
        subscriptionStatus: "none",
        subscriptionUpdatedAt: now,
      })
      .where(eq(vendorAccounts.id, account.id));
    await deactivateExtraActiveListingsForFreeTier(account.id);
    // Google Calendar sync is Pro-only — tear it down when the comp grant lapses.
    await disconnectGoogleCalendarForVendor(account.id);
    return { ...account, subscriptionPlan: "free", subscriptionStatus: "none" };
  }
  return account;
}

/**
 * Applies a Stripe subscription object to the vendor_accounts row. Shared by the
 * subscription.* webhook handlers. Resolves the vendor via subscription metadata
 * (preferred) or by stripe_subscription_id.
 *
 * `eq` and `db` are imported above; this is exported so the webhook handler in
 * payments.ts can reuse the exact mapping logic.
 */
export async function applyStripeSubscriptionToVendor(subscription: {
  id: string;
  status: string;
  metadata?: Record<string, string> | null;
  items?: { data?: Array<{ price?: { id?: string | null } | null; current_period_end?: number | null }> } | null;
  // Legacy top-level field. Removed from the Subscription object in Stripe API
  // 2026-04-22.dahlia (now lives on each item); kept here only as a fallback.
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  customer?: string | null;
}): Promise<{ vendorAccountId: string | null }> {
  const vendorAccountId = subscription.metadata?.vendorAccountId || null;

  // Resolve the vendor: prefer metadata, then existing stripe_subscription_id.
  let account:
    | { id: string; subscriptionStatus: string | null }
    | undefined;

  if (vendorAccountId) {
    const rows = await db
      .select({ id: vendorAccounts.id, subscriptionStatus: vendorAccounts.subscriptionStatus })
      .from(vendorAccounts)
      .where(eq(vendorAccounts.id, vendorAccountId))
      .limit(1);
    account = rows[0];
  }
  if (!account) {
    const rows = await db
      .select({ id: vendorAccounts.id, subscriptionStatus: vendorAccounts.subscriptionStatus })
      .from(vendorAccounts)
      .where(eq(vendorAccounts.stripeSubscriptionId, subscription.id))
      .limit(1);
    account = rows[0];
  }
  if (!account) return { vendorAccountId: null };

  // Map Stripe subscription.status onto our local status. Stripe values:
  // trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired
  const stripeStatus = subscription.status;
  const isLive = ["trialing", "active", "past_due"].includes(stripeStatus);
  const localStatus =
    stripeStatus === "trialing" || stripeStatus === "active" || stripeStatus === "past_due"
      ? stripeStatus
      : "canceled";

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  // As of Stripe API 2026-04-22.dahlia, current_period_end lives on the
  // subscription item, not the subscription. Read the item first, fall back to
  // the legacy top-level field for older API versions.
  const periodEndUnix =
    subscription.items?.data?.[0]?.current_period_end ??
    subscription.current_period_end ??
    null;
  const currentPeriodEnd =
    typeof periodEndUnix === "number" ? new Date(periodEndUnix * 1000) : null;

  await db
    .update(vendorAccounts)
    .set({
      subscriptionPlan: isLive ? "pro" : "free",
      subscriptionStatus: localStatus,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionCurrentPeriodEnd: currentPeriodEnd,
      subscriptionCancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      // Clear any complimentary grant once a real subscription takes over.
      compEndsAt: null,
      subscriptionUpdatedAt: new Date(),
    })
    .where(eq(vendorAccounts.id, account.id));

  return { vendorAccountId: account.id };
}

/**
 * Marks a vendor's subscription as canceled (subscription.deleted webhook). The
 * caller is responsible for triggering the free-tier listing trim afterwards.
 */
export async function markVendorSubscriptionCanceled(subscriptionId: string): Promise<{ vendorAccountId: string | null }> {
  const rows = await db
    .select({ id: vendorAccounts.id })
    .from(vendorAccounts)
    .where(eq(vendorAccounts.stripeSubscriptionId, subscriptionId))
    .limit(1);
  const account = rows[0];
  if (!account) return { vendorAccountId: null };

  await db
    .update(vendorAccounts)
    .set({
      subscriptionPlan: "free",
      subscriptionStatus: "canceled",
      subscriptionCancelAtPeriodEnd: false,
      subscriptionUpdatedAt: new Date(),
    })
    .where(eq(vendorAccounts.id, account.id));

  return { vendorAccountId: account.id };
}
