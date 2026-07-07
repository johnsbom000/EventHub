/**
 * Detection script for the C1 payout-pipeline outage: the auto-payout worker's
 * candidate query rendered `stripe_transfer_id = NULL` (matches nothing), so
 * NO payout was ever selected automatically. This lists every vendor payment
 * that should have been paid out but never was, so the backlog drain after the
 * fix deploys is expected, not a surprise.
 *
 * Dry-run by default (report only). Pass --apply to run each row through the
 * normal payout pipeline (`processSinglePayoutCandidate` — eligibility refresh,
 * Stripe charge cross-check, transfer, locked persist). Rows that are not
 * actually eligible (dispute open, refunded, too early) are refreshed and
 * skipped by the pipeline itself, never force-paid.
 *
 * Run with:
 *   npx tsx --env-file .env server/scripts/detect_unpaid_payout_backlog.ts
 *   npx tsx --env-file .env server/scripts/detect_unpaid_payout_backlog.ts --apply
 */

import { db, pool } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import { processSinglePayoutCandidate } from "../services/paymentService";

const APPLY = process.argv.includes("--apply");

type Row = {
  paymentId: string;
  bookingId: string;
  paymentType: string;
  paymentStatus: string;
  payoutStatus: string;
  payoutBlockedReason: string | null;
  payoutEligibleAt: string | null;
  amountCents: number | null;
  vendorNetCents: number | null;
  adjustedCents: number | null;
  bookingStatus: string;
  eventDate: string | null;
  vendorName: string | null;
  vendorEmail: string | null;
};

function dollars(cents: number | null | undefined): string {
  return `$${(((cents ?? 0) as number) / 100).toFixed(2)}`;
}

async function main() {
  console.log(`\n── Unpaid payout backlog ${APPLY ? "(APPLY)" : "(dry-run)"} ─────────────────\n`);

  const result: any = await db.execute(drizzleSql`
    select
      p.id                        as "paymentId",
      p.booking_id                as "bookingId",
      p.payment_type              as "paymentType",
      p.status                    as "paymentStatus",
      p.payout_status             as "payoutStatus",
      p.payout_blocked_reason     as "payoutBlockedReason",
      p.payout_eligible_at::text  as "payoutEligibleAt",
      p.amount                    as "amountCents",
      p.vendor_net_payout_amount  as "vendorNetCents",
      p.payout_adjusted_amount    as "adjustedCents",
      b.status                    as "bookingStatus",
      b.event_date::text          as "eventDate",
      va.business_name            as "vendorName",
      va.email                    as "vendorEmail"
    from payments p
    join bookings b on b.id = p.booking_id
    left join vendor_accounts va on va.id = b.vendor_account_id
    where p.payment_type in ('booking', 'travel_fee')
      and p.stripe_transfer_id is null
      -- 'scheduled' rows are actively claimed by a payout processor (CAS in
      -- processSinglePayoutCandidate) — feeding them back into the pipeline
      -- would race the claim owner. Stuck claims are handled by the payout
      -- tick's stale-claim recovery.
      and p.payout_status in ('not_ready', 'eligible', 'blocked')
      and b.status != 'cancelled'
    order by p.payout_eligible_at asc nulls last, p.created_at asc
  `);

  const rows: Row[] = (result.rows as Row[]) ?? [];
  console.log(`Found ${rows.length} unpaid payout row(s) (no transfer, booking not cancelled).\n`);

  const byVendor = new Map<string, { count: number; cents: number }>();
  for (const row of rows) {
    const key = row.vendorName || row.vendorEmail || "(unknown vendor)";
    const agg = byVendor.get(key) ?? { count: 0, cents: 0 };
    agg.count += 1;
    agg.cents += row.adjustedCents ?? row.vendorNetCents ?? 0;
    byVendor.set(key, agg);

    console.log(
      `  ${row.paymentId}  ${row.paymentType.padEnd(10)} ${row.payoutStatus.padEnd(9)} ` +
        `${dollars(row.adjustedCents ?? row.vendorNetCents)} net  ` +
        `booking=${row.bookingId} (${row.bookingStatus}, event ${row.eventDate ?? "?"})  ` +
        `vendor=${row.vendorName ?? row.vendorEmail ?? "?"}` +
        (row.payoutBlockedReason ? `  blocked: ${row.payoutBlockedReason}` : "") +
        (row.payoutEligibleAt ? `  eligibleAt: ${row.payoutEligibleAt}` : "")
    );
  }

  if (byVendor.size > 0) {
    console.log("\n── Per-vendor totals (net payout owed if eligible) ──");
    byVendor.forEach((agg, vendor) => {
      console.log(`  ${vendor}: ${agg.count} payment(s), ${dollars(agg.cents)}`);
    });
  }

  if (APPLY && rows.length > 0) {
    console.log("\n── Applying: running each row through the payout pipeline ──");
    const outcomes = new Map<string, number>();
    for (const row of rows) {
      const outcome = await processSinglePayoutCandidate({
        paymentId: row.paymentId,
        bookingId: row.bookingId,
        dryRun: false,
      });
      outcomes.set(outcome.outcome, (outcomes.get(outcome.outcome) ?? 0) + 1);
      console.log(
        `  ${row.paymentId} → ${outcome.outcome}` +
          (outcome.reason ? ` (${outcome.reason})` : "") +
          (outcome.transferId ? `  transfer=${outcome.transferId}` : "") +
          `  ${dollars(outcome.payoutAmount)}`
      );
    }
    console.log("\n── Apply summary ──");
    outcomes.forEach((count, outcome) => console.log(`  ${outcome}: ${count}`));
  } else if (!APPLY) {
    console.log("\n  Dry run — re-run with --apply to process these through the payout pipeline.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
