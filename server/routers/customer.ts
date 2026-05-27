import type { Express } from "express";
import { logger } from "../lib/logger";
import {
  safeGoogleErrorMessage,
  logRouteError,
  respondWithInternalServerError,
  appUrl,
  formatCentsAsDollars,
  toPgTextArray,
} from "../lib/routeHelpers";
import {
  detectUploadedImageFormat,
  decodeImageDataUrlToBuffer,
  persistUploadedImage,
} from "../lib/imageUpload";
import {
  assertCanonicalBookingSchemaReady,
  ensureModerationTable,
  ensureStripeWebhookTable,
  expireStalePendingBookings,
  cancelUnansweredBookingRequests,
  cleanupExpiredStreamChannels,
  runAutoPayoutTick,
  runAutoPayoutTickWithResult,
  startAutoPayoutWorker,
} from "../services/backgroundJobs";
import {
  type VendorProfileContext,
  isGenericProfileName,
  getProfileDisplayName,
  bookingRowMatchesActiveProfile,
  listVendorProfilesForAccount,
  normalizeProfileNamesForAccount,
  getVendorAccountFromRequest,
  requireVendorAccountAuth0,
  requireVendorAuth0,
  resolveActiveVendorProfile,
} from "../services/vendorAuth";
import {
  requireCustomerAnyAuth,
  isMachineGeneratedCustomerName,
  isSyntheticAuth0LocalEmail,
  normalizeIdentityEmailCandidate,
  resolveCanonicalIdentityEmail,
  safelyBackfillCustomerEmail,
  toHumanNameFromEmail,
  resolvePreferredCustomerName,
  resolveVendorBusinessNameForIdentity,
  resolveCustomerAuthFromRequest,
} from "../services/customerAuth";
import {
  ensureStripeCustomer,
  recomputeBookingPaymentStatusInTx,
  markBookingAsPaymentFailedInTx,
  type LockedPaymentPayoutContext,
  loadPaymentPayoutContextForUpdateInTx,
  refreshPaymentPayoutStateInTx,
  processSinglePayoutCandidate,
  ensurePaymentRecordForIntentInTx,
  initializeBookingPayment,
} from "../services/paymentService";
import {
  type VendorListingMatchContext,
  type GoogleEventMappingContext,
  createGoogleOauthState,
  parseGoogleOauthState,
  syncBookingToGoogleCalendarSafely,
  syncExistingBookingsToSelectedGoogleCalendar,
  computeCanonicalBookingTimeRange,
  doTimeRangesOverlap,
  getComparableGoogleEventRange,
  findOverlappingEventHubBookingsForListing,
  escapeRegExp,
  extractGoogleMetadataValueFromDescription,
  normalizeComparableListingTitle,
  loadVendorListingMatchContext,
  loadGoogleEventMappingContext,
  matchGoogleCalendarEventToListing,
  findOverlappingGoogleCalendarEventForListing,
  listGoogleSyncReconciliationCandidatesForVendorAccount,
  listSyncableExistingBookingIdsForVendorAccount,
  buildGoogleBookingReconciliationForVendorAccount,
  runGoogleBookingSyncVerificationForVendorAccount,
} from "../services/googleSyncService";
import {
  getBookingChatContextById,
  listCustomerBookingChatContexts,
  listVendorBookingChatContexts,
} from "../services/chatService";
import {
  deactivateActiveListingsViolatingPublishGate,
  checkListingAvailabilityForBookingRequest,
  sendCancellationEmailsAsync,
} from "../services/bookingService";
import { registerGoogleRoutes } from "../routers/google";
import { registerBoardRoutes } from "../routers/boards";
import { registerCircumventionRoutes } from "../routers/circumvention";
import { registerBookingRoutes } from "../routers/bookings";
import { registerPaymentRoutes } from "../routers/payments";
import { registerMiscRoutes } from "../routers/misc";
import { createNotification, getNotificationsByRecipient, bulkMarkNotificationsRead, markNotificationAsRead } from "../lib/notificationHelpers";
import crypto from "crypto";
import {
  insertEventSchema,
  insertVendorAccountSchema,
  vendorProfiles,
  vendorAccounts,
  vendorListings,
  googleCalendarEventMappings,
  listingTraffic,
  users,
  webTraffic,
  bookings,
  events,
  payments,
  rentalTypes,
  stripeWebhookEvents,
  vendorVacationBlocks,
  googleCalendarVacationMappings,
  planningBoards,
  boardSavedListings,
  circumventionFlags,
  circumventionWarnings,
  vendorSuspensions,
  feedbackSubmissions,
  vendorDiscounts,
  discountListings,
  discountRedemptions,
  notifications,
  listingTranslations,
  listingAddonLinks,
  bookingItems,
  travelFeeProposals,
  type TravelFeeProposal,
  listingReviews,
  reviewReplies,
  vendorReferrals,
} from "@shared/schema";
import {
  requireDualAuthAuth0,
  requireAdminAuth,
  resolveVendorAccountForAuth0Identity,
} from "../auth";
import { requireAuth0, verifyAuth0Token } from "../auth0"; // ✅ Auth0 middleware
import { z } from "zod";
import { db } from "../db";
import { eq, and, or, ne, not, isNull, inArray, sql as drizzleSql, count, sum, gte, lte, desc, asc } from "drizzle-orm";
import multer from "multer";
import { promises as fs } from "fs";
import path from "path";
import {
  sendBookingRequestedEmail,
  sendBookingConfirmedEmail,
  sendBookingCancelledEmail,
  sendNewMessageEmail,
  sendReviewPromptEmail,
  sendCircumventionWarningEmail,
  sendAccountSuspendedEmail,
  sendNewReviewReceivedEmail,
  sendPaymentReceiptEmail,
  sendPayoutProcessedEmail,
  sendListingTakenDownEmail,
  sendVendorWelcomeEmail,
  sendEventDayReminderEmail,
  sendPendingRequestReminderEmail,
  sendSuspensionLiftedEmail,
  sendDisputeFiledEmail,
  sendDisputeVendorRespondedEmail,
  sendDisputeResolvedEmail,
  sendDisputeResponseEmail,
  sendTravelFeeProposedEmail,
  sendTravelFeeRespondedEmail,
  sendMarqueeInviteEmail,
} from "../email";
import { calculateRefund } from "../lib/calculateRefund";
import {
  CancellationPolicy,
  policyFromListingWizard,
} from "../lib/cancellationPolicyPresets";
import { checkContent, blockReasonSummary } from "../../shared/circumvention-detection";
import { translateListingAsync, getListingTranslation, ensureListingTranslation, resolveRequestLanguage } from "../translationService";
import {
  uploadBufferToObjectStorage,
  makeObjectKey,
  resolveStoredUploadPath,
  isObjectStorageConfigured,
  type UploadFolder,
} from "../lib/objectStorage";
import {
  computeChatRetentionExpiry,
  deleteStreamBookingChannel,
  ensureStreamBookingChannel,
  getAverageVendorResponseMinutesForBookings,
  getStreamUnreadCountsForBookings,
  getStreamApiKey,
  isChatExpiredForEventDate,
  isChatWindowClosedForEventDate,
  isStreamChatConfigured,
  sendBookingSystemMessage,
  toStreamUserId,
} from "../streamChat";
import {
  GoogleCalendarConnectionError,
  createGoogleCalendarForVendorAccount,
  createGoogleVacationBlockEvent,
  createVendorNotification,
  deleteGoogleCalendarEvent,
  createGoogleCalendarWatchChannel,
  getGoogleCalendarEvent,
  listGoogleCalendarsForVendorAccount,
  listSelectedGoogleCalendarEventsForVendorAccount,
  renewExpiringGoogleCalendarWatchChannels,
  stopAllGoogleCalendarWatchChannelsForVendor,
  stopGoogleCalendarWatchChannel,
  syncEventHubBookingToGoogleCalendar,
  fetchGoogleAccountEmail,
} from "../google";
import {
  handleGoogleCalendarWebhook,
  processGoogleWebhookForChannel,
} from "../googleWebhookHandler";
import {
  addDaysToIsoDate,
  normalizeIanaTimeZone,
  parseIsoDateValue,
  parseTimeValueToMinutes,
  zonedDateStartToUtc,
  zonedDateTimeToUtc,
} from "../timezone";
import { serializeHobbyList } from "@shared/hobby-tags";
import {
  computePayoutEligibility,
  deriveDisputeWindowCloseAt,
  isDisputeWindowOpen,
  DISPUTE_WINDOW_HOURS,
} from "../payoutEligibility";
import { decryptToken, encryptToken } from "../lib/tokenEncryption";
import { createDbRateLimiter } from "../lib/dbRateLimiter";
import { timezoneFromCoords } from "../lib/timezoneFromCoords";
import { tryAcquireWorkerLock, releaseWorkerLock } from "../lib/workerLocks";
import {
  extractRows,
  toOptionalNumber,
  asTrimmedString,
  parseBooleanInput,
  parseMoneyToCents,
  parseLatLngValue,
  parseIntegerValue,
  normalizePaymentStateValue,
  toCanonicalPaymentStatus,
  isPaymentSucceededStatus,
  isPaymentRefundedOrPartiallyRefundedStatus,
  isPaymentCollectedStatus,
  shouldCountBookingAsInventoryReserved,
  deriveBookingPaymentStatusFromScheduleStatuses,
  estimateStripeProcessingFeeCents,
  normalizeTitleCaseText,
  normalizeProfileNameText,
  clampDescriptionText,
  toUniqueTrimmedStringList,
  normalizeTagEntry,
  normalizeTagsByPropType,
  clampListingDescriptions,
  normalizeListingTitleCandidate,
  normalizeListingCategory,
  isInstantBookingCategory,
  normalizeListingSubcategory,
  normalizeListingSubcategoryDetail,
  normalizeListingClassification,
  resolveBookingLifecycleMode,
  getListingPhotoCount,
  hasMinimumListingPhotos,
  toCanonicalTagList,
  extractListingBasePriceCents,
  hasValidListingPrice,
  getListingPricingUnit,
  getListingMinimumHours,
  getListingAvailableQuantity,
  getListingLogisticsFeeSummaryCents,
  parseAddressLabel,
  haversineDistanceMiles,
  isEventOutsideServiceRadius,
  resolveCanonicalListingCategory,
  isListingPubliclyCompliant,
  mirrorListingQuantityIntoListingData,
  buildCanonicalListingColumns,
  type BookingChatContext,
  hasPaymentAccessForChat,
  normalizeBookingChatContext,
  toConversationPayload,
  deriveVendorSlug,
} from "../lib/routeUtils";
import {
  VENDOR_FEE_RATE,
  CUSTOMER_FEE_RATE,
  MARQUEE_VENDOR_MAX_SPOTS,
  MARQUEE_HOLIDAY_BOOKING_COUNT,
  MARQUEE_HOLIDAY_DAYS,
  MARQUEE_REFERRAL_BONUS_BOOKINGS,
  MARQUEE_VENDOR_FEE_RATE,
  MARQUEE_RATE_MONTHS,
  MARQUEE_CUSTOMER_FEE_RATE,
  MARQUEE_CUSTOMER_FEE_MONTHS,
  MARQUEE_VISIBILITY_MONTHS,
  STRIPE_FEE_ESTIMATE_PERCENT,
  STRIPE_FEE_ESTIMATE_FIXED_CENTS,
  VENDOR_ABSORBS_STRIPE_FEES,
  PAYOUT_RELEASE_MODE,
  AUTO_PAYOUT_INTERVAL_MS,
  BOOKING_PENDING_EXPIRY_MINUTES,
  BOOKING_PENDING_EXPIRY_REASON,
  BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS,
  BOOKING_VENDOR_NO_RESPONSE_REASON,
  MIN_LISTING_PHOTO_COUNT,
  LISTING_DESCRIPTION_MAX_CHARS,
  LISTING_SUBCATEGORY_MAX_CHARS,
  LISTING_SUBCATEGORY_DETAIL_MAX_CHARS,
  LISTING_CATEGORY_VALUES,
  type ListingCategoryValue,
  GOOGLE_OAUTH_STATE_TTL_MS,
  CHAT_POLICY_WARNING,
  SAFE_GOOGLE_ERROR_MESSAGES,
} from "../lib/constants";
import {
  paymentRateLimiter,
  uploadRateLimiter,
  bookingRateLimiter,
  eventsRateLimiter,
  trackRateLimiter,
  onboardingRateLimiter,
  mutationRateLimiter,
  socialRateLimiter,
  messagingRateLimiter,
  boardsRateLimiter,
  adminRateLimiter,
  browseRateLimiter,
} from "../lib/rateLimiters";


export function registerCustomerRoutes(app: Express): void {

  const CUSTOMER_PROFILE_PHOTO_KEY = "_profilePhotoDataUrl";
  const CUSTOMER_PROFILE_PHOTO_DATA_URL_REGEX = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

  const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  };

  const splitCustomerDefaultLocation = (value: unknown) => {
    const record = asRecord(value);
    if (!record) {
      return {
        defaultLocation: null as Record<string, unknown> | null,
        profilePhotoDataUrl: null as string | null,
      };
    }

    const { [CUSTOMER_PROFILE_PHOTO_KEY]: rawPhoto, ...locationOnly } = record;
    const profilePhotoDataUrl =
      typeof rawPhoto === "string" && rawPhoto.trim().length > 0 ? rawPhoto.trim() : null;
    const defaultLocation = Object.keys(locationOnly).length > 0 ? locationOnly : null;

    return {
      defaultLocation,
      profilePhotoDataUrl,
    };
  };

  const composeCustomerDefaultLocation = (
    defaultLocation: Record<string, unknown> | null,
    profilePhotoDataUrl: string | null,
  ) => {
    const merged: Record<string, unknown> = defaultLocation ? { ...defaultLocation } : {};
    if (profilePhotoDataUrl) {
      merged[CUSTOMER_PROFILE_PHOTO_KEY] = profilePhotoDataUrl;
    }
    return Object.keys(merged).length > 0 ? merged : null;
  };

  app.get("/api/customer/me", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const userAccounts = await db.select().from(users).where(eq(users.id, customerAuth.id));

      if (userAccounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const user = userAccounts[0];
      const { defaultLocation, profilePhotoDataUrl } = splitCustomerDefaultLocation(user.defaultLocation);
      const responseEmail =
        normalizeIdentityEmailCandidate(customerAuth.email) ||
        user.email;

      res.json({
        id: user.id,
        name: user.name,
        displayName: user.displayName ?? null,
        profilePhotoDataUrl,
        email: responseEmail,
        role: user.role,
        defaultLocation,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      logRouteError("/api/customer/me", error);
      res.status(500).json({ error: "Unable to load account" });
    }
  });

  const updateCustomerMeSchema = z.object({
    displayName: z.string().trim().min(1).max(120).optional(),
    profilePhotoDataUrl: z
      .string()
      .trim()
      .max(3000000)
      .refine((value) => CUSTOMER_PROFILE_PHOTO_DATA_URL_REGEX.test(value), "Invalid profile photo format")
      .nullable()
      .optional(),
    defaultLocation: z
      .object({
        label: z.string().min(1),
        streetAddress: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .nullable()
      .optional(),
  });

  app.patch("/api/customer/me", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const data = updateCustomerMeSchema.parse(req.body ?? {});
      const existingAccounts = await db.select().from(users).where(eq(users.id, customerAuth.id)).limit(1);
      if (existingAccounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const existing = existingAccounts[0];
      const existingSplit = splitCustomerDefaultLocation(existing.defaultLocation);

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (Object.prototype.hasOwnProperty.call(data, "displayName")) {
        updates.displayName = data.displayName;
      }

      const hasDefaultLocationUpdate = Object.prototype.hasOwnProperty.call(data, "defaultLocation");
      const hasProfilePhotoUpdate = Object.prototype.hasOwnProperty.call(data, "profilePhotoDataUrl");
      if (hasDefaultLocationUpdate || hasProfilePhotoUpdate) {
        const nextDefaultLocation = hasDefaultLocationUpdate
          ? (data.defaultLocation ? ({ ...data.defaultLocation } as Record<string, unknown>) : null)
          : existingSplit.defaultLocation;
        const nextProfilePhotoDataUrl = hasProfilePhotoUpdate
          ? (typeof data.profilePhotoDataUrl === "string" ? data.profilePhotoDataUrl.trim() : null)
          : existingSplit.profilePhotoDataUrl;
        updates.defaultLocation = composeCustomerDefaultLocation(nextDefaultLocation, nextProfilePhotoDataUrl);
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, customerAuth.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Account not found" });
      }
      const { defaultLocation, profilePhotoDataUrl } = splitCustomerDefaultLocation(updated.defaultLocation);

      return res.json({
        id: updated.id,
        name: updated.name,
        displayName: updated.displayName ?? null,
        profilePhotoDataUrl,
        email: updated.email,
        role: updated.role,
        defaultLocation,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Invalid payload" });
    }
  });

  /**
   * PATCH /api/user/language
   * Saves the user's preferred language to their profile.
   * Works for both customer and vendor accounts (both have a users row).
   * Unauthenticated callers are silently ignored — language preference falls
   * back to localStorage on the client.
   */

  /**
   * GET /api/users/me/location
   * Returns the authenticated user's saved location preference.
   * Works for both customers and vendors.
   */

  /**
   * PUT /api/users/me/location
   * Saves the authenticated user's location preference.
   * Works for both customers and vendors. Preserves existing profile photo data.
   * Unauthenticated callers are silently ignored — location falls back to localStorage.
   */

  /**
   * POST /api/customer/me/delete
   * Cancels all active bookings for the customer, then anonymises the account.
   * Booking records are preserved for vendor history — customer_id is SET NULL
   * by the DB FK after the row is deleted, so vendors still see the booking
   * but without personal customer data attached.
   */
  app.post("/api/customer/me/delete", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const userRows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, customerAuth.id))
        .limit(1);
      const user = userRows[0];
      if (!user?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const now = new Date();

      // Cancel all pending or confirmed bookings. The booking must have a
      // payment that has succeeded before a vendor sees it, so pending-only
      // bookings are safe to cancel without a refund flow here.
      const cancelledBookings = await db
        .update(bookings)
        .set({
          status: "cancelled",
          cancellationReason: "customer_account_deleted",
          cancelledAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookings.customerId, user.id),
            drizzleSql`${bookings.status} in ('pending', 'confirmed')`
          )
        )
        .returning({ id: bookings.id });

      // Delete this customer's notifications (no FK constraint means they'd
      // otherwise become orphaned rows after the user row is removed).
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.recipientId, user.id),
            eq(notifications.recipientType, "customer")
          )
        );

      // Delete the user row. Planning boards are deleted by CASCADE.
      // bookings.customer_id and payments.customer_id are SET NULL by FK.
      await db
        .delete(users)
        .where(eq(users.id, user.id));

      return res.json({
        deleted: true,
        bookingsCancelled: cancelledBookings.length,
      });
    } catch (error: any) {
      logRouteError("/api/customer/me/delete", error);
      return res.status(500).json({ error: "Unable to delete account" });
    }
  });

  app.get("/api/customer/messages/conversations", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const rows = await listCustomerBookingChatContexts(customerAuth.id);
      const ACTIVE_BOOKING_STATUSES_C = new Set(["pending", "confirmed", "completed"]);
      const activeRows = rows.filter(
        (row) =>
          row.bookingId.length > 0 &&
          ACTIVE_BOOKING_STATUSES_C.has(String(row.status || "").toLowerCase()) &&
          (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
      );
      const unread = await getStreamUnreadCountsForBookings({
        role: "customer",
        appUserId: customerAuth.id,
        bookingIds: activeRows.map((row) => row.bookingId),
      });
      const conversations = activeRows.map((row) =>
        toConversationPayload("customer", row, unread.counts[row.bookingId] || 0)
      );
      return res.json(conversations);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/customer/messages/unread-count", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const rows = await listCustomerBookingChatContexts(customerAuth.id);
      const ACTIVE_BOOKING_STATUSES_CU = new Set(["pending", "confirmed", "completed"]);
      const paidBookingIds = rows
        .filter(
          (row) =>
            row.bookingId.length > 0 &&
            ACTIVE_BOOKING_STATUSES_CU.has(String(row.status || "").toLowerCase()) &&
            (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
        )
        .map((row) => row.bookingId);
      const unread = await getStreamUnreadCountsForBookings({
        role: "customer",
        appUserId: customerAuth.id,
        bookingIds: paidBookingIds,
      });
      return res.json({ unreadCount: unread.totalUnread });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/customer/messages/:bookingId/bootstrap", messagingRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      if (!isStreamChatConfigured()) {
        return res.status(503).json({ error: "Stream chat is not configured on the server" });
      }

      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const bookingId = String(req.params.bookingId || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const booking = await getBookingChatContextById(bookingId);
      if (!booking || booking.bookingId !== bookingId) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (!booking.customerId || booking.customerId !== customerAuth.id) {
        return res.status(403).json({ error: "You do not have access to this conversation" });
      }
      if (!booking.vendorAccountId) {
        return res.status(400).json({ error: "Booking has no linked vendor account" });
      }
      if (!booking.eventDate) {
        return res.status(400).json({ error: "Booking event date is required for chat retention policy" });
      }

      if (isChatExpiredForEventDate(booking.eventDate)) {
        await deleteStreamBookingChannel(bookingId).catch(() => {
          // If channel did not exist yet, keep response deterministic.
        });
        return res.status(410).json({ error: "Chat expired 30 days after the event date" });
      }

      const streamState = await ensureStreamBookingChannel({
        bookingId,
        eventDate: booking.eventDate,
        eventTitle: booking.eventTitle,
        customerId: booking.customerId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        vendorAccountId: booking.vendorAccountId,
        vendorName: booking.vendorName,
        vendorEmail: booking.vendorEmail,
      });

      const streamUserId = toStreamUserId("customer", booking.customerId);
      const streamToken = streamState.tokenForUser(streamUserId);

      return res.json({
        streamApiKey: getStreamApiKey(),
        streamToken,
        streamUser: {
          id: streamUserId,
          name: booking.customerName || "Customer",
        },
        channel: {
          type: streamState.channelType,
          id: streamState.channelId,
          cid: streamState.channelCid,
        },
        booking: {
          id: booking.bookingId,
          eventDate: booking.eventDate,
          eventTitle: booking.eventTitle,
          counterpartName: booking.vendorName || "Vendor",
        },
        policyWarning: CHAT_POLICY_WARNING,
        retentionExpiresAt: streamState.retentionExpiresAt,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/events", eventsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      const [event] = await db.insert(events).values({ ...validatedData }).returning();
      res.json(event);
    } catch (error: any) {
      logRouteError("/api/events POST", error);
      res.status(400).json({ error: "Invalid event payload" });
    }
  });

  app.get("/api/events/:eventId/recommendations", requireCustomerAnyAuth, async (req, res) => {
    try {
      const [event] = await db.select().from(events).where(eq(events.id, req.params.eventId));
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Real recommendations: return active listings for now (scoring can be added later)
      const listings = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          quantity: vendorListings.quantity,
          listingData: vendorListings.listingData,
          vendorProfileId: vendorListings.profileId,
          vendorAccountId: vendorListings.accountId,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorListings.accountId, vendorAccounts.id))
        .where(
          and(
            eq(vendorListings.status, "active"),
            eq(vendorProfiles.active, true),
            eq(vendorAccounts.active, true)
          )
        )
        .limit(50);

      res.json(listings);
    } catch (error: any) {
      logRouteError("/api/events/:eventId/recommendations", error);
      res.status(500).json({ error: "Unable to load recommendations" });
    }
  });

  async function getCustomerEventOptions(customerId: string): Promise<
    Array<{
      id: string;
      title: string;
      bookingCount: number;
      lastUsedAt: Date | string | null;
    }>
  > {
    const rows: any = await db.execute(drizzleSql`
      select
        e.id as "id",
        coalesce(
          nullif(e.path, ''),
          concat('Event on ', coalesce(b.event_date, e.date, 'TBD'))
        ) as "title",
        count(distinct b.id)::int as "bookingCount",
        max(b.created_at) as "lastUsedAt"
      from events e
      inner join bookings b on b.event_id = e.id
      where b.customer_id = ${customerId}
        and e.event_type = 'custom'
      group by 1, 2
      order by max(b.created_at) desc
    `);

    const raw = extractRows<{
      id?: string;
      title?: string;
      bookingCount?: number | string;
      lastUsedAt?: Date | string | null;
    }>(rows);

    return raw
      .map((r) => ({
        id: String(r.id || "").trim(),
        title: String(r.title || "").trim(),
        bookingCount: Number(r.bookingCount || 0),
        lastUsedAt: r.lastUsedAt ?? null,
      }))
      .filter((r) => r.id.length > 0 && r.title.length > 0);
  }

  app.get("/api/customer/events", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const options = await getCustomerEventOptions(customerAuth.id);
      return res.json(options);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  async function attachCustomerBookingContext<
    T extends {
      id: string;
      eventId?: string | null;
      eventTitle?: string | null;
      listingId?: string | null;
      listingTitleSnapshot?: string | null;
      bookedQuantity?: number | null;
      pricingUnitSnapshot?: string | null;
      unitPriceCentsSnapshot?: number | null;
      deliveryFeeAmountCents?: number | null;
      setupFeeAmountCents?: number | null;
      travelFeeAmountCents?: number | null;
      logisticsTotalCents?: number | null;
      baseSubtotalCents?: number | null;
      subtotalAmountCents?: number | null;
      customerFeeAmountCents?: number | null;
      vendorDisplayName?: string | null;
      vendorBusinessName?: string | null;
    }
  >(rows: T[]) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return rows as Array<
        T & {
          customerEventId?: string | null;
          customerEventTitle?: string | null;
          listingId?: string | null;
          itemTitle?: string | null;
          displayTitle?: string | null;
          bookedQuantity?: number;
          pricingUnitSnapshot?: string | null;
          unitPriceCentsSnapshot?: number | null;
          deliveryFeeAmountCents?: number | null;
          setupFeeAmountCents?: number | null;
          travelFeeAmountCents?: number | null;
          logisticsTotalCents?: number | null;
          baseSubtotalCents?: number | null;
          subtotalAmountCents?: number | null;
          customerFeeAmountCents?: number | null;
          reviewSubmitted?: boolean;
          reviewRating?: number | null;
          reviewBody?: string | null;
        }
      >;
    }

    return Promise.all(
      rows.map(async (row) => {
        const itemRes: any = await db.execute(drizzleSql`
          select
            bi.title,
            bi.listing_id as "listingId",
            bi.item_data as "itemData",
            vl.title as "listingTitle",
            va.business_name as "listingVendorBusinessName",
            nullif(trim(parent_listing.title), '') as "parentListingTitle"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          left join vendor_accounts va on va.id = vl.account_id
          left join vendor_listings parent_listing on parent_listing.id = vl.parent_listing_id
          where bi.booking_id = ${row.id}
          limit 1
        `);
        const [item] = extractRows<{
          title?: string | null;
          listingId?: string | null;
          itemData?: any;
          listingTitle?: string | null;
          listingVendorBusinessName?: string | null;
          parentListingTitle?: string | null;
        }>(itemRes);
        const itemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
        const customerEvent = itemData?.customerEvent && typeof itemData.customerEvent === "object"
          ? itemData.customerEvent
          : null;
        const reviewMeta = itemData?.review && typeof itemData.review === "object"
          ? itemData.review
          : null;

        const customerEventId =
          typeof customerEvent?.id === "string" && customerEvent.id.trim().length > 0
            ? customerEvent.id.trim()
            : row.eventId ?? null;
        const customerEventTitle =
          typeof customerEvent?.title === "string" && customerEvent.title.trim().length > 0
            ? customerEvent.title.trim()
            : row.eventTitle ?? null;
        const itemTitleFromSnapshot = normalizeListingTitleCandidate(row.listingTitleSnapshot);
        const itemTitleFromItem =
          typeof item?.title === "string" && item.title.trim().length > 0
            ? item.title.trim()
            : null;
        const itemTitleFromJson =
          typeof itemData?.listingSnapshot?.title === "string" && itemData.listingSnapshot.title.trim().length > 0
            ? itemData.listingSnapshot.title.trim()
            : null;
        const itemTitleFromListing =
          typeof item?.listingTitle === "string" && item.listingTitle.trim().length > 0
            ? item.listingTitle.trim()
            : null;
        const itemTitle = itemTitleFromSnapshot ?? itemTitleFromItem ?? itemTitleFromJson ?? itemTitleFromListing ?? null;
        const reviewRating =
          typeof reviewMeta?.rating === "number" && Number.isFinite(reviewMeta.rating)
            ? Math.max(1, Math.min(5, Math.round(reviewMeta.rating)))
            : null;
        const reviewBody =
          typeof reviewMeta?.body === "string" && reviewMeta.body.trim().length > 0
            ? reviewMeta.body.trim()
            : null;
        const reviewSubmitted =
          (typeof reviewMeta?.reviewId === "string" && reviewMeta.reviewId.trim().length > 0) ||
          reviewRating !== null ||
          reviewBody !== null;
        const vendorName =
          row.vendorDisplayName ||
          row.vendorBusinessName ||
          (typeof itemData?.vendorDisplayName === "string" && itemData.vendorDisplayName.trim().length > 0
            ? itemData.vendorDisplayName.trim()
            : null) ||
          (typeof itemData?.vendorBusinessName === "string" && itemData.vendorBusinessName.trim().length > 0
            ? itemData.vendorBusinessName.trim()
            : null) ||
          item?.listingVendorBusinessName ||
          "Vendor";
        const parentListingTitle =
          typeof item?.parentListingTitle === "string" && item.parentListingTitle.trim().length > 0
            ? item.parentListingTitle.trim()
            : null;
        const displayTitle = itemTitle ? `${itemTitle} from ${vendorName}` : vendorName;

        return {
          ...row,
          customerEventId,
          customerEventTitle,
          listingId: row.listingId ?? item?.listingId ?? null,
          itemTitle,
          parentListingTitle,
          displayTitle,
          bookedQuantity: Math.max(1, parseIntegerValue(row.bookedQuantity) ?? parseIntegerValue(itemData?.quantity) ?? 1),
          pricingUnitSnapshot: asTrimmedString(row.pricingUnitSnapshot) || null,
          unitPriceCentsSnapshot: parseIntegerValue(row.unitPriceCentsSnapshot),
          deliveryFeeAmountCents: parseIntegerValue(row.deliveryFeeAmountCents),
          setupFeeAmountCents: parseIntegerValue(row.setupFeeAmountCents),
          travelFeeAmountCents: parseIntegerValue(row.travelFeeAmountCents),
          logisticsTotalCents: parseIntegerValue(row.logisticsTotalCents),
          baseSubtotalCents: parseIntegerValue(row.baseSubtotalCents),
          subtotalAmountCents: parseIntegerValue(row.subtotalAmountCents),
          customerFeeAmountCents:
            parseIntegerValue(row.customerFeeAmountCents) ?? parseIntegerValue(itemData?.feePolicy?.customerFeeCents),
          reviewSubmitted,
          reviewRating,
          reviewBody,
        };
      })
    );
  }

  // Booking and Payment Routes (unchanged)
  app.get("/api/customer/bookings", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const rows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.event_id as "eventId",
          b.listing_id as "listingId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.pricing_unit_snapshot as "pricingUnitSnapshot",
          b.unit_price_cents_snapshot as "unitPriceCentsSnapshot",
          b.delivery_fee_amount_cents as "deliveryFeeAmountCents",
          b.setup_fee_amount_cents as "setupFeeAmountCents",
          b.travel_fee_amount_cents as "travelFeeAmountCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          e.path as "eventTitle",
          b.event_date as "eventDate",
          b.event_start_time as "eventStartTime",
          b.event_location as "eventLocation",
          b.created_at as "createdAt",
          coalesce(nullif(u.display_name, ''), nullif(u.name, '')) as "vendorDisplayName",
          coalesce(va.business_name, listing_owner_account.business_name) as "vendorBusinessName"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_accounts va on va.id = b.vendor_account_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join vendor_accounts listing_owner_account on listing_owner_account.id = listing_owner.account_id
        left join users u on u.id = coalesce(va.user_id, listing_owner_account.user_id)
        where b.customer_id = ${customerAuth.id}
          and b.customer_dismissed_at is null
        order by b.created_at desc
      `);
      return res.json(await attachCustomerBookingContext(extractRows(rows) as any));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // DELETE /api/customer/bookings/:id
  // Customer dismisses an expired or failed booking so it no longer appears in their list.
  app.delete("/api/customer/bookings/:id", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const { id: bookingId } = req.params;

      const [booking] = await db
        .select({ id: bookings.id, status: bookings.status, customerId: bookings.customerId })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.customerId !== customerAuth.id) {
        return res.status(403).json({ error: "Not your booking" });
      }
      if (booking.status !== "expired" && booking.status !== "failed") {
        return res.status(400).json({ error: "Only expired or failed bookings can be dismissed" });
      }

      await db
        .update(bookings)
        .set({ customerDismissedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      return res.json({ ok: true });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/customer/bookings/:id", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const { id: bookingId } = req.params;

      const rows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.event_id as "eventId",
          b.listing_id as "listingId",
          b.package_id as "packageId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.pricing_unit_snapshot as "pricingUnitSnapshot",
          b.unit_price_cents_snapshot as "unitPriceCentsSnapshot",
          b.delivery_fee_amount_cents as "deliveryFeeAmountCents",
          b.setup_fee_amount_cents as "setupFeeAmountCents",
          b.travel_fee_amount_cents as "travelFeeAmountCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          b.security_deposit_cents as "securityDepositCents",
          b.event_date as "eventDate",
          b.event_start_time as "eventStartTime",
          b.event_end_time as "eventEndTime",
          b.event_location as "eventLocation",
          b.guest_count as "guestCount",
          b.special_requests as "specialRequests",
          b.created_at as "createdAt",
          b.confirmed_at as "confirmedAt",
          b.cancelled_at as "cancelledAt",
          e.path as "eventTitle",
          coalesce(nullif(u.display_name, ''), nullif(u.name, '')) as "vendorDisplayName",
          coalesce(va.business_name, listing_owner_account.business_name) as "vendorBusinessName"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_accounts va on va.id = b.vendor_account_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join vendor_accounts listing_owner_account on listing_owner_account.id = listing_owner.account_id
        left join users u on u.id = coalesce(va.user_id, listing_owner_account.user_id)
        where b.id = ${bookingId} and b.customer_id = ${customerAuth.id}
      `);

      const extracted = extractRows(rows) as any[];
      if (!extracted.length) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Enrich with booking item data (notes, questions, title)
      const row = extracted[0];
      const itemRes: any = await db.execute(drizzleSql`
        select
          bi.title,
          bi.listing_id as "listingId",
          bi.item_type as "itemType",
          bi.unit_price_cents as "unitPriceCents",
          bi.total_price_cents as "totalPriceCents",
          bi.item_data as "itemData",
          vl.title as "listingTitle",
          va2.business_name as "listingVendorBusinessName"
        from booking_items bi
        left join vendor_listings vl on vl.id = bi.listing_id
        left join vendor_accounts va2 on va2.id = vl.account_id
        where bi.booking_id = ${bookingId}
        order by bi.created_at asc
      `);
      const allItems = extractRows<{
        title?: string | null;
        listingId?: string | null;
        itemType?: string | null;
        unitPriceCents?: number | null;
        totalPriceCents?: number | null;
        itemData?: any;
        listingTitle?: string | null;
        listingVendorBusinessName?: string | null;
      }>(itemRes);
      const item = allItems.find((i) => i.itemType === "base") ?? allItems[0];
      const addonItems = allItems.filter((i) => i.itemType === "addon");
      const itemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
      const customerEventFromItem = itemData?.customerEvent && typeof itemData.customerEvent === "object"
        ? itemData.customerEvent
        : null;
      const itemTitleResolved =
        normalizeListingTitleCandidate(row.listingTitleSnapshot) ??
        normalizeListingTitleCandidate(item?.title) ??
        normalizeListingTitleCandidate(itemData?.listingSnapshot?.title) ??
        normalizeListingTitleCandidate(item?.listingTitle) ??
        null;
      const vendorName =
        row.vendorDisplayName ||
        row.vendorBusinessName ||
        item?.listingVendorBusinessName ||
        "Vendor";
      const customerNotes =
        typeof itemData?.customerNotes === "string" && itemData.customerNotes.trim().length > 0
          ? itemData.customerNotes.trim()
          : typeof row.specialRequests === "string" && row.specialRequests.trim().length > 0
          ? row.specialRequests.trim()
          : null;
      const customerQuestions =
        typeof itemData?.customerQuestions === "string" && itemData.customerQuestions.trim().length > 0
          ? itemData.customerQuestions.trim()
          : null;
      const customerEventTitle =
        typeof customerEventFromItem?.title === "string" && customerEventFromItem.title.trim().length > 0
          ? customerEventFromItem.title.trim()
          : row.eventTitle ?? null;

      // For package bookings, resolve the parent container listing ID so the
      // detail page shows the container (with all packages) instead of the
      // individual package_item listing.
      let resolvedListingId: string | null = row.listingId ?? item?.listingId ?? null;
      if (row.packageId) {
        const parentRows: any = await db.execute(drizzleSql`
          select parent_listing_id as "parentListingId"
          from vendor_listings
          where id = ${row.packageId}
            and listing_type = 'package_item'
          limit 1
        `);
        const [parentRow] = extractRows<{ parentListingId?: string | null }>(parentRows);
        if (parentRow?.parentListingId) {
          resolvedListingId = parentRow.parentListingId;
        }
      }

      return res.json({
        ...row,
        itemTitle: itemTitleResolved,
        displayTitle: itemTitleResolved ? `${itemTitleResolved} from ${vendorName}` : vendorName,
        vendorName,
        customerEventTitle,
        listingId: resolvedListingId,
        bookedQuantity: Math.max(1, parseIntegerValue(row.bookedQuantity) ?? parseIntegerValue(itemData?.quantity) ?? 1),
        customerNotes,
        customerQuestions,
        addOns: addonItems.map((a) => ({
          title: a.title ?? "Add-on",
          priceCents: a.totalPriceCents ?? a.unitPriceCents ?? 0,
        })),
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.patch("/api/customer/bookings/:id/event", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const bookingId = String(req.params.id || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const schema = z.object({
        customerEventId: z.string().optional(),
        customerEventTitle: z.string().max(160).optional(),
        unlink: z.boolean().optional(),
      });
      const data = schema.parse(req.body ?? {});

      // ── Unlink path ───────────────────────────────────────────────────────
      if (data.unlink === true) {
        const [bookingCheck] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)))
          .limit(1);
        if (!bookingCheck?.id) {
          return res.status(404).json({ error: "Booking not found for this customer" });
        }

        await db
          .update(bookings)
          .set({ eventId: null, updatedAt: new Date() })
          .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)));

        await db.execute(drizzleSql`
          update booking_items bi
          set item_data = jsonb_set(
            coalesce(bi.item_data, '{}'::jsonb),
            '{customerEvent}',
            'null'::jsonb,
            true
          )
          where bi.booking_id = ${bookingId}
        `);

        return res.json({ bookingId, customerEvent: null });
      }

      // ── Link / change path ────────────────────────────────────────────────
      const requestedEventId =
        typeof data.customerEventId === "string" && data.customerEventId.trim().length > 0
          ? data.customerEventId.trim()
          : null;
      const requestedEventTitle =
        typeof data.customerEventTitle === "string" && data.customerEventTitle.trim().length > 0
          ? data.customerEventTitle.trim().slice(0, 160)
          : null;

      if (!requestedEventId && !requestedEventTitle) {
        return res.status(400).json({ error: "Provide customerEventId, customerEventTitle, or unlink: true" });
      }

      const [bookingRow] = await db
        .select({
          id: bookings.id,
          eventDate: bookings.eventDate,
          eventStartTime: bookings.eventStartTime,
          eventLocation: bookings.eventLocation,
          guestCount: bookings.guestCount,
        })
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)))
        .limit(1);

      if (!bookingRow?.id) {
        return res.status(404).json({ error: "Booking not found for this customer" });
      }

      let targetEvent: { id: string; title: string } | null = null;

      if (requestedEventId) {
        const ownedEvents = await getCustomerEventOptions(customerAuth.id);
        const matched = ownedEvents.find((e) => e.id === requestedEventId);
        if (!matched) {
          return res.status(400).json({ error: "Selected event not found" });
        }
        targetEvent = { id: matched.id, title: matched.title };
      } else if (requestedEventTitle) {
        const [createdEvent] = await db
          .insert(events)
          .values({
            eventType: "custom",
            location: bookingRow.eventLocation ?? "TBD",
            date: bookingRow.eventDate,
            startTime: bookingRow.eventStartTime ?? "00:00",
            guestCount: bookingRow.guestCount ?? 1,
            vendorsNeeded: ["rentals"],
            path: requestedEventTitle,
            photographerDetails: null,
            videographerDetails: null,
            floristDetails: null,
            cateringDetails: null,
            djDetails: null,
            propDecorDetails: null,
          })
          .returning({ id: events.id, path: events.path });
        if (!createdEvent?.id) {
          return res.status(500).json({ error: "Failed to create event" });
        }
        targetEvent = {
          id: createdEvent.id,
          title: createdEvent.path || requestedEventTitle,
        };
      }

      if (!targetEvent?.id) {
        return res.status(500).json({ error: "Failed to resolve target event" });
      }

      await db
        .update(bookings)
        .set({
          eventId: targetEvent.id,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)));

      await db.execute(drizzleSql`
        update booking_items bi
        set item_data = jsonb_set(
          coalesce(bi.item_data, '{}'::jsonb),
          '{customerEvent}',
          ${JSON.stringify(targetEvent)}::jsonb,
          true
        )
        where bi.booking_id = ${bookingId}
      `);

      return res.json({
        bookingId,
        customerEvent: targetEvent,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/customer/bookings/:id/review", socialRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    const fail = (status: number, message: string): never => {
      const error = new Error(message) as Error & { status?: number };
      error.status = status;
      throw error;
    };

    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const bookingId = String(req.params.id || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const schema = z.object({
        rating: z.number().int().min(1).max(5),
        body: z.string().min(4).max(2000),
      });
      const data = schema.parse(req.body ?? {});
      const reviewBody = data.body.trim();

      if (reviewBody.length < 4) {
        return res.status(400).json({ error: "Review body is too short" });
      }

      const bookingRows: any = await db.execute(drizzleSql`
        select b.id, b.status, b.customer_id as "customerId", b.event_date as "eventDate", b.created_at as "createdAt"
        from bookings b
        where b.id = ${bookingId}
        limit 1
      `);
      const booking = extractRows<{
        id?: string;
        status?: string | null;
        customerId?: string | null;
        eventDate?: string | null;
        createdAt?: string | Date | null;
      }>(bookingRows)[0];

      if (!booking?.id || booking.customerId !== customerAuth.id) {
        return res.status(404).json({ error: "Booking not found for this customer" });
      }
      if (booking.status !== "completed") {
        return res.status(400).json({ error: "Reviews can only be submitted for completed bookings" });
      }

      const reviewResult = await db.transaction(async (tx) => {
        const itemRows: any = await tx.execute(drizzleSql`
          select
            bi.id as "bookingItemId",
            bi.listing_id as "listingId",
            bi.title as "itemTitle",
            bi.item_data as "itemData",
            vl.account_id as "vendorAccountId"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          where bi.booking_id = ${bookingId}
          limit 1
          for update of bi
        `);

        const item = extractRows<{
          bookingItemId?: string | null;
          listingId?: string | null;
          itemTitle?: string | null;
          itemData?: any;
          vendorAccountId?: string | null;
        }>(itemRows)[0];

        if (!item?.bookingItemId || !item?.listingId) {
          fail(400, "Listing not found for this booking");
        }

        const existingItemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
        const existingReview = existingItemData?.review && typeof existingItemData.review === "object"
          ? existingItemData.review
          : null;
        const hasReviewAlready =
          (typeof existingReview?.reviewId === "string" && existingReview.reviewId.trim().length > 0) ||
          (typeof existingReview?.rating === "number" && Number.isFinite(existingReview.rating)) ||
          (typeof existingReview?.body === "string" && existingReview.body.trim().length > 0);

        if (hasReviewAlready) {
          fail(409, "Review already submitted for this booking");
        }

        const titleBase =
          typeof item.itemTitle === "string" && item.itemTitle.trim().length > 0
            ? item.itemTitle.trim()
            : "Listing";
        const reviewTitle = `${data.rating}-star review for ${titleBase}`.slice(0, 160);
        const reviewId = crypto.randomUUID();
        const now = new Date();
        const submittedAt = now.toISOString();

        await tx.execute(drizzleSql`
          insert into listing_reviews (
            id,
            listing_id,
            vendor_account_id,
            user_id,
            rating,
            title,
            body,
            is_published,
            created_at,
            updated_at
          ) values (
            ${reviewId},
            ${item.listingId},
            ${item.vendorAccountId ?? null},
            ${customerAuth.id},
            ${data.rating},
            ${reviewTitle},
            ${reviewBody},
            ${true},
            ${now},
            ${now}
          )
        `);

        const reviewMeta = {
          reviewId,
          bookingId,
          listingId: item.listingId,
          rating: data.rating,
          body: reviewBody,
          submittedAt,
        };

        await tx.execute(drizzleSql`
          update booking_items bi
          set item_data = jsonb_set(
            coalesce(bi.item_data, '{}'::jsonb),
            '{review}',
            ${JSON.stringify(reviewMeta)}::jsonb,
            true
          )
          where bi.id = ${item.bookingItemId}
        `);

        return {
          listingId: item.listingId,
          vendorAccountId: item.vendorAccountId,
          listingTitle: titleBase,
          reviewId,
        };
      });

      // Fire-and-forget: notify vendor of new review (email + in-app)
      void (async () => {
        try {
          if (!reviewResult.vendorAccountId) return;
          const serverUrl = appUrl();
          const [vendorRow] = await db
            .select({ email: vendorAccounts.email, businessName: vendorAccounts.businessName })
            .from(vendorAccounts)
            .where(eq(vendorAccounts.id, reviewResult.vendorAccountId))
            .limit(1);
          const [customerRow] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, customerAuth.id))
            .limit(1);
          const stars = "★".repeat(data.rating) + "☆".repeat(5 - data.rating);
          await createNotification({
            recipientId: reviewResult.vendorAccountId,
            recipientType: "vendor",
            type: "review_received",
            title: "New review received",
            message: `${customerRow?.name || "A customer"} left a ${data.rating}-star review (${stars}) for ${reviewResult.listingTitle}.`,
            link: `/vendor/reviews`,
            read: false,
          });
          if (vendorRow?.email) {
            await sendNewReviewReceivedEmail(vendorRow.email, {
              recipientName: vendorRow.businessName || "Vendor",
              reviewerName: customerRow?.name || "Customer",
              listingTitle: reviewResult.listingTitle,
              rating: data.rating,
              reviewText: reviewBody,
              serverUrl,
            });
          }
        } catch (emailError: any) {
          logger.warn("[review email] failed:", emailError?.message || emailError);
        }
      })();

      return res.json({
        bookingId,
        listingId: reviewResult.listingId,
        reviewId: reviewResult.reviewId,
        rating: data.rating,
        body: reviewBody,
      });
    } catch (error: any) {
      // Only surface error.message when it was thrown by our fail() helper (has explicit status).
      // Unexpected errors (DB failures, etc.) go through the safe internal-error handler.
      if (typeof error?.status !== "number") {
        return respondWithInternalServerError(req, res, error);
      }
      const status = error.status;
      if (status >= 500) {
        return respondWithInternalServerError(req, res, error);
      }
      return res.status(status).json({ error: error.message });
    }
  });

  // Legacy endpoint removed — use POST /api/customer/disputes instead.

  app.post("/_removed/api/customer/bookings/:id/dispute", socialRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    return res.status(410).json({ error: "This endpoint has been removed. Use POST /api/customer/disputes." });
  });


  // ── Customer Notifications ─────────────────────────────────────────────────

  app.get("/api/customer/notifications", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.json([]);
      const notifs = await getNotificationsByRecipient(customerAuth.id, "customer");
      res.json(notifs);
    } catch (err: any) {
      logRouteError("/api/customer/notifications", err);
      res.status(500).json({ error: "Unable to load notifications" });
    }
  });

  app.get("/api/customer/notifications/unread-count", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.json({ unreadCount: 0 });
      const notifs = await getNotificationsByRecipient(customerAuth.id, "customer");
      const unreadCount = notifs.filter((n: any) => !n.read).length;
      res.json({ unreadCount });
    } catch (err: any) {
      logRouteError("/api/customer/notifications/unread-count", err);
      res.status(500).json({ unreadCount: 0 });
    }
  });

  app.patch("/api/customer/notifications/bulk/read", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });
      const { ids } = req.body as { ids?: unknown };
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return res.status(400).json({ error: "ids must be an array of strings" });
      }
      const updated = await bulkMarkNotificationsRead(ids, customerAuth.id, "customer");
      res.json({ updated });
    } catch (err: any) {
      logRouteError("/api/customer/notifications/bulk/read", err);
      res.status(500).json({ error: "Unable to mark notifications as read" });
    }
  });

  app.patch("/api/customer/notifications/:id/read", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });
      const updated = await markNotificationAsRead(req.params.id, customerAuth.id, "customer");
      if (!updated) return res.status(404).json({ error: "Notification not found" });
      res.json({ success: true });
    } catch (err: any) {
      logRouteError("/api/customer/notifications/:id/read", err);
      res.status(500).json({ error: "Unable to update notification" });
    }
  });


  // ── Dispute Case System ────────────────────────────────────────────────────

  /**
   * Shared helper: find or create a dispute_cases row for a booking.
   * Returns { caseId }.
   */
  async function findOrCreateDisputeCase(bookingId: string): Promise<string> {
    const existing = await db.execute(drizzleSql`
      SELECT id FROM dispute_cases WHERE booking_id = ${bookingId} LIMIT 1
    `);
    if (existing.rows[0]) return String((existing.rows[0] as any).id);

    const inserted = await db.execute(drizzleSql`
      INSERT INTO dispute_cases (booking_id, status, response_deadline_at, created_at, updated_at)
      VALUES (${bookingId}, 'open', now() + interval '72 hours', now(), now())
      ON CONFLICT (booking_id) DO UPDATE SET updated_at = now()
      RETURNING id
    `);
    return String((inserted.rows[0] as any).id);
  }


  app.get("/api/customer/disputes", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const rows = await db.execute(drizzleSql`
        SELECT
          dc.id                  AS case_id,
          dc.booking_id,
          dc.status              AS case_status,
          dc.resolution,
          dc.resolved_at,
          dc.response_deadline_at,
          dc.created_at          AS case_created_at,
          dc.updated_at          AS case_updated_at,
          b.event_date,
          b.listing_title_snapshot,
          b.status               AS booking_status,
          va.business_name       AS vendor_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        WHERE b.customer_id = ${customerAuth.id}
        ORDER BY dc.updated_at DESC
        LIMIT 100
      `);

      const cases = rows.rows as any[];
      if (cases.length === 0) return res.json([]);

      const caseIds = cases.map((c: any) => c.case_id);
      const filingsRows = await db.execute(drizzleSql`
        SELECT
          df.id, df.case_id, df.filed_by, df.dispute_type,
          df.description, df.attachment_urls, df.claim_amount_cents,
          df.is_response, df.created_at,
          u.name           AS filer_customer_name,
          va.business_name AS filer_vendor_name
        FROM dispute_filings df
        LEFT JOIN users u ON u.id = df.filer_customer_id
        LEFT JOIN vendor_accounts va ON va.id = df.filer_vendor_account_id
        WHERE df.case_id = ANY(${toPgTextArray(caseIds)}::text[])
        ORDER BY df.created_at ASC
      `);

      const filingsByCaseId: Record<string, any[]> = {};
      for (const f of filingsRows.rows as any[]) {
        if (!filingsByCaseId[f.case_id]) filingsByCaseId[f.case_id] = [];
        filingsByCaseId[f.case_id].push(f);
      }

      return res.json(cases.map((c: any) => ({
        ...c,
        filings: filingsByCaseId[c.case_id] ?? [],
      })));
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * POST /api/customer/disputes
   * Customer files a new dispute filing.
   */
  app.post("/api/customer/disputes", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const payload = z.object({
        bookingId: z.string().min(1),
        disputeType: z.enum(["service_not_as_described", "vendor_no_show", "safety_concern", "other"]),
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
        claimAmountCents: z.number().int().positive().optional(),
      }).parse(req.body ?? {});

      const bookingResult = await db.execute(drizzleSql`
        SELECT id, status, customer_id, vendor_account_id,
               listing_title_snapshot, event_date, booking_end_at
        FROM bookings
        WHERE id = ${payload.bookingId}
          AND customer_id = ${customerAuth.id}
        LIMIT 1
      `);
      const bk = bookingResult.rows[0] as any;
      if (!bk) return res.status(404).json({ error: "Booking not found" });
      const allowedStatuses = ["pending", "confirmed", "completed", "cancelled"];
      if (!allowedStatuses.includes(bk.status)) {
        return res.status(400).json({ error: "Disputes can only be filed on active or closed bookings" });
      }

      // Event must have ended and dispute window must still be open
      if (bk.booking_end_at) {
        const endAt = new Date(bk.booking_end_at);
        const now = new Date();
        if (now < endAt) {
          return res.status(400).json({ error: "Disputes can only be filed after the event has ended" });
        }
        if (!isDisputeWindowOpen(endAt, now)) {
          return res.status(400).json({
            error: `Dispute window closed. Disputes are only allowed within ${DISPUTE_WINDOW_HOURS} hours after event completion.`,
          });
        }
      }

      // Block filing on an already-resolved case
      const existingCaseResult = await db.execute(drizzleSql`
        SELECT id, status FROM dispute_cases WHERE booking_id = ${payload.bookingId} LIMIT 1
      `);
      const existingCase = existingCaseResult.rows[0] as any;
      if (existingCase?.status === "resolved") {
        return res.status(409).json({ error: "This dispute has already been resolved" });
      }

      const caseId = await findOrCreateDisputeCase(payload.bookingId);

      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_customer_id,
          dispute_type, description, attachment_urls, claim_amount_cents,
          created_at, updated_at
        ) VALUES (
          ${caseId}, ${payload.bookingId}, 'customer',
          ${customerAuth.id},
          ${payload.disputeType}, ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[], ${payload.claimAmountCents ?? null},
          now(), now()
        )
        RETURNING *
      `);

      await db
        .update(payments)
        .set({ payoutStatus: "blocked", payoutBlockedReason: "customer_dispute_open" })
        .where(eq(payments.bookingId, payload.bookingId));

      return res.status(201).json({ caseId, filing: (filing.rows[0] as any) });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * POST /api/vendor/disputes/:caseId/respond
   * Vendor submits a one-time response to a customer-initiated dispute case.
   * Blocked if: case is resolved, deadline passed, vendor already responded,
   * or the original filing was from the vendor (can't respond to your own).
   */
  app.post("/api/vendor/disputes/:caseId/respond", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

      const caseId = asTrimmedString(req.params?.caseId);
      if (!caseId) return res.status(400).json({ error: "Case id required" });

      const payload = z.object({
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
      }).parse(req.body ?? {});

      // Load the case and verify it belongs to this vendor's booking
      const caseResult = await db.execute(drizzleSql`
        SELECT
          dc.id, dc.status, dc.response_deadline_at,
          b.vendor_account_id,
          b.listing_title_snapshot,
          b.event_date,
          cust.email AS customer_email,
          cust.name  AS customer_name,
          va.business_name AS vendor_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN users cust ON cust.id = b.customer_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        WHERE dc.id = ${caseId}
        LIMIT 1
      `);
      const dc = caseResult.rows[0] as any;
      if (!dc) return res.status(404).json({ error: "Dispute case not found" });
      if (dc.vendor_account_id !== account.id) return res.status(403).json({ error: "Access denied" });
      if (dc.status === "resolved") return res.status(409).json({ error: "This dispute has already been resolved" });

      const now = new Date();
      if (dc.response_deadline_at && now > new Date(dc.response_deadline_at)) {
        return res.status(409).json({ error: "The 72-hour response window for this dispute has closed" });
      }

      // Check all filings: ensure at least one is from a customer, and vendor hasn't already responded
      const filingsResult = await db.execute(drizzleSql`
        SELECT filed_by, is_response FROM dispute_filings WHERE case_id = ${caseId}
      `);
      const filings = filingsResult.rows as any[];
      const hasCustomerFiling = filings.some((f: any) => f.filed_by === "customer");
      const vendorAlreadyResponded = filings.some((f: any) => f.filed_by === "vendor" && f.is_response === true);

      if (!hasCustomerFiling) {
        return res.status(409).json({ error: "There is no customer filing to respond to" });
      }
      if (vendorAlreadyResponded) {
        return res.status(409).json({ error: "You have already submitted a response to this dispute" });
      }

      // Insert the response filing
      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_vendor_account_id,
          dispute_type, description, attachment_urls,
          is_response, created_at, updated_at
        )
        SELECT
          ${caseId}, dc.booking_id, 'vendor',
          ${account.id},
          'response_to_dispute', ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[],
          true, now(), now()
        FROM dispute_cases dc WHERE dc.id = ${caseId}
        RETURNING *
      `);

      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      // Notify the customer that the vendor has responded
      if (dc.customer_email) {
        sendDisputeResponseEmail(dc.customer_email, {
          recipientName: asTrimmedString(dc.customer_name) || "Customer",
          otherPartyName: asTrimmedString(dc.vendor_name) || "Vendor",
          listingTitle: asTrimmedString(dc.listing_title_snapshot) || "Your booking",
          eventDate: asTrimmedString(dc.event_date) || "N/A",
          serverUrl: appUrl(),
        }).catch(() => {});
      }

      return res.status(201).json({ caseId, filing: filing.rows[0] });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * POST /api/customer/disputes/:caseId/respond
   * Customer submits a one-time response to a vendor-initiated dispute case.
   * Blocked if: case is resolved, deadline passed, customer already responded,
   * or the original filing was from the customer (can't respond to your own).
   */
  app.post("/api/customer/disputes/:caseId/respond", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const caseId = asTrimmedString(req.params?.caseId);
      if (!caseId) return res.status(400).json({ error: "Case id required" });

      const payload = z.object({
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
      }).parse(req.body ?? {});

      // Load the case and verify it belongs to this customer's booking
      const caseResult = await db.execute(drizzleSql`
        SELECT
          dc.id, dc.status, dc.response_deadline_at,
          b.customer_id,
          b.listing_title_snapshot,
          b.event_date,
          cust.name AS customer_name,
          va.email  AS vendor_email,
          va.business_name AS vendor_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN users cust ON cust.id = b.customer_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        WHERE dc.id = ${caseId}
        LIMIT 1
      `);
      const dc = caseResult.rows[0] as any;
      if (!dc) return res.status(404).json({ error: "Dispute case not found" });
      if (dc.customer_id !== customerAuth.id) return res.status(403).json({ error: "Access denied" });
      if (dc.status === "resolved") return res.status(409).json({ error: "This dispute has already been resolved" });

      const now = new Date();
      if (dc.response_deadline_at && now > new Date(dc.response_deadline_at)) {
        return res.status(409).json({ error: "The 72-hour response window for this dispute has closed" });
      }

      // Check all filings: ensure at least one is from a vendor, and customer hasn't already responded
      const filingsResult = await db.execute(drizzleSql`
        SELECT filed_by, is_response FROM dispute_filings WHERE case_id = ${caseId}
      `);
      const filings = filingsResult.rows as any[];
      const hasVendorFiling = filings.some((f: any) => f.filed_by === "vendor");
      const customerAlreadyResponded = filings.some((f: any) => f.filed_by === "customer" && f.is_response === true);

      if (!hasVendorFiling) {
        return res.status(409).json({ error: "There is no vendor filing to respond to" });
      }
      if (customerAlreadyResponded) {
        return res.status(409).json({ error: "You have already submitted a response to this dispute" });
      }

      // Insert the response filing
      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_customer_id,
          dispute_type, description, attachment_urls,
          is_response, created_at, updated_at
        )
        SELECT
          ${caseId}, dc.booking_id, 'customer',
          ${customerAuth.id},
          'response_to_dispute', ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[],
          true, now(), now()
        FROM dispute_cases dc WHERE dc.id = ${caseId}
        RETURNING *
      `);

      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      // Notify the vendor that the customer has responded
      if (dc.vendor_email) {
        sendDisputeResponseEmail(dc.vendor_email, {
          recipientName: asTrimmedString(dc.vendor_name) || "Vendor",
          otherPartyName: asTrimmedString(dc.customer_name) || "Customer",
          listingTitle: asTrimmedString(dc.listing_title_snapshot) || "Your booking",
          eventDate: asTrimmedString(dc.event_date) || "N/A",
          serverUrl: appUrl(),
        }).catch(() => {});
      }

      return res.status(201).json({ caseId, filing: filing.rows[0] });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * GET /api/vendor/disputes/bookings
   * Returns the vendor's bookings eligible to have a dispute filed (pending/confirmed/completed/cancelled).
   */
  app.get("/api/vendor/disputes/bookings", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

      const rows = await db.execute(drizzleSql`
        SELECT
          b.id, b.status, b.event_date, b.booking_end_at, b.listing_title_snapshot,
          b.total_amount, b.vendor_payout, b.platform_fee, b.base_subtotal_cents,
          b.delivery_fee_amount_cents, b.setup_fee_amount_cents, b.travel_fee_amount_cents,
          b.discount_amount_cents, b.security_deposit_cents,
          b.booked_quantity, b.unit_price_cents_snapshot, b.pricing_unit_snapshot,
          u.name AS customer_name,
          dc.id  AS existing_case_id
        FROM bookings b
        LEFT JOIN users u ON u.id = b.customer_id
        LEFT JOIN dispute_cases dc ON dc.booking_id = b.id
        WHERE b.vendor_account_id = ${account.id}
          AND b.status IN ('pending', 'confirmed', 'completed', 'cancelled')
          AND (
            b.booking_end_at IS NULL
            OR (now() >= b.booking_end_at AND now() < b.booking_end_at + INTERVAL '72 hours')
          )
        ORDER BY
          CASE b.status
            WHEN 'pending'   THEN 1
            WHEN 'confirmed' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'cancelled' THEN 4
            ELSE 5
          END,
          b.event_date DESC NULLS LAST
        LIMIT 200
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * GET /api/customer/disputes/bookings
   * Returns the customer's bookings eligible to have a dispute filed.
   */
  app.get("/api/customer/disputes/bookings", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const rows = await db.execute(drizzleSql`
        SELECT
          b.id, b.status, b.event_date, b.booking_end_at, b.listing_title_snapshot,
          b.total_amount, b.base_subtotal_cents, b.customer_fee_amount_cents,
          b.delivery_fee_amount_cents, b.setup_fee_amount_cents, b.travel_fee_amount_cents,
          b.discount_amount_cents, b.security_deposit_cents,
          b.booked_quantity, b.unit_price_cents_snapshot, b.pricing_unit_snapshot,
          va.business_name AS vendor_name,
          dc.id            AS existing_case_id
        FROM bookings b
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        LEFT JOIN dispute_cases dc ON dc.booking_id = b.id
        WHERE b.customer_id = ${customerAuth.id}
          AND b.status IN ('pending', 'confirmed', 'completed', 'cancelled')
          AND (
            b.booking_end_at IS NULL
            OR (now() >= b.booking_end_at AND now() < b.booking_end_at + INTERVAL '72 hours')
          )
        ORDER BY
          CASE b.status
            WHEN 'pending'   THEN 1
            WHEN 'confirmed' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'cancelled' THEN 4
            ELSE 5
          END,
          b.event_date DESC NULLS LAST
        LIMIT 200
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  app.get("/api/customer/bookings/:bookingId/addon-items", requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });
      const { bookingId } = req.params;
      const owns = await db.execute(drizzleSql`SELECT id FROM bookings WHERE id = ${bookingId} AND customer_id = ${customerAuth.id} LIMIT 1`);
      if (!owns.rows[0]) return res.status(403).json({ error: "Not authorized" });
      const rows = await db.execute(drizzleSql`
        SELECT title, unit_price_cents, total_price_cents
        FROM booking_items
        WHERE booking_id = ${bookingId} AND item_type = 'addon'
        ORDER BY created_at ASC
      `);
      return res.json((rows.rows as any[]).map(r => ({
        title: r.title ?? "Add-on",
        priceCents: r.total_price_cents ?? r.unit_price_cents ?? 0,
      })));
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });
}
