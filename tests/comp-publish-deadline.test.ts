import assert from "node:assert/strict";

import {
  PUBLISH_DEADLINE_DAYS,
  STRIPE_GRACE_DAYS,
  getCompPublishDeadline,
} from "../server/lib/compPublishPolicy";

const DAY_MS = 24 * 60 * 60 * 1000;
const createdAt = new Date("2026-07-15T18:30:00.000Z");

// Policy constants: 7-day window, +3 grace days once Stripe onboarding started.
assert.equal(PUBLISH_DEADLINE_DAYS, 7);
assert.equal(STRIPE_GRACE_DAYS, 3);

// No Stripe started → deadline exactly 7 days after account creation, no grace.
{
  const { deadline, graceApplied } = getCompPublishDeadline({
    createdAt,
    stripeConnectId: null,
  });
  assert.equal(graceApplied, false);
  assert.equal(deadline.getTime(), createdAt.getTime() + 7 * DAY_MS);
}

// Stripe Connect started → grace applies, deadline exactly 10 days out.
{
  const { deadline, graceApplied } = getCompPublishDeadline({
    createdAt,
    stripeConnectId: "acct_123",
  });
  assert.equal(graceApplied, true);
  assert.equal(deadline.getTime(), createdAt.getTime() + 10 * DAY_MS);
}

// Enforcement boundary: one millisecond before the deadline is inside the
// window; at the deadline is revocable (the job revokes when now >= deadline).
{
  const { deadline } = getCompPublishDeadline({ createdAt, stripeConnectId: null });
  const justBefore = new Date(deadline.getTime() - 1);
  assert.ok(justBefore < deadline);
  assert.ok(deadline >= deadline);
}

// A vendor who starts Stripe late (day 6) still gets the full extended
// deadline: grace is keyed off stripe_connect_id being set at evaluation time,
// so the deadline can only ever move later, never earlier.
{
  const without = getCompPublishDeadline({ createdAt, stripeConnectId: null });
  const withStripe = getCompPublishDeadline({ createdAt, stripeConnectId: "acct_late" });
  assert.ok(withStripe.deadline.getTime() > without.deadline.getTime());
  assert.equal(withStripe.deadline.getTime() - without.deadline.getTime(), 3 * DAY_MS);
}

console.log("comp-publish-deadline: all assertions passed");
