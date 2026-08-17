import posthog from "posthog-js";
import { readAttribution } from "@/lib/landingAttribution";
import { readPricingModel } from "@/hooks/usePricingModel";

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

/** Stable, unique id shared between the browser pixel and the server-side CAPI
 *  copy of one event, so Meta can dedupe them by (event_name, event_id). */
function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Best-effort server-side (Conversions API) copy of a Meta event. Survives the
 *  Instagram/Facebook in-app webview, where the browser pixel is unreliable.
 *  Same-origin, so the visitor's _fbp/_fbc cookies ride along automatically.
 *  `email` (when the caller has one, e.g. at signup) is sent raw over the
 *  same-origin request; the server SHA-256-hashes it before forwarding to Meta,
 *  which materially improves match quality on conversion events. */
function forwardToCapi(
  eventName: string,
  eventId: string,
  props: Record<string, any>,
  email?: string
): void {
  try {
    void fetch("/api/meta-capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_source_url: typeof window !== "undefined" ? window.location.href : undefined,
        email: email || undefined,
        custom_data: props,
      }),
    }).catch(() => {
      // Analytics must never affect UX.
    });
  } catch {
    // Ignore — best effort.
  }
}

/** Fire an event to PostHog and Meta together. `email`, when supplied, is
 *  forwarded only to the server-side CAPI copy (never to PostHog props) so Meta
 *  can hash it for identity matching. */
export function trackBoth(
  name: string,
  props: Record<string, any> = {},
  meta?: { event: string; standard: boolean },
  email?: string
) {
  posthog.capture(name, props);
  if (meta && typeof window.fbq === "function") {
    // Shared event_id ties this browser pixel event to its server-side CAPI
    // copy so Meta counts the conversion once, not twice.
    const eventId = newEventId();
    window.fbq(meta.standard ? "track" : "trackCustom", meta.event, props, { eventID: eventId });
    forwardToCapi(meta.event, eventId, props, email);
  }
}

/** Fires the `signup_completed` / Meta `CompleteRegistration` conversion at most
 *  once per browser session. Both the App.tsx post-login path and the
 *  VendorProvision path can reach an account-creation moment for the same user,
 *  so a session-scoped guard (rather than a per-module boolean like the one in
 *  engagement.ts) is what actually dedupes them across separate page loads. */
export function trackSignupCompletedOnce(props: Record<string, any> = {}, email?: string) {
  const GUARD_KEY = "eh:signup-completed-fired";
  try {
    if (typeof sessionStorage !== "undefined") {
      if (sessionStorage.getItem(GUARD_KEY)) return; // already fired this session
      sessionStorage.setItem(GUARD_KEY, "1");
    }
  } catch {
    // sessionStorage unavailable (private mode / disabled) — fall through and
    // fire; a rare double-count is better than dropping the conversion.
  }
  // Experiment arm rides along on the conversion so CPA can be split by
  // pricing model in Meta and by any property in PostHog. Sourced here (once,
  // for every caller of this helper) rather than per call site, so there is a
  // single place that decides how these two properties are read:
  //  - pricing_model is read LIVE via readPricingModel() — it is a PostHog
  //    feature flag, not stored attribution, because flags are guaranteed to
  //    have resolved by the time an account-creation conversion fires (unlike
  //    at landing-mount, where the /decide round trip may still be pending).
  //  - landing_style comes from the first-touch attribution captured on
  //    landing; it is null for organic "/" traffic, which is deliberate.
  const attribution = readAttribution();
  const enrichedProps = {
    ...props,
    pricing_model: readPricingModel(),
    landing_style: attribution?.landingStyle ?? null,
  };
  trackBoth("signup_completed", enrichedProps, { event: "CompleteRegistration", standard: true }, email);
}
