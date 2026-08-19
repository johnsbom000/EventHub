import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isAccountNew, ACCOUNT_IS_NEW_WINDOW_MS } from "../client/src/lib/accountAge";

/**
 * `CompleteRegistration` is the event Meta OPTIMIZES the ad campaign against.
 *
 * It used to fire from the App.tsx post-login redirect on every authenticated
 * arrival — so returning logins and customer logins counted as registrations.
 * The once-per-session guard did not help: a returning user arrives with a
 * fresh session and an empty guard.
 *
 * The cost is not just a wrong number. Counting logins as signups understates
 * CPA and trains Meta's delivery to find people who resemble the existing user
 * base rather than new vendors — and it gets worse as that base grows.
 */

const root = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");

// ── isAccountNew: only a just-created account counts ─────────────────────────
const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);

assert.equal(isAccountNew(new Date(NOW - 1000).toISOString(), NOW), true, "created 1s ago is new");
assert.equal(
  isAccountNew(new Date(NOW - (ACCOUNT_IS_NEW_WINDOW_MS - 1000)).toISOString(), NOW),
  true,
  "just inside the window is new",
);
assert.equal(
  isAccountNew(new Date(NOW - (ACCOUNT_IS_NEW_WINDOW_MS + 1000)).toISOString(), NOW),
  false,
  "just outside the window is NOT new",
);

// The case that caused the bug: a returning user logging in days later.
assert.equal(
  isAccountNew(new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString(), NOW),
  false,
  "a week-old account logging in is NOT a signup",
);

// Fail closed on anything unusable rather than counting a conversion.
for (const bad of [null, undefined, "", "not-a-date"]) {
  assert.equal(isAccountNew(bad as any, NOW), false, `${String(bad)} is not new`);
}

// A future timestamp (clock skew) must not count as new.
assert.equal(
  isAccountNew(new Date(NOW + 60_000).toISOString(), NOW),
  false,
  "a future createdAt is not treated as new",
);

// Accepts a Date as well as an ISO string, since the API may return either.
assert.equal(isAccountNew(new Date(NOW - 1000), NOW), true, "Date input works");

// ── The signature makes the check unskippable ────────────────────────────────
// A future call site cannot reintroduce the bug by forgetting to check: the
// helper takes a REQUIRED isNewAccount and returns early when it is false.
const tracking = read("client", "src", "lib", "tracking.ts");
assert.match(
  tracking,
  /export function trackSignupCompletedOnce\(\s*opts:\s*\{\s*isNewAccount:\s*boolean/,
  "trackSignupCompletedOnce requires an explicit isNewAccount",
);
assert.match(
  tracking,
  /if \(!isNewAccount\) return;/,
  "the helper returns before firing when the account is not new",
);
// The early return must precede the session guard, or a bailed login would
// consume the guard and suppress a genuine signup later in the same session.
assert.ok(
  tracking.indexOf("if (!isNewAccount) return;") < tracking.indexOf("GUARD_KEY"),
  "the isNewAccount bail happens BEFORE the session guard is set",
);

// ── Both call sites prove newness from a server signal ──────────────────────
const provision = read("client", "src", "pages", "VendorProvision.tsx");
assert.match(
  provision,
  /isNewAccount:\s*provisionData\?\.alreadyExisted === false/,
  "provision uses the server's alreadyExisted flag, not mere authentication",
);

const app = read("client", "src", "App.tsx");
assert.match(
  app,
  /isNewAccount:\s*isAccountNew\(customerMe\?\.createdAt\)/,
  "post-login uses the server's createdAt, not mere authentication",
);
assert.ok(
  !/trackSignupCompletedOnce\(\s*\{\s*role/.test(app),
  "post-login no longer fires unconditionally on any authenticated redirect",
);

// ── The server must actually supply what the gate depends on ────────────────
const customerRouter = read("server", "routers", "customer.ts");
assert.match(
  customerRouter,
  /createdAt:\s*user\.createdAt/,
  "/api/customer/me returns createdAt, which the post-login gate reads",
);
const vendorRouter = read("server", "routers", "vendor.ts");
assert.match(
  vendorRouter,
  /alreadyExisted:\s*true/,
  "provision reports alreadyExisted for the existing-account path",
);
assert.match(
  vendorRouter,
  /alreadyExisted:\s*false/,
  "provision reports alreadyExisted:false when it actually creates the account",
);

// ── Pixel/CAPI dedup must stay intact ───────────────────────────────────────
// Both copies of one event must carry the SAME event_id or Meta counts it twice.
assert.match(tracking, /const eventId = newEventId\(\)/, "one event id is minted per event");
assert.match(tracking, /\{ eventID: eventId \}/, "the browser pixel sends the shared event id");
assert.match(
  tracking,
  /forwardToCapi\(meta\.event, eventId, props, email\)/,
  "the server-side copy sends the same event id",
);
const misc = read("server", "routers", "misc.ts");
assert.match(misc, /event_id:/, "the CAPI endpoint forwards event_id to Meta");

console.log("signup-conversion-gate.test.ts: all assertions passed");
