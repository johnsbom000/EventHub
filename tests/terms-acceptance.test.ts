import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { TERMS_VERSION, hasAcceptedCurrentTerms } from "../shared/termsVersion";

/**
 * Terms acceptance must be RECORDED, not just checkboxed.
 *
 * Before this, `agreedToTerms` was local React state that only enabled a button.
 * It never reached the server and no column stored it, so nothing showed that
 * any user had agreed to anything — which undermines the arbitration clause, the
 * class waiver, the $100 cap, and any fee change.
 */

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");

// ── The predicate must fail closed ──────────────────────────────────────────
// "No record" must never read as "accepted". Getting this backwards would treat
// every pre-existing account as having agreed to terms it never saw.
assert.equal(hasAcceptedCurrentTerms(TERMS_VERSION), true, "current version counts as accepted");
assert.equal(hasAcceptedCurrentTerms(null), false, "null is NOT acceptance");
assert.equal(hasAcceptedCurrentTerms(undefined), false, "undefined is NOT acceptance");
assert.equal(hasAcceptedCurrentTerms(""), false, "empty string is NOT acceptance");
assert.equal(hasAcceptedCurrentTerms("2020-01-01"), false, "a stale version is NOT current acceptance");

// ── Version format: an ISO date, so it sorts and reads unambiguously ────────
assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/, "TERMS_VERSION is an ISO date");

// ── Schema carries the columns on both actors ───────────────────────────────
const schema = read("shared", "schema.ts");
for (const col of ["terms_version_accepted", "terms_accepted_at"]) {
  assert.ok(
    (schema.match(new RegExp(col, "g")) ?? []).length >= 2,
    `${col} is declared on both vendor_accounts and users`,
  );
}

// ── Migration exists, and deliberately does NOT backfill ────────────────────
const migration = read("migrations", "0165_terms_acceptance.ts");
assert.ok(migration.includes("terms_version_accepted"), "migration adds the version column");
assert.ok(
  !/UPDATE\s+(vendor_accounts|users)\s+SET\s+terms_version_accepted/i.test(migration),
  "migration must NOT backfill acceptance — that would manufacture evidence of an event we cannot attest to",
);

// ── The server stamps its own version; it never trusts the client's ─────────
// A caller must not be able to claim acceptance of an arbitrary version string.
const vendorRouter = read("server", "routers", "vendor.ts");
assert.ok(
  vendorRouter.includes("termsVersionAccepted: TERMS_VERSION"),
  "vendor onboarding stamps the server's TERMS_VERSION",
);
assert.ok(
  !/termsVersionAccepted:\s*onboardingData\./.test(vendorRouter),
  "vendor onboarding must never take the version from the request body",
);
assert.ok(
  /acceptedTerms:\s*z\.boolean\(\)/.test(vendorRouter),
  "the request carries only a boolean assertion, not a version",
);

const bookingsRouter = read("server", "routers", "bookings.ts");
assert.ok(
  bookingsRouter.includes("termsVersionAccepted: TERMS_VERSION"),
  "booking creation stamps the customer's acceptance",
);
assert.ok(
  !/termsVersionAccepted:\s*(data|req)\./.test(bookingsRouter),
  "booking creation must never take the version from the request body",
);

// ── The client asserts acceptance on the onboarding request ─────────────────
const onboarding = read("client", "src", "pages", "VendorOnboarding.tsx");
assert.ok(onboarding.includes("acceptedTerms: true"), "onboarding sends the acceptance assertion");

// ── The displayed version is the stamped version ────────────────────────────
// If the page showed a different string than the column records, "which Terms
// did they agree to" would have two answers.
const termsPage = read("client", "src", "pages", "Terms.tsx");
assert.ok(
  termsPage.includes("TERMS_VERSION") && termsPage.includes("terms.effective"),
  "the Terms page renders the same TERMS_VERSION that gets stamped",
);
for (const locale of ["en", "es", "pt"]) {
  const t = JSON.parse(read("client", "src", "locales", `${locale}.json`)).terms;
  assert.ok(t.effective, `${locale} has terms.effective`);
  assert.ok(
    String(t.effective).includes("{{version}}"),
    `${locale} terms.effective interpolates the version rather than hardcoding a date`,
  );
}

console.log("terms-acceptance.test.ts: all assertions passed");
