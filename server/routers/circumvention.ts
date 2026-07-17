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

// Issues a warning to a vendor (admin-initiated). Records a circumvention_warnings
// row and emails the vendor. Warnings NO LONGER auto-suspend — suspension is a
// separate, fully manual admin action (see suspendVendorAccount).
async function issueCircumventionWarning(
  vendorAccountId: string,
  flagId: string | null,
  reason: string,
  issuedBy: string,
  serverUrl: string
): Promise<{ warningNumber: number }> {
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

  (async () => {
    try {
      const vendorRows = await db
        .select({ email: vendorAccounts.email, businessName: vendorAccounts.businessName })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAccountId))
        .limit(1);
      const vendor = vendorRows[0];
      if (!vendor?.email) return;

      await sendCircumventionWarningEmail(vendor.email, {
        recipientName: vendor.businessName || "Vendor",
        warningNumber: Math.min(3, Math.max(1, warningNumber)) as 1 | 2 | 3,
        serverUrl,
      });

      await db
        .update(circumventionWarnings)
        .set({ notifiedEmail: true })
        .where(eq(circumventionWarnings.id, warning.id));
    } catch (err: any) {
      logger.warn("[circumvention] warning email failed:", err?.message || err);
    }
  })();

  return { warningNumber };
}

// Suspends a vendor account (admin-initiated). Creates a vendor_suspensions row,
// deactivates the vendor's live listings, and emails the vendor. Idempotent: if
// an active suspension already exists it is returned unchanged.
async function suspendVendorAccount(params: {
  vendorAccountId: string;
  reason: string;
  createdBy: string;
  serverUrl: string;
  durationDays?: number;
}): Promise<{ suspended: boolean; endsAt: Date; alreadySuspended: boolean }> {
  const { vendorAccountId, reason, createdBy, serverUrl } = params;
  const durationDays = params.durationDays && params.durationDays > 0 ? params.durationDays : 30;
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

  if (existing) {
    return { suspended: true, endsAt: existing.endsAt, alreadySuspended: true };
  }

  const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const warningCountRows = await db
    .select({ id: circumventionWarnings.id })
    .from(circumventionWarnings)
    .where(eq(circumventionWarnings.vendorAccountId, vendorAccountId));

  await db.insert(vendorSuspensions).values({
    vendorAccountId,
    reason,
    warningSnapshot: warningCountRows.length,
    startsAt: now,
    endsAt,
    createdBy,
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

  (async () => {
    try {
      const [vendor] = await db
        .select({ email: vendorAccounts.email, businessName: vendorAccounts.businessName })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAccountId))
        .limit(1);
      if (!vendor?.email) return;
      await sendAccountSuspendedEmail(vendor.email, {
        recipientName: vendor.businessName || "Vendor",
        suspensionEndsAt: endsAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
        reason,
        serverUrl,
      });
    } catch (err: any) {
      logger.warn("[circumvention] suspension email failed:", err?.message || err);
    }
  })();

  return { suspended: true, endsAt, alreadySuspended: false };
}

// Retained for the vendor status endpoint's informational payload only; it no
// longer gates any enforcement (detection never blocks or escalates).
const SOFT_ATTEMPT_LIMIT = 5;

// Records a circumvention detection as a pending flag for admin review. This is
// now FULLY SILENT: no content is blocked, nothing is shown to the user, and no
// warning or suspension is issued automatically. Admins review these flags and
// issue warnings/suspensions manually from the moderation panel.
export async function handleCircumventionViolation(params: {
  vendorAccountId: string;
  contentType: string;
  contentSnapshot: string;
  matches: string[];
  reason: string;
  listingId?: string | null;
  bookingId?: string | null;
  serverUrl: string;
}): Promise<{ flagId: string }> {
  const { vendorAccountId, contentType, contentSnapshot, matches, listingId, bookingId } = params;

  const [flag] = await db.insert(circumventionFlags).values({
    flagType: "soft_flag" as any,
    contentType: contentType as any,
    contentSnapshot: contentSnapshot.slice(0, 2000),
    matches,
    vendorAccountId,
    listingId: listingId ?? undefined,
    bookingId: bookingId ?? undefined,
    status: "pending",
  }).returning();

  return { flagId: flag.id };
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
  // Called by the chat client when a message contains detected contact info.
  // SILENT: this only records a pending flag for admin review — the message is
  // NOT blocked and no warning/suspension is issued. Admins act on flags
  // manually from the moderation panel.
  //
  // SECURITY: client-supplied `matches` are stored only as evidence on the flag
  // row; they never drive any automated action.
  app.post("/api/chat/circumvention/flag", messagingRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const payload = z.object({
        bookingId: z.string().min(1),
        contentSnapshot: z.string().min(1).max(2000),
        matches: z.array(z.string()).default([]),
      }).parse(req.body ?? {});

      // Resolve who is sending
      const vendorAuth = (req as any).vendorAuth;
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });

      if (!vendorAuth?.id && !customerAuth?.id) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const actorUserId = vendorAuth?.userId || customerAuth?.id || null;
      const vendorAccountId = vendorAuth?.id || null;

      const [flag] = await db.insert(circumventionFlags).values({
        flagType: "soft_flag" as any,
        contentType: "chat_message" as any,
        contentSnapshot: payload.contentSnapshot.slice(0, 2000),
        matches: payload.matches,
        vendorAccountId: vendorAccountId ?? undefined,
        userId: actorUserId ?? undefined,
        bookingId: payload.bookingId,
        status: "pending",
      }).returning();

      return res.status(201).json({ flagId: flag.id });
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
      }).parse(req.body ?? {});

      const reportedByUserId =
        (await resolveCustomerAuthFromRequest(req, { createIfMissing: false }))?.id ?? null;

      // The reported vendor is derived from a server-validated reference
      // (listing or booking), never from a client-supplied vendorAccountId.
      let reportedVendorAccountId: string | null = null;
      if (payload.listingId) {
        const [listing] = await db
          .select({ accountId: vendorListings.accountId })
          .from(vendorListings)
          .where(eq(vendorListings.id, payload.listingId))
          .limit(1);
        reportedVendorAccountId = listing?.accountId ?? null;
      }
      if (!reportedVendorAccountId && payload.bookingId) {
        const [booking] = await db
          .select({ vendorAccountId: bookings.vendorAccountId })
          .from(bookings)
          .where(eq(bookings.id, payload.bookingId))
          .limit(1);
        reportedVendorAccountId = booking?.vendorAccountId ?? null;
      }
      if (!reportedVendorAccountId) {
        return res.status(400).json({ error: "A valid listingId or bookingId is required" });
      }

      await db.insert(circumventionFlags).values({
        flagType: "customer_report",
        contentType: payload.contentType,
        contentSnapshot: payload.contentSnapshot,
        matches: [],
        vendorAccountId: reportedVendorAccountId,
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
          (SELECT COUNT(*)::int FROM circumvention_warnings w WHERE w.vendor_account_id = va.id) AS "warningCount",
          EXISTS (
            SELECT 1 FROM vendor_suspensions vs
            WHERE vs.vendor_account_id = va.id
              AND vs.ends_at > NOW()
              AND vs.lifted_at IS NULL
          ) AS "isSuspended"
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
      let warningResult: { warningNumber: number } | null = null;
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
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // POST /api/admin/circumvention/vendors/:vendorAccountId/suspend
  // Admin manually suspends a vendor account. Deactivates the vendor's live
  // listings and emails them. Optional body: { reason?, durationDays? }.
  app.post("/api/admin/circumvention/vendors/:vendorAccountId/suspend", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const vendorAccountId = asTrimmedString(req.params?.vendorAccountId);
      if (!vendorAccountId) return res.status(400).json({ error: "Vendor account id required" });

      const body = z.object({
        reason: z.string().max(500).optional(),
        durationDays: z.number().int().positive().max(3650).optional(),
      }).parse(req.body ?? {});

      const [vendor] = await db
        .select({ id: vendorAccounts.id })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAccountId))
        .limit(1);
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });

      const adminAuth = (req as any).adminAuth;
      const adminEmail = adminAuth?.email || "admin";

      const result = await suspendVendorAccount({
        vendorAccountId,
        reason: body.reason?.trim() || "Off-platform contact / circumvention (admin action)",
        createdBy: adminEmail,
        serverUrl: appUrl(),
        durationDays: body.durationDays,
      });

      return res.json({
        success: true,
        suspended: result.suspended,
        alreadySuspended: result.alreadySuspended,
        endsAt: result.endsAt,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return respondWithInternalServerError(req, res, error);
    }
  });

  // POST /api/admin/circumvention/suspensions/:id/lift
  // Admin manually lifts an active suspension and emails the vendor. Listings
  // that were deactivated stay inactive until re-approved/re-published.
  app.post("/api/admin/circumvention/suspensions/:id/lift", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const suspensionId = asTrimmedString(req.params?.id);
      if (!suspensionId) return res.status(400).json({ error: "Suspension id required" });

      const adminAuth = (req as any).adminAuth;
      const adminEmail = adminAuth?.email || "admin";
      const serverUrl = appUrl();

      const [suspension] = await db
        .select()
        .from(vendorSuspensions)
        .where(eq(vendorSuspensions.id, suspensionId))
        .limit(1);
      if (!suspension) return res.status(404).json({ error: "Suspension not found" });
      if (suspension.liftedAt) return res.status(400).json({ error: "Suspension already lifted" });

      await db
        .update(vendorSuspensions)
        .set({ liftedAt: new Date(), liftedBy: adminEmail, liftEmailSent: false })
        .where(eq(vendorSuspensions.id, suspensionId));

      void (async () => {
        try {
          const [vendor] = await db
            .select({ email: vendorAccounts.email, businessName: vendorAccounts.businessName })
            .from(vendorAccounts)
            .where(eq(vendorAccounts.id, suspension.vendorAccountId))
            .limit(1);
          if (!vendor?.email) return;
          await sendSuspensionLiftedEmail(vendor.email, {
            recipientName: vendor.businessName || "Vendor",
            businessName: vendor.businessName || "Vendor",
            serverUrl,
          });
          await db
            .update(vendorSuspensions)
            .set({ liftEmailSent: true })
            .where(eq(vendorSuspensions.id, suspensionId));
        } catch (err: any) {
          logger.warn("[circumvention] suspension-lifted email failed:", err?.message || err);
        }
      })();

      return res.json({ success: true });
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
