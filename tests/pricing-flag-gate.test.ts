import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startFlagGate } from "../client/src/lib/pricingFlagGate";

/**
 * The landing pages must NEVER paint one arm's money story to the other arm's
 * visitor. The dev `?pm=` override resolves synchronously and bypasses the flag
 * entirely, so a browser check cannot exercise the path that matters: a
 * first-touch paid-ad visitor whose PostHog flags have not loaded yet. These
 * tests drive that path directly with a fake flag source and fake timers.
 */

type Model = "subscription" | "commission";

/** Mirrors normalize() in hooks/usePricingModel.ts. */
function normalize(value: unknown): Model {
  return value === "commission" ? "commission" : "subscription";
}

const TIMEOUT_MS = 2500; // PRICING_FLAG_RESOLVE_TIMEOUT_MS

type Timer = { fn: () => void; ms: number; cancelled: boolean };

/**
 * Simulates what the browser actually paints: React renders once with the
 * hook's initial state, then re-renders on every state update. `paints` is the
 * sequence of screens a visitor would see, in order.
 */
function harness(opts: {
  enabled?: boolean;
  /** Value getFeatureFlag() returns right now; undefined = flags not loaded. */
  flag?: string | undefined;
  /** Bootstrapped last-known value (returning visitor); undefined = first touch. */
  cached?: Model;
}) {
  const flagState = { value: opts.flag };
  const subscribers: Array<(errorsLoading?: boolean) => void> = [];
  const timers: Timer[] = [];
  const updates: Array<{ model: Model; resolved: boolean }> = [];
  const paints: string[] = [];

  // initialResolution() in hooks/usePricingModel.ts
  let state: { model: Model; ready: boolean } = opts.cached
    ? { model: opts.cached, ready: true }
    : { model: "subscription", ready: false };

  const paint = () => {
    // LandingForVariant: `if (!ready) return <LandingPlaceholder />;`
    paints.push(state.ready ? `landing:${state.model}` : "placeholder");
  };

  paint(); // first render

  const stop = startFlagGate<Model>(
    {
      read: () => normalize(flagState.value),
      onFlags: (cb) => {
        subscribers.push(cb);
        return () => {
          const i = subscribers.indexOf(cb);
          if (i >= 0) subscribers.splice(i, 1);
        };
      },
      enabled: opts.enabled ?? true,
      timeoutMs: TIMEOUT_MS,
      setTimer: (fn, ms) => {
        const timer: Timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return timer;
      },
      clearTimer: (handle) => {
        (handle as Timer).cancelled = true;
      },
    },
    (model, resolved) => {
      updates.push({ model, resolved });
      state = { model, ready: true };
      paint();
    },
  );

  return {
    paints,
    updates,
    timers,
    stop,
    subscriberCount: () => subscribers.length,
    /** PostHog answers: set the flag value and fire onFeatureFlags. */
    deliverFlags(value: string | undefined, errorsLoading = false) {
      flagState.value = value;
      for (const cb of [...subscribers]) cb(errorsLoading);
    },
    /** Advance to the gate's timeout. */
    runTimers() {
      for (const timer of [...timers]) if (!timer.cancelled) timer.fn();
    },
  };
}

const SUBSCRIPTION_PAINT = "landing:subscription";

/* ---------------------------------------------------------------------------
   CRITICAL 1 — first-touch commission visitor, flags land later.
--------------------------------------------------------------------------- */
{
  const h = harness({ flag: undefined }); // getFeatureFlag() === undefined

  assert.deepEqual(h.paints, ["placeholder"], "first paint holds, it does not guess");
  assert.equal(h.updates.length, 0, "gate has not opened while flags are unresolved");
  assert.equal(h.timers.length, 1, "a timeout is armed so the hold cannot last forever");
  assert.equal(h.timers[0].ms, TIMEOUT_MS);

  h.deliverFlags("commission");

  assert.deepEqual(h.paints, ["placeholder", "landing:commission"]);
  assert.deepEqual(h.updates, [{ model: "commission", resolved: true }]);
  assert.ok(
    !h.paints.includes(SUBSCRIPTION_PAINT),
    "a commission visitor must never be painted subscription copy",
  );
  assert.ok(h.timers[0].cancelled, "the timeout is cleared once flags resolve");
  h.stop();
}

/* ---------------------------------------------------------------------------
   Timeout genuinely fires and settles when onFeatureFlags NEVER fires.
--------------------------------------------------------------------------- */
{
  const h = harness({ flag: undefined });

  assert.deepEqual(h.paints, ["placeholder"]);
  h.runTimers();

  assert.deepEqual(
    h.updates,
    [{ model: "subscription", resolved: false }],
    "timeout opens the gate on the safe default and reports resolved:false",
  );
  assert.deepEqual(h.paints, ["placeholder", SUBSCRIPTION_PAINT]);

  // A value that lands after the timeout still corrects the page, so painted
  // copy stays consistent with the pricing_model stamped on analytics events.
  h.deliverFlags("commission");
  assert.deepEqual(h.paints, ["placeholder", SUBSCRIPTION_PAINT, "landing:commission"]);
  assert.deepEqual(h.updates[1], { model: "commission", resolved: true });
  h.stop();
}

/* ---------------------------------------------------------------------------
   Timeout fires exactly once and is idempotent against a simultaneous resolve.
--------------------------------------------------------------------------- */
{
  const h = harness({ flag: undefined });
  h.runTimers();
  h.runTimers(); // a stray second invocation must not double-open
  assert.equal(h.updates.length, 1, "the gate opens exactly once");
  h.stop();
}

/* ---------------------------------------------------------------------------
   PostHog disabled (no VITE_POSTHOG_KEY): open immediately, never wait.
--------------------------------------------------------------------------- */
{
  const h = harness({ enabled: false, flag: undefined });
  assert.deepEqual(
    h.paints,
    ["placeholder", SUBSCRIPTION_PAINT],
    "with no flag source the gate opens synchronously — no 2.5s dead screen",
  );
  assert.equal(h.timers.length, 0, "nothing to wait for, so no timer is armed");
  assert.deepEqual(h.updates, [{ model: "subscription", resolved: false }]);
  h.stop();
}

/* ---------------------------------------------------------------------------
   /flags request FAILED: that is not a resolve, but it must still open.
--------------------------------------------------------------------------- */
{
  const h = harness({ flag: undefined });
  h.deliverFlags(undefined, true);
  assert.deepEqual(
    h.updates,
    [{ model: "subscription", resolved: false }],
    "errorsLoading opens the gate on the safe default but is not a resolve, so it is not cached",
  );
  assert.ok(h.timers[0].cancelled);
  h.stop();
}

/* ---------------------------------------------------------------------------
   Flags already loaded: onFeatureFlags fires synchronously during subscribe.
   (This is the TDZ-sensitive path — the callback runs before startFlagGate
   returns, while `timer` is still being set up.)
--------------------------------------------------------------------------- */
{
  const flagState = { value: "commission" as string | undefined };
  const timers: Timer[] = [];
  const updates: Array<{ model: Model; resolved: boolean }> = [];

  const stop = startFlagGate<Model>(
    {
      read: () => normalize(flagState.value),
      onFlags: (cb) => {
        cb(false); // fire synchronously, like posthog-js with warm flags
        return () => {};
      },
      enabled: true,
      timeoutMs: TIMEOUT_MS,
      setTimer: (fn, ms) => {
        const timer: Timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return timer;
      },
      clearTimer: (handle) => {
        (handle as Timer).cancelled = true;
      },
    },
    (model, resolved) => updates.push({ model, resolved }),
  );

  assert.deepEqual(updates, [{ model: "commission", resolved: true }], "synchronous resolve works");
  assert.equal(timers.length, 0, "no timer is armed when the gate opened synchronously");
  stop();
}

/* ---------------------------------------------------------------------------
   Returning visitor (bootstrapped flag): no placeholder, correct arm at once.
--------------------------------------------------------------------------- */
{
  const h = harness({ cached: "commission", flag: "commission" });
  assert.equal(h.paints[0], "landing:commission", "bootstrapped visitor skips the hold");
  assert.ok(!h.paints.includes(SUBSCRIPTION_PAINT));
  h.stop();
}

/* ---------------------------------------------------------------------------
   Cleanup (unmount) cancels the timer and unsubscribes.
--------------------------------------------------------------------------- */
{
  const h = harness({ flag: undefined });
  assert.equal(h.subscriberCount(), 1);
  h.stop();
  assert.equal(h.subscriberCount(), 0, "unsubscribed on cleanup");
  assert.ok(h.timers[0].cancelled, "timer cleared on cleanup");

  h.runTimers();
  h.deliverFlags("commission");
  assert.equal(h.updates.length, 0, "no state updates after unmount");
}

/* ---------------------------------------------------------------------------
   Wiring guards — the gate above is only useful if App.tsx actually holds the
   render on it, and if no non-landing route evaluates the flag.
--------------------------------------------------------------------------- */
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const appSrc = readFileSync(path.join(here, "../client/src/App.tsx"), "utf8");

  assert.match(
    appSrc,
    /const \{ model, ready \} = usePricingModelResolution\(\);\s*\n\s*if \(!ready\) return <LandingPlaceholder \/>;/,
    "LandingForVariant must hold the render until the flag resolves",
  );

  // The placeholder must be arm-agnostic: no money story of either kind.
  const placeholder = appSrc.slice(
    appSrc.indexOf("function LandingPlaceholder()"),
    appSrc.indexOf("// Renders the landing page for the six"),
  );
  assert.ok(placeholder.length > 0, "LandingPlaceholder must exist");
  for (const forbidden of ["$", "Pro", "fee", "commission", "Free", "%"]) {
    assert.ok(
      !placeholder.includes(forbidden),
      `placeholder must not contain arm-specific copy (${forbidden})`,
    );
  }

  const rootEntry = appSrc.slice(
    appSrc.indexOf("function RootEntry()"),
    appSrc.indexOf("function VendorOnlyGuard("),
  );
  assert.ok(rootEntry.length > 0, "RootEntry must exist");
  assert.ok(
    !/usePricingModel/.test(rootEntry),
    "RootEntry must not evaluate the pricing flag — it serves users who never see a landing page",
  );

  // An already-provisioned vendor is pinned to their account's model, never the flag.
  assert.match(
    appSrc,
    /function VendorOnlyLanding\(\) \{\s*\n\s*return <TemporaryLanding model="subscription" \/>;/,
    "vendor-only landing must not be randomised by the experiment flag",
  );

  const hookSrc = readFileSync(path.join(here, "../client/src/hooks/usePricingModel.ts"), "utf8");
  assert.match(
    hookSrc,
    /timeoutMs: number = PRICING_FLAG_RESOLVE_TIMEOUT_MS/,
    "the render gate uses the same timeout budget as the write path",
  );
  assert.ok(
    !/export function usePricingModel\(/.test(hookSrc),
    "the ungated usePricingModel() hook must not come back — it paints before the flag resolves",
  );
}

console.log("pricing-flag-gate: all assertions passed");
