// Shared shape for the AI-assisted listing draft feature.
//
// The AI reads a vendor's uploaded photos (plus the category/subcategory the
// vendor picked) and returns this partial draft. The frontend merges it into the
// CreateListingWizard's ListingDraft and drops the vendor on the review step —
// nothing here is authoritative, every field is editable before publishing.
//
// v1 scope: Rentals + Services only. Catering/Venues (two-level taxonomies) are
// deferred. The vendor supplies category + subcategory, so the model never picks
// the classification — it only fills the descriptive fields below.

export type AiListingPricingUnit = "per_day" | "per_hour";

export interface AiListingDraftResult {
  /** Short, specific, appealing title (no emojis). */
  title: string;
  /** 2–4 sentence, benefit-focused description. */
  description: string;
  /** Concrete items included, visible or standard for the subcategory. */
  whatsIncluded: string[];
  /** Things explicitly NOT included (may be empty). */
  whatsNotIncluded: string[];
  /** 3–8 short search keywords. */
  tags: string[];
  /** Events this is a good fit for — constrained to the known popular-for list. */
  popularFor: string[];
  /**
   * Rough starting price ESTIMATE in cents, or null when it can't be reasonably
   * inferred. Always surfaced to the vendor as an editable estimate, never final.
   */
  suggestedPriceCents: number | null;
  pricingUnit: AiListingPricingUnit;
}

/** One generated package tier for a package_container listing. */
export interface AiListingPackage {
  /** Tier name (Platinum / Gold / Silver …). */
  name: string;
  description: string;
  whatsIncluded: string[];
  whatsNotIncluded: string[];
  /** Rough per-tier price ESTIMATE in cents, or null. Higher tier → higher price. */
  suggestedPriceCents: number | null;
  pricingUnit: AiListingPricingUnit;
}

/** Request body for POST /api/vendor/ai/draft-listing. */
export interface AiListingDraftRequest {
  category: string;
  subcategory: string;
  subcategoryDetail?: string | null;
  /** Public storage URLs (or dev /uploads paths) from /api/uploads/listing-photo. */
  photoUrls: string[];
  /**
   * For package_container listings: how many tiered packages to generate (1–5).
   * Omit / 0 for single or add-on listings.
   */
  packageCount?: number;
}

/** Response body for POST /api/vendor/ai/draft-listing. */
export interface AiListingDraftResponse {
  draft: AiListingDraftResult;
  category: string;
  subcategory: string;
  subcategoryDetail: string | null;
  /** Generated package tiers (empty unless packageCount was requested). */
  packages: AiListingPackage[];
}
