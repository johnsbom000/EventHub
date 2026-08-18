/**
 * Feature-flag readiness gate.
 *
 * PostHog resolves flags asynchronously AFTER `posthog.init`, so
 * `getFeatureFlag()` returns undefined for the whole first paint of a
 * first-touch visitor — which is the entire paid-ad population. Anything that
 * renders differently per variant must therefore wait for a real resolve rather
 * than paint the "unknown" default and swap a tick later.
 *
 * This module is the state machine for that wait. It is deliberately dependency
 * free — no React, no posthog-js, no `import.meta.env` — so it can be executed
 * directly under `node --import tsx` and driven with fakes.
 *
 * `resolvePricingModelForWrite()` (hooks/usePricingModel.ts) applies the same
 * "wait for a real resolve, with a timeout" discipline to the write that stamps
 * `vendor_accounts.pricing_model`; this is the read-side twin of it.
 */

export type FlagGateDeps<M> = {
  /** Reads the current value from the flag store (may be the unresolved default). */
  read: () => M;
  /** Subscribes to flag readiness/changes; returns an unsubscribe function. */
  onFlags: (cb: (errorsLoading?: boolean) => void) => () => void;
  /**
   * False when the flag source can never deliver a value (PostHog disabled or
   * not initialised). Waiting in that case is pure dead time — an unkeyed
   * environment would stare at the placeholder for the full timeout — so the
   * gate opens immediately with the safe default.
   */
  enabled: boolean;
  /** How long to wait for a real resolve before opening the gate anyway. */
  timeoutMs: number;
  /** Injectable for tests; defaults to the host timer functions. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * `resolved` distinguishes "PostHog actually answered" from "we gave up and used
 * the safe default" — the same distinction resolvePricingModelForWrite() reports.
 */
export type FlagGateUpdate<M> = (model: M, resolved: boolean) => void;

/**
 * Starts the gate. `onUpdate` fires:
 *   1. exactly once to OPEN the gate — on the first flag callback, on timeout,
 *      or synchronously when the flag source is disabled or flags are already
 *      loaded; and
 *   2. again for any later flag change, so a value that lands after the timeout
 *      still overrides the safe default (keeping painted copy consistent with
 *      the `pricing_model` recorded on analytics events).
 *
 * Returns a cleanup function that clears the timer and unsubscribes.
 */
export function startFlagGate<M>(deps: FlagGateDeps<M>, onUpdate: FlagGateUpdate<M>): () => void {
  const setTimer =
    deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms) as unknown);
  const clearTimer =
    deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  if (!deps.enabled) {
    onUpdate(deps.read(), false);
    return () => {};
  }

  // Every binding is declared and initialised before anything can read it — an
  // earlier version of this pattern shipped a temporal-dead-zone bug where a
  // synchronous callback touched a `const` declared further down and the promise
  // never settled. `opened` and `timer` are plain `let`s assigned at declaration.
  let opened = false;
  let timer: unknown = undefined;
  let unsubscribe: (() => void) | undefined = undefined;

  const clearPendingTimer = () => {
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
  };

  // posthog-js invokes this immediately when flags are already loaded, so a
  // repeat visitor with warm flags pays no delay at all.
  unsubscribe = deps.onFlags((errorsLoading) => {
    opened = true;
    clearPendingTimer();
    // A failed `/flags` request calls back with errorsLoading: true. That is not
    // a resolve — it is the same "we don't know" state as a timeout — but it does
    // open the gate, because no better answer is coming.
    onUpdate(deps.read(), !errorsLoading);
  });

  // Only arm the timer if the subscription did not already fire synchronously.
  if (!opened) {
    timer = setTimer(() => {
      timer = undefined;
      if (opened) return;
      opened = true;
      onUpdate(deps.read(), false);
    }, deps.timeoutMs);
  }

  return () => {
    clearPendingTimer();
    unsubscribe?.();
    unsubscribe = undefined;
  };
}
