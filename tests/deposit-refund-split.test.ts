import assert from "node:assert/strict";

import {
  attemptDepositRefundWithFn,
  computeRemainingRefundableCents,
} from "../server/lib/routeUtils";

type RefundCall = { paymentIntentId: string; amount?: number; reason?: string; idempotencyKey?: string };

// ── Remaining-amount math ────────────────────────────────────────────────────

assert.equal(computeRemainingRefundableCents(5_000, 0), 5_000);
assert.equal(computeRemainingRefundableCents(5_000, 2_000), 3_000);
assert.equal(computeRemainingRefundableCents(5_000, 5_000), 0);
// Over-refunded (e.g. the whole PI was refunded by the old bug) clamps to 0 —
// never a negative refund request.
assert.equal(computeRemainingRefundableCents(5_000, 9_000), 0);
assert.equal(computeRemainingRefundableCents(5_000, null), 5_000);
assert.equal(computeRemainingRefundableCents(5_000, undefined), 5_000);
assert.equal(computeRemainingRefundableCents(null, 1_000), 0);

// ── The refund request is ALWAYS bounded by the deposit remaining ────────────
{
  const calls: RefundCall[] = [];
  const result = await attemptDepositRefundWithFn({
    paymentId: "dep-1",
    stripePaymentIntentId: "pi_shared",
    depositCents: 5_000,
    alreadyRefundedCents: 2_000,
    refundFn: async (call) => {
      calls.push(call);
      return {};
    },
  });
  assert.deepEqual(result, { action: "refunded", amountCents: 3_000 });
  assert.equal(calls.length, 1);
  // Explicit amount — an amount-less refund on the shared PI would also pull
  // back the vendor's booking payment (the C2 bug this test pins down).
  assert.equal(calls[0].amount, 3_000);
  assert.equal(calls[0].paymentIntentId, "pi_shared");
  // Amount-free idempotency key: a retry with a changed remaining fails loudly
  // at Stripe instead of double-refunding.
  assert.equal(calls[0].idempotencyKey, "auto-deposit-refund:dep-1");
}

// ── Full deposit, nothing refunded yet ⇒ full deposit amount ─────────────────
{
  const calls: RefundCall[] = [];
  const result = await attemptDepositRefundWithFn({
    paymentId: "dep-2",
    stripePaymentIntentId: "pi_shared",
    depositCents: 7_500,
    alreadyRefundedCents: null,
    refundFn: async (call) => {
      calls.push(call);
      return {};
    },
  });
  assert.deepEqual(result, { action: "refunded", amountCents: 7_500 });
  assert.equal(calls[0].amount, 7_500);
}

// ── Zero remaining ⇒ skipped, refundFn NEVER called ──────────────────────────
{
  let called = false;
  const result = await attemptDepositRefundWithFn({
    paymentId: "dep-3",
    stripePaymentIntentId: "pi_shared",
    depositCents: 5_000,
    alreadyRefundedCents: 5_000,
    refundFn: async () => {
      called = true;
      return {};
    },
  });
  assert.deepEqual(result, { action: "skipped_zero_remaining" });
  assert.equal(called, false);
}

// ── Missing PaymentIntent ⇒ skipped without a Stripe call ────────────────────
{
  let called = false;
  const result = await attemptDepositRefundWithFn({
    paymentId: "dep-4",
    stripePaymentIntentId: null,
    depositCents: 5_000,
    alreadyRefundedCents: 0,
    refundFn: async () => {
      called = true;
      return {};
    },
  });
  assert.deepEqual(result, { action: "skipped_no_payment_intent" });
  assert.equal(called, false);
}

// ── Stripe failure surfaces as failed (caller leaves the row for retry) ──────
{
  const boom = new Error("stripe down");
  const result = await attemptDepositRefundWithFn({
    paymentId: "dep-5",
    stripePaymentIntentId: "pi_shared",
    depositCents: 5_000,
    alreadyRefundedCents: 0,
    refundFn: async () => {
      throw boom;
    },
  });
  assert.equal(result.action, "failed");
  assert.ok(result.action === "failed" && result.error === boom);
}

console.log("deposit-refund-split: all assertions passed");
