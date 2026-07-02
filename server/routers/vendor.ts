import type { Express } from "express";
import { createServer, type Server } from "http";
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
  listVendorInquiryChannels,
} from "../services/chatService";
import {
  deactivateActiveListingsViolatingPublishGate,
  deactivateExtraActiveListingsForFreeTier,
  checkListingAvailabilityForBookingRequest,
  sendCancellationEmailsAsync,
} from "../services/bookingService";
import { getVendorEntitlements } from "../services/entitlementsService";
import { reconcileVendorSubscriptionState } from "./billing";
import { registerGoogleRoutes } from "../routers/google";
import { registerBoardRoutes } from "../routers/boards";
import { registerCircumventionRoutes } from "../routers/circumvention";
import { registerBookingRoutes } from "../routers/bookings";
import { registerPaymentRoutes } from "../routers/payments";
import { registerMiscRoutes } from "../routers/misc";
import {
  VENDOR_BOOKING_NOTIFICATION_TYPES,
  createNotification,
  getNotificationsByRecipient,
  getUnreadNotificationCountByTypes,
  markUnreadNotificationsReadByTypes,
  bulkMarkNotificationsRead,
  bulkArchiveNotifications,
  markNotificationAsRead,
  markAllNotificationsSeen,
} from "../lib/notificationHelpers";
import crypto from "crypto";
import {
  insertVendorAccountSchema,
  vendorProfiles,
  vendorAccounts,
  vendorListings,
  googleCalendarEventMappings,
  listingTraffic,
  users,
  webTraffic,
  bookings,
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
  vendorInquiries,
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
  ensureStreamInquiryChannel,
  promoteInquiryToBookingChannel,
  getAverageVendorResponseMinutesForBookings,
  getStreamUnreadCountsForBookings,
  getStreamUnreadCountsForChannels,
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
import { logEvent } from "../lib/events";
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
  toInquiryConversationPayload,
  deriveVendorSlug,
} from "../lib/routeUtils";
import {
  VENDOR_FEE_RATE,
  CUSTOMER_FEE_RATE,
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
import { handleCircumventionViolation, getActiveSuspension } from "./circumvention";


async function allocateUniqueVendorSlug(name: string, excludeId?: string): Promise<string> {
  const base = deriveVendorSlug(name);
  let candidate = base || "vendor";
  let suffix = 2;
  while (true) {
    const [existing] = await db
      .select({ id: vendorAccounts.id })
      .from(vendorAccounts)
      .where(and(eq(vendorAccounts.shopSlug, candidate), isNull(vendorAccounts.deletedAt)))
      .limit(1);
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export function registerVendorRoutes(app: Express): void {
  const vendorShopUploadsDir = path.join(process.cwd(), "server/uploads/vendor-shops");

  const updateVendorProfileSchema = z
    .object({
      profileName: z.string().min(2).max(120).optional(),
      experience: z.number().int().optional(),
      qualifications: z.array(z.string()).optional(),
      onlineProfiles: z.any().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      travelMode: z.string().optional(),
      serviceRadius: z.number().nullable().optional(),
      serviceAddress: z.string().nullable().optional(),
      operatingTimezone: z.string().optional(),
      photos: z.array(z.string()).optional(),
      galleryPhotos: z.array(z.string()).optional(),
      serviceDescription: z.string().optional(),
    })
    .passthrough();

  function toNonNegativeInt(value: unknown, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
  }

  function normalizeSpecialties(value: unknown): string[] {
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
            .slice(0, 24)
        )
      );
    }

    if (typeof value === "string") {
      return Array.from(
        new Set(
          value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 24)
        )
      );
    }

    return [];
  }

  function normalizePhotoPosition(value: unknown): { x: number; y: number } | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rawX = Number((value as { x?: unknown }).x);
    const rawY = Number((value as { y?: unknown }).y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
    return {
      x: Math.max(-1, Math.min(1, rawX)),
      y: Math.max(-1, Math.min(1, rawY)),
    };
  }

  // Stripe Connect onboarding routes ✅ Auth0-only now
  // accountType is optional — V2 Connect uses a unified "recipient" configuration,
  // so new accounts do not need an explicit type. Kept for backward compatibility
  // with any existing UI that still sends the field.
  const stripeOnboardingSchema = z.object({
    accountType: z.enum(["express", "standard", "recipient"]).optional(),
    businessName: z.string().min(2),
  });

  async function attachBookingItemContext<
    T extends {
      id: string;
      specialRequests?: string | null;
      eventTitle?: string | null;
      listingTitleSnapshot?: string | null;
      listingId?: string | null;
      bookedQuantity?: number | null;
      deliveryFeeAmountCents?: number | null;
      setupFeeAmountCents?: number | null;
      travelFeeAmountCents?: number | null;
      logisticsTotalCents?: number | null;
      baseSubtotalCents?: number | null;
      subtotalAmountCents?: number | null;
      customerFeeAmountCents?: number | null;
    }
  >(rows: T[]) {
    if (!Array.isArray(rows) || rows.length === 0) return rows as Array<T & {
      itemTitle?: string | null;
      customerNotes?: string | null;
      customerQuestions?: string | null;
      listingDescription?: string | null;
      listingId?: string | null;
      listingProfileId?: string | null;
      bookedQuantity?: number;
      deliveryFeeAmountCents?: number | null;
      setupFeeAmountCents?: number | null;
      travelFeeAmountCents?: number | null;
      logisticsTotalCents?: number | null;
      baseSubtotalCents?: number | null;
      subtotalAmountCents?: number | null;
      customerFeeAmountCents?: number | null;
      includedItems?: string[];
      deliveryIncluded?: boolean | null;
      setupIncluded?: boolean | null;
      addOnItems?: { title: string; priceCents: number }[];
      travelFeeProposal?: { id: string; status: string; amountCents: number; reason: string | null } | null;
    }>;

    return Promise.all(
      rows.map(async (row) => {
        const itemRes: any = await db.execute(drizzleSql`
          select
            bi.item_type as "itemType",
            bi.title,
            bi.unit_price_cents as "unitPriceCents",
            bi.total_price_cents as "totalPriceCents",
            bi.listing_id as "listingId",
            bi.item_data as "itemData",
            vl.title as "listingTitle",
            vl.description as "listingDescription",
            vl.whats_included as "listingWhatsIncluded",
            vl.delivery_offered as "deliveryOffered",
            vl.setup_offered as "setupOffered",
            vl.profile_id as "listingProfileId",
            nullif(trim(parent_listing.title), '') as "parentListingTitle"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          left join vendor_listings parent_listing on parent_listing.id = vl.parent_listing_id
          where bi.booking_id = ${row.id}
          order by bi.item_type = 'base' desc
        `);
        const allBookingItems = extractRows<{
          itemType?: string | null;
          unitPriceCents?: number | null;
          totalPriceCents?: number | null;
          title?: string | null;
          listingId?: string | null;
          itemData?: any;
          listingTitle?: string | null;
          listingDescription?: string | null;
          listingWhatsIncluded?: string[] | null;
          deliveryOffered?: boolean | null;
          setupOffered?: boolean | null;
          listingProfileId?: string | null;
          parentListingTitle?: string | null;
        }>(itemRes);
        const item = allBookingItems.find(i => i.itemType !== "addon") ?? allBookingItems[0];
        const addOnItems: { title: string; priceCents: number }[] = allBookingItems
          .filter(i => i.itemType === "addon")
          .map(i => ({ title: i.title ?? "Add-on", priceCents: i.totalPriceCents ?? i.unitPriceCents ?? 0 }));
        const itemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
        const listingSnapshot =
          itemData?.listingSnapshot && typeof itemData.listingSnapshot === "object"
            ? itemData.listingSnapshot
            : {};
        const itemLogisticsFees =
          itemData?.logisticsFees && typeof itemData.logisticsFees === "object"
            ? itemData.logisticsFees
            : {};

        const itemTitleFromBookingSnapshot = normalizeListingTitleCandidate((row as any)?.listingTitleSnapshot);
        const itemTitleFromItem = normalizeListingTitleCandidate(item?.title);
        const itemTitleFromItemData =
          normalizeListingTitleCandidate(itemData?.listingTitle) ??
          normalizeListingTitleCandidate(listingSnapshot?.title);
        const itemTitleFromListing = normalizeListingTitleCandidate(item?.listingTitle);
        const resolvedItemTitle =
          itemTitleFromBookingSnapshot ?? itemTitleFromItem ?? itemTitleFromItemData ?? itemTitleFromListing;

        const notesFromItem =
          typeof itemData?.customerNotes === "string" && itemData.customerNotes.trim().length > 0
            ? itemData.customerNotes.trim()
            : null;
        const questionsFromItem =
          typeof itemData?.customerQuestions === "string" && itemData.customerQuestions.trim().length > 0
            ? itemData.customerQuestions.trim()
            : null;
        const customerEventTitleFromItem =
          typeof itemData?.customerEvent?.title === "string" && itemData.customerEvent.title.trim().length > 0
            ? itemData.customerEvent.title.trim()
            : null;
        const notesFallback =
          typeof row.specialRequests === "string" && row.specialRequests.trim().length > 0
            ? row.specialRequests.trim()
            : null;
        const descriptionFromSnapshot =
          typeof listingSnapshot?.listingDescription === "string" && listingSnapshot.listingDescription.trim().length > 0
            ? listingSnapshot.listingDescription.trim()
            : null;
        const descriptionFromTypedListing =
          typeof item?.listingDescription === "string" && item.listingDescription.trim().length > 0
            ? item.listingDescription.trim()
            : null;
        const normalizedIncluded = Array.from(
          new Set(
            [
              ...(Array.isArray(item?.listingWhatsIncluded) ? item.listingWhatsIncluded : []),
              ...(Array.isArray(listingSnapshot?.included) ? listingSnapshot.included : []),
              ...(Array.isArray(listingSnapshot?.includedItems) ? listingSnapshot.includedItems : []),
            ]
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter((entry) => entry.length > 0)
          )
        );
        const deliveryIncluded =
          typeof item?.deliveryOffered === "boolean"
            ? item.deliveryOffered
            : typeof listingSnapshot?.deliveryIncluded === "boolean"
              ? listingSnapshot.deliveryIncluded
              : null;
        const setupIncluded =
          typeof item?.setupOffered === "boolean"
            ? item.setupOffered
            : typeof listingSnapshot?.setupIncluded === "boolean"
              ? listingSnapshot.setupIncluded
              : null;
        const bookedQuantity =
          parseIntegerValue((row as any)?.bookedQuantity) ??
          parseIntegerValue(itemData?.quantity) ??
          1;
        const deliveryFeeAmountCents =
          parseIntegerValue((row as any)?.deliveryFeeAmountCents) ??
          parseIntegerValue(itemLogisticsFees?.deliveryFeeCents);
        const setupFeeAmountCents =
          parseIntegerValue((row as any)?.setupFeeAmountCents) ??
          parseIntegerValue(itemLogisticsFees?.setupFeeCents);
        const takedownFeeAmountCents = parseIntegerValue(itemLogisticsFees?.takedownFeeCents);
        const travelFeeAmountCents =
          parseIntegerValue((row as any)?.travelFeeAmountCents) ??
          parseIntegerValue(itemLogisticsFees?.travelFlatFeeCents) ??
          parseIntegerValue(itemLogisticsFees?.travelFeeCents);
        const logisticsTotalFromTyped = parseIntegerValue((row as any)?.logisticsTotalCents);
        const logisticsTotalCents =
          logisticsTotalFromTyped ??
          (deliveryFeeAmountCents != null || setupFeeAmountCents != null || takedownFeeAmountCents != null || travelFeeAmountCents != null
            ? Math.max(0, deliveryFeeAmountCents ?? 0) +
              Math.max(0, setupFeeAmountCents ?? 0) +
              Math.max(0, takedownFeeAmountCents ?? 0) +
              Math.max(0, travelFeeAmountCents ?? 0)
            : null);
        const baseSubtotalCents = parseIntegerValue((row as any)?.baseSubtotalCents);
        const subtotalAmountCents = parseIntegerValue((row as any)?.subtotalAmountCents);
        const customerFeeAmountCents =
          parseIntegerValue((row as any)?.customerFeeAmountCents) ??
          parseIntegerValue(itemData?.feePolicy?.customerFeeCents);

        const parentListingTitle = normalizeListingTitleCandidate(item?.parentListingTitle) ?? null;

        const [latestProposal] = await db
          .select({
            id: travelFeeProposals.id,
            status: travelFeeProposals.status,
            amountCents: travelFeeProposals.amountCents,
            reason: travelFeeProposals.reason,
          })
          .from(travelFeeProposals)
          .where(eq(travelFeeProposals.bookingId, row.id))
          .orderBy(desc(travelFeeProposals.createdAt))
          .limit(1);

        return {
          ...row,
          itemTitle: resolvedItemTitle,
          parentListingTitle,
          customerEventTitle: customerEventTitleFromItem ?? row.eventTitle ?? null,
          customerNotes: notesFromItem ?? notesFallback,
          customerQuestions: questionsFromItem,
          listingDescription: descriptionFromSnapshot ?? descriptionFromTypedListing,
          listingId: (row as any)?.listingId ?? item?.listingId ?? null,
          listingProfileId: item?.listingProfileId ?? null,
          bookedQuantity: Math.max(1, bookedQuantity),
          deliveryFeeAmountCents: deliveryFeeAmountCents != null ? Math.max(0, deliveryFeeAmountCents) : null,
          setupFeeAmountCents: setupFeeAmountCents != null ? Math.max(0, setupFeeAmountCents) : null,
          takedownFeeAmountCents: takedownFeeAmountCents != null ? Math.max(0, takedownFeeAmountCents) : null,
          travelFeeAmountCents: travelFeeAmountCents != null ? Math.max(0, travelFeeAmountCents) : null,
          logisticsTotalCents: logisticsTotalCents != null ? Math.max(0, logisticsTotalCents) : null,
          baseSubtotalCents: baseSubtotalCents != null ? Math.max(0, baseSubtotalCents) : null,
          subtotalAmountCents: subtotalAmountCents != null ? Math.max(0, subtotalAmountCents) : null,
          customerFeeAmountCents: customerFeeAmountCents != null ? Math.max(0, customerFeeAmountCents) : null,
          includedItems: normalizedIncluded,
          deliveryIncluded,
          setupIncluded,
          addOnItems,
          travelFeeProposal: latestProposal ?? null,
        };
      })
    );
  }

  // Update current vendor account (protected route)
  const updateVendorMeSchema = z.object({
    businessName: z.string().min(1).max(100).optional(),
  });

  /**
   * PATCH /api/vendor/me  ✅ Auth0-only
   */
  app.patch("/api/vendor/me", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const parsed = updateVendorMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const updates = parsed.data;
      if (!updates.businessName) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const newBusinessName = updates.businessName.trim();

      // Enforce unique business name (exclude this vendor's own row).
      const [nameTaken] = await db
        .select({ id: vendorAccounts.id })
        .from(vendorAccounts)
        .where(and(drizzleSql`lower(${vendorAccounts.businessName}) = lower(${newBusinessName})`, isNull(vendorAccounts.deletedAt), ne(vendorAccounts.id, vendorAuth.id)))
        .limit(1);
      if (nameTaken) {
        return res.status(409).json({ error: "A vendor with this business name already exists.", code: "business_name_taken" });
      }

      const newSlug = await allocateUniqueVendorSlug(newBusinessName, vendorAuth.id);

      await db
        .update(vendorAccounts)
        .set({ businessName: newBusinessName, shopSlug: newSlug })
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const accounts = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const account = accounts[0];
      (req as any).vendorAccount = account;
      const profileContext = await resolveActiveVendorProfile(req);
      const profile = profileContext?.activeProfile;

            // ---- Seed listing defaults from vendor profile (so new listings are valid-by-default) ----
      const profileAddress = String((profile as any)?.address || "").trim();
      const profileCity = String((profile as any)?.city || "").trim();
      const profileState = String((profile as any)?.state || "").trim();
      const profileZip = String((profile as any)?.zipCode || (profile as any)?.postalCode || "").trim();

      const radius =
        Number((profile as any)?.serviceRadius ?? 25) || 25;

      // Build a geocode query (best-effort)
      const geoQ = [profileAddress, profileCity, profileState, profileZip].filter(Boolean).join(", ").trim();

      let seededLocation: any = null;
      if (geoQ) {
        try {
          const geoRes = await fetch(`http://127.0.0.1:5001/api/locations/search?q=${encodeURIComponent(geoQ)}`);
          if (geoRes.ok) {
            const results: any[] = await geoRes.json();
            if (results?.[0]) seededLocation = results[0];
          }
        } catch {
          // ignore geocode failures; listing can be edited later
        }
      }

      res.json({
        id: account.id,
        email: account.email,
        businessName: profile ? getProfileDisplayName(profile, account.businessName) : account.businessName,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        profileComplete: Boolean(profile),
        profileId: profile?.id || null,
        activeProfileId: profileContext?.activeProfileId ?? null,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  /**
   * GET /api/vendor/me ✅ Auth0-only
   */
  app.get("/api/vendor/me", ...requireVendorAuth0, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Vary", "Authorization");
    res.setHeader("ETag", `vendor-me-${Date.now()}`);
    res.setHeader("Last-Modified", new Date().toUTCString());

    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }
      // Lazily expire complimentary Pro grants (drops to Free + trims listings)
      // before computing entitlements, so no cron is required.
      const account = await reconcileVendorSubscriptionState(context.account);
      const entitlements = getVendorEntitlements(account);
      const activeProfile = context.activeProfile;
      const activeProfileName = activeProfile ? getProfileDisplayName(activeProfile, account.businessName) : null;
      const hasVendorAccount = Boolean(account?.id);

      let vendorOnlySignup = false;
      if (account.userId) {
        const userRow = await db.select({ vendorOnlySignup: users.vendorOnlySignup }).from(users).where(eq(users.id, account.userId)).limit(1);
        vendorOnlySignup = userRow[0]?.vendorOnlySignup ?? false;
      }
      const hasAnyVendorProfiles = context.profiles.length > 0;
      const hasActiveVendorProfile = Boolean(
        context.activeProfileId && context.profiles.some((profile) => profile.id === context.activeProfileId)
      );
      const needsNewVendorProfileOnboarding = hasVendorAccount && !hasAnyVendorProfiles;

      res.json({
        id: account.id,
        email: account.email,
        businessName: activeProfileName || account.businessName,
        accountBusinessName: account.businessName,
        ownerFirstName: account.ownerFirstName ?? null,
        ownerLastName: account.ownerLastName ?? null,
        ownerPhone: account.ownerPhone ?? null,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        profileComplete: context.profiles.length > 0,
        profileId: activeProfile?.id || null,
        activeProfileId: context.activeProfileId,
        profileName: activeProfileName,
        operatingTimezone: normalizeIanaTimeZone(activeProfile?.operatingTimezone),
        googleConnectionStatus: account.googleConnectionStatus,
        googleCalendarId: account.googleCalendarId,
        googleAccountEmail: account.googleAccountEmail ?? null,
        hasVendorAccount,
        hasAnyVendorProfiles,
        hasActiveVendorProfile,
        needsNewVendorProfileOnboarding,
        shopActive: account.shopActive ?? true,
        shopSlug: account.shopSlug || null,
        referralCode: account.referralCode ?? null,
        // Vendor Pro subscription entitlements (drives client gating + billing UI).
        isPro: entitlements.isPro,
        subscriptionPlan: entitlements.plan,
        subscriptionStatus: entitlements.status,
        subscriptionReason: entitlements.reason,
        maxActiveListings: Number.isFinite(entitlements.maxActiveListings)
          ? entitlements.maxActiveListings
          : null, // null = unlimited (Pro)
        canUseAnalytics: entitlements.canUseAnalytics,
        canUseGoogleSync: entitlements.canUseGoogleSync,
        subscriptionCurrentPeriodEnd: account.subscriptionCurrentPeriodEnd ?? null,
        subscriptionCancelAtPeriodEnd: account.subscriptionCancelAtPeriodEnd ?? false,
        compEndsAt: account.compEndsAt ?? null,
        __marker: "vendor_me_route_hit",
        vendorOnlySignup,
        onboardingCompleted: Boolean(account.onboardingCompletedAt),
        dashboardTourCompletedAt: account.dashboardTourCompletedAt ?? null,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/me", error);
      res.status(500).json({ error: "Unable to load vendor account" });
    }
  });

  /**
   * POST /api/vendor/me/delete ✅ Auth0-only
   * Final account exit while preserving historical booking/payment integrity.
   */
  app.post("/api/vendor/me/delete", onboardingRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth as { id: string };

      const accountRows = await db
        .select({
          id: vendorAccounts.id,
          deletedAt: vendorAccounts.deletedAt,
          userId: vendorAccounts.userId,
        })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id))
        .limit(1);
      const account = accountRows[0];
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.deletedAt) {
        return res.json({
          accountId: vendorAuth.id,
          deleted: true,
          alreadyDeleted: true,
        });
      }

      // Stop all Google Calendar watch channels before account data is wiped (non-fatal)
      try {
        await stopAllGoogleCalendarWatchChannelsForVendor(vendorAuth.id);
      } catch (watchErr) {
        logRouteError("/api/vendor/me/delete stop-watch-channels", watchErr);
      }

      const now = new Date();
      const obfuscatedEmail = `deleted+${vendorAuth.id}@eventhub.deleted`;

      const inactivatedListings = await db
        .update(vendorListings)
        .set({ status: "inactive", updatedAt: now })
        .where(
          and(
            eq(vendorListings.accountId, vendorAuth.id),
            or(eq(vendorListings.status, "active"), eq(vendorListings.status, "draft"))
          )
        )
        .returning({ id: vendorListings.id });

      const deactivatedProfiles = await db
        .update(vendorProfiles)
        .set({ active: false, deactivatedAt: now, updatedAt: now })
        .where(and(eq(vendorProfiles.accountId, vendorAuth.id), eq(vendorProfiles.active, true)))
        .returning({ id: vendorProfiles.id });

      // Downgrade the linked user's role back to 'customer' before we null userId.
      // Admin accounts are never downgraded.
      if (account.userId) {
        await db
          .update(users)
          .set({ role: "customer" as const })
          .where(
            and(
              eq(users.id, account.userId),
              drizzleSql`${users.role} <> 'admin'`
            )
          );
      }

      await db
        .update(vendorAccounts)
        .set({
          active: false,
          deletedAt: now,
          email: obfuscatedEmail,
          auth0Sub: null,
          userId: null,
          businessName: `Deleted Vendor ${vendorAuth.id.slice(0, 8)}`,
          stripeConnectId: null,
          stripeAccountType: null,
          stripeOnboardingComplete: false,
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiresAt: null,
          googleCalendarId: null,
          googleConnectionStatus: "disconnected",
          activeProfileId: null,
        })
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const [preservedBookingsResult] = await db
        .select({ count: count() })
        .from(bookings)
        .where(eq(bookings.vendorAccountId, vendorAuth.id));

      return res.json({
        accountId: vendorAuth.id,
        deleted: true,
        listingsInactivated: inactivatedListings.length,
        profilesDeactivated: deactivatedProfiles.length,
        preservedHistoricalBookings: Number(preservedBookingsResult?.count || 0),
      });
    } catch (error: any) {
      logRouteError("/api/vendor/me/delete", error);
      return res.status(500).json({ error: "Unable to delete vendor account" });
    }
  });

  const ALL_VENDOR_TYPES = [
    "venue",
    "photography",
    "videography",
    "dj",
    "florist",
    "catering",
    "planner",
    "hair-styling",
    "prop-decor",
  ] as const;

  const ENABLED_VENDOR_TYPES = ["prop-decor"] as const;

  // Complete vendor onboarding (already Auth0)
  const completeOnboardingSchema = z.object({
    vendorType: z.enum(ENABLED_VENDOR_TYPES),
    businessName: z.string().min(2),
    operatingTimezone: z.string().min(1).max(120).optional(),

    // Owner personal details
    ownerFirstName: z.string().max(100).optional(),
    ownerLastName: z.string().max(100).optional(),
    ownerPhone: z.string().max(30).optional(),

    streetAddress: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),

    businessPhone: z.string().min(1),
    businessEmail: z.string().email(),
    showBusinessPhoneToCustomers: z.boolean().optional(),
    showBusinessEmailToCustomers: z.boolean().optional(),
    showBusinessAddressToCustomers: z.boolean().optional(),
    aboutVendor: z.string().optional(),
    aboutBusiness: z.string().optional(),
    shopTagline: z.string().optional(),
    inBusinessSinceYear: z.string().optional(),
    specialties: z.string().optional(),
    eventsServedBaseline: z.string().optional(),
    hobbies: z.string().optional(),
    homeState: z.string().optional(),
    funFacts: z.string().optional(),
    shopProfilePhotoDataUrl: z.string().trim().max(3000000).optional(),
    shopCoverPhotoDataUrl: z.string().trim().max(3000000).optional(),

    homeBaseLocation: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),

    createNewProfile: z.boolean().optional(),
    referralCode: z.string().max(20).optional(),
    foundingInviteToken: z.string().max(64).optional(),
    marqueeInviteToken: z.string().max(64).optional(),
  });

  // Founding / Marquee vendor programs have been retired. Any old invite token is
  // now treated as expired so the client can surface a "link has expired" page.
  app.get("/api/invite/validate", async (_req, res) => {
    return res.json({ valid: false, expired: true });
  });

  // Provision a minimal vendor account immediately after auth.
  // Creates the DB row with just email + businessName so vendors aren't lost
  // if they close the tab before completing full onboarding. Full onboarding
  // (profiles, photos, address) remains required before publishing a listing.
  app.post("/api/vendor/provision", onboardingRateLimiter, requireAuth0, async (req, res) => {
    try {
      const auth0 = (req as any).auth0 as { sub: string; email?: string; email_verified?: boolean } | undefined;
      const rawEmail = auth0?.email;
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
      const auth0Sub = auth0?.sub;

      if (!email) {
        return res.status(400).json({ error: "Auth0 email is required" });
      }

      // If a vendor account already exists for this identity, return it (idempotent).
      const vendorResolution = await resolveVendorAccountForAuth0Identity({
        auth0Sub,
        email,
        context: "/api/vendor/provision",
        emailVerified: auth0?.email_verified === true,
      });
      const existingAccount = vendorResolution.account;
      if (existingAccount && !existingAccount.deletedAt) {
        // Re-assert vendorOnlySignup + users linkage so a retry heals any
        // partially-provisioned state from an earlier failed call.
        let linkedUserId = existingAccount.userId ?? vendorResolution.resolvedUserId ?? null;
        if (!linkedUserId) {
          const [userByEmail] = await db
            .select({ id: users.id })
            .from(users)
            .where(drizzleSql`lower(${users.email}) = ${email}`)
            .limit(1);
          linkedUserId = userByEmail?.id ?? null;
        }
        if (linkedUserId) {
          await db
            .update(users)
            .set({ vendorOnlySignup: true, vendorIntentPending: false, updatedAt: new Date() })
            .where(
              and(
                eq(users.id, linkedUserId),
                or(eq(users.vendorOnlySignup, false), eq(users.vendorIntentPending, true))
              )
            );
          if (!existingAccount.userId) {
            await db
              .update(vendorAccounts)
              .set({ userId: linkedUserId })
              .where(eq(vendorAccounts.id, existingAccount.id));
          }
        }
        return res.status(200).json({
          vendorAccountId: existingAccount.id,
          businessName: existingAccount.businessName,
          alreadyExisted: true,
        });
      }

      const rawName = req.body?.businessName;
      const nameResult = z.string().min(2).max(120).safeParse(rawName);
      if (!nameResult.success) {
        return res.status(400).json({ error: "Business name must be at least 2 characters." });
      }

      const normalizedName = normalizeProfileNameText(nameResult.data, 120);
      if (normalizedName.length < 2) {
        return res.status(400).json({ error: "Business name is invalid. Use letters, numbers, or spaces." });
      }

      // Enforce unique business name across active vendors.
      const [nameTaken] = await db
        .select({ id: vendorAccounts.id })
        .from(vendorAccounts)
        .where(and(drizzleSql`lower(${vendorAccounts.businessName}) = lower(${normalizedName})`, isNull(vendorAccounts.deletedAt)))
        .limit(1);
      if (nameTaken) {
        return res.status(409).json({ error: "A vendor with this business name already exists.", code: "business_name_taken" });
      }

      const shopSlug = await allocateUniqueVendorSlug(normalizedName);
      const [created] = await db
        .insert(vendorAccounts)
        .values({
          email,
          auth0Sub,
          userId: vendorResolution.resolvedUserId || undefined,
          businessName: normalizedName,
          shopSlug,
          profileComplete: false,
        })
        .returning();

      // Atomically create/update the users row so vendorOnlySignup is reliably set
      // without depending on a separate client-side mark-vendor-only call.
      const [upsertedUser] = await db
        .insert(users)
        .values({
          name: normalizedName,
          displayName: normalizedName,
          email,
          role: "customer",
          auth0Sub: auth0Sub ?? null,
          vendorOnlySignup: true,
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { vendorOnlySignup: true, vendorIntentPending: false, updatedAt: new Date() },
        })
        .returning({ id: users.id });

      // Link the vendor account to the users row if not already linked.
      if (upsertedUser?.id && !created.userId) {
        await db
          .update(vendorAccounts)
          .set({ userId: upsertedUser.id })
          .where(eq(vendorAccounts.id, created.id));
      }

      // Create a minimal vendor profile immediately so PATCH /api/vendor/profile
      // (timezone, etc.) works from the moment the vendor enters their business name.
      // Onboarding/complete will update this row with full profile details later.
      const [newProfile] = await db
        .insert(vendorProfiles)
        .values({
          accountId: created.id,
          profileName: normalizedName,
          experience: 0,
          address: "",
          city: "",
          travelMode: "travel-to-guests",
          serviceDescription: "",
        })
        .returning();

      await db
        .update(vendorAccounts)
        .set({ activeProfileId: newProfile.id })
        .where(eq(vendorAccounts.id, created.id));

      logger.info(`[vendor-provision] Created stub account ${created.id}`);

      // Fire-and-forget: send vendor welcome email on first account creation.
      void (async () => {
        try {
          const serverUrl = appUrl();
          await sendVendorWelcomeEmail(created.email!, {
            recipientName: created.businessName || "Vendor",
            businessName: created.businessName || "Your Business",
            serverUrl,
          });
        } catch (emailError: any) {
          logger.warn("[vendor welcome email] failed:", emailError?.message || emailError);
        }
      })();

      return res.status(200).json({
        vendorAccountId: created.id,
        businessName: created.businessName,
        alreadyExisted: false,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/provision", error);
      return res.status(500).json({ error: "Failed to provision vendor account" });
    }
  });

  app.post("/api/vendor/onboarding/complete", onboardingRateLimiter, requireAuth0, async (req, res) => {
    try {
      const customerAuth = (req as any).customerAuth;
      const vendorAuth = (req as any).vendorAuth;
      const auth0 = (req as any).auth0 as { sub: string; email?: string; email_verified?: boolean } | undefined;

      const onboardingData = completeOnboardingSchema.parse(req.body);
      const normalizedProfileName = normalizeProfileNameText(onboardingData.businessName, 120);
      if (normalizedProfileName.length < 2) {
        return res.status(400).json({
          error: "Business profile name is invalid. Use letters, numbers, spaces, apostrophes, and ampersands only.",
        });
      }

      const rawEmail = auth0?.email;
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
      const auth0Sub = auth0?.sub;

      if (!email) {
        return res.status(400).json({ error: "Auth0 email is required for onboarding" });
      }

      const vendorResolution = await resolveVendorAccountForAuth0Identity({
        auth0Sub,
        email,
        context: "/api/vendor/onboarding/complete",
        emailVerified: auth0?.email_verified === true,
      });
      let account = vendorResolution.account;

      // Treat deleted accounts as non-existent — re-registration gets a fresh start.
      if (account?.deletedAt) {
        account = null;
      }

      if (!account) {
        // Before inserting, check if an account already exists for this email (auth0Sub conflict
        // case — user previously signed up with a different provider). Since Auth0 has already
        // verified the user owns this email, it is safe to adopt the existing account and heal
        // the auth0Sub so future lookups resolve correctly.
        const [existingByEmail] = await db
          .select()
          .from(vendorAccounts)
          .where(and(drizzleSql`lower(${vendorAccounts.email}) = ${email}`, isNull(vendorAccounts.deletedAt)))
          .limit(1);

        if (existingByEmail) {
          const [healed] = await db
            .update(vendorAccounts)
            .set({ auth0Sub })
            .where(eq(vendorAccounts.id, existingByEmail.id))
            .returning();
          account = healed;
          logger.info(`[onboarding] healed auth0Sub conflict for account ${existingByEmail.id} (email match)`);
        } else {
          // Enforce unique business name across active vendors.
          const [nameTaken] = await db
            .select({ id: vendorAccounts.id })
            .from(vendorAccounts)
            .where(and(drizzleSql`lower(${vendorAccounts.businessName}) = lower(${normalizedProfileName})`, isNull(vendorAccounts.deletedAt)))
            .limit(1);
          if (nameTaken) {
            return res.status(409).json({ error: "A vendor with this business name already exists.", code: "business_name_taken" });
          }

          const shopSlug = await allocateUniqueVendorSlug(normalizedProfileName);
          const [created] = await db
            .insert(vendorAccounts)
            .values({
              email,
              auth0Sub,
              userId: vendorResolution.resolvedUserId || undefined,
              businessName: normalizedProfileName,
              shopSlug,
              profileComplete: false,
            })
            .returning();
          account = created;
        }
      } else {
        const currentBusinessName = asTrimmedString(account.businessName);
        const nameIsChanging = !currentBusinessName;
        if (nameIsChanging) {
          // Enforce unique business name when setting for the first time.
          const [nameTaken] = await db
            .select({ id: vendorAccounts.id })
            .from(vendorAccounts)
            .where(and(drizzleSql`lower(${vendorAccounts.businessName}) = lower(${normalizedProfileName})`, isNull(vendorAccounts.deletedAt), ne(vendorAccounts.id, account.id)))
            .limit(1);
          if (nameTaken) {
            return res.status(409).json({ error: "A vendor with this business name already exists.", code: "business_name_taken" });
          }
        }
        const newSlug = nameIsChanging ? await allocateUniqueVendorSlug(normalizedProfileName, account.id) : undefined;
        const [updated] = await db
          .update(vendorAccounts)
          .set({
            businessName: currentBusinessName || normalizedProfileName,
            ...(newSlug ? { shopSlug: newSlug } : {}),
          })
          .where(eq(vendorAccounts.id, account.id))
          .returning();

        account = updated;
      }

      // Store owner personal details on the vendor account.
      // These are used when a vendor books another vendor so they are identified
      // by their real name rather than their business name.
      const ownerFirstName = asTrimmedString(onboardingData.ownerFirstName) || null;
      const ownerLastName  = asTrimmedString(onboardingData.ownerLastName)  || null;
      const ownerPhone     = asTrimmedString(onboardingData.ownerPhone)     || null;
      await db
        .update(vendorAccounts)
        .set({ ownerFirstName, ownerLastName, ownerPhone })
        .where(eq(vendorAccounts.id, account.id));

      const existingProfiles = await db.select().from(vendorProfiles).where(and(eq(vendorProfiles.accountId, account.id), eq(vendorProfiles.active, true)));
      const existingActiveProfile =
        existingProfiles.find((candidate) => candidate.id === account.activeProfileId) || existingProfiles[0] || null;
      // Prefer timezone derived from the verified business address coords (most accurate).
      // Fall back to the browser-reported timezone sent from the client, then the existing
      // profile value. This means a vendor's operating_timezone always reflects their
      // actual business location rather than wherever their browser happened to be.
      const coordDerivedTimezone =
        onboardingData.homeBaseLocation?.lat != null &&
        onboardingData.homeBaseLocation?.lng != null
          ? timezoneFromCoords(onboardingData.homeBaseLocation.lat, onboardingData.homeBaseLocation.lng)
          : null;
      const resolvedOperatingTimezone = normalizeIanaTimeZone(
        coordDerivedTimezone || onboardingData.operatingTimezone,
        existingActiveProfile?.operatingTimezone
      );

      const address = [
        onboardingData.streetAddress,
        onboardingData.city,
        onboardingData.state,
        onboardingData.zipCode,
      ]
        .filter(Boolean)
        .join(", ");

      const aboutVendor = asTrimmedString(onboardingData.aboutVendor);
      const aboutBusiness = asTrimmedString(onboardingData.aboutBusiness);
      const shopTagline = asTrimmedString(onboardingData.shopTagline);
      const inBusinessSinceYear = asTrimmedString(onboardingData.inBusinessSinceYear).replace(/[^\d]/g, "").slice(0, 4);
      const specialties = normalizeSpecialties(onboardingData.specialties);
      const eventsServedBaseline = toNonNegativeInt(onboardingData.eventsServedBaseline, 0);
      const hobbies = serializeHobbyList(onboardingData.hobbies);
      const homeState = asTrimmedString(onboardingData.homeState);
      const funFacts = asTrimmedString(onboardingData.funFacts);
      const existingOnlineProfiles =
        existingActiveProfile?.onlineProfiles &&
        typeof existingActiveProfile.onlineProfiles === "object" &&
        !Array.isArray(existingActiveProfile.onlineProfiles)
          ? (existingActiveProfile.onlineProfiles as Record<string, unknown>)
          : {};
      const existingShopProfileImageUrl = asTrimmedString((existingOnlineProfiles as any).shopProfileImageUrl);
      const existingShopCoverImageUrl = asTrimmedString((existingOnlineProfiles as any).shopCoverImageUrl);
      const existingCoverPhotoPosition =
        normalizePhotoPosition((existingOnlineProfiles as any).shopCoverImagePosition) || { x: 0, y: 0 };
      const shopProfilePhotoDataUrl = asTrimmedString(onboardingData.shopProfilePhotoDataUrl);
      const shopCoverPhotoDataUrl = asTrimmedString(onboardingData.shopCoverPhotoDataUrl);
      let shopProfileImageUrl = existingShopProfileImageUrl || "";
      let shopCoverImageUrl = existingShopCoverImageUrl || "";
      let shopCoverImagePosition = existingCoverPhotoPosition;

      if (shopProfilePhotoDataUrl) {
        const profileBuffer = decodeImageDataUrlToBuffer(shopProfilePhotoDataUrl);
        if (!profileBuffer) {
          return res.status(400).json({ error: "Invalid profile photo format." });
        }
        try {
          const persistedProfilePhoto = await persistUploadedImage(profileBuffer, vendorShopUploadsDir);
          shopProfileImageUrl = `/uploads/vendor-shops/${persistedProfilePhoto.filename}`;
        } catch (uploadError: any) {
          logger.error({ err: uploadError }, "[onboarding/complete] profile photo upload failed");
          return res.status(500).json({
            error: "Failed to save profile photo. Please remove the photo and try again, or contact support.",
            detail: uploadError?.message || "Upload failed",
          });
        }
      }

      if (shopCoverPhotoDataUrl) {
        const coverBuffer = decodeImageDataUrlToBuffer(shopCoverPhotoDataUrl);
        if (!coverBuffer) {
          return res.status(400).json({ error: "Invalid cover photo format." });
        }
        try {
          const persistedCoverPhoto = await persistUploadedImage(coverBuffer, vendorShopUploadsDir);
          shopCoverImageUrl = `/uploads/vendor-shops/${persistedCoverPhoto.filename}`;
          shopCoverImagePosition = { x: 0, y: 0 };
        } catch (uploadError: any) {
          logger.error("[onboarding/complete] cover photo upload failed:", uploadError?.message || uploadError);
          return res.status(500).json({
            error: "Failed to save cover photo. Please remove the photo and try again, or contact support.",
            detail: uploadError?.message || "Upload failed",
          });
        }
      }
      const showBusinessPhoneToCustomers = Boolean(onboardingData.showBusinessPhoneToCustomers);
      const showBusinessEmailToCustomers = Boolean(onboardingData.showBusinessEmailToCustomers);
      const showBusinessAddressToCustomers = Boolean(onboardingData.showBusinessAddressToCustomers);

      const profilePayload = {
        accountId: account.id,
        profileName: normalizedProfileName,
        businessPhone: onboardingData.businessPhone,
        businessEmail: onboardingData.businessEmail,
        businessAddressLabel: address,
        businessStreet: onboardingData.streetAddress,
        businessCity: onboardingData.city,
        businessState: onboardingData.state,
        businessZip: onboardingData.zipCode,
        homeBaseLat: onboardingData.homeBaseLocation?.lat ?? null,
        homeBaseLng: onboardingData.homeBaseLocation?.lng ?? null,
        operatingTimezone: resolvedOperatingTimezone,
        showBusinessPhoneToCustomers,
        showBusinessEmailToCustomers,
        showBusinessAddressToCustomers,
        aboutVendor: aboutVendor || null,
        aboutBusiness: aboutBusiness || null,
        experience: 0,
        qualifications: [] as string[],
        onlineProfiles: {
          profileBusinessName: normalizedProfileName,
          businessPhone: onboardingData.businessPhone,
          businessEmail: onboardingData.businessEmail,
          streetAddress: onboardingData.streetAddress,
          city: onboardingData.city,
          state: onboardingData.state,
          zipCode: onboardingData.zipCode,
          showBusinessPhoneToCustomers,
          showBusinessEmailToCustomers,
          showBusinessAddressToCustomers,
          aboutOwner: aboutVendor || null,
          aboutBusiness: aboutBusiness || null,
          shopTagline: shopTagline || null,
          inBusinessSinceYear: inBusinessSinceYear || null,
          specialties,
          eventsServedBaseline,
          hobbies: hobbies || null,
          homeState: homeState || null,
          funFacts: funFacts || null,
          shopProfileImageUrl: shopProfileImageUrl || null,
          shopCoverImageUrl: shopCoverImageUrl || null,
          shopCoverImagePosition: shopCoverImageUrl ? shopCoverImagePosition : null,
          operatingTimezone: resolvedOperatingTimezone,

          // for LocationPicker autofill later
          homeBaseLocation: onboardingData.homeBaseLocation ?? null,

          // optional: store a “marketLocation” label so LocationPicker can show something even if we only have text
          marketLocation: {
            id: "onboarding-address",
            label: address,
            lat: onboardingData.homeBaseLocation?.lat ?? null,
            lng: onboardingData.homeBaseLocation?.lng ?? null,
          },
        },

        address,
        city: onboardingData.city,
        travelMode: "included",
        serviceRadius: null,
        serviceAddress: address,
        photos: [],
        serviceDescription: aboutBusiness || "",
      };

      let profile;
      const createNewProfile = Boolean(onboardingData.createNewProfile);
      if (existingProfiles.length > 0 && !createNewProfile) {
        const current =
          existingProfiles.find((candidate) => candidate.id === account.activeProfileId) || existingProfiles[0];
        const [updatedProfile] = await db
          .update(vendorProfiles)
          .set({
            ...profilePayload,
            updatedAt: new Date(),
          })
          .where(eq(vendorProfiles.id, current.id))
          .returning();

        profile = updatedProfile;
      } else {
        const [createdProfile] = await db.insert(vendorProfiles).values(profilePayload).returning();
        profile = createdProfile;
      }

      await db
        .update(vendorAccounts)
        .set({
          profileComplete: true,
          activeProfileId: profile.id,
          onboardingCompletedAt: new Date(),
        })
        .where(eq(vendorAccounts.id, account.id));

      // Sync users.role → 'vendor'. Matches by auth0_sub first, then email.
      // Admin accounts are never downgraded.
      if (auth0Sub || email) {
        await db
          .update(users)
          .set({ role: "vendor" as const })
          .where(
            and(
              or(
                ...(auth0Sub ? [eq(users.auth0Sub, auth0Sub)] : []),
                ...(email    ? [drizzleSql`lower(${users.email}) = ${email}`] : [])
              ),
              drizzleSql`${users.role} <> 'admin'`
            )
          );
      }

      const isUpgrade = Boolean(customerAuth || vendorAuth);

      const isFirstTimeOnboarding = existingProfiles.length === 0;

      // Founding / Marquee vendor programs have been retired. Invite tokens and
      // vendor-referral rewards are no longer processed. Monetization is moving to
      // a vendor subscription model.

      logEvent("vendor_signup_completed", "vendor", account.id, {
        is_new: isFirstTimeOnboarding,
        is_upgrade: isUpgrade,
      });

      return res.json({
        vendorAccountId: account.id,
        profileId: profile.id,
        activeProfileId: profile.id,
        isUpgrade,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/profile", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const context = await resolveActiveVendorProfile(req);
      if (!context?.activeProfile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const existingProfile = context.activeProfile;
      const onlineRaw = existingProfile.onlineProfiles;
      const onlineProfiles =
        onlineRaw && typeof onlineRaw === "object" && !Array.isArray(onlineRaw)
          ? ({ ...(onlineRaw as Record<string, unknown>) } as Record<string, unknown>)
          : ({} as Record<string, unknown>);

      let didBackfill = false;

      const fallbackEmail = asTrimmedString(vendorAuth?.email);
      if (!asTrimmedString(onlineProfiles.businessEmail) && fallbackEmail) {
        onlineProfiles.businessEmail = fallbackEmail;
        didBackfill = true;
      }

      const fallbackProfileName = getProfileDisplayName(existingProfile, context.account?.businessName ?? "Vendor Profile");
      if (!asTrimmedString(onlineProfiles.profileBusinessName) && fallbackProfileName) {
        onlineProfiles.profileBusinessName = fallbackProfileName;
        didBackfill = true;
      }

      const marketLabel = asTrimmedString((onlineProfiles.marketLocation as any)?.label);
      const fallbackLabel =
        asTrimmedString(existingProfile.serviceAddress) ||
        asTrimmedString(existingProfile.address) ||
        marketLabel;
      const parsedAddress = fallbackLabel
        ? parseAddressLabel(fallbackLabel)
        : { streetAddress: "", city: "", state: "", zipCode: "" };

      if (!asTrimmedString(onlineProfiles.streetAddress) && parsedAddress.streetAddress) {
        onlineProfiles.streetAddress = parsedAddress.streetAddress;
        didBackfill = true;
      }

      if (!asTrimmedString(onlineProfiles.city) && parsedAddress.city) {
        onlineProfiles.city = parsedAddress.city;
        didBackfill = true;
      }

      if (!asTrimmedString(onlineProfiles.state) && parsedAddress.state) {
        onlineProfiles.state = parsedAddress.state;
        didBackfill = true;
      }

      if (!asTrimmedString(onlineProfiles.zipCode) && parsedAddress.zipCode) {
        onlineProfiles.zipCode = parsedAddress.zipCode;
        didBackfill = true;
      }

      // Resolve image storage paths to public CDN URLs so the client can render
      // them without routing through the API server (which doesn't host S3 files).
      for (const field of [
        "shopProfileImageUrl", "shopProfileImageStoragePath", "profileImageUrl",
        "shopCoverImageUrl", "shopCoverImageStoragePath", "coverImageUrl",
      ]) {
        const raw = asTrimmedString(onlineProfiles[field] as string | undefined);
        if (raw) onlineProfiles[field] = resolveStoredUploadPath(raw) ?? raw;
      }

      if (didBackfill) {
        const normalizedProfileName = getProfileDisplayName(
          { ...existingProfile, onlineProfiles },
          context.account?.businessName ?? "Vendor Profile"
        );
        const [updatedProfile] = await db
          .update(vendorProfiles)
          .set({
            profileName: normalizedProfileName,
            onlineProfiles,
            updatedAt: new Date(),
          })
          .where(eq(vendorProfiles.id, existingProfile.id))
          .returning();

        return res.json({
          ...(updatedProfile ?? { ...existingProfile, profileName: normalizedProfileName, onlineProfiles }),
          onlineProfiles,
          activeProfileId: context.activeProfileId,
        });
      }

      return res.json({
        ...existingProfile,
        profileName: getProfileDisplayName(existingProfile, context.account?.businessName ?? "Vendor Profile"),
        onlineProfiles,
        activeProfileId: context.activeProfileId,
      });
    } catch (error: any) {
      logger.error("GET /api/vendor/profile failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  /**
   * PATCH /api/vendor/profile ✅ Auth0-only
   * Updates the current vendor's profile
   */
  app.patch("/api/vendor/profile", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.activeProfile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const existing = context.activeProfile;

      const parsed = updateVendorProfileSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const payload = parsed.data as Record<string, unknown>;
      const updates: Record<string, unknown> = {};

      if (payload.profileName !== undefined) {
        const normalized = normalizeProfileNameText(payload.profileName, 120);
        if (!normalized || normalized.length < 2) {
          return res.status(400).json({
            error: "Validation failed",
            details: [{ message: "profileName is invalid. Use letters, numbers, spaces, apostrophes, and ampersands only." }],
          });
        }
        updates.profileName = normalized;
      }
      if (payload.experience !== undefined) updates.experience = payload.experience;
      if (payload.qualifications !== undefined) updates.qualifications = payload.qualifications;
      if (payload.address !== undefined) updates.address = payload.address;
      if (payload.city !== undefined) updates.city = payload.city;
      if (payload.travelMode !== undefined) updates.travelMode = payload.travelMode;
      if (payload.serviceRadius !== undefined) updates.serviceRadius = payload.serviceRadius;
      if (payload.serviceAddress !== undefined) updates.serviceAddress = payload.serviceAddress;
      if (payload.operatingTimezone !== undefined) {
        updates.operatingTimezone = normalizeIanaTimeZone(payload.operatingTimezone, existing.operatingTimezone);
      }
      if (payload.photos !== undefined) updates.photos = payload.photos;
      if (payload.galleryPhotos !== undefined) updates.galleryPhotos = payload.galleryPhotos;
      if (payload.serviceDescription !== undefined) updates.serviceDescription = payload.serviceDescription ?? "";

      if (payload.onlineProfiles !== undefined) {
        if (payload.onlineProfiles == null) {
          updates.onlineProfiles = null;
        } else if (typeof payload.onlineProfiles === "object" && !Array.isArray(payload.onlineProfiles)) {
          const existingOnlineProfiles =
            existing.onlineProfiles && typeof existing.onlineProfiles === "object" && !Array.isArray(existing.onlineProfiles)
              ? (existing.onlineProfiles as Record<string, unknown>)
              : {};
          updates.onlineProfiles = {
            ...existingOnlineProfiles,
            ...(payload.onlineProfiles as Record<string, unknown>),
          };

          if (updates.profileName && typeof updates.onlineProfiles === "object" && updates.onlineProfiles) {
            (updates.onlineProfiles as Record<string, unknown>).profileBusinessName = updates.profileName;
          }

          const incomingProfileNameRaw = (updates.onlineProfiles as Record<string, unknown>).profileBusinessName;
          if (incomingProfileNameRaw !== undefined) {
            const incomingProfileName = normalizeProfileNameText(incomingProfileNameRaw, 120);
            if (!incomingProfileName || incomingProfileName.length < 2) {
              return res.status(400).json({
                error: "Validation failed",
                details: [{ message: "profileBusinessName is invalid" }],
              });
            }
            (updates.onlineProfiles as Record<string, unknown>).profileBusinessName = incomingProfileName;
            if (!updates.profileName) {
              updates.profileName = incomingProfileName;
            }
          }

          const incomingHobbiesRaw = (updates.onlineProfiles as Record<string, unknown>).hobbies;
          if (incomingHobbiesRaw !== undefined) {
            const normalizedHobbies = serializeHobbyList(incomingHobbiesRaw);
            (updates.onlineProfiles as Record<string, unknown>).hobbies = normalizedHobbies || null;
          }
        } else {
          return res.status(400).json({
            error: "Validation failed",
            details: [{ message: "onlineProfiles must be an object" }],
          });
        }
      }

      if (updates.profileName && payload.onlineProfiles === undefined) {
        const existingOnlineProfiles =
          existing.onlineProfiles && typeof existing.onlineProfiles === "object" && !Array.isArray(existing.onlineProfiles)
            ? (existing.onlineProfiles as Record<string, unknown>)
            : {};
        updates.onlineProfiles = {
          ...existingOnlineProfiles,
          profileBusinessName: updates.profileName,
        };
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      // ── Circumvention detection ──────────────────────────────────────────────
      const vendorAuthForCircumvention = (req as any).vendorAuth;
      const vendorAccountIdForCircumvention = vendorAuthForCircumvention?.id
        ? String(vendorAuthForCircumvention.id)
        : null;

      const profileFieldsToCheck: { value: string; contentType: string; label: string }[] = [];

      if (typeof updates.serviceDescription === "string" && updates.serviceDescription) {
        profileFieldsToCheck.push({ value: updates.serviceDescription, contentType: "vendor_description", label: "Business description" });
      }
      if (updates.onlineProfiles && typeof updates.onlineProfiles === "object" && !Array.isArray(updates.onlineProfiles)) {
        const op = updates.onlineProfiles as Record<string, unknown>;
        if (typeof op.shopTagline === "string" && op.shopTagline) {
          profileFieldsToCheck.push({ value: op.shopTagline, contentType: "tagline", label: "Tagline" });
        }
        if (typeof op.aboutVendor === "string" && op.aboutVendor) {
          profileFieldsToCheck.push({ value: op.aboutVendor, contentType: "vendor_description", label: "About section" });
        }
        if (typeof op.aboutBusiness === "string" && op.aboutBusiness) {
          profileFieldsToCheck.push({ value: op.aboutBusiness, contentType: "vendor_description", label: "About the business" });
        }
      }

      for (const field of profileFieldsToCheck) {
        const detection = checkContent(field.value);
        if (detection.hardBlocked) {
          const serverUrlForProfile = appUrl();
          let violationMeta: { phase: string; softAttemptNumber?: number; warningNumber?: number; suspended?: boolean; endsAt?: Date | null } = { phase: "soft" };
          if (vendorAccountIdForCircumvention) {
            const result = await handleCircumventionViolation({
              vendorAccountId: vendorAccountIdForCircumvention,
              contentType: field.contentType,
              contentSnapshot: field.value,
              matches: detection.matches,
              reason: `${field.label} contained ${blockReasonSummary(detection.blockReasons)}`,
              serverUrl: serverUrlForProfile,
            });
            violationMeta = result;
          }
          return res.status(422).json({
            error: "content_blocked",
            field: field.label,
            reason: `Your ${field.label.toLowerCase()} cannot include ${blockReasonSummary(detection.blockReasons)}. Please remove this information and try again.`,
            blockReasons: detection.blockReasons,
            matches: detection.matches,
            phase: violationMeta.phase,
            softAttemptNumber: (violationMeta as any).softAttemptNumber ?? null,
            warningNumber: (violationMeta as any).warningNumber ?? null,
            suspended: (violationMeta as any).suspended ?? false,
            suspensionEndsAt: (violationMeta as any).endsAt ?? null,
          });
        }
        if (detection.softFlagged && vendorAccountIdForCircumvention) {
          // Allow save but flag for admin review
          db.insert(circumventionFlags).values({
            flagType: "soft_flag",
            contentType: field.contentType as any,
            contentSnapshot: field.value.slice(0, 2000),
            matches: detection.matches,
            vendorAccountId: vendorAccountIdForCircumvention,
            status: "pending",
          }).catch((err: any) => logger.warn("[circumvention] soft flag insert failed:", err?.message));
        }
      }
      // ── End circumvention detection ──────────────────────────────────────────

      const [updated] = await db
        .update(vendorProfiles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(vendorProfiles.id, existing.id))
        .returning();

      const softFlaggedProfile = profileFieldsToCheck.some(f => checkContent(f.value).softFlagged);
      return res.json({ ...updated, activeProfileId: context.activeProfileId, softFlagged: softFlaggedProfile });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/profiles", ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const profiles = context.profiles.map((profile) => ({
        id: profile.id,
        profileName: getProfileDisplayName(profile, context.account.businessName),
        city: profile.city,
        createdAt: profile.createdAt,
        isActive: profile.id === context.activeProfileId,
        isOperational: profile.active !== false,
        deactivatedAt: profile.deactivatedAt ?? null,
      }));

      return res.json({
        activeProfileId: context.activeProfileId,
        profiles,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/vendor/profiles/switch", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const schema = z.object({
        profileId: z.string().min(1),
      });
      const data = schema.parse(req.body ?? {});
      const profileId = data.profileId.trim();

      const target = context.profiles.find((profile) => profile.id === profileId);
      if (!target) {
        return res.status(404).json({ error: "Profile not found for this vendor account" });
      }

      await db
        .update(vendorAccounts)
        .set({ activeProfileId: target.id })
        .where(eq(vendorAccounts.id, context.account.id));

      return res.json({
        activeProfileId: target.id,
        profile: {
          id: target.id,
          profileName: getProfileDisplayName(target, context.account.businessName),
          city: target.city,
          isOperational: target.active !== false,
        },
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/vendor/profiles/:id/deactivate", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const profileId = asTrimmedString(req.params?.id);
      if (!profileId) {
        return res.status(400).json({ error: "Profile id is required" });
      }

      const target = context.profiles.find((profile) => profile.id === profileId);
      if (!target) {
        return res.status(404).json({ error: "Profile not found for this vendor account" });
      }
      if (target.active === false) {
        return res.status(400).json({ error: "Profile is already inactive" });
      }

      const now = new Date();
      const inactivatedListings = await db
        .update(vendorListings)
        .set({ status: "inactive", updatedAt: now })
        .where(
          and(
            eq(vendorListings.accountId, context.account.id),
            eq(vendorListings.profileId, target.id),
            or(eq(vendorListings.status, "active"), eq(vendorListings.status, "draft"))
          )
        )
        .returning({ id: vendorListings.id });

      await db
        .update(vendorProfiles)
        .set({ active: false, deactivatedAt: now, updatedAt: now })
        .where(eq(vendorProfiles.id, target.id));

      const nextActiveProfile = context.profiles.find(
        (profile) => profile.id !== target.id && profile.active !== false
      );
      const nextActiveProfileId =
        context.activeProfileId === target.id ? nextActiveProfile?.id ?? null : context.activeProfileId;

      if (context.account.activeProfileId !== nextActiveProfileId) {
        await db
          .update(vendorAccounts)
          .set({ activeProfileId: nextActiveProfileId })
          .where(eq(vendorAccounts.id, context.account.id));
      }

      return res.json({
        profileId: target.id,
        active: false,
        activeProfileId: nextActiveProfileId,
        listingsInactivated: inactivatedListings.length,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/profiles/:id/deactivate", error);
      return res.status(500).json({ error: "Unable to deactivate profile" });
    }
  });

  app.post("/api/vendor/profiles/:id/reactivate", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const profileId = asTrimmedString(req.params?.id);
      if (!profileId) {
        return res.status(400).json({ error: "Profile id is required" });
      }

      const target = context.profiles.find((profile) => profile.id === profileId);
      if (!target) {
        return res.status(404).json({ error: "Profile not found for this vendor account" });
      }
      if (target.active !== false) {
        return res.status(400).json({ error: "Profile is already active" });
      }

      await db
        .update(vendorProfiles)
        .set({ active: true, deactivatedAt: null, updatedAt: new Date() })
        .where(eq(vendorProfiles.id, target.id));

      const nextActiveProfileId = context.account.activeProfileId || target.id;
      if (!context.account.activeProfileId) {
        await db
          .update(vendorAccounts)
          .set({ activeProfileId: target.id })
          .where(eq(vendorAccounts.id, context.account.id));
      }

      return res.json({
        profileId: target.id,
        active: true,
        activeProfileId: nextActiveProfileId,
        listingsRemainInactive: true,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/profiles/:id/reactivate", error);
      return res.status(500).json({ error: "Unable to reactivate profile" });
    }
  });

  app.post("/api/vendor/listings", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfile = profileContext?.activeProfile;
      if (!activeProfile?.id) {
        return res.status(400).json({
          error: "Vendor profile required before creating a listing. Complete onboarding first.",
        });
      }

      const listingData = req.body?.listingData;
      const rawListingType = req.body?.listingType;
      const allowedListingTypes = ["single", "package_container", "addon"] as const;
      type TopLevelListingType = typeof allowedListingTypes[number];
      const resolvedListingType: TopLevelListingType =
        allowedListingTypes.includes(rawListingType) ? rawListingType : "single";

      if (!listingData || typeof listingData !== "object") {
        return res.status(400).json({ error: "listingData must be a JSON object." });
      }
      const normalizedListingData = clampListingDescriptions(listingData) as Record<string, any>;
      const normalizedClassification = normalizeListingClassification(normalizedListingData);

      const seededListingData = {
        ...normalizedClassification.listingData,

        // Service area mode (listing-owned)
        serviceAreaMode: normalizedClassification.listingData?.serviceAreaMode ?? "radius",

        // Radius: listing → legacy field → default
        serviceRadiusMiles:
          normalizedClassification.listingData?.serviceRadiusMiles ?? 25,

        // Location MUST come from listing UI (map picker)
        // Do NOT infer lat/lng from vendor profile
        serviceLocation: normalizedClassification.listingData?.serviceLocation ?? null,
        serviceCenter: normalizedClassification.listingData?.serviceCenter ?? null,
        instantBookEnabled:
          parseBooleanInput(normalizedClassification.listingData?.instantBookEnabled) ??
          (normalizedClassification.category === "Rentals"),
      };
      const canonicalColumns = buildCanonicalListingColumns({
        listingDataRaw: seededListingData,
        classification: normalizedClassification,
      });
      const mirroredListingData = mirrorListingQuantityIntoListingData({
        listingDataRaw: seededListingData,
        canonical: canonicalColumns,
      });

      const defaultTitleType = normalizedClassification.category?.toLowerCase().replace(/s$/, "");

      const title =
        canonicalColumns.title ||
        (typeof normalizedListingData.title === "string" && normalizedListingData.title.trim()) ||
        (defaultTitleType ? `New ${defaultTitleType} listing` : null);
      const [listing] = await db
        .insert(vendorListings)
        .values({
          accountId: vendorAuth.id,
          profileId: activeProfile.id,
          status: "draft",
          listingType: resolvedListingType,
          ...canonicalColumns,
          title,
          listingData: mirroredListingData,
        })
        .returning();

      // Kick off async translation for all supported languages.
      translateListingAsync(listing.id, {
        title: listing.title,
        description: listing.description,
        whatsIncluded: listing.whatsIncluded,
        whatsNotIncluded: listing.whatsNotIncluded,
      });

      return res.status(201).json(listing);
    } catch (error: any) {
      logRouteError("/api/vendor/listings", error);
      return res.status(500).json({ error: "Unable to create listing" });
    }
  });

  app.patch("/api/vendor/listings/:id", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const { id } = req.params;
      const { listingData, title } = req.body;
      const normalizedListingData =
        listingData !== undefined ? (clampListingDescriptions(listingData) as Record<string, any>) : undefined;
      const normalizedClassification =
        normalizedListingData !== undefined
          ? normalizeListingClassification(normalizedListingData)
          : null;

      const existingListings = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existingListings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      const existingListing = existingListings[0];
      if ((existingListing?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existingListing.profileId && existingListing.profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }

      const updatePayload: any = {
        updatedAt: new Date(),
      };

      // Only overwrite fields if they were sent
      if (normalizedClassification) {
        const canonicalClassification = {
          category: normalizedClassification.category ?? normalizeListingCategory(existingListing?.category),
          subcategory: normalizedClassification.subcategory ?? normalizeListingSubcategory(existingListing?.subcategory),
          subcategoryDetail: normalizedClassification.subcategoryDetail ?? normalizeListingSubcategoryDetail((existingListing as any)?.subcategoryDetail),
        };
        const canonicalColumns = buildCanonicalListingColumns({
          listingDataRaw: normalizedClassification.listingData,
          existingCanonical: {
            category: existingListing?.category,
            subcategory: existingListing?.subcategory,
            title: existingListing?.title,
            description: existingListing?.description,
            whatsIncluded: existingListing?.whatsIncluded,
            whatsNotIncluded: existingListing?.whatsNotIncluded,
            tags: existingListing?.tags,
            popularFor: existingListing?.popularFor,
            instantBookEnabled: existingListing?.instantBookEnabled,
            pricingUnit: existingListing?.pricingUnit,
            priceCents: existingListing?.priceCents,
            quantity: existingListing?.quantity,
            minimumHours: existingListing?.minimumHours,
            listingServiceCenterLabel: existingListing?.listingServiceCenterLabel,
            listingServiceCenterLat: existingListing?.listingServiceCenterLat,
            listingServiceCenterLng: existingListing?.listingServiceCenterLng,
            serviceRadiusMiles: existingListing?.serviceRadiusMiles,
            serviceAreaMode: existingListing?.serviceAreaMode,
            travelOffered: existingListing?.travelOffered,
            travelFeeEnabled: existingListing?.travelFeeEnabled,
            travelFeeType: existingListing?.travelFeeType,
            travelFeeAmountCents: existingListing?.travelFeeAmountCents,
            pickupOffered: (existingListing as any)?.pickupOffered,
            deliveryOffered: existingListing?.deliveryOffered,
            deliveryFeeEnabled: (existingListing as any)?.deliveryFeeEnabled,
            deliveryFeeAmountCents: existingListing?.deliveryFeeAmountCents,
            setupOffered: existingListing?.setupOffered,
            setupFeeEnabled: (existingListing as any)?.setupFeeEnabled,
            setupFeeAmountCents: existingListing?.setupFeeAmountCents,
            takedownOffered: (existingListing as any)?.takedownOffered,
            takedownFeeEnabled: (existingListing as any)?.takedownFeeEnabled,
            takedownFeeAmountCents: (existingListing as any)?.takedownFeeAmountCents,
            cancellationPolicy: (existingListing as any)?.cancellationPolicy,
            cancellationPolicyDays: (existingListing as any)?.cancellationPolicyDays,
            photos: existingListing?.photos,
          },
          classification: canonicalClassification,
        });
        updatePayload.listingData = mirrorListingQuantityIntoListingData({
          listingDataRaw: normalizedClassification.listingData,
          canonical: canonicalColumns,
        });
        Object.assign(updatePayload, canonicalColumns);

        // package_container: certain fields are owned by child rows, not the container.
        // Never let wizard autosaves overwrite them.
        //   priceCents       — owned by syncContainerMinPrice() (derived from package_item children)
        //   whatsIncluded    — owned by each package_item child row
        //   whatsNotIncluded — owned by each package_item child row
        if (existingListing.listingType === "package_container") {
          delete updatePayload.priceCents;
          delete updatePayload.whatsIncluded;
          delete updatePayload.whatsNotIncluded;
        }
      }

      if (typeof title === "string" && title.trim()) {
        updatePayload.title = title.trim();
      }

      // Security deposit: read from top-level body (edit page) or listingData (wizard autosave).
      // listingData takes lower priority so explicit top-level values always win.
      const rawDepositEnabled =
        req.body.securityDepositEnabled !== undefined
          ? req.body.securityDepositEnabled
          : normalizedListingData?.securityDepositEnabled;
      const rawDepositCents =
        req.body.securityDepositCents !== undefined
          ? req.body.securityDepositCents
          : normalizedListingData?.securityDepositCents;
      if (rawDepositEnabled !== undefined) {
        updatePayload.securityDepositEnabled = Boolean(rawDepositEnabled);
      }
      if (rawDepositEnabled === false || rawDepositEnabled === null) {
        updatePayload.securityDepositCents = null; // clear amount when disabled
      } else if (rawDepositCents !== undefined) {
        const parsed = Number(rawDepositCents);
        updatePayload.securityDepositCents =
          Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
      }

      const nextListingData = normalizedClassification
        ? updatePayload.listingData
        : existingListing?.listingData;
      const nextCanonicalPhotos = updatePayload.photos ?? existingListing?.photos;
      const nextCanonicalCategory = updatePayload.category ?? existingListing?.category;
      const shouldAutoDeactivateForMissingPhotos =
        existingListing?.status === "active" && !hasMinimumListingPhotos(nextListingData, nextCanonicalPhotos);
      const shouldAutoDeactivateForMissingCategory =
        existingListing?.status === "active" &&
        !resolveCanonicalListingCategory(nextListingData, nextCanonicalCategory);

      if (shouldAutoDeactivateForMissingPhotos || shouldAutoDeactivateForMissingCategory) {
        updatePayload.status = "inactive";
      }

      if (!existingListing.profileId && activeProfileId) {
        updatePayload.profileId = activeProfileId;
      }

      // ── Circumvention detection ──────────────────────────────────────────────
      // If this listing was previously removed for violation, check it before saving.
      const isResubmission = existingListing.violationRemoval;
      const listingFieldsToCheck: { value: string; contentType: string; label: string }[] = [];

      const descToCheck = typeof updatePayload.description === "string"
        ? updatePayload.description
        : (typeof (updatePayload.listingData as any)?.description === "string"
          ? (updatePayload.listingData as any).description
          : null);
      const titleToCheck = typeof updatePayload.title === "string" ? updatePayload.title : null;

      if (descToCheck) listingFieldsToCheck.push({ value: descToCheck, contentType: "listing_description", label: "Listing description" });
      if (titleToCheck) listingFieldsToCheck.push({ value: titleToCheck, contentType: "listing_title", label: "Listing title" });

      const vendorAccountIdForListing = String(vendorAuth.id);
      const serverUrlForListing = appUrl();

      for (const field of listingFieldsToCheck) {
        const detection = checkContent(field.value);
        if (detection.hardBlocked) {
          const result = await handleCircumventionViolation({
            vendorAccountId: vendorAccountIdForListing,
            contentType: field.contentType,
            contentSnapshot: field.value,
            matches: detection.matches,
            reason: `${field.label} contained ${blockReasonSummary(detection.blockReasons)}`,
            listingId: id,
            serverUrl: serverUrlForListing,
          });
          return res.status(422).json({
            error: "content_blocked",
            field: field.label,
            reason: `Your ${field.label.toLowerCase()} cannot include ${blockReasonSummary(detection.blockReasons)}. Please remove this information and try again.`,
            blockReasons: detection.blockReasons,
            matches: detection.matches,
            phase: result.phase,
            softAttemptNumber: result.phase === "soft" ? result.softAttemptNumber : null,
            warningNumber: result.phase === "hard" ? result.warningNumber : null,
            suspended: result.phase === "hard" ? result.suspended : false,
            suspensionEndsAt: result.phase === "hard" ? result.endsAt : null,
          });
        }
        if (detection.softFlagged) {
          db.insert(circumventionFlags).values({
            flagType: "soft_flag",
            contentType: field.contentType as any,
            contentSnapshot: field.value.slice(0, 2000),
            matches: detection.matches,
            vendorAccountId: vendorAccountIdForListing,
            listingId: id,
            status: "pending",
          }).catch((err: any) => logger.warn("[circumvention] soft flag insert failed:", err?.message));
        }
      }

      // If this is a resubmission after violation removal, mark as awaiting admin re-review
      if (isResubmission) {
        updatePayload.pendingAdminReview = true;
      }
      // ── End circumvention detection ──────────────────────────────────────────

      const [updated] = await db
        .update(vendorListings)
        .set(updatePayload)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      // Re-translate async whenever a listing is saved (covers edits post-publish).
      translateListingAsync(updated.id, {
        title: updated.title,
        description: updated.description,
        whatsIncluded: updated.whatsIncluded,
        whatsNotIncluded: updated.whatsNotIncluded,
      });

      const softFlaggedListing = listingFieldsToCheck.some(f => checkContent(f.value).softFlagged);
      return res.json({ ...updated, softFlagged: softFlaggedListing, pendingReview: isResubmission });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id", error);
      return res.status(500).json({ error: "Unable to update listing" });
    }
  });

  app.patch("/api/vendor/listings/:id/publish", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((existing[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existing[0]?.profileId && existing[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }

      // Block publish while vendor is suspended.
      const activeSuspension = await getActiveSuspension(String(vendorAuth.id));
      if (activeSuspension) {
        const endsAt = activeSuspension.endsAt
          ? new Date(activeSuspension.endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
          : null;
        return res.status(403).json({
          error: "account_suspended",
          message: endsAt
            ? `Your account is suspended until ${endsAt}. You cannot publish listings during this period.`
            : "Your account is currently suspended. You cannot publish listings.",
          suspensionEndsAt: activeSuspension.endsAt,
        });
      }

      // Block publish until vendor profile onboarding is complete.
      const [vendorAccount] = await db
        .select({
          stripeConnectId: vendorAccounts.stripeConnectId,
          stripeOnboardingComplete: vendorAccounts.stripeOnboardingComplete,
          onboardingCompletedAt: vendorAccounts.onboardingCompletedAt,
          subscriptionPlan: vendorAccounts.subscriptionPlan,
          subscriptionStatus: vendorAccounts.subscriptionStatus,
          compEndsAt: vendorAccounts.compEndsAt,
        })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id))
        .limit(1);

      if (!vendorAccount?.onboardingCompletedAt) {
        return res.status(403).json({
          error: "onboarding_incomplete",
          message: "Complete your vendor profile before publishing a listing.",
        });
      }

      if (!vendorAccount?.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
        return res.status(400).json({
          error: "stripe_not_configured",
          message: "Set up your payment account before publishing a listing. Go to your dashboard and complete the Stripe Connect setup — your listing will stay in draft until then.",
        });
      }

      // Free-tier active-listing cap. Pro vendors are unlimited. The gate is on the
      // publish/activate transition only — drafting/editing is always allowed, and
      // re-publishing an already-active listing never trips it. package_item rows
      // are managed by their parent container, so they're excluded from the count.
      const entitlements = getVendorEntitlements(vendorAccount);
      if (!entitlements.isPro) {
        const isAlreadyActive = (existing[0]?.status || "").toLowerCase() === "active";
        if (!isAlreadyActive) {
          const [{ activeCount }] = await db
            .select({ activeCount: drizzleSql<number>`count(*)::int` })
            .from(vendorListings)
            .where(
              and(
                eq(vendorListings.accountId, vendorAuth.id),
                eq(vendorListings.status, "active"),
                ne(vendorListings.listingType, "package_item")
              )
            );
          if (activeCount >= entitlements.maxActiveListings) {
            return res.status(403).json({
              error: "listing_limit_reached",
              message: "Your free plan includes 1 active listing. Upgrade to Pro for unlimited listings.",
              upgradeUrl: "/vendor/dashboard#vendor-billing",
            });
          }
        }
      }

      const incomingListingData = req.body?.listingData;
      const incomingTitle = req.body?.title;
      const incomingDescription =
        asTrimmedString(req.body?.description) ||
        asTrimmedString(req.body?.listingDescription) ||
        asTrimmedString(req.body?.serviceDescription) ||
        null;

      if (incomingListingData !== undefined && (typeof incomingListingData !== "object" || incomingListingData === null || Array.isArray(incomingListingData))) {
        return res.status(400).json({ error: "listingData must be a JSON object." });
      }

      const normalizedIncomingListingData =
        incomingListingData !== undefined
          ? (clampListingDescriptions(incomingListingData) as Record<string, any>)
          : undefined;
      const existingListing = existing[0];
      const rawListingData: any =
        (clampListingDescriptions(
          normalizedIncomingListingData !== undefined ? normalizedIncomingListingData : existingListing?.listingData
        ) as Record<string, any>) || {};
      const normalizedClassification = normalizeListingClassification(rawListingData, {
        requireCategory: false,
      });
      const ld: any = normalizedClassification.listingData;
      const canonicalClassification = {
        category: normalizedClassification.category ?? normalizeListingCategory(existingListing?.category),
        subcategory: normalizedClassification.subcategory ?? normalizeListingSubcategory(existingListing?.subcategory),
      };
      const canonicalColumns = buildCanonicalListingColumns({
        listingDataRaw: ld,
        existingCanonical: {
          category: existingListing?.category,
          subcategory: existingListing?.subcategory,
          title: existingListing?.title,
          description: existingListing?.description,
          whatsIncluded: existingListing?.whatsIncluded,
          whatsNotIncluded: existingListing?.whatsNotIncluded,
          tags: existingListing?.tags,
          popularFor: existingListing?.popularFor,
          instantBookEnabled: existingListing?.instantBookEnabled,
          pricingUnit: existingListing?.pricingUnit,
          priceCents: existingListing?.priceCents,
          quantity: existingListing?.quantity,
          minimumHours: existingListing?.minimumHours,
          listingServiceCenterLabel: existingListing?.listingServiceCenterLabel,
          listingServiceCenterLat: existingListing?.listingServiceCenterLat,
          listingServiceCenterLng: existingListing?.listingServiceCenterLng,
          serviceRadiusMiles: existingListing?.serviceRadiusMiles,
          serviceAreaMode: existingListing?.serviceAreaMode,
          travelOffered: existingListing?.travelOffered,
          travelFeeEnabled: existingListing?.travelFeeEnabled,
          travelFeeType: existingListing?.travelFeeType,
          travelFeeAmountCents: existingListing?.travelFeeAmountCents,
          pickupOffered: (existingListing as any)?.pickupOffered,
          deliveryOffered: existingListing?.deliveryOffered,
          deliveryFeeEnabled: (existingListing as any)?.deliveryFeeEnabled,
          deliveryFeeAmountCents: existingListing?.deliveryFeeAmountCents,
          setupOffered: existingListing?.setupOffered,
          setupFeeEnabled: (existingListing as any)?.setupFeeEnabled,
          setupFeeAmountCents: existingListing?.setupFeeAmountCents,
          takedownOffered: (existingListing as any)?.takedownOffered,
          takedownFeeEnabled: (existingListing as any)?.takedownFeeEnabled,
          takedownFeeAmountCents: (existingListing as any)?.takedownFeeAmountCents,
          cancellationPolicy: (existingListing as any)?.cancellationPolicy,
          cancellationPolicyDays: (existingListing as any)?.cancellationPolicyDays,
          photos: existingListing?.photos,
        },
        classification: canonicalClassification,
      });

      // ---- Publish validation (hard requirements) ----
      const mode = asTrimmedString(canonicalColumns.serviceAreaMode ?? existingListing?.serviceAreaMode).toLowerCase();
      const loc = ld.serviceLocation;
      const categoryOk = Boolean(canonicalColumns.category ?? normalizeListingCategory(existingListing?.category));
      const resolvedTitle = canonicalColumns.title ?? normalizeListingTitleCandidate(existingListing?.title);
      const listingDataDescription =
        asTrimmedString(ld?.description) ||
        asTrimmedString(ld?.listingDescription) ||
        asTrimmedString(ld?.serviceDescription) ||
        null;
      const resolvedDescription =
        canonicalColumns.description ??
        listingDataDescription ??
        incomingDescription ??
        (asTrimmedString(existingListing?.description) || null);
      const resolvedPriceCents = canonicalColumns.priceCents ?? parseIntegerValue(existingListing?.priceCents);
      const resolvedPhotos =
        canonicalColumns.photos.length > 0
          ? canonicalColumns.photos
          : toUniqueTrimmedStringList(existingListing?.photos);

      const centerLat =
        canonicalColumns.listingServiceCenterLat ?? parseLatLngValue(existingListing?.listingServiceCenterLat);
      const centerLng =
        canonicalColumns.listingServiceCenterLng ?? parseLatLngValue(existingListing?.listingServiceCenterLng);
      const centerLabel =
        asTrimmedString(canonicalColumns.listingServiceCenterLabel) ||
        asTrimmedString(existingListing?.listingServiceCenterLabel);

      const hasTypedLocation = Boolean(
        centerLabel &&
        Number.isFinite(centerLat) &&
        Number.isFinite(centerLng)
      );
      const hasLegacyLocation =
        loc &&
        typeof loc === "object" &&
        typeof loc.label === "string" &&
        Number.isFinite(Number(loc.lat)) &&
        Number.isFinite(Number(loc.lng)) &&
        typeof loc.country === "string" &&
        loc.country.trim().length > 0;
      const hasLoc = hasTypedLocation || Boolean(hasLegacyLocation);

      const isPackageContainer = existingListing?.listingType === "package_container";

      const titleOk = Boolean(resolvedTitle && resolvedTitle.trim().length >= 2);
      // package_container: description lives on each package_item, not the container
      const descOk = isPackageContainer || Boolean(resolvedDescription && resolvedDescription.trim().length >= 10);
      const photosOk = hasMinimumListingPhotos(ld, resolvedPhotos);
      // package_container: price is derived from child package_items via syncContainerMinPrice
      const priceOk = isPackageContainer || hasValidListingPrice(ld, resolvedPriceCents);

      // service area checks
      const modeOk = mode === "radius" || mode === "nationwide" || mode === "global";

      const hasCenter = Number.isFinite(centerLat) && Number.isFinite(centerLng);

      const radiusMiles = canonicalColumns.serviceRadiusMiles ?? parseIntegerValue(existingListing?.serviceRadiusMiles);
      const radiusOk =
        mode !== "radius" ? true : Number.isFinite(Number(radiusMiles)) && Number(radiusMiles) > 0;

      const missing = {
        category: !categoryOk,
        serviceAreaMode: !modeOk,
        serviceLocation: !hasLoc,
        listingTitle: !titleOk,
        listingDescription: !descOk,
        photos: !photosOk,
        price: !priceOk,
        serviceCenter: mode === "radius" ? !hasCenter : false,
        serviceRadiusMiles: mode === "radius" ? !radiusOk : false,
      };

      if (Object.values(missing).some(Boolean)) {
        const reasons: string[] = [];
        if (missing.category) reasons.push("Select category.");
        if (missing.listingTitle) reasons.push("Add listing title.");
        if (missing.listingDescription) reasons.push("Add listing description (at least 10 characters).");
        if (missing.photos) reasons.push(`Add at least ${MIN_LISTING_PHOTO_COUNT} photos.`);
        if (missing.price) reasons.push("Add a valid price.");
        if (missing.serviceAreaMode) reasons.push("Select service area mode.");
        if (missing.serviceLocation) reasons.push("Select service location.");
        if (missing.serviceCenter) reasons.push("For radius mode, set service center.");
        if (missing.serviceRadiusMiles) reasons.push("For radius mode, set service radius miles.");

        return res.status(400).json({
          error: "Listing incomplete — cannot publish",
          missing,
          reasons,
        });
      }
      const publishUpdatePayload: any = {
        status: "active",
        updatedAt: new Date(),
      };

      publishUpdatePayload.listingData = mirrorListingQuantityIntoListingData({
        listingDataRaw: ld,
        canonical: canonicalColumns,
      });
      Object.assign(
        publishUpdatePayload,
        canonicalColumns
      );
      // package_container: priceCents is owned by syncContainerMinPrice() — never overwrite it here
      if (isPackageContainer) {
        delete publishUpdatePayload.priceCents;
        delete publishUpdatePayload.whatsIncluded;
        delete publishUpdatePayload.whatsNotIncluded;
      }
      if (!existingListing?.profileId && activeProfileId) {
        publishUpdatePayload.profileId = activeProfileId;
      }

      if (typeof incomingTitle === "string" && incomingTitle.trim()) {
        publishUpdatePayload.title = incomingTitle.trim();
      }

      const [updated] = await db
        .update(vendorListings)
        .set(publishUpdatePayload)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      // For package containers, activate all child package_items and resync min price
      if (isPackageContainer) {
        await db
          .update(vendorListings)
          .set({ status: "active", updatedAt: new Date() })
          .where(
            and(
              eq(vendorListings.parentListingId, id),
              eq(vendorListings.listingType, "package_item"),
              ne(vendorListings.status, "deleted")
            )
          );
        await syncContainerMinPrice(id);
      }

      // Re-fetch so response includes the synced priceCents
      const finalListing = isPackageContainer
        ? (await db.select().from(vendorListings).where(eq(vendorListings.id, id)))[0] ?? updated
        : updated;

      if (updated?.status === "active" && existing[0]?.status !== "active") {
        const [{ activeCount }] = await db
          .select({ activeCount: drizzleSql<number>`count(*)::int` })
          .from(vendorListings)
          .where(and(eq(vendorListings.accountId, vendorAuth.id), eq(vendorListings.status, "active")));
        if (activeCount === 1) {
          logEvent("vendor_first_listing_published", "vendor", vendorAuth.id, {
            listing_id: id,
            category: (updated as any)?.category ?? null,
          });
        }
      }

      return res.json(finalListing);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/publish", error);
      return res.status(500).json({ error: "Unable to publish listing" });
    }
  });

    app.patch("/api/vendor/listings/:id/unpublish", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((existing[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existing[0]?.profileId && existing[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }

      const [updated] = await db
        .update(vendorListings)
        .set({
          status: "inactive",
          ...(existing[0]?.profileId ? {} : { profileId: activeProfileId }),
          updatedAt: new Date(),
        })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      // For package containers, deactivate all child package_items too
      if (existing[0]?.listingType === "package_container") {
        await db
          .update(vendorListings)
          .set({ status: "inactive", updatedAt: new Date() })
          .where(
            and(
              eq(vendorListings.parentListingId, id),
              eq(vendorListings.listingType, "package_item"),
              ne(vendorListings.status, "deleted")
            )
          );
      }

      return res.json(updated);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/unpublish", error);
      return res.status(500).json({ error: "Unable to unpublish listing" });
    }
  });

  // ── Package Item Endpoints ───────────────────────────────────────────────────

  /**
   * Syncs the container listing's priceCents to the minimum price across its
   * package_item children. This keeps browse cards showing "Starting from $X"
   * accurately. Safe to call after any package create/update/delete.
   */
  async function syncContainerMinPrice(containerId: string) {
    const children = await db
      .select({ priceCents: vendorListings.priceCents })
      .from(vendorListings)
      .where(
        and(
          eq(vendorListings.parentListingId, containerId),
          eq(vendorListings.listingType, "package_item"),
        )
      );
    const prices = children
      .map((c) => c.priceCents)
      .filter((p): p is number => typeof p === "number" && p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    await db
      .update(vendorListings)
      .set({ priceCents: minPrice, updatedAt: new Date() })
      .where(eq(vendorListings.id, containerId));
  }

  /**
   * GET /api/vendor/listings/:id/packages
   * Returns all package_item children for a package_container listing.
   */
  app.get("/api/vendor/listings/:id/packages", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      const [container] = await db
        .select({ id: vendorListings.id, accountId: vendorListings.accountId, listingType: vendorListings.listingType })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);

      if (!container) return res.status(404).json({ error: "Listing not found" });
      if (container.listingType !== "package_container") {
        return res.status(400).json({ error: "Listing is not a package_container" });
      }

      const packages = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          description: vendorListings.description,
          whatsIncluded: vendorListings.whatsIncluded,
          whatsNotIncluded: vendorListings.whatsNotIncluded,
          priceCents: vendorListings.priceCents,
          pricingUnit: vendorListings.pricingUnit,
          sortOrder: vendorListings.sortOrder,
          status: vendorListings.status,
          dimensionUnit: vendorListings.dimensionUnit,
          dimensionWidth: vendorListings.dimensionWidth,
          dimensionLength: vendorListings.dimensionLength,
          dimensionHeight: vendorListings.dimensionHeight,
          travelOffered: vendorListings.travelOffered,
          travelFeeEnabled: vendorListings.travelFeeEnabled,
          travelFeeType: vendorListings.travelFeeType,
          travelFeeAmountCents: vendorListings.travelFeeAmountCents,
          deliveryOffered: vendorListings.deliveryOffered,
          deliveryFeeEnabled: vendorListings.deliveryFeeEnabled,
          deliveryFeeAmountCents: vendorListings.deliveryFeeAmountCents,
          setupOffered: vendorListings.setupOffered,
          setupFeeEnabled: vendorListings.setupFeeEnabled,
          setupFeeAmountCents: vendorListings.setupFeeAmountCents,
          takedownOffered: vendorListings.takedownOffered,
          takedownFeeEnabled: vendorListings.takedownFeeEnabled,
          takedownFeeAmountCents: vendorListings.takedownFeeAmountCents,
          cancellationPolicy: vendorListings.cancellationPolicy,
          cancellationPolicyDays: vendorListings.cancellationPolicyDays,
        })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.parentListingId, id),
            eq(vendorListings.listingType, "package_item"),
          )
        )
        .orderBy(asc(vendorListings.sortOrder), asc(vendorListings.createdAt));

      return res.json(packages);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages GET", error);
      return res.status(500).json({ error: "Unable to fetch packages" });
    }
  });

  /**
   * POST /api/vendor/listings/:id/packages
   * Creates a new package_item child row under a package_container.
   */
  app.post("/api/vendor/listings/:id/packages", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      const {
        title, description, whatsIncluded, whatsNotIncluded,
        priceCents, pricingUnit, sortOrder,
        dimensionUnit, dimensionWidth, dimensionLength, dimensionHeight,
        travelOffered, travelFeeEnabled, travelFeeType, travelFeeAmountCents,
        deliveryOffered, deliveryFeeEnabled, deliveryFeeAmountCents,
        setupOffered, setupFeeEnabled, setupFeeAmountCents,
        takedownOffered, takedownFeeEnabled, takedownFeeAmountCents,
        cancellationPolicyOverride,
      } = req.body;

      const [container] = await db
        .select({ id: vendorListings.id, accountId: vendorListings.accountId, listingType: vendorListings.listingType, profileId: vendorListings.profileId, category: vendorListings.category })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);

      if (!container) return res.status(404).json({ error: "Listing not found" });
      if (container.listingType !== "package_container") {
        return res.status(400).json({ error: "Listing is not a package_container" });
      }

      // Enforce 5-package max
      const existingCount = await db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(vendorListings)
        .where(and(eq(vendorListings.parentListingId, id), eq(vendorListings.listingType, "package_item")));
      if ((existingCount[0]?.count ?? 0) >= 5) {
        return res.status(400).json({ error: "Maximum of 5 packages allowed per listing", code: "package_limit_reached" });
      }

      const packageTitle =
        typeof title === "string" && title.trim() ? title.trim() : "New Package";
      const packageDescription =
        typeof description === "string" ? description.trim() : "";
      const packageInclusions = Array.isArray(whatsIncluded)
        ? whatsIncluded.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
        : [];
      const packageNotIncluded = Array.isArray(whatsNotIncluded)
        ? whatsNotIncluded.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
        : [];
      const packagePriceCents =
        typeof priceCents === "number" && priceCents >= 0 ? Math.floor(priceCents) : null;
      const packagePricingUnit =
        pricingUnit === "per_hour" || pricingUnit === "per_day" ? pricingUnit : "per_day";
      const packageSortOrder = typeof sortOrder === "number" ? sortOrder : 0;

      const [pkg] = await db
        .insert(vendorListings)
        .values({
          accountId: vendorAuth.id,
          profileId: container.profileId,
          parentListingId: container.id,
          listingType: "package_item",
          status: "active",
          category: container.category,
          title: packageTitle,
          description: packageDescription,
          whatsIncluded: packageInclusions,
          whatsNotIncluded: packageNotIncluded,
          priceCents: packagePriceCents,
          pricingUnit: packagePricingUnit,
          sortOrder: packageSortOrder,
          dimensionUnit: typeof dimensionUnit === "string" ? dimensionUnit : null,
          dimensionWidth: typeof dimensionWidth === "number" && dimensionWidth > 0 ? dimensionWidth : null,
          dimensionLength: typeof dimensionLength === "number" && dimensionLength > 0 ? dimensionLength : null,
          dimensionHeight: typeof dimensionHeight === "number" && dimensionHeight > 0 ? dimensionHeight : null,
          travelOffered: travelOffered === true,
          travelFeeEnabled: travelOffered === true && travelFeeEnabled === true,
          travelFeeType: typeof travelFeeType === "string" ? travelFeeType : null,
          travelFeeAmountCents: typeof travelFeeAmountCents === "number" && travelFeeAmountCents >= 0 ? Math.floor(travelFeeAmountCents) : null,
          deliveryOffered: deliveryOffered === true,
          pickupOffered: deliveryOffered === true,
          deliveryFeeEnabled: deliveryOffered === true && deliveryFeeEnabled === true,
          deliveryFeeAmountCents: typeof deliveryFeeAmountCents === "number" && deliveryFeeAmountCents >= 0 ? Math.floor(deliveryFeeAmountCents) : null,
          setupOffered: setupOffered === true,
          setupFeeEnabled: setupOffered === true && setupFeeEnabled === true,
          setupFeeAmountCents: typeof setupFeeAmountCents === "number" && setupFeeAmountCents >= 0 ? Math.floor(setupFeeAmountCents) : null,
          takedownOffered: takedownOffered === true,
          takedownFeeEnabled: takedownOffered === true && takedownFeeEnabled === true,
          takedownFeeAmountCents: typeof takedownFeeAmountCents === "number" && takedownFeeAmountCents >= 0 ? Math.floor(takedownFeeAmountCents) : null,
          cancellationPolicy: typeof cancellationPolicyOverride?.policy === "string" ? cancellationPolicyOverride.policy : "cancel_anytime",
          cancellationPolicyDays: typeof cancellationPolicyOverride?.hours === "number" ? cancellationPolicyOverride.hours : null,
        })
        .returning();

      await syncContainerMinPrice(id);
      return res.status(201).json(pkg);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages POST", error);
      return res.status(500).json({ error: "Unable to create package" });
    }
  });

  /**
   * PATCH /api/vendor/listings/:id/packages/:pkgId
   * Updates a package_item child row.
   */
  app.patch("/api/vendor/listings/:id/packages/:pkgId", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id, pkgId } = req.params;
      const {
        title, description, whatsIncluded, whatsNotIncluded,
        priceCents, pricingUnit, sortOrder,
        dimensionUnit, dimensionWidth, dimensionLength, dimensionHeight,
        travelOffered, travelFeeEnabled, travelFeeType, travelFeeAmountCents,
        deliveryOffered, deliveryFeeEnabled, deliveryFeeAmountCents,
        setupOffered, setupFeeEnabled, setupFeeAmountCents,
        takedownOffered, takedownFeeEnabled, takedownFeeAmountCents,
        cancellationPolicyOverride,
      } = req.body;

      const [pkg] = await db
        .select({ id: vendorListings.id, accountId: vendorListings.accountId, parentListingId: vendorListings.parentListingId, listingType: vendorListings.listingType })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, pkgId),
            eq(vendorListings.parentListingId, id),
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "package_item"),
          )
        )
        .limit(1);

      if (!pkg) return res.status(404).json({ error: "Package not found" });

      const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof title === "string" && title.trim()) updatePayload.title = title.trim();
      if (typeof description === "string") updatePayload.description = description.trim();
      if (Array.isArray(whatsIncluded)) {
        updatePayload.whatsIncluded = whatsIncluded
          .filter((s: unknown) => typeof s === "string" && s.trim())
          .map((s: string) => s.trim());
      }
      if (Array.isArray(whatsNotIncluded)) {
        updatePayload.whatsNotIncluded = whatsNotIncluded
          .filter((s: unknown) => typeof s === "string" && s.trim())
          .map((s: string) => s.trim());
      }
      if (typeof priceCents === "number" && priceCents >= 0) updatePayload.priceCents = Math.floor(priceCents);
      if (pricingUnit === "per_hour" || pricingUnit === "per_day") updatePayload.pricingUnit = pricingUnit;
      if (typeof sortOrder === "number") updatePayload.sortOrder = sortOrder;
      if (typeof dimensionUnit === "string") updatePayload.dimensionUnit = dimensionUnit;
      updatePayload.dimensionWidth = typeof dimensionWidth === "number" && dimensionWidth > 0 ? dimensionWidth : null;
      updatePayload.dimensionLength = typeof dimensionLength === "number" && dimensionLength > 0 ? dimensionLength : null;
      updatePayload.dimensionHeight = typeof dimensionHeight === "number" && dimensionHeight > 0 ? dimensionHeight : null;
      updatePayload.travelOffered = travelOffered === true;
      updatePayload.travelFeeEnabled = travelOffered === true && travelFeeEnabled === true;
      if (typeof travelFeeType === "string") updatePayload.travelFeeType = travelFeeType;
      updatePayload.travelFeeAmountCents = typeof travelFeeAmountCents === "number" && travelFeeAmountCents >= 0 ? Math.floor(travelFeeAmountCents) : null;
      updatePayload.deliveryOffered = deliveryOffered === true;
      updatePayload.pickupOffered = deliveryOffered === true;
      updatePayload.deliveryFeeEnabled = deliveryOffered === true && deliveryFeeEnabled === true;
      updatePayload.deliveryFeeAmountCents = typeof deliveryFeeAmountCents === "number" && deliveryFeeAmountCents >= 0 ? Math.floor(deliveryFeeAmountCents) : null;
      updatePayload.setupOffered = setupOffered === true;
      updatePayload.setupFeeEnabled = setupOffered === true && setupFeeEnabled === true;
      updatePayload.setupFeeAmountCents = typeof setupFeeAmountCents === "number" && setupFeeAmountCents >= 0 ? Math.floor(setupFeeAmountCents) : null;
      updatePayload.takedownOffered = takedownOffered === true;
      updatePayload.takedownFeeEnabled = takedownOffered === true && takedownFeeEnabled === true;
      updatePayload.takedownFeeAmountCents = typeof takedownFeeAmountCents === "number" && takedownFeeAmountCents >= 0 ? Math.floor(takedownFeeAmountCents) : null;
      if (cancellationPolicyOverride !== undefined) {
        updatePayload.cancellationPolicy = typeof cancellationPolicyOverride?.policy === "string" ? cancellationPolicyOverride.policy : "cancel_anytime";
        updatePayload.cancellationPolicyDays = typeof cancellationPolicyOverride?.hours === "number" ? cancellationPolicyOverride.hours : null;
      }

      const [updated] = await db
        .update(vendorListings)
        .set(updatePayload as any)
        .where(eq(vendorListings.id, pkgId))
        .returning();

      await syncContainerMinPrice(id);
      return res.json(updated);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages PATCH", error);
      return res.status(500).json({ error: "Unable to update package" });
    }
  });

  /**
   * DELETE /api/vendor/listings/:id/packages/:pkgId
   * Deletes a package_item child row.
   */
  app.delete("/api/vendor/listings/:id/packages/:pkgId", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id, pkgId } = req.params;

      const [pkg] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, pkgId),
            eq(vendorListings.parentListingId, id),
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "package_item"),
          )
        )
        .limit(1);

      if (!pkg) return res.status(404).json({ error: "Package not found" });

      await db.delete(vendorListings).where(eq(vendorListings.id, pkgId));
      await syncContainerMinPrice(id);
      return res.status(204).send();
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages DELETE", error);
      return res.status(500).json({ error: "Unable to delete package" });
    }
  });

  // ── Add-on Link Endpoints ────────────────────────────────────────────────────

  /**
   * GET /api/vendor/listings/:id/addon-links
   * Returns all add-on listings linked to a parent listing (vendor-scoped).
   */
  app.get("/api/vendor/listings/:id/addon-links", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      // Verify ownership
      const [parent] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);
      if (!parent) return res.status(404).json({ error: "Listing not found" });

      const links = await db
        .select({
          id: listingAddonLinks.id,
          addonListingId: listingAddonLinks.addonListingId,
          title: vendorListings.title,
          priceCents: vendorListings.priceCents,
          pricingUnit: vendorListings.pricingUnit,
          quantity: vendorListings.quantity,
          photos: vendorListings.photos,
          status: vendorListings.status,
        })
        .from(listingAddonLinks)
        .innerJoin(vendorListings, eq(listingAddonLinks.addonListingId, vendorListings.id))
        .where(eq(listingAddonLinks.parentListingId, id))
        .orderBy(asc(vendorListings.title));

      return res.json(links);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/addon-links", error);
      return res.status(500).json({ error: "Unable to load add-on links" });
    }
  });

  /**
   * POST /api/vendor/listings/:id/addon-links
   * Attaches an add-on listing to a parent listing.
   * Body: { addonListingId: string }
   */
  app.post("/api/vendor/listings/:id/addon-links", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      const addonListingId = asTrimmedString(req.body?.addonListingId);
      if (!addonListingId) return res.status(400).json({ error: "addonListingId is required" });

      // Verify parent ownership
      const [parent] = await db
        .select({ id: vendorListings.id, listingType: vendorListings.listingType })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);
      if (!parent) return res.status(404).json({ error: "Listing not found" });

      // Verify add-on belongs to same vendor and is addon type
      const [addon] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, addonListingId),
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "addon")
          )
        )
        .limit(1);
      if (!addon) return res.status(400).json({ error: "Add-on listing not found or not owned by you", code: "addon_not_found" });

      // Upsert link (unique constraint handles duplicates gracefully)
      const [link] = await db
        .insert(listingAddonLinks)
        .values({ parentListingId: id, addonListingId })
        .onConflictDoNothing()
        .returning();

      return res.json({ success: true, link: link ?? null });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/addon-links POST", error);
      return res.status(500).json({ error: "Unable to attach add-on" });
    }
  });

  /**
   * DELETE /api/vendor/listings/:id/addon-links/:addonId
   * Removes an add-on link from a parent listing.
   */
  app.delete("/api/vendor/listings/:id/addon-links/:addonId", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id, addonId } = req.params;

      // Verify parent ownership
      const [parent] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);
      if (!parent) return res.status(404).json({ error: "Listing not found" });

      await db
        .delete(listingAddonLinks)
        .where(
          and(
            eq(listingAddonLinks.parentListingId, id),
            eq(listingAddonLinks.addonListingId, addonId)
          )
        );

      return res.json({ success: true });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/addon-links DELETE", error);
      return res.status(500).json({ error: "Unable to remove add-on link" });
    }
  });

  /**
   * GET /api/vendor/addon-listings
   * Returns all add-on type listings belonging to this vendor.
   * Used in the "Attach Add-ons" catalog popup.
   */
  app.get("/api/vendor/addon-listings", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const addons = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          description: vendorListings.description,
          priceCents: vendorListings.priceCents,
          pricingUnit: vendorListings.pricingUnit,
          quantity: vendorListings.quantity,
          status: vendorListings.status,
          photos: vendorListings.photos,
        })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "addon"),
            ne(vendorListings.status, "deleted")
          )
        )
        .orderBy(asc(vendorListings.title));

      return res.json(addons);
    } catch (error: any) {
      logRouteError("/api/vendor/addon-listings", error);
      return res.status(500).json({ error: "Unable to load add-on listings" });
    }
  });

  /**
   * GET /api/vendor/addon-listings/:addonId/attachable
   * Returns the vendor's parent-eligible listings (single + package_container),
   * each flagged with whether this add-on is currently attached to it. Powers the
   * reverse "Attach to Listings" step at the end of the add-on wizard.
   */
  app.get("/api/vendor/addon-listings/:addonId/attachable", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { addonId } = req.params;

      // Verify the add-on exists, is owned by this vendor, and is actually an add-on.
      const [addon] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, addonId),
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "addon")
          )
        )
        .limit(1);
      if (!addon) return res.status(404).json({ error: "Add-on listing not found" });

      const candidates = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          listingType: vendorListings.listingType,
          status: vendorListings.status,
          priceCents: vendorListings.priceCents,
          pricingUnit: vendorListings.pricingUnit,
          photos: vendorListings.photos,
        })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.accountId, vendorAuth.id),
            inArray(vendorListings.listingType, ["single", "package_container"]),
            ne(vendorListings.status, "deleted")
          )
        )
        .orderBy(asc(vendorListings.title));

      const links = await db
        .select({ parentListingId: listingAddonLinks.parentListingId })
        .from(listingAddonLinks)
        .where(eq(listingAddonLinks.addonListingId, addonId));
      const attachedIds = new Set(links.map((l) => l.parentListingId));

      return res.json(
        candidates.map((c) => ({
          ...c,
          photos: (c.photos ?? []).map((p) => resolveStoredUploadPath(p) ?? p),
          attached: attachedIds.has(c.id),
        }))
      );
    } catch (error: any) {
      logRouteError("/api/vendor/addon-listings/:addonId/attachable", error);
      return res.status(500).json({ error: "Unable to load attachable listings" });
    }
  });

  app.get("/api/vendors/public/:vendorId/shop", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");

      const vendorIdParam = asTrimmedString(req.params?.vendorId);
      const requestedProfileId = asTrimmedString(req.query?.profileId);
      if (!vendorIdParam) {
        return res.status(400).json({ error: "Invalid vendor id" });
      }

      let resolvedVendorAccountId = vendorIdParam;
      let resolvedProfileId = requestedProfileId;

      const accountRows = await db
        .select({
          id: vendorAccounts.id,
          businessName: vendorAccounts.businessName,
          activeProfileId: vendorAccounts.activeProfileId,
          shopSlug: vendorAccounts.shopSlug,
        })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.id, resolvedVendorAccountId), eq(vendorAccounts.active, true), isNull(vendorAccounts.deletedAt)))
        .limit(1);

      let account = accountRows[0] as typeof accountRows[0] & { shopSlug: string } | undefined;
      if (!account) {
        const profileOwnerRows = await db
          .select({
            accountId: vendorProfiles.accountId,
            profileId: vendorProfiles.id,
            accountBusinessName: vendorAccounts.businessName,
            accountActiveProfileId: vendorAccounts.activeProfileId,
            accountShopSlug: vendorAccounts.shopSlug,
          })
          .from(vendorProfiles)
          .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
          .where(and(eq(vendorProfiles.id, vendorIdParam), eq(vendorProfiles.active, true), eq(vendorAccounts.active, true), isNull(vendorAccounts.deletedAt)))
          .limit(1);
        const profileOwner = profileOwnerRows[0];
        if (profileOwner?.accountId) {
          resolvedVendorAccountId = profileOwner.accountId;
          resolvedProfileId = resolvedProfileId || profileOwner.profileId;
          account = {
            id: profileOwner.accountId,
            businessName: profileOwner.accountBusinessName,
            activeProfileId: profileOwner.accountActiveProfileId,
            shopSlug: profileOwner.accountShopSlug,
          };
        }
      }
      // Third path: resolve by shop_slug (slug-based URLs like /shop/my-flower-shop)
      if (!account) {
        const slugRows = await db
          .select({
            id: vendorAccounts.id,
            businessName: vendorAccounts.businessName,
            activeProfileId: vendorAccounts.activeProfileId,
            shopSlug: vendorAccounts.shopSlug,
          })
          .from(vendorAccounts)
          .where(and(eq(vendorAccounts.shopSlug, vendorIdParam), eq(vendorAccounts.active, true), isNull(vendorAccounts.deletedAt)))
          .limit(1);
        if (slugRows[0]) {
          resolvedVendorAccountId = slugRows[0].id;
          account = slugRows[0];
        }
      }
      if (!account) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      await deactivateActiveListingsViolatingPublishGate(resolvedVendorAccountId);

      const profileWhere = resolvedProfileId
        ? and(
            eq(vendorProfiles.accountId, resolvedVendorAccountId),
            eq(vendorProfiles.id, resolvedProfileId),
            eq(vendorProfiles.active, true)
          )
        : account.activeProfileId
          ? and(
              eq(vendorProfiles.accountId, resolvedVendorAccountId),
              eq(vendorProfiles.id, account.activeProfileId),
              eq(vendorProfiles.active, true)
            )
          : and(eq(vendorProfiles.accountId, resolvedVendorAccountId), eq(vendorProfiles.active, true));

      const profileRows = await db
        .select()
        .from(vendorProfiles)
        .where(profileWhere)
        .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id))
        .limit(1);
      if (resolvedProfileId && !profileRows[0]) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const selectedProfile =
        profileRows[0] ||
        (
          await db
            .select()
            .from(vendorProfiles)
            .where(and(eq(vendorProfiles.accountId, resolvedVendorAccountId), eq(vendorProfiles.active, true)))
            .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id))
            .limit(1)
        )[0];

      if (!selectedProfile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const vendor = {
        id: account.id,
        businessName: getProfileDisplayName(selectedProfile, account.businessName),
        serviceDescription: selectedProfile.serviceDescription,
        city: selectedProfile.city,
        onlineProfiles: selectedProfile.onlineProfiles,
      };

      const onlineProfiles =
        vendor.onlineProfiles && typeof vendor.onlineProfiles === "object" && !Array.isArray(vendor.onlineProfiles)
          ? (vendor.onlineProfiles as Record<string, unknown>)
          : {};
      const aboutBusiness = asTrimmedString((onlineProfiles as any).aboutBusiness);
      const aboutOwner = asTrimmedString((onlineProfiles as any).aboutOwner);
      const profileImageUrl = resolveStoredUploadPath(asTrimmedString((onlineProfiles as any).shopProfileImageUrl));
      const coverImageUrl = resolveStoredUploadPath(asTrimmedString((onlineProfiles as any).shopCoverImageUrl));
      const coverImagePosition = normalizePhotoPosition((onlineProfiles as any).shopCoverImagePosition);
      const tagline = asTrimmedString((onlineProfiles as any).shopTagline);
      const serviceArea = asTrimmedString((onlineProfiles as any).serviceAreaLabel);
      const inBusinessSinceYear = asTrimmedString((onlineProfiles as any).inBusinessSinceYear);
      const yearsInBusiness = asTrimmedString((onlineProfiles as any).yearsInBusiness);
      const hobbies = serializeHobbyList((onlineProfiles as any).hobbies);
      const likesDislikes = asTrimmedString((onlineProfiles as any).likesDislikes);
      const homeState = asTrimmedString((onlineProfiles as any).homeState);
      const funFacts = asTrimmedString((onlineProfiles as any).funFacts);
      const specialties = normalizeSpecialties((onlineProfiles as any).specialties);
      const eventsServedBaseline = toNonNegativeInt((onlineProfiles as any).eventsServedBaseline, 0);

      const listings = await db
        .select({
          id: vendorListings.id,
          status: vendorListings.status,
          listingType: vendorListings.listingType,
          sortOrder: vendorListings.sortOrder,
          category: vendorListings.category,
          subcategory: vendorListings.subcategory,
          subcategoryDetail: vendorListings.subcategoryDetail,
          title: vendorListings.title,
          description: vendorListings.description,
          whatsIncluded: vendorListings.whatsIncluded,
          whatsNotIncluded: vendorListings.whatsNotIncluded,
          tags: vendorListings.tags,
          popularFor: vendorListings.popularFor,
          instantBookEnabled: vendorListings.instantBookEnabled,
          pricingUnit: vendorListings.pricingUnit,
          priceCents: vendorListings.priceCents,
          quantity: vendorListings.quantity,
          minimumHours: vendorListings.minimumHours,
          serviceAreaMode: vendorListings.serviceAreaMode,
          listingServiceCenterLabel: vendorListings.listingServiceCenterLabel,
          listingServiceCenterLat: vendorListings.listingServiceCenterLat,
          listingServiceCenterLng: vendorListings.listingServiceCenterLng,
          serviceRadiusMiles: vendorListings.serviceRadiusMiles,
          travelOffered: vendorListings.travelOffered,
          travelFeeEnabled: vendorListings.travelFeeEnabled,
          travelFeeType: vendorListings.travelFeeType,
          travelFeeAmountCents: vendorListings.travelFeeAmountCents,
          pickupOffered: vendorListings.pickupOffered,
          deliveryOffered: vendorListings.deliveryOffered,
          deliveryFeeEnabled: vendorListings.deliveryFeeEnabled,
          deliveryFeeAmountCents: vendorListings.deliveryFeeAmountCents,
          setupOffered: vendorListings.setupOffered,
          setupFeeEnabled: vendorListings.setupFeeEnabled,
          setupFeeAmountCents: vendorListings.setupFeeAmountCents,
          takedownOffered: vendorListings.takedownOffered,
          takedownFeeEnabled: vendorListings.takedownFeeEnabled,
          takedownFeeAmountCents: vendorListings.takedownFeeAmountCents,
          photos: vendorListings.photos,
          listingData: vendorListings.listingData,
          city: vendorProfiles.city,
          vendorId: vendorAccounts.id,
          vendorName: vendorProfiles.profileName,
        })
        .from(vendorListings)
        .innerJoin(vendorAccounts, eq(vendorListings.accountId, vendorAccounts.id))
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .where(
          and(
            eq(vendorListings.accountId, resolvedVendorAccountId),
            eq(vendorListings.profileId, selectedProfile.id),
            eq(vendorListings.status, "active"),
            eq(vendorProfiles.active, true),
            eq(vendorAccounts.active, true),
            // package_item rows are child-only — they appear inside a container, not standalone
            ne(vendorListings.listingType, "package_item")
          )
        )
        .orderBy(asc(vendorListings.sortOrder), asc(vendorListings.createdAt), asc(vendorListings.id));

      const compliantListings = listings.filter(
        (listing) =>
          isListingPubliclyCompliant({
            listingDataRaw: (listing as any)?.listingData,
            canonicalCategory: (listing as any)?.category,
            canonicalPriceCents: (listing as any)?.priceCents,
            canonicalPhotos: (listing as any)?.photos,
          })
      );

      const listingsWithVendorMeta = compliantListings.map((listing: any) => ({
        ...listing,
        photos: (listing.photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
        vendorName: asTrimmedString(listing?.vendorName) || vendor.businessName,
        vendorProfileImageUrl: profileImageUrl || null,
      }));

      const reviewRowsResult: any = await db.execute(drizzleSql`
        select
          lr.id,
          lr.rating,
          lr.title,
          lr.body,
          lr.created_at as "createdAt",
          coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "authorName",
          coalesce(nullif(vl.title, ''), 'Event') as "eventLabel"
        from listing_reviews lr
        inner join vendor_listings vl on vl.id = lr.listing_id
        left join users u on u.id = lr.user_id
        where vl.account_id = ${resolvedVendorAccountId}
          and vl.profile_id = ${selectedProfile.id}
          and coalesce(lr.is_published, true) = true
        order by lr.created_at desc
        limit 200
      `);

      const reviewRows = extractRows<{
        id?: string | null;
        rating?: number | string | null;
        title?: string | null;
        body?: string | null;
        createdAt?: string | Date | null;
        authorName?: string | null;
        eventLabel?: string | null;
      }>(reviewRowsResult);

      const reviews = reviewRows
        .map((row) => ({
          id: String(row.id || "").trim(),
          rating: Number(row.rating || 0),
          title: typeof row.title === "string" ? row.title : null,
          body: typeof row.body === "string" ? row.body : "",
          createdAt: row.createdAt ?? null,
          authorName:
            typeof row.authorName === "string" && row.authorName.trim().length > 0
              ? row.authorName.trim()
              : "Customer",
          eventLabel:
            typeof row.eventLabel === "string" && row.eventLabel.trim().length > 0
              ? row.eventLabel.trim()
              : "Event",
        }))
        .filter((row) => row.id.length > 0 && Number.isFinite(row.rating) && row.rating > 0);

      const reviewCount = reviews.length;
      const rating = reviewCount > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
        : 0;

      const reviewBreakdown = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      } as Record<1 | 2 | 3 | 4 | 5, number>;

      for (const review of reviews) {
        const star = Math.max(1, Math.min(5, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
        reviewBreakdown[star] += 1;
      }

      const completedBookingsRows: any = await db.execute(drizzleSql`
        select count(distinct b.id)::int as "count"
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
        where coalesce(listing_owner.account_id, legacy_listing.account_id) = ${resolvedVendorAccountId}
          and coalesce(listing_owner.profile_id, legacy_listing.profile_id) = ${selectedProfile.id}
          and b.status = 'completed'
      `);
      const completedBookingsCount = Number(
        extractRows<{ count?: number | string }>(completedBookingsRows)[0]?.count || 0
      );
      const eventsServedTotal = eventsServedBaseline + completedBookingsCount;

      const chatContexts = await listVendorBookingChatContexts(resolvedVendorAccountId);
      const chatBookingIds = chatContexts
        .map((row) => row.bookingId)
        .filter((id) => id.length > 0);
      let avgResponseMinutes: number | null = null;
      try {
        avgResponseMinutes = await getAverageVendorResponseMinutesForBookings({
          vendorAccountId: resolvedVendorAccountId,
          bookingIds: chatBookingIds,
          channelLimit: 40,
          messageLimitPerChannel: 120,
        });
      } catch (error) {
        logger.warn({ err: error }, "avg response time compute failed");
        avgResponseMinutes = null;
      }

      return res.json({
        vendor: {
          id: vendor.id,
          profileId: selectedProfile.id,
          businessName: vendor.businessName,
          shopSlug: account.shopSlug || null,
          aboutBusiness: aboutBusiness || null,
          aboutOwner: aboutOwner || null,
          profileImageUrl: profileImageUrl || null,
          coverImageUrl: coverImageUrl || null,
          coverImagePosition,
          tagline: tagline || null,
          serviceArea: serviceArea || null,
          serviceRadius: selectedProfile.serviceRadius ?? null,
          inBusinessSinceYear: inBusinessSinceYear || null,
          yearsInBusiness: yearsInBusiness || null,
          hobbies: hobbies || null,
          likesDislikes: likesDislikes || null,
          homeState: homeState || null,
          funFacts: funFacts || null,
          specialties,
          eventsServedBaseline,
          completedBookingsCount,
          eventsServedTotal,
          avgResponseMinutes: Number.isFinite(avgResponseMinutes as number) ? avgResponseMinutes : null,
          activeListingsCount: listingsWithVendorMeta.length,
          galleryPhotos: (selectedProfile.galleryPhotos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
          rating,
          reviewCount,
          reviewBreakdown,
          reviews: reviews.slice(0, 60),
          city: vendor.city,
        },
        listings: listingsWithVendorMeta,
      });
    } catch (error: any) {
      logRouteError("/api/vendors/public/:vendorId/shop", error);
      return res.status(500).json({ error: "Unable to load vendor storefront" });
    }
  });

  app.get("/api/vendor/vacation-blocks", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const rows = await db
        .select()
        .from(vendorVacationBlocks)
        .where(eq(vendorVacationBlocks.vendorId, vendorAuth.id))
        .orderBy(asc(vendorVacationBlocks.startDate));
      return res.json(rows);
    } catch (error: any) {
      logRouteError("/api/vendor/vacation-blocks GET", error);
      return res.status(500).json({ error: "Unable to load vacation blocks" });
    }
  });

  // POST /api/vendor/vacation-blocks  — create a vacation block
  app.post("/api/vendor/vacation-blocks", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { startDate, endDate } = req.body;

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (
        typeof startDate !== "string" || !datePattern.test(startDate) ||
        typeof endDate !== "string" || !datePattern.test(endDate)
      ) {
        return res.status(400).json({ error: "startDate and endDate are required in YYYY-MM-DD format" });
      }
      if (endDate < startDate) {
        return res.status(400).json({ error: "endDate must be on or after startDate" });
      }

      const insertBlock = async () =>
        db
          .insert(vendorVacationBlocks)
          .values({ id: crypto.randomUUID(), vendorId: vendorAuth.id, startDate, endDate })
          .returning();

      let blockRows;
      try {
        blockRows = await insertBlock();
      } catch (error: any) {
        if (typeof error?.code === "string" && error.code === "42P01") {
          await db.execute(drizzleSql`
            create table if not exists vendor_vacation_blocks (
              id          varchar primary key default gen_random_uuid(),
              vendor_id   varchar not null references vendor_accounts(id) on delete cascade,
              start_date  text not null,
              end_date    text not null,
              created_at  timestamp with time zone not null default now()
            );
          `);
          await db.execute(drizzleSql`
            create index if not exists idx_vendor_vacation_blocks_vendor_id
              on vendor_vacation_blocks (vendor_id);
          `);
          blockRows = await insertBlock();
        } else {
          throw error;
        }
      }

      const [block] = blockRows;

      // Sync vacation block to Google Calendar if vendor is connected (non-fatal)
      try {
        const vendorAccount = await getVendorAccountFromRequest(req);
        const calendarId = asTrimmedString(vendorAccount?.googleCalendarId);
        const isConnected = asTrimmedString(vendorAccount?.googleConnectionStatus).toLowerCase() === "connected";
        if (isConnected && calendarId && vendorAccount?.id) {
          const googleEventId = await createGoogleVacationBlockEvent(vendorAccount.id, calendarId, block);
          if (googleEventId) {
            await db
              .update(vendorVacationBlocks)
              .set({ googleEventId, googleCalendarId: calendarId })
              .where(eq(vendorVacationBlocks.id, block.id));
            block.googleEventId = googleEventId;
            block.googleCalendarId = calendarId;
          }
        }
      } catch (googleErr) {
        logRouteError("/api/vendor/vacation-blocks POST google-sync", googleErr);
      }

      return res.status(201).json(block);
    } catch (error: any) {
      logRouteError("/api/vendor/vacation-blocks POST", error);
      return res.status(500).json({ error: "Unable to create vacation block" });
    }
  });

  // DELETE /api/vendor/vacation-blocks/:id  — delete a vacation block
  app.delete("/api/vendor/vacation-blocks/:id", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const blockId = String(req.params.id || "").trim();

      // Fetch the block before deletion so we can clean up the Google Calendar event
      const [existingBlock] = await db
        .select()
        .from(vendorVacationBlocks)
        .where(
          and(
            eq(vendorVacationBlocks.id, blockId),
            eq(vendorVacationBlocks.vendorId, vendorAuth.id)
          )
        )
        .limit(1);

      if (!existingBlock) {
        return res.status(404).json({ error: "Vacation block not found" });
      }

      // Delete the linked Google Calendar event (non-fatal)
      const googleEventId = asTrimmedString(existingBlock.googleEventId);
      const googleCalendarId = asTrimmedString(existingBlock.googleCalendarId);
      if (googleEventId && googleCalendarId) {
        try {
          await deleteGoogleCalendarEvent(vendorAuth.id, googleCalendarId, googleEventId);
        } catch (googleErr) {
          logRouteError("/api/vendor/vacation-blocks/:id DELETE google-event", googleErr);
        }
      }

      const deleted = await db
        .delete(vendorVacationBlocks)
        .where(eq(vendorVacationBlocks.id, blockId))
        .returning({ id: vendorVacationBlocks.id });

      return res.json({ deleted: deleted[0].id });
    } catch (error: any) {
      logRouteError("/api/vendor/vacation-blocks/:id DELETE", error);
      return res.status(500).json({ error: "Unable to delete vacation block" });
    }
  });

  // PATCH /api/vendor/shop-status  — toggle shop open/closed
  app.patch("/api/vendor/shop-status", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { shopActive } = req.body;

      if (typeof shopActive !== "boolean") {
        return res.status(400).json({ error: "shopActive must be a boolean" });
      }

      const updated = await db
        .update(vendorAccounts)
        .set({ shopActive })
        .where(eq(vendorAccounts.id, vendorAuth.id))
        .returning({ id: vendorAccounts.id, shopActive: vendorAccounts.shopActive });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Vendor account not found" });
      }
      return res.json({ shopActive: updated[0].shopActive });
    } catch (error: any) {
      logRouteError("/api/vendor/shop-status PATCH", error);
      return res.status(500).json({ error: "Unable to update shop status" });
    }
  });

  // POST /api/vendor/tour/complete — mark the one-time onboarding tour finished.
  // Idempotent: COALESCE preserves the original completion time on re-fire, so the
  // tour never shows again once set. No request body required.
  app.post("/api/vendor/tour/complete", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const updated = await db
        .update(vendorAccounts)
        .set({
          dashboardTourCompletedAt: drizzleSql`COALESCE(${vendorAccounts.dashboardTourCompletedAt}, now())`,
        })
        .where(eq(vendorAccounts.id, vendorAuth.id))
        .returning({ dashboardTourCompletedAt: vendorAccounts.dashboardTourCompletedAt });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Vendor account not found" });
      }
      return res.json({ dashboardTourCompletedAt: updated[0].dashboardTourCompletedAt ?? null });
    } catch (error: any) {
      logRouteError("/api/vendor/tour/complete POST", error);
      return res.status(500).json({ error: "Unable to record tour state" });
    }
  });

  // Public Listings (guest browsing)
  // Returns only active listings. No auth.
  // Supports server-side filtering via query params:
  //   category          — exact match (e.g. "rentals", "services", "venues", "catering")
  //   subs              — comma-separated subcategory values (OR match)
  //   details           — comma-separated subcategoryDetail values (OR match)
  //   minPrice          — minimum price in dollars (inclusive)
  //   maxPrice          — maximum price in dollars (inclusive)
  //   sort              — "recommended" (default, newest first) | "price-asc" | "price-desc"
  //   limit             — max rows to return (default 100, max 500)
  //   offset            — rows to skip for pagination (default 0)

  // Available subcategories — returns only values that appear on at least one active listing.
  // Used by hero search, browse filters, and admin dashboard to avoid showing empty options.

    // Public Listing Detail (guest browsing) added 1/22/26
  // Returns one active listing by id. No auth.

  app.get("/api/vendor/listings", requireDualAuthAuth0, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json([]);
      }
      await deactivateActiveListingsViolatingPublishGate(vendorAuth.id);

      // Backfill legacy rows that predate profile ownership.
      await db
        .update(vendorListings)
        .set({ profileId: activeProfileId })
        .where(and(eq(vendorListings.accountId, vendorAuth.id), isNull(vendorListings.profileId)));

      const requestedStatus = asTrimmedString(req.query?.status).toLowerCase();
      if (requestedStatus && !["active", "draft", "inactive"].includes(requestedStatus)) {
        return res.status(400).json({ error: "Invalid status filter" });
      }

      let whereClause = and(
        eq(vendorListings.accountId, vendorAuth.id),
        eq(vendorListings.profileId, activeProfileId),
        ne(vendorListings.status, "deleted")
      );
      if (requestedStatus) {
        whereClause = and(whereClause, eq(vendorListings.status, requestedStatus as any));
      }

      const listings = await db
        .select()
        .from(vendorListings)
        .where(whereClause)
        .orderBy(desc(vendorListings.updatedAt), desc(vendorListings.createdAt), asc(vendorListings.id));

      res.json(listings.map((l) => ({
        ...l,
        photos: (l.photos ?? []).map((p) => resolveStoredUploadPath(p) ?? p),
      })));
    } catch (error: any) {
      logRouteError("/api/vendor/listings", error);
      res.status(500).json({ error: "Unable to load listings" });
    }
  });

  app.get("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const { id } = req.params;

      const listings = await db
        .select()
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, id),
            eq(vendorListings.accountId, vendorAuth.id)
          )
        );

      if (listings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((listings[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listings[0]?.profileId && listings[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }
      const resolvePhotos = (row: any) => ({
        ...row,
        photos: (row?.photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
      });

      if (!listings[0]?.profileId) {
        const [backfilled] = await db
          .update(vendorListings)
          .set({ profileId: activeProfileId, updatedAt: new Date() })
          .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
          .returning();
        return res.json(resolvePhotos(backfilled));
      }

      res.json(resolvePhotos(listings[0]));
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id", error);
      res.status(500).json({ error: "Unable to load listing" });
    }
  });

  app.delete("/api/vendor/listings/:id", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((existing[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existing[0]?.profileId && existing[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }
      if (!existing[0]?.profileId) {
        await db
          .update(vendorListings)
          .set({ profileId: activeProfileId, updatedAt: new Date() })
          .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));
      }

      const bookingHistoryResult: any = await db.execute(drizzleSql`
        select count(distinct b.id)::int as "count"
        from bookings b
        left join booking_items bi on bi.booking_id = b.id
        where b.listing_id = ${id}
           or (b.listing_id is null and bi.listing_id = ${id})
      `);
      const preservedBookingHistoryCount = Number(
        extractRows<{ count?: number | string | null }>(bookingHistoryResult)[0]?.count || 0
      );

      const activeBookingCheckResult: any = await db.execute(drizzleSql`
        select count(distinct b.id)::int as "count"
        from bookings b
        left join booking_items bi on bi.booking_id = b.id
        where (b.listing_id = ${id} or (b.listing_id is null and bi.listing_id = ${id}))
          and b.status in ('pending', 'confirmed')
      `);
      const activeBookingCount = Number(
        extractRows<{ count?: number | string | null }>(activeBookingCheckResult)[0]?.count || 0
      );
      if (activeBookingCount > 0) {
        return res.status(409).json({
          error: "Cannot delete a listing with active bookings. Cancel or complete all pending and confirmed bookings first.",
          code: "listing_has_active_bookings",
          activeBookingCount,
        });
      }

      const isDraft = (existing[0]?.status || "").toLowerCase() === "draft";

      let deletedId: string = id;
      let deletedStatus: string = "deleted";

      if (isDraft) {
        await db
          .delete(vendorListings)
          .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));
      } else {
        const [inactivatedListing] = await db
          .update(vendorListings)
          .set({ status: "deleted", updatedAt: new Date() })
          .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
          .returning({
            id: vendorListings.id,
            status: vendorListings.status,
          });
        deletedId = inactivatedListing?.id ?? id;
        deletedStatus = inactivatedListing?.status ?? "deleted";
      }

      return res.json({
        listingId: deletedId,
        status: deletedStatus,
        action: "deleted",
        hiddenFromVendor: true,
        preservedBookingHistoryCount,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id DELETE", error);
      return res.status(500).json({ error: "Unable to deactivate listing" });
    }
  });

  app.post("/api/vendor/connect/onboard", onboardingRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const { businessName } = stripeOnboardingSchema.parse(req.body);
      const account = await getVendorAccountFromRequest(req);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      if (account.stripeConnectId) {
        return res.status(400).json({ error: "Stripe account already connected" });
      }

      const { createConnectAccount } = await import("../stripe");

      // Creates a V2 Connect account (unified "recipient" configuration —
      // the platform collects fees and controls when funds are transferred).
      const result = await createConnectAccount({
        email: account.email,
        businessName,
      });

      // Store "recipient" to indicate this is a V2 account.
      // V1 accounts stored "express" or "standard" here.
      await db
        .update(vendorAccounts)
        .set({
          stripeConnectId: result.accountId,
          stripeAccountType: "recipient",
        })
        .where(eq(vendorAccounts.id, account.id));

      res.json({
        accountId: result.accountId,
        onboardingUrl: result.onboardingUrl,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/connect/status", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account || !account.stripeConnectId) {
        return res.json({ connected: false });
      }

      const { checkAccountOnboardingStatus, ensureManualPayoutSchedule } = await import("../stripe");
      const status = await checkAccountOnboardingStatus(account.stripeConnectId);

      if (status.complete && !account.stripeOnboardingComplete) {
        await db
          .update(vendorAccounts)
          .set({ stripeOnboardingComplete: true })
          .where(eq(vendorAccounts.id, account.id));
      }
      if (status.complete && !status.manualPayoutSchedule) {
        await ensureManualPayoutSchedule(account.stripeConnectId);
      }

      res.json({
        connected: true,
        complete: status.complete,
        detailsSubmitted: status.detailsSubmitted,
        chargesEnabled: status.chargesEnabled,
        manualPayoutSchedule: true,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/connect/dashboard", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account || !account.stripeConnectId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }

      const { createDashboardLoginLink } = await import("../stripe");
      const url = await createDashboardLoginLink(account.stripeConnectId);

      res.json({ url });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/connect/setup-link", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const businessName = (account.businessName || "").trim() || "EventHub Vendor";

      if (!account.stripeConnectId) {
        const { createConnectAccount } = await import("../stripe");

        // Creates a V2 Connect account with recipient configuration.
        const result = await createConnectAccount({
          email: account.email,
          businessName,
        });

        if (!result.onboardingUrl) {
          return res.status(500).json({ error: "Could not generate Stripe onboarding link" });
        }

        await db
          .update(vendorAccounts)
          .set({
            stripeConnectId: result.accountId,
            stripeAccountType: "recipient", // V2 unified account type
            stripeOnboardingComplete: false,
          })
          .where(eq(vendorAccounts.id, account.id));

        return res.json({ url: result.onboardingUrl });
      }

      const {
        checkAccountOnboardingStatus,
        createDashboardLoginLink,
        createAccountOnboardingLink,
        createV1AccountOnboardingLink,
        ensureManualPayoutSchedule,
      } = await import("../stripe");
      const status = await checkAccountOnboardingStatus(account.stripeConnectId);

      if (status.complete) {
        if (!account.stripeOnboardingComplete) {
          await db
            .update(vendorAccounts)
            .set({ stripeOnboardingComplete: true })
            .where(eq(vendorAccounts.id, account.id));
        }

        // For V1 "standard" accounts (created before the V2 migration),
        // send vendors to the full Stripe dashboard directly.
        if (account.stripeAccountType === "standard") {
          return res.json({ url: "https://dashboard.stripe.com" });
        }

        // For V1 "express" accounts, ensure manual payout schedule.
        // V2 "recipient" accounts skip this — manualPayoutSchedule is always
        // true because transfers are platform-initiated (no auto-payouts).
        if (!status.manualPayoutSchedule) {
          await ensureManualPayoutSchedule(account.stripeConnectId);
        }

        const url = await createDashboardLoginLink(account.stripeConnectId);
        return res.json({ url });
      }

      if (account.stripeOnboardingComplete) {
        await db
          .update(vendorAccounts)
          .set({ stripeOnboardingComplete: false })
          .where(eq(vendorAccounts.id, account.id));
      }

      // V2 recipient accounts use the V2 account links API.
      // V1 express/standard accounts (and legacy accounts with no stored type)
      // must use the V1 API — the V2 API does not support them.
      const isV2Account = account.stripeAccountType === "recipient";
      const url = isV2Account
        ? await createAccountOnboardingLink(account.stripeConnectId)
        : await createV1AccountOnboardingLink(account.stripeConnectId);
      return res.json({ url });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/stats", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.json({
          totalBookings: 0,
          bookingsThisMonth: 0,
          revenue: 0,
          revenueGrowth: 0,
          profileViews: 0,
          profileViewsGrowth: 0,
          recentBookings: [],
        });
      }

      // Advanced analytics is a Pro feature. Free vendors still see lifetime
      // totals (total bookings + total revenue); the trends, profile views, and
      // recent-activity list are gated and stripped from the response below.
      const statsAccount = await getVendorAccountFromRequest(req);
      const analyticsLocked = statsAccount ? !getVendorEntitlements(statsAccount).canUseAnalytics : false;

      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json({
          totalBookings: 0,
          bookingsThisMonth: 0,
          revenue: 0,
          revenueGrowth: 0,
          profileViews: 0,
          profileViewsGrowth: 0,
          recentBookings: [],
        });
      }

      const normalizeAmountToCents = (value: unknown) => {
        const n = Number(value ?? 0);
        if (!Number.isFinite(n) || n <= 0) return 0;
        // The current booking flow always writes amounts in cents (integers).
        // Non-integer values are legacy float-dollar rows (e.g. 36.80 → 3680 cents).
        if (!Number.isInteger(n)) return Math.round(n * 100);
        return Math.round(n);
      };

      let bookingRows: Array<{
        id: string;
        status: string | null;
        totalAmount: number | null;
        vendorProfileId?: string | null;
        createdAt: Date | string | null;
        eventDate: string | null;
        eventLocation: string | null;
      }> = [];
      const rows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.total_amount as "totalAmount",
          b.listing_title_snapshot as "listingTitleSnapshot",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          b.created_at as "createdAt",
          coalesce(b.event_date::text, e.date::text) as "eventDate",
          b.event_location as "eventLocation"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
        order by b.created_at desc
      `);
      bookingRows = extractRows(rows);

      const bookingRowsWithContext = await attachBookingItemContext(bookingRows as any);
      const profileCount = Array.isArray(profileContext?.profiles) ? profileContext.profiles.length : 0;
      const scopedBookingRows = bookingRowsWithContext.filter((row: any) =>
        bookingRowMatchesActiveProfile(row, activeProfileId, profileCount)
      ) as any[];

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(weekStart.getDate() - 7);

      const totalBookings = scopedBookingRows.length;
      const bookingsThisMonth = scopedBookingRows.filter((r: any) => {
        const created = r.createdAt ? new Date(r.createdAt) : null;
        return created instanceof Date && !isNaN(created.getTime()) && created >= monthStart;
      }).length;

      const revenueRows = scopedBookingRows.filter((r: any) => {
        const s = String(r.status || "").toLowerCase();
        return s === "confirmed" || s === "completed";
      });
      const revenue = revenueRows.reduce((sum, r) => sum + normalizeAmountToCents(r.totalAmount), 0);

      const revenueThisMonth = revenueRows.reduce((sum, r) => {
        const created = r.createdAt ? new Date(r.createdAt) : null;
        if (!(created instanceof Date) || isNaN(created.getTime()) || created < monthStart) return sum;
        return sum + normalizeAmountToCents(r.totalAmount);
      }, 0);
      const revenueLastMonth = revenueRows.reduce((sum, r) => {
        const created = r.createdAt ? new Date(r.createdAt) : null;
        if (
          !(created instanceof Date) ||
          isNaN(created.getTime()) ||
          created < lastMonthStart ||
          created >= monthStart
        ) {
          return sum;
        }
        return sum + normalizeAmountToCents(r.totalAmount);
      }, 0);
      const revenueGrowth =
        revenueLastMonth > 0
          ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
          : revenueThisMonth > 0
            ? 100
            : 0;

      let profileViews = 0;
      let profileViewsGrowth = 0;
      try {
        const viewsRows: any = await db.execute(drizzleSql`
          select lt.occurred_at as "occurredAt"
          from listing_traffic lt
          inner join vendor_listings vl on vl.id = lt.listing_id
          where vl.account_id = ${vendorAccountId}
            and vl.profile_id = ${activeProfileId}
            and lt.event_type = 'view'
        `);
        const views = extractRows<{ occurredAt?: Date | string }>(viewsRows);
        profileViews = views.length;
        const thisWeekViews = views.filter((v) => {
          const d = v.occurredAt ? new Date(v.occurredAt) : null;
          return d instanceof Date && !isNaN(d.getTime()) && d >= weekStart;
        }).length;
        const lastWeekViews = views.filter((v) => {
          const d = v.occurredAt ? new Date(v.occurredAt) : null;
          return d instanceof Date && !isNaN(d.getTime()) && d >= lastWeekStart && d < weekStart;
        }).length;
        profileViewsGrowth =
          lastWeekViews > 0
            ? Math.round(((thisWeekViews - lastWeekViews) / lastWeekViews) * 100)
            : thisWeekViews > 0
              ? 100
              : 0;
      } catch {
        // listing_traffic table may not exist in all environments — return zero views.
      }

      const recentBookingRows = scopedBookingRows
        .slice()
        .sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dbt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dbt - da;
        })
        .slice(0, 6);

      const recentBookingsWithContext = await attachBookingItemContext(recentBookingRows as any);

      const recentBookings = recentBookingsWithContext.map((r: any) => ({
          id: r.id,
          itemTitle: typeof r.itemTitle === "string" && r.itemTitle.trim().length > 0 ? r.itemTitle.trim() : null,
          status: String(r.status || "pending").toLowerCase(),
          totalAmount: normalizeAmountToCents(r.totalAmount),
          eventDate: r.eventDate,
          eventLocation: r.eventLocation,
          createdAt: r.createdAt,
        }));

      return res.json({
        // Always visible: lifetime totals.
        totalBookings,
        revenue,
        // Pro-only fields — zeroed/emptied for Free vendors.
        analyticsLocked,
        bookingsThisMonth: analyticsLocked ? 0 : bookingsThisMonth,
        revenueGrowth: analyticsLocked ? 0 : revenueGrowth,
        profileViews: analyticsLocked ? 0 : profileViews,
        profileViewsGrowth: analyticsLocked ? 0 : profileViewsGrowth,
        recentBookings: analyticsLocked ? [] : recentBookings,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/bookings", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.json([]);
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json([]);
      }

      const rawRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.listing_id as "listingId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.pricing_unit_snapshot as "pricingUnitSnapshot",
          b.unit_price_cents_snapshot as "unitPriceCentsSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.delivery_fee_amount_cents as "deliveryFeeAmountCents",
          b.setup_fee_amount_cents as "setupFeeAmountCents",
          b.travel_fee_amount_cents as "travelFeeAmountCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          b.platform_fee as "platformFee",
          b.vendor_payout as "vendorPayout",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          b.created_at as "createdAt",
          b.updated_at as "updatedAt",
          b.event_id as "eventId",
          e.path as "eventTitle",
          b.event_location as "eventLocation",
          b.guest_count as "guestCount",
          b.special_requests as "specialRequests",
          b.google_sync_status as "googleSyncStatus",
          b.google_event_id as "googleEventId",
          b.google_calendar_id as "googleCalendarId",
          coalesce(b.event_date::text, e.date::text) as "eventDate",
          coalesce(b.event_start_time, e.start_time) as "eventStartTime",
          b.event_end_time as "eventEndTime",
          b.event_timezone as "eventTimezone",
          b.vendor_timezone_snapshot as "vendorTimezoneSnapshot",
          b.payout_status as "payoutStatus",
          b.payout_eligible_at as "payoutEligibleAt",
          b.payout_blocked_reason as "payoutBlockedReason",
          b.paid_out_at as "paidOutAt",
          b.outside_service_radius as "outsideServiceRadius",
          b.instant_book_snapshot as "instantBookSnapshot",
          u.name as "customerName"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join users u on u.id = b.customer_id
        where coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
          and b.vendor_dismissed_at is null
        order by b.created_at desc
      `);

      const withContext = await attachBookingItemContext(extractRows(rawRows) as any);
      const profileCount = Array.isArray(profileContext?.profiles) ? profileContext.profiles.length : 0;
      const scopedRows = withContext.filter((row: any) =>
        bookingRowMatchesActiveProfile(row, activeProfileId, profileCount)
      );
      return res.json(scopedRows);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/bookings/pending-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json({ pendingCount: 0 });

      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) return res.json({ pendingCount: 0 });

      const sinceParam = typeof req.query.since === "string" ? req.query.since : null;
      const sinceDate = sinceParam ? new Date(sinceParam) : null;
      const sinceIsValid = sinceDate && !Number.isNaN(sinceDate.getTime());

      const [row] = await db
        .select({ count: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.vendorProfileId, activeProfileId),
            eq(bookings.status, "pending"),
            ...(sinceIsValid ? [gte(bookings.createdAt, sinceDate)] : [])
          )
        );

      return res.json({ pendingCount: row?.count ?? 0 });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/bookings/unread-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.json({ unreadCount: 0 });

      const unreadCount = await getUnreadNotificationCountByTypes(
        account.id,
        "vendor",
        VENDOR_BOOKING_NOTIFICATION_TYPES
      );
      return res.json({ unreadCount });
    } catch (error: any) {
      logRouteError("/api/vendor/bookings/unread-count", error);
      return res.json({ unreadCount: 0 });
    }
  });

  app.post("/api/vendor/bookings/mark-seen", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(403).json({ error: "Vendor account required" });

      const updated = await markUnreadNotificationsReadByTypes(
        account.id,
        "vendor",
        VENDOR_BOOKING_NOTIFICATION_TYPES
      );
      return res.json({ updated });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.patch("/api/vendor/bookings/:id", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const bookingId = String(req.params.id || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const updateVendorBookingSchema = z.object({
        status: z.enum(["confirmed", "completed", "cancelled"]),
        cancellationReason: z.string().max(500).optional(),
      });
      const { status: nextStatus, cancellationReason: vendorCancellationReason } = updateVendorBookingSchema.parse(req.body ?? {});

      let ownedBookingRows: Array<{
        id: string;
        status: string | null;
        eventDate: string | null;
        listingTitleSnapshot?: string | null;
        vendorProfileId?: string | null;
      }> = [];
      const ownedRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.listing_id as "listingId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          coalesce(b.event_date::text, e.date::text) as "eventDate",
          b.event_end_time as "eventEndTime"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where b.id = ${bookingId}
          and coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
        limit 1
      `);
      ownedBookingRows = extractRows(ownedRows);

      const current = ownedBookingRows[0];
      if (!current?.id) {
        return res.status(404).json({ error: "Booking not found for this vendor" });
      }
      const [currentWithContext] = await attachBookingItemContext([current as any]);
      const bookingProfileId =
        asTrimmedString((currentWithContext as any)?.vendorProfileId) ||
        asTrimmedString((currentWithContext as any)?.listingProfileId);
      if (bookingProfileId && bookingProfileId !== activeProfileId) {
        return res.status(404).json({ error: "Booking not found in active profile" });
      }
      const currentStatus = String(current.status || "").toLowerCase();

      if (currentStatus === "confirmed" && nextStatus === "completed") {
        if (!current.eventDate) {
          return res.status(400).json({ error: "Booking event date is missing or invalid" });
        }
        // Use the event end time if available so same-day events can be completed
        // once the end time has passed. Fall back to end of day if no end time.
        const endTimeStr = asTrimmedString((current as any).eventEndTime);
        const eventCutoff = endTimeStr
          ? new Date(`${current.eventDate}T${endTimeStr}`)
          : new Date(`${current.eventDate}T23:59:59`);
        if (isNaN(eventCutoff.getTime())) {
          return res.status(400).json({ error: "Booking event date is missing or invalid" });
        }
        if (new Date() <= eventCutoff) {
          return res.status(400).json({
            error: "You can only mark this booking completed after the event date has passed.",
          });
        }
      }

      const isValidTransition =
        (currentStatus === "pending" && (nextStatus === "confirmed" || nextStatus === "cancelled")) ||
        (currentStatus === "confirmed" && (nextStatus === "completed" || nextStatus === "cancelled"));
      if (!isValidTransition) {
        return res.status(400).json({
          error: `Invalid status transition: ${currentStatus || "unknown"} -> ${nextStatus}`,
        });
      }

      const now = new Date();
      const vendorCancelReasonStored = nextStatus === "cancelled"
        ? (vendorCancellationReason ? `vendor: ${vendorCancellationReason}` : "vendor_cancel")
        : null;
      const updatedResult: any = await db.execute(drizzleSql`
        update bookings b
        set status = ${nextStatus},
            updated_at = ${now},
            confirmed_at = case when ${nextStatus} = 'confirmed' then ${now} else b.confirmed_at end,
            completed_at = case when ${nextStatus} = 'completed' then ${now} else b.completed_at end,
            cancelled_at = case when ${nextStatus} = 'cancelled' then ${now} else b.cancelled_at end,
            cancellation_reason = case when ${nextStatus} = 'cancelled' then ${vendorCancelReasonStored} else b.cancellation_reason end
        where b.id = ${bookingId}
          and (
            b.vendor_account_id = ${vendorAccountId}
            or (
              b.vendor_account_id is null
              and exists (
                select 1
                from vendor_listings vl
                where vl.id = b.listing_id
                  and vl.account_id = ${vendorAccountId}
              )
            )
          )
        returning b.id, b.status, b.updated_at as "updatedAt"
      `);
      const updatedRows = extractRows<{ id?: string; status?: string; updatedAt?: string | Date }>(updatedResult);

      const updated = updatedRows[0];
      if (!updated?.id) {
        return res.status(500).json({ error: "Failed to update booking status" });
      }

      // When a vendor cancels (pending decline or confirmed cancellation), issue full
      // refunds to the customer for all payment types immediately — no cancellation
      // policy penalty applies since it is vendor-initiated.
      if (nextStatus === "cancelled") {
        // Fetch all succeeded/partially-refunded payments for this booking,
        // keyed by type so we target the right Stripe payment intent for each.
        const vendorCancelPayments = await db
          .select({
            id: payments.id,
            paymentType: payments.paymentType,
            stripePaymentIntentId: payments.stripePaymentIntentId,
            status: payments.status,
            amount: payments.amount,
            refundAmount: payments.refundAmount,
          })
          .from(payments)
          .where(
            and(
              eq(payments.bookingId, bookingId),
              or(eq(payments.status, "succeeded"), eq(payments.status, "partially_refunded"))
            )
          )
          .orderBy(desc(payments.createdAt));

        const vcMainPayment = vendorCancelPayments.find(
          (p) => p.paymentType === "booking"
        );
        const vcTravelFeePayments = vendorCancelPayments.filter(
          (p) => p.paymentType === "travel_fee"
        );
        const vcDepositPayment = vendorCancelPayments.find(
          (p) => p.paymentType === "security_deposit"
        );

        // Safety cap helper — never refund more than the remaining balance on a charge.
        const vcSafeCap = (p: { amount: number; refundAmount: number | null }) => {
          const alreadyRefunded = typeof p.refundAmount === "number" ? p.refundAmount : 0;
          return Math.max(0, p.amount - alreadyRefunded);
        };

        if (vcMainPayment || vcTravelFeePayments.length > 0 || vcDepositPayment) {
          try {
            const { refundBookingPayment } = await import("../stripe");

            // Refund main booking payment (full remaining balance)
            if (vcMainPayment?.stripePaymentIntentId) {
              const refundable = vcSafeCap(vcMainPayment);
              if (refundable > 0) {
                await refundBookingPayment({
                  paymentIntentId: vcMainPayment.stripePaymentIntentId,
                  amount: refundable,
                  reason: "duplicate",
                  idempotencyKey: `vendor-cancel-booking:${bookingId}:${vcMainPayment.id}`,
                });
              }
              await db
                .update(payments)
                .set({
                  status: "refunded" as any,
                  refundAmount: vcMainPayment.amount,
                  refundReason: "vendor_cancellation",
                  refundedAt: now,
                  payoutStatus: "cancelled",
                  payoutEligibleAt: null,
                  payoutBlockedReason: "vendor_cancellation",
                  payoutAdjustedAmount: 0,
                })
                .where(eq(payments.id, vcMainPayment.id));
            }

            // Refund each travel fee payment (full remaining balance)
            for (const tfp of vcTravelFeePayments) {
              if (!tfp.stripePaymentIntentId) continue;
              const refundable = vcSafeCap(tfp);
              if (refundable > 0) {
                await refundBookingPayment({
                  paymentIntentId: tfp.stripePaymentIntentId,
                  amount: refundable,
                  reason: "duplicate",
                  idempotencyKey: `vendor-cancel-travelfee:${bookingId}:${tfp.id}`,
                });
              }
              await db
                .update(payments)
                .set({
                  status: "refunded" as any,
                  refundAmount: tfp.amount,
                  refundReason: "vendor_cancellation",
                  refundedAt: now,
                  payoutStatus: "cancelled",
                  payoutEligibleAt: null,
                  payoutBlockedReason: "vendor_cancellation",
                  payoutAdjustedAmount: 0,
                })
                .where(eq(payments.id, tfp.id));
            }

            // Refund security deposit (full remaining balance)
            if (vcDepositPayment?.stripePaymentIntentId) {
              const refundable = vcSafeCap(vcDepositPayment);
              if (refundable > 0) {
                await refundBookingPayment({
                  paymentIntentId: vcDepositPayment.stripePaymentIntentId,
                  amount: refundable,
                  reason: "duplicate",
                  idempotencyKey: `vendor-cancel-deposit:${bookingId}:${vcDepositPayment.id}`,
                });
              }
              await db
                .update(payments)
                .set({
                  status: "refunded" as any,
                  refundAmount: vcDepositPayment.amount,
                  refundReason: "vendor_cancellation",
                  refundedAt: now,
                })
                .where(eq(payments.id, vcDepositPayment.id));

              // Mark the deposit as refunded on the booking so the auto-job skips it
              await db
                .update(bookings)
                .set({ securityDepositRefundedAt: now, updatedAt: now })
                .where(eq(bookings.id, bookingId));
            }
          } catch (refundErr: any) {
            logger.error(
              { bookingId, err: refundErr?.message },
              "[vendor cancel] Stripe refund failed"
            );
            return res.status(502).json({
              error: "Booking cancelled but refund processing failed. Please contact support.",
            });
          }
        }
      }

      await syncBookingToGoogleCalendarSafely(updated.id, "/api/vendor/bookings/:id google-sync");

      if (nextStatus === "cancelled") {
        const reasonText = vendorCancellationReason
          ? `Reason: ${vendorCancellationReason}`
          : null;
        await sendBookingSystemMessage({
          bookingId,
          text: `This booking has been cancelled by the vendor.${reasonText ? ` ${reasonText}.` : ""}`,
          metadata: { action: "vendor_cancelled", reason: vendorCancellationReason ?? null },
        });
      }

      // Send confirmed/cancelled emails to both parties (fire-and-forget)
      if (nextStatus === "confirmed" || nextStatus === "cancelled") {
        void (async () => {
          try {
            const serverUrl = appUrl();
            const emailRows: any = await db.execute(drizzleSql`
              select
                b.customer_id as "customerId",
                u.email  as "customerEmail",
                u.name   as "customerName",
                va.email as "vendorEmail",
                va.business_name as "vendorName",
                b.event_date as "eventDate",
                coalesce(b.listing_title_snapshot, '') as "listingTitle",
                b.total_amount as "totalAmount"
              from bookings b
              join users u on u.id = b.customer_id
              join vendor_accounts va on va.id = b.vendor_account_id
              where b.id = ${bookingId}
              limit 1
            `);
            const info = extractRows<{
              customerId: string;
              customerEmail: string;
              customerName: string;
              vendorEmail: string;
              vendorName: string;
              eventDate: string;
              listingTitle: string;
              totalAmount: number;
            }>(emailRows)[0];

            if (!info) return;

            const sharedParams = {
              eventDate: info.eventDate,
              listingTitle: info.listingTitle || "your booking",
              serverUrl,
            };

            const addonRows: any = await db.execute(drizzleSql`
              SELECT title, unit_price_cents, total_price_cents
              FROM booking_items
              WHERE booking_id = ${bookingId} AND item_type = 'addon'
              ORDER BY created_at ASC
            `);
            const confirmedAddOns = (addonRows.rows as any[]).map((r: any) => ({
              title: String(r.title ?? "Add-on"),
              priceCents: Number(r.total_price_cents ?? r.unit_price_cents ?? 0),
            }));

            const tasks: Promise<any>[] = [];

            if (nextStatus === "confirmed") {
              if (info.customerEmail) {
                tasks.push(
                  sendBookingConfirmedEmail(info.customerEmail, {
                    ...sharedParams,
                    recipientName: info.customerName || "Customer",
                    counterpartName: info.vendorName || "Vendor",
                    totalAmountCents: info.totalAmount || 0,
                    addOns: confirmedAddOns,
                    role: "customer",
                  })
                );
              }
            } else {
              if (info.customerEmail) {
                tasks.push(
                  sendBookingCancelledEmail(info.customerEmail, {
                    ...sharedParams,
                    recipientName: info.customerName || "Customer",
                    counterpartName: info.vendorName || "Vendor",
                    role: "customer",
                  })
                );
              }
            }

            await Promise.allSettled(tasks);

            // In-app notification: vendor confirmed → tell the customer
            if (nextStatus === "confirmed" && info.customerId) {
              createNotification({
                recipientId: info.customerId,
                recipientType: "customer",
                type: "booking_confirmed",
                title: "Booking confirmed",
                message: `Your booking for ${info.listingTitle || "the service"} on ${info.eventDate} has been confirmed.`,
                link: `/dashboard/events`,
                read: false,
              }).catch(() => {});
            }

            // In-app notification: vendor cancelled → tell the customer
            if (nextStatus === "cancelled" && info.customerId) {
              createNotification({
                recipientId: info.customerId,
                recipientType: "customer",
                type: "booking_cancelled",
                title: "Booking cancelled by vendor",
                message: `Your booking for ${info.listingTitle || "the service"} on ${info.eventDate} has been cancelled by the vendor.`,
                link: `/dashboard/events`,
                read: false,
              }).catch(() => {});
            }
          } catch (emailError: any) {
            logger.warn("[booking status email] failed:", emailError?.message || emailError);
          }
        })();
      }

      return res.json({
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // DELETE /api/vendor/bookings/:id
  // Vendor archives a finished booking (cancelled/completed/expired/failed) so it no longer
  // appears in their list. The row stays in the DB (vendor_dismissed_at is set); the list query
  // filters on vendor_dismissed_at is null.
  app.delete("/api/vendor/bookings/:id", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id: bookingId } = req.params;

      const [booking] = await db
        .select({ id: bookings.id, status: bookings.status, vendorAccountId: bookings.vendorAccountId })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.vendorAccountId !== vendorAccountId) {
        return res.status(403).json({ error: "Not your booking" });
      }
      const ARCHIVABLE_STATUSES = new Set(["cancelled", "completed", "expired", "failed"]);
      if (!ARCHIVABLE_STATUSES.has(String(booking.status || ""))) {
        return res.status(400).json({ error: "Only finished bookings (cancelled, completed, expired, or failed) can be archived" });
      }

      await db
        .update(bookings)
        .set({ vendorDismissedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      return res.json({ ok: true });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/messages/conversations", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json([]);

      const rows = await listVendorBookingChatContexts(vendorAccountId);
      // Show all active bookings regardless of payment status so "Message Customer"
      // always lands on the right conversation. The bootstrap endpoint enforces the
      // payment gate when the vendor actually tries to open the chat.
      const ACTIVE_BOOKING_STATUSES = new Set(["pending", "confirmed", "completed"]);
      const activeRows = rows.filter(
        (row) =>
          row.bookingId.length > 0 &&
          ACTIVE_BOOKING_STATUSES.has(String(row.status || "").toLowerCase()) &&
          (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
      );
      const unread = await getStreamUnreadCountsForBookings({
        role: "vendor",
        appUserId: vendorAccountId,
        bookingIds: activeRows.map((row) => row.bookingId),
      });
      const conversations = activeRows.map((row) =>
        toConversationPayload("vendor", row, unread.counts[row.bookingId] || 0)
      );

      // Append active pre-booking inquiry channels
      const inquiryRows = await listVendorInquiryChannels(vendorAccountId);
      const inquiryUnread = await getStreamUnreadCountsForChannels({
        role: "vendor",
        appUserId: vendorAccountId,
        channelIds: inquiryRows.map((r) => r.inquiryChannelId),
      });
      const inquiryConversations = inquiryRows.map((r) =>
        toInquiryConversationPayload("vendor", r, inquiryUnread.counts[r.inquiryChannelId] || 0)
      );

      return res.json([...conversations, ...inquiryConversations]);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/messages/unread-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json({ unreadCount: 0 });

      const rows = await listVendorBookingChatContexts(vendorAccountId);
      const ACTIVE_BOOKING_STATUSES_UC = new Set(["pending", "confirmed", "completed"]);
      const paidBookingIds = rows
        .filter(
          (row) =>
            row.bookingId.length > 0 &&
            ACTIVE_BOOKING_STATUSES_UC.has(String(row.status || "").toLowerCase()) &&
            (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
        )
        .map((row) => row.bookingId);
      const unread = await getStreamUnreadCountsForBookings({
        role: "vendor",
        appUserId: vendorAccountId,
        bookingIds: paidBookingIds,
      });
      return res.json({ unreadCount: unread.totalUnread });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // Bootstrap Stream Chat for a pre-booking inquiry channel (vendor side).
  app.post("/api/vendor/messages/inquiry/:channelId/bootstrap", messagingRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      if (!isStreamChatConfigured()) {
        return res.status(503).json({ error: "Stream chat is not configured on the server" });
      }

      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const channelId = String(req.params.channelId || "").trim();
      if (!channelId) {
        return res.status(400).json({ error: "channelId is required" });
      }

      const [inquiry] = await db
        .select()
        .from(vendorInquiries)
        .where(
          and(
            eq(vendorInquiries.streamChannelId, channelId),
            eq(vendorInquiries.vendorAccountId, vendorAccountId)
          )
        )
        .limit(1);
      if (!inquiry) {
        return res.status(404).json({ error: "Inquiry not found" });
      }

      const [customerUser] = await db
        .select({ displayName: users.displayName, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, inquiry.customerId))
        .limit(1);

      const [vendorAccount] = await db
        .select({ businessName: vendorAccounts.businessName, email: vendorAccounts.email })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAccountId))
        .limit(1);

      const streamState = await ensureStreamInquiryChannel({
        vendorAccountId,
        customerId: inquiry.customerId,
        vendorName: vendorAccount?.businessName ?? null,
        vendorEmail: vendorAccount?.email ?? null,
        customerName: customerUser?.displayName || customerUser?.name || null,
        customerEmail: customerUser?.email ?? null,
      });

      const streamUserId = toStreamUserId("vendor", vendorAccountId);
      const streamToken = streamState.tokenForUser(streamUserId);
      const customerName = customerUser?.displayName || customerUser?.name || "Customer";

      return res.json({
        streamApiKey: getStreamApiKey(),
        streamToken,
        streamUser: { id: streamUserId, name: vendorAccount?.businessName || "Vendor" },
        channel: { type: streamState.channelType, id: streamState.channelId, cid: streamState.channelCid },
        booking: { id: channelId, eventDate: null, eventTitle: "Pre-Booking Inquiry", counterpartName: customerName },
        policyWarning: CHAT_POLICY_WARNING,
        retentionExpiresAt: null,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/vendor/messages/:bookingId/bootstrap", messagingRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      if (!isStreamChatConfigured()) {
        return res.status(503).json({ error: "Stream chat is not configured on the server" });
      }

      const bookingId = String(req.params.bookingId || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const booking = await getBookingChatContextById(bookingId);
      if (!booking || booking.bookingId !== bookingId) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (!booking.vendorAccountId || booking.vendorAccountId !== vendorAccountId) {
        return res.status(403).json({ error: "You do not have access to this conversation" });
      }
      if (!booking.customerId) {
        return res.status(400).json({ error: "Booking has no linked customer account" });
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

      // Check if this booking was preceded by an inquiry channel — if so, reuse it
      const [bookingRow] = await db
        .select({ inquiryChannelId: bookings.inquiryChannelId })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      let streamState: Awaited<ReturnType<typeof ensureStreamBookingChannel>>;
      let resolvedChannelId: string;

      if (bookingRow?.inquiryChannelId) {
        await promoteInquiryToBookingChannel({
          channelId: bookingRow.inquiryChannelId,
          bookingId,
          eventDate: booking.eventDate!,
          retentionExpiresAt: computeChatRetentionExpiry(booking.eventDate!)?.toISOString() ?? null,
        }).catch(() => {});
        const inquiryState = await ensureStreamInquiryChannel({
          vendorAccountId: booking.vendorAccountId!,
          customerId: booking.customerId!,
          vendorName: booking.vendorName,
          vendorEmail: booking.vendorEmail,
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
        });
        streamState = inquiryState as any;
        resolvedChannelId = bookingRow.inquiryChannelId;
      } else {
        streamState = await ensureStreamBookingChannel({
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
        resolvedChannelId = streamState.channelId;
      }

      const streamUserId = toStreamUserId("vendor", vendorAccountId);
      const streamToken = streamState.tokenForUser(streamUserId);

      return res.json({
        streamApiKey: getStreamApiKey(),
        streamToken,
        streamUser: {
          id: streamUserId,
          name: booking.vendorName || "Vendor",
        },
        channel: {
          type: streamState.channelType,
          id: resolvedChannelId,
          cid: `${streamState.channelType}:${resolvedChannelId}`,
        },
        booking: {
          id: booking.bookingId,
          eventDate: booking.eventDate,
          eventTitle: booking.eventTitle,
          counterpartName: booking.customerName || "Customer",
        },
        policyWarning: CHAT_POLICY_WARNING,
        retentionExpiresAt: (streamState as any).retentionExpiresAt ?? null,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/payments", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.json({
          totalNetEarned: 0,
          upcomingNetPayout: 0,
          history: [],
        });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json({
          totalNetEarned: 0,
          upcomingNetPayout: 0,
          history: [],
        });
      }

      const normalizeAmountToCents = (value: unknown) => {
        const n = Number(value ?? 0);
        if (!Number.isFinite(n) || n <= 0) return 0;
        // The current booking flow always writes amounts in cents (integers).
        // Non-integer values are legacy float-dollar rows (e.g. 36.80 → 3680 cents).
        // Integer-dollar legacy rows require a data migration; no heuristic can safely
        // distinguish them from a legitimately small cents value.
        if (!Number.isInteger(n)) return Math.round(n * 100);
        return Math.round(n);
      };

      let rows: Array<{
        id: string;
        status: string | null;
        paymentStatus: string | null;
        totalAmount: number | null;
        vendorPayout: number | null;
        platformFee?: number | null;
        listingTitleSnapshot?: string | null;
        bookedQuantity?: number | null;
        baseSubtotalCents?: number | null;
        logisticsTotalCents?: number | null;
        subtotalAmountCents?: number | null;
        customerFeeAmountCents?: number | null;
        vendorProfileId?: string | null;
        eventDate: string | null;
        createdAt: Date | string | null;
        payoutStatus?: string | null;
        payoutEligibleAt?: Date | string | null;
        paidOutAt?: Date | string | null;
      }> = [];
      const bookingRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.vendor_payout as "vendorPayout",
          b.platform_fee as "platformFee",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          coalesce(b.event_date::text, e.date::text) as "eventDate",
          b.created_at as "createdAt",
          b.payout_status as "payoutStatus",
          b.payout_eligible_at as "payoutEligibleAt",
          b.paid_out_at as "paidOutAt"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
        order by b.created_at desc
      `);
      rows = extractRows(bookingRows);

      const rowsWithContext = await attachBookingItemContext(rows as any);
      const profileCount = Array.isArray(profileContext?.profiles) ? profileContext.profiles.length : 0;
      rows = rowsWithContext.filter((row: any) =>
        bookingRowMatchesActiveProfile(row, activeProfileId, profileCount)
      ) as typeof rows;

      const baseAmountByBookingId = new Map<string, number>();
      for (const row of rows) {
        const grossCents = normalizeAmountToCents(row.totalAmount);
        const typedSubtotalCents = normalizeAmountToCents(row.subtotalAmountCents);
        if (typedSubtotalCents > 0) {
          baseAmountByBookingId.set(row.id, typedSubtotalCents);
          continue;
        }

        const typedBaseCents = normalizeAmountToCents(row.baseSubtotalCents);
        const typedLogisticsCents = normalizeAmountToCents(row.logisticsTotalCents);
        if (typedBaseCents > 0 || typedLogisticsCents > 0) {
          baseAmountByBookingId.set(row.id, typedBaseCents + typedLogisticsCents);
          continue;
        }

        const baseRows: any = await db.execute(drizzleSql`
          select coalesce(sum(bi.total_price_cents), 0)::bigint as "baseAmountCents"
          from booking_items bi
          where bi.booking_id = ${row.id}
        `);
        const baseAmountRaw = Number(
          extractRows<{ baseAmountCents?: number | string }>(baseRows)[0]?.baseAmountCents || 0
        );

        let baseAmountCents = Number.isFinite(baseAmountRaw) && baseAmountRaw > 0
          ? Math.round(baseAmountRaw)
          : 0;

        // Legacy guard: some rows were written in dollars into *_cents fields (e.g. 370 instead of 37000).
        // If base is implausibly tiny relative to booking gross, upscale by 100.
        if (baseAmountCents > 0 && grossCents > 0 && baseAmountCents <= Math.round(grossCents / 10)) {
          baseAmountCents = baseAmountCents * 100;
        }

        if (Number.isFinite(baseAmountCents) && baseAmountCents > 0) {
          baseAmountByBookingId.set(row.id, Math.round(baseAmountCents));
          continue;
        }

        // Fallback for legacy rows without booking_items:
        // treat booking total as listing/base value to avoid leaking old payout math.
        baseAmountByBookingId.set(row.id, normalizeAmountToCents(row.totalAmount));
      }

      const now = new Date();
      const toNetCents = (r: { id: string; vendorPayout?: number | null }) => {
        const typedVendorPayout = normalizeAmountToCents(r.vendorPayout);
        if (typedVendorPayout > 0) return typedVendorPayout;

        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? 0;
        if (!baseAmountCents) return 0;
        const vendorFee = Math.round(baseAmountCents * VENDOR_FEE_RATE);
        return Math.max(0, baseAmountCents - vendorFee);
      };

      const toPlatformFeeCents = (r: { id: string; platformFee?: number | null }) => {
        const typed = normalizeAmountToCents(r.platformFee);
        if (typed > 0) return typed;
        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? 0;
        return Math.round(baseAmountCents * VENDOR_FEE_RATE);
      };

      const toRowPayoutStatus = (r: { payoutStatus?: string | null }) =>
        String(r.payoutStatus || "not_ready").toLowerCase();

      const completedRows = rows.filter((r) => String(r.status || "").toLowerCase() === "completed");

      const totalPaidOut = completedRows
        .filter((r) => toRowPayoutStatus(r) === "paid")
        .reduce((sum, r) => sum + toNetCents(r), 0);

      const pendingNetPayout = completedRows
        .filter((r) => ["not_ready", "eligible", "scheduled"].includes(toRowPayoutStatus(r)))
        .reduce((sum, r) => sum + toNetCents(r), 0);

      const blockedRows = completedRows.filter((r) => toRowPayoutStatus(r) === "blocked");
      const blockedCount = blockedRows.length;
      const blockedNetAmount = blockedRows.reduce((sum, r) => sum + toNetCents(r), 0);

      const historyBase = completedRows.map((r) => {
        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? normalizeAmountToCents(r.totalAmount);
        const typedCustomerFeeCents = normalizeAmountToCents(r.customerFeeAmountCents);
        const grossCentsFromTypedTotal = normalizeAmountToCents(r.totalAmount);
        const grossCents =
          grossCentsFromTypedTotal > 0
            ? grossCentsFromTypedTotal
            : baseAmountCents + (typedCustomerFeeCents > 0 ? typedCustomerFeeCents : Math.round(baseAmountCents * CUSTOMER_FEE_RATE));
        const netCents = toNetCents(r);
        const platformFeeAmount = toPlatformFeeCents(r);
        return {
          id: r.id,
          status: String(r.status || "pending").toLowerCase(),
          payoutStatus: toRowPayoutStatus(r),
          payoutEligibleAt: r.payoutEligibleAt ?? null,
          paidOutAt: r.paidOutAt ?? null,
          eventDate: r.eventDate,
          createdAt: r.createdAt,
          listingTitleSnapshot: r.listingTitleSnapshot ?? null,
          netAmount: netCents,
          grossAmount: grossCents,
          platformFeeAmount,
        };
      });

      const historyWithContext = await attachBookingItemContext(historyBase as any);

      return res.json({
        // Frontend (VendorPayments.tsx) reads `totalNetEarned` ("all-time earnings
        // net of fees" = released + still-pending) and `upcomingNetPayout` ("eligible
        // completed jobs pending release" = pending). Keep the original keys too for
        // any other consumers.
        totalNetEarned: totalPaidOut + pendingNetPayout,
        upcomingNetPayout: pendingNetPayout,
        totalPaidOut,
        pendingNetPayout,
        blockedCount,
        blockedNetAmount,
        payoutReleaseMode: PAYOUT_RELEASE_MODE,
        payoutPolicyNote:
          "Funds are auto-released after a 72-hour post-event dispute window unless a dispute is filed.",
        history: historyWithContext.map((entry: any) => ({
          ...entry,
          itemTitle:
            typeof entry?.itemTitle === "string" && entry.itemTitle.trim().length > 0
              ? entry.itemTitle.trim()
              : null,
        })),
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/notifications", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account?.id) {
        return res.json([]);
      }

      const notifications = await getNotificationsByRecipient(
        account.id,
        "vendor"
      );

      res.json(notifications);
    } catch (error: any) {
      logRouteError("/api/vendor/notifications", error);
      res.status(500).json({ error: "Unable to load notifications" });
    }
  });

  app.get("/api/vendor/notifications/unread-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.json({ unreadCount: 0 });
      const notifications = await getNotificationsByRecipient(account.id, "vendor");
      // Badge counts notifications the vendor hasn't *seen* yet (distinct from
      // per-item read state). Cleared by POST /api/vendor/notifications/mark-seen.
      const unreadCount = notifications.filter((n: any) => !n.seen).length;
      res.json({ unreadCount });
    } catch (error: any) {
      logRouteError("/api/vendor/notifications/unread-count", error);
      res.json({ unreadCount: 0 });
    }
  });

  app.post(
    "/api/vendor/notifications/mark-seen",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.json({ updated: 0 });
        const updated = await markAllNotificationsSeen(account.id, "vendor");
        res.json({ updated });
      } catch (error: any) {
        logRouteError("/api/vendor/notifications/mark-seen", error);
        res.status(500).json({ error: "Unable to mark notifications as seen" });
      }
    }
  );

  app.patch(
    "/api/vendor/notifications/bulk/read",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.status(403).json({ error: "Vendor account required" });

        const { ids } = req.body as { ids?: unknown };
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
          return res.status(400).json({ error: "ids must be an array of strings" });
        }

        const count = await bulkMarkNotificationsRead(ids, account.id, "vendor");
        res.json({ updated: count });
      } catch (error: any) {
        logRouteError("/api/vendor/notifications/bulk/read", error);
        res.status(500).json({ error: "Unable to mark notifications as read" });
      }
    }
  );

  app.patch(
    "/api/vendor/notifications/bulk/archive",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.status(403).json({ error: "Vendor account required" });

        const { ids } = req.body as { ids?: unknown };
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
          return res.status(400).json({ error: "ids must be an array of strings" });
        }

        const count = await bulkArchiveNotifications(ids, account.id, "vendor");
        res.json({ archived: count });
      } catch (error: any) {
        logRouteError("/api/vendor/notifications/bulk/archive", error);
        res.status(500).json({ error: "Unable to archive notifications" });
      }
    }
  );

  app.patch(
    "/api/vendor/notifications/:id/read",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const { id } = req.params;
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) {
          return res.status(403).json({ error: "Vendor account required" });
        }

        const updated = await markNotificationAsRead(id, account.id, "vendor");
        if (!updated) {
          return res.status(404).json({ error: "Notification not found" });
        }

        res.json({ success: true });
      } catch (error: any) {
        logRouteError("/api/vendor/notifications/:id/read", error);
        res.status(500).json({ error: "Unable to update notification" });
      }
    }
  );

  app.get("/api/vendor/reviews", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account?.id) {
        return res.json([]);
      }

      // Fetch all published reviews for this vendor, joined with reviewer name,
      // listing title, and any existing vendor reply.
      const rows = await db
        .select({
          id: listingReviews.id,
          listingId: listingReviews.listingId,
          listingTitle: vendorListings.title,
          bookingId: listingReviews.bookingId,
          rating: listingReviews.rating,
          title: listingReviews.title,
          body: listingReviews.body,
          createdAt: listingReviews.createdAt,
          reviewerName: users.name,
          replyId: reviewReplies.id,
          replyText: reviewReplies.reply,
          repliedAt: reviewReplies.createdAt,
        })
        .from(listingReviews)
        .leftJoin(vendorListings, eq(listingReviews.listingId, vendorListings.id))
        .leftJoin(users, eq(listingReviews.userId, users.id))
        .leftJoin(reviewReplies, eq(reviewReplies.listingReviewId, listingReviews.id))
        .where(
          and(
            eq(listingReviews.vendorAccountId, account.id),
            eq(listingReviews.isPublished, true)
          )
        )
        .orderBy(desc(listingReviews.createdAt));

      res.json(rows);
    } catch (error: any) {
      logRouteError("/api/vendor/reviews", error);
      res.status(500).json({ error: "Unable to load reviews" });
    }
  });

  app.post("/api/vendor/reviews/:id/reply", socialRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(401).json({ error: "Vendor account not found" });
      }

      // Replying to reviews (reputation management) is a Pro feature. Reading
      // reviews stays free (GET /api/vendor/reviews is ungated).
      if (!getVendorEntitlements(account).canManageReviews) {
        return res.status(403).json({
          error: "reviews_pro_required",
          message: "Replying to reviews is a Pro feature. Upgrade to manage your reputation.",
          upgradeUrl: "/vendor/dashboard#vendor-billing",
        });
      }

      const reviewId = req.params.id;
      const replySchema = z.object({ reply: z.string().min(1).max(2000) });
      const { reply } = replySchema.parse(req.body);

      // Verify the review belongs to this vendor before allowing a reply
      const [review] = await db
        .select({ id: listingReviews.id })
        .from(listingReviews)
        .where(
          and(
            eq(listingReviews.id, reviewId),
            eq(listingReviews.vendorAccountId, account.id),
            eq(listingReviews.isPublished, true)
          )
        )
        .limit(1);

      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      // Upsert: delete any existing reply for this review, then insert the new one.
      // This allows vendors to edit their reply by re-submitting.
      await db
        .delete(reviewReplies)
        .where(
          and(
            eq(reviewReplies.listingReviewId, reviewId),
            eq(reviewReplies.vendorAccountId, account.id)
          )
        );

      const [inserted] = await db
        .insert(reviewReplies)
        .values({
          vendorAccountId: account.id,
          listingReviewId: reviewId,
          reply,
        })
        .returning();

      res.json({ success: true, reply: inserted });
    } catch (error: any) {
      logRouteError("/api/vendor/reviews/:id/reply", error);
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid reply text" });
      }
      res.status(500).json({ error: "Unable to submit review reply" });
    }
  });

  // Legacy endpoint removed — use POST /api/vendor/disputes/:caseId/respond instead.
  app.post("/_removed/api/vendor/bookings/:id/dispute/respond", socialRateLimiter, ...requireVendorAuth0, async (req, res) => {
    return res.status(410).json({ error: "This endpoint has been removed. Use POST /api/vendor/disputes/:caseId/respond." });
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

  /**
   * GET /api/vendor/disputes
   * Returns all dispute cases for the authenticated vendor, with filings.
   */
  app.get("/api/vendor/disputes", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

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
          u.name                 AS customer_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN users u ON u.id = b.customer_id
        WHERE b.vendor_account_id = ${account.id}
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
   * POST /api/vendor/disputes
   * Vendor files a new dispute filing (creates a case if none exists for the booking).
   */
  app.post("/api/vendor/disputes", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

      const payload = z.object({
        bookingId: z.string().min(1),
        disputeType: z.enum(["travel_cost_recovery", "damage_claim", "customer_no_show", "other"]),
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
        claimAmountCents: z.number().int().positive().optional(),
      }).parse(req.body ?? {});

      // Verify the booking belongs to this vendor
      const bookingResult = await db.execute(drizzleSql`
        SELECT id, status, vendor_account_id, customer_id,
               listing_title_snapshot, event_date, cancelled_at
        FROM bookings
        WHERE id = ${payload.bookingId}
          AND vendor_account_id = ${account.id}
        LIMIT 1
      `);
      const bk = bookingResult.rows[0] as any;
      if (!bk) return res.status(404).json({ error: "Booking not found" });

      const allowedStatuses = ["pending", "confirmed", "completed", "cancelled"];
      if (!allowedStatuses.includes(bk.status)) {
        return res.status(400).json({ error: "Disputes can only be filed on active or closed bookings" });
      }

      // Travel-cost-recovery on a cancelled booking must be filed within the hold
      // window (cancelled_at + 72h = DISPUTE_WINDOW_HOURS). After that the held
      // travel fee has already been auto-refunded to the customer.
      if (payload.disputeType === "travel_cost_recovery" && bk.status === "cancelled") {
        const cancelledAt = bk.cancelled_at ? new Date(bk.cancelled_at) : null;
        const deadlineMs = cancelledAt ? cancelledAt.getTime() + 72 * 60 * 60 * 1000 : null;
        if (!deadlineMs || Date.now() >= deadlineMs) {
          return res.status(400).json({
            error: "The travel reimbursement window for this cancellation has closed.",
          });
        }
      }

      const caseId = await findOrCreateDisputeCase(payload.bookingId);

      // Mark case as pending_review since vendor just filed
      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_vendor_account_id,
          dispute_type, description, attachment_urls, claim_amount_cents,
          created_at, updated_at
        ) VALUES (
          ${caseId}, ${payload.bookingId}, 'vendor',
          ${account.id},
          ${payload.disputeType}, ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[], ${payload.claimAmountCents ?? null},
          now(), now()
        )
        RETURNING *
      `);

      return res.status(201).json({ caseId, filing: (filing.rows[0] as any) });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

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

  app.get("/api/vendor/bookings/:bookingId/addon-items", ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });
      const { bookingId } = req.params;
      const owns = await db.execute(drizzleSql`SELECT id FROM bookings WHERE id = ${bookingId} AND vendor_account_id = ${account.id} LIMIT 1`);
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

  // ── Vendor Discount System ─────────────────────────────────────────────────

  // GET /api/listings/:id/active-sale — public endpoint, returns active public sale for a listing

  // POST /api/discounts/validate-code — public endpoint, validates a promo code for a listing

  // GET /api/vendor/discounts — list vendor's discounts with listing IDs
  app.get("/api/vendor/discounts", requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      const rows = await db
        .select({
          id: vendorDiscounts.id,
          discountType: vendorDiscounts.discountType,
          code: vendorDiscounts.code,
          percentOff: vendorDiscounts.percentOff,
          startsAt: vendorDiscounts.startsAt,
          endsAt: vendorDiscounts.endsAt,
          maxUses: vendorDiscounts.maxUses,
          usedCount: vendorDiscounts.usedCount,
          active: vendorDiscounts.active,
          createdAt: vendorDiscounts.createdAt,
          listingId: discountListings.listingId,
        })
        .from(vendorDiscounts)
        .leftJoin(discountListings, eq(discountListings.discountId, vendorDiscounts.id))
        .where(eq(vendorDiscounts.vendorAccountId, vendorAccount.id))
        .orderBy(desc(vendorDiscounts.createdAt));

      // Group listing IDs per discount
      const discountMap = new Map<string, any>();
      for (const row of rows) {
        if (!discountMap.has(row.id)) {
          discountMap.set(row.id, {
            id: row.id,
            discountType: row.discountType,
            code: row.code,
            percentOff: row.percentOff,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            maxUses: row.maxUses,
            usedCount: row.usedCount,
            active: row.active,
            createdAt: row.createdAt,
            listingIds: [],
          });
        }
        if (row.listingId) {
          discountMap.get(row.id).listingIds.push(row.listingId);
        }
      }

      const now = new Date();
      const result = Array.from(discountMap.values()).map((d) => ({
        ...d,
        status: !d.active
          ? "expired"
          : now > d.endsAt
            ? "expired"
            : now < d.startsAt
              ? "scheduled"
              : "active",
      }));

      return res.json({ discounts: result });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/vendor/discounts — create a discount
  app.post("/api/vendor/discounts", mutationRateLimiter, requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      // Discounts & promos are a Pro feature.
      if (!getVendorEntitlements(vendorAccount).canUseDiscounts) {
        return res.status(403).json({
          error: "discounts_pro_required",
          message: "Discounts & promos are a Pro feature. Upgrade to create and run promotional offers.",
          upgradeUrl: "/vendor/dashboard#vendor-billing",
        });
      }

      const createDiscountSchema = z.object({
        discountType: z.enum(["promo_code", "public_sale"]),
        code: z.string().max(32).optional(),
        percentOff: z.number().int().min(1).max(100),
        startsAt: z.string(),
        endsAt: z.string(),
        maxUses: z.number().int().min(1).optional(),
        listingIds: z.array(z.string()).min(1, "At least one listing is required"),
      });

      const parsed = createDiscountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }
      const body = parsed.data;

      // Validate code format for promo codes
      if (body.discountType === "promo_code") {
        if (!body.code) return res.status(400).json({ error: "Promo code is required for promo_code type" });
        if (!/^[A-Z0-9]+$/.test(body.code.toUpperCase())) {
          return res.status(400).json({ error: "Promo code must be uppercase letters and numbers only" });
        }
        body.code = body.code.toUpperCase();
      }

      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      if (endsAt <= startsAt) {
        return res.status(400).json({ error: "End date must be after start date" });
      }

      // Verify vendor owns all listed listings
      const ownedListings = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(
          and(
            inArray(vendorListings.id, body.listingIds),
            eq(vendorListings.accountId, vendorAccount.id),
          ),
        );

      if (ownedListings.length !== body.listingIds.length) {
        return res.status(403).json({ error: "One or more listings do not belong to this vendor" });
      }

      // Warn on overlapping public sales for the same listing (non-blocking)
      let overlappingSale = false;
      if (body.discountType === "public_sale") {
        const overlaps = await db
          .select({ id: vendorDiscounts.id })
          .from(vendorDiscounts)
          .innerJoin(discountListings, eq(discountListings.discountId, vendorDiscounts.id))
          .where(
            and(
              eq(vendorDiscounts.discountType, "public_sale"),
              eq(vendorDiscounts.active, true),
              inArray(discountListings.listingId, body.listingIds),
              lte(vendorDiscounts.startsAt, endsAt),
              gte(vendorDiscounts.endsAt, startsAt),
            ),
          )
          .limit(1);
        overlappingSale = overlaps.length > 0;
      }

      const [discount] = await db
        .insert(vendorDiscounts)
        .values({
          vendorAccountId: vendorAccount.id,
          discountType: body.discountType,
          code: body.discountType === "promo_code" ? body.code : null,
          percentOff: body.percentOff,
          startsAt,
          endsAt,
          maxUses: body.discountType === "promo_code" ? (body.maxUses ?? null) : null,
          active: true,
        })
        .returning();

      if (body.listingIds.length > 0) {
        await db.insert(discountListings).values(
          body.listingIds.map((listingId) => ({ discountId: discount.id, listingId })),
        );
      }

      return res.status(201).json({ discount, overlappingSale });
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ error: "A promo code with that name already exists" });
      }
      return respondWithInternalServerError(req, res, err);
    }
  });

  // PATCH /api/vendor/discounts/:id — update a discount
  app.patch("/api/vendor/discounts/:id", mutationRateLimiter, requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      // Discounts & promos are a Pro feature. (DELETE stays open so a downgraded
      // vendor can still remove any offers they created while on Pro.)
      if (!getVendorEntitlements(vendorAccount).canUseDiscounts) {
        return res.status(403).json({
          error: "discounts_pro_required",
          message: "Discounts & promos are a Pro feature. Upgrade to create and run promotional offers.",
          upgradeUrl: "/vendor/dashboard#vendor-billing",
        });
      }

      const discountId = req.params.id?.trim();
      if (!discountId) return res.status(400).json({ error: "Discount ID required" });

      const [existing] = await db
        .select({ id: vendorDiscounts.id, vendorAccountId: vendorDiscounts.vendorAccountId, discountType: vendorDiscounts.discountType })
        .from(vendorDiscounts)
        .where(eq(vendorDiscounts.id, discountId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Discount not found" });
      if (existing.vendorAccountId !== vendorAccount.id) return res.status(403).json({ error: "Forbidden" });

      const updateSchema = z.object({
        code: z.string().max(32).optional(),
        percentOff: z.number().int().min(1).max(100).optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        maxUses: z.number().int().min(1).nullable().optional(),
        active: z.boolean().optional(),
        listingIds: z.array(z.string()).min(1).optional(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }
      const body = parsed.data;

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (body.percentOff !== undefined) updates.percentOff = body.percentOff;
      if (body.active !== undefined) updates.active = body.active;
      if (body.maxUses !== undefined) updates.maxUses = body.maxUses;

      if (body.code !== undefined && existing.discountType === "promo_code") {
        const upperCode = body.code.toUpperCase();
        if (!/^[A-Z0-9]+$/.test(upperCode)) {
          return res.status(400).json({ error: "Promo code must be uppercase letters and numbers only" });
        }
        updates.code = upperCode;
      }

      if (body.startsAt) updates.startsAt = new Date(body.startsAt);
      if (body.endsAt) updates.endsAt = new Date(body.endsAt);
      if (updates.startsAt && updates.endsAt && updates.endsAt <= updates.startsAt) {
        return res.status(400).json({ error: "End date must be after start date" });
      }

      const [updated] = await db
        .update(vendorDiscounts)
        .set(updates)
        .where(eq(vendorDiscounts.id, discountId))
        .returning();

      if (body.listingIds) {
        // Verify ownership
        const owned = await db
          .select({ id: vendorListings.id })
          .from(vendorListings)
          .where(and(inArray(vendorListings.id, body.listingIds), eq(vendorListings.accountId, vendorAccount.id)));

        if (owned.length !== body.listingIds.length) {
          return res.status(403).json({ error: "One or more listings do not belong to this vendor" });
        }

        await db.delete(discountListings).where(eq(discountListings.discountId, discountId));
        await db.insert(discountListings).values(
          body.listingIds.map((listingId) => ({ discountId, listingId })),
        );
      }

      return res.json({ discount: updated });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // DELETE /api/vendor/discounts/:id — delete a discount
  app.delete("/api/vendor/discounts/:id", mutationRateLimiter, requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      const discountId = req.params.id?.trim();
      if (!discountId) return res.status(400).json({ error: "Discount ID required" });

      const [existing] = await db
        .select({ id: vendorDiscounts.id, vendorAccountId: vendorDiscounts.vendorAccountId })
        .from(vendorDiscounts)
        .where(eq(vendorDiscounts.id, discountId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Discount not found" });
      if (existing.vendorAccountId !== vendorAccount.id) return res.status(403).json({ error: "Forbidden" });

      await db.delete(vendorDiscounts).where(eq(vendorDiscounts.id, discountId));

      return res.json({ deleted: true });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });
}
