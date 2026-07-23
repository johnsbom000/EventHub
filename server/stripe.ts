import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Stripe Client
// ---------------------------------------------------------------------------
// PLACEHOLDER: Set STRIPE_SECRET_KEY in your environment variables.
// Obtain your key from https://dashboard.stripe.com/apikeys
// Add to .env:  STRIPE_SECRET_KEY=sk_test_...
// A missing key crashes immediately so the problem is obvious during startup.
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    "Missing STRIPE_SECRET_KEY environment variable. " +
    "Add it to your .env file: STRIPE_SECRET_KEY=sk_test_..."
  );
}

// Single Stripe client used for ALL Stripe requests throughout the app.
// The latest preview API version (2026-04-22.dahlia) is applied automatically
// by the SDK — do not set apiVersion manually.
export const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

// 'stripe' is exported as a backward-compatible alias so existing imports
// like `const { stripe } = await import("./stripe")` continue to work.
export const stripe = stripeClient;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateConnectAccountParams {
  email: string;
  businessName: string;
  /** Kept for API compatibility; V2 uses a unified "recipient" configuration. */
  accountType?: "express" | "standard" | "recipient";
}

export interface ConnectAccountOnboardingResult {
  accountId: string;
  onboardingUrl?: string;
  dashboardUrl?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const connectAppBaseUrl = (process.env.APP_URL || "http://localhost:5000")
  .trim()
  .replace(/\/+$/, "");

function getConnectRedirectUrl(path: string) {
  return `${connectAppBaseUrl}${path}`;
}

// ---------------------------------------------------------------------------
// Connect: Create Onboarding Link (V2)
// ---------------------------------------------------------------------------

/**
 * Generates a short-lived hosted URL for a V2 "recipient" account to complete
 * Stripe Connect onboarding.
 *
 * Only call this for accounts with stripeAccountType === "recipient".
 * For V1 express/standard accounts use createV1AccountOnboardingLink instead.
 */
export async function createAccountOnboardingLink(accountId: string): Promise<string> {
  const accountLink = await (stripeClient.v2.core.accountLinks as any).create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        // Only "recipient" — matches the single configuration requested at account creation.
        // Requesting "merchant" here would fail because the account was not configured for it.
        configurations: ["recipient"],
        refresh_url: getConnectRedirectUrl("/vendor/connect/refresh"),
        return_url: `${getConnectRedirectUrl("/vendor/connect/return")}?accountId=${accountId}`,
      },
    },
  });

  return accountLink.url as string;
}

// ---------------------------------------------------------------------------
// Connect: Create Onboarding Link (V1 — express / standard accounts)
// ---------------------------------------------------------------------------

/**
 * Generates a short-lived hosted URL for a V1 express or standard account to
 * continue/complete their Stripe Connect onboarding.
 *
 * Use this for accounts where stripeAccountType is "express", "standard", or null
 * (i.e. accounts created before the V2 migration).
 */
export async function createV1AccountOnboardingLink(accountId: string): Promise<string> {
  const accountLink = await stripeClient.accountLinks.create({
    account: accountId,
    refresh_url: getConnectRedirectUrl("/vendor/connect/refresh"),
    return_url: `${getConnectRedirectUrl("/vendor/connect/return")}?accountId=${accountId}`,
    type: "account_onboarding",
  });
  return accountLink.url;
}

// ---------------------------------------------------------------------------
// Connect: Create Connected Account (V2)
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Connect account for a vendor using the V2 Core Accounts API.
 *
 * Key V2 differences from V1:
 *  - NEVER pass `type` at the top level (express/standard/custom are V1 concepts).
 *  - The platform is declared as fees_collector and losses_collector.
 *  - We request the `stripe_transfers` capability under the `recipient`
 *    configuration, which allows the platform to push funds to the vendor.
 *
 * Step 1 of the Connect flow: call this when a vendor first sets up payments.
 */
export async function createConnectAccount(
  params: CreateConnectAccountParams
): Promise<ConnectAccountOnboardingResult> {
  const { email, businessName } = params;

  // V2 account creation.
  // Do NOT pass a top-level `type` — that field belongs to the V1 API only.
  const account = await (stripeClient.v2.core.accounts as any).create({
    // Human-readable name shown on the Stripe onboarding UI and dashboard.
    display_name: businessName,

    // Primary contact email for the connected account holder.
    contact_email: email,

    identity: {
      // Connected accounts for this platform must be US-based.
      country: "us",
    },

    // Use the lighter Express dashboard instead of the full Stripe dashboard.
    dashboard: "express",

    defaults: {
      responsibilities: {
        // Platform (application) is responsible for collecting fees…
        fees_collector: "application",
        // …and absorbing losses (e.g. disputes).
        losses_collector: "application",
      },
    },

    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            // Request the ability to transfer funds into the vendor's Stripe balance.
            // The capability status starts as "inactive"; it becomes "active" once
            // the vendor completes onboarding requirements.
            stripe_transfers: {
              requested: true,
            },
          },
        },
      },
    },
  });

  // Generate the hosted onboarding URL — vendor clicks this to submit their info.
  const onboardingUrl = await createAccountOnboardingLink(account.id as string);

  return {
    accountId: account.id as string,
    onboardingUrl,
  };
}

// ---------------------------------------------------------------------------
// Connect: Check Onboarding / Capability Status (V2)
// ---------------------------------------------------------------------------

/**
 * Returns the live onboarding and capability status for a connected account.
 *
 * Always fetches directly from the Stripe API (never a DB cache) so the UI
 * always reflects the real-time state of the vendor's onboarding.
 *
 * Uses the V2 Accounts API with `include` to expand:
 *  - configuration.recipient — capability status (stripe_transfers)
 *  - requirements            — any outstanding information requirements
 *
 * Falls back to the V1 Accounts API for accounts created before the V2
 * migration (those originally created as "express" or "standard").
 */
export async function checkAccountOnboardingStatus(
  accountId: string
): Promise<{
  complete: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  manualPayoutSchedule: boolean;
}> {
  try {
    // V2 retrieve — include the fields we need so Stripe sends them back.
    const account = await (stripeClient.v2.core.accounts as any).retrieve(accountId, {
      include: ["configuration.recipient", "requirements"],
    });

    // The account is ready to receive transfers when stripe_transfers is "active".
    const transfersActive =
      (account as any)?.configuration?.recipient?.capabilities?.stripe_balance
        ?.stripe_transfers?.status === "active";

    // requirements.summary.minimum_deadline.status tells us if the vendor still
    // has outstanding information they must submit ("currently_due" | "past_due").
    const requirementsStatus =
      (account as any)?.requirements?.summary?.minimum_deadline?.status;
    const requirementsMet =
      requirementsStatus !== "currently_due" && requirementsStatus !== "past_due";

    return {
      // complete: transfers are active AND no outstanding required info.
      complete: transfersActive && requirementsMet,
      // detailsSubmitted: vendor has cleared all required fields.
      detailsSubmitted: requirementsMet,
      // chargesEnabled: platform can transfer funds to this account.
      chargesEnabled: transfersActive,
      // V2 recipient accounts use platform-initiated stripe_transfers, so there
      // is no automatic payout schedule — the platform controls every transfer.
      manualPayoutSchedule: true,
    };
  } catch {
    // Fallback: V1 account (created before the V2 migration).
    // stripe.accounts.retrieve returns the classic account object.
    const account = await stripeClient.accounts.retrieve(accountId);
    const payoutInterval = account.settings?.payouts?.schedule?.interval || "";
    return {
      complete: !!account.details_submitted && !!account.charges_enabled,
      detailsSubmitted: !!account.details_submitted,
      chargesEnabled: !!account.charges_enabled,
      manualPayoutSchedule: payoutInterval === "manual",
    };
  }
}

// ---------------------------------------------------------------------------
// Connect: Ensure Manual Payout Schedule (V1 accounts only)
// ---------------------------------------------------------------------------

/**
 * Sets the payout schedule to "manual" for V1 Express/Standard accounts.
 *
 * V2 recipient accounts do not have a payout schedule concept — the platform
 * controls transfers via stripe_transfers. This function is a no-op (and
 * silently succeeds) when called on a V2 account.
 */
export async function ensureManualPayoutSchedule(accountId: string): Promise<void> {
  try {
    // V1 accounts API — update payout schedule to manual.
    await stripeClient.accounts.update(accountId, {
      settings: {
        payouts: {
          schedule: {
            interval: "manual",
          },
        },
      },
    });
  } catch {
    // V2 accounts do not support the V1 payout schedule API.
    // Safe to ignore — V2 transfers are inherently platform-controlled.
  }
}

// ---------------------------------------------------------------------------
// Connect: Express Dashboard Login Link
// ---------------------------------------------------------------------------

/**
 * Creates a single-use login link to the vendor's Stripe Express Dashboard.
 * Vendors use this to view their payouts, disputes, and account settings.
 */
export async function createDashboardLoginLink(accountId: string): Promise<string> {
  const loginLink = await stripeClient.accounts.createLoginLink(accountId);
  return loginLink.url;
}

// ---------------------------------------------------------------------------
// Payments: Create Booking Payment Intent
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Payment Intent for a booking.
 *
 * Platform holds the funds and later initiates a transfer to the vendor via
 * transferToVendor() — this approach gives the platform full control over
 * payout timing (72-hour hold policy, dispute checks, etc.).
 *
 * Note: destination charges (transfer_data) are NOT used here by design.
 * Funds stay on the platform account until payout eligibility is confirmed.
 */
export async function createBookingPaymentIntent(params: {
  amount: number;                       // total charge in cents
  platformFeeAmount: number;            // platform commission in cents
  vendorNetPayoutAmount: number;        // what the vendor receives after fees
  vendorGrossAmount?: number;           // vendor gross before Stripe fee
  stripeProcessingFeeEstimate?: number; // estimated Stripe processing fee
  vendorAbsorbsStripeFees?: boolean;    // fee policy snapshot at booking time
  vendorStripeAccountId: string;        // connected account ID for later transfer
  vendorAccountId?: string;
  listingId?: string;
  eventStartAt?: Date | string | null;
  eventEndAt?: Date | string | null;
  totalAmount?: number;
  customerId?: string;
  /** Stripe Customer ID (cus_...). Required when setupFutureUsage is set. */
  stripeCustomerId?: string;
  /**
   * Set to 'off_session' when a security deposit will be charged after this
   * payment confirms. Stripe saves the payment method for reuse.
   */
  setupFutureUsage?: "off_session";
  description: string;
  bookingId?: string;
  paymentType?: string;
  idempotencyKey?: string;
}): Promise<Stripe.PaymentIntent> {
  const {
    amount,
    platformFeeAmount,
    vendorNetPayoutAmount,
    vendorGrossAmount,
    stripeProcessingFeeEstimate,
    vendorAbsorbsStripeFees,
    vendorStripeAccountId,
    vendorAccountId,
    listingId,
    eventStartAt,
    eventEndAt,
    totalAmount,
    customerId,
    stripeCustomerId,
    setupFutureUsage,
    description,
    bookingId,
    paymentType,
    idempotencyKey,
  } = params;

  // Store all fee breakdown fields in metadata so the webhook handler can
  // reconstruct the full accounting picture even if the DB is temporarily
  // unavailable during processing.
  const metadata: Record<string, string> = {
    platformFee: Math.max(0, Math.round(platformFeeAmount)).toString(),
    vendorNetPayout: Math.max(0, Math.round(vendorNetPayoutAmount)).toString(),
    vendorGross: Math.max(0, Math.round(vendorGrossAmount ?? amount)).toString(),
    totalAmount: Math.max(0, Math.round(totalAmount ?? amount)).toString(),
    stripeProcessingFeeEstimate: Math.max(0, Math.round(stripeProcessingFeeEstimate ?? 0)).toString(),
    // Fee policy snapshot at booking time. Always emitted so webhook recovery
    // can reconstruct the per-row flag; intents created before this key existed
    // parse to null and fall back to the live platform default.
    vendorAbsorbsStripeFees: vendorAbsorbsStripeFees === true ? "true" : "false",
    // payoutHold: platform will not transfer funds until eligibility is confirmed.
    payoutHold: "true",
    // Record the connected account ID so the webhook can look up the vendor
    // even if the payment was created before the booking was finalized in DB.
    stripeConnectedAccountId: vendorStripeAccountId,
  };
  if (bookingId) metadata.bookingId = bookingId;
  if (paymentType) metadata.paymentType = paymentType;
  if (listingId) metadata.listingId = listingId;
  if (vendorAccountId) metadata.vendorAccountId = vendorAccountId;
  if (eventStartAt) metadata.eventStartAt = eventStartAt instanceof Date ? eventStartAt.toISOString() : String(eventStartAt);
  if (eventEndAt) metadata.eventEndAt = eventEndAt instanceof Date ? eventEndAt.toISOString() : String(eventEndAt);

  const paymentIntent = await stripeClient.paymentIntents.create(
    {
      amount,
      currency: "usd",
      // Prefer stripeCustomerId (Stripe Customer object) over legacy customerId (internal user ID).
      // The Stripe Customer is required when setup_future_usage is set.
      ...(stripeCustomerId ? { customer: stripeCustomerId } : customerId ? { customer: customerId } : {}),
      automatic_payment_methods: { enabled: true },
      ...(setupFutureUsage ? { setup_future_usage: setupFutureUsage } : {}),
      description,
      metadata,
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return paymentIntent;
}

// ---------------------------------------------------------------------------
// Payments: Security Deposit (off-session charge against saved payment method)
// ---------------------------------------------------------------------------

/**
 * Creates and immediately confirms a security deposit PaymentIntent using a
 * saved payment method. Called server-side after the booking payment succeeds.
 *
 * The security deposit is NEVER transferred to the vendor. It stays in the
 * EventHub Stripe platform account and is either refunded (72h post-event,
 * no damage claim) or partially/fully withheld by admin after a damage claim.
 *
 * Requires:
 *   - A Stripe Customer object (created at checkout if not already present)
 *   - A PaymentMethod attached to that Customer (saved via setup_future_usage)
 */
export async function createSecurityDepositPaymentIntent(params: {
  amount: number;          // security deposit in cents
  stripeCustomerId: string;
  paymentMethodId: string; // pm_... attached to the Customer
  bookingId: string;
  idempotencyKey: string;
}): Promise<Stripe.PaymentIntent> {
  const { amount, stripeCustomerId, paymentMethodId, bookingId, idempotencyKey } = params;

  const paymentIntent = await stripeClient.paymentIntents.create(
    {
      amount,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: `Security deposit – booking ${bookingId}`,
      metadata: {
        payment_type: "security_deposit",
        bookingId,
        // Security deposit is never paid out to the vendor.
        payoutHold: "true",
        isSecurityDeposit: "true",
      },
    },
    { idempotencyKey }
  );

  return paymentIntent;
}

// ---------------------------------------------------------------------------
// Payments: Refund
// ---------------------------------------------------------------------------

/**
 * Issues a refund for a completed booking payment.
 *
 * `amount` is REQUIRED and must be a positive integer. Booking payments and
 * security deposits share a single PaymentIntent, so an amount-less "full"
 * refund returns the ENTIRE remaining charge — including money that belongs to
 * a different payment row. Every caller computes the exact remaining amount for
 * the row it is refunding and passes it here.
 *
 * `metadata` is written onto the Stripe refund so the `charge.refunded` webhook
 * can attribute each refund back to the exact payment row that issued it (see
 * `server/lib/refundApportionment.ts`). Always pass `{ paymentRowId }`.
 */
export async function refundBookingPayment(params: {
  paymentIntentId: string;
  amount: number;
  reason?: string;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Refund> {
  const { paymentIntentId, amount, reason, idempotencyKey, metadata } = params;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `refundBookingPayment requires a positive integer amount (received ${amount})`
    );
  }

  const refund = await stripeClient.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
      reason: reason as any,
      ...(metadata ? { metadata } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return refund;
}

/**
 * Returns every refund recorded against a Stripe charge (up to 100). Used by
 * the `charge.refunded` webhook to re-derive per-row attribution from the
 * authoritative refund list rather than the (often absent) `charge.refunds`
 * field on the event payload.
 */
export async function listRefundsForCharge(chargeId: string): Promise<Stripe.Refund[]> {
  const refunds = await stripeClient.refunds.list({ charge: chargeId, limit: 100 });
  return refunds.data ?? [];
}

// ---------------------------------------------------------------------------
// Payments: Transfer to Vendor
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Billing: Vendor Pro Subscription
// ---------------------------------------------------------------------------
// Stripe Billing for the vendor Pro plan. This is entirely SEPARATE from the
// Stripe Connect payout flow above — it bills the vendor as a normal Stripe
// Customer (users.stripe_customer_id), and never touches transfers or the
// vendor's connected account.

/**
 * Creates a Stripe Checkout Session in subscription mode for the vendor Pro plan.
 *
 * The vendor is redirected to Stripe's hosted page to enter card details and
 * confirm. A free trial is applied via `trial_period_days`. A card is collected
 * up front (`payment_method_collection: 'always'`) so the subscription auto-
 * converts to paid when the trial ends.
 *
 * `vendorAccountId` is stored on the subscription metadata so the webhook handler
 * can resolve the vendor without a customer-id lookup race.
 */
export async function createSubscriptionCheckoutSession(params: {
  stripeCustomerId: string;
  priceId: string;
  vendorAccountId: string;
  trialPeriodDays?: number;
  couponId?: string;
  /** Optional reassurance shown above the submit button (e.g. the ongoing price). */
  submitMessage?: string;
  /** Experiment attribution stored on the subscription metadata (card arm). */
  treatment?: string;
  variant?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const { stripeCustomerId, priceId, vendorAccountId, trialPeriodDays, couponId, submitMessage, treatment, variant, successUrl, cancelUrl } = params;
  const experimentMeta = {
    ...(treatment ? { treatment } : {}),
    ...(variant ? { variant } : {}),
  };

  // A coupon (auto-applied launch discount) and allow_promotion_codes are
  // mutually exclusive in Checkout — Stripe rejects both. When we have a coupon,
  // apply it directly; otherwise let the customer enter a promo code.
  const discountConfig = couponId
    ? { discounts: [{ coupon: couponId }] }
    : { allow_promotion_codes: true };

  return stripeClient.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Collect a card up front so the trial auto-converts to a paid subscription.
    payment_method_collection: "always",
    subscription_data: {
      ...(trialPeriodDays && trialPeriodDays > 0 ? { trial_period_days: trialPeriodDays } : {}),
      metadata: { vendorAccountId, kind: "vendor_pro_subscription", ...experimentMeta },
    },
    // Mirror the identifiers onto the session too for checkout.session.completed.
    metadata: { vendorAccountId, kind: "vendor_pro_subscription", ...experimentMeta },
    ...(submitMessage ? { custom_text: { submit: { message: submitMessage } } } : {}),
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...discountConfig,
  });
}

/**
 * Starts a Pro subscription trial WITHOUT collecting a card up front (Treatment B
 * of the trial A/B test). Unlike `createSubscriptionCheckoutSession`, there is no
 * hosted Checkout page — we create the subscription directly, so it is born in
 * `trialing` status immediately and the vendor lands on the dashboard as Pro with
 * nothing to pay.
 *
 * `trial_settings.end_behavior.missing_payment_method: 'cancel'` is the crux: at
 * the end of the trial, if the vendor never added a card, Stripe CANCELS the
 * subscription (firing `customer.subscription.deleted`, which our webhook already
 * turns into a downgrade to Free) instead of letting it lapse into `past_due`.
 * Stripe also fires `customer.subscription.trial_will_end` ~3 days before, which
 * drives the day-27 "add a card" nudge.
 *
 * `treatment` and `variant` are stored on the subscription metadata so the
 * conversion/downgrade webhook events can be attributed back to the experiment
 * arm without any client involvement.
 */
export async function createNoCardTrialSubscription(params: {
  stripeCustomerId: string;
  priceId: string;
  vendorAccountId: string;
  trialPeriodDays: number;
  treatment?: string;
  variant?: string;
  /**
   * Launch-offer coupon (STRIPE_COUPON_PRO) that discounts the base price to the
   * advertised rate ($39→$29 / $390→$290). MUST be applied here — the base Stripe
   * price is the pre-discount amount, so without it the card added during the trial
   * gets charged the full $39/$390 at conversion instead of the $29/$290 the paywall
   * promises. The `forever` coupon rides on the subscription for its lifetime.
   */
  couponId?: string;
  /**
   * Idempotency key so concurrent /start-trial requests from the same vendor
   * collapse to ONE subscription instead of stacking duplicate trials (closes the
   * read-then-create race on the repeat-trial guard). Keyed by vendorAccountId.
   */
  idempotencyKey?: string;
}): Promise<Stripe.Subscription> {
  const { stripeCustomerId, priceId, vendorAccountId, trialPeriodDays, treatment, variant, couponId, idempotencyKey } = params;

  return stripeClient.subscriptions.create(
    {
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      trial_period_days: trialPeriodDays,
      // Apply the launch discount so the eventual charge is the advertised rate.
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      // No card is collected; if none is added by the end of the trial, cancel the
      // subscription (→ subscription.deleted → downgrade to Free) rather than let it
      // fall into past_due.
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      metadata: {
        vendorAccountId,
        kind: "vendor_pro_subscription",
        ...(treatment ? { treatment } : {}),
        ...(variant ? { variant } : {}),
      },
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );
}

/**
 * Creates a Stripe Billing Portal session so a vendor can self-manage their
 * subscription (update card, switch monthly/annual, cancel). Returns a one-time
 * URL to redirect the vendor to.
 */
export async function createBillingPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  return stripeClient.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
}

/**
 * Creates a SetupIntent so a vendor can add a card IN-APP (Stripe Elements) during
 * their reverse trial without being charged now. `usage: 'off_session'` means the
 * saved card can later be charged automatically (when the trial converts at day 30).
 *
 * The resulting card is attached to the customer on confirmation; our
 * `setup_intent.succeeded` webhook then sets it as the trial subscription's default
 * payment method (via `subscriptionId` in metadata) so Stripe charges it at trial
 * end instead of cancelling the trial. Also stamps reverse_trial_card_captured_at.
 */
export async function createSubscriptionSetupIntent(params: {
  stripeCustomerId: string;
  vendorAccountId: string;
  subscriptionId?: string;
}): Promise<Stripe.SetupIntent> {
  return stripeClient.setupIntents.create({
    customer: params.stripeCustomerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: {
      vendorAccountId: params.vendorAccountId,
      kind: "reverse_trial_card_capture",
      ...(params.subscriptionId ? { subscriptionId: params.subscriptionId } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// AI reply overage (metered usage billing)
// ---------------------------------------------------------------------------

/**
 * Ensures the AI-reply-overage metered price is a line item on the vendor's Pro
 * subscription, so reported usage actually invoices. Idempotent — only adds the
 * item if it's missing — and caches the resulting subscription item id on the
 * vendor account.
 */
async function ensureAiOverageSubscriptionItem(
  vendorAccountId: string,
  subscriptionId: string,
  overagePriceId: string
): Promise<void> {
  const subscription = await stripeClient.subscriptions.retrieve(subscriptionId);
  const existing = subscription.items.data.find((it) => it.price?.id === overagePriceId);
  let itemId = existing?.id;
  if (!itemId) {
    const item = await stripeClient.subscriptionItems.create({
      subscription: subscriptionId,
      price: overagePriceId,
      proration_behavior: "none",
    });
    itemId = item.id;
  }

  const { db } = await import("./db");
  const { vendorAccounts } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  await db
    .update(vendorAccounts)
    .set({ aiOverageSubscriptionItemId: itemId })
    .where(eq(vendorAccounts.id, vendorAccountId));
}

/**
 * Reports one unit of AI-reply overage to Stripe's metered billing for this
 * vendor. No-ops (with a warning) when overage billing isn't fully configured —
 * the draft itself is unaffected, and the usage is still recorded in
 * ai_reply_usage for visibility. Called from server/aiReplyService.ts.
 */
export async function reportAiReplyOverage(account: {
  id: string;
  userId: string | null;
  email: string | null;
  stripeSubscriptionId: string | null;
  aiOverageSubscriptionItemId: string | null;
}): Promise<void> {
  const { STRIPE_PRICE_AI_OVERAGE, STRIPE_AI_OVERAGE_METER_EVENT } = await import("./lib/constants");
  const { logger } = await import("./lib/logger");

  if (!STRIPE_PRICE_AI_OVERAGE) {
    logger.warn(
      { vendorAccountId: account.id },
      "[ai-overage] STRIPE_PRICE_AI_OVERAGE not configured — usage recorded but not billed"
    );
    return;
  }
  if (!account.userId || !account.email) {
    logger.warn({ vendorAccountId: account.id }, "[ai-overage] vendor missing identity — skipping");
    return;
  }

  // Resolve the Meter's event_name directly from the metered Price (the price is
  // linked to a meter), so usage is always reported against the right event
  // regardless of how STRIPE_AI_OVERAGE_METER_EVENT is set. Falls back to the env
  // value only if the price isn't metered / can't be read.
  const eventName = await resolveAiOverageMeterEventName(
    STRIPE_PRICE_AI_OVERAGE,
    STRIPE_AI_OVERAGE_METER_EVENT
  );
  if (!eventName) {
    logger.warn(
      { vendorAccountId: account.id, priceId: STRIPE_PRICE_AI_OVERAGE },
      "[ai-overage] price is not metered (no linked meter) and no STRIPE_AI_OVERAGE_METER_EVENT — usage recorded but not billed"
    );
    return;
  }

  const { ensureStripeCustomer } = await import("./services/paymentService");
  const customerId = await ensureStripeCustomer(account.userId, account.email);

  // Make sure the metered price is on the subscription so usage invoices.
  if (account.stripeSubscriptionId && !account.aiOverageSubscriptionItemId) {
    await ensureAiOverageSubscriptionItem(account.id, account.stripeSubscriptionId, STRIPE_PRICE_AI_OVERAGE);
  }

  // Report 1 unit; Stripe aggregates and bills at the metered price's rate.
  await stripeClient.billing.meterEvents.create({
    event_name: eventName,
    payload: { stripe_customer_id: customerId, value: "1" },
  });
}

// Cache the resolved meter event name (per price) so we don't refetch every draft.
let cachedAiMeterEventName: string | null = null;

async function resolveAiOverageMeterEventName(
  priceId: string,
  envOverride: string
): Promise<string | null> {
  if (cachedAiMeterEventName) return cachedAiMeterEventName;
  try {
    const price = await stripeClient.prices.retrieve(priceId);
    const meterId = price.recurring?.meter;
    if (meterId) {
      const meter = await stripeClient.billing.meters.retrieve(meterId);
      if (meter.event_name) {
        cachedAiMeterEventName = meter.event_name;
        return meter.event_name;
      }
    }
  } catch {
    // Fall through to the env override if the price/meter can't be read.
  }
  return envOverride || null;
}

// ---------------------------------------------------------------------------
// Payments: Transfer to Vendor
// ---------------------------------------------------------------------------

/**
 * Transfers funds from the platform account to the vendor's connected account.
 *
 * Called after payout eligibility is confirmed (72-hour hold, no disputes, etc.).
 * Uses a source_transaction link when available so Stripe can trace the funds
 * back to the original charge for accounting purposes.
 */
export async function transferToVendor(params: {
  amount: number;
  vendorStripeAccountId: string;
  description: string;
  sourceTransaction?: string;  // charge ID to link the transfer to its source
  transferGroup?: string;      // group ID for related transfers (e.g. a booking)
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}): Promise<Stripe.Transfer> {
  const {
    amount,
    vendorStripeAccountId,
    description,
    sourceTransaction,
    transferGroup,
    metadata,
    idempotencyKey,
  } = params;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      `transferToVendor requires a positive integer amount (received ${amount})`
    );
  }

  const transfer = await stripeClient.transfers.create(
    {
      amount,
      currency: "usd",
      destination: vendorStripeAccountId,
      description,
      ...(sourceTransaction ? { source_transaction: sourceTransaction } : {}),
      ...(transferGroup ? { transfer_group: transferGroup } : {}),
      ...(metadata ? { metadata } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return transfer;
}

/**
 * Looks up an already-created transfer for a payment by scanning the booking's
 * transfer group and matching `metadata.paymentId` (set on every transfer by
 * processSinglePayoutCandidate). Used by the stale-claim recovery step: when a
 * payout was claimed (`payout_status = 'scheduled'`) but the process died
 * between the Stripe transfer and the DB persist, this tells us whether the
 * money actually moved — adopt the transfer if it did, release the claim if not.
 */
export async function findExistingTransferForPayment(params: {
  transferGroup: string;
  paymentId: string;
}): Promise<Stripe.Transfer | null> {
  const transfers = await stripeClient.transfers.list({
    transfer_group: params.transferGroup,
    limit: 100,
  });
  return (
    transfers.data.find((transfer) => transfer.metadata?.paymentId === params.paymentId) ?? null
  );
}
