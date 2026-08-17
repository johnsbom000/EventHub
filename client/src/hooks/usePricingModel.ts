import { useEffect, useState } from "react";
import { phFeatureFlag, phOnFeatureFlags } from "@/lib/posthog";

/**
 * Pricing model A/B test. Unlike the landing STYLE (which comes from the ad's
 * URL), the pricing model is randomised AFTER the click so both arms are drawn
 * from the same ad and the same Meta audience. Hardwiring pricing per ad would
 * let Meta's delivery optimisation send systematically different people to each
 * model, confounding pricing with audience.
 *
 * The split lives entirely in the PostHog dashboard.
 */
export const PRICING_FLAG_KEY = "pricing-model-test";

export type PricingModel = "subscription" | "commission";

/**
 * Unknown values, flag-load failure, and pre-resolution all yield "subscription".
 * That is the safe direction: a failure gives the visitor today's paid model
 * rather than accidentally granting free Pro features at commission rates.
 */
function normalize(value: unknown): PricingModel {
  return value === "commission" ? "commission" : "subscription";
}

export function readPricingModel(): PricingModel {
  return normalize(phFeatureFlag(PRICING_FLAG_KEY));
}

/** DEV-ONLY preview: `?pm=commission` pins a model locally. Dead-code-eliminated
 *  from production builds, so it can never influence the live experiment. */
const PREVIEW_STORAGE_KEY = "eh:pricing-preview";

function devPreviewOverride(): PricingModel | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("pm");
  if (param === "clear") {
    window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
    return null;
  }
  if (param === "commission" || param === "subscription") {
    window.localStorage.setItem(PREVIEW_STORAGE_KEY, param);
    return param;
  }
  const stored = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
  return stored === "commission" || stored === "subscription" ? stored : null;
}

export function usePricingModel(): PricingModel {
  const [model, setModel] = useState<PricingModel>(
    () => devPreviewOverride() ?? readPricingModel(),
  );

  useEffect(() => {
    const override = devPreviewOverride();
    if (override) {
      setModel(override);
      return;
    }
    setModel(readPricingModel());
    return phOnFeatureFlags(() => setModel(readPricingModel()));
  }, []);

  return model;
}
