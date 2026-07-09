import { sql } from "drizzle-orm";

import { db } from "../server/db";

// What this does:
//   Adds CHECK-constraint backstops for money and lifecycle invariants the
//   application already maintains but the database never enforced:
//
//   payments        — amount >= 0; refund bounded by amount; payout adjustment >= 0
//   bookings        — non-negative money snapshots; active statuses must have
//                     a booking time range
//   booking_items   — non-negative prices
//   dispute_cases   — withheld_amount_cents >= 0
//   dispute_filings — claim_amount_cents >= 0
//   travel_fee_proposals — amount_cents > 0
//   vendor_listings — cancellation_policy / travel_fee_type limited to the
//                     values the application understands (NULL allowed)
//
//   All constraints are added NOT VALID: existing rows are not scanned (no
//   table rewrite, no long lock) — enforcement applies to new INSERTs and any
//   future UPDATE of an old row. Dev was scanned 2026-07-07: zero violating
//   rows in any table. Ops may VALIDATE CONSTRAINT later at leisure.
//
//   NULL semantics: for nullable columns a NULL makes the CHECK expression
//   unknown, which passes — so e.g. `security_deposit_cents >= 0` is only
//   violated by an actual negative value.
//
// Idempotent: each constraint is DROP CONSTRAINT IF EXISTS + ADD, so re-runs
// converge on the same state.

const CHECKS: Array<{ table: string; name: string; expr: string }> = [
  // payments
  {
    table: "payments",
    name: "chk_payments_amount_nonneg",
    expr: "amount >= 0",
  },
  {
    table: "payments",
    name: "chk_payments_refund_bounded",
    expr: "refund_amount IS NULL OR (refund_amount >= 0 AND refund_amount <= amount)",
  },
  {
    table: "payments",
    name: "chk_payments_payout_adjusted_nonneg",
    expr: "payout_adjusted_amount IS NULL OR payout_adjusted_amount >= 0",
  },
  // bookings
  {
    table: "bookings",
    name: "chk_bookings_money_nonneg",
    expr:
      "total_amount >= 0 AND platform_fee >= 0 AND vendor_payout >= 0 AND " +
      "deposit_amount >= 0 AND security_deposit_cents >= 0 AND discount_amount_cents >= 0",
  },
  {
    table: "bookings",
    name: "chk_bookings_active_has_time_range",
    expr:
      "status NOT IN ('pending','confirmed','completed') OR " +
      "(booking_start_at IS NOT NULL AND booking_end_at IS NOT NULL)",
  },
  // booking_items
  {
    table: "booking_items",
    name: "chk_booking_items_prices_nonneg",
    expr: "unit_price_cents >= 0 AND total_price_cents >= 0",
  },
  // disputes
  {
    table: "dispute_cases",
    name: "chk_dispute_cases_withheld_nonneg",
    expr: "withheld_amount_cents >= 0",
  },
  {
    table: "dispute_filings",
    name: "chk_dispute_filings_claim_nonneg",
    expr: "claim_amount_cents >= 0",
  },
  // travel fees
  {
    table: "travel_fee_proposals",
    name: "chk_travel_fee_proposals_amount_positive",
    expr: "amount_cents > 0",
  },
  // vendor_listings enum-ish text columns (backstop for package-route
  // normalization landing in the follow-up branch)
  {
    table: "vendor_listings",
    name: "chk_vendor_listings_cancellation_policy",
    expr:
      "cancellation_policy IS NULL OR cancellation_policy IN " +
      "('cancel_anytime','cancel_within_hours','cancel_within_days','no_cancellations')",
  },
  {
    table: "vendor_listings",
    name: "chk_vendor_listings_travel_fee_type",
    expr: "travel_fee_type IS NULL OR travel_fee_type IN ('flat','per_mile','per_hour')",
  },
];

export async function up() {
  for (const check of CHECKS) {
    await db.execute(
      sql.raw(`alter table ${check.table} drop constraint if exists ${check.name};`)
    );
    await db.execute(
      sql.raw(
        `alter table ${check.table} add constraint ${check.name} check (${check.expr}) not valid;`
      )
    );
  }

  console.log(`[0146] Added ${CHECKS.length} NOT VALID integrity CHECK constraints.`);
}

export async function down() {
  for (const check of CHECKS) {
    await db.execute(
      sql.raw(`alter table ${check.table} drop constraint if exists ${check.name};`)
    );
  }

  console.log("[0146] down: dropped all integrity CHECK constraints.");
}
