import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { appUrl } from "../lib/routeHelpers";
import { asTrimmedString, extractRows, parseIntegerValue, parseOptionalBooleanFlag } from "../lib/routeUtils";
import { logEvent } from "../lib/events";
import { createNotification } from "../lib/notificationHelpers";
import { sendPaymentReceiptEmail, sendBookingConfirmedEmail } from "../email";
import { isStreamChatConfigured, ensureStreamBookingChannel } from "../streamChat";
import { getBookingChatContextById } from "./chatService";
import { applyPaymentIntentSuccessInTx } from "./paymentService";

type PaymentIntentLike = {
  id?: string | null;
  status?: string | null;
  amount?: number | null;
  latest_charge?: string | { id?: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Derives the booking/payout fallback fields from a PaymentIntent's metadata.
 * Mirrors the parsing the Stripe webhook does, so every reconcile path maps a
 * PaymentIntent back to a booking the same way.
 */
function fallbacksFromPaymentIntent(paymentIntent: PaymentIntentLike) {
  const metadata =
    paymentIntent?.metadata && typeof paymentIntent.metadata === "object" ? paymentIntent.metadata : {};
  const fallbackAmount = parseIntegerValue(paymentIntent?.amount);
  return {
    fallbackBookingId: asTrimmedString((metadata as any)?.bookingId) || null,
    fallbackPaymentType: asTrimmedString((metadata as any)?.paymentType) || null,
    fallbackAmount,
    fallbackTotalAmount: parseIntegerValue((metadata as any)?.totalAmount) ?? fallbackAmount,
    fallbackPlatformFeeAmount: parseIntegerValue((metadata as any)?.platformFee),
    fallbackVendorGrossAmount: parseIntegerValue((metadata as any)?.vendorGross),
    fallbackVendorNetPayoutAmount:
      parseIntegerValue((metadata as any)?.vendorNetPayout) ??
      parseIntegerValue((metadata as any)?.vendorPayout),
    fallbackStripeProcessingFeeEstimate: parseIntegerValue((metadata as any)?.stripeProcessingFeeEstimate),
    fallbackVendorAbsorbsStripeFees: parseOptionalBooleanFlag((metadata as any)?.vendorAbsorbsStripeFees),
    fallbackStripeConnectedAccountId:
      asTrimmedString((metadata as any)?.stripeConnectedAccountId) ||
      asTrimmedString((metadata as any)?.vendorStripeAccountId) ||
      null,
  };
}

/**
 * Resolves the latest charge id + actual Stripe fee for a succeeded
 * PaymentIntent. Non-fatal — payout math falls back to estimates on failure.
 */
export async function resolveChargeFee(
  paymentIntent: PaymentIntentLike
): Promise<{ latestChargeId: string; actualStripeFeeAmount: number | null }> {
  const { stripe } = await import("../stripe");
  const latestChargeId =
    typeof paymentIntent?.latest_charge === "string"
      ? paymentIntent.latest_charge.trim()
      : asTrimmedString((paymentIntent?.latest_charge as any)?.id);
  let actualStripeFeeAmount: number | null = null;
  if (latestChargeId) {
    try {
      const charge = await stripe.charges.retrieve(latestChargeId, { expand: ["balance_transaction"] });
      if (
        charge.balance_transaction &&
        typeof charge.balance_transaction !== "string" &&
        Number.isFinite((charge.balance_transaction as any).fee)
      ) {
        actualStripeFeeAmount = Math.max(0, Math.round((charge.balance_transaction as any).fee));
      }
    } catch {
      // Non-fatal.
    }
  }
  return { latestChargeId, actualStripeFeeAmount };
}

/**
 * Fires the one-time side effects of a booking payment succeeding: vendor
 * "payment received" notification, customer receipt email, vendor "booking
 * confirmed" email, and eager Stream Chat channel creation. All blocks are
 * fire-and-forget. Callers MUST gate this on a genuine status transition
 * (alreadyProcessed === false) so it never double-sends.
 */
export async function firePaymentSucceededSideEffects(args: {
  paymentIntentId: string;
  bookingId: string | null;
  paymentType: string | null;
}): Promise<void> {
  const { paymentIntentId, bookingId, paymentType } = args;
  const isBookingPayment = paymentType === "booking" && Boolean(bookingId);

  if (isBookingPayment && bookingId) {
    logEvent("booking_paid", "system", null, {
      booking_id: bookingId,
      payment_intent_id: paymentIntentId,
    });
  }

  const tasks: Promise<unknown>[] = [];

  // Notify vendor of payment received (booking payments only).
  if (isBookingPayment && bookingId) {
    tasks.push((async () => {
      try {
        const paymentRows: any = await db.execute(drizzleSql`
          select
            b.vendor_account_id as "vendorAccountId",
            b.event_date        as "eventDate",
            coalesce(b.listing_title_snapshot, '') as "listingTitle"
          from payments p
          join bookings b on b.id = p.booking_id
          where p.stripe_payment_intent_id = ${paymentIntentId}
            and p.payment_type = 'booking'
          limit 1
        `);
        const pr = extractRows<{ vendorAccountId: string; eventDate: string; listingTitle: string }>(
          paymentRows
        )[0];
        if (!pr?.vendorAccountId) return;
        await createNotification({
          recipientId: pr.vendorAccountId,
          recipientType: "vendor",
          type: "payment_received",
          title: "Payment received",
          message: `Payment for ${pr.listingTitle || "your service"} on ${pr.eventDate} has been received.`,
          link: `/vendor/bookings?bookingId=${encodeURIComponent(bookingId)}`,
          read: false,
        });
      } catch {}
    })());
  }

  // Payment receipt to customer + booking confirmed to vendor.
  tasks.push((async () => {
    try {
      const serverUrl = appUrl();
      const receiptRows: any = await db.execute(drizzleSql`
        select
          u.email          as "customerEmail",
          u.name           as "customerName",
          va.email         as "vendorEmail",
          va.business_name as "vendorName",
          b.event_date     as "eventDate",
          b.listing_title_snapshot as "listingTitle",
          b.subtotal_amount_cents   as "subtotalCents",
          b.customer_fee_amount_cents as "feeCents",
          (b.total_amount - coalesce(b.security_deposit_cents, 0)) as "totalCents",
          p.stripe_payment_intent_id as "paymentIntentId",
          p.vendor_absorbs_stripe_fees as "vendorAbsorbsStripeFees",
          p.vendor_net_payout_amount as "vendorNetPayoutCents",
          p.stripe_processing_fee_estimate as "stripeProcessingFeeCents"
        from payments p
        join bookings b on b.id = p.booking_id
        join users u on u.id = b.customer_id
        join vendor_accounts va on va.id = b.vendor_account_id
        where p.stripe_payment_intent_id = ${paymentIntentId}
          and p.payment_type = 'booking'
        limit 1
      `);
      const receipt = extractRows<{
        customerEmail: string;
        customerName: string;
        vendorEmail: string | null;
        vendorName: string;
        eventDate: string;
        listingTitle: string | null;
        subtotalCents: number | null;
        feeCents: number | null;
        totalCents: number;
        paymentIntentId: string;
        vendorAbsorbsStripeFees: boolean | null;
        vendorNetPayoutCents: number | null;
        stripeProcessingFeeCents: number | null;
      }>(receiptRows)[0];
      const receiptAddonRows: any = bookingId
        ? await db.execute(drizzleSql`
            SELECT title, unit_price_cents, total_price_cents
            FROM booking_items
            WHERE booking_id = ${bookingId} AND item_type = 'addon'
            ORDER BY created_at ASC
          `)
        : { rows: [] };
      const receiptAddOns = (receiptAddonRows.rows as any[]).map((r: any) => ({
        title: String(r.title ?? "Add-on"),
        priceCents: Number(r.total_price_cents ?? r.unit_price_cents ?? 0),
      }));

      const emailTasks: Promise<any>[] = [];
      if (receipt?.customerEmail) {
        emailTasks.push(
          sendPaymentReceiptEmail(receipt.customerEmail, {
            recipientName: receipt.customerName || "Customer",
            vendorName: receipt.vendorName || "Vendor",
            listingTitle: receipt.listingTitle || "Service",
            eventDate: receipt.eventDate,
            subtotalCents: receipt.subtotalCents ?? receipt.totalCents,
            platformFeeCents: receipt.feeCents ?? 0,
            totalCents: receipt.totalCents,
            paymentIntentId: receipt.paymentIntentId,
            addOns: receiptAddOns,
            serverUrl,
          })
        );
      }
      if (receipt?.vendorEmail) {
        // When the vendor bears Stripe's fee, show the estimated deduction and
        // resulting net payout in their confirmation email. Net = vendor gross
        // (their service earnings) minus the estimated processing fee, matching
        // the payout deduction. Old bookings (flag false) get a plain Total.
        const absorbsFee = receipt.vendorAbsorbsStripeFees === true;
        const feeEstimateCents = Math.max(0, Math.round(receipt.stripeProcessingFeeCents ?? 0));
        const vendorGrossCents = Math.max(
          0,
          Math.round(receipt.vendorNetPayoutCents ?? receipt.totalCents ?? 0)
        );
        const showPayout = absorbsFee && feeEstimateCents > 0;
        emailTasks.push(
          sendBookingConfirmedEmail(receipt.vendorEmail, {
            recipientName: receipt.vendorName || "Vendor",
            counterpartName: receipt.customerName || "Customer",
            eventDate: receipt.eventDate,
            listingTitle: receipt.listingTitle || "Service",
            totalAmountCents: receipt.totalCents,
            addOns: receiptAddOns,
            role: "vendor",
            serverUrl,
            ...(showPayout
              ? {
                  stripeProcessingFeeCents: feeEstimateCents,
                  vendorNetPayoutCents: Math.max(0, vendorGrossCents - feeEstimateCents),
                }
              : {}),
          })
        );
      }
      await Promise.allSettled(emailTasks);
    } catch (emailError: any) {
      logger.warn("[payment email] failed:", emailError?.message || emailError);
    }
  })());

  // Eagerly create the Stream Chat channel so the vendor can message the
  // customer immediately after payment.
  if (isStreamChatConfigured() && bookingId) {
    tasks.push((async () => {
      try {
        const chatCtx = await getBookingChatContextById(bookingId);
        if (chatCtx?.customerId && chatCtx?.vendorAccountId && chatCtx?.eventDate) {
          await ensureStreamBookingChannel({
            bookingId: chatCtx.bookingId,
            eventDate: chatCtx.eventDate,
            eventTitle: chatCtx.eventTitle,
            customerId: chatCtx.customerId,
            customerName: chatCtx.customerName,
            customerEmail: chatCtx.customerEmail,
            vendorAccountId: chatCtx.vendorAccountId,
            vendorName: chatCtx.vendorName,
            vendorEmail: chatCtx.vendorEmail,
          });
        }
      } catch (streamErr: any) {
        logger.warn("[stream-chat] Failed to eagerly create booking channel:", streamErr?.message);
      }
    })());
  }

  // Wait for all side-effect sends to settle, then record success so the
  // sweep (payment_effects_sweep) does not re-fire them. Set AFTER settling
  // for at-least-once semantics: a process crash before this update leaves the
  // flag false and the sweep re-sends (one possible duplicate receipt),
  // preferred over silently losing the receipt/notification/chat entirely.
  // Only booking rows carry the flag and are swept.
  await Promise.allSettled(tasks);

  if (isBookingPayment && bookingId) {
    try {
      await db.execute(drizzleSql`
        update payments
        set success_effects_sent = true
        where stripe_payment_intent_id = ${paymentIntentId}
          and payment_type = 'booking'
      `);
    } catch (flagErr: any) {
      logger.warn("[payment effects] failed to set success_effects_sent:", flagErr?.message || flagErr);
    }
  }
}

/**
 * Authoritatively reconciles a booking against Stripe by PaymentIntent id.
 * Retrieves the PaymentIntent live, and if it has succeeded, applies the
 * success in a transaction and fires one-time side effects. Safe to call from
 * anywhere (synchronous post-checkout endpoint, expiry guard, backfill script)
 * and idempotent across paths — a no-op if the payment is not yet succeeded or
 * was already applied.
 */
export async function reconcilePaymentIntent(
  paymentIntentId: string,
  opts: { source?: string } = {}
): Promise<{ bookingId: string | null; alreadyProcessed: boolean; status: string | null }> {
  const { stripe } = await import("../stripe");
  const paymentIntent = (await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  })) as PaymentIntentLike;
  const status = asTrimmedString(paymentIntent?.status) || null;

  if (status !== "succeeded") {
    return { bookingId: null, alreadyProcessed: false, status };
  }

  const fallbacks = fallbacksFromPaymentIntent(paymentIntent);
  const { latestChargeId, actualStripeFeeAmount } = await resolveChargeFee(paymentIntent);

  const result = await db.transaction(async (tx) =>
    applyPaymentIntentSuccessInTx(tx, {
      paymentIntentId,
      latestChargeId,
      actualStripeFeeAmount,
      ...fallbacks,
    })
  );

  if (result.bookingId && !result.alreadyProcessed) {
    void firePaymentSucceededSideEffects({
      paymentIntentId,
      bookingId: result.bookingId,
      paymentType: fallbacks.fallbackPaymentType,
    });
    logger.info(
      `[payment reconcile] applied succeeded PaymentIntent ${paymentIntentId} for booking ${result.bookingId} (source=${opts.source || "unknown"})`
    );
  }

  return { ...result, status };
}
