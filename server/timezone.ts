const DEFAULT_VENDOR_TIMEZONE = "UTC";

type IsoDateParts = {
  year: number;
  month: number;
  day: number;
};

type TimeParts = {
  hours: number;
  minutes: number;
};

type ZonedDateTimeParts = IsoDateParts &
  TimeParts & {
    seconds: number;
  };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getFormatter(timeZone: string) {
  const cacheKey = timeZone;
  const existing = formatterCache.get(cacheKey);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

function parseZonedPartsFromDate(date: Date, timeZone: string): ZonedDateTimeParts | null {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type === "literal") continue;
    values[part.type] = part.value;
  }

  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const rawHour = Number(values.hour);
  const minutes = Number(values.minute);
  const seconds = Number(values.second);
  const hours = rawHour === 24 ? 0 : rawHour;

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds)
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = parseZonedPartsFromDate(date, timeZone);
  if (!parts) return null;

  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hours,
    parts.minutes,
    parts.seconds,
    0
  );
  return utcTimestamp - date.getTime();
}

export function isValidIanaTimeZone(value: unknown): boolean {
  const timeZone = asTrimmedString(value);
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeIanaTimeZone(value: unknown, fallback?: string) {
  const candidate = asTrimmedString(value);
  if (candidate && isValidIanaTimeZone(candidate)) return candidate;

  const fallbackCandidate = asTrimmedString(fallback);
  if (fallbackCandidate && isValidIanaTimeZone(fallbackCandidate)) return fallbackCandidate;

  return DEFAULT_VENDOR_TIMEZONE;
}

export function parseIsoDateValue(value: string): IsoDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asTrimmedString(value));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

export function addDaysToIsoDate(dateValue: string, days: number) {
  const parsed = parseIsoDateValue(dateValue);
  if (!parsed || !Number.isFinite(days)) return null;
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0));
  next.setUTCDate(next.getUTCDate() + Math.round(days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate()
  ).padStart(2, "0")}`;
}

export function parseTimeValueToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(asTrimmedString(value));
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function zonedDateTimeToUtc(dateValue: string, minutesSinceMidnight: number, timeZone: string): Date | null {
  const parsedDate = parseIsoDateValue(dateValue);
  if (!parsedDate || !Number.isFinite(minutesSinceMidnight)) return null;

  const normalizedTimeZone = normalizeIanaTimeZone(timeZone);
  const hours = Math.floor(minutesSinceMidnight / 60);
  const minutes = minutesSinceMidnight % 60;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const utcGuess = new Date(Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day, hours, minutes, 0, 0));
  let offset = getTimeZoneOffsetMs(utcGuess, normalizedTimeZone);
  if (offset == null) return null;

  let candidate = new Date(utcGuess.getTime() - offset);
  for (let i = 0; i < 3; i += 1) {
    const nextOffset = getTimeZoneOffsetMs(candidate, normalizedTimeZone);
    if (nextOffset == null) return null;
    if (nextOffset === offset) break;
    offset = nextOffset;
    candidate = new Date(utcGuess.getTime() - offset);
  }

  const local = parseZonedPartsFromDate(candidate, normalizedTimeZone);
  if (!local) return null;
  if (
    local.year !== parsedDate.year ||
    local.month !== parsedDate.month ||
    local.day !== parsedDate.day ||
    local.hours !== hours ||
    local.minutes !== minutes
  ) {
    // Ambiguous/non-existent local wall time (DST edge) for this timezone.
    return null;
  }

  return candidate;
}

export function zonedDateStartToUtc(dateValue: string, timeZone: string) {
  return zonedDateTimeToUtc(dateValue, 0, timeZone);
}

export function formatDateInTimeZone(date: Date, timeZone: string) {
  const local = parseZonedPartsFromDate(date, normalizeIanaTimeZone(timeZone));
  if (!local) return null;
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
}

export function formatDateTimeInTimeZone(date: Date, timeZone: string) {
  const local = parseZonedPartsFromDate(date, normalizeIanaTimeZone(timeZone));
  if (!local) return null;
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(
    2,
    "0"
  )}T${String(local.hours).padStart(2, "0")}:${String(local.minutes).padStart(2, "0")}:${String(
    local.seconds
  ).padStart(2, "0")}`;
}

export function isLocalMidnight(date: Date, timeZone: string) {
  const local = parseZonedPartsFromDate(date, normalizeIanaTimeZone(timeZone));
  if (!local) return false;
  return local.hours === 0 && local.minutes === 0 && local.seconds === 0;
}
