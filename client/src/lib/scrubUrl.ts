// URL scrubbing for analytics.
//
// Auth0 completes login by redirecting back to the app origin with the OAuth
// authorization `code` and `state` still in the address bar. PostHog captures
// the current URL (as `$current_url` on the pageview and as the session
// recording start URL) at that moment — before Auth0's onRedirectCallback
// strips the query — so the short-lived authorization material and session
// state land in analytics, visible to viewers who do not need them.
//
// The URL cannot be cleaned earlier: Auth0 must read `code` and `state` from
// the address bar to exchange them for a token. So instead we remove these
// parameters from every URL PostHog sends, keeping the path and other query
// parameters intact for behaviour analysis.

/** OAuth callback parameters removed from every URL before PostHog sends it. */
const SENSITIVE_URL_PARAMS = ["code", "state", "session_state"] as const;

/**
 * Remove OAuth callback parameters from one URL string. Returns the input
 * unchanged when it is not an absolute URL or carries none of the parameters,
 * so non-URL property values pass through untouched.
 */
export function scrubSensitiveUrlParams(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  let changed = false;
  for (const param of SENSITIVE_URL_PARAMS) {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  }
  return changed ? url.toString() : value;
}

function scrubUrlProperties(props: Record<string, unknown> | null | undefined): void {
  if (!props) return;
  for (const key of Object.keys(props)) {
    const value = props[key];
    if (typeof value !== "string") continue;
    const lower = key.toLowerCase();
    if (lower.includes("url") || lower.includes("href") || lower.includes("referrer")) {
      props[key] = scrubSensitiveUrlParams(value);
    }
  }
}

/** Minimal shape of a PostHog event, kept local so this module needs no SDK import. */
export interface UrlBearingEvent {
  properties?: Record<string, unknown> | null;
  $set?: Record<string, unknown> | null;
  $set_once?: Record<string, unknown> | null;
}

/**
 * PostHog `before_send` hook: scrub OAuth callback parameters out of every
 * URL-bearing property before the event leaves the browser. Covers pageview
 * (`$current_url`, `$referrer`), session recording (`$session_recording_start_url`),
 * and initial-URL person properties (`$initial_current_url`, …) alike, matched
 * by key substring so new PostHog URL properties are handled too.
 */
export function scrubEventUrls<T extends UrlBearingEvent | null>(event: T): T {
  if (!event) return event;
  scrubUrlProperties(event.properties);
  scrubUrlProperties(event.$set);
  scrubUrlProperties(event.$set_once);
  return event;
}
