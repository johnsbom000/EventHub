import { db } from "../db";
import { eq, and, or, isNull, inArray, sql as drizzleSql } from "drizzle-orm";
import { bookings, payments, users, vendorAccounts, bookingDisputes } from "@shared/schema";
import { logger } from "../lib/logger";
import { appUrl } from "../lib/routeHelpers";
import {
  asTrimmedString,
  extractRows,
  parseIntegerValue,
  normalizePaymentStateValue,
  isPaymentSucceededStatus,
  estimateStripeProcessingFeeCents,
  deriveBookingPaymentStatusFromScheduleStatuses,
} from "../lib/routeUtils";
import {
  VENDOR_FEE_RATE,
  VENDOR_ABSORBS_STRIPE_FEES,
} from "../lib/constants";
import {
  computePayoutEligibility,
  DISPUTE_WINDOW_HOURS,
} from "../payoutEligibility";
import { storage } from "../storage";
import { sendPayoutProcessedEmail } from "../email";

// Module-level lazy-init guard for booking_disputes DDL
let bookingDisputesTableReadyPromise: Promise<void> | null = null;

export async function ensureBookingDisputesTable() {
  if (!bookingDisputesTableReadyPromise) {
    bookingDisputesTableReadyPromise = (async () => {
      await db.execute(drizzleSql`
        do $$
        begin
          create type booking_dispute_status as enum (
            'filed',
            'vendor_responded',
            'resolved_refund',
            'resolved_payout'
          );
        exception
          when duplicate_object then null;
        end $$;
      `);
      await db.execute(drizzleSql`
        create table if not exists booking_disputes (
          id varchar primary key default gen_random_uuid(),
          booking_id varchar not null references bookings(id) on delete cascade,
          customer_id varchar not null references users(id) on delete cascade,
          vendor_account_id varchar references vendor_accounts(id) on delete set null,
          reason text not null,
          details text,
          status booking_dispute_status not null default 'filed',
          vendor_response text,
          admin_decision text,
          admin_notes text,
          filed_at timestamptz not null default now(),
          vendor_responded_at timestamptz,
          resolved_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.execute(drizzleSql`
        create unique index if not exists booking_disputes_booking_id_idx
        on booking_disputes (booking_id)
      `);
      await db.execute(drizzleSql`
        create index if not exists booking_disputes_status_idx
        on booking_disputes (status)
      `);
      await db.execute(drizzleSql`
        create index if not exists booking_disputes_filed_at_idx
        on booking_disputes (filed_at desc)
      `);
    })().catch((error) => {
      bookingDisputesTableReadyPromise = null;
      throw error;
    });
  }

  await bookingDisputesTableReadyPromise;
}

/**
 * Returns the Stripe Customer ID (cus_...) for a user, creating one if needed.
 * The ID is persisted to users.stripe_customer_id so it's reused across checkouts.
 */
export async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const [userRow] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRow?.stripeCustomerId) return userRow.stripeCustomerId;

  const { stripeClient } = await import("../stripe");
  const customer = await stripeClient.customers.create({ email });

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return customer.id;
}

export async function recomputeBookingPaymentStatusInTx(tx: any, bookingId: string) {
  // Derive booking payment status from actual payments rows.
  // Exclude security_deposit rows — they are an independent hold and do not
  // affect the booking's payment status (they are always captured separately).
  const paymentRows = await tx
    .select({
      status: payments.status,
      paymentType: payments.paymentType,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.bookingId, bookingId));

  const bookingPaymentRows = paymentRows.filter(
    (row: { paymentType?: string | null }) =>
      normalizePaymentStateValue(row.paymentType) !== "security_deposit"
  );

  const nextPaymentStatus = deriveBookingPaymentStatusFromScheduleStatuses(
    bookingPaymentRows.map((row: { status?: string | null }) => row.status)
  );

  // depositPaidAt = when the main booking payment was first collected.
  const depositPaidAt =
    bookingPaymentRows.find(
      (row: { paymentType?: string | null; status?: string | null; paidAt?: Date | null }) =>
        (normalizePaymentStateValue(row.paymentType) === "deposit" ||
          normalizePaymentStateValue(row.paymentType) === "booking") &&
        isPaymentSucceededStatus(row.status) &&
        row.paidAt instanceof Date
    )?.paidAt ?? null;

  const bookingPatch: Record<string, any> = {
    paymentStatus: nextPaymentStatus,
    updatedAt: new Date(),
  };
  if (depositPaidAt) {
    bookingPatch.depositPaidAt = depositPaidAt;
  }

  await tx
    .update(bookings)
    .set(bookingPatch as any)
    .where(eq(bookings.id, bookingId));

  return nextPaymentStatus;
}

export async function markBookingAsPaymentFailedInTx(tx: any, bookingId: string, reason: string) {
  const now = new Date();
  await tx.execute(drizzleSql`
    update bookings
    set
      status = 'failed',
      payment_status = 'failed',
      cancellation_reason = coalesce(nullif(trim(cancellation_reason), ''), ${reason}),
      cancelled_at = coalesce(cancelled_at, ${now}),
      updated_at = ${now}
    where id = ${bookingId}
      and status in ('pending', 'confirmed')
  `);
}

export type LockedPaymentPayoutContext = {
  paymentId: string;
  bookingId: string;
  bookingStatus: string | null;
  bookingEndAt: Date | null;
  paymentStatus: string | null;
  payoutStatus: string | null;
  payoutBlockedReason: string | null;
  disputeStatus: string | null;
  bookingDisputeStatus: string | null;
  paidOutAt: Date | null;
  payoutEligibleAt: Date | null;
  totalAmount: number | null;
  amount: number | null;
  refundAmount: number | null;
  vendorNetPayoutAmount: number | null;
  actualStripeFeeAmount: number | null;
  stripeConnectedAccountId: string | null;
  stripeChargeId: string | null;
  stripeTransferId: string | null;
  payoutAdjustedAmount: number | null;
};

export async function loadPaymentPayoutContextForUpdateInTx(
  tx: any,
  paymentId: string
): Promise<LockedPaymentPayoutContext | null> {
  await ensureBookingDisputesTable();
  const rows: any = await tx.execute(drizzleSql`
    select
      p.id as "paymentId",
      p.booking_id as "bookingId",
      b.status as "bookingStatus",
      b.booking_end_at as "bookingEndAt",
      p.status as "paymentStatus",
      p.payout_status as "payoutStatus",
      p.payout_blocked_reason as "payoutBlockedReason",
      p.dispute_status as "disputeStatus",
      bd.status as "bookingDisputeStatus",
      p.paid_out_at as "paidOutAt",
      p.payout_eligible_at as "payoutEligibleAt",
      p.total_amount as "totalAmount",
      p.amount as "amount",
      p.refund_amount as "refundAmount",
      p.vendor_net_payout_amount as "vendorNetPayoutAmount",
      p.actual_stripe_fee_amount as "actualStripeFeeAmount",
      p.stripe_connected_account_id as "stripeConnectedAccountId",
      p.stripe_charge_id as "stripeChargeId",
      p.stripe_transfer_id as "stripeTransferId",
      p.payout_adjusted_amount as "payoutAdjustedAmount"
    from payments p
    inner join bookings b on b.id = p.booking_id
    left join booking_disputes bd on bd.booking_id = b.id
    where p.id = ${paymentId}
    for update
  `);
  const row = extractRows<LockedPaymentPayoutContext>(rows)[0];
  return row?.paymentId ? row : null;
}

export async function getBookingDisputeStatusInTx(tx: any, bookingId: string): Promise<string | null> {
  await ensureBookingDisputesTable();
  const rows = await tx
    .select({
      status: bookingDisputes.status,
    })
    .from(bookingDisputes)
    .where(eq(bookingDisputes.bookingId, bookingId))
    .limit(1);
  const status = rows[0]?.status;
  return typeof status === "string" ? status : null;
}

export async function refreshPaymentPayoutStateInTx(
  tx: any,
  paymentId: string,
  now = new Date()
) {
  const paymentContext = await loadPaymentPayoutContextForUpdateInTx(tx, paymentId);
  if (!paymentContext?.paymentId || !paymentContext.bookingId) return null;

  const payoutEligibility = computePayoutEligibility(
    {
      bookingStatus: paymentContext.bookingStatus,
      paymentStatus: paymentContext.paymentStatus,
      payoutStatus: paymentContext.payoutStatus,
      payoutBlockedReason: paymentContext.payoutBlockedReason,
      disputeStatus: paymentContext.disputeStatus,
      bookingDisputeStatus: paymentContext.bookingDisputeStatus,
      paidOutAt: paymentContext.paidOutAt,
      payoutEligibleAt: paymentContext.payoutEligibleAt,
      bookingEndAt: paymentContext.bookingEndAt,
      totalAmount:
        parseIntegerValue(paymentContext.totalAmount) ??
        parseIntegerValue(paymentContext.amount) ??
        0,
      refundedAmount: parseIntegerValue(paymentContext.refundAmount) ?? 0,
      vendorNetPayoutAmount: parseIntegerValue(paymentContext.vendorNetPayoutAmount) ?? 0,
      actualStripeFeeAmount: paymentContext.actualStripeFeeAmount,
      stripeConnectedAccountId: paymentContext.stripeConnectedAccountId,
      stripeChargeId: paymentContext.stripeChargeId,
      stripeTransferId: paymentContext.stripeTransferId,
      vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
    },
    now
  );

  await tx
    .update(payments)
    .set({
      payoutStatus: payoutEligibility.payoutStatus,
      payoutEligibleAt: payoutEligibility.payoutEligibleAt,
      payoutBlockedReason: payoutEligibility.payoutBlockedReason,
      payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
    })
    .where(eq(payments.id, paymentContext.paymentId));

  return {
    paymentContext,
    payoutEligibility,
  };
}

export type PayoutProcessingResult = {
  paymentId: string;
  bookingId: string;
  outcome: "paid" | "eligible" | "skipped" | "blocked" | "duplicate";
  reason: string | null;
  payoutAmount: number;
  transferId: string | null;
};

export async function processSinglePayoutCandidate(params: {
  paymentId: string;
  bookingId: string;
  dryRun: boolean;
}): Promise<PayoutProcessingResult> {
  const paymentId = asTrimmedString(params.paymentId);
  const bookingId = asTrimmedString(params.bookingId);
  if (!paymentId || !bookingId) {
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "invalid_candidate",
      payoutAmount: 0,
      transferId: null,
    };
  }

  const now = new Date();
  const refreshed = await db.transaction(async (tx) => refreshPaymentPayoutStateInTx(tx, paymentId, now));

  if (!refreshed?.paymentContext) {
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "payment_not_found",
      payoutAmount: 0,
      transferId: null,
    };
  }

  const eligibility = refreshed.payoutEligibility;
  const payoutAmount = Math.max(0, Math.round(eligibility.adjustedPayoutAmount || 0));

  if (!eligibility.eligible) {
    return {
      paymentId,
      bookingId,
      outcome: eligibility.payoutStatus === "blocked" ? "blocked" : "skipped",
      reason: eligibility.payoutBlockedReason || "not_eligible",
      payoutAmount,
      transferId: null,
    };
  }

  if (params.dryRun) {
    return {
      paymentId,
      bookingId,
      outcome: "eligible",
      reason: null,
      payoutAmount,
      transferId: null,
    };
  }

  const connectedAccountId = asTrimmedString(refreshed.paymentContext.stripeConnectedAccountId);
  const chargeId = asTrimmedString(refreshed.paymentContext.stripeChargeId);

  if (!connectedAccountId || !chargeId || payoutAmount <= 0) {
    await db
      .update(payments)
      .set({
        payoutStatus: "blocked",
        payoutBlockedReason: "missing_transfer_requirements",
        payoutAdjustedAmount: payoutAmount,
      })
      .where(eq(payments.id, paymentId));
    return {
      paymentId,
      bookingId,
      outcome: "blocked",
      reason: "missing_transfer_requirements",
      payoutAmount,
      transferId: null,
    };
  }

  // Cross-check with Stripe: verify the charge actually succeeded and its
  // captured amount matches what we recorded. This guards against DB corruption
  // or race conditions where we attempt to pay out more than was collected.
  try {
    const { stripe: stripeClient } = await import("../stripe");
    const charge = await stripeClient.charges.retrieve(chargeId);
    if (!charge.paid || charge.status !== "succeeded") {
      await db
        .update(payments)
        .set({
          payoutStatus: "blocked",
          payoutBlockedReason: "stripe_charge_not_succeeded",
          payoutAdjustedAmount: payoutAmount,
        })
        .where(eq(payments.id, paymentId));
      return {
        paymentId,
        bookingId,
        outcome: "blocked",
        reason: "stripe_charge_not_succeeded",
        payoutAmount,
        transferId: null,
      };
    }
    const recordedTotal = parseIntegerValue(refreshed.paymentContext.totalAmount) ?? 0;
    if (recordedTotal > 0 && charge.amount_captured < recordedTotal) {
      logger.warn(
        `[payout] Charge amount mismatch for payment ${paymentId}: ` +
        `Stripe captured ${charge.amount_captured}, DB recorded ${recordedTotal}. Blocking payout.`
      );
      await db
        .update(payments)
        .set({
          payoutStatus: "blocked",
          payoutBlockedReason: "stripe_amount_mismatch",
          payoutAdjustedAmount: payoutAmount,
        })
        .where(eq(payments.id, paymentId));
      return {
        paymentId,
        bookingId,
        outcome: "blocked",
        reason: "stripe_amount_mismatch",
        payoutAmount,
        transferId: null,
      };
    }
  } catch (stripeErr: any) {
    logger.error(`[payout] Stripe charge verification failed for payment ${paymentId}:`, stripeErr?.message);
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "stripe_verification_failed",
      payoutAmount,
      transferId: null,
    };
  }

  try {
    const { transferToVendor } = await import("../stripe");
    const transfer = await transferToVendor({
      amount: payoutAmount,
      vendorStripeAccountId: connectedAccountId,
      description: `EventHub payout for booking ${bookingId}`,
      sourceTransaction: chargeId,
      transferGroup: `booking_${bookingId}`,
      metadata: {
        bookingId,
        paymentId,
        payoutAmount: String(payoutAmount),
        sourceChargeId: chargeId,
      },
      idempotencyKey: `eventhub-payout:${paymentId}:${payoutAmount}`,
    });

    const persisted = await db.transaction(async (tx) => {
      const locked = await loadPaymentPayoutContextForUpdateInTx(tx, paymentId);
      if (!locked?.paymentId || !locked.bookingId) {
        return {
          outcome: "skipped" as const,
          reason: "payment_not_found",
          transferId: null as string | null,
        };
      }

      const existingTransferId = asTrimmedString(locked.stripeTransferId);
      if (existingTransferId) {
        return {
          outcome: "duplicate" as const,
          reason: "already_paid",
          transferId: existingTransferId,
        };
      }

      const nowLocked = new Date();
      const eligibilityLocked = computePayoutEligibility(
        {
          bookingStatus: locked.bookingStatus,
          paymentStatus: locked.paymentStatus,
          payoutStatus: locked.payoutStatus,
          payoutBlockedReason: locked.payoutBlockedReason,
          disputeStatus: locked.disputeStatus,
          bookingDisputeStatus: locked.bookingDisputeStatus,
          paidOutAt: locked.paidOutAt,
          payoutEligibleAt: locked.payoutEligibleAt,
          bookingEndAt: locked.bookingEndAt,
          totalAmount: parseIntegerValue(locked.totalAmount) ?? parseIntegerValue(locked.amount) ?? 0,
          refundedAmount: parseIntegerValue(locked.refundAmount) ?? 0,
          vendorNetPayoutAmount: parseIntegerValue(locked.vendorNetPayoutAmount) ?? 0,
          actualStripeFeeAmount: locked.actualStripeFeeAmount,
          stripeConnectedAccountId: locked.stripeConnectedAccountId,
          stripeChargeId: locked.stripeChargeId,
          stripeTransferId: locked.stripeTransferId,
          vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
        },
        nowLocked
      );

      if (!eligibilityLocked.eligible) {
        await tx
          .update(payments)
          .set({
            payoutStatus: eligibilityLocked.payoutStatus,
            payoutEligibleAt: eligibilityLocked.payoutEligibleAt,
            payoutBlockedReason: eligibilityLocked.payoutBlockedReason,
            payoutAdjustedAmount: eligibilityLocked.adjustedPayoutAmount,
          })
          .where(eq(payments.id, paymentId));
        return {
          outcome: eligibilityLocked.payoutStatus === "blocked" ? "blocked" : "skipped",
          reason: eligibilityLocked.payoutBlockedReason || "not_eligible",
          transferId: null as string | null,
        };
      }

      await tx
        .update(payments)
        .set({
          stripeTransferId: transfer.id,
          payoutStatus: "paid",
          payoutScheduledAt: nowLocked,
          paidOutAt: nowLocked,
          payoutBlockedReason: null,
          payoutAdjustedAmount: payoutAmount,
        })
        .where(eq(payments.id, paymentId));

      return {
        outcome: "paid" as const,
        reason: null as string | null,
        transferId: transfer.id,
      };
    });

    // Fire-and-forget payout email when outcome is "paid"
    if (persisted.outcome === "paid") {
      void (async () => {
        try {
          const serverUrl = appUrl();
          // Mark payout_email_sent to prevent duplicates, then send
          const updateResult = await db
            .update(payments)
            .set({ payoutEmailSent: true })
            .where(and(eq(payments.id, paymentId), eq(payments.payoutEmailSent, false)))
            .returning({ id: payments.id });
          if (updateResult.length === 0) return; // already sent

          const payoutRows: any = await db.execute(drizzleSql`
            select
              va.id           as "vendorAccountId",
              va.email        as "vendorEmail",
              va.business_name as "vendorName",
              b.event_date    as "eventDate",
              b.listing_title_snapshot as "listingTitle",
              p.stripe_transfer_id as "transferId"
            from payments p
            join bookings b on b.id = p.booking_id
            join vendor_accounts va on va.id = b.vendor_account_id
            where p.id = ${paymentId}
            limit 1
          `);
          const pr = extractRows<{
            vendorAccountId: string;
            vendorEmail: string;
            vendorName: string;
            eventDate: string;
            listingTitle: string | null;
            transferId: string | null;
          }>(payoutRows)[0];
          if (pr?.vendorAccountId) {
            await storage.createNotification({
              recipientId: pr.vendorAccountId,
              recipientType: "vendor",
              type: "payout_processed",
              title: "Payout processed",
              message: `Your payout of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(payoutAmount / 100)} for ${pr.listingTitle || "your service"} on ${pr.eventDate} has been sent.`,
              link: `/vendor/payments`,
              read: false,
            });
          }
          if (pr?.vendorEmail) {
            await sendPayoutProcessedEmail(pr.vendorEmail, {
              recipientName: pr.vendorName || "Vendor",
              amountCents: payoutAmount,
              listingTitle: pr.listingTitle || "Service",
              eventDate: pr.eventDate,
              transferId: pr.transferId ?? undefined,
              serverUrl,
            });
          }
        } catch (emailError: any) {
          logger.warn("[payout email] failed:", emailError?.message || emailError);
        }
      })();
    }

    return {
      paymentId,
      bookingId,
      outcome: persisted.outcome as PayoutProcessingResult["outcome"],
      reason: persisted.reason,
      payoutAmount,
      transferId: persisted.transferId,
    };
  } catch (error: any) {
    const errorMessage =
      typeof error?.message === "string" && error.message.trim().length > 0
        ? error.message.trim().slice(0, 200)
        : "transfer_failed";
    await db
      .update(payments)
      .set({
        payoutStatus: "blocked",
        payoutBlockedReason: "transfer_failed",
        payoutAdjustedAmount: payoutAmount,
      })
      .where(eq(payments.id, paymentId));
    return {
      paymentId,
      bookingId,
      outcome: "blocked",
      reason: errorMessage,
      payoutAmount,
      transferId: null,
    };
  }
}

export async function ensurePaymentRecordForIntentInTx(
  tx: any,
  params: {
    paymentIntentId: string;
    fallbackBookingId?: string | null;
    fallbackPaymentType?: string | null;
    fallbackAmount?: number | null;
    fallbackTotalAmount?: number | null;
    fallbackPlatformFeeAmount?: number | null;
    fallbackVendorGrossAmount?: number | null;
    fallbackVendorNetPayoutAmount?: number | null;
    fallbackStripeProcessingFeeEstimate?: number | null;
    fallbackStripeConnectedAccountId?: string | null;
  }
) {
  const paymentIntentId = asTrimmedString(params.paymentIntentId);
  if (!paymentIntentId) return null;

  const existingRows = await tx
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      paymentType: payments.paymentType,
      status: payments.status,
      amount: payments.amount,
      totalAmount: payments.totalAmount,
      platformFeeAmount: payments.platformFeeAmount,
      vendorGrossAmount: payments.vendorGrossAmount,
      vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
      stripeProcessingFeeEstimate: payments.stripeProcessingFeeEstimate,
      actualStripeFeeAmount: payments.actualStripeFeeAmount,
      refundAmount: payments.refundAmount,
      disputeStatus: payments.disputeStatus,
      payoutStatus: payments.payoutStatus,
      payoutEligibleAt: payments.payoutEligibleAt,
      payoutBlockedReason: payments.payoutBlockedReason,
      payoutAdjustedAmount: payments.payoutAdjustedAmount,
      paidOutAt: payments.paidOutAt,
      stripeChargeId: payments.stripeChargeId,
      stripeTransferId: payments.stripeTransferId,
      stripeConnectedAccountId: payments.stripeConnectedAccountId,
      customerId: payments.customerId,
      vendorAccountId: payments.vendorAccountId,
    })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    // When a deposit is collected in the same PaymentIntent, two rows exist.
    // Always prefer the 'booking' row so webhook logic operates on the service payment.
    .orderBy(drizzleSql`CASE WHEN payment_type = 'booking' THEN 0 ELSE 1 END`)
    .limit(1);
  if (existingRows[0]) {
    const existingPayment = existingRows[0];
    const connectedAccountId = asTrimmedString(params.fallbackStripeConnectedAccountId);
    const patch: Record<string, unknown> = {};
    if (!asTrimmedString(existingPayment.stripeConnectedAccountId) && connectedAccountId) {
      patch.stripeConnectedAccountId = connectedAccountId;
    }
    if (parseIntegerValue(existingPayment.totalAmount) == null && parseIntegerValue(params.fallbackTotalAmount) != null) {
      patch.totalAmount = Math.max(0, parseIntegerValue(params.fallbackTotalAmount) ?? 0);
    }
    if (
      parseIntegerValue(existingPayment.platformFeeAmount) == null &&
      parseIntegerValue(params.fallbackPlatformFeeAmount) != null
    ) {
      patch.platformFeeAmount = Math.max(0, parseIntegerValue(params.fallbackPlatformFeeAmount) ?? 0);
    }
    if (
      parseIntegerValue(existingPayment.vendorNetPayoutAmount) == null &&
      parseIntegerValue(params.fallbackVendorNetPayoutAmount) != null
    ) {
      patch.vendorNetPayoutAmount = Math.max(0, parseIntegerValue(params.fallbackVendorNetPayoutAmount) ?? 0);
    }
    if (Object.keys(patch).length > 0) {
      await tx.update(payments).set(patch as any).where(eq(payments.id, existingPayment.id));
    }
    return existingPayment;
  }

  const bookingId = asTrimmedString(params.fallbackBookingId);
  if (!bookingId) return null;

  const [bookingRow] = await tx
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      vendorAccountId: bookings.vendorAccountId,
      bookingEndAt: bookings.bookingEndAt,
      totalAmount: bookings.totalAmount,
      platformFee: bookings.platformFee,
      subtotalAmountCents: bookings.subtotalAmountCents,
      vendorPayout: bookings.vendorPayout,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!bookingRow?.id) return null;

  const amount =
    parseIntegerValue(params.fallbackAmount) && Number.isFinite(Number(params.fallbackAmount))
      ? Math.max(0, Number(params.fallbackAmount))
      : 0;
  if (!amount) return null;

  // Always prefer DB-stored amounts over metadata to prevent price tampering via
  // manipulated payment intent metadata. Metadata is only used as a last resort.
  const totalAmount =
    parseIntegerValue(bookingRow.totalAmount) ??
    parseIntegerValue(params.fallbackTotalAmount) ??
    amount;
  const platformFeeAmount =
    parseIntegerValue(bookingRow.platformFee) ??
    parseIntegerValue(params.fallbackPlatformFeeAmount) ??
    Math.round(amount * VENDOR_FEE_RATE);
  const vendorGrossAmount =
    parseIntegerValue(bookingRow.subtotalAmountCents) ??
    parseIntegerValue(params.fallbackVendorGrossAmount) ??
    Math.max(0, totalAmount - Math.max(0, parseIntegerValue(bookingRow.platformFee) ?? 0));
  const vendorNetPayoutAmount =
    parseIntegerValue(bookingRow.vendorPayout) ??
    parseIntegerValue(params.fallbackVendorNetPayoutAmount) ??
    Math.max(0, amount - platformFeeAmount);
  const stripeProcessingFeeEstimate =
    parseIntegerValue(params.fallbackStripeProcessingFeeEstimate) ??
    estimateStripeProcessingFeeCents(totalAmount);
  const connectedAccountId = asTrimmedString(params.fallbackStripeConnectedAccountId) || null;
  const payoutEligibleAt =
    bookingRow.bookingEndAt instanceof Date
      ? new Date(bookingRow.bookingEndAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000)
      : null;

  const [inserted] = await tx
    .insert(payments)
    .values({
      bookingId,
      customerId: bookingRow.customerId,
      vendorAccountId: bookingRow.vendorAccountId,
      stripePaymentIntentId: paymentIntentId,
      amount,
      totalAmount,
      platformFeeAmount,
      vendorGrossAmount,
      vendorNetPayoutAmount,
      stripeProcessingFeeEstimate,
      stripeConnectedAccountId: connectedAccountId,
      payoutStatus: "not_ready",
      payoutEligibleAt,
      paymentType: (normalizePaymentStateValue(params.fallbackPaymentType) || "deposit") as "deposit" | "final" | "installment",
      status: "pending",
    })
    .returning({
      id: payments.id,
      bookingId: payments.bookingId,
      paymentType: payments.paymentType,
      status: payments.status,
      amount: payments.amount,
      totalAmount: payments.totalAmount,
      platformFeeAmount: payments.platformFeeAmount,
      vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
      vendorGrossAmount: payments.vendorGrossAmount,
      refundAmount: payments.refundAmount,
      disputeStatus: payments.disputeStatus,
      payoutStatus: payments.payoutStatus,
      payoutEligibleAt: payments.payoutEligibleAt,
      payoutBlockedReason: payments.payoutBlockedReason,
      payoutAdjustedAmount: payments.payoutAdjustedAmount,
      paidOutAt: payments.paidOutAt,
      actualStripeFeeAmount: payments.actualStripeFeeAmount,
      stripeChargeId: payments.stripeChargeId,
      stripeTransferId: payments.stripeTransferId,
      stripeConnectedAccountId: payments.stripeConnectedAccountId,
      customerId: payments.customerId,
      vendorAccountId: payments.vendorAccountId,
    });

  return inserted ?? null;
}

/**
 * Creates (or retrieves) a Stripe PaymentIntent for the booking total payment.
 *
 * If a pending PaymentIntent already exists for this booking (idempotent resume),
 * the existing clientSecret is returned instead of creating a new one.
 *
 * When the booking has a security deposit, it is included in the same PaymentIntent
 * as the service charge. A separate 'security_deposit' row is inserted in the payments
 * table so it can be partially refunded independently after the event.
 */
export async function initializeBookingPayment(input: {
  bookingId: string;
  customerId: string;
  customerEmail: string;
}) {
  const bookingId = asTrimmedString(input.bookingId);
  const customerId = asTrimmedString(input.customerId);
  if (!bookingId || !customerId) {
    throw new Error("Invalid payment initialization payload");
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      vendorAccountId: bookings.vendorAccountId,
      status: bookings.status,
      listingId: bookings.listingId,
      bookingStartAt: bookings.bookingStartAt,
      bookingEndAt: bookings.bookingEndAt,
      totalAmount: bookings.totalAmount,
      platformFee: bookings.platformFee,
      subtotalAmountCents: bookings.subtotalAmountCents,
      vendorPayout: bookings.vendorPayout,
      securityDepositCents: bookings.securityDepositCents,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) throw new Error("Booking not found");
  if (!booking.customerId || booking.customerId !== customerId) throw new Error("You do not have access to this booking");
  if (!booking.vendorAccountId) throw new Error("Booking is missing vendor account");

  const bookingStatus = normalizePaymentStateValue(booking.status);
  if (bookingStatus === "cancelled" || bookingStatus === "expired" || bookingStatus === "failed") {
    throw new Error("This booking is no longer payable");
  }

  const [vendorAccount] = await db
    .select({
      id: vendorAccounts.id,
      stripeConnectId: vendorAccounts.stripeConnectId,
      stripeOnboardingComplete: vendorAccounts.stripeOnboardingComplete,
    })
    .from(vendorAccounts)
    .where(eq(vendorAccounts.id, booking.vendorAccountId))
    .limit(1);

  if (!vendorAccount?.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
    throw new Error("Vendor payment processing not set up");
  }

  const { stripeClient, createBookingPaymentIntent } = await import("../stripe");

  // Check if a pending PaymentIntent already exists for this booking (idempotent resume).
  const [existingPayment] = await db
    .select({ stripePaymentIntentId: payments.stripePaymentIntentId, status: payments.status })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.paymentType, "booking")))
    .limit(1);

  if (existingPayment?.stripePaymentIntentId) {
    const existingIntent = await stripeClient.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
    if (existingIntent.status === "succeeded") throw new Error("This payment has already been completed");
    if (existingIntent.client_secret && existingIntent.status !== "canceled") {
      return { booking, clientSecret: existingIntent.client_secret, paymentIntentId: existingIntent.id };
    }
  }

  // Security deposit is included in the single upfront PaymentIntent.
  // The deposit amount is tracked in a separate payments row so it can be
  // partially refunded independently of the service payment.
  const securityDepositCents = Math.max(0, parseIntegerValue(booking.securityDepositCents) ?? 0);
  const totalAmountCents = parseIntegerValue(booking.totalAmount) ?? 0;
  // Service-only total = full booking charge minus the security deposit portion.
  // Used for payout/fee calculations so the deposit never reaches the vendor.
  const serviceOnlyTotal = Math.max(0, totalAmountCents - securityDepositCents);
  const platformFeeAmount = parseIntegerValue(booking.platformFee) ?? Math.round(serviceOnlyTotal * VENDOR_FEE_RATE);
  const vendorGrossAmount = parseIntegerValue(booking.subtotalAmountCents) ?? Math.max(0, serviceOnlyTotal - platformFeeAmount);
  const vendorNetPayoutAmount = parseIntegerValue(booking.vendorPayout) ?? Math.max(0, serviceOnlyTotal - platformFeeAmount);
  const stripeProcessingFeeEstimate = estimateStripeProcessingFeeCents(totalAmountCents);

  const paymentIntent = await createBookingPaymentIntent({
    amount: totalAmountCents, // full charge including security deposit
    platformFeeAmount,
    vendorNetPayoutAmount,
    vendorGrossAmount,
    stripeProcessingFeeEstimate,
    vendorStripeAccountId: vendorAccount.stripeConnectId,
    vendorAccountId: booking.vendorAccountId,
    listingId: booking.listingId ?? undefined,
    eventStartAt: booking.bookingStartAt,
    eventEndAt: booking.bookingEndAt,
    totalAmount: totalAmountCents,
    description: `Booking ${booking.id}`,
    bookingId: booking.id,
    paymentType: "booking",
    idempotencyKey: `booking-payment:${booking.id}`,
  });

  const payoutEligibleAt =
    booking.bookingEndAt instanceof Date
      ? new Date(booking.bookingEndAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000)
      : null;

  // Insert the service payment row (used for payout tracking and booking status).
  await db.insert(payments).values({
    bookingId: booking.id,
    customerId: booking.customerId,
    vendorAccountId: booking.vendorAccountId,
    stripePaymentIntentId: paymentIntent.id,
    amount: serviceOnlyTotal,
    totalAmount: serviceOnlyTotal,
    platformFeeAmount,
    vendorGrossAmount,
    vendorNetPayoutAmount,
    stripeProcessingFeeEstimate,
    stripeConnectedAccountId: vendorAccount.stripeConnectId,
    paymentType: "booking",
    status: "pending",
    payoutStatus: "not_ready",
    payoutEligibleAt,
  }).onConflictDoNothing(); // Safe if called twice before confirmation

  // Insert the security deposit row (same PaymentIntent, tracked separately for refunds).
  if (securityDepositCents > 0) {
    await db.insert(payments).values({
      bookingId: booking.id,
      customerId: booking.customerId,
      vendorAccountId: booking.vendorAccountId,
      stripePaymentIntentId: paymentIntent.id,
      amount: securityDepositCents,
      totalAmount: securityDepositCents,
      platformFeeAmount: 0,
      vendorGrossAmount: 0,
      vendorNetPayoutAmount: 0,
      stripeConnectedAccountId: vendorAccount.stripeConnectId,
      paymentType: "security_deposit",
      status: "pending",
      payoutStatus: "blocked",
      payoutBlockedReason: "security_deposit",
    }).onConflictDoNothing();
  }

  return { booking, clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
}
