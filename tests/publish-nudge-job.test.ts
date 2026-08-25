import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The publish nudge emails real vendors automatically, on a daily timer, with
 * no human in the loop. The failure modes are therefore not "a test goes red"
 * but "a vendor gets the same email every morning until they unsubscribe", or
 * "half the recipients are told something about pricing that is false for them".
 *
 * These assertions pin the properties that prevent that.
 */

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");

const job = read("server", "jobs", "publishNudge.ts");
const template = read("server", "emails", "publishNudge.ts");
const migration = read("migrations", "0167_add_publish_nudge_sent_at.ts");
const workers = read("server", "services", "backgroundJobs.ts");

// ── The once-only guard must be a DB column, not a local file ───────────────
// The manual send used a gitignored receipt file. If the job reused that idea,
// a fresh container would have an empty receipt and re-mail everyone.
assert.match(
  job,
  /isNull\(vendorAccounts\.publishNudgeSentAt\)/,
  "the job must filter on publishNudgeSentAt IS NULL",
);
assert.match(
  job,
  /\.set\(\{\s*publishNudgeSentAt:\s*new Date\(\)\s*\}\)/,
  "the job must stamp publishNudgeSentAt after sending",
);

// ── Stamp only after a CONFIRMED send ──────────────────────────────────────
// EmailResult is { sent, skipped, reason }. `skipped: true` means Resend was
// unconfigured and nothing was delivered. Stamping on that would permanently
// suppress the nudge for a vendor who never received it.
assert.match(job, /if \(!result\.sent\) \{/, "the job must check result.sent before stamping");
assert.ok(
  job.indexOf("if (!result.sent) {") < job.indexOf("publishNudgeSentAt: new Date()"),
  "the !result.sent bail must come BEFORE the stamp",
);

// The stamp must live inside the per-vendor loop, not after it. Batching at the
// end means a crash mid-run re-sends to everyone already emailed.
const loopStart = job.indexOf("for (const vendor of candidates)");
const stampAt = job.indexOf("publishNudgeSentAt: new Date()");
const loopEnd = job.indexOf("if (candidates.length)");
assert.ok(loopStart > -1 && stampAt > loopStart && stampAt < loopEnd,
  "the stamp must happen inside the per-vendor loop, not batched afterwards");

// ── Eligibility ─────────────────────────────────────────────────────────────
assert.match(job, /count\(\$\{vendorListings\.id\}\) = 0/, "only vendors with zero ACTIVE listings");
assert.match(job, /eq\(vendorListings\.status, "active"\)/, "'active' is the status that counts");
assert.match(job, /isNull\(vendorAccounts\.deletedAt\)/, "soft-deleted vendors are never emailed");
assert.match(job, /lte\(vendorAccounts\.createdAt, cutoff\)/, "a grace period before nudging");

// A missing slug must NOT be stamped — the email's central link is the vendor's
// storefront, so sending without one delivers a broken promise, and stamping it
// would mean they never get a working version later.
assert.match(job, /skippedNoSlug\+\+;/, "vendors without a slug are skipped");
const noSlugBlock = job.slice(job.indexOf("if (!vendor.shopSlug"), job.indexOf("if (!vendor.email"));
assert.ok(
  !/publishNudgeSentAt/.test(noSlugBlock),
  "a vendor skipped for a missing slug must not be stamped",
);

// ── The migration must not be a bare UPDATE ────────────────────────────────
// A plain UPDATE re-run weeks later would stamp everyone who signed up since,
// silently suppressing the nudge for all of them.
assert.match(
  migration,
  /ADD COLUMN IF NOT EXISTS publish_nudge_sent_at timestamptz DEFAULT now\(\)/,
  "column is added with DEFAULT now() so existing vendors are backfilled atomically",
);
assert.match(
  migration,
  /ALTER COLUMN publish_nudge_sent_at DROP DEFAULT/,
  "the default is dropped so NEW signups get NULL and become eligible",
);
assert.ok(
  !/UPDATE\s+vendor_accounts\s+SET\s+publish_nudge_sent_at/i.test(migration),
  "must not backfill with a non-idempotent UPDATE",
);

// ── The template must make NO pricing claim ────────────────────────────────
// Recipients are split across both live pricing arms, so any statement about
// monthly fees, Pro, or a price would be false for roughly half of them.
const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bPro\b/, why: "the commission arm has no Pro tier" },
  { pattern: /upgrade/i, why: "the commission arm has nothing to upgrade to" },
  { pattern: /\$\s*\d/, why: "no subscription price is true for both arms" },
  { pattern: /monthly fee/i, why: "false for the subscription arm" },
  { pattern: /subscription/i, why: "false for the subscription arm" },
  { pattern: /\b0\s*%/, why: "vendors pay a commission" },
  { pattern: /free forever/i, why: "an unqualified perpetual claim" },
  { pattern: /\bever\b/i, why: "perpetual claims were deliberately removed" },
  { pattern: /keep 100/i, why: "vendors do not keep 100%" },
];
// Only the rendered copy, not the surrounding code comments, which legitimately
// discuss pricing in order to explain why the copy avoids it.
const copy = [
  ...(template.match(/`[^`]*`/g) ?? []),
  ...(template.match(/^\s*`[^`]*`,\s*$/gm) ?? []),
]
  .join("\n")
  .replace(/\$\{[^}]*\}/g, ""); // merge expressions are not copy
for (const { pattern, why } of FORBIDDEN) {
  assert.ok(
    !pattern.test(copy),
    `publishNudge copy must not match ${pattern} — ${why}`,
  );
}

// Guard the guard: the patterns must actually fire on known-bad copy.
for (const bait of ["Upgrade to Pro", "No monthly fee, ever", "$29/mo", "Keep 100% of bookings"]) {
  assert.ok(
    FORBIDDEN.some(({ pattern }) => pattern.test(bait)),
    `FORBIDDEN failed to catch known-bad copy: ${bait}`,
  );
}

// ── The worker must actually be started, and be locked ─────────────────────
// A job that is defined but never registered is the quietest possible failure.
assert.match(workers, /export function startPublishNudgeWorker\(\)/, "worker is defined");
assert.match(workers, /^\s*startPublishNudgeWorker\(\);/m, "worker is actually started");
assert.match(
  workers,
  /tryAcquireWorkerLock\("publish_nudge"/,
  "worker takes a lock so two instances can't double-send",
);
assert.match(workers, /releaseWorkerLock\("publish_nudge"/, "worker releases its lock");

console.log("publish-nudge-job.test.ts: all assertions passed");
