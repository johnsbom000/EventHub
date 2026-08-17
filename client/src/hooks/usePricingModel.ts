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

/** How long to wait for PostHog flags before provisioning anyway. */
export const PRICING_FLAG_RESOLVE_TIMEOUT_MS = 2500;

/**
 * Resolves the pricing model for a WRITE — specifically the one that stamps the
 * immutable `vendor_accounts.pricing_model` column at provision.
 *
 * readPricingModel() cannot distinguish "PostHog assigned subscription" from
 * "flags have not resolved yet" or "/decide failed" — all three return
 * "subscription". At read time that is a harmless safe default, but at provision
 * it is written to a column that is never mutated again, so a slow flag load
 * silently mis-assigns the vendor into the control arm for the life of the
 * account and quietly biases the experiment toward subscription.
 *
 * So for the write we WAIT for `onFeatureFlags` to fire, with a short timeout so
 * a PostHog outage degrades to today's behaviour (safe default) instead of
 * blocking signup. `resolved` reports which happened, for observability.
 *
 * NOTE (owner action, not code): PostHog must also be configured to persist this
 * flag across authentication, so the anonymous pre-signup assignment and the
 * identified post-signup user get the same variant. That is a dashboard setting.
 */
export function resolvePricingModelForWrite(
  timeoutMs: number = PRICING_FLAG_RESOLVE_TIMEOUT_MS,
): Promise<{ model: PricingModel; resolved: boolean }> {
  if (typeof window === "undefined") {
    return Promise.resolve({ model: readPricingModel(), resolved: false });
  }
  const override = devPreviewOverride();
  if (override) return Promise.resolve({ model: override, resolved: true });

  return new Promise((resolve) => {
    let settled = false;
    let timer: number | undefined;
    let unsubscribe: (() => void) | undefined;
    const finish = (resolved: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubscribe?.();
      resolve({ model: readPricingModel(), resolved });
    };
    // Fires immediately if flags are already loaded, so the common case adds no delay.
    // A failed `/flags` load invokes this with errorsLoading: true — that is not a
    // resolve, it is the same "we don't actually know the flag" state as a timeout.
    unsubscribe = phOnFeatureFlags((errorsLoading) => finish(!errorsLoading));
    timer = window.setTimeout(() => finish(false), timeoutMs);
  });
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
