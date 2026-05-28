// Shared types and constants for the CreateListingWizard and its step components.

import type { ListingPhotoCrop } from "@/components/listings/InlinePhotoEditor";
import { DEFAULT_COVER_RATIO, type CoverRatio } from "@/lib/listingPhotos";
import type { LocationResult } from "@/types/location";

// ── Listing type (for the pre-wizard type-selection screen) ───────────────────
export type ListingType = "single" | "package_container" | "addon";

// ── Wizard step IDs ───────────────────────────────────────────────────────────
export type StepId =
  | "basics"
  | "perfectFor"
  | "packages"
  | "bookingPricing"
  | "serviceArea"
  | "logistics"
  | "media"
  | "attachAddons";

export type ListingCategory = "Rental" | "Venue" | "Service" | "Catering";
export type PricingUnit = "per_day" | "per_hour";
export type BookingType = "instant" | "request";
export type TravelFeeType = "flat" | "per_mile" | "per_hour";
export type CancellationPolicy = "cancel_anytime" | "cancel_within_hours" | "no_cancellations";
export type DimensionUnit = "inches" | "feet" | "meters" | "centimeters";

export type ListingTag = { label: string; slug: string };

// ── The draft object shared across all wizard steps ───────────────────────────
export type ListingDraft = {
  category: ListingCategory | "";
  subcategory: string;
  subcategoryDetail: string;
  listingTitle: string;
  listingDescription: string;
  whatsIncluded: string[];
  whatsNotIncluded: string[];
  tagsByPropType: Record<string, ListingTag[]>;
  popularFor: string[];

  bookingType: BookingType;
  pricingUnit: PricingUnit;
  rate: string;
  quantity: string;
  dimensionUnit: DimensionUnit;
  dimensionWidth: string;
  dimensionLength: string;
  dimensionHeight: string;

  serviceAreaMode: "radius";
  serviceRadiusMiles: number;
  serviceLocation: LocationResult | null;
  serviceCenter: { lat: number; lng: number } | null;
  serviceStreetAddress: string;
  serviceCity: string;
  serviceState: string;
  serviceZip: string;

  travelOffered: boolean;
  travelFeeEnabled: boolean;
  travelFeeType: TravelFeeType;
  travelFeeAmount: string;

  deliveryIncluded: boolean;
  deliveryFeeEnabled: boolean;
  deliveryFeeAmount: string;

  setupIncluded: boolean;
  setupFeeEnabled: boolean;
  setupFeeAmount: string;
  takedownIncluded: boolean;
  takedownFeeEnabled: boolean;
  takedownFeeAmount: string;

  cancellationPolicy: CancellationPolicy;
  cancellationPolicyHours: string;

  securityDepositEnabled: boolean;
  securityDepositAmount: string;

  photoPreviews: string[];
  photoNames: string[];
  coverPhotoRatio: CoverRatio;
  photoCropsByName: Record<string, ListingPhotoCrop>;

  videoNames: string[];
};

export const DEFAULT_DRAFT: ListingDraft = {
  category: "",
  subcategory: "",
  subcategoryDetail: "",
  listingTitle: "",
  listingDescription: "",
  whatsIncluded: [],
  whatsNotIncluded: [],
  tagsByPropType: {},
  popularFor: [],

  bookingType: "instant",
  pricingUnit: "per_day",
  rate: "",
  quantity: "1",
  dimensionUnit: "inches",
  dimensionWidth: "",
  dimensionLength: "",
  dimensionHeight: "",

  serviceAreaMode: "radius",
  serviceRadiusMiles: 30,
  serviceLocation: null,
  serviceCenter: null,
  serviceStreetAddress: "",
  serviceCity: "",
  serviceState: "",
  serviceZip: "",

  travelOffered: false,
  travelFeeEnabled: false,
  travelFeeType: "flat",
  travelFeeAmount: "",

  deliveryIncluded: false,
  deliveryFeeEnabled: false,
  deliveryFeeAmount: "",

  setupIncluded: false,
  setupFeeEnabled: false,
  setupFeeAmount: "",
  takedownIncluded: false,
  takedownFeeEnabled: false,
  takedownFeeAmount: "",

  cancellationPolicy: "cancel_anytime",
  cancellationPolicyHours: "48",

  securityDepositEnabled: false,
  securityDepositAmount: "",

  photoPreviews: [],
  photoNames: [],
  coverPhotoRatio: DEFAULT_COVER_RATIO,
  photoCropsByName: {},

  videoNames: [],
};

export const CATEGORY_OPTIONS = [
  { value: "Catering" as ListingCategory, label: "Caterer" },
  { value: "Rental" as ListingCategory, label: "Rental" },
  { value: "Service" as ListingCategory, label: "Service" },
  { value: "Venue" as ListingCategory, label: "Venue" },
] as const;

export const LISTING_TAG_KEY = "__listing__";
export const MIN_PHOTOS_FOR_PUBLISH = 3;
export const DESCRIPTION_MAX_CHARS = 1000;
export const CREATE_LISTING_STORAGE_KEY = "createListingWizard:v1";
export const TEMP_UPLOADING_PHOTO_PREFIX = "__uploading__-";

/** Steps for single listings and add-on listings (same flow). */
const SINGLE_STEPS: Array<{ id: StepId; title: string }> = [
  { id: "basics", title: "Listing Basics" },
  { id: "perfectFor", title: "Perfect For" },
  { id: "bookingPricing", title: "Booking & Pricing" },
  { id: "serviceArea", title: "Service Area" },
  { id: "logistics", title: "Logistics" },
  { id: "media", title: "Photos" },
  { id: "attachAddons", title: "Attach Add-ons" },
];

/**
 * Steps for package_container listings.
 *
 * Phase 1 — Listing-level details (shared across all packages, defines the card):
 *   basics → perfectFor → serviceArea → media
 *
 * Phase 2 — Per-package details (each package has its own price, inclusions, logistics):
 *   packages
 *
 * Phase 3 — Finish:
 *   attachAddons
 *
 * Logistics and cancellation policy are collected inside the packages step per
 * package — they do NOT appear as a top-level step for package_container listings.
 */
const PACKAGE_STEPS: Array<{ id: StepId; title: string }> = [
  { id: "basics",       title: "Listing Basics" },
  { id: "perfectFor",   title: "Perfect For" },
  { id: "serviceArea",  title: "Service Area" },
  { id: "media",        title: "Photos" },
  { id: "packages",     title: "Define Packages" },
  { id: "attachAddons", title: "Attach Add-ons" },
];

export function getStepsForListingType(listingType: ListingType | null): Array<{ id: StepId; title: string }> {
  if (listingType === "package_container") return PACKAGE_STEPS;
  // Add-on listings can't have other add-ons attached to them
  if (listingType === "addon") return SINGLE_STEPS.filter((s) => s.id !== "attachAddons");
  return SINGLE_STEPS;
}

/** @deprecated Use getStepsForListingType instead. Kept for backward compat. */
export const STEPS = SINGLE_STEPS;

export const POPULAR_FOR_EMOJI: Record<string, string> = {
  Weddings: "💍",
  Corporate: "🏢",
  "Baby Showers": "🍼",
  Photoshoots: "📸",
  Birthdays: "🎂",
  "Bridal Showers": "👰",
  Graduations: "🎓",
  "Holiday Parties": "🎉",
  Concert: "🎵",
  Proposal: "💐",
  "Bachelor Party": "🍻",
  "Bachelorette Party": "💃",
  Anniversary: "❤️",
  "Gender Reveal": "🎈",
  Quinceañera: "👑",
  Baptism: "🙏",
  Funeral: "🕊️",
  Reunion: "🤝",
  Conference: "🗂️",
  Sporting: "🏅",
  "School Dance": "🪩",
  Other: "✨",
};

export const DIMENSION_UNIT_OPTIONS: Array<{ value: DimensionUnit; label: string }> = [
  { value: "inches", label: "Inches" },
  { value: "feet", label: "Feet" },
  { value: "meters", label: "Meters" },
  { value: "centimeters", label: "Centimeters" },
];
