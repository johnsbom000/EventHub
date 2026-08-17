import { styleFromPath, type LandingStyle } from "@/hooks/useLandingVariant";

/**
 * First-touch ad attribution, held in sessionStorage across the Auth0 round-trip
 * and stamped onto the vendor account at provision.
 *
 * sessionStorage (not localStorage) is deliberate: it survives the auth redirect
 * within the tab, which is all that's needed, and does not leak a stale
 * attribution into a visit made days later from a different source.
 *
 * pricing_model is deliberately NOT captured here. Unlike landing_style/UTMs
 * (which are genuine first-touch facts baked into the URL the visitor clicked),
 * pricing_model comes from a PostHog feature flag that is very likely still
 * unresolved at the moment this fires — paid-traffic first visits are exactly
 * the case where the /decide round trip hasn't completed yet, and
 * readPricingModel() silently returns the "subscription" safe-default while
 * unresolved. Freezing that placeholder via first-touch would have permanently
 * mis-stamped most commission-arm signups. Instead, the pricing model is read
 * live (readPricingModel()) at provision time in VendorProvision.tsx /
 * VendorOnboarding.tsx, by which point flags have long since resolved — the
 * same pattern this codebase already uses for readLandingVariant().
 */
const STORAGE_KEY = "eh:landing-attribution";

export interface LandingAttribution {
  landingStyle: LandingStyle | null;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  fbclid?: string;
}

/**
 * Capture on first landing only. If a record already exists this is a no-op, so
 * the ad that actually brought the visitor wins over whatever page they wandered
 * to afterwards.
 *
 * landing_style is recorded only when the pathname genuinely starts with
 * `/for-vendors` (a real ad landing) — TemporaryLanding also renders at `/`
 * for organic/SEO traffic, and styleFromPath falls back to "control" for any
 * unrecognised path, so without this guard every homepage visit would be
 * mis-recorded as having arrived via the control ad. UTMs need no separate
 * guard: organic URLs simply don't carry utm_* params, so they come out
 * undefined there naturally.
 *
 * The whole body is wrapped in try/catch — not just the write — because even
 * touching `window.sessionStorage` can throw a SecurityError where site data
 * is blocked, and this runs unconditionally in a landing-page mount effect.
 */
export function captureAttribution(): void {
  try {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(STORAGE_KEY)) return;

    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const value = (key: string) => params.get(key) || undefined;

    const attribution: LandingAttribution = {
      landingStyle: pathname.startsWith("/for-vendors") ? styleFromPath(pathname) : null,
      utmSource: value("utm_source"),
      utmMedium: value("utm_medium"),
      utmCampaign: value("utm_campaign"),
      utmContent: value("utm_content"),
      fbclid: value("fbclid"),
    };

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Private-browsing quota errors / blocked storage must never break the
    // landing page.
  }
}

export function readAttribution(): LandingAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LandingAttribution) : null;
  } catch {
    return null;
  }
}

export function clearAttribution(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
