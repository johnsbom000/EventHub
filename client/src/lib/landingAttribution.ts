import { readPricingModel, type PricingModel } from "@/hooks/usePricingModel";
import { styleFromPath, type LandingStyle } from "@/hooks/useLandingVariant";

/**
 * First-touch ad attribution, held in sessionStorage across the Auth0 round-trip
 * and stamped onto the vendor account at provision.
 *
 * sessionStorage (not localStorage) is deliberate: it survives the auth redirect
 * within the tab, which is all that's needed, and does not leak a stale
 * attribution into a visit made days later from a different source.
 */
const STORAGE_KEY = "eh:landing-attribution";

export interface LandingAttribution {
  pricingModel: PricingModel;
  landingStyle: LandingStyle;
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
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  if (window.sessionStorage.getItem(STORAGE_KEY)) return;

  const params = new URLSearchParams(window.location.search);
  const value = (key: string) => params.get(key) || undefined;

  const attribution: LandingAttribution = {
    pricingModel: readPricingModel(),
    landingStyle: styleFromPath(window.location.pathname),
    utmSource: value("utm_source"),
    utmMedium: value("utm_medium"),
    utmCampaign: value("utm_campaign"),
    utmContent: value("utm_content"),
    fbclid: value("fbclid"),
  };

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Private-browsing quota errors must never break the landing page.
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
