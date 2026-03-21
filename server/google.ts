import { eq, sql as drizzleSql } from "drizzle-orm";

import { bookings, vendorAccounts } from "@shared/schema";

import { db } from "./db";
import {
  addDaysToIsoDate,
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
  isLocalMidnight,
  normalizeIanaTimeZone,
  parseTimeValueToMinutes,
  zonedDateTimeToUtc,
} from "./timezone";

const GOOGLE_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

type VendorGoogleConnection = {
  id: string;
  email: string;
  businessName: string;
  googleAccessToken: string | null;
  googleRefreshToken: string | null;
  googleTokenExpiresAt: Date | null;
  googleCalendarId: string | null;
  googleConnectionStatus: string;
};

type GoogleRefreshTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    primary?: boolean;
    accessRole?: string;
    backgroundColor?: string;
  }>;
};

type GoogleCalendarEventListResponse = {
  items?: GoogleCalendarEventItem[];
};

type GoogleCalendarEventItem = {
  id?: string;
  summary?: string;
  description?: string;
  status?: string;
  updated?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  extendedProperties?: {
    private?: Record<string, unknown>;
    shared?: Record<string, unknown>;
  };
};

type GoogleCalendarResponse = {
  id?: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
};

type GoogleCalendarEventResponse = {
  id?: string;
};

type BookingGoogleSyncRecord = {
  id: string;
  vendorAccountId: string | null;
  vendorTimezone: string | null;
  status: string | null;
  eventDate: string | null;
  eventStartTime: string | null;
  bookingStartAt: Date | null;
  bookingEndAt: Date | null;
  eventLocation: string | null;
  specialRequests: string | null;
  googleEventId: string | null;
  googleCalendarId: string | null;
  itemTitle: string | null;
  listingId: string | null;
  vendorBusinessName: string | null;
};

type GoogleCalendarEventPayload = {
  summary: string;
  description: string;
  location?: string;
  start: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  extendedProperties: {
    private: Record<string, string>;
  };
};

type BookingGoogleSyncResult =
  | { status: "skipped"; reason: string }
  | { status: "synced"; googleEventId: string; googleCalendarId: string }
  | { status: "cancelled"; googleCalendarId: string | null }
  | { status: "failed"; error: string; errorCode?: string };

export type NormalizedGoogleCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string | null;
  backgroundColor: string | null;
};

export type NormalizedGoogleCalendarEvent = {
  id: string;
  summary: string | null;
  description: string | null;
  status: string | null;
  start: {
    date: string | null;
    dateTime: string | null;
    timeZone: string | null;
  };
  end: {
    date: string | null;
    dateTime: string | null;
    timeZone: string | null;
  };
  updated: string | null;
  extendedProperties: {
    private: Record<string, string>;
    shared: Record<string, string>;
  };
  startAt: Date | null;
  endAt: Date | null;
  isAllDay: boolean;
};

export type SyncEventHubBookingOptions = {
  bookingId: string;
  targetCalendarId?: string | null;
};

export class GoogleCalendarConnectionError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, options?: { statusCode?: number; code?: string }) {
    super(message);
    this.name = "GoogleCalendarConnectionError";
    this.statusCode = options?.statusCode ?? 400;
    this.code = options?.code ?? "google_calendar_error";
  }
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractRows<T>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function isGoogleAccessTokenExpired(expiresAt: Date | null) {
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() <= Date.now() + GOOGLE_TOKEN_REFRESH_BUFFER_MS;
}

function buildGoogleAuthorizedHeaders(
  accessToken: string,
  headers?: HeadersInit
): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("Authorization", `Bearer ${accessToken}`);
  return nextHeaders;
}

function normalizeGoogleCalendar(
  calendar: GoogleCalendarResponse | null | undefined
): NormalizedGoogleCalendar | null {
  const id = asTrimmedString(calendar?.id);
  if (!id) return null;

  return {
    id,
    summary: asTrimmedString(calendar?.summary) || "Untitled calendar",
    primary: Boolean(calendar?.primary),
    accessRole: asTrimmedString(calendar?.accessRole),
    backgroundColor: asTrimmedString(calendar?.backgroundColor),
  };
}

function normalizeGoogleEventProperties(properties: Record<string, unknown> | null | undefined) {
  const normalized: Record<string, string> = {};
  if (!properties || typeof properties !== "object") {
    return normalized;
  }

  for (const [key, value] of Object.entries(properties)) {
    const nextKey = asTrimmedString(key);
    const nextValue = asTrimmedString(value);
    if (!nextKey || !nextValue) continue;
    normalized[nextKey] = nextValue;
  }

  return normalized;
}

function parseGoogleCalendarEventBoundary(
  boundary: { date?: string; dateTime?: string; timeZone?: string } | null | undefined
) {
  const date = asTrimmedString(boundary?.date);
  const dateTime = asTrimmedString(boundary?.dateTime);
  const timeZone = asTrimmedString(boundary?.timeZone);

  if (dateTime) {
    const parsed = new Date(dateTime);
    return {
      date,
      dateTime,
      timeZone,
      at: isValidDate(parsed) ? parsed : null,
      isAllDay: false,
    };
  }

  if (date) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return {
      date,
      dateTime: null,
      timeZone,
      at: isValidDate(parsed) ? parsed : null,
      isAllDay: true,
    };
  }

  return {
    date: null,
    dateTime: null,
    timeZone,
    at: null,
    isAllDay: false,
  };
}

function normalizeGoogleCalendarEvent(
  event: GoogleCalendarEventItem
): NormalizedGoogleCalendarEvent | null {
  const id = asTrimmedString(event?.id);
  if (!id) return null;

  const normalizedStart = parseGoogleCalendarEventBoundary(event?.start);
  const normalizedEnd = parseGoogleCalendarEventBoundary(event?.end);
  const isAllDay = normalizedStart.isAllDay || normalizedEnd.isAllDay;
  const startAt = normalizedStart.at;
  let endAt = normalizedEnd.at;

  if (isAllDay && normalizedStart.date && !endAt) {
    const parsedStart = new Date(`${normalizedStart.date}T00:00:00.000Z`);
    if (isValidDate(parsedStart)) {
      const nextDay = new Date(parsedStart.getTime());
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      endAt = nextDay;
    }
  }

  return {
    id,
    summary: asTrimmedString(event?.summary),
    description: asTrimmedString(event?.description),
    status: asTrimmedString(event?.status),
    start: {
      date: normalizedStart.date,
      dateTime: normalizedStart.dateTime,
      timeZone: normalizedStart.timeZone,
    },
    end: {
      date: normalizedEnd.date,
      dateTime: normalizedEnd.dateTime,
      timeZone: normalizedEnd.timeZone,
    },
    updated: asTrimmedString(event?.updated),
    extendedProperties: {
      private: normalizeGoogleEventProperties(event?.extendedProperties?.private),
      shared: normalizeGoogleEventProperties(event?.extendedProperties?.shared),
    },
    startAt,
    endAt,
    isAllDay,
  };
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function getRecordVendorTimeZone(record: BookingGoogleSyncRecord) {
  return normalizeIanaTimeZone(record.vendorTimezone);
}

function getLegacyBookingTimeLabels(eventDate: string | null, eventStartTime: string | null) {
  const date = asTrimmedString(eventDate);
  const time = asTrimmedString(eventStartTime);

  if (!date) {
    return {
      startLabel: "TBD",
      endLabel: "TBD",
    };
  }

  if (!time) {
    const nextDate = addDaysToIsoDate(date, 1);
    return {
      startLabel: `${date} (all day)`,
      endLabel: `${nextDate || "TBD"} (all day end)`,
    };
  }

  const startMinutes = parseTimeValueToMinutes(time);
  if (startMinutes == null) {
    return {
      startLabel: `${date} ${time}`,
      endLabel: "TBD",
    };
  }
  const startDateTime = zonedDateTimeToUtc(date, startMinutes, "UTC");
  const endDateTime = startDateTime ? new Date(startDateTime.getTime() + 60 * 60 * 1000) : null;
  const endLabel = endDateTime ? formatDateTimeInTimeZone(endDateTime, "UTC") : null;
  return {
    startLabel: `${date} ${time}`,
    endLabel: endLabel ? endLabel.replace("T", " ") : "TBD",
  };
}

function isWholeDayBookingRange(startAt: Date, endAt: Date, timeZone: string) {
  if (endAt.getTime() <= startAt.getTime()) return false;
  if (!isLocalMidnight(startAt, timeZone) || !isLocalMidnight(endAt, timeZone)) return false;
  const startDate = formatDateInTimeZone(startAt, timeZone);
  const endDate = formatDateInTimeZone(endAt, timeZone);
  return Boolean(startDate && endDate && endDate > startDate);
}

function formatCanonicalBookingLabel(value: Date, timeZone: string) {
  const local = formatDateTimeInTimeZone(value, timeZone);
  return local ? local.replace("T", " ") : value.toISOString().slice(0, 16).replace("T", " ");
}

function getBookingTimeLabels(record: BookingGoogleSyncRecord) {
  const timeZone = getRecordVendorTimeZone(record);
  if (isValidDate(record.bookingStartAt) && isValidDate(record.bookingEndAt)) {
    if (isWholeDayBookingRange(record.bookingStartAt, record.bookingEndAt, timeZone)) {
      const startDate = formatDateInTimeZone(record.bookingStartAt, timeZone);
      const endDate = formatDateInTimeZone(record.bookingEndAt, timeZone);
      return {
        startLabel: `${startDate || "TBD"} (all day)`,
        endLabel: `${endDate || "TBD"} (all day end)`,
      };
    }

    return {
      startLabel: formatCanonicalBookingLabel(record.bookingStartAt, timeZone),
      endLabel: formatCanonicalBookingLabel(record.bookingEndAt, timeZone),
    };
  }

  return getLegacyBookingTimeLabels(record.eventDate, record.eventStartTime);
}

function buildGoogleBookingDescription(record: BookingGoogleSyncRecord) {
  const timing = getBookingTimeLabels(record);
  const vendorTimeZone = getRecordVendorTimeZone(record);
  const lines = [
    "EventHub booking",
    `Booking ID: ${record.id}`,
    `Listing ID: ${asTrimmedString(record.listingId) || "unknown"}`,
    `Vendor Account ID: ${asTrimmedString(record.vendorAccountId) || "unknown"}`,
    `Listing: ${asTrimmedString(record.itemTitle) || "Listing"}`,
    `Start: ${timing.startLabel}`,
    `End: ${timing.endLabel}`,
    `Timezone: ${vendorTimeZone}`,
    `Status: ${asTrimmedString(record.status) || "pending"}`,
  ];

  const location = asTrimmedString(record.eventLocation);
  if (location) {
    lines.push(`Location: ${location}`);
  }

  const specialRequests = asTrimmedString(record.specialRequests);
  if (specialRequests) {
    lines.push(`Notes: ${specialRequests}`);
  }

  return lines.join("\n");
}

function buildGoogleBookingSummary(record: BookingGoogleSyncRecord) {
  const listingTitle = asTrimmedString(record.itemTitle) || "Listing";
  return `EventHub Booking - ${listingTitle}`;
}

function buildGoogleBookingEventTimes(
  record: BookingGoogleSyncRecord
): Pick<GoogleCalendarEventPayload, "start" | "end"> {
  const timeZone = getRecordVendorTimeZone(record);

  if (isValidDate(record.bookingStartAt) && isValidDate(record.bookingEndAt)) {
    if (record.bookingEndAt.getTime() <= record.bookingStartAt.getTime()) {
      throw new GoogleCalendarConnectionError("Canonical booking time range is invalid", {
        statusCode: 400,
        code: "booking_time_range_invalid",
      });
    }

    if (isWholeDayBookingRange(record.bookingStartAt, record.bookingEndAt, timeZone)) {
      const startDate = formatDateInTimeZone(record.bookingStartAt, timeZone);
      const endDate = formatDateInTimeZone(record.bookingEndAt, timeZone);
      if (!startDate || !endDate) {
        throw new GoogleCalendarConnectionError("Canonical booking date range could not be converted to vendor timezone", {
          statusCode: 400,
          code: "booking_timezone_conversion_failed",
        });
      }
      return {
        start: { date: startDate },
        end: { date: endDate },
      };
    }

    const startDateTime = formatDateTimeInTimeZone(record.bookingStartAt, timeZone);
    const endDateTime = formatDateTimeInTimeZone(record.bookingEndAt, timeZone);
    if (!startDateTime || !endDateTime) {
      throw new GoogleCalendarConnectionError("Canonical booking time range could not be converted to vendor timezone", {
        statusCode: 400,
        code: "booking_timezone_conversion_failed",
      });
    }

    return {
      start: {
        dateTime: startDateTime,
        timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone,
      },
    };
  }

  const eventDate = record.eventDate;
  const eventStartTime = record.eventStartTime;
  const date = asTrimmedString(eventDate);
  const time = asTrimmedString(eventStartTime);

  if (!date) {
    throw new GoogleCalendarConnectionError("Booking is missing an event date", {
      statusCode: 400,
      code: "booking_event_date_missing",
    });
  }

  if (!time) {
    const nextDate = addDaysToIsoDate(date, 1);
    if (!nextDate) {
      throw new GoogleCalendarConnectionError("Booking event date is invalid", {
        statusCode: 400,
        code: "booking_event_date_invalid",
      });
    }
    return {
      start: { date },
      end: { date: nextDate },
    };
  }

  const startMinutes = parseTimeValueToMinutes(time);
  if (startMinutes == null) {
    throw new GoogleCalendarConnectionError("Booking event date or time is invalid", {
      statusCode: 400,
      code: "booking_event_datetime_invalid",
    });
  }
  const startDateTimeUtc = zonedDateTimeToUtc(date, startMinutes, timeZone);
  if (!startDateTimeUtc) {
    throw new GoogleCalendarConnectionError("Booking event date or time is invalid for vendor timezone", {
      statusCode: 400,
      code: "booking_event_datetime_timezone_invalid",
    });
  }
  const endDateTimeUtc = new Date(startDateTimeUtc.getTime() + 60 * 60 * 1000);
  const startDateTime = formatDateTimeInTimeZone(startDateTimeUtc, timeZone);
  const endDateTime = formatDateTimeInTimeZone(endDateTimeUtc, timeZone);
  if (!startDateTime || !endDateTime) {
    throw new GoogleCalendarConnectionError("Booking event date or time could not be converted for Google sync", {
      statusCode: 400,
      code: "booking_event_datetime_conversion_failed",
    });
  }

  return {
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
  };
}

function buildGoogleBookingEventPayload(record: BookingGoogleSyncRecord): GoogleCalendarEventPayload {
  const times = buildGoogleBookingEventTimes(record);
  const location = asTrimmedString(record.eventLocation);

  return {
    summary: buildGoogleBookingSummary(record),
    description: buildGoogleBookingDescription(record),
    ...(location ? { location } : {}),
    ...times,
    extendedProperties: {
      private: {
        eventHubBookingId: record.id,
        eventHubListingId: asTrimmedString(record.listingId) || "",
        eventHubVendorAccountId: asTrimmedString(record.vendorAccountId) || "",
        eventHubVendorTimeZone: getRecordVendorTimeZone(record),
      },
    },
  };
}

async function loadBookingGoogleSyncRecord(
  bookingId: string
): Promise<BookingGoogleSyncRecord | null> {
  // Legacy compatibility: fallback listing/account ownership only for rows missing canonical booking linkage.
  const result: any = await db.execute(drizzleSql`
    select
      b.id,
      coalesce(b.vendor_account_id, listing_owner.account_id, legacy_listing.account_id) as "vendorAccountId",
      coalesce(
        nullif(trim(b.vendor_timezone_snapshot), ''),
        nullif(trim(listing_profile.operating_timezone), ''),
        nullif(trim(legacy_listing_profile.operating_timezone), ''),
        'UTC'
      ) as "vendorTimezone",
      b.status,
      b.event_date as "eventDate",
      b.event_start_time as "eventStartTime",
      b.booking_start_at as "bookingStartAt",
      b.booking_end_at as "bookingEndAt",
      b.event_location as "eventLocation",
      b.special_requests as "specialRequests",
      b.google_event_id as "googleEventId",
      b.google_calendar_id as "googleCalendarId",
      coalesce(
        nullif(trim(b.listing_title_snapshot), ''),
        nullif(trim(legacy_item.title), ''),
        nullif(trim(listing_owner.title), ''),
        nullif(trim(legacy_listing.title), '')
      ) as "itemTitle",
      coalesce(b.listing_id, legacy_item.listing_id) as "listingId",
      va.business_name as "vendorBusinessName"
    from bookings b
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join vendor_profiles listing_profile on listing_profile.id = listing_owner.profile_id
    left join lateral (
      select
        bi.listing_id,
        bi.title
      from booking_items bi
      where b.listing_id is null
        and bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_item on true
    left join vendor_listings legacy_listing on legacy_listing.id = legacy_item.listing_id
    left join vendor_profiles legacy_listing_profile on legacy_listing_profile.id = legacy_listing.profile_id
    left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id, legacy_listing.account_id)
    where b.id = ${bookingId}
    limit 1
  `);

  return extractRows<BookingGoogleSyncRecord>(result)[0] ?? null;
}

async function updateBookingGoogleSyncState(
  bookingId: string,
  values: Partial<{
    googleEventId: string | null;
    googleCalendarId: string | null;
    googleSyncStatus: string | null;
    googleLastSyncedAt: Date | null;
    googleSyncError: string | null;
  }>
) {
  await db
    .update(bookings)
    .set({
      ...(values.googleEventId !== undefined ? { googleEventId: values.googleEventId } : {}),
      ...(values.googleCalendarId !== undefined ? { googleCalendarId: values.googleCalendarId } : {}),
      ...(values.googleSyncStatus !== undefined ? { googleSyncStatus: values.googleSyncStatus } : {}),
      ...(values.googleLastSyncedAt !== undefined ? { googleLastSyncedAt: values.googleLastSyncedAt } : {}),
      ...(values.googleSyncError !== undefined ? { googleSyncError: values.googleSyncError } : {}),
    })
    .where(eq(bookings.id, bookingId));
}

async function createGoogleCalendarEventForBooking(
  record: BookingGoogleSyncRecord,
  calendarId: string
) {
  const response = await performGoogleApiRequestForVendorAccount(
    record.vendorAccountId!,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGoogleBookingEventPayload(record)),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new GoogleCalendarConnectionError(
      `Unable to create Google booking event${errorText ? `: ${errorText}` : ""}`,
      {
        statusCode: 502,
        code: "google_booking_event_create_failed",
      }
    );
  }

  const payload = (await response.json()) as GoogleCalendarEventResponse;
  const eventId = asTrimmedString(payload.id);
  if (!eventId) {
    throw new GoogleCalendarConnectionError("Google booking event create response was missing an id", {
      statusCode: 502,
      code: "google_booking_event_create_invalid",
    });
  }

  return eventId;
}

async function updateGoogleCalendarEventForBooking(
  record: BookingGoogleSyncRecord,
  calendarId: string,
  googleEventId: string
) {
  const response = await performGoogleApiRequestForVendorAccount(
    record.vendorAccountId!,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGoogleBookingEventPayload(record)),
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new GoogleCalendarConnectionError(
      `Unable to update Google booking event${errorText ? `: ${errorText}` : ""}`,
      {
        statusCode: 502,
        code: "google_booking_event_update_failed",
      }
    );
  }

  const payload = (await response.json()) as GoogleCalendarEventResponse;
  return asTrimmedString(payload.id) || googleEventId;
}

async function deleteGoogleCalendarEventForBooking(
  record: BookingGoogleSyncRecord,
  calendarId: string,
  googleEventId: string
) {
  const response = await performGoogleApiRequestForVendorAccount(
    record.vendorAccountId!,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "DELETE",
    }
  );

  if (response.status === 404 || response.status === 410) {
    return;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new GoogleCalendarConnectionError(
      `Unable to delete Google booking event${errorText ? `: ${errorText}` : ""}`,
      {
        statusCode: 502,
        code: "google_booking_event_delete_failed",
      }
    );
  }
}

async function loadVendorGoogleConnection(
  vendorAccountId: string
): Promise<VendorGoogleConnection> {
  const rows = await db
    .select({
      id: vendorAccounts.id,
      email: vendorAccounts.email,
      businessName: vendorAccounts.businessName,
      googleAccessToken: vendorAccounts.googleAccessToken,
      googleRefreshToken: vendorAccounts.googleRefreshToken,
      googleTokenExpiresAt: vendorAccounts.googleTokenExpiresAt,
      googleCalendarId: vendorAccounts.googleCalendarId,
      googleConnectionStatus: vendorAccounts.googleConnectionStatus,
    })
    .from(vendorAccounts)
    .where(eq(vendorAccounts.id, vendorAccountId))
    .limit(1);

  const account = rows[0];
  if (!account) {
    throw new GoogleCalendarConnectionError("Vendor account not found", {
      statusCode: 404,
      code: "vendor_account_not_found",
    });
  }

  return account;
}

async function refreshGoogleAccessToken(
  account: VendorGoogleConnection
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const refreshToken = asTrimmedString(account.googleRefreshToken);
  if (!refreshToken) {
    throw new GoogleCalendarConnectionError("Google Calendar refresh token is missing", {
      statusCode: 400,
      code: "google_refresh_token_missing",
    });
  }

  const clientId = asTrimmedString(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = asTrimmedString(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new GoogleCalendarConnectionError("Missing Google OAuth configuration", {
      statusCode: 500,
      code: "google_oauth_config_missing",
    });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text().catch(() => "");
    throw new GoogleCalendarConnectionError(
      `Google token refresh failed${errorText ? `: ${errorText}` : ""}`,
      {
        statusCode: 502,
        code: "google_token_refresh_failed",
      }
    );
  }

  const tokenPayload = (await tokenResponse.json()) as GoogleRefreshTokenResponse;
  const nextAccessToken = asTrimmedString(tokenPayload.access_token);
  if (!nextAccessToken) {
    throw new GoogleCalendarConnectionError("Google token refresh did not return an access token", {
      statusCode: 502,
      code: "google_access_token_missing",
    });
  }

  const nextRefreshToken = asTrimmedString(tokenPayload.refresh_token) || refreshToken;
  const nextExpiresAt =
    typeof tokenPayload.expires_in === "number" && Number.isFinite(tokenPayload.expires_in)
      ? new Date(Date.now() + tokenPayload.expires_in * 1000)
      : null;

  await db
    .update(vendorAccounts)
    .set({
      googleAccessToken: nextAccessToken,
      googleRefreshToken: nextRefreshToken,
      googleTokenExpiresAt: nextExpiresAt,
      googleConnectionStatus: "connected",
    })
    .where(eq(vendorAccounts.id, account.id));

  return {
    accessToken: nextAccessToken,
    expiresAt: nextExpiresAt,
  };
}

export async function getValidGoogleAccessTokenForVendorAccount(
  vendorAccountId: string,
  options?: { forceRefresh?: boolean }
) {
  const account = await loadVendorGoogleConnection(vendorAccountId);
  const connectionStatus = asTrimmedString(account.googleConnectionStatus) || "disconnected";
  const accessToken = asTrimmedString(account.googleAccessToken);

  if (connectionStatus !== "connected") {
    throw new GoogleCalendarConnectionError("Google Calendar is not connected", {
      statusCode: 400,
      code: "google_not_connected",
    });
  }

  const needsRefresh =
    options?.forceRefresh === true ||
    !accessToken ||
    isGoogleAccessTokenExpired(account.googleTokenExpiresAt);

  if (!needsRefresh && accessToken) {
    return {
      accessToken,
      vendorAccount: account,
    };
  }

  const refreshed = await refreshGoogleAccessToken(account);
  return {
    accessToken: refreshed.accessToken,
    vendorAccount: {
      ...account,
      googleAccessToken: refreshed.accessToken,
      googleTokenExpiresAt: refreshed.expiresAt,
    },
  };
}

export async function syncEventHubBookingToGoogleCalendar(
  options: SyncEventHubBookingOptions
): Promise<BookingGoogleSyncResult> {
  const bookingId = asTrimmedString(options.bookingId);
  const requestedTargetCalendarId = asTrimmedString(options.targetCalendarId);
  if (!bookingId) {
    return { status: "skipped", reason: "booking_id_missing" };
  }

  const record = await loadBookingGoogleSyncRecord(bookingId);
  if (!record?.id) {
    return { status: "skipped", reason: "booking_not_found" };
  }

  const vendorAccountId = asTrimmedString(record.vendorAccountId);
  if (!vendorAccountId) {
    return { status: "skipped", reason: "vendor_account_missing" };
  }

  const vendorConnection = await loadVendorGoogleConnection(vendorAccountId);
  const connectionStatus = asTrimmedString(vendorConnection.googleConnectionStatus) || "disconnected";
  if (connectionStatus !== "connected") {
    return { status: "skipped", reason: "google_not_connected" };
  }

  const targetCalendarId =
    requestedTargetCalendarId ||
    asTrimmedString(record.googleCalendarId) ||
    asTrimmedString(vendorConnection.googleCalendarId);
  if (!targetCalendarId) {
    return { status: "skipped", reason: "google_calendar_not_selected" };
  }

  try {
    if ((asTrimmedString(record.status) || "").toLowerCase() === "cancelled") {
      const existingEventId = asTrimmedString(record.googleEventId);
      if (existingEventId) {
        await deleteGoogleCalendarEventForBooking(record, targetCalendarId, existingEventId);
      }

      await updateBookingGoogleSyncState(record.id, {
        googleEventId: null,
        googleCalendarId: targetCalendarId,
        googleSyncStatus: "cancelled",
        googleLastSyncedAt: new Date(),
        googleSyncError: null,
      });

      return {
        status: "cancelled",
        googleCalendarId: targetCalendarId,
      };
    }

    const existingEventId = asTrimmedString(record.googleEventId);
    const nextEventId = existingEventId
      ? (await updateGoogleCalendarEventForBooking(record, targetCalendarId, existingEventId)) ||
        (await createGoogleCalendarEventForBooking(record, targetCalendarId))
      : await createGoogleCalendarEventForBooking(record, targetCalendarId);

    await updateBookingGoogleSyncState(record.id, {
      googleEventId: nextEventId,
      googleCalendarId: targetCalendarId,
      googleSyncStatus: "synced",
      googleLastSyncedAt: new Date(),
      googleSyncError: null,
    });

    return {
      status: "synced",
      googleEventId: nextEventId,
      googleCalendarId: targetCalendarId,
    };
  } catch (error) {
    const message =
      error instanceof Error && asTrimmedString(error.message)
        ? error.message.trim().slice(0, 1000)
        : "Google booking sync failed";
    const errorCode =
      error instanceof GoogleCalendarConnectionError && asTrimmedString(error.code)
        ? error.code
        : undefined;

    await updateBookingGoogleSyncState(record.id, {
      googleSyncStatus: "failed",
      googleSyncError: errorCode ? `${errorCode}: ${message}` : message,
    });

    return {
      status: "failed",
      error: message,
      ...(errorCode ? { errorCode } : {}),
    };
  }
}

export async function performGoogleApiRequestForVendorAccount(
  vendorAccountId: string,
  input: string,
  init?: RequestInit
) {
  const firstPass = await getValidGoogleAccessTokenForVendorAccount(vendorAccountId);
  let response = await fetch(input, {
    ...init,
    headers: buildGoogleAuthorizedHeaders(firstPass.accessToken, init?.headers),
  });

  if (response.status !== 401) {
    return response;
  }

  const refreshed = await getValidGoogleAccessTokenForVendorAccount(vendorAccountId, {
    forceRefresh: true,
  });
  response = await fetch(input, {
    ...init,
    headers: buildGoogleAuthorizedHeaders(refreshed.accessToken, init?.headers),
  });
  return response;
}

export async function listSelectedGoogleCalendarEventsForVendorAccount(
  vendorAccountId: string,
  options?: {
    timeMin?: Date | null;
    timeMax?: Date | null;
    maxResults?: number;
  }
) {
  const connection = await loadVendorGoogleConnection(vendorAccountId);
  const calendarId = asTrimmedString(connection.googleCalendarId);
  if (!calendarId) {
    throw new GoogleCalendarConnectionError("Google calendar is not selected", {
      statusCode: 400,
      code: "google_calendar_not_selected",
    });
  }

  const query = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    maxResults: String(
      typeof options?.maxResults === "number" && Number.isFinite(options.maxResults) && options.maxResults > 0
        ? Math.min(Math.round(options.maxResults), 2500)
        : 250
    ),
  });

  if (isValidDate(options?.timeMin ?? null)) {
    query.set("timeMin", (options?.timeMin as Date).toISOString());
  }
  if (isValidDate(options?.timeMax ?? null)) {
    query.set("timeMax", (options?.timeMax as Date).toISOString());
  }
  if (query.has("timeMin")) {
    query.set("orderBy", "startTime");
  }

  const response = await performGoogleApiRequestForVendorAccount(
    vendorAccountId,
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new GoogleCalendarConnectionError(
      `Unable to load selected Google calendar events${errorText ? `: ${errorText}` : ""}`,
      {
        statusCode: response.status === 404 ? 404 : 502,
        code: "google_calendar_events_list_failed",
      }
    );
  }

  const payload = (await response.json().catch(() => null)) as GoogleCalendarEventListResponse | null;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((event) => normalizeGoogleCalendarEvent(event))
    .filter((event): event is NormalizedGoogleCalendarEvent => Boolean(event));
}

export async function listGoogleCalendarsForVendorAccount(vendorAccountId: string) {
  const response = await performGoogleApiRequestForVendorAccount(
    vendorAccountId,
    "https://www.googleapis.com/calendar/v3/users/me/calendarList"
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new GoogleCalendarConnectionError(
      `Unable to load Google calendars${errorText ? `: ${errorText}` : ""}`,
      {
        statusCode: response.status === 404 ? 404 : 502,
        code: "google_calendar_list_failed",
      }
    );
  }

  const payload = (await response.json()) as GoogleCalendarListResponse;
  return (payload.items || [])
    .map((calendar) => normalizeGoogleCalendar(calendar))
    .filter((calendar): calendar is NormalizedGoogleCalendar => Boolean(calendar));
}

export async function createGoogleCalendarForVendorAccount(vendorAccountId: string) {
  const response = await performGoogleApiRequestForVendorAccount(
    vendorAccountId,
    "https://www.googleapis.com/calendar/v3/calendars",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "EventHub Bookings",
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new GoogleCalendarConnectionError(
      `Unable to create Google calendar${errorText ? `: ${errorText}` : ""}`,
      {
        statusCode: 502,
        code: "google_calendar_create_failed",
      }
    );
  }

  const payload = (await response.json()) as GoogleCalendarResponse;
  const normalized = normalizeGoogleCalendar(payload);
  if (!normalized) {
    throw new GoogleCalendarConnectionError("Google calendar create response was missing an id", {
      statusCode: 502,
      code: "google_calendar_create_invalid",
    });
  }

  await db
    .update(vendorAccounts)
    .set({
      googleCalendarId: normalized.id,
    })
    .where(eq(vendorAccounts.id, vendorAccountId));

  return normalized;
}
