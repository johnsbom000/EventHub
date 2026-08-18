import { useLocation } from "wouter";

/**
 * RETIRED: the `landing-free-first-test` PostHog flag that used to split "/"
 * across a control page and five free-first design directions. Landing style is
 * now a deterministic function of the URL (each Meta ad links to its own
 * /for-vendors route), so the flag, its `?lv=` dev override, and the
 * readLandingVariant()/useLandingVariant() readers are gone. Conversion events
 * are tagged with `landing_style` from first-touch attribution instead of the
 * old `variant`. Only the randomised pricing model remains a feature flag —
 * see usePricingModel.
 */

/**
 * Landing STYLE — which of the six page designs to render. Comes from the URL,
 * because each Meta ad links to its own route and we control the style/ad
 * mapping through ad spend. This is deliberately NOT randomised: only the
 * pricing model is (see usePricingModel).
 */
export type LandingStyle = "control" | "a" | "b" | "c" | "d" | "e";

const STYLES: readonly LandingStyle[] = ["control", "a", "b", "c", "d", "e"];

/**
 * `/for-vendors` → control, `/for-vendors/b` → b. An unrecognised segment falls
 * back to control rather than 404-ing: a mistyped ad URL should still convert.
 * Pure function of the pathname so it can be reused outside React (e.g. by
 * attribution capture on first paint).
 */
export function styleFromPath(pathname: string): LandingStyle {
  const segment = pathname.replace(/^\/for-vendors\/?/, "").split("/")[0]?.toLowerCase() ?? "";
  return (STYLES as readonly string[]).includes(segment) ? (segment as LandingStyle) : "control";
}

/**
 * React hook returning the landing style implied by the current URL. This never
 * touches PostHog — style is a deterministic function of the route, not an
 * experiment assignment.
 */
export function useLandingStyle(): LandingStyle {
  const [location] = useLocation();
  return styleFromPath(location.split("?")[0] || "/");
}
