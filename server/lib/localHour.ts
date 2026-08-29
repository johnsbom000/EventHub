/**
 * "What time is it where this vendor is?" — the gate on when a scheduled email
 * actually lands.
 *
 * Deliberately in its own module with NO imports. server/jobs/publishNudge.ts
 * pulls in ../db, which throws unless DATABASE_URL is set; keeping this logic
 * dependency-free is what makes it directly testable under plain node (same
 * reason client/src/lib/accountAge.ts stands alone).
 */

/**
 * Used when a vendor has no usable timezone: no profile row yet, or the
 * `operating_timezone` column still holding its 'UTC' default.
 *
 * 'UTC' is treated as absent rather than honoured, because it is the column
 * default rather than a real signal, and 08:00 UTC is the middle of the night
 * everywhere in the US. Falling back to Mountain puts those vendors between
 * 7am and 10am local across the US mainland — wrong for nobody, badly wrong
 * for no one.
 */
export const FALLBACK_TIMEZONE = "America/Denver";

/**
 * The local hour (0–23) in `timeZone` at `now`, or null if the zone is unusable.
 *
 * Intl is the only timezone maths here — no offset arithmetic — so DST and
 * zones that don't observe it (Arizona) are handled by the platform rather
 * than by us.
 */
export function localHourIn(timeZone: string, now: Date = new Date()): number | null {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const hour = Number(formatted);
    if (!Number.isFinite(hour)) return null;
    // Some ICU builds render midnight as 24 under hour12:false.
    return hour === 24 ? 0 : hour;
  } catch {
    // Invalid IANA name — the stored value is junk.
    return null;
  }
}

/**
 * Resolve the timezone to actually use for a vendor, collapsing the unusable
 * cases (absent, the 'UTC' default, or an invalid name) onto the fallback.
 */
export function effectiveTimezone(stored: string | null | undefined): string {
  const tz = stored?.trim();
  if (!tz || tz.toUpperCase() === "UTC") return FALLBACK_TIMEZONE;
  return localHourIn(tz) === null ? FALLBACK_TIMEZONE : tz;
}
