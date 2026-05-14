/**
 * Resolves an IANA timezone string (e.g. "America/Chicago") from a lat/lng
 * coordinate pair using the geo-tz shapefile database.
 *
 * Returns "UTC" if coords are invalid or the lookup fails.
 */
export function timezoneFromCoords(lat: number, lng: number): string {
  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "UTC";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { find } = require("geo-tz") as { find: (lat: number, lng: number) => string[] };
    const zones = find(lat, lng);
    return (Array.isArray(zones) && zones[0]) ? zones[0] : "UTC";
  } catch {
    return "UTC";
  }
}
