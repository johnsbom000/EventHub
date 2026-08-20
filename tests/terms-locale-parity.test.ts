import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The Terms of Service are ONE contract in three languages. English is canonical;
 * es/pt are translations of the same text, for the same US-based users.
 *
 * This existed before as two contradictory copies: Terms.tsx hardcoded English
 * (Utah, 72-hour dispute window, 7 sections) while the locale files carried an
 * unused second version naming FLORIDA, a 48-hour window, and 14 sections. Users
 * were shown one and the repo contained the other.
 *
 * These assertions make that class of drift a test failure rather than a
 * discovery during a dispute.
 */

const LOCALES = ["en", "es", "pt"] as const;

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };
type Section = { id: string; label: string; heading: string; blocks: Block[] };
type Terms = {
  pageTitle: string;
  meta: string;
  contactEmail: string;
  notice: string;
  sections: Section[];
};

function loadTerms(locale: string): Terms {
  const file = path.join(process.cwd(), "client", "src", "locales", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")).terms as Terms;
}

const terms = Object.fromEntries(LOCALES.map((l) => [l, loadTerms(l)])) as Record<string, Terms>;

// ── Structural parity: same sections, same order, same block shapes ──────────
const shapeOf = (t: Terms) =>
  JSON.stringify(
    t.sections.map((s) => ({
      id: s.id,
      blocks: s.blocks.map((b) => (b.type === "ul" ? `ul:${b.items.length}` : "p")),
    }))
  );

for (const locale of LOCALES.slice(1)) {
  assert.equal(
    shapeOf(terms[locale]),
    shapeOf(terms.en),
    `${locale} Terms must mirror en exactly — same sections, order, and block counts`,
  );
}

// ── Every locale must have all fourteen sections ────────────────────────────
// The first seven are the original marketplace contract; the rest were added by
// the legal-docs hardening pass (PR #218). Order is load-bearing: the Terms page
// numbers sections by position, and the cross-reference check below bounds
// citations by this list's length.
const EXPECTED_SECTIONS = [
  "platform-agreement",
  "vendor-agreement",
  "listing-terms",
  "transaction-agreement",
  "messaging-terms",
  "post-booking",
  "disputes",
  "accounts-acceptable-use",
  "user-content",
  "subscriptions-billing",
  "termination",
  "disclaimers",
  "indemnification",
  "general",
];
for (const locale of LOCALES) {
  assert.deepEqual(
    terms[locale].sections.map((s) => s.id),
    EXPECTED_SECTIONS,
    `${locale} has the canonical fourteen sections in order`,
  );
}

/** All translatable text in one locale's Terms, flattened. */
function allText(t: Terms): string {
  const parts = [t.meta, t.notice, t.pageTitle];
  for (const s of t.sections) {
    parts.push(s.label, s.heading);
    for (const b of s.blocks) parts.push(b.type === "ul" ? b.items.join(" ") : b.text);
  }
  return parts.join(" ");
}

// ── The load-bearing facts must be IDENTICAL in every language ──────────────
// A number that differs between locales means users are bound by different terms.
const FACTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "72-hour windows", pattern: /72/g },
  { label: "Utah", pattern: /Utah/g },
  { label: "5% customer fee", pattern: /5%/g },
  { label: "8% vendor commission", pattern: /8%/g },
  { label: "$100 liability cap", pattern: /\$100/g },
];

for (const { label, pattern } of FACTS) {
  const counts = LOCALES.map((l) => (allText(terms[l]).match(pattern) ?? []).length);
  assert.ok(counts[0] > 0, `en must actually state: ${label}`);
  assert.ok(
    counts.every((c) => c === counts[0]),
    `${label} must appear the same number of times in every locale (got ${LOCALES.map((l, i) => `${l}=${counts[i]}`).join(", ")})`,
  );
}

// ── Facts that must NOT appear, in any language ─────────────────────────────
// Florida was the governing law in the old orphaned locale copy; 48 hours was
// its dispute window. Both contradicted the page users were actually shown.
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: "Florida (wrong governing law)", pattern: /Florida|Fl[oó]rida/i },
  { label: "48-hour window (wrong dispute window)", pattern: /\b48\b/ },
];

for (const locale of LOCALES) {
  const text = allText(terms[locale]);
  for (const { label, pattern } of FORBIDDEN) {
    assert.ok(!pattern.test(text), `${locale} Terms must not contain ${label}`);
  }
}

// ── The dispute window in Terms must match the code that enforces it ────────
// If DISPUTE_WINDOW_HOURS ever changes, the contract has to change with it.
const payoutEligibility = readFileSync(
  path.join(process.cwd(), "server", "payoutEligibility.ts"),
  "utf8",
);
const declared = /export const DISPUTE_WINDOW_HOURS\s*=\s*(\d+)/.exec(payoutEligibility);
assert.ok(declared, "DISPUTE_WINDOW_HOURS must be declared in server/payoutEligibility.ts");
const windowHours = declared![1];
for (const locale of LOCALES) {
  assert.ok(
    allText(terms[locale]).includes(windowHours),
    `${locale} Terms must state the ${windowHours}-hour dispute window that the code enforces`,
  );
}

// ── Contact address must be a real, monitored domain ────────────────────────
for (const locale of LOCALES) {
  const email = terms[locale].contactEmail;
  assert.equal(email, terms.en.contactEmail, `${locale} contact address matches en`);
  assert.ok(email.endsWith("@eventhubglobal.com"), `${locale} contact address is on the real domain`);
  assert.ok(terms[locale].meta.includes(email), `${locale} meta line shows the contact address`);
}

// ── Cross-references must point at sections that exist ──────────────────────
// The old text cited "Section 10" and "Section 19" on a page with 7 sections —
// exactly the drafting defect that gets an arbitration clause severed.
for (const locale of LOCALES) {
  const text = allText(terms[locale]);
  const refs = [...text.matchAll(/(?:Section|Secci[oó]n|Se[cç][aã]o)\s+(\d+)/gi)].map((m) =>
    Number(m[1]),
  );
  assert.ok(refs.length > 0, `${locale} has cross-references to check`);
  for (const n of refs) {
    assert.ok(
      n >= 1 && n <= EXPECTED_SECTIONS.length,
      `${locale} references Section ${n}, but the document has only ${EXPECTED_SECTIONS.length} sections`,
    );
  }
}

// ── The bold marker must be balanced, or Rich() renders stray asterisks ─────
for (const locale of LOCALES) {
  for (const s of terms[locale].sections) {
    for (const b of s.blocks) {
      const strings = b.type === "ul" ? b.items : [b.text];
      for (const str of strings) {
        assert.equal(
          (str.match(/\*\*/g) ?? []).length % 2,
          0,
          `${locale} / ${s.id}: unbalanced ** in "${str.slice(0, 60)}…"`,
        );
      }
    }
  }
}

console.log("terms-locale-parity.test.ts: all assertions passed");
