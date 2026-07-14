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

declare global {
  interface Window {
    posthog: typeof posthog;
  }
}

const POSTHOG_KEY = String(import.meta.env.VITE_POSTHOG_KEY || "").trim();
const POSTHOG_HOST = String(import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com").trim();

let initialized = false;

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
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
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
 */
export function phOnFeatureFlags(cb: () => void): () => void {
  if (!initialized) return () => {};
  try {
    return posthog.onFeatureFlags(() => cb());
  } catch {
    return () => {};
  }
}
