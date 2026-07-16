// Client-side mirror of the server's service-radius geometry
// (server/lib/routeUtils.ts). Kept in sync so checkout can show the right fee /
// block state before the customer submits; the server remains authoritative.

export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true when the event coordinates fall outside the listing's service radius.
 * Returns false (permissive) when the center, radius, or event coordinates are missing
 * or the radius is not positive — matching the server helper.
 */
export function isEventOutsideServiceRadius(params: {
  listingCenterLat: number | null | undefined;
  listingCenterLng: number | null | undefined;
  serviceRadiusMiles: number | null | undefined;
  eventLat: number | null | undefined;
  eventLng: number | null | undefined;
}): boolean {
  const { listingCenterLat, listingCenterLng, serviceRadiusMiles, eventLat, eventLng } = params;
  if (
    listingCenterLat == null ||
    listingCenterLng == null ||
    serviceRadiusMiles == null ||
    serviceRadiusMiles <= 0 ||
    eventLat == null ||
    eventLng == null
  ) {
    return false;
  }
  return haversineDistanceMiles(listingCenterLat, listingCenterLng, eventLat, eventLng) > serviceRadiusMiles;
}
