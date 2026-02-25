export function getListingRentalTypes(listingData: any): string[] {
  const directRentalTypes = Array.isArray(listingData?.rentalTypes)
    ? listingData.rentalTypes
    : Array.isArray(listingData?.rentalTypes?.selected)
      ? listingData.rentalTypes.selected
      : null;

  const legacyPropTypes = Array.isArray(listingData?.propTypes)
    ? listingData.propTypes
    : Array.isArray(listingData?.propTypes?.selected)
      ? listingData.propTypes.selected
      : null;

  const source: unknown[] = directRentalTypes ?? legacyPropTypes ?? [];

  return source
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function getFirstListingRentalType(listingData: any): string | null {
  const rentalTypes = getListingRentalTypes(listingData);
  return rentalTypes.length > 0 ? rentalTypes[0] : null;
}
