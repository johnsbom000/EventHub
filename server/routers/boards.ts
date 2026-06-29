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

export function registerBoardRoutes(app: Express): void {
  // ── Planning Boards ────────────────────────────────────────────────────────
  // All routes require a logged-in customer.

  // GET /api/boards/saved-ids — flat list of all listing IDs the customer has saved
  // (used client-side to fill the heart icon without fetching every board's details)
  app.get("/api/boards/saved-ids", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const rows = await db
        .select({ listingId: boardSavedListings.listingId })
        .from(boardSavedListings)
        .innerJoin(planningBoards, eq(planningBoards.id, boardSavedListings.boardId))
        .where(eq(planningBoards.customerId, customerAuth.id));

      return res.json({ listingIds: rows.map((r) => r.listingId) });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/boards/for-listing/:listingId — boards list with hasSaved flag for this listing
  // (drives the popover checkmarks; registered before /:id routes to avoid Express capture)
  app.get("/api/boards/for-listing/:listingId", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const listingId = req.params.listingId?.trim();
      if (!listingId) return res.status(400).json({ error: "listingId required" });

      const boards = await db
        .select({
          id: planningBoards.id,
          name: planningBoards.name,
          createdAt: planningBoards.createdAt,
          savedCount: count(boardSavedListings.id),
        })
        .from(planningBoards)
        .leftJoin(boardSavedListings, eq(boardSavedListings.boardId, planningBoards.id))
        .where(eq(planningBoards.customerId, customerAuth.id))
        .groupBy(planningBoards.id, planningBoards.name, planningBoards.createdAt)
        .orderBy(desc(planningBoards.createdAt));

      const savedRows = await db
        .select({ boardId: boardSavedListings.boardId })
        .from(boardSavedListings)
        .innerJoin(planningBoards, eq(planningBoards.id, boardSavedListings.boardId))
        .where(
          and(
            eq(planningBoards.customerId, customerAuth.id),
            eq(boardSavedListings.listingId, listingId),
          ),
        );

      const savedBoardIds = new Set(savedRows.map((r) => r.boardId));
      return res.json(boards.map((b) => ({ ...b, hasSaved: savedBoardIds.has(b.id) })));
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/boards — list boards for the authenticated customer
  app.get("/api/boards", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boards = await db
        .select({
          id: planningBoards.id,
          name: planningBoards.name,
          createdAt: planningBoards.createdAt,
          savedCount: count(boardSavedListings.id),
        })
        .from(planningBoards)
        .leftJoin(boardSavedListings, eq(boardSavedListings.boardId, planningBoards.id))
        .where(eq(planningBoards.customerId, customerAuth.id))
        .groupBy(planningBoards.id, planningBoards.name, planningBoards.createdAt)
        .orderBy(desc(planningBoards.createdAt));

      return res.json(boards);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/boards — create a new board
  app.post("/api/boards", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(400).json({ error: "name is required" });
      if (name.length > 120) return res.status(400).json({ error: "name must be 120 characters or fewer" });

      const [board] = await db
        .insert(planningBoards)
        .values({ customerId: customerAuth.id, name })
        .returning();

      return res.status(201).json(board);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // DELETE /api/boards/:id — delete a board (owner only)
  app.delete("/api/boards/:id", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      if (!boardId) return res.status(400).json({ error: "Board id required" });

      const [existing] = await db
        .select({ id: planningBoards.id, customerId: planningBoards.customerId })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Board not found" });
      if (existing.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      await db.delete(planningBoards).where(eq(planningBoards.id, boardId));
      return res.status(204).send();
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/boards/:id/listings — list saved listings for a board
  app.get("/api/boards/:id/listings", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      if (!boardId) return res.status(400).json({ error: "Board id required" });

      const [board] = await db
        .select({ id: planningBoards.id, customerId: planningBoards.customerId, name: planningBoards.name })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!board) return res.status(404).json({ error: "Board not found" });
      if (board.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      const rows = await db
        .select({
          savedAt: boardSavedListings.savedAt,
          listing: vendorListings,
        })
        .from(boardSavedListings)
        .innerJoin(vendorListings, eq(vendorListings.id, boardSavedListings.listingId))
        .where(and(
          eq(boardSavedListings.boardId, boardId),
          ne(vendorListings.status, "deleted")
        ))
        .orderBy(desc(boardSavedListings.savedAt));

      return res.json({
        board: { id: board.id, name: board.name },
        listings: rows.map((r) => ({
          ...r.listing,
          photos: (r.listing.photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
          savedAt: r.savedAt,
        })),
      });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/boards/:id/listings — save a listing to a board
  app.post("/api/boards/:id/listings", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      const listingId = typeof req.body?.listingId === "string" ? req.body.listingId.trim() : "";
      if (!boardId) return res.status(400).json({ error: "Board id required" });
      if (!listingId) return res.status(400).json({ error: "listingId is required" });

      const [board] = await db
        .select({ customerId: planningBoards.customerId })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!board) return res.status(404).json({ error: "Board not found" });
      if (board.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      // Upsert — ignore conflict on (board_id, listing_id)
      const [saved] = await db
        .insert(boardSavedListings)
        .values({ boardId, listingId })
        .onConflictDoNothing()
        .returning();

      return res.status(201).json(saved ?? { boardId, listingId });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // DELETE /api/boards/:id/listings/:listingId — remove a listing from a board
  app.delete("/api/boards/:id/listings/:listingId", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      const listingId = req.params.listingId?.trim();
      if (!boardId || !listingId) return res.status(400).json({ error: "Board id and listing id required" });

      const [board] = await db
        .select({ customerId: planningBoards.customerId })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!board) return res.status(404).json({ error: "Board not found" });
      if (board.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      await db
        .delete(boardSavedListings)
        .where(
          and(
            eq(boardSavedListings.boardId, boardId),
            eq(boardSavedListings.listingId, listingId),
          ),
        );

      return res.status(204).send();
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });
  // ── End Planning Boards ────────────────────────────────────────────────────
}
