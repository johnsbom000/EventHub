import assert from "node:assert/strict";

import { resolvePaymentInitAction } from "../server/lib/routeUtils";

// ── F8: payment-init resume branch table ─────────────────────────────────────
// initializeBookingPayment decides — purely from an existing PaymentIntent's
// Stripe status — whether to reuse it, recreate it, or reject the init because
// it already completed. The whole point of the F8 fix is that NONE of these
// branches short-circuit the row-ensure block anymore: reuse and recreate both
// fall through so a missing security_deposit row is (re)created on resume. This
// test pins the mapping the calling code relies on.

// Already paid — caller must throw "already completed"; nothing left to charge.
assert.equal(resolvePaymentInitAction("succeeded"), "already_completed");

// Dead PIs — a canceled or absent status means make a fresh PaymentIntent.
assert.equal(resolvePaymentInitAction("canceled"), "recreate");
assert.equal(resolvePaymentInitAction(""), "recreate");
assert.equal(resolvePaymentInitAction(null), "recreate");
assert.equal(resolvePaymentInitAction(undefined), "recreate");

// Still-payable PIs — hand the same client secret back (idempotent resume).
for (const status of [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
  "processing",
]) {
  assert.equal(resolvePaymentInitAction(status), "reuse", `expected reuse for ${status}`);
}

// Case/whitespace robustness — Stripe statuses are lowercase, but the resolver
// normalizes so a stray "Succeeded"/" canceled " can never be misread as reuse
// (which would strand the resume path the old code hit).
assert.equal(resolvePaymentInitAction("  Succeeded "), "already_completed");
assert.equal(resolvePaymentInitAction(" CANCELED "), "recreate");

console.log("payment-init-side-effects.test.ts: all assertions passed");
