import assert from "node:assert/strict";

import { deriveBookingPaymentStatusFromScheduleStatuses } from "../server/lib/routeUtils";

type Entry = { status: unknown; paymentType?: unknown };

function derive(entries: Entry[]) {
  return deriveBookingPaymentStatusFromScheduleStatuses(entries);
}

const booking = (status: string): Entry => ({ status, paymentType: "booking" });
const travel = (status: string): Entry => ({ status, paymentType: "travel_fee" });

// ── Baseline matrix (booking rows only) ──────────────────────────────────────

assert.equal(derive([]), "pending");
assert.equal(derive([booking("pending")]), "pending");
assert.equal(derive([booking("succeeded")]), "succeeded");
assert.equal(derive([booking("failed")]), "failed");
assert.equal(derive([booking("refunded")]), "refunded");
assert.equal(derive([booking("partially_refunded")]), "partially_refunded");
assert.equal(derive([booking("disputed")]), "disputed");
assert.equal(derive([booking("requires_action")]), "requires_action");

// Legacy status aliases still canonicalize.
assert.equal(derive([booking("paid")]), "succeeded");
assert.equal(derive([booking("partial")]), "partially_refunded");

// Mixed booking rows.
assert.equal(derive([booking("succeeded"), booking("refunded")]), "partially_refunded");
assert.equal(derive([booking("refunded"), booking("refunded")]), "refunded");
assert.equal(derive([booking("succeeded"), booking("disputed")]), "disputed");

// Entries without a paymentType participate fully (backward compatibility for
// callers that only have statuses).
assert.equal(derive([{ status: "succeeded" }, { status: "failed" }]), "failed");
assert.equal(derive([{ status: "succeeded" }]), "succeeded");

// ── C3: travel-fee rows must not drag down a paid booking ────────────────────

// THE bug: a declined travel-fee attempt used to flip the whole booking to
// "failed", which cancelled a paid, confirmed booking without a refund.
assert.equal(derive([booking("succeeded"), travel("failed")]), "succeeded");

// A travel fee that was never paid (pending / requires_action) is ignored too.
assert.equal(derive([booking("succeeded"), travel("pending")]), "succeeded");
assert.equal(derive([booking("succeeded"), travel("requires_action")]), "succeeded");

// A failed travel fee alone (no booking payment yet) contributes nothing.
assert.equal(derive([travel("failed")]), "pending");
assert.equal(derive([travel("pending")]), "pending");

// Travel-fee rows DO participate once they hold real money state.
assert.equal(derive([booking("succeeded"), travel("succeeded")]), "succeeded");
assert.equal(derive([booking("succeeded"), travel("refunded")]), "partially_refunded");
assert.equal(derive([booking("refunded"), travel("refunded")]), "refunded");
assert.equal(derive([booking("succeeded"), travel("disputed")]), "disputed");
assert.equal(derive([booking("succeeded"), travel("partially_refunded")]), "partially_refunded");

// Canonicalization applies to travel rows as well ('paid' → succeeded → participates).
assert.equal(derive([booking("succeeded"), travel("paid")]), "succeeded");

// Failed booking payment still fails the booking even when a travel fee succeeded.
assert.equal(derive([booking("failed"), travel("succeeded")]), "failed");

console.log("booking-payment-status-derivation: all assertions passed");
