import { useEffect, useState } from "react";
import { phFeatureFlag, phOnFeatureFlags } from "@/lib/posthog";
import { PAYWALL_VARIANTS, type PaywallVariantKey } from "@/components/paywalls/PaywallVariants";

const FLAG_KEY = "paywall-variant-test";
const DEFAULT: PaywallVariantKey = "1a";

function coerce(value: unknown): PaywallVariantKey {
  return typeof value === "string" && PAYWALL_VARIANTS.includes(value as PaywallVariantKey)
    ? (value as PaywallVariantKey)
    : DEFAULT;
}

/**
 * Resolve which paywall variant (1a–1e) to show for this vendor from the PostHog
 * multivariate flag `paywall-variant-test`. PostHog hashes each flag independently
 * (distinct_id + flag key), so this assignment is statistically uncorrelated with
 * the landing-page variant — the orthogonal split we want.
 *
 * Flags load asynchronously after init, so we read the current value AND subscribe
 * to onFeatureFlags to pick up the resolved value for first-time visitors. Falls
 * back to 1a when PostHog is disabled (e.g. local dev without a key).
 */
export function usePaywallVariant(): PaywallVariantKey {
  const [variant, setVariant] = useState<PaywallVariantKey>(() => coerce(phFeatureFlag(FLAG_KEY)));

  useEffect(() => {
    // Re-read now (flags may have resolved between initial state and mount)…
    setVariant(coerce(phFeatureFlag(FLAG_KEY)));
    // …and again whenever PostHog reports flags changed/loaded.
    const unsub = phOnFeatureFlags(() => setVariant(coerce(phFeatureFlag(FLAG_KEY))));
    return unsub;
  }, []);

  return variant;
}
