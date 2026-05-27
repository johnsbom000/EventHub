import { db } from "../db";
import { eq, and, or, inArray, sql as drizzleSql } from "drizzle-orm";
import { bookings, payments, vendorAccounts, users } from "@shared/schema";
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
import { storage } from "../storage";
import { sendBookingCancelledEmail } from "../email";
import { deleteStreamBookingChannel, isChatExpiredForEventDate, isStreamChatConfigured } from "../streamChat";
import { syncBookingToGoogleCalendarSafely } from "./googleSyncService";
import { processSinglePayoutCandidate } from "./paymentService";

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
          processed_at timestamptz not null default now()
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
  const expiredRows: any = await db.execute(drizzleSql`
    update bookings b
    set
      status = 'expired',
      payment_status = 'failed',
      cancellation_reason = coalesce(nullif(trim(b.cancellation_reason), ''), ${BOOKING_PENDING_EXPIRY_REASON}),
      cancelled_at = coalesce(b.cancelled_at, ${now}),
      updated_at = ${now}
    where b.status in ('pending', 'confirmed')
      and b.payment_status = 'pending'
      and b.created_at < now() - (${BOOKING_PENDING_EXPIRY_MINUTES} * interval '1 minute')
      and not exists (
        select 1
        from payments p
        where p.booking_id = b.id
          and p.status in ('succeeded')
      )
    returning b.id
  `);

  const bookingIds = extractRows<{ id?: string | null }>(expiredRows)
    .map((row) => asTrimmedString(row?.id))
    .filter((id): id is string => Boolean(id));

  if (bookingIds.length === 0) {
    return 0;
  }

  await db
    .update(payments)
    .set({ status: "failed" })
    .where(and(inArray(payments.bookingId, bookingIds), eq(payments.status, "pending")));

  // Fire-and-forget: delete Google Calendar events for every expired booking.
  // Each sync call is independent — one failure doesn't block the others.
  for (const bookingId of bookingIds) {
    syncBookingToGoogleCalendarSafely(bookingId, "expireStalePendingBookings google-sync").catch(() => {});
  }

  return bookingIds.length;
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
          ? storage.createNotification({
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
      coalesce(b.event_date::text, e.date) as "eventDate"
    from bookings b
    left join events e on e.id = b.event_id
    where coalesce(b.event_date::text, e.date) is not null
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
