import { db } from "../db";
import { eq, and, or, inArray, sql as drizzleSql } from "drizzle-orm";
import { bookings, payments, vendorAccounts, users, vendorSuspensions, vendorProfiles } from "@shared/schema";
import { logger } from "../lib/logger";
import { appUrl } from "../lib/routeHelpers";
import {
  asTrimmedString,
  extractRows,
  parseIntegerValue,
} from "../lib/routeUtils";
import {
  BOOKING_PENDING_EXPIRY_MINUTES,
  BOOKING_PENDING_EXPIRY_REASON,
  BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS,
  BOOKING_VENDOR_NO_RESPONSE_REASON,
  AUTO_PAYOUT_INTERVAL_MS,
} from "../lib/constants";
import { tryAcquireWorkerLock, releaseWorkerLock } from "../lib/workerLocks";
import { createNotification } from "../lib/notificationHelpers";
import {
  sendBookingCancelledEmail,
  sendEventDayReminderEmail,
  sendSuspensionLiftedEmail,
  sendPendingRequestReminderEmail,
} from "../email";
import { deleteStreamBookingChannel, isChatExpiredForEventDate, isStreamChatConfigured } from "../streamChat";
import { syncBookingToGoogleCalendarSafely, runGoogleBookingSyncVerificationForVendorAccount } from "./googleSyncService";
import { renewExpiringGoogleCalendarWatchChannels } from "../google";
import { processSinglePayoutCandidate } from "./paymentService";
import { reconcilePaymentIntent } from "./paymentReconcile";
import { runReviewPromptJob } from "../jobs/reviewPromptJob";
import { runStripeWebhookCleanupJob } from "../jobs/stripeWebhookCleanup";

// Module-level lazy-init guards for DDL-side-effect tables
let moderationTableReadyPromise: Promise<void> | null = null;
let stripeWebhookTableReadyPromise: Promise<void> | null = null;

// Concurrency guards for the auto-payout background worker
let autoPayoutWorkerStarted = false;
let autoPayoutTickInFlight = false;

export async function ensureModerationTable() {
  if (!moderationTableReadyPromise) {
    moderationTableReadyPromise = (async () => {
      await db.execute(drizzleSql`
        create table if not exists chat_moderation_flags (
          id uuid primary key default gen_random_uuid(),
          booking_id text not null,
          actor_type text not null,
          actor_id text not null,
          reason text not null,
          sample_text text,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
      `);
      await db.execute(drizzleSql`
        create index if not exists idx_chat_moderation_flags_actor
        on chat_moderation_flags (actor_type, actor_id, created_at desc)
      `);
      await db.execute(drizzleSql`
        create index if not exists idx_chat_moderation_flags_booking
        on chat_moderation_flags (booking_id, created_at desc)
      `);
    })().catch((error) => {
      moderationTableReadyPromise = null;
      throw error;
    });
  }

  await moderationTableReadyPromise;
}

export async function ensureStripeWebhookTable() {
  if (!stripeWebhookTableReadyPromise) {
    stripeWebhookTableReadyPromise = (async () => {
      await db.execute(drizzleSql`
        create table if not exists stripe_webhook_events (
          id varchar primary key default gen_random_uuid(),
          event_id text not null unique,
          event_type text not null,
          livemode boolean not null default false,
          payload jsonb not null default '{}'::jsonb,
          processed_at timestamptz
        )
      `);
      await db.execute(drizzleSql`
        create index if not exists idx_stripe_webhook_events_processed_at
        on stripe_webhook_events (processed_at desc)
      `);
    })().catch((error) => {
      stripeWebhookTableReadyPromise = null;
      throw error;
    });
  }

  await stripeWebhookTableReadyPromise;
}

export async function assertCanonicalBookingSchemaReady() {
  const requiredColumns = [
    "vendor_account_id",
    "vendor_profile_id",
    "listing_id",
    "booking_start_at",
    "booking_end_at",
    "booked_quantity",
    "base_subtotal_cents",
    "subtotal_amount_cents",
    "customer_fee_amount_cents",
    "delivery_fee_amount_cents",
    "setup_fee_amount_cents",
    "travel_fee_amount_cents",
    "logistics_total_cents",
    "vendor_timezone_snapshot",
    "google_sync_status",
    "google_event_id",
    "google_calendar_id",
  ] as const;

  const result: any = await db.execute(drizzleSql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name in (
        'vendor_account_id',
        'vendor_profile_id',
        'listing_id',
        'booking_start_at',
        'booking_end_at',
        'booked_quantity',
        'base_subtotal_cents',
        'subtotal_amount_cents',
        'customer_fee_amount_cents',
        'delivery_fee_amount_cents',
        'setup_fee_amount_cents',
        'travel_fee_amount_cents',
        'logistics_total_cents',
        'vendor_timezone_snapshot',
        'google_sync_status',
        'google_event_id',
        'google_calendar_id'
      )
  `);
  const present = new Set(
    extractRows<{ column_name?: string }>(result)
      .map((row) => (typeof row?.column_name === "string" ? row.column_name.trim() : ""))
      .filter(Boolean)
  );
  const missing = requiredColumns.filter((columnName) => !present.has(columnName));
  if (missing.length > 0) {
    throw new Error(
      `Canonical bookings schema is missing required columns: ${missing.join(", ")}. Run migrations before starting the server.`
    );
  }
}

export async function expireStalePendingBookings() {
  const now = new Date();

  // Find candidates the SQL-only heuristic would have expired: stale, still
  // payment_status='pending', with no succeeded payment row recorded yet.
  const candidateRows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      (
        select p.stripe_payment_intent_id
        from payments p
        where p.booking_id = b.id and p.payment_type = 'booking'
        order by p.created_at desc
        limit 1
      ) as "paymentIntentId"
    from bookings b
    where b.status in ('pending', 'confirmed')
      and b.payment_status = 'pending'
      and b.created_at < now() - (${BOOKING_PENDING_EXPIRY_MINUTES} * interval '1 minute')
      and not exists (
        select 1
        from payments p
        where p.booking_id = b.id
          and p.status in ('succeeded')
      )
  `);

  const candidates = extractRows<{ bookingId?: string | null; paymentIntentId?: string | null }>(candidateRows)
    .map((row) => ({
      bookingId: asTrimmedString(row?.bookingId),
      paymentIntentId: asTrimmedString(row?.paymentIntentId),
    }))
    .filter((c) => Boolean(c.bookingId));

  if (candidates.length === 0) {
    return 0;
  }

  // Before expiring, ask Stripe the truth. A "pending" booking with a succeeded
  // PaymentIntent means a confirmation path was lost (webhook + synchronous
  // reconcile both missed) — heal it instead of killing a paid booking. Anything
  // still in flight is left for the next cycle; only genuinely-abandoned
  // PaymentIntents are expired.
  const { stripe } = await import("../stripe");
  const toExpire: string[] = [];
  let reconciled = 0;
  let skippedInFlight = 0;

  for (const candidate of candidates) {
    const bookingId = candidate.bookingId as string;
    if (!candidate.paymentIntentId) {
      // Never initialized payment — truly abandoned.
      toExpire.push(bookingId);
      continue;
    }
    try {
      const intent = await stripe.paymentIntents.retrieve(candidate.paymentIntentId);
      const status = asTrimmedString(intent?.status);
      if (status === "succeeded") {
        await reconcilePaymentIntent(candidate.paymentIntentId, { source: "expiry_guard" });
        reconciled += 1;
      } else if (
        status === "processing" ||
        status === "requires_action" ||
        status === "requires_confirmation" ||
        status === "requires_capture"
      ) {
        // Payment is still in flight — don't expire; revisit next cycle.
        skippedInFlight += 1;
      } else {
        // requires_payment_method / canceled / unknown → abandoned.
        toExpire.push(bookingId);
      }
    } catch (err: any) {
      // Stripe lookup failed — fail safe toward NOT expiring a possibly-paid
      // booking. It'll be re-evaluated on the next cycle.
      skippedInFlight += 1;
      logger.warn(
        `[booking expiry] Stripe lookup failed for booking ${bookingId} (pi=${candidate.paymentIntentId}); skipping this cycle:`,
        err?.message || err
      );
    }
  }

  if (reconciled > 0 || skippedInFlight > 0) {
    logger.info(
      `[booking expiry] guard: reconciled ${reconciled} paid-but-unsynced booking(s), skipped ${skippedInFlight} in-flight, expiring ${toExpire.length}`
    );
  }

  if (toExpire.length === 0) {
    return 0;
  }

  await db
    .update(bookings)
    .set({
      status: "expired",
      paymentStatus: "failed",
      cancellationReason: drizzleSql`coalesce(nullif(trim(${bookings.cancellationReason}), ''), ${BOOKING_PENDING_EXPIRY_REASON})`,
      cancelledAt: drizzleSql`coalesce(${bookings.cancelledAt}, ${now})`,
      updatedAt: now,
    })
    .where(
      and(
        inArray(bookings.id, toExpire),
        inArray(bookings.status, ["pending", "confirmed"]),
        eq(bookings.paymentStatus, "pending")
      )
    );

  await db
    .update(payments)
    .set({ status: "failed" })
    .where(and(inArray(payments.bookingId, toExpire), eq(payments.status, "pending")));

  // Fire-and-forget: delete Google Calendar events for every expired booking.
  // Each sync call is independent — one failure doesn't block the others.
  for (const bookingId of toExpire) {
    syncBookingToGoogleCalendarSafely(bookingId, "expireStalePendingBookings google-sync").catch(() => {});
  }

  return toExpire.length;
}

export async function cancelUnansweredBookingRequests(): Promise<number> {
  const now = new Date();

  // Find paid bookings that required vendor confirmation but were never acted on.
  // Criteria: still 'pending' (not confirmed/declined), payment succeeded, and
  // the booking was either request-to-book or outside the listing's service radius.
  const candidateRows: any = await db.execute(drizzleSql`
    select
      b.id                                    as id,
      b.total_amount                          as total_amount,
      coalesce(b.listing_title_snapshot, '')  as listing_title,
      b.event_date                            as event_date,
      va.email                                as vendor_email,
      coalesce(va.business_name, '')          as vendor_name,
      u.email                                 as customer_email,
      coalesce(u.name, '')                    as customer_name,
      b.customer_id                           as customer_id
    from bookings b
    join vendor_accounts va on va.id = b.vendor_account_id
    join users u            on u.id  = b.customer_id
    where b.status = 'pending'
      and b.payment_status in ('paid', 'succeeded', 'partial', 'partially_refunded')
      and (b.instant_book_snapshot = false or b.outside_service_radius = true)
      and b.created_at < now() - (${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} * interval '1 day')
  `);

  type CandidateRow = {
    id: string;
    total_amount: number;
    listing_title: string;
    event_date: string;
    vendor_email: string;
    vendor_name: string;
    customer_email: string;
    customer_name: string;
    customer_id: string | null;
  };

  const candidates = extractRows<CandidateRow>(candidateRows).filter(
    (r): r is CandidateRow => Boolean(r?.id && r?.customer_email)
  );

  if (candidates.length === 0) return 0;

  const { refundBookingPayment } = await import("../stripe");
  const serverUrl = appUrl();
  let cancelled = 0;

  for (const row of candidates) {
    try {
      // Fetch all refundable payments for this booking.
      const bookingPayments = await db
        .select({
          id: payments.id,
          paymentType: payments.paymentType,
          stripePaymentIntentId: payments.stripePaymentIntentId,
          status: payments.status,
          amount: payments.amount,
          refundAmount: payments.refundAmount,
        })
        .from(payments)
        .where(
          and(
            eq(payments.bookingId, row.id),
            or(eq(payments.status, "succeeded"), eq(payments.status, "partially_refunded"))
          )
        );

      // Mark the booking cancelled.
      await db
        .update(bookings)
        .set({
          status: "cancelled" as const,
          cancellationReason: BOOKING_VENDOR_NO_RESPONSE_REASON,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(bookings.id, row.id));

      // Issue full refunds and mark each payment record.
      let totalRefundedCents = 0;
      for (const p of bookingPayments) {
        const alreadyRefunded = typeof p.refundAmount === "number" ? p.refundAmount : 0;
        const refundable = Math.max(0, p.amount - alreadyRefunded);
        if (refundable > 0 && p.stripePaymentIntentId) {
          try {
            await refundBookingPayment({
              paymentIntentId: p.stripePaymentIntentId,
              amount: refundable,
              reason: "duplicate",
              idempotencyKey: `vendor-no-response:${row.id}:${p.id}`,
            });
          } catch (stripeErr: any) {
            logger.warn(`[vendor-no-response] Stripe refund failed for payment ${p.id}:`, stripeErr?.message);
          }
        }
        await db
          .update(payments)
          .set({
            status: "refunded" as any,
            refundAmount: p.amount,
            refundReason: BOOKING_VENDOR_NO_RESPONSE_REASON,
            refundedAt: now,
            payoutStatus: "cancelled",
            payoutEligibleAt: null,
            payoutBlockedReason: BOOKING_VENDOR_NO_RESPONSE_REASON,
            payoutAdjustedAmount: 0,
          })
          .where(eq(payments.id, p.id));
        totalRefundedCents += refundable;
      }

      // Fire-and-forget: emails + calendar sync.
      const vendorReasonNote = `This booking was automatically cancelled because it was not accepted within ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days.`;
      const customerReasonNote = `Your vendor did not respond within ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days. Your booking has been automatically cancelled and a full refund has been issued.`;

      Promise.allSettled([
        row.customer_email
          ? sendBookingCancelledEmail(row.customer_email, {
              recipientName: row.customer_name || "Customer",
              counterpartName: row.vendor_name || "Vendor",
              eventDate: row.event_date,
              listingTitle: row.listing_title || "Service",
              role: "customer",
              cancelledBy: "system",
              reasonNote: customerReasonNote,
              totalAmountCents: row.total_amount,
              refundAmountCents: totalRefundedCents,
              serverUrl,
            })
          : Promise.resolve(),
        row.vendor_email
          ? sendBookingCancelledEmail(row.vendor_email, {
              recipientName: row.vendor_name || "Vendor",
              counterpartName: row.customer_name || "Customer",
              eventDate: row.event_date,
              listingTitle: row.listing_title || "Service",
              role: "vendor",
              cancelledBy: "system",
              reasonNote: vendorReasonNote,
              serverUrl,
            })
          : Promise.resolve(),
        syncBookingToGoogleCalendarSafely(row.id, "cancelUnansweredBookingRequests google-sync"),
        row.customer_id
          ? createNotification({
              recipientId: row.customer_id,
              recipientType: "customer",
              type: "booking_cancelled",
              title: "Booking expired — vendor didn't respond",
              message: `Your booking for ${row.listing_title || "the service"} on ${row.event_date} was automatically cancelled because the vendor did not respond within ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days. A full refund has been issued.`,
              link: "/dashboard/events",
              read: false,
            }).catch(() => {})
          : Promise.resolve(),
      ]).catch(() => {});

      cancelled++;
    } catch (err: any) {
      logger.warn(`[vendor-no-response] failed to cancel booking ${row.id}:`, err?.message || err);
    }
  }

  return cancelled;
}

export async function cleanupExpiredStreamChannels() {
  if (!isStreamChatConfigured()) {
    return { checked: 0, deleted: 0 };
  }

  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      coalesce(b.event_date::text, e.date::text) as "eventDate"
    from bookings b
    left join events e on e.id = b.event_id
    where coalesce(b.event_date::text, e.date::text) is not null
    order by b.created_at desc
    limit 500
  `);

  const records = extractRows<{ bookingId?: string; eventDate?: string | null }>(rows);
  let deleted = 0;

  for (const record of records) {
    const bookingId = String(record?.bookingId || "").trim();
    const eventDate = record?.eventDate ? String(record.eventDate) : null;
    if (!bookingId || !eventDate) continue;
    if (!isChatExpiredForEventDate(eventDate)) continue;

    try {
      await deleteStreamBookingChannel(bookingId);
      deleted += 1;
    } catch {
      // Ignore non-existent channels; keep cleanup idempotent.
    }
  }

  return {
    checked: records.length,
    deleted,
  };
}

export async function runAutoPayoutTick() {
  await runAutoPayoutTickWithResult();
}

export async function runAutoPayoutTickWithResult(): Promise<boolean> {
  if (autoPayoutTickInFlight) return false;

  // Distributed lock: stale after 15 min (1.5× the 10-min tick interval).
  // Prevents double-payouts if two instances briefly overlap during a deploy.
  const lockAcquired = await tryAcquireWorkerLock("payout", 15 * 60 * 1000);
  if (!lockAcquired) {
    logger.info("[auto-payout] lock held by another instance — skipping tick");
    return false;
  }

  autoPayoutTickInFlight = true;
  try {
    await expireStalePendingBookings();

    const payoutCandidates = await db
      .select({
        paymentId: payments.id,
        bookingId: payments.bookingId,
      })
      .from(payments)
      .where(
        and(
          eq(payments.paymentType, "booking"),
          eq(payments.stripeTransferId, null as any),
          inArray(payments.payoutStatus, ["not_ready", "eligible", "scheduled"])
        )
      )
      .orderBy(drizzleSql`${payments.payoutEligibleAt} asc`, drizzleSql`${payments.createdAt} asc`)
      .limit(25);

    for (const candidate of payoutCandidates) {
      await processSinglePayoutCandidate({
        paymentId: candidate.paymentId,
        bookingId: candidate.bookingId,
        dryRun: false,
      });
    }
    return false;
  } catch (error) {
    logger.error({ err: error }, "auto payout tick failed");
    return true;
  } finally {
    autoPayoutTickInFlight = false;
    await releaseWorkerLock("payout");
  }
}

export async function runSecurityDepositRefundJob(): Promise<number> {
  const lockAcquired = await tryAcquireWorkerLock("security_deposit_refund", 70 * 60 * 1000);
  if (!lockAcquired) {
    logger.info("[security-deposit-refund] lock held by another instance — skipping");
    return 0;
  }
  try {
    const eligible: any = await db.execute(drizzleSql`
      SELECT
        p.id                       AS payment_id,
        p.stripe_payment_intent_id AS stripe_pi_id,
        p.amount                   AS deposit_cents,
        b.id                       AS booking_id,
        b.listing_title_snapshot   AS listing_title
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE p.payment_type = 'security_deposit'
        AND p.status = 'succeeded'
        AND b.security_deposit_cents > 0
        AND b.security_deposit_refunded_at IS NULL
        AND (
          (b.booking_end_at IS NOT NULL AND b.booking_end_at < now() - interval '72 hours')
          OR
          (b.booking_end_at IS NULL AND (b.event_date::date + interval '1 day') < now() - interval '72 hours')
        )
        AND b.status IN ('confirmed', 'completed')
        AND NOT EXISTS (
          SELECT 1 FROM dispute_cases dc
          WHERE dc.booking_id = b.id AND dc.status != 'resolved'
        )
      LIMIT 50
    `);

    const rows = extractRows<{
      payment_id: string;
      stripe_pi_id: string | null;
      deposit_cents: number;
      booking_id: string;
      listing_title: string | null;
    }>(eligible);

    if (rows.length === 0) return 0;

    logger.info("[security-deposit-refund] %d eligible deposit(s) to refund", rows.length);
    const { refundBookingPayment } = await import("../stripe");
    const now = new Date();
    let refunded = 0;

    for (const row of rows) {
      if (!row.stripe_pi_id) {
        logger.warn("[security-deposit-refund] payment %s has no stripe_pi_id — skipping", row.payment_id);
        continue;
      }
      try {
        await refundBookingPayment({
          paymentIntentId: row.stripe_pi_id,
          reason: "requested_by_customer",
          idempotencyKey: `auto-deposit-refund:${row.payment_id}`,
        });

        await db.transaction(async (tx) => {
          await tx
            .update(payments)
            .set({
              status: "refunded",
              refundAmount: row.deposit_cents,
              refundReason: "auto_deposit_refund_72h",
              refundedAt: now,
              payoutStatus: "cancelled",
              payoutEligibleAt: null,
              payoutBlockedReason: "auto_refunded_no_dispute",
              payoutAdjustedAmount: 0,
            })
            .where(eq(payments.id, row.payment_id));

          await tx
            .update(bookings)
            .set({ securityDepositRefundedAt: now, updatedAt: now })
            .where(eq(bookings.id, row.booking_id));
        });

        refunded++;
        logger.info(
          "[security-deposit-refund] refunded booking=%s amount=%d cents",
          row.booking_id,
          row.deposit_cents
        );
      } catch (rowErr: any) {
        logger.warn(
          "[security-deposit-refund] failed for payment=%s booking=%s: %s",
          row.payment_id,
          row.booking_id,
          rowErr?.message || rowErr
        );
      }
    }

    if (refunded > 0) {
      logger.info("[security-deposit-refund] auto-refunded %d security deposit(s)", refunded);
    }
    return refunded;
  } catch (err: any) {
    logger.warn("[security-deposit-refund] job failed: %s", err?.message || err);
    return 0;
  } finally {
    await releaseWorkerLock("security_deposit_refund");
  }
}

/**
 * Travel/delivery fees on a CUSTOMER-cancelled booking are held (not refunded
 * immediately) so the vendor has a window to claim travel costs already incurred
 * via a travel_cost_recovery dispute. This sweep auto-refunds the held fee to the
 * customer once DISPUTE_WINDOW_HOURS have elapsed since cancellation, provided no
 * unresolved dispute exists for the booking. Mirrors runSecurityDepositRefundJob.
 */
export async function runTravelFeeRefundJob(): Promise<number> {
  const lockAcquired = await tryAcquireWorkerLock("travel_fee_refund", 70 * 60 * 1000);
  if (!lockAcquired) {
    logger.info("[travel-fee-refund] lock held by another instance — skipping");
    return 0;
  }
  try {
    const eligible: any = await db.execute(drizzleSql`
      SELECT
        p.id                       AS payment_id,
        p.stripe_payment_intent_id AS stripe_pi_id,
        p.amount                   AS amount_cents,
        p.refund_amount            AS refund_amount_cents,
        b.id                       AS booking_id,
        b.listing_title_snapshot   AS listing_title
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE p.payment_type = 'travel_fee'
        AND p.status = 'succeeded'
        AND p.payout_status = 'blocked'
        AND p.payout_blocked_reason = 'travel_fee_hold'
        AND b.status = 'cancelled'
        AND b.cancelled_at IS NOT NULL
        AND b.cancelled_at < now() - interval '72 hours'  -- = DISPUTE_WINDOW_HOURS
        AND NOT EXISTS (
          SELECT 1 FROM dispute_cases dc
          WHERE dc.booking_id = b.id AND dc.status != 'resolved'
        )
      LIMIT 50
    `);

    const rows = extractRows<{
      payment_id: string;
      stripe_pi_id: string | null;
      amount_cents: number;
      refund_amount_cents: number | null;
      booking_id: string;
      listing_title: string | null;
    }>(eligible);

    if (rows.length === 0) return 0;

    logger.info("[travel-fee-refund] %d eligible held travel fee(s) to refund", rows.length);
    const { refundBookingPayment } = await import("../stripe");
    const now = new Date();
    let refunded = 0;

    for (const row of rows) {
      if (!row.stripe_pi_id) {
        logger.warn("[travel-fee-refund] payment %s has no stripe_pi_id — skipping", row.payment_id);
        continue;
      }
      const alreadyRefunded = typeof row.refund_amount_cents === "number" ? row.refund_amount_cents : 0;
      const remainingCents = Math.max(0, row.amount_cents - alreadyRefunded);
      if (remainingCents <= 0) {
        // Nothing left to refund — just clear the hold so it stops being selected.
        await db
          .update(payments)
          .set({ payoutStatus: "cancelled", payoutBlockedReason: "auto_refunded_no_dispute" })
          .where(eq(payments.id, row.payment_id));
        continue;
      }
      try {
        await refundBookingPayment({
          paymentIntentId: row.stripe_pi_id,
          amount: remainingCents,
          reason: "requested_by_customer",
          idempotencyKey: `auto-travel-refund:${row.payment_id}`,
        });

        await db.transaction(async (tx) => {
          await tx
            .update(payments)
            .set({
              status: "refunded",
              refundAmount: alreadyRefunded + remainingCents,
              refundReason: "auto_travel_refund_72h",
              refundedAt: now,
              payoutStatus: "cancelled",
              payoutEligibleAt: null,
              payoutBlockedReason: "auto_refunded_no_dispute",
              payoutAdjustedAmount: 0,
            })
            .where(eq(payments.id, row.payment_id));
        });

        refunded++;
        logger.info(
          "[travel-fee-refund] refunded booking=%s amount=%d cents",
          row.booking_id,
          remainingCents
        );
      } catch (rowErr: any) {
        logger.warn(
          "[travel-fee-refund] failed for payment=%s booking=%s: %s",
          row.payment_id,
          row.booking_id,
          rowErr?.message || rowErr
        );
      }
    }

    if (refunded > 0) {
      logger.info("[travel-fee-refund] auto-refunded %d held travel fee(s)", refunded);
    }
    return refunded;
  } catch (err: any) {
    logger.warn("[travel-fee-refund] job failed: %s", err?.message || err);
    return 0;
  } finally {
    await releaseWorkerLock("travel_fee_refund");
  }
}

export async function runBookingCompletionJob(): Promise<number> {
  const lockAcquired = await tryAcquireWorkerLock("booking_auto_complete", 5 * 60 * 60 * 1000);
  if (!lockAcquired) {
    logger.info("[booking-completion] lock held by another instance — skipping");
    return 0;
  }
  try {
    const now = new Date();
    const result: any = await db.execute(drizzleSql`
      UPDATE bookings
      SET
        status       = 'completed',
        completed_at = ${now},
        updated_at   = ${now}
      WHERE status = 'confirmed'
        AND (
          (booking_end_at IS NOT NULL AND booking_end_at < now() - interval '2 hours')
          OR
          (booking_end_at IS NULL AND event_date::date < current_date)
        )
    `);
    const rowCount = result?.rowCount ?? result?.rows?.length ?? 0;
    if (rowCount > 0) {
      logger.info("[booking-completion] auto-completed %d booking(s)", rowCount);
    }
    return rowCount;
  } catch (err: any) {
    logger.warn("[booking-completion] job failed: %s", err?.message || err);
    return 0;
  } finally {
    await releaseWorkerLock("booking_auto_complete");
  }
}

export function startAutoPayoutWorker() {
  if (autoPayoutWorkerStarted) return;
  autoPayoutWorkerStarted = true;

  let currentInterval = AUTO_PAYOUT_INTERVAL_MS;
  const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour max backoff

  const schedule = () => {
    const t = setTimeout(async () => {
      const hadError = await runAutoPayoutTickWithResult();
      if (hadError) {
        currentInterval = Math.min(currentInterval * 2, MAX_BACKOFF_MS);
        logger.warn(`[auto-payout] DB error — backing off to ${Math.round(currentInterval / 60000)}m`);
      } else {
        currentInterval = AUTO_PAYOUT_INTERVAL_MS;
      }
      schedule();
    }, currentInterval);
    t.unref?.();
  };

  // Kick once on start, then begin the backoff-aware schedule.
  void runAutoPayoutTick();
  schedule();
}

export function startReviewPromptWorker() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const serverUrl = appUrl();
  const run = () => runReviewPromptJob({ serverUrl, logger: { log: logger.info.bind(logger), warn: logger.warn.bind(logger) } }).catch((err: any) => {
    logger.warn("[review-prompt] worker error: %s", err?.message || err);
  });
  const startTimer = setTimeout(() => {
    void run();
    const t = setInterval(() => void run(), INTERVAL_MS);
    t.unref?.();
  }, 5 * 60 * 1000);
  startTimer.unref?.();
}

export function startStripeWebhookCleanupWorker() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const run = () => runStripeWebhookCleanupJob({ logger: { log: logger.info.bind(logger), warn: logger.warn.bind(logger) } }).catch((err: any) => {
    logger.warn("[stripe-webhook-cleanup] worker error: %s", err?.message || err);
  });
  const startTimer = setTimeout(() => {
    void run();
    const t = setInterval(() => void run(), INTERVAL_MS);
    t.unref?.();
  }, 20 * 60 * 1000);
  startTimer.unref?.();
}

export function startBookingExpiryWorker() {
  let backoffMs = 5 * 60 * 1000;
  const MAX_BACKOFF_MS = 60 * 60 * 1000;

  const tick = async () => {
    const lockAcquired = await tryAcquireWorkerLock("booking_expiry", 8 * 60 * 1000);
    if (!lockAcquired) return;
    try {
      const expiredCount = await expireStalePendingBookings();
      if (expiredCount > 0) logger.info(`[booking expiry] expired stale pending bookings: ${expiredCount}`);
      const noResponseCount = await cancelUnansweredBookingRequests();
      if (noResponseCount > 0) logger.info(`[booking expiry] auto-cancelled ${noResponseCount} unanswered booking request(s) after ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days`);
      backoffMs = 5 * 60 * 1000;
    } catch (error: any) {
      logger.warn("[booking expiry] cleanup failed:", error?.message || error);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    } finally {
      await releaseWorkerLock("booking_expiry");
    }
  };

  const schedule = () => {
    const t = setTimeout(async () => { await tick(); schedule(); }, backoffMs);
    t.unref?.();
  };

  void tick().then(() => schedule());
}

export function startChatCleanupWorker() {
  if (!isStreamChatConfigured()) return;
  const run = async () => {
    try {
      await cleanupExpiredStreamChannels();
    } catch (error: any) {
      logger.warn("Expired chat cleanup failed:", error?.message || error);
    }
  };
  void run();
  const t = setInterval(() => void run(), 6 * 60 * 60 * 1000);
  t.unref?.();
}

export function startGoogleVerificationWorker() {
  const rawInterval = Number(process.env.GOOGLE_SYNC_VERIFICATION_INTERVAL_MINUTES || 30);
  const intervalMinutes =
    Number.isFinite(rawInterval) && rawInterval > 0 ? Math.max(5, Math.round(rawInterval)) : 0;
  if (intervalMinutes <= 0) return;

  const run = async () => {
    try {
      const eligibleAccounts = await db
        .select({ id: vendorAccounts.id, googleConnectionStatus: vendorAccounts.googleConnectionStatus, googleCalendarId: vendorAccounts.googleCalendarId })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.googleConnectionStatus, "connected"), drizzleSql`nullif(trim(${vendorAccounts.googleCalendarId}), '') is not null`));

      for (const account of eligibleAccounts) {
        try {
          const summary = await runGoogleBookingSyncVerificationForVendorAccount(account);
          if (summary.googleCalendarReadStatus === "failed" || summary.issuesFound > 0) {
            logger.warn("[google verification] vendor=%s checked=%d issues=%d unmatched=%s readStatus=%s",
              summary.vendorAccountId || "unknown", summary.bookingsChecked, summary.issuesFound,
              summary.unmatchedEventsCount == null ? "n/a" : String(summary.unmatchedEventsCount),
              summary.googleCalendarReadStatus);
          }
        } catch (error: any) {
          logger.warn("[google verification] vendor=%s failed: %s", asTrimmedString(account.id) || "unknown", error?.message || error);
        }
      }
    } catch (error: any) {
      logger.warn("[google verification] recurring run failed:", error?.message || error);
    }
  };

  const t = setInterval(() => void run(), intervalMinutes * 60 * 1000);
  t.unref?.();
}

export function startWatchChannelRenewalWorker() {
  const run = async () => {
    try {
      const result = await renewExpiringGoogleCalendarWatchChannels();
      if (result.renewed > 0 || result.failed > 0) {
        logger.info("[watch channel renewal] renewed=%d failed=%d", result.renewed, result.failed);
      }
    } catch (error: any) {
      logger.warn("[watch channel renewal] job failed:", error?.message || error);
    }
  };
  const startTimer = setTimeout(() => {
    void run();
    const t = setInterval(() => void run(), 60 * 1000);
    t.unref?.();
  }, 15 * 1000);
  startTimer.unref?.();
}

export function startEventDayReminderWorker() {
  const INTERVAL_MS = 4 * 60 * 60 * 1000;
  const run = async () => {
    try {
      const serverUrl = appUrl();
      const windowStart = new Date(Date.now() + 20 * 60 * 60 * 1000);
      const windowEnd   = new Date(Date.now() + 28 * 60 * 60 * 1000);
      const windowStartDate = windowStart.toISOString().split("T")[0];
      const windowEndDate   = windowEnd.toISOString().split("T")[0];

      const rows: any = await db.execute(drizzleSql`
        select
          b.id                    as "bookingId",
          b.event_date            as "eventDate",
          b.event_start_time      as "eventTime",
          b.event_location        as "eventLocation",
          coalesce(b.listing_title_snapshot, '') as "listingTitle",
          u.email                 as "customerEmail",
          u.name                  as "customerName",
          va.email                as "vendorEmail",
          va.business_name        as "vendorName"
        from bookings b
        join users u              on u.id  = b.customer_id
        join vendor_accounts va   on va.id = b.vendor_account_id
        where b.event_day_reminder_sent = false
          and b.status = 'confirmed'
          and b.event_date >= ${windowStartDate}
          and b.event_date <= ${windowEndDate}
        limit 200
      `);

      const eligible = extractRows<{
        bookingId: string; eventDate: string; eventTime: string | null;
        eventLocation: string | null; listingTitle: string;
        customerEmail: string; customerName: string; vendorEmail: string; vendorName: string;
      }>(rows);

      if (eligible.length === 0) return;
      let sent = 0;
      for (const row of eligible) {
        try {
          const eventTime = row.eventTime || "See booking details";
          const tasks: Promise<any>[] = [];
          if (row.customerEmail) {
            tasks.push(sendEventDayReminderEmail(row.customerEmail, {
              recipientName: row.customerName || "Customer", counterpartName: row.vendorName || "Vendor",
              listingTitle: row.listingTitle || "Service", eventDate: row.eventDate, eventTime,
              eventLocation: row.eventLocation ?? undefined, role: "customer", serverUrl,
            }));
          }
          if (row.vendorEmail) {
            tasks.push(sendEventDayReminderEmail(row.vendorEmail, {
              recipientName: row.vendorName || "Vendor", counterpartName: row.customerName || "Customer",
              listingTitle: row.listingTitle || "Service", eventDate: row.eventDate, eventTime,
              eventLocation: row.eventLocation ?? undefined, role: "vendor", serverUrl,
            }));
          }
          await Promise.allSettled(tasks);
          await db.update(bookings).set({ eventDayReminderSent: true }).where(eq(bookings.id, row.bookingId));
          sent++;
        } catch (rowError: any) {
          logger.warn("[event day reminder] failed for booking %s: %s", row.bookingId, rowError?.message || rowError);
        }
      }
      if (sent > 0) logger.info("[event day reminder] sent %d reminder(s)", sent);
    } catch (error: any) {
      logger.warn("[event day reminder] job failed:", error?.message || error);
    }
  };
  const startTimer = setTimeout(() => {
    void run();
    const t = setInterval(() => void run(), INTERVAL_MS);
    t.unref?.();
  }, 7 * 60 * 1000);
  startTimer.unref?.();
}

export function startSuspensionLiftedWorker() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const run = async () => {
    try {
      const serverUrl = appUrl();
      const now = new Date();
      const rows: any = await db.execute(drizzleSql`
        select
          vs.id               as "suspensionId",
          va.email            as "vendorEmail",
          va.business_name    as "businessName"
        from vendor_suspensions vs
        join vendor_accounts va on va.id = vs.vendor_account_id
        where vs.lift_email_sent = false
          and vs.ends_at <= ${now}
          and va.email is not null
        limit 100
      `);
      const expired = extractRows<{ suspensionId: string; vendorEmail: string; businessName: string }>(rows);
      if (expired.length === 0) return;
      let sent = 0;
      for (const row of expired) {
        try {
          await sendSuspensionLiftedEmail(row.vendorEmail, {
            recipientName: row.businessName || "Vendor",
            businessName: row.businessName || "Your Business",
            serverUrl,
          });
          await db.execute(drizzleSql`update vendor_suspensions set lift_email_sent = true where id = ${row.suspensionId}`);
          sent++;
        } catch (rowError: any) {
          logger.warn("[suspension lifted] failed for %s: %s", row.suspensionId, rowError?.message || rowError);
        }
      }
      if (sent > 0) logger.info("[suspension lifted] sent %d notification(s)", sent);
    } catch (error: any) {
      logger.warn("[suspension lifted] job failed:", error?.message || error);
    }
  };
  const startTimer = setTimeout(() => {
    void run();
    const t = setInterval(() => void run(), INTERVAL_MS);
    t.unref?.();
  }, 15 * 60 * 1000);
  startTimer.unref?.();
}

export function startPendingRequestReminderWorker() {
  const INTERVAL_MS = 10 * 60 * 1000;
  const run = async () => {
    try {
      const serverUrl = appUrl();
      const now = new Date();
      const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const rows: any = await db.execute(drizzleSql`
        select
          b.id                        as "bookingId",
          b.event_date                as "eventDate",
          b.total_amount              as "totalCents",
          coalesce(b.listing_title_snapshot, '') as "listingTitle",
          b.pending_reminder_6pm_sent  as "sent6pm",
          b.pending_reminder_9am_sent  as "sent9am",
          b.pending_reminder_24h_sent  as "sent24h",
          b.created_at                as "createdAt",
          va.email                    as "vendorEmail",
          va.business_name            as "vendorName",
          coalesce(vp.operating_timezone, 'UTC') as "vendorTimezone",
          u.name                      as "customerName"
        from bookings b
        join vendor_accounts va   on va.id = b.vendor_account_id
        left join vendor_profiles vp on vp.account_id = va.id and vp.active = true
        join users u              on u.id  = b.customer_id
        where b.status = 'pending'
          and b.created_at >= ${cutoff}
          and (
            b.pending_reminder_6pm_sent = false
            or b.pending_reminder_9am_sent = false
            or b.pending_reminder_24h_sent = false
          )
          and va.email is not null
        limit 200
      `);
      const candidates = extractRows<{
        bookingId: string; eventDate: string; totalCents: number; listingTitle: string;
        sent6pm: boolean; sent9am: boolean; sent24h: boolean; createdAt: string | Date;
        vendorEmail: string; vendorName: string; vendorTimezone: string; customerName: string;
      }>(rows);
      if (candidates.length === 0) return;
      let sent = 0;
      for (const row of candidates) {
        try {
          const createdAt = new Date(row.createdAt);
          const tz = row.vendorTimezone || "UTC";
          const nowInVendorTz = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(now);
          const vendorHour = parseInt(nowInVendorTz, 10);
          const createdHourStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(createdAt);
          const createdHour = parseInt(createdHourStr, 10);
          const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
          const isAfterMidnightOfCreation = now.toDateString() !== createdAt.toDateString();

          let cadenceSent: "6pm" | "9am" | "24h" | null = null;
          let columnToSet: Partial<typeof bookings.$inferInsert> = {};

          if (!row.sent24h && hoursSinceCreation >= 24) {
            cadenceSent = "24h"; columnToSet = { pendingReminder24hSent: true };
          } else if (!row.sent9am && isAfterMidnightOfCreation && vendorHour >= 9 && vendorHour < 11) {
            cadenceSent = "9am"; columnToSet = { pendingReminder9amSent: true };
          } else if (!row.sent6pm && vendorHour >= 18 && vendorHour < 20 && createdHour < 18) {
            cadenceSent = "6pm"; columnToSet = { pendingReminder6pmSent: true };
          }

          if (!cadenceSent) continue;

          await sendPendingRequestReminderEmail(row.vendorEmail, {
            recipientName: row.vendorName || "Vendor", customerName: row.customerName || "Customer",
            listingTitle: row.listingTitle || "Service", eventDate: row.eventDate,
            totalAmountCents: row.totalCents, cadence: cadenceSent, serverUrl,
          });
          await db.update(bookings).set(columnToSet as any).where(eq(bookings.id, row.bookingId));
          sent++;
        } catch (rowError: any) {
          logger.warn("[pending reminder] failed for booking %s: %s", row.bookingId, rowError?.message || rowError);
        }
      }
      if (sent > 0) logger.info("[pending reminder] sent %d reminder(s)", sent);
    } catch (error: any) {
      logger.warn("[pending reminder] job failed:", error?.message || error);
    }
  };
  const startTimer = setTimeout(() => {
    void run();
    const t = setInterval(() => void run(), INTERVAL_MS);
    t.unref?.();
  }, 3 * 60 * 1000);
  startTimer.unref?.();
}

export function startSecurityDepositRefundWorker() {
  const INTERVAL_MS = 60 * 60 * 1000;
  const startTimer = setTimeout(() => {
    void runSecurityDepositRefundJob();
    const t = setInterval(() => void runSecurityDepositRefundJob(), INTERVAL_MS);
    t.unref?.();
  }, 7 * 60 * 1000);
  startTimer.unref?.();
}

export function startBookingCompletionWorker() {
  const INTERVAL_MS = 4 * 60 * 60 * 1000;
  const startTimer = setTimeout(() => {
    void runBookingCompletionJob();
    const t = setInterval(() => void runBookingCompletionJob(), INTERVAL_MS);
    t.unref?.();
  }, 10 * 60 * 1000);
  startTimer.unref?.();
}

export function startTravelFeeRefundWorker() {
  const INTERVAL_MS = 60 * 60 * 1000;
  const startTimer = setTimeout(() => {
    void runTravelFeeRefundJob();
    const t = setInterval(() => void runTravelFeeRefundJob(), INTERVAL_MS);
    t.unref?.();
  }, 8 * 60 * 1000);
  startTimer.unref?.();
}

export function startAllBackgroundWorkers() {
  startBookingExpiryWorker();
  startChatCleanupWorker();
  startGoogleVerificationWorker();
  startWatchChannelRenewalWorker();
  startReviewPromptWorker();
  startEventDayReminderWorker();
  startSuspensionLiftedWorker();
  startPendingRequestReminderWorker();
  startSecurityDepositRefundWorker();
  startTravelFeeRefundWorker();
  startBookingCompletionWorker();
  startAutoPayoutWorker();
  startStripeWebhookCleanupWorker();
}
