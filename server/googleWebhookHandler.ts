/**
 * Google Calendar Webhook Handler
 *
 * Processes incoming push notifications from Google Calendar.
 *
 * Flow:
 *   1. Validate X-Goog-Channel-ID + X-Goog-Channel-Token against DB
 *   2. Deduplicate via (channelId, messageNumber) unique constraint
 *   3. On "sync" ping — store initial sync token, no event processing
 *   4. On "exists" — fetch changed events incrementally using sync token
 *   5. Route each event:
 *      - EventHub booking event → update booking dates / notify vendor
 *      - Vacation-mapped event deleted → delete vacation block
 *      - "vacation" title → auto-create vacation block
 *      - Everything else → leave for unmatched events flow
 *
 * Anti-infinite-loop: when we update a booking from a Google event, we set
 * googleSyncSource = "webhook" so syncEventHubBookingToGoogleCalendar skips
 * re-syncing that change back to Google.
 */

import { captureJobError } from "./lib/jobAlerts";
import { and, eq } from "drizzle-orm";

import {
  NormalizedGoogleCalendarEvent,
  createVendorNotification,
  createGoogleCalendarWatchChannel,
  deleteGoogleCalendarEvent,
  listSelectedGoogleCalendarEventsForVendorAccount,
  updateWatchChannelSyncToken,
} from "./google";
import { db } from "./db";
import {
  bookings,
  googleCalendarVacationMappings,
  googleCalendarWatchChannels,
  googleWebhookNotifications,
  vendorAccounts,
  vendorVacationBlocks,
} from "@shared/schema";

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isVacationTitle(title: string | null | undefined): boolean {
  return typeof title === "string" && title.toLowerCase().includes("vacation");
}

function isEventHubBookingEvent(event: NormalizedGoogleCalendarEvent): boolean {
  const bookingId = asTrimmedString(
    event.extendedProperties?.private?.eventHubBookingId ||
    event.extendedProperties?.shared?.eventHubBookingId
  );
  return Boolean(bookingId);
}

function isEventHubVacationBlockEvent(event: NormalizedGoogleCalendarEvent): boolean {
  const vacationBlockId = asTrimmedString(
    event.extendedProperties?.private?.eventHubVacationBlockId ||
    event.extendedProperties?.shared?.eventHubVacationBlockId
  );
  return Boolean(vacationBlockId);
}

function isDeletedEvent(event: NormalizedGoogleCalendarEvent): boolean {
  return (asTrimmedString(event.status) || "").toLowerCase() === "cancelled";
}

/**
 * Validates the incoming webhook headers against stored channel records.
 * Returns the matching channel row or null if invalid.
 */
export async function validateGoogleWebhookHeaders(headers: {
  channelId: string | undefined;
  channelToken: string | undefined;
  messageNumber: string | undefined;
  resourceId: string | undefined;
  resourceState: string | undefined;
}) {
  const channelId = asTrimmedString(headers.channelId);
  const channelToken = asTrimmedString(headers.channelToken);
  const messageNumber = asTrimmedString(headers.messageNumber);
  const resourceId = asTrimmedString(headers.resourceId);
  const resourceState = asTrimmedString(headers.resourceState);

  if (!channelId || !channelToken) return null;

  const [channel] = await db
    .select()
    .from(googleCalendarWatchChannels)
    .where(eq(googleCalendarWatchChannels.channelId, channelId))
    .limit(1);

  if (!channel || channel.channelToken !== channelToken) return null;

  return { channel, messageNumber, resourceId, resourceState };
}

/**
 * Deduplicates an incoming notification by inserting (channelId, messageNumber).
 * Returns true if this is a new notification, false if already processed.
 */
async function recordNotification(
  vendorAccountId: string,
  channelId: string,
  messageNumber: string,
  resourceId: string,
  resourceState: string | null
): Promise<boolean> {
  const inserted = await db
    .insert(googleWebhookNotifications)
    .values({ vendorAccountId, channelId, messageNumber, resourceId, resourceState })
    .onConflictDoNothing()
    .returning({ id: googleWebhookNotifications.id });

  return inserted.length > 0;
}

/**
 * Handles the initial "sync" ping Google sends after watch channel creation.
 * Fetches the initial event list to get a sync token and stores it.
 */
async function handleSyncPing(
  vendorAccountId: string,
  channelId: string
): Promise<void> {
  try {
    const { nextSyncToken } = await listSelectedGoogleCalendarEventsForVendorAccount(
      vendorAccountId,
      { maxResults: 1 }
    );
    if (nextSyncToken) {
      await updateWatchChannelSyncToken(channelId, nextSyncToken);
    }
  } catch (err) {
    captureJobError("google_calendar_webhook", err, { stage: "sync_ping_token", vendorAccountId });
  }
}

/**
 * Processes a changed/created EventHub booking event from Google Calendar.
 * Updates booking dates if they changed. Never changes pricing.
 * Sets a flag to prevent re-syncing the change back to Google.
 */
async function handleBookingEventChange(
  event: NormalizedGoogleCalendarEvent,
  vendorAccountId: string
): Promise<void> {
  const bookingId = asTrimmedString(
    event.extendedProperties?.private?.eventHubBookingId ||
    event.extendedProperties?.shared?.eventHubBookingId
  );
  if (!bookingId) return;

  const [booking] = await db
    .select({
      id: bookings.id,
      bookingStartAt: bookings.bookingStartAt,
      bookingEndAt: bookings.bookingEndAt,
      vendorAccountId: bookings.vendorAccountId,
      listingId: bookings.listingId,
      googleSyncStatus: bookings.googleSyncStatus,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) return;

  const newStartAt = event.startAt;
  const newEndAt = event.endAt;

  if (!newStartAt || !newEndAt) return;

  const currentStart = booking.bookingStartAt?.getTime();
  const currentEnd = booking.bookingEndAt?.getTime();
  const datesChanged =
    currentStart !== newStartAt.getTime() || currentEnd !== newEndAt.getTime();

  if (!datesChanged) return;

  // Update dates only — price, quantity, and all other fields stay unchanged
  // googleSyncStatus = "webhook_updated" prevents re-sync loop in syncEventHubBookingToGoogleCalendar
  await db
    .update(bookings)
    .set({
      bookingStartAt: newStartAt,
      bookingEndAt: newEndAt,
      googleSyncStatus: "webhook_updated",
    })
    .where(eq(bookings.id, bookingId));

  // Notify the vendor
  await createVendorNotification({
    vendorAccountId,
    type: "google_calendar_booking_updated",
    title: "Booking updated via Google Calendar",
    message: `A booking's dates were changed in Google Calendar. Price is unchanged. Review it in your bookings dashboard.`,
    link: `/vendor/dashboard`,
  }).catch((err) =>
    captureJobError("google_calendar_webhook", err, {
      stage: "notify_booking_updated",
      vendorAccountId,
    })
  );
}

/**
 * Handles deletion of an EventHub booking event in Google Calendar.
 * EventHub does NOT automatically cancel the booking — we notify the vendor
 * to cancel manually so customer status and availability update properly.
 */
async function handleBookingEventDeletion(
  event: NormalizedGoogleCalendarEvent,
  vendorAccountId: string
): Promise<void> {
  const bookingId = asTrimmedString(
    event.extendedProperties?.private?.eventHubBookingId ||
    event.extendedProperties?.shared?.eventHubBookingId
  );
  if (!bookingId) return;

  await createVendorNotification({
    vendorAccountId,
    type: "google_calendar_booking_deleted",
    title: "Google Calendar event removed",
    message: `A booking event was deleted from your Google Calendar. If you want to cancel this booking, please do so in EventHub so availability updates correctly for customers.`,
    link: `/vendor/dashboard`,
  }).catch((err) =>
    captureJobError("google_calendar_webhook", err, {
      stage: "notify_booking_deleted",
      vendorAccountId,
    })
  );
}

/**
 * Handles deletion of an EventHub vacation block event in Google Calendar.
 * Deletes the linked vacation block in EventHub.
 */
async function handleVacationBlockEventDeletion(
  event: NormalizedGoogleCalendarEvent,
  vendorAccountId: string
): Promise<void> {
  const vacationBlockId = asTrimmedString(
    event.extendedProperties?.private?.eventHubVacationBlockId ||
    event.extendedProperties?.shared?.eventHubVacationBlockId
  );
  if (!vacationBlockId) return;

  await db
    .delete(vendorVacationBlocks)
    .where(
      and(
        eq(vendorVacationBlocks.id, vacationBlockId),
        eq(vendorVacationBlocks.vendorId, vendorAccountId)
      )
    );
}

/**
 * Handles a new or updated external Google Calendar event whose title contains
 * "vacation". Auto-creates a vacation block in EventHub if one doesn't exist yet.
 */
async function handleVacationTitleEvent(
  event: NormalizedGoogleCalendarEvent,
  vendorAccountId: string,
  googleCalendarId: string
): Promise<void> {
  // Check if we already have a mapping for this event
  const [existing] = await db
    .select({ id: googleCalendarVacationMappings.id })
    .from(googleCalendarVacationMappings)
    .where(
      and(
        eq(googleCalendarVacationMappings.vendorAccountId, vendorAccountId),
        eq(googleCalendarVacationMappings.googleCalendarId, googleCalendarId),
        eq(googleCalendarVacationMappings.googleEventId, event.id)
      )
    )
    .limit(1);

  if (existing) return; // Already created

  // Determine date range from the event
  const startDate = asTrimmedString(event.start?.date) ||
    (event.startAt ? event.startAt.toISOString().split("T")[0] : null);
  const endDate = asTrimmedString(event.end?.date) ||
    (event.endAt ? event.endAt.toISOString().split("T")[0] : null);

  if (!startDate || !endDate) return;

  // Create the vacation block
  const blockId = crypto.randomUUID();
  await db.insert(vendorVacationBlocks).values({
    id: blockId,
    vendorId: vendorAccountId,
    startDate,
    endDate,
    googleEventId: event.id,
    googleCalendarId,
    source: "google_calendar",
  });

  // Record the mapping so we can delete it later if the event is removed
  await db.insert(googleCalendarVacationMappings).values({
    vendorAccountId,
    googleEventId: event.id,
    googleCalendarId,
    vacationBlockId: blockId,
    mappingSource: "google_calendar",
  }).onConflictDoNothing();
}

/**
 * Handles deletion of an external "vacation" event that was previously mapped
 * to a vacation block. Removes the vacation block and mapping record.
 */
async function handleExternalVacationEventDeletion(
  event: NormalizedGoogleCalendarEvent,
  vendorAccountId: string,
  googleCalendarId: string
): Promise<void> {
  const [mapping] = await db
    .select({ id: googleCalendarVacationMappings.id, vacationBlockId: googleCalendarVacationMappings.vacationBlockId })
    .from(googleCalendarVacationMappings)
    .where(
      and(
        eq(googleCalendarVacationMappings.vendorAccountId, vendorAccountId),
        eq(googleCalendarVacationMappings.googleCalendarId, googleCalendarId),
        eq(googleCalendarVacationMappings.googleEventId, event.id)
      )
    )
    .limit(1);

  if (!mapping) return;

  // CASCADE delete on vacation_block_id will handle the mapping row automatically
  await db
    .delete(vendorVacationBlocks)
    .where(
      and(
        eq(vendorVacationBlocks.id, mapping.vacationBlockId),
        eq(vendorVacationBlocks.vendorId, vendorAccountId)
      )
    );
}

/**
 * Main entry point. Called by both the real webhook route and the dev test route.
 * Processes all changed events for the vendor associated with the given channel.
 */
export async function processGoogleWebhookForChannel(
  vendorAccountId: string,
  channelId: string,
  calendarId: string
): Promise<void> {
  // Fetch the stored sync token (if any)
  const [channelRow] = await db
    .select({ syncToken: googleCalendarWatchChannels.syncToken })
    .from(googleCalendarWatchChannels)
    .where(eq(googleCalendarWatchChannels.channelId, channelId))
    .limit(1);

  const syncToken = asTrimmedString(channelRow?.syncToken);

  let events: NormalizedGoogleCalendarEvent[];
  let nextSyncToken: string | null;

  try {
    const result = await listSelectedGoogleCalendarEventsForVendorAccount(vendorAccountId, {
      syncToken,
    });
    events = result.events;
    nextSyncToken = result.nextSyncToken;
  } catch (err: any) {
    if (err?.code === "google_sync_token_expired") {
      // Sync token expired — do a full re-fetch and store new token
      const result = await listSelectedGoogleCalendarEventsForVendorAccount(vendorAccountId, {
        maxResults: 2500,
      });
      events = result.events;
      nextSyncToken = result.nextSyncToken;
    } else {
      throw err;
    }
  }

  // Persist the new sync token so the next webhook only fetches deltas
  if (nextSyncToken) {
    await updateWatchChannelSyncToken(channelId, nextSyncToken);
  }

  // Process each event
  await Promise.allSettled(
    events.map(async (event) => {
      const deleted = isDeletedEvent(event);

      if (isEventHubBookingEvent(event)) {
        if (deleted) {
          await handleBookingEventDeletion(event, vendorAccountId);
        } else {
          await handleBookingEventChange(event, vendorAccountId);
        }
        return;
      }

      if (isEventHubVacationBlockEvent(event)) {
        if (deleted) {
          await handleVacationBlockEventDeletion(event, vendorAccountId);
        }
        // If updated (not deleted), we don't re-sync date changes from Google
        // for our own vacation blocks — vendor should edit in EventHub dashboard
        return;
      }

      // External vacation event
      if (deleted) {
        await handleExternalVacationEventDeletion(event, vendorAccountId, calendarId);
        return;
      }

      if (isVacationTitle(event.summary)) {
        await handleVacationTitleEvent(event, vendorAccountId, calendarId);
        return;
      }

      // Remaining events are unmatched — the existing unmatched events flow handles them
      // No action needed here; they surface in the vendor dashboard
    })
  );
}

/**
 * Full handler for a POST /api/google/webhooks/calendar request.
 * Extracts headers, validates, deduplicates, and dispatches processing.
 * Always returns 200 quickly — processing happens inline but errors are caught.
 */
export async function handleGoogleCalendarWebhook(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<{ status: "ok"; duplicate?: boolean; skipped?: boolean }> {
  const channelId = String(req.headers["x-goog-channel-id"] || "").trim() || undefined;
  const channelToken = String(req.headers["x-goog-channel-token"] || "").trim() || undefined;
  const messageNumber = String(req.headers["x-goog-message-number"] || "").trim() || undefined;
  const resourceId = String(req.headers["x-goog-resource-id"] || "").trim() || undefined;
  const resourceState = String(req.headers["x-goog-resource-state"] || "").trim() || undefined;

  const validated = await validateGoogleWebhookHeaders({
    channelId,
    channelToken,
    messageNumber,
    resourceId,
    resourceState,
  });

  if (!validated) {
    // Unknown channel — could be a stale notification from a replaced channel. Silently accept.
    return { status: "ok", skipped: true };
  }

  const { channel, messageNumber: msgNum, resourceState: state } = validated;

  // Deduplication — if messageNumber is missing, always process
  if (msgNum) {
    const isNew = await recordNotification(
      channel.vendorAccountId,
      channel.channelId,
      msgNum,
      resourceId || "",
      state || null
    );
    if (!isNew) {
      return { status: "ok", duplicate: true };
    }
  }

  // Initial "sync" ping — just grab the sync token
  if (state === "sync") {
    await handleSyncPing(channel.vendorAccountId, channel.channelId).catch((err) =>
      captureJobError("google_calendar_webhook", err, {
        stage: "sync_ping",
        vendorAccountId: channel.vendorAccountId,
      })
    );
    return { status: "ok" };
  }

  // Actual change notification — process asynchronously but in-process
  await processGoogleWebhookForChannel(
    channel.vendorAccountId,
    channel.channelId,
    channel.calendarId
  ).catch((err) => {
    captureJobError("google_calendar_webhook", err, {
      stage: "process_channel",
      vendorAccountId: channel.vendorAccountId,
      channelId: channel.channelId,
    });
    // Notify vendor of sync error
    createVendorNotification({
      vendorAccountId: channel.vendorAccountId,
      type: "google_calendar_sync_error",
      title: "Google Calendar sync issue",
      message:
        "EventHub encountered an error syncing your Google Calendar. Your calendar is still connected — this may resolve automatically.",
      link: "/vendor/dashboard",
    }).catch(() => {});
  });

  return { status: "ok" };
}
