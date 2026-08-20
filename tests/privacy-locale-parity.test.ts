import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The Privacy Policy is ONE disclosure in three languages. English is canonical;
 * es/pt are translations of the same text, for the same US-based users.
 *
 * Privacy.tsx used to hardcode English with zero t() calls, so es/pt users were
 * shown English privacy disclosures — a statutory problem, not a polish problem
 * (CCPA/CPRA rights are described on this page, and the product ships a pt
 * locale). These assertions make the drift that would recreate that situation a
 * test failure rather than a discovery during a regulatory request.
 */

const LOCALES = ["en", "es", "pt"] as const;

type Block = { type: "p"; text: string } | { type: "ul"; items: string[] };
type Section = { id: string; label: string; heading: string; blocks: Block[] };
type Privacy = {
  pageTitle: string;
  meta: string;
  contactEmail: string;
  intro: string[];
  sections: Section[];
};

function load(locale: string) {
  const file = path.join(process.cwd(), "client", "src", "locales", `${locale}.json`);
  const json = JSON.parse(readFileSync(file, "utf8"));
  return { privacy: json.privacy as Privacy, termsContactEmail: json.terms.contactEmail as string };
}

const files = Object.fromEntries(LOCALES.map((l) => [l, load(l)])) as Record<
  string,
  ReturnType<typeof load>
>;
const privacy = Object.fromEntries(LOCALES.map((l) => [l, files[l].privacy])) as Record<
  string,
  Privacy
>;

// ── Structural parity: same sections, same order, same block shapes ──────────
const shapeOf = (p: Privacy) =>
  JSON.stringify({
    intro: p.intro.length,
    sections: p.sections.map((s) => ({
      id: s.id,
      blocks: s.blocks.map((b) => (b.type === "ul" ? `ul:${b.items.length}` : "p")),
    })),
  });

for (const locale of LOCALES.slice(1)) {
  assert.equal(
    shapeOf(privacy[locale]),
    shapeOf(privacy.en),
    `${locale} Privacy Policy must mirror en exactly — same sections, order, and block counts`,
  );
}

// ── Every locale must have all eighteen sections, in order ──────────────────
const EXPECTED_SECTIONS = [
  "information-we-collect",
  "how-we-use",
  "payment-processing",
  "authentication",
  "maps-location",
  "messaging",
  "google-calendar",
  "ai-features",
  "analytics-cookies",
  "how-we-share",
  "data-retention",
  "security",
  "your-rights",
  "california",
  "brazil-lgpd",
  "children",
  "changes",
  "contact",
];
for (const locale of LOCALES) {
  assert.deepEqual(
    privacy[locale].sections.map((s) => s.id),
    EXPECTED_SECTIONS,
    `${locale} has the canonical eighteen sections in order`,
  );
  // Non-empty label/heading on every section, or the TOC renders blanks.
  for (const s of privacy[locale].sections) {
    assert.ok(s.label?.trim(), `${locale} / ${s.id}: missing TOC label`);
    assert.ok(s.heading?.trim(), `${locale} / ${s.id}: missing heading`);
    assert.ok(s.blocks.length > 0, `${locale} / ${s.id}: has no blocks`);
  }
}

/** All translatable text in one locale's Privacy Policy, flattened. */
function allText(p: Privacy): string {
  const parts = [p.pageTitle, p.meta, ...p.intro];
  for (const s of p.sections) {
    parts.push(s.label, s.heading);
    for (const b of s.blocks) parts.push(b.type === "ul" ? b.items.join(" ") : b.text);
  }
  return parts.join(" ");
}

// ── The load-bearing facts must be IDENTICAL in every language ──────────────
// A number that differs between locales means users are told different things
// about how long we keep their data or how fast we answer a rights request.
const FACTS: Array<{ label: string; pattern: RegExp }> = [
  { label: "30-day deletion / response window", pattern: /\b30\b/g },
  { label: "45-day California response window", pattern: /\b45\b/g },
  { label: "7-year financial retention", pattern: /\b7\b/g },
  { label: "under-13 / COPPA floor", pattern: /\b13\b/g },
  { label: "18+ platform age", pattern: /\b18\b/g },
  { label: "AES-256-GCM token encryption", pattern: /AES-256-GCM/g },
  { label: "PCI-DSS Level 1", pattern: /PCI-DSS/g },
  { label: "CCPA", pattern: /CCPA/g },
  { label: "CPRA", pattern: /CPRA/g },
  // PostHog receives personal data (pseudonymous IDs, product events, UTM
  // parameters) and assigns pricing-experiment variants. It must be disclosed
  // as a sub-processor in every locale, exactly like Stripe/Auth0/Mapbox/Stream.
  { label: "PostHog sub-processor disclosure", pattern: /PostHog/g },
];

for (const { label, pattern } of FACTS) {
  const counts = LOCALES.map((l) => (allText(privacy[l]).match(pattern) ?? []).length);
  assert.ok(counts[0] > 0, `en must actually state: ${label}`);
  assert.ok(
    counts.every((c) => c === counts[0]),
    `${label} must appear the same number of times in every locale (got ${LOCALES.map((l, i) => `${l}=${counts[i]}`).join(", ")})`,
  );
}

// ── Governing law must match the Terms: State of Utah, everywhere ───────────
for (const locale of LOCALES) {
  assert.ok(
    /Utah/.test(privacy[locale].meta),
    `${locale} Privacy Policy states Utah as the governing law`,
  );
  assert.ok(
    !/Florida|Fl[oó]rida/i.test(allText(privacy[locale])),
    `${locale} Privacy Policy must not name Florida — the Terms say Utah`,
  );
}

// ── Contact address: one address, matching the Terms, on the real domain ────
// The pre-i18n page also advertised security@eventhub.com — a second address on
// a domain EventHub does not operate. Every address here must be the one the
// Terms publish.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
for (const locale of LOCALES) {
  const email = privacy[locale].contactEmail;
  assert.equal(email, privacy.en.contactEmail, `${locale} contact address matches en`);
  assert.equal(
    email,
    files[locale].termsContactEmail,
    `${locale} Privacy contact address matches the Terms contact address`,
  );
  assert.ok(email.endsWith("@eventhubglobal.com"), `${locale} contact address is on the real domain`);
  assert.ok(privacy[locale].meta.includes(email), `${locale} meta line shows the contact address`);
  for (const found of allText(privacy[locale]).match(EMAIL) ?? []) {
    assert.equal(found, email, `${locale} Privacy Policy publishes only ${email} (found ${found})`);
  }
}

// ── Outbound links must be the same set in every language ───────────────────
// A missing sub-processor policy link in one locale is a missing disclosure.
const URLS = /https?:\/\/[^\s)]+/g;
const urlsOf = (p: Privacy) => [...new Set(allText(p).match(URLS) ?? [])].sort();
for (const locale of LOCALES.slice(1)) {
  assert.deepEqual(
    urlsOf(privacy[locale]),
    urlsOf(privacy.en),
    `${locale} links to the same sub-processor policies as en`,
  );
}
assert.ok(urlsOf(privacy.en).length >= 5, "en links to the sub-processor privacy policies");

// ── Cross-references must point at sections that exist ──────────────────────
for (const locale of LOCALES) {
  const text = allText(privacy[locale]);
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
  const strings = [
    ...privacy[locale].intro,
    ...privacy[locale].sections.flatMap((s) =>
      s.blocks.flatMap((b) => (b.type === "ul" ? b.items : [b.text])),
    ),
  ];
  for (const str of strings) {
    assert.equal(
      (str.match(/\*\*/g) ?? []).length % 2,
      0,
      `${locale}: unbalanced ** in "${str.slice(0, 60)}…"`,
    );
  }
}

// ── The page must render from locale keys, not hardcoded English ────────────
const page = readFileSync(path.join(process.cwd(), "client", "src", "pages", "Privacy.tsx"), "utf8");
assert.ok(page.includes("useTranslation"), "Privacy.tsx must read its copy from i18n");
assert.ok(
  page.includes('t("privacy.sections"'),
  "Privacy.tsx must render the data-driven sections from the privacy namespace",
);
assert.ok(
  !page.includes("dangerouslySetInnerHTML="),
  "Privacy.tsx must not inject translated copy as HTML",
);

console.log("privacy-locale-parity.test.ts: all assertions passed");

// ── Section headings must be numbered sequentially from 1 ───────────────────
// Inserting a section renumbers everything after it. If a heading number is
// skipped or duplicated, an internal "see Section N" reference silently points
// at the wrong clause — the same defect the Terms cross-reference check exists
// to catch.
for (const locale of LOCALES) {
  const nums = privacy[locale].sections.map((s) => {
    const m = /^(\d+)\./.exec(s.heading);
    assert.ok(m, `${locale}: heading is not numbered: "${s.heading}"`);
    return Number(m![1]);
  });
  assert.deepEqual(
    nums,
    nums.map((_, i) => i + 1),
    `${locale} headings must run 1..${nums.length} with no gaps or repeats`,
  );
}

// ── Every sub-processor named anywhere must also appear in the sharing clause ─
// Describing a processor in its own section but omitting it from "How We Share"
// is how PostHog went undisclosed while already receiving personal data.
for (const locale of LOCALES) {
  const share = privacy[locale].sections.find((s) => s.id === "how-we-share");
  assert.ok(share, `${locale} has a how-we-share section`);
  const shareText = share!.blocks
    .map((b) => (b.type === "ul" ? b.items.join(" ") : b.text))
    .join(" ");
  for (const proc of ["Stripe", "Auth0", "Mapbox", "Stream", "PostHog"]) {
    assert.ok(
      shareText.includes(proc),
      `${locale}: ${proc} is named in the policy but missing from the sharing clause`,
    );
  }
}

