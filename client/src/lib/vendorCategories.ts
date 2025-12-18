export const VENDOR_CATEGORIES = [
  "Venue",
  "Photographer",
  "Videographer",
  "DJ",
  "Catering",
  "Florist",
  "Baker/Desserts",
  "Hair & Makeup",
  "Decor Rental",
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];
