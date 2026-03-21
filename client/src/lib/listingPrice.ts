const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeUnit = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

export function getListingDisplayPrice(listing: unknown): number | null {
  const listingAny = (listing && typeof listing === "object" ? listing : {}) as Record<string, any>;
  const listingData =
    listingAny.listingData && typeof listingAny.listingData === "object"
      ? (listingAny.listingData as Record<string, any>)
      : {};

  const candidates: number[] = [];

  const canonicalPriceCents = toOptionalNumber(listingAny.priceCents);
  if (canonicalPriceCents != null && canonicalPriceCents > 0) {
    candidates.push(canonicalPriceCents / 100);
  }

  const canonicalPrice = toOptionalNumber(listingAny.price);
  if (canonicalPrice != null) candidates.push(canonicalPrice);

  const startingPrice = toOptionalNumber(listingAny.startingPrice);
  if (startingPrice != null) candidates.push(startingPrice);

  const mirroredPriceCents = toOptionalNumber(listingData?.priceCents);
  if (mirroredPriceCents != null && mirroredPriceCents > 0) candidates.push(mirroredPriceCents / 100);
  const mirroredPrice = toOptionalNumber(listingData?.price);
  if (mirroredPrice != null) candidates.push(mirroredPrice);
  const legacyRate = toOptionalNumber(listingData?.rate);
  if (legacyRate != null) candidates.push(legacyRate);

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

export function getListingDisplayPricingUnit(listing: unknown): string | null {
  const listingAny = (listing && typeof listing === "object" ? listing : {}) as Record<string, any>;
  const listingData =
    listingAny.listingData && typeof listingAny.listingData === "object"
      ? (listingAny.listingData as Record<string, any>)
      : {};

  return (
    normalizeUnit(listingAny?.pricingUnit) ??
    normalizeUnit(listingAny?.pricing?.unit) ??
    normalizeUnit(listingData?.pricingUnit) ??
    null
  );
}
