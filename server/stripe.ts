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
): Promise<{ complete: boolean; detailsSubmitted: boolean; chargesEnabled: boolean }> {
  const account = await stripe.accounts.retrieve(accountId);

  return {
    complete: account.details_submitted && account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
  };
}

// Create a login link for vendors to access their Stripe Dashboard
export async function createDashboardLoginLink(accountId: string): Promise<string> {
  const loginLink = await stripe.accounts.createLoginLink(accountId);
  return loginLink.url;
}

// Create a payment intent with platform fee
export async function createBookingPaymentIntent(params: {
  amount: number; // in cents
  platformFeePercent: number; // e.g., 8 for 8%
  vendorStripeAccountId: string;
  customerId?: string;
  description: string;
}): Promise<Stripe.PaymentIntent> {
  const { amount, platformFeePercent, vendorStripeAccountId, customerId, description } = params;

  const platformFee = Math.round(amount * (platformFeePercent / 100));

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    application_fee_amount: platformFee,
    transfer_data: {
      destination: vendorStripeAccountId,
    },
    customer: customerId,
    description,
    metadata: {
      platformFee: platformFee.toString(),
      vendorPayout: (amount - platformFee).toString(),
    },
  });

  return paymentIntent;
}

// Issue a refund with 48-hour policy check
export async function refundBookingPayment(params: {
  paymentIntentId: string;
  amount?: number; // optional, full refund if not provided
  reason?: string;
}): Promise<Stripe.Refund> {
  const { paymentIntentId, amount, reason } = params;

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason: reason as any,
  });

  return refund;
}

// Transfer funds to vendor account (used for scheduled payments)
export async function transferToVendor(params: {
  amount: number;
  vendorStripeAccountId: string;
  description: string;
}): Promise<Stripe.Transfer> {
  const { amount, vendorStripeAccountId, description } = params;

  const transfer = await stripe.transfers.create({
    amount,
    currency: "usd",
    destination: vendorStripeAccountId,
    description,
  });

  return transfer;
}
