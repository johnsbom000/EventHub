import assert from "node:assert/strict";

import {
  apportionChargeRefunds,
  type ApportionmentPaymentRow,
  type RefundLike,
} from "../server/lib/refundApportionment";

// A booking + security deposit sharing one PaymentIntent/charge.
const bookingRow: ApportionmentPaymentRow = {
  id: "pay_booking",
  paymentType: "booking",
  amount: 10_000,
  refundAmount: 0,
};
const depositRow: ApportionmentPaymentRow = {
  id: "pay_deposit",
  paymentType: "security_deposit",
  amount: 3_000,
  refundAmount: 0,
};

function tag(paymentRowId: string, amount: number): RefundLike {
  return { amount, metadata: { paymentRowId } };
}

// ── Tagged split: each refund lands on its own row ──────────────────────────
{
  const result = apportionChargeRefunds(
    [tag("pay_deposit", 3_000), tag("pay_booking", 2_500)],
    [bookingRow, depositRow]
  );
  assert.equal(result.get("pay_booking"), 2_500);
  assert.equal(result.get("pay_deposit"), 3_000);
}

// ── Deposit-only refund (tagged) leaves the booking portion at 0 ────────────
{
  const result = apportionChargeRefunds([tag("pay_deposit", 3_000)], [bookingRow, depositRow]);
  assert.equal(result.get("pay_deposit"), 3_000);
  assert.equal(result.get("pay_booking"), 0);
}

// ── Legacy/untagged refund allocates deposit-first, remainder to booking ────
{
  // $40 refunded, untagged (dashboard/legacy): $30 fills the deposit, $10 booking.
  const result = apportionChargeRefunds([{ amount: 4_000, metadata: null }], [bookingRow, depositRow]);
  assert.equal(result.get("pay_deposit"), 3_000);
  assert.equal(result.get("pay_booking"), 1_000);
}

// ── Untagged refund ≤ deposit stays entirely on the deposit ─────────────────
{
  const result = apportionChargeRefunds([{ amount: 1_200 }], [bookingRow, depositRow]);
  assert.equal(result.get("pay_deposit"), 1_200);
  assert.equal(result.get("pay_booking"), 0);
}

// ── Fallback clamps: a refund larger than the whole charge cannot overflow ──
{
  const result = apportionChargeRefunds([{ amount: 999_999, metadata: null }], [bookingRow, depositRow]);
  assert.equal(result.get("pay_deposit"), 3_000, "deposit clamps to its amount");
  assert.equal(result.get("pay_booking"), 10_000, "booking clamps to its amount");
}

// ── Deposit already recorded its refund → untagged charge refund flows to
//    booking, not re-attributed to the deposit ("− deposit recorded" term). ─
{
  const depositRecorded: ApportionmentPaymentRow = { ...depositRow, refundAmount: 3_000 };
  // Charge shows a $130 cumulative untagged refund; deposit already owns $30.
  const result = apportionChargeRefunds(
    [{ amount: 13_000, metadata: null }],
    [bookingRow, depositRecorded]
  );
  assert.equal(result.get("pay_deposit"), 3_000, "deposit keeps its recorded refund");
  assert.equal(result.get("pay_booking"), 10_000, "remainder attributed to booking");
}

// ── Idempotent: re-running on the SAME full refund list yields the same map ──
{
  const refunds: RefundLike[] = [tag("pay_deposit", 3_000), tag("pay_booking", 4_000)];
  const first = apportionChargeRefunds(refunds, [bookingRow, depositRow]);
  const second = apportionChargeRefunds(refunds, [bookingRow, depositRow]);
  assert.deepEqual([...first.entries()].sort(), [...second.entries()].sort());
  assert.equal(second.get("pay_booking"), 4_000);
  assert.equal(second.get("pay_deposit"), 3_000);
}

// ── Per-row full-refund detection: booking portion reaches its ceiling ──────
{
  const result = apportionChargeRefunds([tag("pay_booking", 10_000)], [bookingRow, depositRow]);
  const bookingPortion = result.get("pay_booking") ?? 0;
  assert.equal(bookingPortion >= bookingRow.amount, true, "booking fully refunded");
  const depositPortion = result.get("pay_deposit") ?? 0;
  assert.equal(depositPortion >= depositRow.amount, false, "deposit not fully refunded");
}

// ── Mixed tagged + untagged on the same charge ──────────────────────────────
{
  // $30 tagged to the deposit + $2 untagged (should fall to booking, since the
  // deposit is already at its ceiling from the tagged refund).
  const result = apportionChargeRefunds(
    [tag("pay_deposit", 3_000), { amount: 200, metadata: null }],
    [bookingRow, depositRow]
  );
  assert.equal(result.get("pay_deposit"), 3_000);
  assert.equal(result.get("pay_booking"), 200);
}

// ── Single-row PI (e.g. a standalone travel_fee charge) ─────────────────────
{
  const travelRow: ApportionmentPaymentRow = {
    id: "pay_travel",
    paymentType: "travel_fee",
    amount: 1_500,
    refundAmount: 0,
  };
  const tagged = apportionChargeRefunds([tag("pay_travel", 1_500)], [travelRow]);
  assert.equal(tagged.get("pay_travel"), 1_500);
  const untagged = apportionChargeRefunds([{ amount: 900 }], [travelRow]);
  assert.equal(untagged.get("pay_travel"), 900);
}

// ── Zero / malformed refund amounts are ignored ─────────────────────────────
{
  const result = apportionChargeRefunds(
    [{ amount: 0 }, { amount: null }, { amount: undefined as any }, tag("pay_booking", 500)],
    [bookingRow, depositRow]
  );
  assert.equal(result.get("pay_booking"), 500);
  assert.equal(result.get("pay_deposit"), 0);
}

console.log("refund-apportionment tests passed");
