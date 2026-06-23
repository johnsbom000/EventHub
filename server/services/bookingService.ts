import { db } from "../db";
import { eq, and, ne, desc } from "drizzle-orm";
import { vendorListings } from "@shared/schema";
import { logger } from "../lib/logger";
import { FREE_TIER_MAX_ACTIVE_LISTINGS } from "../lib/constants";
import {
  asTrimmedString,
  parseIntegerValue,
  hasValidListingPrice,
  hasMinimumListingPhotos,
  resolveCanonicalListingCategory,
} from "../lib/routeUtils";
import { sendBookingCancelledEmail } from "../email";
import {
  findOverlappingEventHubBookingsForListing,
  findOverlappingGoogleCalendarEventForListing,
} from "./googleSyncService";

export async function deactivateActiveListingsViolatingPublishGate(accountId?: string): Promise<number> {
  // package_item rows are managed by their parent container's publish/unpublish lifecycle.
  // They have no photos of their own, so they would always fail the photo check here and
  // get incorrectly deactivated. Exclude them entirely.
  const whereClause = accountId
    ? and(eq(vendorListings.status, "active"), eq(vendorListings.accountId, accountId), ne(vendorListings.listingType, "package_item"))
    : and(eq(vendorListings.status, "active"), ne(vendorListings.listingType, "package_item"));

  const activeListings = await db
    .select({
      id: vendorListings.id,
      category: vendorListings.category,
      priceCents: vendorListings.priceCents,
      photos: vendorListings.photos,
      listingData: vendorListings.listingData,
      listingType: vendorListings.listingType,
    })
    .from(vendorListings)
    .where(whereClause);

  const invalidPriceIds = activeListings
    // package_container pricing comes from child package_items — skip the price check
    .filter((listing) => listing.listingType !== "package_container" && !hasValidListingPrice(listing.listingData, listing.priceCents))
    .map((listing) => listing.id);

  const invalidPhotoIds = activeListings
    .filter((listing) => !hasMinimumListingPhotos(listing.listingData, listing.photos))
    .map((listing) => listing.id);

  const invalidCategoryIds = activeListings
    .filter(
      (listing) =>
        !resolveCanonicalListingCategory(listing.listingData, listing.category)
    )
    .map((listing) => listing.id);

  const invalidIds = Array.from(new Set([...invalidPriceIds, ...invalidPhotoIds, ...invalidCategoryIds]));

  for (const listingId of invalidIds) {
    await db
      .update(vendorListings)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(vendorListings.id, listingId));
  }

  if (invalidIds.length > 0) {
    logger.info(
      { count: invalidIds.length, invalidPriceIds: invalidPriceIds.length, invalidPhotoIds: invalidPhotoIds.length, invalidCategoryIds: invalidCategoryIds.length },
      "[listing publish gate] moved active listings to inactive"
    );
  }

  return invalidIds.length;
}

/**
 * Enforces the free-tier active-listing cap when a vendor drops from Pro to Free
 * (subscription canceled or complimentary grant expired). Keeps the newest
 * FREE_TIER_MAX_ACTIVE_LISTINGS active listings and moves the rest to "inactive".
 *
 * Listings are only deactivated, never deleted — the vendor keeps all their data
 * and can re-activate a different one or upgrade to restore them all.
 *
 * package_item rows are excluded (managed by their parent container's lifecycle),
 * matching deactivateActiveListingsViolatingPublishGate and the publish-cap gate.
 */
export async function deactivateExtraActiveListingsForFreeTier(accountId: string): Promise<number> {
  const trimmed = asTrimmedString(accountId);
  if (!trimmed) return 0;

  const activeListings = await db
    .select({ id: vendorListings.id })
    .from(vendorListings)
    .where(
      and(
        eq(vendorListings.accountId, trimmed),
        eq(vendorListings.status, "active"),
        ne(vendorListings.listingType, "package_item")
      )
    )
    .orderBy(desc(vendorListings.createdAt));

  // Keep the newest N; deactivate everything after that.
  const toDeactivate = activeListings.slice(FREE_TIER_MAX_ACTIVE_LISTINGS).map((l) => l.id);

  for (const listingId of toDeactivate) {
    await db
      .update(vendorListings)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(vendorListings.id, listingId));
  }

  if (toDeactivate.length > 0) {
    logger.info(
      { accountId: trimmed, count: toDeactivate.length },
      "[free tier] deactivated extra active listings on downgrade"
    );
  }

  return toDeactivate.length;
}

export async function checkListingAvailabilityForBookingRequest(params: {
  vendorAccountId: string;
  vendorGoogleConnectionStatus?: string | null;
  vendorGoogleCalendarId?: string | null;
  vendorTimeZone?: string | null;
  listingId: string;
  listingTitle: string | null;
  bookingStartAt: Date;
  bookingEndAt: Date;
  requestedQuantity: number;
  listingAvailableQuantity: number;
  excludeBookingId?: string | null;
}) {
  const overlappingEventHubBookings = await findOverlappingEventHubBookingsForListing({
    listingId: params.listingId,
    bookingStartAt: params.bookingStartAt,
    bookingEndAt: params.bookingEndAt,
    excludeBookingId: params.excludeBookingId ?? null,
  });

  const totalReservedUnits = overlappingEventHubBookings.reduce((sum, row) => {
    const quantity = parseIntegerValue(row.quantity);
    return sum + (quantity && quantity > 0 ? quantity : 1);
  }, 0);
  const requestedQuantity = Math.max(1, Math.floor(params.requestedQuantity || 1));
  const listingCapacity = Math.max(1, Math.floor(params.listingAvailableQuantity || 1));
  const capacityExceeded = totalReservedUnits + requestedQuantity > listingCapacity;
  const eventHubConflict = capacityExceeded
    ? {
        id: overlappingEventHubBookings[0]?.id ?? null,
        reservedUnits: totalReservedUnits,
        requestedQuantity,
        availableQuantity: listingCapacity,
      }
    : null;

  const googleEnabled =
    asTrimmedString(params.vendorGoogleConnectionStatus).toLowerCase() === "connected" &&
    asTrimmedString(params.vendorGoogleCalendarId).length > 0;

  const google = await findOverlappingGoogleCalendarEventForListing({
    vendorAccountId: params.vendorAccountId,
    vendorGoogleCalendarId: params.vendorGoogleCalendarId,
    vendorTimeZone: params.vendorTimeZone,
    listingId: params.listingId,
    listingTitle: params.listingTitle,
    bookingStartAt: params.bookingStartAt,
    bookingEndAt: params.bookingEndAt,
    enabled: googleEnabled,
  });

  return {
    eventHub: {
      status: "checked" as const,
      conflict: eventHubConflict,
    },
    google,
  };
}

export async function sendCancellationEmailsAsync(params: {
  booking: {
    id: string;
    customerEmail: string;
    customerName: string;
    vendorEmail: string;
    vendorName: string;
    eventDate: string;
    listingTitle: string;
    totalAmount: number;
  };
  refundCents: number;
  serverUrl: string;
}): Promise<void> {
  const { booking, refundCents, serverUrl } = params;
  try {
    const tasks: Promise<any>[] = [];
    if (booking.customerEmail) {
      tasks.push(
        sendBookingCancelledEmail(booking.customerEmail, {
          recipientName: booking.customerName || "Customer",
          counterpartName: booking.vendorName || "Vendor",
          eventDate: booking.eventDate,
          listingTitle: booking.listingTitle || "Service",
          role: "customer",
          cancelledBy: "customer",
          totalAmountCents: booking.totalAmount,
          refundAmountCents: refundCents,
          serverUrl,
        })
      );
    }
    if (booking.vendorEmail) {
      tasks.push(
        sendBookingCancelledEmail(booking.vendorEmail, {
          recipientName: booking.vendorName || "Vendor",
          counterpartName: booking.customerName || "Customer",
          eventDate: booking.eventDate,
          listingTitle: booking.listingTitle || "Service",
          role: "vendor",
          cancelledBy: "customer",
          serverUrl,
        })
      );
    }
    await Promise.allSettled(tasks);
  } catch (err: any) {
    logger.warn("[cancel email] failed:", err?.message || err);
  }
}
