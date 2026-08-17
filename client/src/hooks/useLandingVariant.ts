import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { phFeatureFlag, phOnFeatureFlags } from "@/lib/posthog";

/**
 * PostHog multivariate experiment that splits the public "/" landing route
 * across the control page and three free-first design directions.
 *
 * The live traffic split (e.g. 50/50 control+one challenger, or 25/25/25/25) is
 * configured entirely in the PostHog dashboard — NOT here. This code renders
 * whichever variant PostHog assigns and safely falls back to "control" for any
 * value it doesn't recognise, so an arm sitting at 0% (or a not-yet-created
 * variant) simply never renders. Nothing in code needs to change to rebalance.
 */
export const LANDING_FLAG_KEY = "landing-free-first-test";

export type LandingVariant =
  | "control"
  | "direction-a"
  | "direction-b"
  | "direction-c"
  | "direction-d"
  | "direction-e";

const VARIANTS: readonly LandingVariant[] = [
  "control",
  "direction-a",
  "direction-b",
  "direction-c",
  "direction-d",
  "direction-e",
];

function normalize(value: unknown): LandingVariant {
  return typeof value === "string" && (VARIANTS as readonly string[]).includes(value)
    ? (value as LandingVariant)
    : "control";
}

/**
 * Read the assigned landing variant without subscribing — for use outside React
 * render (e.g. tagging a conversion event with the variant the visitor saw).
 * The flag is sticky per distinct-id, so this returns the same arm the visitor
 * was exposed to on "/", even after the Auth0 round-trip. Intentionally does NOT
 * honour the dev preview override below, so conversion events always reflect the
 * real PostHog assignment.
 */
export function readLandingVariant(): LandingVariant {
  return normalize(phFeatureFlag(LANDING_FLAG_KEY));
}

/**
 * DEV-ONLY preview override so the four landing variants can be viewed locally
 * without a PostHog key. Visit `/?lv=direction-b` (or control/direction-a/
 * direction-c) to pin a variant; the choice is remembered so the app can
 * navigate freely, and `/?lv=clear` resets it. `import.meta.env.DEV` is false in
 * production builds, so this whole branch is dead-code-eliminated from prod and
 * can never influence the live experiment.
 */
const PREVIEW_STORAGE_KEY = "eh:landing-preview";

function devPreviewOverride(): LandingVariant | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("lv");
  if (param === "clear") {
    window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
    return null;
  }
  if (param && (VARIANTS as readonly string[]).includes(param)) {
    window.localStorage.setItem(PREVIEW_STORAGE_KEY, param);
    return param as LandingVariant;
  }
  const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
  return stored && (VARIANTS as readonly string[]).includes(stored)
    ? (stored as LandingVariant)
    : null;
}

/**
 * React hook returning the assigned landing variant. Defaults to "control"
 * until PostHog resolves flags (posthog-js loads them asynchronously after
 * init, and bootstraps from the localStorage-cached value on repeat visits),
 * so first paint is never blocked and there is no flash of the wrong arm beyond
 * the safe control default.
 */
export function useLandingVariant(): LandingVariant {
  const [variant, setVariant] = useState<LandingVariant>(
    () => devPreviewOverride() ?? normalize(phFeatureFlag(LANDING_FLAG_KEY)),
  );

  useEffect(() => {
    // A dev preview pin wins and skips the flag subscription entirely.
    const override = devPreviewOverride();
    if (override) {
      setVariant(override);
      return;
    }
    // Re-read immediately in case flags were already ready before mount, then
    // stay subscribed so a first-time visitor updates once flags load.
    setVariant(normalize(phFeatureFlag(LANDING_FLAG_KEY)));
    const unsubscribe = phOnFeatureFlags(() => {
      setVariant(normalize(phFeatureFlag(LANDING_FLAG_KEY)));
    });
    return unsubscribe;
  }, []);

  return variant;
}

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
 * React hook returning the landing style implied by the current URL. Unlike
 * useLandingVariant, this never touches PostHog — style is a deterministic
 * function of the route, not an experiment assignment.
 */
export function useLandingStyle(): LandingStyle {
  const [location] = useLocation();
  return styleFromPath(location.split("?")[0] || "/");
}
