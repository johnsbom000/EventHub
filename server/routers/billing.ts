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
import { logEvent } from "../lib/events";
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

  // Sanitize an experiment label (treatment / variant) coming from the client.
  // These are ANALYTICS metadata only — never used for billing logic — so a
  // tampered value can't grant Pro or bypass a guard; we just bound it.
  function experimentLabel(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const cleaned = value.trim().slice(0, 40);
    return cleaned.length ? cleaned : undefined;
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
      // Experiment attribution — analytics labels only, never used for billing
      // decisions, so it is safe to take from the client. Bounded for safety.
      const treatment = experimentLabel(req.body?.treatment);
      const variant = experimentLabel(req.body?.variant);

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
        treatment,
        variant,
        successUrl: `${base}/vendor/dashboard?checkout=success`,
        cancelUrl: `${base}/vendor/dashboard?checkout=cancelled`,
      });

      return res.json({ url: session.url });
    } catch (err: any) {
      logRouteError("/api/vendor/billing/checkout", err);
      return res.status(500).json({ error: "Unable to start checkout" });
    }
  });

  // POST /api/vendor/billing/start-trial — start a 30-day Pro trial WITHOUT a card
  // (Treatment B of the trial A/B test). Body: { interval, treatment?, variant? }.
  // Creates the subscription directly (no Checkout page), so the vendor is Pro
  // immediately. Stripe cancels it at day 30 if no card was added.
  app.post("/api/vendor/billing/start-trial", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(404).json({ error: "Vendor account not found" });
      if (!account.userId || !account.email) {
        return res.status(400).json({ error: "Vendor account is missing identity for billing" });
      }

      // If they already hold an active comp grant (e.g. the launch offer
      // auto-granted 180 days at provision), they're already Pro — don't start a
      // redundant Stripe trial that would end long before their comp does.
      if (isCompActive(account, new Date())) {
        return res.json({ ok: true, status: "comp" });
      }

      const interval = typeof req.body?.interval === "string" ? req.body.interval.trim() : "monthly";
      const priceId = priceIdForInterval(interval);
      if (!priceId) {
        return res.status(400).json({ error: "billing_not_configured", message: "Pro pricing is not configured." });
      }
      const treatment = experimentLabel(req.body?.treatment);
      const variant = experimentLabel(req.body?.variant);

      // The no-card trial is for BRAND-NEW vendors only. Anyone who has ever held a
      // subscription (stripeSubscriptionId is retained even after cancel) must
      // upgrade through the normal card flow — this both prevents repeat-trial
      // abuse AND avoids creating a 0-day trial that would instantly fail to charge
      // a customer with no card on file.
      if (account.stripeSubscriptionId) {
        return res.status(409).json({ error: "trial_not_available", message: "A free trial is only available on a new account. Please upgrade to Pro instead." });
      }

      const stripeCustomerId = await ensureStripeCustomer(account.userId, account.email);
      const { createNoCardTrialSubscription } = await import("../stripe");
      const subscription = await createNoCardTrialSubscription({
        stripeCustomerId,
        priceId,
        vendorAccountId: account.id,
        trialPeriodDays: PRO_TRIAL_PERIOD_DAYS,
        treatment,
        variant,
        // Stable per-vendor key: parallel start-trial requests collapse to one
        // subscription rather than stacking duplicate trials.
        idempotencyKey: `start-trial:${account.id}`,
      });

      // Persist the trialing state now so /vendor/me reflects Pro immediately,
      // without waiting for the customer.subscription.created webhook to arrive.
      await applyStripeSubscriptionToVendor(subscription as any);

      return res.json({ ok: true, status: "trialing" });
    } catch (err: any) {
      logRouteError("/api/vendor/billing/start-trial", err);
      return res.status(500).json({ error: "Unable to start trial" });
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

  // Trial → paid conversion (both A/B arms): the vendor was trialing and Stripe
  // just moved them to active. Attributed with the experiment metadata so the
  // A/B test can compare paid-conversion rates per treatment.
  if (account.subscriptionStatus === "trialing" && localStatus === "active") {
    logEvent("pro_trial_converted", "vendor", account.id, {
      treatment: subscription.metadata?.treatment ?? null,
      variant: subscription.metadata?.variant ?? null,
      priceId,
    });
  }

  return { vendorAccountId: account.id };
}

/**
 * Marks a vendor's subscription as canceled (subscription.deleted webhook). The
 * caller is responsible for triggering the free-tier listing trim afterwards.
 */
export async function markVendorSubscriptionCanceled(
  subscriptionId: string,
  metadata?: Record<string, string> | null
): Promise<{ vendorAccountId: string | null; downgraded: boolean }> {
  const rows = await db
    .select({
      id: vendorAccounts.id,
      subscriptionStatus: vendorAccounts.subscriptionStatus,
      compEndsAt: vendorAccounts.compEndsAt,
    })
    .from(vendorAccounts)
    .where(eq(vendorAccounts.stripeSubscriptionId, subscriptionId))
    .limit(1);
  const account = rows[0];
  if (!account) return { vendorAccountId: null, downgraded: false };

  // Comp takes precedence: if an active complimentary grant is in effect (e.g. a
  // launch-offer comp), a Stripe trial/subscription ending must NOT drop them to
  // Free. Leave the comp intact — it expires on its own schedule.
  if (isCompActive(account, new Date())) {
    return { vendorAccountId: account.id, downgraded: false };
  }

  await db
    .update(vendorAccounts)
    .set({
      subscriptionPlan: "free",
      subscriptionStatus: "canceled",
      subscriptionCancelAtPeriodEnd: false,
      subscriptionUpdatedAt: new Date(),
    })
    .where(eq(vendorAccounts.id, account.id));

  // Trial → downgrade (both A/B arms): the subscription ended while the vendor was
  // still trialing (no-card trial hit day 30 with no card, or they cancelled mid-
  // trial). Distinguished from paid churn by the prior 'trialing' status.
  if (account.subscriptionStatus === "trialing") {
    logEvent("pro_trial_downgraded", "vendor", account.id, {
      treatment: metadata?.treatment ?? null,
      variant: metadata?.variant ?? null,
    });
  }

  return { vendorAccountId: account.id, downgraded: true };
}
