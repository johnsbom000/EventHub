/**
 * One-time cleanup for "orphaned" charges: bookings that were marked
 * expired/failed even though the customer's card was actually charged (the
 * confirmation webhook was lost, so the 30-min expiry job reaped a paid
 * booking). This pre-dates the resilience fix (synchronous reconcile + Stripe-
 * aware expiry guard); going forward those layers prevent new orphans, but
 * already-terminal bookings need this backfill.
 *
 * For each expired/failed booking whose booking-type PaymentIntent is actually
 * `succeeded` in Stripe:
 *   • event date in the FUTURE  → restore the booking to paid (un-expire) and
 *     mark the payment succeeded via the shared reconcile logic.
 *   • event date in the PAST    → leave untouched; print it for manual
 *     refund/decision in the Stripe dashboard.
 *
 * Dry-run by default (prints what it WOULD do). Pass --apply to make changes.
 *
 * Run with:
 *   npx tsx --env-file .env server/scripts/reconcile_orphaned_payments.ts
 *   npx tsx --env-file .env server/scripts/reconcile_orphaned_payments.ts --apply
 */

import { db, pool } from "../db";
import { bookings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sql as drizzleSql } from "drizzle-orm";
import { reconcilePaymentIntent } from "../services/paymentReconcile";

const APPLY = process.argv.includes("--apply");

type Row = {
  bookingId: string;
  status: string;
  eventDate: string | null;
  instantBookSnapshot: boolean | null;
  outsideServiceRadius: boolean | null;
  totalAmount: number | null;
  paymentIntentId: string | null;
  customerEmail: string | null;
};

function isFutureDate(eventDate: string | null): boolean {
  if (!eventDate) return false;
  const d = new Date(eventDate);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime();
}

async function main() {
  console.log(`\n── Orphaned payment reconcile ${APPLY ? "(APPLY)" : "(dry-run)"} ──────────\n`);

  const rows: any = await db.execute(drizzleSql`
    select
      b.id                       as "bookingId",
      b.status                   as "status",
      b.event_date::text         as "eventDate",
      b.instant_book_snapshot    as "instantBookSnapshot",
      b.outside_service_radius   as "outsideServiceRadius",
      b.total_amount             as "totalAmount",
      u.email                    as "customerEmail",
      (
        select p.stripe_payment_intent_id
        from payments p
        where p.booking_id = b.id and p.payment_type = 'booking'
        order by p.created_at desc
        limit 1
      ) as "paymentIntentId"
    from bookings b
    left join users u on u.id = b.customer_id
    where b.status in ('expired', 'failed')
    order by b.created_at desc
  `);

  const candidates: Row[] = (rows.rows as any[]).filter((r) => r?.paymentIntentId);
  console.log(`Found ${candidates.length} expired/failed booking(s) with a PaymentIntent to check.\n`);

  const { stripe } = await import("../stripe");
  let restored = 0;
  const toRefund: Row[] = [];
  let notSucceeded = 0;

  for (const row of candidates) {
    let status = "";
    try {
      const intent = await stripe.paymentIntents.retrieve(row.paymentIntentId as string);
      status = String(intent?.status || "");
    } catch (err: any) {
      console.log(`  ⚠️  ${row.bookingId} — Stripe lookup failed (${err?.message || err}); skipping`);
      continue;
    }

    if (status !== "succeeded") {
      notSucceeded += 1;
      continue;
    }

    const amount = ((row.totalAmount ?? 0) / 100).toFixed(2);
    if (isFutureDate(row.eventDate)) {
      console.log(
        `  ✅ RESTORE ${row.bookingId} — paid $${amount}, event ${row.eventDate} (upcoming), customer ${row.customerEmail ?? "?"}`
      );
      if (APPLY) {
        await reconcilePaymentIntent(row.paymentIntentId as string, { source: "orphan_backfill" });
        // reconcile records the payment + paymentStatus, but leaves a terminal
        // booking terminal — explicitly reactivate it for the upcoming event.
        const isInstantBook = row.instantBookSnapshot !== false;
        const requiresVendorConfirmation = !isInstantBook || row.outsideServiceRadius === true;
        await db
          .update(bookings)
          .set({
            status: requiresVendorConfirmation ? "pending" : "confirmed",
            ...(requiresVendorConfirmation ? {} : { confirmedAt: new Date() }),
            cancelledAt: null,
            cancellationReason: null,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, row.bookingId));
        restored += 1;
      }
    } else {
      toRefund.push(row);
    }
  }

  if (toRefund.length > 0) {
    console.log(`\n── Past-event orphans (charged, event already passed) — refund/decide manually ──`);
    for (const row of toRefund) {
      const amount = ((row.totalAmount ?? 0) / 100).toFixed(2);
      console.log(
        `  💸 ${row.bookingId} — paid $${amount}, event ${row.eventDate ?? "?"}, customer ${row.customerEmail ?? "?"}, PI ${row.paymentIntentId}`
      );
    }
  }

  console.log("\n── Summary ──────────────────────────────");
  console.log(`  Checked:                 ${candidates.length}`);
  console.log(`  Succeeded in Stripe:     ${candidates.length - notSucceeded}`);
  console.log(`  ${APPLY ? "Restored" : "Would restore"} (upcoming):  ${APPLY ? restored : "see ✅ above"}`);
  console.log(`  To refund (past event):  ${toRefund.length}`);
  console.log(`  Not actually paid:       ${notSucceeded}`);
  if (!APPLY) console.log(`\n  Dry run — re-run with --apply to perform the restores.`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
