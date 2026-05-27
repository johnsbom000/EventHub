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
  ensureBookingDisputesTable,
  ensureStripeCustomer,
  recomputeBookingPaymentStatusInTx,
  markBookingAsPaymentFailedInTx,
  type LockedPaymentPayoutContext,
  loadPaymentPayoutContextForUpdateInTx,
  getBookingDisputeStatusInTx,
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
import { storage } from "../storage";
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
  bookingDisputes,
  disputeAdminNotes,
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

async function issueCircumventionWarning(
  vendorAccountId: string,
  flagId: string | null,
  reason: string,
  issuedBy: string,
  serverUrl: string
): Promise<{ warningNumber: number; suspended: boolean; endsAt: Date | null }> {
  const existingWarnings = await db
    .select({ id: circumventionWarnings.id })
    .from(circumventionWarnings)
    .where(eq(circumventionWarnings.vendorAccountId, vendorAccountId));

  const warningNumber = existingWarnings.length + 1;

  const [warning] = await db
    .insert(circumventionWarnings)
    .values({
      vendorAccountId,
      flagId: flagId ?? null,
      reason,
      issuedBy,
      warningNumber,
      notifiedEmail: false,
    })
    .returning();

  let suspended = false;
  let endsAt: Date | null = null;

  if (warningNumber >= 3) {
    const now = new Date();
    const [existing] = await db
      .select({ id: vendorSuspensions.id, endsAt: vendorSuspensions.endsAt })
      .from(vendorSuspensions)
      .where(
        and(
          eq(vendorSuspensions.vendorAccountId, vendorAccountId),
          drizzleSql`ends_at > ${now}`,
          isNull(vendorSuspensions.liftedAt)
        )
      )
      .limit(1);

    if (!existing) {
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      endsAt = thirtyDaysFromNow;

      await db.insert(vendorSuspensions).values({
        vendorAccountId,
        reason,
        warningSnapshot: warningNumber,
        startsAt: now,
        endsAt: thirtyDaysFromNow,
        createdBy: issuedBy,
        notifiedEmail: false,
      });

      await db
        .update(vendorListings)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(
          and(
            eq(vendorListings.accountId, vendorAccountId),
            drizzleSql`status NOT IN ('deleted', 'draft')`
          )
        );

      suspended = true;
    } else {
      endsAt = existing.endsAt;
      suspended = true;
    }
  }

  (async () => {
    try {
      const vendorRows = await db
        .select({ email: vendorAccounts.email, businessName: vendorAccounts.businessName })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAccountId))
        .limit(1);
      const vendor = vendorRows[0];
      if (!vendor?.email) return;

      if (suspended && endsAt) {
        const endsAtFormatted = endsAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        await sendAccountSuspendedEmail(vendor.email, {
          recipientName: vendor.businessName || "Vendor",
          suspensionEndsAt: endsAtFormatted,
          reason,
          serverUrl,
        });
      } else {
        await sendCircumventionWarningEmail(vendor.email, {
          recipientName: vendor.businessName || "Vendor",
          warningNumber: Math.min(3, Math.max(1, warningNumber)) as 1 | 2 | 3,
          serverUrl,
        });
      }

      await db
        .update(circumventionWarnings)
        .set({ notifiedEmail: true })
        .where(eq(circumventionWarnings.id, warning.id));
    } catch (err: any) {
      logger.warn("[circumvention] email notification failed:", err?.message || err);
    }
  })();

  return { warningNumber, suspended, endsAt };
}

const SOFT_ATTEMPT_LIMIT = 5;

type ViolationResult =
  | { phase: "soft"; softAttemptNumber: number; flagId: string }
  | { phase: "hard"; warningNumber: number; suspended: boolean; endsAt: Date | null; flagId: string };

export async function handleCircumventionViolation(params: {
  vendorAccountId: string;
  contentType: string;
  contentSnapshot: string;
  matches: string[];
  reason: string;
  listingId?: string | null;
  bookingId?: string | null;
  serverUrl: string;
}): Promise<ViolationResult> {
  const { vendorAccountId, contentType, contentSnapshot, matches, reason, listingId, bookingId, serverUrl } = params;

  const softRows = await db
    .select({ id: circumventionFlags.id })
    .from(circumventionFlags)
    .where(
      and(
        eq(circumventionFlags.vendorAccountId, vendorAccountId),
        drizzleSql`flag_type = 'soft_attempt'`
      )
    );
  const softAttemptCount = softRows.length;

  if (softAttemptCount < SOFT_ATTEMPT_LIMIT) {
    const [flag] = await db.insert(circumventionFlags).values({
      flagType: "soft_attempt" as any,
      contentType: contentType as any,
      contentSnapshot: contentSnapshot.slice(0, 2000),
      matches,
      vendorAccountId,
      listingId: listingId ?? undefined,
      bookingId: bookingId ?? undefined,
      status: "pending",
    }).returning();

    return { phase: "soft", softAttemptNumber: softAttemptCount + 1, flagId: flag.id };
  }

  const [flag] = await db.insert(circumventionFlags).values({
    flagType: "hard_block_attempt" as any,
    contentType: contentType as any,
    contentSnapshot: contentSnapshot.slice(0, 2000),
    matches,
    vendorAccountId,
    listingId: listingId ?? undefined,
    bookingId: bookingId ?? undefined,
    status: "pending",
  }).returning();

  const warningResult = await issueCircumventionWarning(
    vendorAccountId,
    flag.id,
    reason,
    "system",
    serverUrl
  );

  return {
    phase: "hard",
    warningNumber: warningResult.warningNumber,
    suspended: warningResult.suspended,
    endsAt: warningResult.endsAt,
    flagId: flag.id,
  };
}

export async function getActiveSuspension(vendorAccountId: string) {
  const now = new Date();
  const [row] = await db
    .select()
    .from(vendorSuspensions)
    .where(
      and(
        eq(vendorSuspensions.vendorAccountId, vendorAccountId),
        drizzleSql`ends_at > ${now}`,
        isNull(vendorSuspensions.liftedAt)
      )
    )
    .limit(1);
  return row ?? null;
}

export function registerCircumventionRoutes(app: Express): void {
  // ── Circumvention Prevention ─────────────────────────────────────────────────

  // POST /api/chat/circumvention/flag
  // Called by the chat client when a message is hard-blocked.
  // Logs the flag, issues a warning, and returns the vendor's new warning state.
  app.post("/api/chat/circumvention/flag", messagingRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const payload = z.object({
        bookingId: z.string().min(1),
        contentSnapshot: z.string().min(1).max(2000),
        matches: z.array(z.string()).default([]),
      }).parse(req.body ?? {});

      const serverUrl = appUrl();

      // Resolve who is sending
      const vendorAuth = (req as any).vendorAuth;
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });

      if (!vendorAuth?.id && !customerAuth?.id) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const actorUserId = vendorAuth?.userId || customerAuth?.id || null;
      const vendorAccountId = vendorAuth?.id || null;

      if (vendorAccountId) {
        // Vendor-side message: run through the escalation ladder.
        const result = await handleCircumventionViolation({
          vendorAccountId,
          contentType: "chat_message",
          contentSnapshot: payload.contentSnapshot,
          matches: payload.matches,
          reason: "Attempted to send contact information in booking chat",
          bookingId: payload.bookingId,
          serverUrl,
        });

        // Also tag the flag with the actor user id (handleCircumventionViolation
        // inserts the flag, but doesn't know the userId — update it now).
        if (actorUserId) {
          db.execute(drizzleSql`
            UPDATE circumvention_flags SET user_id = ${actorUserId} WHERE id = ${result.flagId}
          `).catch(() => {});
        }

        return res.status(201).json({
          flagId: result.flagId,
          phase: result.phase,
          softAttemptNumber: result.phase === "soft" ? result.softAttemptNumber : null,
          warningNumber: result.phase === "hard" ? result.warningNumber : null,
          suspended: result.phase === "hard" ? result.suspended : false,
          suspensionEndsAt: result.phase === "hard" ? result.endsAt : null,
        });
      }

      // Customer-side message (no vendor account): just log and return.
      const [flag] = await db.insert(circumventionFlags).values({
        flagType: "hard_block_attempt" as any,
        contentType: "chat_message" as any,
        contentSnapshot: payload.contentSnapshot.slice(0, 2000),
        matches: payload.matches,
        userId: actorUserId ?? undefined,
        bookingId: payload.bookingId,
        status: "pending",
      }).returning();

      return res.status(201).json({
        flagId: flag.id,
        phase: "soft",
        softAttemptNumber: null,
        warningNumber: null,
        suspended: false,
        suspensionEndsAt: null,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // POST /api/circumvention/report
  // Customer (or vendor) reports a piece of content for potential circumvention.
  app.post("/api/circumvention/report", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const payload = z.object({
        contentType: z.enum(["chat_message", "listing_description", "listing_title", "vendor_description", "tagline"]),
        contentSnapshot: z.string().min(1).max(2000),
        listingId: z.string().optional(),
        bookingId: z.string().optional(),
        vendorAccountId: z.string().optional(),
      }).parse(req.body ?? {});

      const reportedByUserId =
        (await resolveCustomerAuthFromRequest(req, { createIfMissing: false }))?.id ?? null;

      await db.insert(circumventionFlags).values({
        flagType: "customer_report",
        contentType: payload.contentType,
        contentSnapshot: payload.contentSnapshot,
        matches: [],
        vendorAccountId: payload.vendorAccountId ?? undefined,
        userId: payload.vendorAccountId ? undefined : (reportedByUserId ?? undefined),
        reportedByUserId: reportedByUserId ?? undefined,
        listingId: payload.listingId ?? undefined,
        bookingId: payload.bookingId ?? undefined,
        status: "pending",
      });

      return res.status(201).json({ success: true });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // GET /api/vendor/circumvention/status
  // Returns the vendor's warning count, active suspension, and any listings
  // pending admin re-review after a violation removal.
  app.get("/api/vendor/circumvention/status", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth?.id) return res.status(401).json({ error: "Vendor authentication required" });

      const vendorAccountId = String(vendorAuth.id);

      const [warnings, softAttemptRows, suspension, removedListings] = await Promise.all([
        db
          .select()
          .from(circumventionWarnings)
          .where(eq(circumventionWarnings.vendorAccountId, vendorAccountId))
          .orderBy(desc(circumventionWarnings.createdAt)),
        db
          .select({ id: circumventionFlags.id })
          .from(circumventionFlags)
          .where(
            and(
              eq(circumventionFlags.vendorAccountId, vendorAccountId),
              drizzleSql`flag_type = 'soft_attempt'`
            )
          ),
        getActiveSuspension(vendorAccountId),
        db
          .select({ id: vendorListings.id, title: vendorListings.title, pendingAdminReview: vendorListings.pendingAdminReview })
          .from(vendorListings)
          .where(
            and(
              eq(vendorListings.accountId, vendorAccountId),
              eq(vendorListings.violationRemoval, true)
            )
          ),
      ]);

      return res.json({
        warningCount: warnings.length,
        softAttemptCount: softAttemptRows.length,
        softAttemptLimit: SOFT_ATTEMPT_LIMIT,
        warnings,
        suspension: suspension
          ? { id: suspension.id, reason: suspension.reason, endsAt: suspension.endsAt, startsAt: suspension.startsAt }
          : null,
        removedListings,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // GET /api/admin/circumvention/flags
  // Returns pending flags for admin review.
  // ?status=pending|dismissed|actioned  (default: pending)
  app.get("/api/admin/circumvention/flags", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const statusFilter = (req.query.status as string) || "pending";

      const rows = await db.execute(drizzleSql`
        SELECT
          f.id,
          f.flag_type       AS "flagType",
          f.content_type    AS "contentType",
          f.content_snapshot AS "contentSnapshot",
          f.matches,
          f.status,
          f.reviewed_by     AS "reviewedBy",
          f.reviewed_at     AS "reviewedAt",
          f.created_at      AS "createdAt",
          f.listing_id      AS "listingId",
          f.booking_id      AS "bookingId",
          va.id             AS "vendorAccountId",
          va.business_name  AS "businessName",
          va.email          AS "vendorEmail",
          vl.title          AS "listingTitle",
          vl.status         AS "listingStatus",
          vl.violation_removal      AS "violationRemoval",
          vl.pending_admin_review   AS "pendingAdminReview",
          (SELECT COUNT(*)::int FROM circumvention_warnings w WHERE w.vendor_account_id = va.id) AS "warningCount"
        FROM circumvention_flags f
        LEFT JOIN vendor_accounts va ON va.id = f.vendor_account_id
        LEFT JOIN vendor_listings  vl ON vl.id = f.listing_id
        WHERE f.status = ${statusFilter}
        ORDER BY f.created_at DESC
        LIMIT 200
      `);

      return res.json(extractRows(rows));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // GET /api/admin/circumvention/rereviews
  // Listings that vendors have resubmitted after a violation removal.
  app.get("/api/admin/circumvention/rereviews", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const rows = await db.execute(drizzleSql`
        SELECT
          vl.id,
          vl.title,
          vl.status,
          vl.description,
          vl.updated_at     AS "updatedAt",
          va.id             AS "vendorAccountId",
          va.business_name  AS "businessName",
          va.email          AS "vendorEmail",
          (SELECT COUNT(*)::int FROM circumvention_warnings w WHERE w.vendor_account_id = va.id) AS "warningCount"
        FROM vendor_listings vl
        JOIN vendor_accounts va ON va.id = vl.account_id
        WHERE vl.violation_removal = true
          AND vl.pending_admin_review = true
        ORDER BY vl.updated_at DESC
        LIMIT 100
      `);

      return res.json(extractRows(rows));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // GET /api/admin/circumvention/warnings
  // Warning history, optionally filtered by vendor.
  app.get("/api/admin/circumvention/warnings", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const vendorAccountId = (req.query.vendorAccountId as string) || null;

      const rows = await db.execute(drizzleSql`
        SELECT
          w.id,
          w.vendor_account_id AS "vendorAccountId",
          w.flag_id           AS "flagId",
          w.reason,
          w.issued_by         AS "issuedBy",
          w.warning_number    AS "warningNumber",
          w.created_at        AS "createdAt",
          va.business_name    AS "businessName",
          va.email            AS "vendorEmail"
        FROM circumvention_warnings w
        JOIN vendor_accounts va ON va.id = w.vendor_account_id
        ${vendorAccountId ? drizzleSql`WHERE w.vendor_account_id = ${vendorAccountId}` : drizzleSql``}
        ORDER BY w.created_at DESC
        LIMIT 500
      `);

      return res.json(extractRows(rows));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // POST /api/admin/circumvention/flags/:id/dismiss
  // Admin dismisses a flag — no action taken against the vendor.
  app.post("/api/admin/circumvention/flags/:id/dismiss", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const flagId = asTrimmedString(req.params?.id);
      if (!flagId) return res.status(400).json({ error: "Flag id required" });

      const adminAuth = (req as any).adminAuth;
      const adminEmail = adminAuth?.email || "admin";

      const [updated] = await db
        .update(circumventionFlags)
        .set({ status: "dismissed", reviewedBy: adminEmail, reviewedAt: new Date() })
        .where(eq(circumventionFlags.id, flagId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Flag not found" });

      return res.json({ success: true, flag: updated });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // POST /api/admin/circumvention/flags/:id/warn-remove
  // Admin issues a warning and removes (unpublishes) the associated listing.
  // The listing is marked violation_removal=true so it must be re-reviewed before
  // it can go live again.
  app.post("/api/admin/circumvention/flags/:id/warn-remove", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const flagId = asTrimmedString(req.params?.id);
      if (!flagId) return res.status(400).json({ error: "Flag id required" });

      const adminAuth = (req as any).adminAuth;
      const adminEmail = adminAuth?.email || "admin";
      const serverUrl = appUrl();

      const [flag] = await db
        .select()
        .from(circumventionFlags)
        .where(eq(circumventionFlags.id, flagId))
        .limit(1);

      if (!flag) return res.status(404).json({ error: "Flag not found" });
      if (flag.status === "actioned") return res.status(400).json({ error: "Flag already actioned" });

      // Mark flag as actioned
      await db
        .update(circumventionFlags)
        .set({ status: "actioned", reviewedBy: adminEmail, reviewedAt: new Date() })
        .where(eq(circumventionFlags.id, flagId));

      // If the flag is linked to a listing, unpublish it and mark for re-review
      if (flag.listingId) {
        await db
          .update(vendorListings)
          .set({
            status: "inactive",
            violationRemoval: true,
            pendingAdminReview: false,
            updatedAt: new Date(),
          })
          .where(eq(vendorListings.id, flag.listingId));
      }

      // Issue a warning
      let warningResult: { warningNumber: number; suspended: boolean; endsAt: Date | null } | null = null;
      if (flag.vendorAccountId) {
        const reason =
          flag.listingId
            ? "Listing contained contact information or off-platform redirect (admin review)"
            : "Content contained contact information or off-platform redirect (admin review)";
        warningResult = await issueCircumventionWarning(
          flag.vendorAccountId,
          flagId,
          reason,
          adminEmail,
          serverUrl
        );
      }

      // Fire-and-forget: notify vendor their listing was taken down
      if (flag.listingId && flag.vendorAccountId) {
        void (async () => {
          try {
            const [vendorRow] = await db
              .select({ email: vendorAccounts.email, businessName: vendorAccounts.businessName })
              .from(vendorAccounts)
              .where(eq(vendorAccounts.id, flag.vendorAccountId!))
              .limit(1);
            const [listingRow] = await db
              .select({ title: vendorListings.title })
              .from(vendorListings)
              .where(eq(vendorListings.id, flag.listingId!))
              .limit(1);
            if (vendorRow?.email) {
              await sendListingTakenDownEmail(vendorRow.email, {
                recipientName: vendorRow.businessName || "Vendor",
                listingTitle: listingRow?.title || "Your listing",
                reason: "Content contained contact information or off-platform redirect",
                warningNumber: warningResult?.warningNumber,
                serverUrl,
              });
            }
          } catch (emailError: any) {
            logger.warn("[listing takedown email] failed:", emailError?.message || emailError);
          }
        })();
      }

      return res.json({
        success: true,
        warningNumber: warningResult?.warningNumber ?? null,
        suspended: warningResult?.suspended ?? false,
        suspensionEndsAt: warningResult?.endsAt ?? null,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // POST /api/admin/circumvention/listings/:id/approve
  // Admin approves a resubmitted listing after a violation removal, making it active again.
  app.post("/api/admin/circumvention/listings/:id/approve", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const listingId = asTrimmedString(req.params?.id);
      if (!listingId) return res.status(400).json({ error: "Listing id required" });

      const [listing] = await db
        .select({ id: vendorListings.id, accountId: vendorListings.accountId, pendingAdminReview: vendorListings.pendingAdminReview, violationRemoval: vendorListings.violationRemoval })
        .from(vendorListings)
        .where(eq(vendorListings.id, listingId))
        .limit(1);

      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (!listing.violationRemoval || !listing.pendingAdminReview) {
        return res.status(400).json({ error: "This listing is not awaiting re-review" });
      }

      // Check the vendor is not currently suspended
      const suspension = await getActiveSuspension(listing.accountId);
      if (suspension) {
        return res.status(400).json({ error: "Cannot approve listing while vendor is suspended" });
      }

      await db
        .update(vendorListings)
        .set({
          status: "active",
          violationRemoval: false,
          pendingAdminReview: false,
          updatedAt: new Date(),
        })
        .where(eq(vendorListings.id, listingId));

      return res.json({ success: true });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // GET /api/admin/circumvention/suspensions
  // Returns all currently active vendor suspensions (not yet expired, not manually lifted).
  app.get("/api/admin/circumvention/suspensions", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const now = new Date();
      const rows: any = await db.execute(drizzleSql`
        SELECT
          vs.id,
          vs.reason,
          vs.starts_at         AS "startsAt",
          vs.ends_at           AS "endsAt",
          vs.warning_snapshot  AS "warningSnapshot",
          vs.lifted_at         AS "liftedAt",
          va.business_name     AS "businessName",
          va.email             AS "vendorEmail",
          va.id                AS "vendorAccountId"
        FROM vendor_suspensions vs
        JOIN vendor_accounts va ON va.id = vs.vendor_account_id
        WHERE vs.ends_at > ${now}
          AND vs.lifted_at IS NULL
        ORDER BY vs.starts_at DESC
        LIMIT 200
      `);
      return res.json(extractRows(rows));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });
}
