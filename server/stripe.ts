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
 * Generates a short-lived hosted URL the vendor uses to complete their
 * Stripe Connect onboarding.
 *
 * Uses the V2 Account Links API so the link is tied to the "recipient"
 * configuration we requested when the account was created.
 *
 * @param accountId  The Stripe account ID (acct_...) to onboard.
 * @returns          The hosted onboarding URL to redirect the vendor to.
 */
export async function createAccountOnboardingLink(accountId: string): Promise<string> {
  // V2 Account Links API.
  // refresh_url  — where to redirect if the link expires before the vendor finishes.
  // return_url   — where to redirect after the vendor completes (or skips) onboarding.
  //               We append accountId so the return page can look up current status.
  const accountLink = await (stripeClient.v2.core.accountLinks as any).create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        // "recipient" enables stripe_transfers payouts to the vendor's Stripe balance.
        // "merchant" enables the vendor to accept card payments on their behalf.
        // Both are needed for a full marketplace seller onboarding experience.
        configurations: ["recipient", "merchant"],
        refresh_url: getConnectRedirectUrl("/vendor/connect/refresh"),
        return_url: `${getConnectRedirectUrl("/vendor/connect/return")}?accountId=${accountId}`,
      },
    },
  });

  return accountLink.url as string;
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
 * Pass `amount` for a partial refund; omit for a full refund.
 */
export async function refundBookingPayment(params: {
  paymentIntentId: string;
  amount?: number;       // optional — omit for full refund
  reason?: string;
  idempotencyKey?: string;
}): Promise<Stripe.Refund> {
  const { paymentIntentId, amount, reason, idempotencyKey } = params;

  const refund = await stripeClient.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
      reason: reason as any,
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return refund;
}

// ---------------------------------------------------------------------------
// Payments: Transfer to Vendor
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Payments: Hosted Checkout Session (Destination Charge)
// ---------------------------------------------------------------------------

/**
 * Creates a Stripe Checkout Session for a direct marketplace purchase.
 *
 * Uses a destination charge so the payment flows from the customer to the
 * platform and Stripe automatically transfers the net amount (after the
 * application fee) to the vendor's connected account.
 *
 * Flow:
 *   1. Customer is redirected to `session.url` (Stripe-hosted checkout page).
 *   2. Customer completes payment.
 *   3. Stripe fires `checkout.session.completed` to our webhook.
 *   4. Vendor receives funds minus the application_fee_amount.
 *
 * @param listingName              Product or service name shown on checkout.
 * @param amountCents              Total amount the customer is charged (in cents).
 * @param currency                 3-letter ISO currency code (e.g. "usd").
 * @param applicationFeeAmountCents  Platform fee kept by EventHub (in cents).
 *                                 Deducted from amountCents before transfer.
 * @param vendorStripeAccountId    Connected account ID (acct_...) of the vendor.
 * @param successUrl               Redirect URL after successful payment.
 *                                 Include `{CHECKOUT_SESSION_ID}` to verify
 *                                 the session on your success page.
 * @param cancelUrl                Redirect URL when the customer cancels.
 * @param metadata                 Key-value pairs stored on the session for
 *                                 reconciliation (e.g. listingId, bookingId).
 */
export async function createCheckoutSession(params: {
  listingName: string;
  amountCents: number;
  currency?: string;
  applicationFeeAmountCents: number;
  vendorStripeAccountId: string;
  successUrl: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  const {
    listingName,
    amountCents,
    currency = "usd",
    applicationFeeAmountCents,
    vendorStripeAccountId,
    successUrl,
    cancelUrl,
    metadata,
  } = params;

  const session = await stripeClient.checkout.sessions.create({
    // Line items describe what the customer is buying.
    // We use inline price_data so no Stripe Product or Price objects need to
    // be pre-created for each listing.
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: listingName,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],

    // "payment" mode for one-time purchases (vs "subscription" or "setup").
    mode: "payment",

    payment_intent_data: {
      // application_fee_amount: the portion the platform retains.
      // The remaining amount (amountCents − applicationFeeAmountCents − Stripe fee)
      // is automatically transferred to the vendor's connected account.
      application_fee_amount: applicationFeeAmountCents,

      // Destination charge: funds flow to the platform first, then Stripe
      // transfers the net amount to the connected account automatically.
      // This is the correct approach for a marketplace where the platform
      // sets pricing and is responsible for fees (losses_collector: application).
      transfer_data: {
        destination: vendorStripeAccountId,
      },
    },

    // success_url: where to redirect after payment. Append {CHECKOUT_SESSION_ID}
    // so your success page can call GET /api/checkout/session/:id to verify.
    success_url: successUrl,

    // cancel_url: where to redirect if the customer clicks "Back" or closes checkout.
    ...(cancelUrl ? { cancel_url: cancelUrl } : {}),

    // metadata is stored on the session and forwarded to the payment intent.
    // Use it to tie the Stripe session back to your internal records.
    ...(metadata ? { metadata } : {}),
  });

  return session;
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
