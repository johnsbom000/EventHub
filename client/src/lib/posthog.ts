// PostHog loader.
//
// Bundled npm module rather than the pasted <script> snippet for the same
// reason as metaPixel.ts: production CSP has no 'unsafe-inline' in script-src.
// posthog-js lazy-loads extra chunks (session recorder, remote config) from
// its assets host, so script-src/connect-src need *.i.posthog.com.
//
// No-ops entirely when VITE_POSTHOG_KEY is unset (e.g. local dev without a
// key), so call sites never need to guard.
import posthog from "posthog-js";
import { scrubEventUrls } from "@/lib/scrubUrl";

declare global {
  interface Window {
    posthog: typeof posthog;
  }
}

const POSTHOG_KEY = String(import.meta.env.VITE_POSTHOG_KEY || "").trim();
const POSTHOG_HOST = String(import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com").trim();

let initialized = false;

/**
 * Flags whose last-known value is mirrored into localStorage and replayed into
 * `posthog.init({ bootstrap })`, so a RETURNING visitor's first paint already
 * has the right variant instead of the unresolved default.
 *
 * Allowlisted rather than "persist everything" to keep the payload bounded and
 * to make it obvious which flags are allowed to steer a first paint.
 * Must stay in sync with PRICING_FLAG_KEY (hooks/usePricingModel.ts) — that
 * module type-checks the equality.
 */
export const BOOTSTRAPPED_FLAG_KEYS = ["pricing-model-test"] as const;
export type BootstrappedFlagKey = (typeof BOOTSTRAPPED_FLAG_KEYS)[number];

const FLAG_BOOTSTRAP_STORAGE_KEY = "eh:ph-flag-bootstrap";

function readBootstrapFlags(): Record<string, string | boolean> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(FLAG_BOOTSTRAP_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const out: Record<string, string | boolean> = {};
    for (const key of BOOTSTRAPPED_FLAG_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" || typeof value === "boolean") out[key] = value;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Last-known value of a bootstrapped flag, readable before posthog-js loads. */
export function phReadPersistedFlag(key: BootstrappedFlagKey): string | boolean | undefined {
  return readBootstrapFlags()?.[key];
}

/** Remember a resolved flag value so the NEXT visit can paint it immediately. */
export function phPersistFlag(key: BootstrappedFlagKey, value: string | boolean): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...(readBootstrapFlags() ?? {}), [key]: value };
    window.localStorage.setItem(FLAG_BOOTSTRAP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full / disabled — bootstrapping is an optimisation, never required.
  }
}

function clearPersistedFlags(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FLAG_BOOTSTRAP_STORAGE_KEY);
  } catch {
    // Never throw
  }
}

/**
 * Whether PostHog is actually running. Callers that WAIT for flags need this:
 * with no key configured, `onFeatureFlags` never fires, so waiting would burn
 * the full timeout for nothing.
 */
export function phIsEnabled(): boolean {
  return initialized;
}

/**
 * Initialise PostHog. Idempotent and safe to call before render.
 *
 * $pageview is intentionally NOT auto-captured — useTrackPageView fires it on
 * first load and on every wouter route change, mirroring the Meta Pixel
 * PageView; the default (initial load only) would miss SPA navigation.
 */
export function initPostHog(): void {
  if (typeof window === "undefined" || initialized || !POSTHOG_KEY) return;
  initialized = true;
  const bootstrapFlags = readBootstrapFlags();
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Seed the last-known variant for a returning visitor so their first paint
    // is already correct. This does NOT help a first-touch visitor (nothing is
    // cached) — the render gate in usePricingModelResolution() covers those.
    ...(bootstrapFlags ? { bootstrap: { featureFlags: bootstrapFlags } } : {}),
    capture_pageview: false,
    capture_pageleave: true,
    // Strip OAuth callback parameters (`code`, `state`) from every URL before
    // it is sent. Auth0 redirects back to the app origin with these still in
    // the address bar, and both the pageview and the session recording start
    // URL are captured before onRedirectCallback cleans them. See scrubUrl.ts.
    before_send: scrubEventUrls,
    persistence: "localStorage+cookie",
    // Create a person profile for ANONYMOUS visitors too (default is
    // "identified_only"). Paid Meta/IG traffic is anonymous — without this they
    // get no person profile, so funnel insights and $initial_utm_* person
    // properties silently come back empty. UTM/campaign params are captured
    // automatically by posthog-js; "always" is what makes them stick to a person.
    person_profiles: "always",
  });
  // Expose the instance on window (production included) so `posthog.reset()`,
  // bucketing checks, etc. can be run from the browser console. PostHog's
  // default <script>-snippet install also attaches posthog to window; the npm
  // module we use instead does not, so this restores that parity.
  window.posthog = posthog;
}

export function phCapture(name: string, properties: Record<string, unknown> = {}): void {
  if (!initialized) return;
  try {
    posthog.capture(name, properties);
  } catch {
    // Never throw — analytics must not impact user experience
  }
}

/** Tie the anonymous session to an account after Auth0 login. */
export function phIdentify(distinctId: string, properties: Record<string, unknown> = {}): void {
  if (!initialized) return;
  try {
    posthog.identify(distinctId, properties);
  } catch {
    // Never throw
  }
}

/** Drop the identified session on logout so the next visitor starts anonymous. */
export function phReset(): void {
  // Always drop the cached flags: the next visitor gets a new distinct_id and
  // must not inherit the previous person's variant as their first paint.
  clearPersistedFlags();
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // Never throw
  }
}

/**
 * Read the current value of a (multivariate) feature flag. Returns the variant
 * key string for a multivariate flag, a boolean for a simple flag, or undefined
 * when PostHog is disabled or flags haven't loaded yet. Calling this records an
 * experiment exposure ($feature_flag_called) for the flag.
 */
export function phFeatureFlag(key: string): string | boolean | undefined {
  if (!initialized) return undefined;
  try {
    return posthog.getFeatureFlag(key);
  } catch {
    return undefined;
  }
}

/**
 * Subscribe to feature-flag readiness/changes. posthog-js loads flags
 * asynchronously after init, so first-time visitors get a callback once the
 * flags resolve. Returns an unsubscribe function (a no-op when disabled).
 *
 * posthog-js invokes the callback with `{ errorsLoading: true }` when the
 * underlying `/flags` request failed, rather than raising. The optional
 * second callback argument passes that through so callers that care about a
 * failed load (vs. a genuine resolve) can distinguish the two; existing
 * callers that only declare `() => void` keep working unchanged.
 */
export function phOnFeatureFlags(
  cb: (errorsLoading?: boolean) => void,
): () => void {
  if (!initialized) return () => {};
  try {
    return posthog.onFeatureFlags((_flags, _variants, context) => cb(context?.errorsLoading));
  } catch {
    return () => {};
  }
}
