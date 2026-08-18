import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy guard for the commission (Modal B) landing arm.
 *
 * Two things this protects against, neither of which anyone will catch by eye
 * on every deploy:
 *
 *  1. FALSE FEE PROMISES. Free-tier subscription vendors and ALL commission
 *     vendors pay an 8% commission on every booking, and every booking carries
 *     a 5% customer service fee. Any string promising "0%", "no fees", or
 *     "keep 100%" to those vendors contradicts the Terms of Service, which is a
 *     disclosure problem rather than a copy nit.
 *  2. SUBSCRIPTION COPY LEAKING INTO THE COMMISSION ARM. Commission vendors
 *     have no Pro tier, no subscription, and nothing to upgrade to. A "Try Pro"
 *     or "$29/mo" string rendered to them is both false and invalidates the
 *     pricing experiment, because the two arms are then no longer testing the
 *     thing they claim to test.
 *
 * WHAT IS IN SCOPE, and why it is scoped this narrowly: a guard that cries wolf
 * gets disabled, so this deliberately does not scan every locale string.
 *
 *  - Every `…Comm` namespace. These hold the commission arm's overrides, and
 *    every string in them is rendered ONLY to a commission visitor.
 *  - The shared landing chrome that renders verbatim on both arms.
 *
 * Deliberately OUT of scope: the `demo*` namespaces and the landing demo
 * components. They are fake listing/booking data (e.g. "$650" subtotals,
 * "$120 · Qty: 5" add-ons, ScatteredBookings.tsx's "$390" payout, "Cancel
 * anytime" as a vendor's own listing cancellation policy, "Optional upgrades
 * customers can add." for listing add-ons). All of it is meaning-correct and
 * renders identically in both arms, so matching on it would be pure noise.
 *
 * Also out of scope: the base `landing` / `landingFreeA…E` namespaces. Those do
 * contain real Pro copy ("$29/mo", "No vendor fees on Pro."), which is accurate
 * and is gated to the subscription arm by `model === "subscription"` branches in
 * the JSX rather than by the i18n namespace. Scanning them would mean an
 * ~15-key allowlist and would flag the correct copy as a violation.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(HERE, "..", "client", "src", "locales");

const LOCALES = ["en", "es", "pt"] as const;

/**
 * One `…Comm` namespace per landing style. Asserting the exact names (not just
 * a count) is the guard-the-guard: if a namespace is renamed the suffix filter
 * would silently stop matching it, and if one is DELETED the commission page
 * falls back to the subscription namespace — which is the exact leak this test
 * exists to catch, and which a value-only scan cannot see.
 */
const EXPECTED_COMM_NAMESPACES = [
  "landingComm",
  "landingFreeAComm",
  "landingFreeBComm",
  "landingFreeCComm",
  "landingFreeDComm",
  "landingFreeEComm",
] as const;

/**
 * Namespaces rendered verbatim to BOTH arms (no `…Comm` sibling), so anything
 * tier-flavoured in them reaches commission visitors unmediated.
 */
const SHARED_NAMESPACES = [
  "landingShared",
  "howItWorks",
  "testimonials",
  "customerExp",
] as const;

/**
 * Explicit allowlist, `locale:dotted.path` — reviewed and deliberately exempt.
 * Keep this list tiny; an entry here is a claim that the string is true for a
 * commission vendor, not a way to silence the guard.
 */
const ALLOWLIST = new Set<string>([
  // "sem taxas ocultas" = "no HIDDEN fees". Still true: every fee is disclosed
  // before checkout. Only the Portuguese wording collides with /sem taxas/.
  "pt:customerExp.transparency.body",
]);

/** Matched case-insensitively against every in-scope string. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bpro\b/i, why: "the commission arm has no Pro tier" },
  { pattern: /upgrade/i, why: "the commission arm has nothing to upgrade to" },
  { pattern: /\$\s*\d/, why: "the commission arm has no subscription price" },
  { pattern: /\b0\s*%/, why: "commission vendors pay 8%, never 0%" },
  { pattern: /no fees/i, why: "commission vendors pay 8% + a 5% customer fee" },
  { pattern: /keep 100/i, why: "commission vendors do not keep 100%" },
  { pattern: /100\s*%/, why: "commission vendors do not keep 100%" },
  { pattern: /free to start/i, why: "implies a paid tier the commission arm lacks" },
  { pattern: /sin tarifas/i, why: "es: 'no fees' — commission vendors pay 8%" },
  { pattern: /sem taxas/i, why: "pt: 'no fees' — commission vendors pay 8%" },
  { pattern: /sin comisiones/i, why: "es: 'no commission' — they pay 8%" },
  { pattern: /sem comiss/i, why: "pt: 'no commission' — they pay 8%" },
];

function collectStrings(node: unknown, prefix: string, out: Array<[string, string]>): void {
  if (typeof node === "string") {
    out.push([prefix, node]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      collectStrings(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
}

function loadLocale(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8"));
}

// Guard the guard, part 1: the pattern list must actually fire. A typo'd regex
// (or an accidentally-emptied FORBIDDEN array) would make every assertion below
// vacuously pass while checking nothing.
{
  const bait = [
    "Try Pro for $29/mo",
    "Upgrade anytime",
    "0% commission",
    "No fees, ever",
    "Keep 100% of what you book",
    "Free to start",
    "Sin tarifas de proveedor",
    "Sem taxas de fornecedor",
    "Sin comisiones nunca",
    "Sem comissões nunca",
  ];
  for (const sample of bait) {
    assert.ok(
      FORBIDDEN.some(({ pattern }) => pattern.test(sample)),
      `FORBIDDEN failed to match a known-bad sample: ${JSON.stringify(sample)}`,
    );
  }
  const safe = [
    "Free to join. We only make money when you do.",
    "No monthly fee. No subscription. Ever.",
    "Create your free account",
  ];
  for (const sample of safe) {
    const hit = FORBIDDEN.find(({ pattern }) => pattern.test(sample));
    assert.equal(
      hit,
      undefined,
      `FORBIDDEN is over-broad: ${String(hit?.pattern)} matched safe copy ${JSON.stringify(sample)}`,
    );
  }
}

let checkedNamespaces = 0;
let checkedStrings = 0;

for (const locale of LOCALES) {
  const raw = loadLocale(locale);
  const commNamespaces = Object.keys(raw).filter((ns) => ns.endsWith("Comm"));

  // Guard the guard, part 2: the exact set, per locale. Catches a rename (which
  // would drop a namespace out of the suffix filter) and a deletion (which would
  // make the commission page fall back to the subscription namespace).
  assert.deepEqual(
    commNamespaces.sort(),
    [...EXPECTED_COMM_NAMESPACES].sort(),
    `${locale}.json has an unexpected set of …Comm namespaces — a renamed or deleted one means the commission arm silently falls back to subscription copy`,
  );

  for (const namespace of [...commNamespaces, ...SHARED_NAMESPACES]) {
    const block = raw[namespace];
    assert.ok(
      block && typeof block === "object",
      `${locale}.json is missing the ${namespace} namespace`,
    );

    const strings: Array<[string, string]> = [];
    collectStrings(block, namespace, strings);
    assert.ok(
      strings.length > 0,
      `${locale}.json ${namespace} is empty — an emptied namespace falls back to subscription copy`,
    );

    checkedNamespaces += 1;

    for (const [dottedPath, text] of strings) {
      if (ALLOWLIST.has(`${locale}:${dottedPath}`)) continue;
      checkedStrings += 1;

      for (const { pattern, why } of FORBIDDEN) {
        assert.equal(
          pattern.test(text),
          false,
          `${locale}.json ${dottedPath} matches ${String(pattern)} (${why}): ${JSON.stringify(text)}`,
        );
      }
    }
  }
}

// Guard the guard, part 3: nothing above can pass by checking an empty set.
{
  const expected = (EXPECTED_COMM_NAMESPACES.length + SHARED_NAMESPACES.length) * LOCALES.length;
  assert.equal(
    checkedNamespaces,
    expected,
    `expected to scan ${expected} namespaces (${EXPECTED_COMM_NAMESPACES.length} …Comm + ${SHARED_NAMESPACES.length} shared, across ${LOCALES.length} locales), scanned ${checkedNamespaces}`,
  );
  assert.ok(
    checkedStrings >= 100,
    `expected to scan at least 100 strings, scanned ${checkedStrings} — the locale files may have been gutted`,
  );
}

console.log("landing-commission-copy: all assertions passed");
