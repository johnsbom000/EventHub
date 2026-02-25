const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const collectRatesFromRecord = (source: unknown): number[] => {
  if (!source || typeof source !== "object") return [];
  const rates: number[] = [];
  for (const value of Object.values(source as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const rate = toOptionalNumber((value as any).rate);
    if (rate != null) rates.push(rate);
  }
  return rates;
};

export function getListingDisplayPrice(listing: unknown): number | null {
  const listingAny = (listing && typeof listing === "object" ? listing : {}) as Record<string, any>;
  const listingData =
    listingAny.listingData && typeof listingAny.listingData === "object"
      ? (listingAny.listingData as Record<string, any>)
      : {};

  const candidates: number[] = [];

  const startingPrice = toOptionalNumber(listingAny.startingPrice);
  if (startingPrice != null) candidates.push(startingPrice);

  const pricingRate = toOptionalNumber(listingData?.pricing?.rate);
  if (pricingRate != null) candidates.push(pricingRate);

  const legacyRate = toOptionalNumber(listingData?.rate);
  if (legacyRate != null) candidates.push(legacyRate);

  candidates.push(...collectRatesFromRecord(listingData?.pricing?.pricingByPropType));
  candidates.push(...collectRatesFromRecord(listingData?.pricingByPropType));

  const topLevelOfferings = Array.isArray(listingAny.offerings) ? listingAny.offerings : [];
  for (const offering of topLevelOfferings) {
    const price = toOptionalNumber((offering as any)?.price);
    if (price != null) candidates.push(price);
  }

  const listingDataOfferings = Array.isArray(listingData.offerings) ? listingData.offerings : [];
  for (const offering of listingDataOfferings) {
    const price = toOptionalNumber((offering as any)?.price);
    if (price != null) candidates.push(price);
  }

  const positive = candidates.filter((value) => value > 0);
  if (positive.length === 0) return null;
  return Math.min(...positive);
}
