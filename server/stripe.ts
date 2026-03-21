import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-10-29.clover",
});

export interface CreateConnectAccountParams {
  email: string;
  businessName: string;
  accountType: "express" | "standard";
}

export interface ConnectAccountOnboardingResult {
  accountId: string;
  onboardingUrl?: string; // For Express accounts
  dashboardUrl?: string; // For both types
}

const connectAppBaseUrl = process.env.REPLIT_DEV_DOMAIN || "http://localhost:5000";

function getConnectRedirectUrl(path: string) {
  return `${connectAppBaseUrl}${path}`;
}

export async function createAccountOnboardingLink(accountId: string): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: getConnectRedirectUrl("/vendor/connect/refresh"),
    return_url: getConnectRedirectUrl("/vendor/connect/return"),
    type: "account_onboarding",
  });
  return accountLink.url;
}

// Create a Stripe Connect account for a vendor
export async function createConnectAccount(
  params: CreateConnectAccountParams
): Promise<ConnectAccountOnboardingResult> {
  const { email, businessName, accountType } = params;

  if (accountType === "express") {
    // Create Express account (simplified onboarding)
    const account = await stripe.accounts.create({
      type: "express",
      email,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      settings: {
        payouts: {
          schedule: {
            interval: "manual",
          },
        },
      },
      business_profile: {
        name: businessName,
      },
    });

    const onboardingUrl = await createAccountOnboardingLink(account.id);

    return {
      accountId: account.id,
      onboardingUrl,
    };
  } else {
    // Create Standard account (full control, existing Stripe account)
    const account = await stripe.accounts.create({
      type: "standard",
    });

    const onboardingUrl = await createAccountOnboardingLink(account.id);

    return {
      accountId: account.id,
      onboardingUrl,
    };
  }
}

// Check if Connect account onboarding is complete
export async function checkAccountOnboardingStatus(
  accountId: string
): Promise<{ complete: boolean; detailsSubmitted: boolean; chargesEnabled: boolean; manualPayoutSchedule: boolean }> {
  const account = await stripe.accounts.retrieve(accountId);

  const payoutInterval = account.settings?.payouts?.schedule?.interval || "";
  return {
    complete: account.details_submitted && account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    manualPayoutSchedule: payoutInterval === "manual",
  };
}

export async function ensureManualPayoutSchedule(accountId: string): Promise<void> {
  await stripe.accounts.update(accountId, {
    settings: {
      payouts: {
        schedule: {
          interval: "manual",
        },
      },
    },
  });
}

// Create a login link for vendors to access their Stripe Dashboard
export async function createDashboardLoginLink(accountId: string): Promise<string> {
  const loginLink = await stripe.accounts.createLoginLink(accountId);
  return loginLink.url;
}

// Create a payment intent with platform fee
export async function createBookingPaymentIntent(params: {
  amount: number; // in cents
  platformFeeAmount: number; // in cents
  vendorNetPayoutAmount: number; // in cents
  vendorGrossAmount?: number; // in cents
  stripeProcessingFeeEstimate?: number; // in cents
  vendorStripeAccountId: string;
  vendorAccountId?: string;
  listingId?: string;
  eventStartAt?: Date | string | null;
  eventEndAt?: Date | string | null;
  totalAmount?: number; // in cents
  customerId?: string;
  description: string;
  bookingId?: string;
  scheduleId?: string;
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
    description,
    bookingId,
    scheduleId,
    paymentType,
    idempotencyKey,
  } = params;

  // Launch policy: funds are held by the platform until payout eligibility is checked.
  // We intentionally do not use destination charges here.
  const metadata: Record<string, string> = {
    platformFee: Math.max(0, Math.round(platformFeeAmount)).toString(),
    vendorNetPayout: Math.max(0, Math.round(vendorNetPayoutAmount)).toString(),
    vendorGross: Math.max(0, Math.round(vendorGrossAmount ?? amount)).toString(),
    totalAmount: Math.max(0, Math.round(totalAmount ?? amount)).toString(),
    stripeProcessingFeeEstimate: Math.max(0, Math.round(stripeProcessingFeeEstimate ?? 0)).toString(),
    payoutHold: "true",
    stripeConnectedAccountId: vendorStripeAccountId,
  };
  if (bookingId) metadata.bookingId = bookingId;
  if (scheduleId) metadata.scheduleId = scheduleId;
  if (paymentType) metadata.paymentType = paymentType;
  if (listingId) metadata.listingId = listingId;
  if (vendorAccountId) metadata.vendorAccountId = vendorAccountId;
  if (eventStartAt) metadata.eventStartAt = eventStartAt instanceof Date ? eventStartAt.toISOString() : String(eventStartAt);
  if (eventEndAt) metadata.eventEndAt = eventEndAt instanceof Date ? eventEndAt.toISOString() : String(eventEndAt);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: "usd",
      ...(customerId ? { customer: customerId } : {}),
      automatic_payment_methods: { enabled: true },
      description,
      metadata,
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return paymentIntent;
}

// Issue a refund with 48-hour policy check
export async function refundBookingPayment(params: {
  paymentIntentId: string;
  amount?: number; // optional, full refund if not provided
  reason?: string;
  idempotencyKey?: string;
}): Promise<Stripe.Refund> {
  const { paymentIntentId, amount, reason, idempotencyKey } = params;

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntentId,
      amount,
      reason: reason as any,
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  return refund;
}

// Transfer funds to vendor account (used for scheduled payments)
export async function transferToVendor(params: {
  amount: number;
  vendorStripeAccountId: string;
  description: string;
  sourceTransaction?: string;
  transferGroup?: string;
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

  const transfer = await stripe.transfers.create(
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
