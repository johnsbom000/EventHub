/**
 * Detection script for the C4 dispute-award gap: resolving a security-deposit
 * dispute with a damage withhold routed the vendor's award through the
 * automated payout pipeline (processSinglePayoutCandidate). The pipeline's
 * eligibility refresh recomputes the payout from vendor_net_payout_amount —
 * which is 0/NULL on deposit rows — so it silently cancelled the award and the
 * vendor never received the withheld money. This lists every resolved dispute
 * case whose recorded withhold has no matching Stripe transfer on the deposit
 * payment row.
 *
 * Dry-run by default (report only). Pass --apply to settle each withheld award
 * with the corrected direct-transfer settlement. The transfer uses the SAME
 * idempotency key as the fixed admin endpoint
 * (admin-dispute-deposit-payout:<caseId>:<paymentId>), and each row is
 * re-checked for an existing transfer immediately before paying, so a row the
 * endpoint already settled can never be double-paid.
 *
 * Also reports (detection ONLY — --apply never touches these) resolved
 * "payout to vendor" decisions whose deposit row was never transferred. Those
 * bookings were never stamped security_deposit_refunded_at by the old code, so
 * the hourly auto-refund job may have since refunded the deposit to the
 * CUSTOMER — whether the vendor should still be paid is a business decision.
 *
 * Run with:
 *   npx tsx --env-file .env server/scripts/detect_unpaid_dispute_awards.ts
 *   npx tsx --env-file .env server/scripts/detect_unpaid_dispute_awards.ts --apply
 */

import { db, pool } from "../db";
import { sql as drizzleSql, eq } from "drizzle-orm";
import { payments } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

type WithheldRow = {
  caseId: string;
  bookingId: string;
  withheldCents: number;
  resolvedAt: string | null;
  resolution: string | null;
  paymentId: string;
  depositCents: number;
  refundedCents: number | null;
  paymentStatus: string;
  payoutStatus: string | null;
  payoutBlockedReason: string | null;
  stripeChargeId: string | null;
  connectedAccountSnapshot: string | null;
  bookingChargeId: string | null;
  vendorConnectId: string | null;
  vendorName: string | null;
  vendorEmail: string | null;
};

function dollars(cents: number | null | undefined): string {
  return `$${(((cents ?? 0) as number) / 100).toFixed(2)}`;
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  console.log(`\n── Unpaid dispute deposit awards ${APPLY ? "(APPLY)" : "(dry-run)"} ─────────\n`);

  // Withheld damage awards: the case records how much the admin withheld from
  // the deposit for the vendor, but the deposit payment row carries no Stripe
  // transfer. Travel-fee settlements also write withheld_amount_cents — their
  // award lives on the travel_fee payment row, so bookings with a paid or
  // still-held travel fee are excluded.
  const result: any = await db.execute(drizzleSql`
    select
      dc.id                            as "caseId",
      dc.booking_id                    as "bookingId",
      dc.withheld_amount_cents         as "withheldCents",
      dc.resolved_at::text             as "resolvedAt",
      dc.resolution                    as "resolution",
      p.id                             as "paymentId",
      p.amount                         as "depositCents",
      p.refund_amount                  as "refundedCents",
      p.status                         as "paymentStatus",
      p.payout_status                  as "payoutStatus",
      p.payout_blocked_reason          as "payoutBlockedReason",
      p.stripe_charge_id               as "stripeChargeId",
      p.stripe_connected_account_id    as "connectedAccountSnapshot",
      bp.stripe_charge_id              as "bookingChargeId",
      va.stripe_connect_id             as "vendorConnectId",
      va.business_name                 as "vendorName",
      va.email                         as "vendorEmail"
    from dispute_cases dc
    join bookings b on b.id = dc.booking_id
    join lateral (
      select * from payments dep
      where dep.booking_id = b.id and dep.payment_type = 'security_deposit'
      order by dep.created_at desc
      limit 1
    ) p on true
    left join lateral (
      select * from payments bpay
      where bpay.booking_id = b.id and bpay.payment_type = 'booking'
      order by bpay.created_at desc
      limit 1
    ) bp on true
    left join vendor_accounts va on va.id = b.vendor_account_id
    where dc.status = 'resolved'
      and dc.withheld_amount_cents > 0
      and p.stripe_transfer_id is null
      and p.payout_status is distinct from 'paid'
      and not exists (
        select 1 from payments tf
        where tf.booking_id = b.id
          and tf.payment_type = 'travel_fee'
          and (tf.stripe_transfer_id is not null or tf.payout_blocked_reason = 'travel_fee_hold')
      )
    order by dc.resolved_at asc nulls last
  `);

  const rows: WithheldRow[] = (result.rows as WithheldRow[]) ?? [];
  console.log(`Found ${rows.length} resolved case(s) with an unpaid withheld award.\n`);

  let totalOwedCents = 0;
  for (const row of rows) {
    const remaining = Math.max(0, (row.depositCents ?? 0) - (row.refundedCents ?? 0));
    const award = Math.min(row.withheldCents, remaining);
    totalOwedCents += award;
    console.log(
      `  case=${row.caseId}  payment=${row.paymentId}  withheld=${dollars(row.withheldCents)}` +
        `  payable-now=${dollars(award)} (deposit ${dollars(row.depositCents)}, already refunded ${dollars(row.refundedCents)})` +
        `  payout_status=${row.payoutStatus ?? "-"}` +
        (row.payoutBlockedReason ? ` (${row.payoutBlockedReason})` : "") +
        `  booking=${row.bookingId}  vendor=${row.vendorName ?? row.vendorEmail ?? "?"}` +
        `  resolved=${row.resolvedAt ?? "?"}`
    );
  }
  if (rows.length > 0) {
    console.log(`\n  Total payable now: ${dollars(totalOwedCents)}`);
  }

  // Detection-only companion: 'payout to vendor' decisions store no withheld
  // amount, so they are invisible to the query above. The old code also never
  // stamped security_deposit_refunded_at for them, so the hourly auto-refund
  // job may have already refunded the deposit to the customer — repairing
  // these moves NEW money and is a business decision. Never applied here.
  const payoutDecisions: any = await db.execute(drizzleSql`
    select
      dc.id                    as "caseId",
      dc.booking_id            as "bookingId",
      dc.resolved_at::text     as "resolvedAt",
      dc.resolution            as "resolution",
      p.id                     as "paymentId",
      p.amount                 as "depositCents",
      p.refund_amount          as "refundedCents",
      p.status                 as "paymentStatus",
      p.payout_status          as "payoutStatus",
      p.payout_blocked_reason  as "payoutBlockedReason",
      va.business_name         as "vendorName"
    from dispute_cases dc
    join bookings b on b.id = dc.booking_id
    join lateral (
      select * from payments dep
      where dep.booking_id = b.id and dep.payment_type = 'security_deposit'
      order by dep.created_at desc
      limit 1
    ) p on true
    left join vendor_accounts va on va.id = b.vendor_account_id
    where dc.status = 'resolved'
      and dc.withheld_amount_cents is null
      and dc.resolution = 'Payout approved to vendor'
      and p.stripe_transfer_id is null
      and p.payout_status is distinct from 'paid'
    order by dc.resolved_at asc nulls last
  `);
  const payoutRows = (payoutDecisions.rows as any[]) ?? [];
  if (payoutRows.length > 0) {
    console.log(
      `\n── ${payoutRows.length} 'payout to vendor' decision(s) never transferred (REPORT ONLY, not applied) ──`
    );
    for (const row of payoutRows) {
      console.log(
        `  case=${row.caseId}  payment=${row.paymentId}  deposit=${dollars(row.depositCents)}` +
          `  refunded-to-customer=${dollars(row.refundedCents)}  status=${row.paymentStatus}` +
          `  payout_status=${row.payoutStatus ?? "-"}` +
          (row.payoutBlockedReason ? ` (${row.payoutBlockedReason})` : "") +
          `  booking=${row.bookingId}  vendor=${row.vendorName ?? "?"}  resolved=${row.resolvedAt ?? "?"}`
      );
    }
  }

  if (APPLY && rows.length > 0) {
    console.log("\n── Applying: direct-transfer settlement per withheld award ──");
    const { transferToVendor } = await import("../stripe");
    const outcomes = new Map<string, number>();
    const bump = (key: string) => outcomes.set(key, (outcomes.get(key) ?? 0) + 1);

    for (const row of rows) {
      // Guard: re-read the deposit row immediately before paying — the fixed
      // admin endpoint (or a previous run of this script) may have settled it
      // since the candidate query above ran.
      const fresh: any = await db.execute(drizzleSql`
        select stripe_transfer_id as "stripeTransferId",
               payout_status      as "payoutStatus",
               refund_amount      as "refundedCents"
        from payments where id = ${row.paymentId} limit 1
      `);
      const freshRow = fresh.rows?.[0] as any;
      if (!freshRow) {
        console.log(`  ${row.caseId} → skipped (payment row disappeared)`);
        bump("skipped_missing_row");
        continue;
      }
      if (trimmed(freshRow.stripeTransferId) || freshRow.payoutStatus === "paid") {
        console.log(`  ${row.caseId} → skipped (already transferred: ${freshRow.stripeTransferId ?? "paid"})`);
        bump("skipped_already_paid");
        continue;
      }

      const remaining = Math.max(0, (row.depositCents ?? 0) - (Number(freshRow.refundedCents) || 0));
      const award = Math.min(row.withheldCents, remaining);
      if (award <= 0) {
        // The deposit already left the platform as a customer refund — paying
        // the vendor now would move NEW money. Business decision; report only.
        console.log(`  ${row.caseId} → skipped (nothing left of the deposit to transfer)`);
        bump("skipped_nothing_remaining");
        continue;
      }

      const connectedAccountId =
        trimmed(row.connectedAccountSnapshot) || trimmed(row.vendorConnectId);
      if (!connectedAccountId) {
        console.log(`  ${row.caseId} → skipped (vendor has no connected Stripe account)`);
        bump("skipped_no_connected_account");
        continue;
      }

      try {
        const transfer = await transferToVendor({
          amount: award,
          vendorStripeAccountId: connectedAccountId,
          description: `Dispute damage withhold for booking ${row.bookingId}`,
          sourceTransaction:
            trimmed(row.stripeChargeId) || trimmed(row.bookingChargeId) || undefined,
          transferGroup: `booking_${row.bookingId}`,
          metadata: {
            bookingId: row.bookingId,
            paymentId: row.paymentId,
            kind: "dispute_deposit_withhold",
          },
          // Same key as the fixed admin endpoint — Stripe dedupes across both.
          idempotencyKey: `admin-dispute-deposit-payout:${row.caseId}:${row.paymentId}`,
        });

        const now = new Date();
        await db.transaction(async (tx) => {
          await tx
            .update(payments)
            .set({
              payoutStatus: "paid",
              payoutEligibleAt: now,
              payoutBlockedReason: null,
              payoutAdjustedAmount: award,
              paidOutAt: now,
              stripeTransferId: transfer.id,
            })
            .where(eq(payments.id, row.paymentId));

          // Stamp the booking (keep an earlier stamp if one exists) so the
          // hourly deposit auto-refund job can never re-select this row.
          await tx.execute(drizzleSql`
            update bookings
            set security_deposit_refunded_at = coalesce(security_deposit_refunded_at, ${now}),
                updated_at = ${now}
            where id = ${row.bookingId}
          `);
        });

        console.log(`  ${row.caseId} → paid ${dollars(award)}  transfer=${transfer.id}`);
        bump("paid");
      } catch (err: any) {
        console.log(`  ${row.caseId} → FAILED: ${err?.message || err}`);
        bump("failed");
      }
    }

    console.log("\n── Apply summary ──");
    outcomes.forEach((count, outcome) => console.log(`  ${outcome}: ${count}`));
  } else if (!APPLY && rows.length > 0) {
    console.log("\n  Dry run — re-run with --apply to settle the withheld awards above.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
