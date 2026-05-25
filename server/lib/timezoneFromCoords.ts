import { find as geoTzFind } from "geo-tz";

/**
 * Resolves an IANA timezone string (e.g. "America/Chicago") from a lat/lng
 * coordinate pair using the geo-tz shapefile database.
 *
 * Returns null if coords are invalid or the lookup fails, so callers can
 * distinguish a genuine failure from a location that is actually in UTC.
 */
export function timezoneFromCoords(lat: number, lng: number): string | null {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const zones = geoTzFind(lat, lng);
    return (Array.isArray(zones) && zones[0]) ? zones[0] : null;
  } catch {
    return null;
  }
}
