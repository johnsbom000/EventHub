import assert from "node:assert/strict";

import {
  attemptBookingRefundsWithFn,
  isStripeChargeAlreadyRefundedError,
  type BookingRefundAttemptRow,
} from "../server/lib/routeUtils";

const BOOKING_ID = "booking-1";

function row(overrides: Partial<BookingRefundAttemptRow> = {}): BookingRefundAttemptRow {
  return {
    id: "pay-1",
    amount: 10_000,
    refundAmount: null,
    stripePaymentIntentId: "pi_1",
    ...overrides,
  };
}

type RefundCall = { paymentIntentId: string; amount?: number; reason?: string; idempotencyKey?: string };

function recordingRefundFn(calls: RefundCall[], impl?: (call: RefundCall) => Promise<unknown>) {
  return async (call: RefundCall) => {
    calls.push(call);
    return impl ? impl(call) : {};
  };
}

// ── Refund succeeds ⇒ marked, full amount, stable idempotency key ────────────
{
  const calls: RefundCall[] = [];
  const result = await attemptBookingRefundsWithFn({
    bookingId: BOOKING_ID,
    rows: [row()],
    idempotencyPrefix: "vendor-no-response",
    reason: "duplicate",
    refundFn: recordingRefundFn(calls),
  });
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.totalRefundedCents, 10_000);
  assert.deepEqual(result.refundedRows, [{ id: "pay-1", refundedCents: 10_000, alreadyRefunded: false }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].amount, 10_000);
  assert.equal(calls[0].idempotencyKey, "vendor-no-response:booking-1:pay-1");
}

// ── Partial prior refund ⇒ only the remainder is refunded ────────────────────
{
  const calls: RefundCall[] = [];
  const result = await attemptBookingRefundsWithFn({
    bookingId: BOOKING_ID,
    rows: [row({ refundAmount: 4_000 })],
    idempotencyPrefix: "vendor-no-response",
    refundFn: recordingRefundFn(calls),
  });
  assert.ok(result.ok);
  assert.equal(result.totalRefundedCents, 6_000);
  assert.equal(calls[0].amount, 6_000);
}

// ── Refund throws ⇒ NOT ok: booking must stay pending, nothing marked ────────
{
  const calls: RefundCall[] = [];
  const boom = new Error("stripe unavailable");
  const result = await attemptBookingRefundsWithFn({
    bookingId: BOOKING_ID,
    rows: [row()],
    idempotencyPrefix: "vendor-no-response",
    refundFn: recordingRefundFn(calls, async () => {
      throw boom;
    }),
  });
  assert.equal(result.ok, false);
  assert.ok(!result.ok);
  assert.equal(result.failedPaymentId, "pay-1");
  assert.equal(result.error, boom);
}

// ── charge_already_refunded ⇒ success (crash recovery: refund landed) ────────
{
  const err = Object.assign(new Error("Charge ch_1 has already been refunded."), {
    code: "charge_already_refunded",
  });
  const result = await attemptBookingRefundsWithFn({
    bookingId: BOOKING_ID,
    rows: [row()],
    idempotencyPrefix: "vendor-no-response",
    refundFn: async () => {
      throw err;
    },
  });
  assert.ok(result.ok);
  assert.equal(result.totalRefundedCents, 10_000);
  assert.deepEqual(result.refundedRows, [{ id: "pay-1", refundedCents: 10_000, alreadyRefunded: true }]);
}

// Stripe SDK sometimes nests the code under `raw`.
{
  const err = Object.assign(new Error("already refunded"), {
    raw: { code: "charge_already_refunded" },
  });
  assert.equal(isStripeChargeAlreadyRefundedError(err), true);
  assert.equal(isStripeChargeAlreadyRefundedError(new Error("other")), false);
  assert.equal(isStripeChargeAlreadyRefundedError(null), false);
  assert.equal(isStripeChargeAlreadyRefundedError({ code: "card_declined" }), false);
}

// ── First failure stops the batch: later rows are not attempted ─────────────
{
  const calls: RefundCall[] = [];
  const result = await attemptBookingRefundsWithFn({
    bookingId: BOOKING_ID,
    rows: [
      row({ id: "pay-1", stripePaymentIntentId: "pi_1" }),
      row({ id: "pay-2", stripePaymentIntentId: "pi_2" }),
    ],
    idempotencyPrefix: "vendor-no-response",
    refundFn: recordingRefundFn(calls, async (call) => {
      if (call.paymentIntentId === "pi_1") throw new Error("network");
      return {};
    }),
  });
  assert.ok(!result.ok);
  assert.equal(result.failedPaymentId, "pay-1");
  assert.equal(calls.length, 1);
}

// ── Nothing refundable ⇒ ok with zero refunds, refundFn never called ─────────
{
  const calls: RefundCall[] = [];
  const result = await attemptBookingRefundsWithFn({
    bookingId: BOOKING_ID,
    rows: [
      row({ id: "pay-1", refundAmount: 10_000 }), // fully refunded already
      row({ id: "pay-2", stripePaymentIntentId: null }), // no PI to refund against
    ],
    idempotencyPrefix: "vendor-no-response",
    refundFn: recordingRefundFn(calls),
  });
  assert.ok(result.ok);
  assert.equal(result.totalRefundedCents, 0);
  assert.equal(calls.length, 0);
  assert.equal(result.refundedRows.length, 2);
}

// ── Multiple refundable rows all succeed ⇒ summed total ─────────────────────
{
  const calls: RefundCall[] = [];
  const result = await attemptBookingRefundsWithFn({
    bookingId: BOOKING_ID,
    rows: [
      row({ id: "pay-1", amount: 10_000, stripePaymentIntentId: "pi_1" }),
      row({ id: "pay-2", amount: 2_500, stripePaymentIntentId: "pi_2" }),
    ],
    idempotencyPrefix: "vendor-no-response",
    refundFn: recordingRefundFn(calls),
  });
  assert.ok(result.ok);
  assert.equal(result.totalRefundedCents, 12_500);
  assert.equal(calls.length, 2);
}

console.log("vendor-no-response-refund: all assertions passed");
