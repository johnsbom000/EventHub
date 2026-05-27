import crypto from "crypto";
import { db } from "../db";
import { eq, and, inArray, sql as drizzleSql } from "drizzle-orm";
import {
  vendorListings,
  googleCalendarEventMappings,
  bookings,
} from "@shared/schema";
import { logRouteError } from "../lib/routeHelpers";
import {
  GoogleCalendarConnectionError,
  syncEventHubBookingToGoogleCalendar,
  listSelectedGoogleCalendarEventsForVendorAccount,
} from "../google";
import {
  normalizeIanaTimeZone,
  addDaysToIsoDate,
  parseIsoDateValue,
  parseTimeValueToMinutes,
  zonedDateStartToUtc,
  zonedDateTimeToUtc,
} from "../timezone";
import {
  asTrimmedString,
  extractRows,
  normalizeListingTitleCandidate,
  getListingPricingUnit,
  getListingMinimumHours,
  parseIntegerValue,
} from "../lib/routeUtils";
import { GOOGLE_OAUTH_STATE_TTL_MS } from "../lib/constants";

export type VendorListingMatchContext = {
  listingsById: Map<string, { id: string; title: string | null; normalizedTitle: string | null }>;
  listingIds: Set<string>;
  listingIdsByNormalizedTitle: Map<string, string[]>;
};

export type GoogleEventMappingContext = {
  calendarId: string;
  mappingsByEventId: Map<
    string,
    {
      googleEventId: string;
      listingId: string;
      mappingSource: string;
      mappingStatus: string;
    }
  >;
};

export type GoogleBookingReconciliationIssue = {
  bookingId: string | null;
  listingId: string | null;
  listingTitle: string;
  status: string;
  bookingStartAt: Date | string | null;
  bookingEndAt: Date | string | null;
  googleSyncStatus: string | null;
  googleSyncError: string | null;
  googleEventId: string | null;
  googleCalendarId: string | null;
  selectedGoogleCalendarId: string | null;
  issueCodes: string[];
  createdAt: Date | string | null;
};

export function createGoogleOauthState(vendorAccountId: string, returnTo = "/vendor/dashboard") {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  const encodedPayload = Buffer.from(
    JSON.stringify({
      vendorAccountId,
      returnTo,
      issuedAt: Date.now(),
      nonce: crypto.randomUUID(),
    }),
    "utf8"
  ).toString("base64url");

  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("hex");
  return `${encodedPayload}.${signature}`;
}

export function parseGoogleOauthState(rawState: string) {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  const [encodedPayload, signature] = rawState.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("hex");

  if (signature.length !== expectedSignature.length) {
    return null;
  }

  const providedSignatureBuffer = Buffer.from(signature, "hex");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      vendorAccountId?: string;
      returnTo?: string;
      issuedAt?: number;
    };

    if (
      typeof parsed.vendorAccountId !== "string" ||
      !parsed.vendorAccountId.trim() ||
      typeof parsed.issuedAt !== "number" ||
      !Number.isFinite(parsed.issuedAt)
    ) {
      return null;
    }

    if (Date.now() - parsed.issuedAt > GOOGLE_OAUTH_STATE_TTL_MS) {
      return null;
    }

    // Only allow safe relative vendor paths to prevent open redirects
    const rawReturnTo = typeof parsed.returnTo === "string" ? parsed.returnTo.trim() : "";
    const safeReturnTo =
      rawReturnTo.startsWith("/vendor/") ? rawReturnTo : "/vendor/dashboard";

    return { vendorAccountId: parsed.vendorAccountId.trim(), returnTo: safeReturnTo };
  } catch {
    return null;
  }
}

export async function syncBookingToGoogleCalendarSafely(bookingId: string, route: string) {
  const result = await syncEventHubBookingToGoogleCalendar({ bookingId });
  if (result.status === "failed") {
    logRouteError(route, new Error(result.error));
  }
  return result;
}

export async function syncExistingBookingsToSelectedGoogleCalendar(
  vendorAccountId: string,
  selectedGoogleCalendarId: string
) {
  const bookingIds = await listSyncableExistingBookingIdsForVendorAccount(vendorAccountId);
  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failedBookings: Array<{ bookingId: string; error: string }> = [];

  for (const bookingId of bookingIds) {
    const result = await syncEventHubBookingToGoogleCalendar({
      bookingId,
      targetCalendarId: selectedGoogleCalendarId,
    });

    if (result.status === "synced") {
      syncedCount += 1;
      continue;
    }

    if (result.status === "skipped") {
      skippedCount += 1;
      continue;
    }

    if (result.status === "failed") {
      failedCount += 1;
      failedBookings.push({
        bookingId,
        error: result.error,
      });
      continue;
    }

    skippedCount += 1;
  }

  return {
    googleCalendarId: selectedGoogleCalendarId,
    bookingCount: bookingIds.length,
    syncedCount,
    skippedCount,
    failedCount,
    failedBookings,
  };
}

export function computeCanonicalBookingTimeRange(input: {
  listingData: any;
  listingPricingUnit?: unknown;
  listingMinimumHours?: unknown;
  vendorTimeZone?: unknown;
  /** Timezone of the event delivery location (from geocoded coordinates). When provided,
   *  customer-entered times are interpreted in this timezone rather than the vendor timezone,
   *  since the customer is scheduling an event at a specific location. */
  eventTimeZone?: string | null;
  eventDate: string;
  eventStartTime?: string | null;
  eventEndDate?: string | null;
  eventEndTime?: string | null;
}) {
  const pricingUnit = getListingPricingUnit(input.listingData, input.listingPricingUnit);
  const minimumHours = getListingMinimumHours(input.listingData, input.listingMinimumHours);
  const vendorTimeZone = normalizeIanaTimeZone(input.vendorTimeZone);
  // Use event location timezone when available so that customer-entered times are
  // anchored to where the event is happening, not where the vendor is based.
  // NOTE: normalizeIanaTimeZone(null) returns "UTC" (truthy), so we cannot use
  // `|| vendorTimeZone` — the fallback would never run. Check for presence first.
  const bookingTimeZone = input.eventTimeZone
    ? normalizeIanaTimeZone(input.eventTimeZone, vendorTimeZone)
    : vendorTimeZone;
  const eventDate = asTrimmedString(input.eventDate);

  if (!eventDate || !parseIsoDateValue(eventDate)) {
    throw new Error("Booking event date is invalid");
  }

  const eventStartTime = asTrimmedString(input.eventStartTime);
  const eventEndTime = asTrimmedString(input.eventEndTime);
  const endDate = asTrimmedString(input.eventEndDate) || eventDate;

  if (pricingUnit === "per_hour") {
    const startTime = eventStartTime;
    const endTime = eventEndTime;

    if (!startTime || !endTime) {
      throw new Error("Hourly bookings require a start time and end time");
    }
    if (endDate !== eventDate) {
      throw new Error("Hourly bookings must start and end on the same day");
    }

    const startMinutes = parseTimeValueToMinutes(startTime);
    const endMinutes = parseTimeValueToMinutes(endTime);
    if (startMinutes == null || endMinutes == null) {
      throw new Error("Hourly booking time range is invalid");
    }
    if (endMinutes <= startMinutes) {
      throw new Error("Hourly booking end time must be after the start time");
    }

    const durationHours = (endMinutes - startMinutes) / 60;
    if (minimumHours != null && durationHours < minimumHours) {
      throw new Error(`Hourly bookings must be at least ${minimumHours} hour${minimumHours === 1 ? "" : "s"}`);
    }

    const bookingStartAt = zonedDateTimeToUtc(eventDate, startMinutes, bookingTimeZone);
    const bookingEndAt = zonedDateTimeToUtc(eventDate, endMinutes, bookingTimeZone);
    if (!(bookingStartAt instanceof Date) || Number.isNaN(bookingStartAt.getTime())) {
      throw new Error("Hourly booking start time is invalid");
    }
    if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
      throw new Error("Hourly booking end time is invalid");
    }

    return {
      pricingUnit,
      minimumHours,
      vendorTimeZone,
      bookingTimeZone,
      bookingStartAt,
      bookingEndAt,
    };
  }

  const hasEventTimeRange = Boolean(eventStartTime && eventEndTime);

  if (!eventStartTime || !eventEndTime) {
    throw new Error("Per-day bookings require a start time and end time");
  }

  if (hasEventTimeRange) {
    const startMinutes = parseTimeValueToMinutes(eventStartTime);
    const endMinutes = parseTimeValueToMinutes(eventEndTime);
    if (startMinutes == null || endMinutes == null) {
      throw new Error("Per-day event start/end times are invalid");
    }
    if (startMinutes === endMinutes) {
      throw new Error("Event start and end times cannot be the same");
    }
    // End time before start time means the event crosses midnight (e.g. 8 PM – 12 AM).
    // Compute the end timestamp against the following day in that case.
    const pastMidnight = endMinutes < startMinutes;
    const eventEndDateStr = pastMidnight ? addDaysToIsoDate(eventDate, 1) : eventDate;
    if (!eventEndDateStr) {
      throw new Error("Per-day event end time is invalid");
    }
    const bookingStartAt = zonedDateTimeToUtc(eventDate, startMinutes, bookingTimeZone);
    const bookingEndAt = zonedDateTimeToUtc(eventEndDateStr, endMinutes, bookingTimeZone);
    if (!(bookingStartAt instanceof Date) || Number.isNaN(bookingStartAt.getTime())) {
      throw new Error("Per-day event start time is invalid");
    }
    if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
      throw new Error("Per-day event end time is invalid");
    }
    return {
      pricingUnit,
      minimumHours,
      vendorTimeZone,
      bookingTimeZone,
      bookingStartAt,
      bookingEndAt,
    };
  }

  const bookingStartAt = zonedDateStartToUtc(eventDate, bookingTimeZone);
  const requestedEndDate = endDate;
  if (!parseIsoDateValue(requestedEndDate)) {
    throw new Error("Booking end date is invalid");
  }
  const bookingEndDateExclusive = addDaysToIsoDate(requestedEndDate, 1);
  const bookingEndAt = bookingEndDateExclusive
    ? zonedDateStartToUtc(bookingEndDateExclusive, bookingTimeZone)
    : null;

  if (!(bookingStartAt instanceof Date) || Number.isNaN(bookingStartAt.getTime())) {
    throw new Error("Booking start date is invalid");
  }
  if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
    throw new Error("Booking end date is invalid");
  }
  if (bookingEndAt.getTime() <= bookingStartAt.getTime()) {
    throw new Error("Booking end date must be on or after the start date");
  }

  return {
    pricingUnit,
    minimumHours,
    vendorTimeZone,
    bookingTimeZone,
    bookingStartAt,
    bookingEndAt,
  };
}

export function doTimeRangesOverlap(
  firstStartAt: Date,
  firstEndAt: Date,
  secondStartAt: Date,
  secondEndAt: Date
) {
  return firstStartAt.getTime() < secondEndAt.getTime() && firstEndAt.getTime() > secondStartAt.getTime();
}

export function getComparableGoogleEventRange(input: {
  event: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>["events"][number];
  vendorTimeZone: string;
}) {
  const { event, vendorTimeZone } = input;
  const allDayStartDate = asTrimmedString(event?.start?.date);
  const allDayEndDate = asTrimmedString(event?.end?.date);

  if (event?.isAllDay && allDayStartDate && allDayEndDate) {
    const startAt = zonedDateStartToUtc(allDayStartDate, vendorTimeZone);
    const endAt = zonedDateStartToUtc(allDayEndDate, vendorTimeZone);
    if (startAt instanceof Date && !Number.isNaN(startAt.getTime()) && endAt instanceof Date && !Number.isNaN(endAt.getTime())) {
      return { startAt, endAt };
    }
  }

  if (
    event?.startAt instanceof Date &&
    !Number.isNaN(event.startAt.getTime()) &&
    event?.endAt instanceof Date &&
    !Number.isNaN(event.endAt.getTime())
  ) {
    return {
      startAt: event.startAt,
      endAt: event.endAt,
    };
  }

  return null;
}

export async function findOverlappingEventHubBookingsForListing(params: {
  listingId: string;
  bookingStartAt: Date;
  bookingEndAt: Date;
  excludeBookingId?: string | null;
}) {
  // Legacy compatibility remains only for rows missing canonical bookings.listing_id.
  const rows: any = await db.execute(drizzleSql`
    select
      b.id,
      b.status,
      b.booking_start_at as "bookingStartAt",
      b.booking_end_at as "bookingEndAt",
      coalesce(b.booked_quantity, booking_item_totals.quantity, 1) as "quantity"
    from bookings b
    left join lateral (
      select sum(coalesce(bi.quantity, 1))::int as quantity
      from booking_items bi
      where bi.booking_id = b.id
        and bi.listing_id = ${params.listingId}
    ) booking_item_totals on true
    where (
      b.listing_id = ${params.listingId}
      or (
        b.listing_id is null
        and exists (
          select 1
          from booking_items bi
          where bi.booking_id = b.id
            and bi.listing_id = ${params.listingId}
        )
      )
    )
      and b.status in ('pending', 'confirmed', 'completed')
      and (${params.excludeBookingId ?? null}::text is null or b.id <> ${params.excludeBookingId ?? null}::text)
      and b.booking_start_at is not null
      and b.booking_end_at is not null
      and b.booking_start_at < ${params.bookingEndAt}
      and b.booking_end_at > ${params.bookingStartAt}
    order by b.booking_start_at asc
  `);

  return extractRows<{
    id?: string;
    status?: string | null;
    bookingStartAt?: Date | null;
    bookingEndAt?: Date | null;
    quantity?: number | null;
  }>(rows);
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractGoogleMetadataValueFromDescription(description: string | null | undefined, label: string) {
  const source = asTrimmedString(description);
  if (!source) return null;
  const match = source.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "im"));
  return match?.[1] ? asTrimmedString(match[1]) : null;
}

export function normalizeComparableListingTitle(value: unknown) {
  const title = normalizeListingTitleCandidate(value);
  return title ? title.toLowerCase() : null;
}

export async function loadVendorListingMatchContext(vendorAccountId: string): Promise<VendorListingMatchContext> {
  const rows = await db
    .select({
      id: vendorListings.id,
      title: vendorListings.title,
      listingData: vendorListings.listingData,
    })
    .from(vendorListings)
    .where(eq(vendorListings.accountId, vendorAccountId));

  const listingsById = new Map<string, { id: string; title: string | null; normalizedTitle: string | null }>();
  const listingIds = new Set<string>();
  const listingIdsByNormalizedTitle = new Map<string, string[]>();

  for (const row of rows) {
    const listingId = asTrimmedString(row.id);
    if (!listingId) continue;

    const listingData = row.listingData && typeof row.listingData === "object" ? row.listingData as any : {};
    const title =
      normalizeListingTitleCandidate(row.title) ??
      normalizeListingTitleCandidate(listingData?.listingTitle) ??
      null;
    const normalizedTitle = normalizeComparableListingTitle(title);

    listingsById.set(listingId, {
      id: listingId,
      title,
      normalizedTitle,
    });
    listingIds.add(listingId);

    if (normalizedTitle) {
      const current = listingIdsByNormalizedTitle.get(normalizedTitle) ?? [];
      current.push(listingId);
      listingIdsByNormalizedTitle.set(normalizedTitle, current);
    }
  }

  return {
    listingsById,
    listingIds,
    listingIdsByNormalizedTitle,
  };
}

export async function loadGoogleEventMappingContext(params: {
  vendorAccountId: string;
  googleCalendarId: string;
  googleEventIds?: string[];
}): Promise<GoogleEventMappingContext> {
  const eventIds = Array.from(
    new Set(
      (params.googleEventIds ?? [])
        .map((value) => asTrimmedString(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  const query = db
    .select({
      googleEventId: googleCalendarEventMappings.googleEventId,
      listingId: googleCalendarEventMappings.listingId,
      mappingSource: googleCalendarEventMappings.mappingSource,
      mappingStatus: googleCalendarEventMappings.mappingStatus,
    })
    .from(googleCalendarEventMappings)
    .where(
      and(
        eq(googleCalendarEventMappings.vendorAccountId, params.vendorAccountId),
        eq(googleCalendarEventMappings.googleCalendarId, params.googleCalendarId),
        eventIds.length > 0
          ? inArray(googleCalendarEventMappings.googleEventId, eventIds)
          : drizzleSql`true`
      )
    );

  const rows = await query;
  const mappingsByEventId = new Map<
    string,
    {
      googleEventId: string;
      listingId: string;
      mappingSource: string;
      mappingStatus: string;
    }
  >();

  for (const row of rows) {
    const googleEventId = asTrimmedString(row.googleEventId);
    const listingId = asTrimmedString(row.listingId);
    if (!googleEventId || !listingId) continue;
    mappingsByEventId.set(googleEventId, {
      googleEventId,
      listingId,
      mappingSource: asTrimmedString(row.mappingSource) || "manual",
      mappingStatus: asTrimmedString(row.mappingStatus) || "reviewed",
    });
  }

  return {
    calendarId: params.googleCalendarId,
    mappingsByEventId,
  };
}

export function matchGoogleCalendarEventToListing(
  event: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>["events"][number],
  params: {
    listingContext: VendorListingMatchContext;
    mappingContext: GoogleEventMappingContext | null;
  }
) {
  const metadataListingId =
    asTrimmedString(event.extendedProperties.private.eventHubListingId) ||
    asTrimmedString(event.extendedProperties.shared.eventHubListingId) ||
    extractGoogleMetadataValueFromDescription(event.description, "Listing ID");

  if (metadataListingId && params.listingContext.listingIds.has(metadataListingId)) {
    return {
      matched: true as const,
      listingId: metadataListingId,
      matchedBy: "metadata" as const,
    };
  }

  const manualMapping = params.mappingContext?.mappingsByEventId.get(event.id);
  if (manualMapping && params.listingContext.listingIds.has(manualMapping.listingId)) {
    return {
      matched: true as const,
      listingId: manualMapping.listingId,
      matchedBy: "manual" as const,
    };
  }

  const normalizedEventTitle = normalizeComparableListingTitle(event.summary);
  const exactTitleMatches = normalizedEventTitle
    ? params.listingContext.listingIdsByNormalizedTitle.get(normalizedEventTitle) ?? []
    : [];
  if (
    normalizedEventTitle &&
    exactTitleMatches.length === 1
  ) {
    return {
      matched: true as const,
      listingId: exactTitleMatches[0],
      matchedBy: "title" as const,
    };
  }

  return {
    matched: false as const,
    listingId: null,
    matchedBy: "unmatched" as const,
  };
}

export async function findOverlappingGoogleCalendarEventForListing(params: {
  vendorAccountId: string;
  vendorGoogleCalendarId?: string | null;
  vendorTimeZone?: string | null;
  listingId: string;
  listingTitle: string | null;
  bookingStartAt: Date;
  bookingEndAt: Date;
  enabled: boolean;
}) {
  if (!params.enabled) {
    return {
      status: "skipped" as const,
      reason: "google_not_enabled",
      conflict: null,
    };
  }

  try {
    const vendorTimeZone = normalizeIanaTimeZone(params.vendorTimeZone);
    const selectedCalendarId = asTrimmedString(params.vendorGoogleCalendarId);
    if (!selectedCalendarId) {
      return {
        status: "skipped" as const,
        reason: "google_calendar_not_selected",
        conflict: null,
      };
    }

    const { events } = await listSelectedGoogleCalendarEventsForVendorAccount(params.vendorAccountId, {
      timeMin: params.bookingStartAt,
      timeMax: params.bookingEndAt,
      maxResults: 250,
    });
    const listingContext = await loadVendorListingMatchContext(params.vendorAccountId);
    const mappingContext = await loadGoogleEventMappingContext({
      vendorAccountId: params.vendorAccountId,
      googleCalendarId: selectedCalendarId,
      googleEventIds: events.map((event) => event.id),
    });

    for (const event of events) {
      if ((asTrimmedString(event.status) || "").toLowerCase() === "cancelled") continue;
      const comparableRange = getComparableGoogleEventRange({
        event,
        vendorTimeZone,
      });
      if (!comparableRange) continue;
      if (!doTimeRangesOverlap(params.bookingStartAt, params.bookingEndAt, comparableRange.startAt, comparableRange.endAt)) {
        continue;
      }

      const match = matchGoogleCalendarEventToListing(event, {
        listingContext,
        mappingContext,
      });
      if (!match.matched || match.listingId !== params.listingId) continue;

      return {
        status: "checked" as const,
        reason: null,
        conflict: {
          event,
          matchedBy: match.matchedBy,
        },
      };
    }

    return {
      status: "checked" as const,
      reason: null,
      conflict: null,
    };
  } catch (error) {
    if (
      error instanceof GoogleCalendarConnectionError &&
      (error.code === "google_not_connected" || error.code === "google_calendar_not_selected")
    ) {
      return {
        status: "skipped" as const,
        reason: error.code,
        conflict: null,
      };
    }

    const message = error instanceof Error ? error.message : "Google availability could not be verified";
    logRouteError("/api/bookings google-conflict-read", error);
    return {
      status: "failed" as const,
      reason: error instanceof GoogleCalendarConnectionError ? error.code : "google_calendar_check_failed",
      message,
      conflict: null,
    };
  }
}

export async function listGoogleSyncReconciliationCandidatesForVendorAccount(vendorAccountId: string) {
  // Legacy compatibility remains only when canonical ownership/linkage fields are null.
  const rows: any = await db.execute(drizzleSql`
    select
      b.id,
      b.status,
      b.booking_start_at as "bookingStartAt",
      b.booking_end_at as "bookingEndAt",
      b.google_sync_status as "googleSyncStatus",
      b.google_sync_error as "googleSyncError",
      b.google_event_id as "googleEventId",
      b.google_calendar_id as "googleCalendarId",
      b.created_at as "createdAt",
      coalesce(b.listing_id, legacy_item.listing_id) as "listingId",
      coalesce(
        nullif(trim(b.listing_title_snapshot), ''),
        nullif(trim(legacy_item.title), ''),
        nullif(trim(listing_owner.title), ''),
        nullif(trim(legacy_listing.title), '')
      ) as "listingTitle"
    from bookings b
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
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
    where coalesce(b.vendor_account_id, listing_owner.account_id, legacy_listing.account_id) = ${vendorAccountId}
    order by b.created_at desc
  `);
  return extractRows(rows);
}

export async function listSyncableExistingBookingIdsForVendorAccount(vendorAccountId: string) {
  // Legacy compatibility remains only when canonical ownership/linkage fields are null.
  const rows: any = await db.execute(drizzleSql`
    select
      b.id
    from bookings b
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select bi.listing_id
      from booking_items bi
      where b.listing_id is null
        and bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_item on true
    left join vendor_listings legacy_listing on legacy_listing.id = legacy_item.listing_id
    where coalesce(b.vendor_account_id, listing_owner.account_id, legacy_listing.account_id) = ${vendorAccountId}
      and (
        b.status in ('pending', 'confirmed', 'completed')
        or (b.status in ('cancelled', 'expired', 'failed') and b.google_event_id is not null)
      )
    order by b.created_at asc
  `);
  return extractRows<{ id?: string | null }>(rows)
    .map((row) => asTrimmedString(row?.id))
    .filter((bookingId): bookingId is string => Boolean(bookingId));
}

export async function buildGoogleBookingReconciliationForVendorAccount(account: any) {
  const selectedGoogleCalendarId = asTrimmedString(account?.googleCalendarId) || null;
  const googleEnabled =
    asTrimmedString(account?.googleConnectionStatus).toLowerCase() === "connected" &&
    Boolean(selectedGoogleCalendarId);

  const bookingRows = await listGoogleSyncReconciliationCandidatesForVendorAccount(account.id);
  const activeBookingRows = bookingRows.filter((row: any) => {
    const s = asTrimmedString(row?.status).toLowerCase();
    return s !== "cancelled" && s !== "expired" && s !== "failed";
  });
  let googleCalendarReadStatus: "checked" | "skipped" | "failed" = googleEnabled ? "checked" : "skipped";
  let googleCalendarReadError: string | null = null;
  let existingGoogleEventIds = new Set<string>();
  let selectedGoogleCalendarEvents: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>["events"] = [];
  let unmatchedEventsCount: number | null = googleEnabled ? 0 : null;

  if (googleEnabled) {
    try {
      const { events } = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
        maxResults: 2500,
      });
      selectedGoogleCalendarEvents = events;
      existingGoogleEventIds = new Set(
        events
          .map((event) => asTrimmedString(event.id))
          .filter((eventId): eventId is string => Boolean(eventId))
      );
    } catch (error) {
      googleCalendarReadStatus = "failed";
      googleCalendarReadError =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Unable to read selected Google calendar";
      unmatchedEventsCount = null;
    }
  }

  if (
    googleEnabled &&
    googleCalendarReadStatus === "checked" &&
    selectedGoogleCalendarId &&
    selectedGoogleCalendarEvents.length > 0
  ) {
    const listingContext = await loadVendorListingMatchContext(account.id);
    const mappingContext = await loadGoogleEventMappingContext({
      vendorAccountId: account.id,
      googleCalendarId: selectedGoogleCalendarId,
      googleEventIds: selectedGoogleCalendarEvents.map((event) => event.id),
    });

    unmatchedEventsCount = selectedGoogleCalendarEvents
      .filter((event) => (asTrimmedString(event.status) || "").toLowerCase() !== "cancelled")
      .filter((event) => {
        const match = matchGoogleCalendarEventToListing(event, {
          listingContext,
          mappingContext,
        });
        return !match.matched;
      }).length;
  } else if (googleEnabled && googleCalendarReadStatus === "checked") {
    unmatchedEventsCount = 0;
  }

  if (activeBookingRows.length === 0) {
    return {
      googleEnabled,
      googleCalendarId: selectedGoogleCalendarId,
      googleCalendarReadStatus,
      googleCalendarReadError,
      bookingsChecked: 0,
      issuesFound: 0,
      unmatchedEventsCount,
      issues: [],
    };
  }

  const issues: GoogleBookingReconciliationIssue[] = bookingRows.flatMap((row: any) => {
    const status = asTrimmedString(row?.status).toLowerCase();
    // Cancelled, expired, and failed bookings should never have a Google Calendar event.
    // The sync function already handles these correctly (no event created / existing deleted).
    // Showing them as sync issues is misleading — there's nothing actionable for the vendor.
    if (status === "cancelled" || status === "expired" || status === "failed") return [];

    const issueCodes: string[] = [];
    const googleSyncStatus = asTrimmedString(row?.googleSyncStatus).toLowerCase();
    const googleSyncError = asTrimmedString(row?.googleSyncError);
    const googleEventId = asTrimmedString(row?.googleEventId);
    const bookingGoogleCalendarId = asTrimmedString(row?.googleCalendarId);
    const calendarMismatch =
      googleEnabled &&
      Boolean(bookingGoogleCalendarId) &&
      Boolean(selectedGoogleCalendarId) &&
      bookingGoogleCalendarId !== selectedGoogleCalendarId;

    if (googleSyncStatus === "failed" || googleSyncError) {
      issueCodes.push("sync_failed");
    }
    if (googleEnabled && !googleEventId) {
      issueCodes.push("missing_google_event_id");
    }
    if (calendarMismatch) {
      issueCodes.push("calendar_mismatch");
    }
    if (
      googleEnabled &&
      googleCalendarReadStatus === "checked" &&
      googleEventId &&
      !existingGoogleEventIds.has(googleEventId) &&
      !calendarMismatch
    ) {
      issueCodes.push("missing_in_selected_calendar");
    }

    if (issueCodes.length === 0) return [];

    return [{
      bookingId: asTrimmedString(row?.id),
      listingId: asTrimmedString(row?.listingId),
      listingTitle: asTrimmedString(row?.listingTitle) || "Listing",
      status: asTrimmedString(row?.status) || "unknown",
      bookingStartAt: row?.bookingStartAt ?? null,
      bookingEndAt: row?.bookingEndAt ?? null,
      googleSyncStatus: asTrimmedString(row?.googleSyncStatus) || null,
      googleSyncError,
      googleEventId,
      googleCalendarId: bookingGoogleCalendarId || null,
      selectedGoogleCalendarId,
      issueCodes,
      createdAt: row?.createdAt ?? null,
    }];
  });

  return {
    googleEnabled,
    googleCalendarId: selectedGoogleCalendarId,
    googleCalendarReadStatus,
    googleCalendarReadError,
    bookingsChecked: activeBookingRows.length,
    issuesFound: issues.length,
    unmatchedEventsCount,
    issues,
  };
}

export async function runGoogleBookingSyncVerificationForVendorAccount(account: any) {
  const reconciliation = await buildGoogleBookingReconciliationForVendorAccount(account);
  return {
    vendorAccountId: asTrimmedString(account?.id) || null,
    googleEnabled: reconciliation.googleEnabled,
    googleCalendarId: reconciliation.googleCalendarId,
    googleCalendarReadStatus: reconciliation.googleCalendarReadStatus,
    googleCalendarReadError: reconciliation.googleCalendarReadError,
    bookingsChecked: reconciliation.bookingsChecked,
    issuesFound: reconciliation.issuesFound,
    unmatchedEventsCount: reconciliation.unmatchedEventsCount,
    issues: reconciliation.issues,
  };
}
