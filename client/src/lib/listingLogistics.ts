// Single source of truth for how a listing's travel/delivery logistics draft is
// persisted to listingData. Both the create wizard and the edit page build their
// save payloads through here so the two writers cannot drift (a category-blind
// edit-page payload once wiped Service listings' travel config on every save).
//
// The fee model is unified: Service (travel) and Rental/Catering (delivery) both
// persist to the travel_* fields; the category only decides which draft toggle
// drives "offered" and which label the UI shows. Categories with neither section
// (e.g. Venue) always persist the logistics fields as off — matching the wizard,
// which never shows them the toggles.

export type UnifiedFeeType = "flat" | "variable";

export function isTravelCategory(category: string | null | undefined): boolean {
  return category === "Service";
}

export function isDeliveryCategory(category: string | null | undefined): boolean {
  return category === "Rental" || category === "Catering";
}

export interface ListingLogisticsDraft {
  category: string | null | undefined;
  servesOutsideRadius: boolean;
  /** Service draft toggle: vendor travels to the customer's location. */
  travelOffered: boolean;
  /** Rental/Catering draft toggle: vendor delivers. */
  deliveryIncluded: boolean;
  feeEnabled: boolean;
  feeType: UnifiedFeeType;
  feeAmountCents: number | null;
}

export function buildListingLogisticsPayload(draft: ListingLogisticsDraft) {
  const travel = isTravelCategory(draft.category);
  const delivery = isDeliveryCategory(draft.category);
  const offered = travel ? draft.travelOffered : delivery ? draft.deliveryIncluded : false;
  const feeEnabled = offered && draft.feeEnabled;
  const flatFeeCents =
    feeEnabled && draft.feeType === "flat" && draft.feeAmountCents != null
      ? draft.feeAmountCents
      : null;

  return {
    servesOutsideRadius: travel || delivery ? draft.servesOutsideRadius : false,
    travelOffered: offered,
    travelFeeEnabled: feeEnabled,
    travelFeeType: feeEnabled ? draft.feeType : null,
    travelFeeAmount: flatFeeCents != null ? flatFeeCents / 100 : null,
    travelFeeAmountCents: flatFeeCents,

    // Delivery flags keep their pickup/delivery semantics; the fee itself lives in
    // the unified travel_fee_* fields above (delivery_fee_* is not a fee source).
    deliveryIncluded: delivery ? draft.deliveryIncluded : false,
    deliveryOffered: delivery ? draft.deliveryIncluded : false,
    pickupOffered: delivery,
    deliveryFeeEnabled: false,
    deliveryFeeAmount: null,
    deliveryFeeAmountCents: null,
  };
}
