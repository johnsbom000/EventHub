import type { ListingFormData, Offering, BusinessHours, Discount } from "@/features/vendor/create-listing/types";

export interface ListingPublic extends Pick<
  ListingFormData,
  | "serviceType"
  | "city"
  | "travelMode"
  | "serviceRadius"
  | "photos"
  | "serviceDescription"
  | "offerings"
  | "businessHours"
  | "discounts"
> {
  // DB-level identifiers (not part of the wizard form)
  id: string;         // listingId
  vendorId: string;   // vendorId
  vendorName?: string;

  // Optional computed fields for display (derived, not entered)
  coverPhoto?: string;      // first photo URL
  startingPrice?: number;   // min(offerings.price)
}
