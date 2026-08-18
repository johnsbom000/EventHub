import assert from "node:assert/strict";

import { bookingConfirmedTemplate } from "../server/emails/bookingConfirmed";

/**
 * The vendor booking-confirmation email used to hardcode "EventHub takes no
 * commission. The only deduction is Stripe's standard payment-processing fee",
 * with no pricing-model or plan check. That was true only while VENDOR_FEE_RATE
 * was 0. Once it went to 8% the email became a per-transaction false statement
 * sent to most vendors, and the breakdown stopped summing — the vendor saw a
 * shortfall explicitly attributed to Stripe alone.
 *
 * These tests pin both halves: the arithmetic must sum, and the no-commission
 * claim may appear ONLY when the commission is genuinely zero.
 */

const base = {
  recipientName: "Ana",
  counterpartName: "Customer",
  eventDate: "Sat, Sep 12, 2026",
  listingTitle: "Bounce House",
  serverUrl: "https://example.test",
  role: "vendor" as const,
};

const NO_COMMISSION_CLAIM = "EventHub takes no commission";

function parseCents(s: string): number {
  return Math.round(Number(s.replace(/[$,]/g, "")) * 100);
}

// ── A commissioned vendor (Model A Free, or any Model B vendor) ──────────────
{
  // $500 booking: 8% commission = $40, Stripe fee $14.80, net $445.20.
  const html = bookingConfirmedTemplate({
    ...base,
    totalAmountCents: 52500, // what the customer paid, incl. the 5% customer fee
    platformFeeCents: 4000,
    stripeProcessingFeeCents: 1480,
    vendorNetPayoutCents: 44520,
  });

  assert.ok(
    !html.html.includes(NO_COMMISSION_CLAIM),
    "must NOT claim zero commission when a commission was charged (HTML)",
  );
  assert.ok(
    !html.text.includes(NO_COMMISSION_CLAIM),
    "must NOT claim zero commission when a commission was charged (text)",
  );
  assert.ok(html.html.includes("EventHub commission"), "commission row is rendered");
  assert.ok(html.text.includes("EventHub commission"), "commission line is in the plaintext");

  // The rows must sum: earnings − commission − Stripe = net.
  const earnings = parseCents(/Your booking earnings: \$([\d,.]+)/.exec(html.text)![1]);
  const commission = parseCents(/EventHub commission: - \$([\d,.]+)/.exec(html.text)![1]);
  const stripe = parseCents(/Stripe Processing Fee: - \$([\d,.]+)/.exec(html.text)![1]);
  const net = parseCents(/Your net payout: \$([\d,.]+)/.exec(html.text)![1]);
  assert.equal(
    earnings - commission - stripe,
    net,
    "breakdown must sum exactly — an unexplained gap is what this bug looked like",
  );
  assert.equal(commission, 4000, "commission row shows the real persisted fee");

  // The opening line is the vendor's earnings, NOT what the customer paid. The
  // customer's 5% service fee never reaches the vendor, so including it would
  // reintroduce a gap the deductions don't explain.
  assert.notEqual(earnings, 52500, "opening line must not be the customer's total");
  // $500 service price: net $445.20 + Stripe $14.80 + commission $40 = $500.
  assert.equal(earnings, 50000, "opening line is the vendor's own $500 service price");
}

// ── A Pro subscriber or grandfathered vendor: commission genuinely is zero ────
for (const platformFeeCents of [0, undefined]) {
  const out = bookingConfirmedTemplate({
    ...base,
    totalAmountCents: 52500,
    platformFeeCents,
    stripeProcessingFeeCents: 1480,
    vendorNetPayoutCents: 48520,
  });

  assert.ok(
    out.html.includes(NO_COMMISSION_CLAIM),
    `the no-commission claim is correct and kept when commission is ${String(platformFeeCents)}`,
  );
  assert.ok(
    !out.html.includes("EventHub commission</td>"),
    "no commission row when there is no commission",
  );

  const earnings = parseCents(/Your booking earnings: \$([\d,.]+)/.exec(out.text)![1]);
  const stripe = parseCents(/Stripe Processing Fee: - \$([\d,.]+)/.exec(out.text)![1]);
  const net = parseCents(/Your net payout: \$([\d,.]+)/.exec(out.text)![1]);
  assert.equal(earnings - stripe, net, "zero-commission breakdown still sums");
}

// ── Customers never see any of the payout machinery ──────────────────────────
{
  const out = bookingConfirmedTemplate({
    ...base,
    role: "customer",
    totalAmountCents: 52500,
    platformFeeCents: 4000,
  });
  assert.ok(!out.html.includes("EventHub commission"), "customers see no commission row");
  assert.ok(!out.html.includes(NO_COMMISSION_CLAIM), "customers see no payout note");
  assert.ok(!out.html.includes("net payout"), "customers see no payout line");
}

// ── No breakdown at all when Stripe fee is absent (legacy bookings) ──────────
{
  const out = bookingConfirmedTemplate({
    ...base,
    totalAmountCents: 52500,
    platformFeeCents: 4000,
  });
  assert.ok(!out.html.includes(NO_COMMISSION_CLAIM), "legacy path makes no fee claim either");
  assert.ok(!out.html.includes("EventHub commission"), "legacy path renders no breakdown");
}

console.log("booking-confirmed-payout-email.test.ts: all assertions passed");
