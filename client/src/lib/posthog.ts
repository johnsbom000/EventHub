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
  });
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
