import { db } from "../db";
import { eq, and, or, isNull, isNotNull, inArray, sql as drizzleSql } from "drizzle-orm";
import { bookings, payments, users, vendorAccounts, disputeCases } from "@shared/schema";
import { logger } from "../lib/logger";
import { appUrl } from "../lib/routeHelpers";
import {
  asTrimmedString,
  extractRows,
  parseIntegerValue,
  normalizePaymentStateValue,
  isPaymentSucceededStatus,
  isPaymentRefundedOrPartiallyRefundedStatus,
  isStripeResourceMissingError,
  estimateStripeProcessingFeeCents,
  deriveBookingPaymentStatusFromScheduleStatuses,
  MAX_PAYOUT_TRANSFER_RETRIES,
} from "../lib/routeUtils";
import {
  VENDOR_FEE_RATE,
  VENDOR_ABSORBS_STRIPE_FEES,
} from "../lib/constants";
import {
  computePayoutEligibility,
  DISPUTE_WINDOW_HOURS,
} from "../payoutEligibility";
import { createNotification } from "../lib/notificationHelpers";
import { sendPayoutProcessedEmail } from "../email";


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
    bookingPaymentRows.map((row: { status?: string | null; paymentType?: string | null }) => ({
      status: row.status,
      paymentType: row.paymentType,
    }))
  );

  // depositPaidAt = when the main booking payment was first collected.
  const depositPaidAt =
    bookingPaymentRows.find(
      (row: { paymentType?: string | null; status?: string | null; paidAt?: Date | null }) =>
        normalizePaymentStateValue(row.paymentType) === "booking" &&
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
  disputeCaseStatus: string | null;
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
  vendorAbsorbsStripeFees: boolean | null;
  paymentType: string | null;
  bookingCancellationReason: string | null;
};

export async function loadPaymentPayoutContextForUpdateInTx(
  tx: any,
  paymentId: string
): Promise<LockedPaymentPayoutContext | null> {
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
      dc.status as "disputeCaseStatus",
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
      p.payout_adjusted_amount as "payoutAdjustedAmount",
      p.vendor_absorbs_stripe_fees as "vendorAbsorbsStripeFees",
      p.payment_type as "paymentType",
      b.cancellation_reason as "bookingCancellationReason"
    from payments p
    inner join bookings b on b.id = p.booking_id
    left join dispute_cases dc on dc.booking_id = b.id
    where p.id = ${paymentId}
    -- Lock only the payments row: plain FOR UPDATE tries to lock every joined
    -- table and Postgres rejects locking the nullable side of an outer join
    -- ("FOR UPDATE cannot be applied to the nullable side of an outer join"),
    -- which made every payout refresh/candidate load throw.
    for update of p
  `);
  const row = extractRows<LockedPaymentPayoutContext>(rows)[0];
  return row?.paymentId ? row : null;
}

export async function getDisputeCaseStatusInTx(tx: any, bookingId: string): Promise<string | null> {
  const rows = await tx
    .select({
      status: disputeCases.status,
    })
    .from(disputeCases)
    .where(eq(disputeCases.bookingId, bookingId))
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
      disputeCaseStatus: paymentContext.disputeCaseStatus,
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
      vendorAbsorbsStripeFees: paymentContext.vendorAbsorbsStripeFees ?? false,
      paymentType: paymentContext.paymentType,
      bookingCancellationReason: paymentContext.bookingCancellationReason,
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
    // resource_missing is deterministic — the recorded charge id doesn't exist
    // at Stripe, so retrying every tick can never succeed. Park the row in a
    // terminal blocked state so it leaves the 25-slot candidate window instead
    // of jamming the batch forever. Transient errors keep the skip-and-retry.
    if (isStripeResourceMissingError(stripeErr)) {
      await db
        .update(payments)
        .set({
          payoutStatus: "blocked",
          payoutBlockedReason: "stripe_charge_not_found",
          payoutAdjustedAmount: payoutAmount,
        })
        .where(eq(payments.id, paymentId));
      return {
        paymentId,
        bookingId,
        outcome: "blocked",
        reason: "stripe_charge_not_found",
        payoutAmount,
        transferId: null,
      };
    }
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "stripe_verification_failed",
      payoutAmount,
      transferId: null,
    };
  }

  // Compare-and-swap claim: exactly one processor (auto worker, admin endpoint,
  // overlapping instance) may move the row eligible → scheduled before creating
  // the transfer. The loser sees 0 rows and skips — no second transfer. Claimed
  // rows are excluded from the candidate queries; if we die between claim and
  // persist, the stale-claim recovery step in the payout tick either adopts the
  // Stripe transfer (by transfer_group + metadata.paymentId) or releases the
  // claim back to 'eligible' after 30 minutes.
  const claimed = await db
    .update(payments)
    .set({ payoutStatus: "scheduled", payoutScheduledAt: new Date() })
    .where(
      and(
        eq(payments.id, paymentId),
        isNull(payments.stripeTransferId),
        eq(payments.payoutStatus, "eligible")
      )
    )
    .returning({ id: payments.id });
  if (claimed.length === 0) {
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "payout_claim_lost",
      payoutAmount,
      transferId: null,
    };
  }

  // Tracks whether the Stripe transfer was actually created, so the catch block
  // can tell "transfer failed" (safe to auto-retry) apart from "persist failed
  // after the money moved" (must NOT re-enter the retry loop — a retry after
  // the 24h idempotency-key expiry would create a second transfer).
  let createdTransfer: { id: string } | null = null;
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
      // Amount-free on purpose: a retry after the payout amount changed (e.g. a
      // refund landed in between) hits Stripe's idempotency_error instead of
      // silently creating a SECOND transfer for the new amount. The catch below
      // then blocks the row for review.
      idempotencyKey: `eventhub-payout:${paymentId}`,
    });
    createdTransfer = transfer;

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
          disputeCaseStatus: locked.disputeCaseStatus,
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
          vendorAbsorbsStripeFees: locked.vendorAbsorbsStripeFees ?? false,
          paymentType: locked.paymentType,
          bookingCancellationReason: locked.bookingCancellationReason,
        },
        nowLocked
      );

      if (!eligibilityLocked.eligible) {
        // Eligibility flipped between the transfer and this persist (e.g. a
        // refund or dispute landed in the gap) — but the Stripe transfer HAS
        // been created and the money HAS moved. Discarding transfer.id here
        // would orphan a real money movement with no DB trace. Always persist
        // the transfer and route the row to the manual-recovery workflow
        // (mirrors the existing refund_after_payout_manual_recovery pattern).
        // Decision (user-approved): flag for manual recovery, do NOT
        // auto-reverse — reversals can drive connected accounts negative and
        // fight legitimate partial-refund cases.
        logger.error(
          `[payout] payment ${paymentId} became ineligible AFTER transfer ${transfer.id} was created ` +
          `(reason: ${eligibilityLocked.payoutBlockedReason || "not_eligible"}). ` +
          `Persisting transfer and flagging for manual recovery.`
        );
        await tx
          .update(payments)
          .set({
            stripeTransferId: transfer.id,
            paidOutAt: nowLocked,
            payoutStatus: "blocked",
            payoutBlockedReason: "transfer_after_ineligible_manual_recovery",
            payoutEligibleAt: eligibilityLocked.payoutEligibleAt,
            payoutAdjustedAmount: payoutAmount,
          })
          .where(eq(payments.id, paymentId));
        return {
          outcome: "blocked" as const,
          reason: "transfer_after_ineligible_manual_recovery",
          transferId: transfer.id as string | null,
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
          payoutTransferRetryCount: 0,
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
            await createNotification({
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

    if (createdTransfer) {
      // The money moved but the persist (or the payout email path) failed.
      // Leave the row at 'scheduled' — the stale-claim recovery step in the
      // payout tick will find the transfer via transfer_group +
      // metadata.paymentId and persist it, instead of a blind retry that could
      // double-pay once the idempotency key expires.
      logger.error(
        `[payout] persist failed AFTER transfer ${createdTransfer.id} was created for payment ${paymentId}: ${errorMessage}. ` +
        `Leaving claim in place for stale-claim recovery.`
      );
      return {
        paymentId,
        bookingId,
        outcome: "skipped",
        reason: "persist_failed_after_transfer",
        payoutAmount,
        transferId: createdTransfer.id,
      };
    }

    // Transfer creation failed — nothing moved. Count the attempt and keep the
    // row auto-retryable ('transfer_failed') until MAX_PAYOUT_TRANSFER_RETRIES,
    // then park it as 'transfer_failed_permanent' (admin-only reprocessing).
    // Increment and reason are one atomic UPDATE: every reference to
    // payout_transfer_retry_count in SET reads the pre-update value, so the
    // CASE sees the same old-count + 1 that gets written. Keep the CASE in sync
    // with payoutTransferFailureBlockedReason in routeUtils.
    const [failureRow] = await db
      .update(payments)
      .set({
        payoutStatus: "blocked",
        payoutTransferRetryCount: drizzleSql`${payments.payoutTransferRetryCount} + 1`,
        payoutBlockedReason: drizzleSql`case when ${payments.payoutTransferRetryCount} + 1 >= ${MAX_PAYOUT_TRANSFER_RETRIES} then 'transfer_failed_permanent' else 'transfer_failed' end`,
        payoutAdjustedAmount: payoutAmount,
      })
      .where(eq(payments.id, paymentId))
      .returning({
        retryCount: payments.payoutTransferRetryCount,
        blockedReason: payments.payoutBlockedReason,
      });
    if (failureRow?.blockedReason === "transfer_failed_permanent") {
      logger.error(
        `[payout] transfer for payment ${paymentId} failed ${failureRow.retryCount} times — ` +
        `marked transfer_failed_permanent (admin reprocessing only): ${errorMessage}`
      );
    } else {
      logger.warn(
        `[payout] transfer failed for payment ${paymentId} (attempt ${failureRow?.retryCount ?? "?"}), ` +
        `will auto-retry: ${errorMessage}`
      );
    }
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

// Field shape shared by the PaymentIntent lookup and the lost-insert-race
// re-select in ensurePaymentRecordForIntentInTx.
const paymentRecordForIntentSelection = {
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
  vendorAbsorbsStripeFees: payments.vendorAbsorbsStripeFees,
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
};

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
    fallbackVendorAbsorbsStripeFees?: boolean | null;
  }
) {
  const paymentIntentId = asTrimmedString(params.paymentIntentId);
  if (!paymentIntentId) return null;

  const existingRows = await tx
    .select(paymentRecordForIntentSelection)
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
      // Fee policy at booking time, recovered from PaymentIntent metadata.
      // Legacy intents (created before the metadata key existed) pass null and
      // fall back to the live platform default — the only place the constant
      // is read outside normal row creation, and still creation-time.
      vendorAbsorbsStripeFees: params.fallbackVendorAbsorbsStripeFees ?? VENDOR_ABSORBS_STRIPE_FEES,
      stripeConnectedAccountId: connectedAccountId,
      payoutStatus: "not_ready",
      payoutEligibleAt,
      paymentType: (normalizePaymentStateValue(params.fallbackPaymentType) || "booking") as "booking" | "security_deposit" | "travel_fee",
      status: "pending",
    })
    // Two concurrent appliers (e.g. duplicate webhook deliveries racing the
    // sync reconcile) can both miss the lookup and insert. Losing quietly and
    // adopting the winner's row below beats 500ing the whole webhook tx.
    // Target pinned to the (PI, payment_type) partial unique index so only
    // the expected duplicate-applier race is swallowed — any other unique
    // violation surfaces instead of silently dropping the row.
    .onConflictDoNothing({
      target: [payments.stripePaymentIntentId, payments.paymentType],
      where: isNotNull(payments.stripePaymentIntentId),
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
      stripeProcessingFeeEstimate: payments.stripeProcessingFeeEstimate,
      vendorAbsorbsStripeFees: payments.vendorAbsorbsStripeFees,
      stripeChargeId: payments.stripeChargeId,
      stripeTransferId: payments.stripeTransferId,
      stripeConnectedAccountId: payments.stripeConnectedAccountId,
      customerId: payments.customerId,
      vendorAccountId: payments.vendorAccountId,
    });

  if (inserted) return inserted;

  // Insert lost a concurrent-recovery race — adopt the winner's row instead of
  // aborting the caller's transaction.
  const [adopted] = await tx
    .select(paymentRecordForIntentSelection)
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    .orderBy(drizzleSql`CASE WHEN payment_type = 'booking' THEN 0 ELSE 1 END`)
    .limit(1);
  return adopted ?? null;
}

/**
 * Applies a succeeded PaymentIntent to the DB inside a transaction: marks the
 * booking + security-deposit payment rows succeeded, recomputes the booking
 * payment status, and confirms instant-book bookings.
 *
 * This is the single source of truth for "a payment succeeded" and is invoked
 * by every confirmation path: the Stripe webhook, the synchronous post-checkout
 * reconcile endpoint, and the self-healing expiry guard. It is idempotent — if
 * the payment row is already `succeeded` it returns `alreadyProcessed: true`
 * without re-applying, so callers can gate one-time side effects (emails,
 * notifications, chat) on a genuine transition.
 */
export async function applyPaymentIntentSuccessInTx(
  tx: any,
  params: {
    paymentIntentId: string;
    latestChargeId?: string | null;
    actualStripeFeeAmount?: number | null;
    fallbackBookingId?: string | null;
    fallbackPaymentType?: string | null;
    fallbackAmount?: number | null;
    fallbackTotalAmount?: number | null;
    fallbackPlatformFeeAmount?: number | null;
    fallbackVendorGrossAmount?: number | null;
    fallbackVendorNetPayoutAmount?: number | null;
    fallbackStripeProcessingFeeEstimate?: number | null;
    fallbackStripeConnectedAccountId?: string | null;
    fallbackVendorAbsorbsStripeFees?: boolean | null;
  }
): Promise<{ bookingId: string | null; alreadyProcessed: boolean }> {
  const {
    paymentIntentId,
    latestChargeId,
    actualStripeFeeAmount,
    fallbackStripeProcessingFeeEstimate,
    fallbackStripeConnectedAccountId,
  } = params;

  const payment = await ensurePaymentRecordForIntentInTx(tx, {
    paymentIntentId,
    fallbackBookingId: params.fallbackBookingId,
    fallbackPaymentType: params.fallbackPaymentType,
    fallbackAmount: params.fallbackAmount,
    fallbackTotalAmount: params.fallbackTotalAmount,
    fallbackPlatformFeeAmount: params.fallbackPlatformFeeAmount,
    fallbackVendorGrossAmount: params.fallbackVendorGrossAmount,
    fallbackVendorNetPayoutAmount: params.fallbackVendorNetPayoutAmount,
    fallbackStripeProcessingFeeEstimate,
    fallbackStripeConnectedAccountId,
    fallbackVendorAbsorbsStripeFees: params.fallbackVendorAbsorbsStripeFees,
  });
  if (!payment?.id || !payment.bookingId) return { bookingId: null, alreadyProcessed: false };

  // Idempotency: already applied by another confirmation path — skip re-applying
  // and signal callers not to re-fire one-time side effects. One exception: if
  // this delivery carries Stripe's REAL settled fee (balance_transaction.fee)
  // and the row still holds the estimate from an earlier path that couldn't
  // fetch it, persist the real fee and refresh payout math — but only while
  // nothing has been transferred yet. Callers only pass actualStripeFeeAmount
  // non-null when it came from a real balance-transaction fetch, never an
  // estimate, so this overwrite is always estimate→actual.
  if (isPaymentSucceededStatus(payment.status)) {
    const incomingActualFee = parseIntegerValue(actualStripeFeeAmount);
    const storedActualFee = parseIntegerValue(payment.actualStripeFeeAmount);
    const notYetPaidOut =
      !payment.paidOutAt &&
      !asTrimmedString(payment.stripeTransferId) &&
      normalizePaymentStateValue(payment.payoutStatus) !== "paid";
    if (incomingActualFee != null && incomingActualFee !== storedActualFee && notYetPaidOut) {
      await tx
        .update(payments)
        .set({ actualStripeFeeAmount: incomingActualFee })
        .where(eq(payments.id, payment.id));
      await refreshPaymentPayoutStateInTx(tx, payment.id, new Date());
    }
    return { bookingId: payment.bookingId, alreadyProcessed: true };
  }

  const now = new Date();
  const [bookingRow] = await tx
    .select({
      id: bookings.id,
      status: bookings.status,
      cancellationReason: bookings.cancellationReason,
      bookingEndAt: bookings.bookingEndAt,
      totalAmount: bookings.totalAmount,
      platformFee: bookings.platformFee,
      subtotalAmountCents: bookings.subtotalAmountCents,
      vendorPayout: bookings.vendorPayout,
      instantBookSnapshot: bookings.instantBookSnapshot,
      outsideServiceRadius: bookings.outsideServiceRadius,
    })
    .from(bookings)
    .where(eq(bookings.id, payment.bookingId))
    .limit(1);
  if (!bookingRow?.id) return { bookingId: payment.bookingId, alreadyProcessed: false };

  const disputeCaseStatus = await getDisputeCaseStatusInTx(tx, payment.bookingId);

  const payoutEligibility = computePayoutEligibility({
    bookingStatus: bookingRow.status,
    paymentStatus: "succeeded",
    payoutStatus: payment.payoutStatus,
    payoutBlockedReason: payment.payoutBlockedReason,
    disputeStatus: payment.disputeStatus,
    disputeCaseStatus,
    paidOutAt: payment.paidOutAt,
    payoutEligibleAt: payment.payoutEligibleAt,
    bookingEndAt: bookingRow.bookingEndAt,
    totalAmount: payment.totalAmount ?? parseIntegerValue(bookingRow.totalAmount) ?? payment.amount,
    refundedAmount: payment.refundAmount,
    vendorNetPayoutAmount: payment.vendorNetPayoutAmount,
    actualStripeFeeAmount: actualStripeFeeAmount ?? payment.actualStripeFeeAmount,
    stripeConnectedAccountId: payment.stripeConnectedAccountId ?? fallbackStripeConnectedAccountId,
    stripeChargeId: payment.stripeChargeId ?? latestChargeId,
    stripeTransferId: payment.stripeTransferId,
    vendorAbsorbsStripeFees: payment.vendorAbsorbsStripeFees ?? false,
    paymentType: payment.paymentType,
    bookingCancellationReason: bookingRow.cancellationReason,
  }, now);

  await tx
    .update(payments)
    .set({
      status: "succeeded",
      paidAt: now,
      stripeChargeId: latestChargeId || payment.stripeChargeId || null,
      actualStripeFeeAmount:
        actualStripeFeeAmount ??
        parseIntegerValue(payment.actualStripeFeeAmount) ??
        parseIntegerValue(fallbackStripeProcessingFeeEstimate),
      totalAmount:
        parseIntegerValue(payment.totalAmount) ??
        parseIntegerValue(bookingRow.totalAmount) ??
        parseIntegerValue(payment.amount) ??
        null,
      platformFeeAmount:
        parseIntegerValue(payment.platformFeeAmount) ??
        parseIntegerValue(bookingRow.platformFee) ??
        null,
      vendorGrossAmount:
        parseIntegerValue(payment.vendorGrossAmount) ??
        parseIntegerValue(bookingRow.subtotalAmountCents),
      vendorNetPayoutAmount:
        parseIntegerValue(payment.vendorNetPayoutAmount) ??
        parseIntegerValue(bookingRow.vendorPayout) ??
        null,
      stripeProcessingFeeEstimate:
        parseIntegerValue(payment.stripeProcessingFeeEstimate) ??
        parseIntegerValue(fallbackStripeProcessingFeeEstimate),
      stripeConnectedAccountId: payment.stripeConnectedAccountId ?? fallbackStripeConnectedAccountId,
      payoutStatus: payoutEligibility.payoutStatus,
      payoutEligibleAt: payoutEligibility.payoutEligibleAt,
      payoutBlockedReason: payoutEligibility.payoutBlockedReason,
      payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
      disputeStatus: null,
    })
    .where(eq(payments.id, payment.id));

  // Mark the security deposit row (same PaymentIntent, separate row) as
  // succeeded so the auto-refund job and cancellation logic can find it.
  await tx
    .update(payments)
    .set({
      status: "succeeded",
      paidAt: now,
      stripeChargeId: latestChargeId || null,
    })
    .where(
      and(
        eq(payments.stripePaymentIntentId, paymentIntentId),
        eq(payments.paymentType, "security_deposit")
      )
    );

  const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(tx, payment.bookingId);
  const bookingStatus = normalizePaymentStateValue(bookingRow.status);
  if (bookingStatus === "cancelled" || bookingStatus === "expired" || bookingStatus === "failed") {
    await tx
      .update(bookings)
      .set({
        cancellationReason:
          bookingRow.cancellationReason || `payment_succeeded_after_${bookingStatus || "closure"}`,
        paymentStatus: nextBookingPaymentStatus as any,
        updatedAt: now,
      })
      .where(eq(bookings.id, bookingRow.id));
  } else {
    // Request-to-book listings (instantBookSnapshot = false) must stay
    // "pending" after payment — the vendor needs to explicitly accept.
    // Instant-book listings outside the service radius also stay "pending"
    // because the vendor must confirm the out-of-area booking. Only instant-book
    // listings within the service radius are auto-confirmed.
    const isInstantBook = bookingRow.instantBookSnapshot !== false;
    const requiresVendorConfirmation = !isInstantBook || bookingRow.outsideServiceRadius === true;
    await tx
      .update(bookings)
      .set({
        ...(!requiresVendorConfirmation ? { status: "confirmed" as const, confirmedAt: now } : {}),
        paymentStatus: nextBookingPaymentStatus as any,
        updatedAt: now,
      })
      .where(eq(bookings.id, bookingRow.id));
  }

  return { bookingId: payment.bookingId, alreadyProcessed: false };
}

/**
 * Applies a failed PaymentIntent to the DB inside a transaction. Mirrors the
 * `payment_intent.payment_failed` webhook branch. Idempotent: never overrides a
 * payment that already succeeded or was refunded.
 */
export async function applyPaymentIntentFailureInTx(
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
    fallbackVendorAbsorbsStripeFees?: boolean | null;
  }
): Promise<{ bookingId: string | null }> {
  const payment = await ensurePaymentRecordForIntentInTx(tx, { ...params });
  if (!payment?.id || !payment.bookingId) return { bookingId: null };

  if (
    isPaymentSucceededStatus(payment.status) ||
    isPaymentRefundedOrPartiallyRefundedStatus(payment.status)
  ) {
    return { bookingId: payment.bookingId };
  }

  await tx
    .update(payments)
    .set({
      status: "failed",
      payoutStatus: "cancelled",
      payoutBlockedReason: "payment_failed",
      payoutAdjustedAmount: 0,
    })
    .where(eq(payments.id, payment.id));

  const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(tx, payment.bookingId);
  // Only a failed BOOKING payment may kill the booking. A declined travel-fee
  // attempt on an already-paid booking must leave it confirmed (defense in
  // depth — the status derivation above ignores failed travel_fee rows too).
  if (
    nextBookingPaymentStatus === "failed" &&
    normalizePaymentStateValue(payment.paymentType) === "booking"
  ) {
    await markBookingAsPaymentFailedInTx(tx, payment.bookingId, "stripe_payment_failed");
  }
  return { bookingId: payment.bookingId };
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
    vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
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
    // Snapshot the fee policy at booking time so a later platform-default flip
    // never retroactively changes payouts for bookings already made.
    vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
    stripeConnectedAccountId: vendorAccount.stripeConnectId,
    paymentType: "booking",
    status: "pending",
    payoutStatus: "not_ready",
    payoutEligibleAt,
  }).onConflictDoNothing({
    // Safe if called twice before confirmation. Pinned to the (PI, payment_type)
    // partial unique index so other unique violations surface loudly.
    target: [payments.stripePaymentIntentId, payments.paymentType],
    where: isNotNull(payments.stripePaymentIntentId),
  });

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
    }).onConflictDoNothing({
      // Same PI as the booking row above — only the (PI, payment_type)
      // composite may conflict here. A stray single-column PI unique index
      // (see migration 0143) would otherwise silently eat this deposit row.
      target: [payments.stripePaymentIntentId, payments.paymentType],
      where: isNotNull(payments.stripePaymentIntentId),
    });
  }

  return { booking, clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
}
