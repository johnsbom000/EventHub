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
  runBookingCompletionJob,
  runSecurityDepositRefundJob,
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
  foundingVendorInvites,
  marqueeVendorInvites,
  marqueeEmailInvites,
  foundingEmailInvites,
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
  sendFoundingVendorInviteEmail,
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


export function registerAdminRoutes(app: Express): void {

  // Admin identity check — used by the frontend to verify admin access before rendering
  app.get("/api/admin/me", adminRateLimiter, requireAdminAuth, (req, res) => {
    const adminAuth = (req as any).adminAuth as { id?: string; email?: string } | undefined;
    return res.json({ isAdmin: true, email: adminAuth?.email ?? null });
  });

  app.get("/api/admin/disputes", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const statusFilter = asTrimmedString((req.query as any)?.status).toLowerCase();
      const typeFilter   = asTrimmedString((req.query as any)?.type).toLowerCase();

      const statusWhere = statusFilter && ["open", "pending_review", "resolved"].includes(statusFilter)
        ? drizzleSql`AND dc.status = ${statusFilter}`
        : drizzleSql``;

      const cases = await db.execute(drizzleSql`
        SELECT
          dc.id                  AS case_id,
          dc.booking_id,
          dc.status              AS case_status,
          dc.resolution,
          dc.resolved_at,
          dc.response_deadline_at,
          dc.created_at          AS case_created_at,
          dc.updated_at          AS case_updated_at,
          b.status               AS booking_status,
          b.event_date,
          b.booking_end_at,
          b.listing_title_snapshot,
          b.payout_status,
          b.payout_blocked_reason,
          b.customer_fee_amount_cents,
          b.platform_fee_amount  AS booking_platform_fee,
          b.vendor_net_payout_amount AS vendor_payout_cents,
          cust.name              AS customer_name,
          cust.email             AS customer_email,
          va.business_name       AS vendor_name,
          va.email               AS vendor_email,
          dep.id                 AS deposit_payment_id,
          dep.amount             AS deposit_payment_cents,
          dep.status             AS deposit_payment_status,
          bkp.amount             AS booking_payment_cents
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN users cust ON cust.id = b.customer_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        LEFT JOIN LATERAL (
          SELECT id, amount, status
          FROM payments
          WHERE booking_id = dc.booking_id
            AND payment_type IN ('security_deposit', 'deposit')
          ORDER BY created_at DESC LIMIT 1
        ) dep ON true
        LEFT JOIN LATERAL (
          SELECT amount
          FROM payments
          WHERE booking_id = dc.booking_id
            AND payment_type = 'booking'
          ORDER BY created_at DESC LIMIT 1
        ) bkp ON true
        WHERE 1=1 ${statusWhere}
        ORDER BY dc.updated_at DESC
        LIMIT 200
      `);

      const caseRows = cases.rows as any[];
      if (caseRows.length === 0) return res.json([]);

      const caseIds = caseRows.map((c: any) => c.case_id);
      const filings = await db.execute(drizzleSql`
        SELECT
          df.id, df.case_id, df.filed_by, df.dispute_type,
          df.description, df.attachment_urls, df.claim_amount_cents,
          df.is_response, df.created_at,
          u.name           AS filer_customer_name,
          u.email          AS filer_customer_email,
          va.business_name AS filer_vendor_name,
          va.email         AS filer_vendor_email
        FROM dispute_filings df
        LEFT JOIN users u ON u.id = df.filer_customer_id
        LEFT JOIN vendor_accounts va ON va.id = df.filer_vendor_account_id
        WHERE df.case_id = ANY(${toPgTextArray(caseIds)}::text[])
        ORDER BY df.created_at ASC
      `);

      const filingsByCaseId: Record<string, any[]> = {};
      for (const f of filings.rows as any[]) {
        if (!filingsByCaseId[f.case_id]) filingsByCaseId[f.case_id] = [];
        filingsByCaseId[f.case_id].push(f);
      }

      let result = caseRows.map((c: any) => ({
        ...c,
        filings: filingsByCaseId[c.case_id] ?? [],
      }));

      // Optional client-side type filter (any filing in the case matches)
      if (typeFilter) {
        result = result.filter((c: any) =>
          c.filings.some((f: any) => f.dispute_type === typeFilter)
        );
      }

      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: "Unable to load disputes" });
    }
  });

  // POST /api/admin/disputes/:id/note — add an admin note filing to a case
  app.post("/api/admin/disputes/:id/note", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const caseId = asTrimmedString(req.params?.id);
      if (!caseId) return res.status(400).json({ error: "Case id required" });

      const { content } = z.object({ content: z.string().trim().min(1).max(2000) }).parse(req.body ?? {});

      // Resolve booking_id from case
      const caseRow = await db.execute(drizzleSql`SELECT booking_id FROM dispute_cases WHERE id = ${caseId} LIMIT 1`);
      if (!caseRow.rows[0]) return res.status(404).json({ error: "Case not found" });
      const bookingId = String((caseRow.rows[0] as any).booking_id);

      await db.execute(drizzleSql`
        INSERT INTO dispute_filings (case_id, booking_id, filed_by, dispute_type, description, attachment_urls, created_at, updated_at)
        VALUES (${caseId}, ${bookingId}, 'admin', 'admin_note', ${content}, '{}', now(), now())
      `);

      await db.execute(drizzleSql`UPDATE dispute_cases SET updated_at = now() WHERE id = ${caseId}`);

      return res.json({ ok: true });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  app.post("/api/admin/disputes/:id/resolve", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const caseId = asTrimmedString(req.params?.id);
      if (!caseId) {
        return res.status(400).json({ error: "Case id is required" });
      }

      let resolvedBookingId: string | null = null;
      const caseRow = await db.execute(drizzleSql`SELECT booking_id FROM dispute_cases WHERE id = ${caseId} LIMIT 1`);
      if (caseRow.rows[0]) {
        resolvedBookingId = String((caseRow.rows[0] as any).booking_id);
      }
      if (!resolvedBookingId) {
        return res.status(404).json({ error: "Dispute case not found" });
      }

      const payload = z
        .object({
          decision: z.enum(["refund", "payout"]),
          adminNotes: z.string().trim().max(2000).optional(),
          // How many cents to refund to the customer.
          // Absent = full deposit refund. Can exceed deposit to also refund booking payment.
          refundAmountCents: z.number().int().min(0).optional(),
        })
        .parse(req.body ?? {});

      // Build booking context (works whether resolvedBookingId came from dispute_cases or legacy)
      const bookingContextRows: any = await db.execute(drizzleSql`
        SELECT
          b.id            AS "bookingId",
          b.status        AS "bookingStatus",
          coalesce(b.listing_title_snapshot, listing_owner.title) AS "listingTitle",
          b.event_date    AS "eventDate",
          cust.email      AS "customerEmail",
          cust.name       AS "customerName",
          va.email        AS "vendorEmail",
          va.business_name AS "vendorBusinessName",
          dc.id           AS "caseId",
          dc.status       AS "caseStatus"
        FROM bookings b
        LEFT JOIN vendor_listings listing_owner ON listing_owner.id = b.listing_id
        LEFT JOIN users cust ON cust.id = b.customer_id
        LEFT JOIN vendor_accounts va ON va.id = coalesce(b.vendor_account_id, listing_owner.account_id)
        LEFT JOIN dispute_cases dc ON dc.booking_id = b.id
        WHERE b.id = ${resolvedBookingId}
        LIMIT 1
      `);
      const bookingContext = extractRows<{
        bookingId?: string | null;
        bookingStatus?: string | null;
        listingTitle?: string | null;
        eventDate?: string | null;
        customerEmail?: string | null;
        customerName?: string | null;
        vendorEmail?: string | null;
        vendorBusinessName?: string | null;
        caseId?: string | null;
        caseStatus?: string | null;
      }>(bookingContextRows)[0];

      if (!bookingContext?.bookingId) {
        return res.status(404).json({ error: "Dispute not found" });
      }
      if (bookingContext.caseStatus === "resolved") {
        return res.status(409).json({ error: "Case already resolved" });
      }

      resolvedBookingId = bookingContext.bookingId as string;
      const activeCaseId = (bookingContext.caseId ?? caseId) as string;
      const dispute = { ...bookingContext };

      const now = new Date();

      if (payload.decision === "refund") {
        const depositPaymentRows = await db
          .select({
            id: payments.id,
            bookingId: payments.bookingId,
            stripePaymentIntentId: payments.stripePaymentIntentId,
            amount: payments.amount,
            status: payments.status,
          })
          .from(payments)
          .where(
            and(
              eq(payments.bookingId, resolvedBookingId),
              eq(payments.paymentType, "security_deposit")
            )
          )
          .orderBy(desc(payments.createdAt))
          .limit(1);
        const depositPayment = depositPaymentRows[0];

        if (!depositPayment?.id) {
          return res.status(400).json({ error: "No security deposit payment found for this dispute" });
        }
        if (!isPaymentSucceededStatus(depositPayment.status)) {
          return res.status(400).json({ error: "Security deposit payment is not in a refundable state" });
        }

        // Find the booking payment to support full-booking refunds.
        const bookingPaymentRows = await db
          .select({
            id: payments.id,
            stripePaymentIntentId: payments.stripePaymentIntentId,
            amount: payments.amount,
            status: payments.status,
            vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
          })
          .from(payments)
          .where(and(eq(payments.bookingId, resolvedBookingId), eq(payments.paymentType, "booking")))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        const bookingPayment = bookingPaymentRows[0] ?? null;

        const depositAmt = depositPayment.amount ?? 0;
        // Max refundable from booking payment = vendor net payout (non-fee portion).
        const maxBookingRefund = bookingPayment?.vendorNetPayoutAmount ?? 0;
        const maxTotalRefund = depositAmt + maxBookingRefund;

        const requestedRefund = typeof payload.refundAmountCents === "number"
          ? payload.refundAmountCents
          : depositAmt; // default: full deposit refund

        if (requestedRefund > maxTotalRefund) {
          return res.status(400).json({
            error: `Refund amount cannot exceed ${formatCentsAsDollars(maxTotalRefund)} (deposit + vendor payout)`,
          });
        }

        // Split the refund: deposit first, then booking payment for any excess.
        const depositRefundCents = Math.min(requestedRefund, depositAmt);
        const withheld = depositAmt - depositRefundCents; // withheld from deposit → paid to vendor
        const bookingRefundCents = Math.max(0, requestedRefund - depositAmt);

        const { refundBookingPayment } = await import("../stripe");

        // Refund deposit portion.
        const depositRefund = depositRefundCents > 0
          ? await refundBookingPayment({
              paymentIntentId: depositPayment.stripePaymentIntentId,
              amount: depositRefundCents < depositAmt ? depositRefundCents : undefined,
              reason: "requested_by_customer",
              idempotencyKey: `admin-dispute-refund:${caseId}:${depositPayment.id}`,
            })
          : null;

        // Refund booking payment portion (vendor no-show / full cancellation).
        const bookingRefund = bookingRefundCents > 0 && bookingPayment
          ? await refundBookingPayment({
              paymentIntentId: bookingPayment.stripePaymentIntentId,
              amount: bookingRefundCents < (bookingPayment.amount ?? 0) ? bookingRefundCents : undefined,
              reason: "requested_by_customer",
              idempotencyKey: `admin-dispute-refund-booking:${caseId}:${bookingPayment.id}`,
            })
          : null;

        const resolutionNote = (() => {
          if (payload.adminNotes) return payload.adminNotes;
          if (bookingRefundCents > 0) {
            return `Full refund: ${formatCentsAsDollars(requestedRefund)} refunded to customer (deposit + booking)`;
          }
          if (withheld > 0) {
            return `Partial refund: ${formatCentsAsDollars(depositRefundCents)} refunded, ${formatCentsAsDollars(withheld)} withheld for damages`;
          }
          return "Full deposit refund approved";
        })();

        await db.transaction(async (tx) => {
          // Deposit payment: refunded portion goes to customer; withheld portion queued for vendor payout.
          await tx
            .update(payments)
            .set({
              status: withheld > 0 ? "partially_refunded" : "refunded",
              refundAmount: depositRefundCents,
              refundReason: "admin_dispute_refund",
              refundedAt: now,
              // Withheld portion → make eligible for vendor payout via payout worker.
              payoutStatus: withheld > 0 ? "eligible" : "cancelled",
              payoutEligibleAt: withheld > 0 ? now : null,
              payoutBlockedReason: withheld > 0 ? null : "dispute_refund_approved",
              payoutAdjustedAmount: withheld > 0 ? withheld : 0,
            })
            .where(eq(payments.id, depositPayment.id));

          // Booking payment: cancel payout if we refunded any of it.
          if (bookingRefundCents > 0 && bookingPayment) {
            await tx
              .update(payments)
              .set({
                status: "refunded",
                refundAmount: bookingRefundCents,
                refundReason: "admin_dispute_refund",
                refundedAt: now,
                payoutStatus: "cancelled",
                payoutEligibleAt: null,
                payoutBlockedReason: "dispute_full_refund",
                payoutAdjustedAmount: 0,
              })
              .where(eq(payments.id, bookingPayment.id));
          }

          await tx
            .update(bookings)
            .set({
              securityDepositRefundedAt: now,
              paymentStatus: withheld > 0 ? "partially_refunded" : "refunded",
              cancellationReason: "admin_dispute_refund",
              updatedAt: now,
            })
            .where(eq(bookings.id, resolvedBookingId));

          await tx.execute(drizzleSql`
            UPDATE dispute_cases
            SET status = 'resolved',
                resolution = ${resolutionNote},
                withheld_amount_cents = ${withheld > 0 ? withheld : null},
                resolved_at = ${now},
                updated_at = ${now}
            WHERE id = ${activeCaseId}
          `);
          await tx.execute(drizzleSql`
            INSERT INTO dispute_filings (case_id, booking_id, filed_by, dispute_type, description, attachment_urls, created_at, updated_at)
            VALUES (${activeCaseId}, ${resolvedBookingId}, 'admin', 'admin_note', ${resolutionNote}, '{}', ${now}, ${now})
          `);
        });

        // If withheld > 0, trigger vendor payout for the withheld portion immediately.
        if (withheld > 0) {
          processSinglePayoutCandidate({
            paymentId: depositPayment.id,
            bookingId: resolvedBookingId,
            dryRun: false,
          }).catch(() => {});
        }

        // Fire-and-forget outcome emails
        const serverUrlRefund = appUrl();
        const resolveListingTitle = asTrimmedString(dispute.listingTitle) || "Your booking";
        const resolveEventDate = asTrimmedString(dispute.eventDate) || "N/A";
        const emailRefundAmountCents = requestedRefund > 0 ? requestedRefund : undefined;

        if (dispute.customerEmail) {
          sendDisputeResolvedEmail(dispute.customerEmail, {
            role: "customer",
            decision: "refund",
            recipientName: asTrimmedString(dispute.customerName) || "Customer",
            counterpartName: asTrimmedString(dispute.vendorBusinessName) || "Vendor",
            listingTitle: resolveListingTitle,
            eventDate: resolveEventDate,
            refundAmountCents: emailRefundAmountCents,
            serverUrl: serverUrlRefund,
          }).catch(() => {});
        }
        if (dispute.vendorEmail) {
          sendDisputeResolvedEmail(dispute.vendorEmail, {
            role: "vendor",
            decision: "refund",
            recipientName: asTrimmedString(dispute.vendorBusinessName) || "Vendor",
            counterpartName: asTrimmedString(dispute.customerName) || "Customer",
            listingTitle: resolveListingTitle,
            eventDate: resolveEventDate,
            serverUrl: serverUrlRefund,
          }).catch(() => {});
        }

        return res.json({
          disputeId: caseId,
          bookingId: resolvedBookingId,
          decision: "refund",
          depositRefund,
          bookingRefund,
          resolvedAt: now,
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({
            payoutStatus: "eligible",
            payoutEligibleAt: now,
            payoutBlockedReason: null,
          })
          .where(
            and(
              eq(payments.bookingId, resolvedBookingId),
              eq(payments.paymentType, "security_deposit")
            )
          );

        await tx.execute(drizzleSql`
          UPDATE dispute_cases
          SET status = 'resolved',
              resolution = ${payload.adminNotes ?? "Payout approved to vendor"},
              withheld_amount_cents = ${null},
              resolved_at = ${now},
              updated_at = ${now}
          WHERE id = ${activeCaseId}
        `);
        if (payload.adminNotes) {
          await tx.execute(drizzleSql`
            INSERT INTO dispute_filings (case_id, booking_id, filed_by, dispute_type, description, attachment_urls, created_at, updated_at)
            VALUES (${activeCaseId}, ${resolvedBookingId}, 'admin', 'admin_note', ${payload.adminNotes}, '{}', ${now}, ${now})
          `);
        }
      });

      const depositRows = await db
        .select({
          id: payments.id,
          bookingId: payments.bookingId,
        })
        .from(payments)
        .where(
          and(
            eq(payments.bookingId, resolvedBookingId),
            eq(payments.paymentType, "security_deposit")
          )
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      const deposit = depositRows[0];
      const payoutResult = deposit
        ? await processSinglePayoutCandidate({
            paymentId: deposit.id,
            bookingId: deposit.bookingId,
            dryRun: false,
          })
        : null;

      // Fire-and-forget outcome emails
      const serverUrlPayout = appUrl();
      const payoutListingTitle = asTrimmedString(dispute.listingTitle) || "Your booking";
      const payoutEventDate = asTrimmedString(dispute.eventDate) || "N/A";

      if (dispute.customerEmail) {
        sendDisputeResolvedEmail(dispute.customerEmail, {
          role: "customer",
          decision: "payout",
          recipientName: asTrimmedString(dispute.customerName) || "Customer",
          counterpartName: asTrimmedString(dispute.vendorBusinessName) || "Vendor",
          listingTitle: payoutListingTitle,
          eventDate: payoutEventDate,
          serverUrl: serverUrlPayout,
        }).catch(() => {});
      }
      if (dispute.vendorEmail) {
        sendDisputeResolvedEmail(dispute.vendorEmail, {
          role: "vendor",
          decision: "payout",
          recipientName: asTrimmedString(dispute.vendorBusinessName) || "Vendor",
          counterpartName: asTrimmedString(dispute.customerName) || "Customer",
          listingTitle: payoutListingTitle,
          eventDate: payoutEventDate,
          serverUrl: serverUrlPayout,
        }).catch(() => {});
      }

      return res.json({
        disputeId: caseId,
        bookingId: resolvedBookingId,
        decision: "payout",
        payoutResult,
        resolvedAt: now,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return res.status(500).json({ error: "Unable to resolve dispute" });
    }
  });

  // ============================================
  // ADMIN ANALYTICS ENDPOINTS (unchanged)
  // ============================================


  app.post("/api/admin/chat/cleanup-expired", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const result = await cleanupExpiredStreamChannels();
      return res.json(result);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/admin/stats/users", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const [totalUsersResult] = await db.select({ count: count() }).from(users);
      const totalUsers = totalUsersResult.count;

      const [totalVendorsResult] = await db.select({ count: count() }).from(vendorAccounts);
      const totalVendors = totalVendorsResult.count;

      // Count distinct vendor accounts per listing category (categories live on listings now)
      const vendorsByTypeRows = await db.execute(drizzleSql`
        SELECT
          COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised') AS category,
          COUNT(DISTINCT account_id)::int                        AS count
        FROM vendor_listings
        WHERE status != 'deleted'
        GROUP BY 1
        ORDER BY count DESC
      `);
      const vendorsByType = extractRows<{ category: string; count: number }>(vendorsByTypeRows).map(
        (r) => ({ category: r.category, count: Number(r.count) })
      );

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const userGrowth = await db
        .select({
          date: drizzleSql<string>`DATE(${users.createdAt})`,
          count: count(),
        })
        .from(users)
        .where(gte(users.createdAt, thirtyDaysAgo))
        .groupBy(drizzleSql`DATE(${users.createdAt})`)
        .orderBy(drizzleSql`DATE(${users.createdAt})`);

      res.json({
        totalUsers,
        totalVendors,
        vendorsByType,
        userGrowth,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/admin/stats/listings", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      // Exclude soft-deleted listings from all counts
      const notDeleted = drizzleSql`${vendorListings.status} != 'deleted'`;

      const [totalListingsResult] = await db
        .select({ count: count() })
        .from(vendorListings)
        .where(notDeleted);
      const totalListings = totalListingsResult.count;

      const [activeListingsResult] = await db
        .select({ count: count() })
        .from(vendorListings)
        .where(eq(vendorListings.status, "active"));
      const activeListings = activeListingsResult.count;

      const [draftListingsResult] = await db
        .select({ count: count() })
        .from(vendorListings)
        .where(eq(vendorListings.status, "draft"));
      const draftListings = draftListingsResult.count;

      const [inactiveListingsResult] = await db
        .select({ count: count() })
        .from(vendorListings)
        .where(eq(vendorListings.status, "inactive"));
      const inactiveListings = inactiveListingsResult.count;

      // Group by the listing's own category (Rentals, Services, Venues, Catering)
      // rather than the vendor profile's legacy service_type field
      const listingsByTypeRows = await db.execute(drizzleSql`
        SELECT
          COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised') AS category,
          COUNT(*)::int                                          AS count
        FROM vendor_listings
        WHERE status != 'deleted'
        GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised')
        ORDER BY count DESC
      `);

      const listingsByType = extractRows<{ category: string; count: number }>(listingsByTypeRows).map(
        (r) => ({ category: r.category, count: Number(r.count) })
      );

      // Subcategory breakdown (active listings only, grouped by category → subcategory → detail)
      const subcatRows = await db.execute(drizzleSql`
        SELECT
          COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised')       AS category,
          COALESCE(NULLIF(TRIM(subcategory), ''), 'Uncategorised')     AS subcategory,
          COALESCE(NULLIF(TRIM(subcategory_detail), ''), NULL)         AS subcategory_detail,
          COUNT(*)::int                                                AS count
        FROM vendor_listings
        WHERE status = 'active'
          AND TRIM(COALESCE(category, '')) != ''
          AND TRIM(COALESCE(subcategory, '')) != ''
        GROUP BY 1, 2, 3
        ORDER BY 1, count DESC
      `);

      type SubcatStatRow = { category: string; subcategory: string; subcategory_detail: string | null; count: number };
      const subcatTyped = extractRows<SubcatStatRow>(subcatRows);

      // Shape: { Rentals: { subcategories: [{ name, count, details: [{ name, count }] }] }, ... }
      const subcatByCategory: Record<string, { name: string; count: number; details: { name: string; count: number }[] }[]> = {};
      for (const row of subcatTyped) {
        if (!subcatByCategory[row.category]) subcatByCategory[row.category] = [];
        let subEntry = subcatByCategory[row.category].find((s) => s.name === row.subcategory);
        if (!subEntry) {
          subEntry = { name: row.subcategory, count: 0, details: [] };
          subcatByCategory[row.category].push(subEntry);
        }
        subEntry.count += Number(row.count);
        if (row.subcategory_detail) {
          subEntry.details.push({ name: row.subcategory_detail, count: Number(row.count) });
        }
      }

      res.json({
        totalListings,
        listingsByType,
        subcatByCategory,
        activeListings,
        draftListings,
        inactiveListings,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/admin/stats/bookings", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const [totalBookingsResult] = await db.select({ count: count() }).from(bookings);
      const totalBookings = totalBookingsResult.count;

      const [completedCount] = await db.select({ count: count() }).from(bookings).where(eq(bookings.status, "completed"));

      const [pendingCount] = await db.select({ count: count() }).from(bookings).where(eq(bookings.status, "pending"));

      const [revenueResult] = await db.select({ total: sum(bookings.totalAmount) }).from(bookings);
      const totalRevenueCents = Number(revenueResult.total || 0);
      const [feesResult] = await db
        .select({
          platformFeeTotal: sum(bookings.platformFee),
          vendorPayoutTotal: sum(bookings.vendorPayout),
          totalAmount: sum(bookings.totalAmount),
        })
        .from(bookings);

      const platformFeeTotal = Number(feesResult.platformFeeTotal || 0);
      const vendorPayoutTotal = Number(feesResult.vendorPayoutTotal || 0);
      const totalAmountValue = Number(feesResult.totalAmount || 0);
      const customerFeeTotal = Math.max(0, totalAmountValue - (platformFeeTotal + vendorPayoutTotal));
      const totalFeeEarnings = platformFeeTotal + customerFeeTotal;

      res.json({
        totalBookings,
        completedBookings: completedCount.count,
        pendingBookings: pendingCount.count,
        totalRevenue: totalRevenueCents / 100,
        platformFeeTotal: platformFeeTotal / 100,
        customerFeeTotal: customerFeeTotal / 100,
        totalFeeEarnings: totalFeeEarnings / 100,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/admin/stats/chat-flags", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      await ensureModerationTable();

      const result: any = await db.execute(drizzleSql`
        select
          f.actor_type as "actorType",
          f.actor_id as "actorId",
          count(*)::int as "flagCount",
          max(f.created_at) as "lastFlaggedAt",
          (
            array_agg(f.reason order by f.created_at desc)
          )[1] as "latestReason",
          (
            array_agg(f.sample_text order by f.created_at desc)
          )[1] as "latestSampleText",
          case
            when f.actor_type = 'vendor'
              then coalesce(nullif(va.business_name, ''), 'Vendor')
            else coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer')
          end as "displayName",
          case
            when f.actor_type = 'vendor'
              then va.email
            else u.email
          end as "email"
        from chat_moderation_flags f
        left join vendor_accounts va
          on f.actor_type = 'vendor'
         and va.id = f.actor_id
        left join users u
          on f.actor_type = 'customer'
         and u.id = f.actor_id
        group by f.actor_type, f.actor_id, va.business_name, va.email, u.display_name, u.name, u.email
        order by count(*) desc, max(f.created_at) desc
        limit 100
      `);

      const rows = extractRows<any>(result).map((row) => ({
        actorType: row?.actorType === "vendor" ? "vendor" : "customer",
        actorId: String(row?.actorId || ""),
        displayName: String(row?.displayName || (row?.actorType === "vendor" ? "Vendor" : "Customer")),
        email: row?.email ? String(row.email) : null,
        flagCount: Number(row?.flagCount || 0),
        lastFlaggedAt: row?.lastFlaggedAt || null,
        latestReason: row?.latestReason ? String(row.latestReason) : null,
        latestSampleText: row?.latestSampleText ? String(row.latestSampleText) : null,
      }));

      return res.json(rows);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/admin/stats/traffic", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const excludeInternal = req.query.excludeInternal === "true";

      const ownerFilter = excludeInternal
        ? drizzleSql`${webTraffic.userId} IS NOT NULL AND ${webTraffic.userId} NOT IN (SELECT id FROM users WHERE email IN ('johnsbom000@gmail.com', 'boman@griffjohnson.com', 'cassidymalm21@gmail.com', 'eventhubglobal@gmail.com'))`
        : drizzleSql`${webTraffic.userId} IS NOT NULL`;

      const [totalVisitsResult] = await db
        .select({ count: count() })
        .from(webTraffic)
        .where(ownerFilter);
      const totalVisits = totalVisitsResult.count;

      const [uniqueVisitorsResult] = await db
        .select({
          count: drizzleSql<number>`COUNT(DISTINCT ${webTraffic.userId})`,
        })
        .from(webTraffic)
        .where(ownerFilter);
      const uniqueVisitors = uniqueVisitorsResult.count;

      const topPaths = await db
        .select({
          path: webTraffic.path,
          count: count(),
        })
        .from(webTraffic)
        .where(ownerFilter)
        .groupBy(webTraffic.path)
        .orderBy(desc(count()))
        .limit(10);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyTraffic = await db
        .select({
          date: drizzleSql<string>`DATE(${webTraffic.timestamp})`,
          count: count(),
        })
        .from(webTraffic)
        .where(and(gte(webTraffic.timestamp, thirtyDaysAgo), ownerFilter))
        .groupBy(drizzleSql`DATE(${webTraffic.timestamp})`)
        .orderBy(drizzleSql`DATE(${webTraffic.timestamp})`);

      res.json({
        totalVisits,
        uniqueVisitors,
        topPaths,
        dailyTraffic,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // ── Booking stats: full status breakdown ─────────────────────────────────
  app.get("/api/admin/stats/bookings/detail", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const statusCounts = await db.execute(drizzleSql`
        SELECT status, COUNT(*)::int AS count
        FROM bookings
        GROUP BY status
      `);
      const disputeCount = await db.execute(drizzleSql`
        SELECT COUNT(*)::int AS count
        FROM dispute_cases
        WHERE status != 'resolved'
      `);
      const avgRows = await db.execute(drizzleSql`
        SELECT
          ROUND(AVG(total_amount))::int            AS avg_booking_value_cents,
          COUNT(*)::int                            AS total_non_cancelled,
          COUNT(DISTINCT vendor_account_id)::int   AS active_vendors
        FROM bookings
        WHERE status NOT IN ('cancelled', 'failed', 'expired')
      `);

      const statusMap: Record<string, number> = {};
      for (const row of extractRows<{ status: string; count: number }>(statusCounts)) {
        statusMap[row.status] = Number(row.count);
      }
      const avg = extractRows<{ avg_booking_value_cents: number; total_non_cancelled: number; active_vendors: number }>(avgRows)[0];
      const openDisputes = Number(extractRows<{ count: number }>(disputeCount)[0]?.count ?? 0);

      return res.json({
        byStatus: statusMap,
        openDisputes,
        avgBookingValueCents: Number(avg?.avg_booking_value_cents ?? 0),
        totalNonCancelled: Number(avg?.total_non_cancelled ?? 0),
        activeVendors: Number(avg?.active_vendors ?? 0),
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // ── Revenue analytics: daily, monthly, annual, by service type ──────────
  app.get("/api/admin/stats/revenue", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      // Daily — last 30 days
      const dailyRows = await db.execute(drizzleSql`
        SELECT
          DATE(b.created_at)                    AS date,
          SUM(b.total_amount)::bigint           AS revenue_cents,
          SUM(b.platform_fee_amount)::bigint    AS platform_fee_cents,
          COUNT(*)::int                         AS booking_count
        FROM bookings b
        WHERE b.created_at >= NOW() - INTERVAL '30 days'
          AND b.status NOT IN ('cancelled', 'failed', 'expired')
        GROUP BY DATE(b.created_at)
        ORDER BY date ASC
      `);

      // Monthly — last 12 months
      const monthlyRows = await db.execute(drizzleSql`
        SELECT
          DATE_TRUNC('month', b.created_at)     AS month,
          SUM(b.total_amount)::bigint           AS revenue_cents,
          SUM(b.platform_fee_amount)::bigint    AS platform_fee_cents,
          COUNT(*)::int                         AS booking_count
        FROM bookings b
        WHERE b.created_at >= DATE_TRUNC('month', NOW() - INTERVAL '11 months')
          AND b.status NOT IN ('cancelled', 'failed', 'expired')
        GROUP BY DATE_TRUNC('month', b.created_at)
        ORDER BY month ASC
      `);

      // Annual totals — this year vs last year
      const annualRows = await db.execute(drizzleSql`
        SELECT
          EXTRACT(YEAR FROM b.created_at)::int  AS year,
          SUM(b.total_amount)::bigint           AS revenue_cents,
          SUM(b.platform_fee_amount)::bigint    AS platform_fee_cents,
          COUNT(*)::int                         AS booking_count
        FROM bookings b
        WHERE b.status NOT IN ('cancelled', 'failed', 'expired')
          AND b.created_at >= DATE_TRUNC('year', NOW() - INTERVAL '1 year')
        GROUP BY EXTRACT(YEAR FROM b.created_at)
        ORDER BY year ASC
      `);

      // By listing category (category lives on the listing, not the vendor profile)
      const byTypeRows = await db.execute(drizzleSql`
        SELECT
          COALESCE(NULLIF(TRIM(vl.category), ''), 'Uncategorised') AS service_type,
          COUNT(b.id)::int                                          AS booking_count,
          SUM(b.total_amount)::bigint                               AS revenue_cents,
          ROUND(AVG(b.total_amount))::int                           AS avg_booking_value_cents,
          COUNT(DISTINCT b.vendor_account_id)::int                  AS vendor_count,
          ROUND(
            COUNT(b.id)::numeric
            / NULLIF(COUNT(DISTINCT b.vendor_account_id), 0)
            / GREATEST(
                EXTRACT(EPOCH FROM (NOW() - MIN(b.created_at))) / 2592000.0,
                1
              ),
            2
          )::numeric                                                AS avg_bookings_per_vendor_per_month
        FROM bookings b
        LEFT JOIN vendor_listings vl ON vl.id = b.listing_id
        WHERE b.status NOT IN ('cancelled', 'failed', 'expired')
        GROUP BY 1
        ORDER BY revenue_cents DESC NULLS LAST
      `);

      // Overall average booking value
      const overallRows = await db.execute(drizzleSql`
        SELECT
          ROUND(AVG(total_amount))::int         AS avg_booking_value_cents,
          COUNT(DISTINCT vendor_account_id)::int AS vendor_count,
          COUNT(*)::int                         AS booking_count,
          ROUND(
            COUNT(*)::numeric
            / NULLIF(COUNT(DISTINCT vendor_account_id), 0)
            / GREATEST(
                EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 2592000.0,
                1
              ),
            2
          )::numeric AS avg_bookings_per_vendor_per_month
        FROM bookings
        WHERE status NOT IN ('cancelled', 'failed', 'expired')
      `);

      const overall = extractRows<any>(overallRows)[0] ?? {};

      // Compute projection: avg of last 3 full months × remaining months in year
      const monthly = extractRows<any>(monthlyRows).map((r) => ({
        month: String(r.month ?? "").slice(0, 7),
        revenueCents: Number(r.revenue_cents ?? 0),
        platformFeeCents: Number(r.platform_fee_cents ?? 0),
        bookingCount: Number(r.booking_count ?? 0),
      }));

      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const fullMonths = monthly.filter((m) => m.month < currentMonth);
      const last3 = fullMonths.slice(-3);
      const avgMonthlyRevenue = last3.length
        ? last3.reduce((s, m) => s + m.revenueCents, 0) / last3.length
        : 0;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      const currentMonthData = monthly.find((m) => m.month === currentMonth);
      const projectedCurrentMonth =
        currentMonthData
          ? Math.round((currentMonthData.revenueCents / dayOfMonth) * daysInMonth)
          : Math.round(avgMonthlyRevenue);
      const remainingMonths = 12 - (now.getMonth() + 1);
      const ytdRevenue = extractRows<any>(annualRows).find(
        (r) => Number(r.year) === now.getFullYear()
      );
      const projectedAnnual = Math.round(
        Number(ytdRevenue?.revenue_cents ?? 0) + remainingMonths * avgMonthlyRevenue
      );

      return res.json({
        daily: extractRows<any>(dailyRows).map((r) => ({
          date: String(r.date ?? "").slice(0, 10),
          revenueCents: Number(r.revenue_cents ?? 0),
          platformFeeCents: Number(r.platform_fee_cents ?? 0),
          bookingCount: Number(r.booking_count ?? 0),
        })),
        monthly,
        annual: extractRows<any>(annualRows).map((r) => ({
          year: Number(r.year),
          revenueCents: Number(r.revenue_cents ?? 0),
          platformFeeCents: Number(r.platform_fee_cents ?? 0),
          bookingCount: Number(r.booking_count ?? 0),
        })),
        projections: {
          currentMonthCents: projectedCurrentMonth,
          annualCents: projectedAnnual,
          avgMonthlyRevenueCents: Math.round(avgMonthlyRevenue),
        },
        byServiceType: extractRows<any>(byTypeRows).map((r) => ({
          serviceType: String(r.service_type ?? "Unknown"),
          bookingCount: Number(r.booking_count ?? 0),
          revenueCents: Number(r.revenue_cents ?? 0),
          avgBookingValueCents: Number(r.avg_booking_value_cents ?? 0),
          vendorCount: Number(r.vendor_count ?? 0),
          avgBookingsPerVendorPerMonth: Number(r.avg_bookings_per_vendor_per_month ?? 0),
        })),
        overall: {
          avgBookingValueCents: Number(overall.avg_booking_value_cents ?? 0),
          vendorCount: Number(overall.vendor_count ?? 0),
          bookingCount: Number(overall.booking_count ?? 0),
          avgBookingsPerVendorPerMonth: Number(overall.avg_bookings_per_vendor_per_month ?? 0),
        },
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // GET /api/admin/feedback — list all feedback submissions, newest first
  app.get("/api/admin/feedback", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const rows = await db
        .select()
        .from(feedbackSubmissions)
        .orderBy(desc(feedbackSubmissions.createdAt));
      return res.json(rows);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/feedback/:id/flag — toggle the flagged state
  app.post("/api/admin/feedback/:id/flag", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const id = req.params.id?.trim();
      if (!id) return res.status(400).json({ error: "id required" });

      const [existing] = await db
        .select({ id: feedbackSubmissions.id, flagged: feedbackSubmissions.flagged })
        .from(feedbackSubmissions)
        .where(eq(feedbackSubmissions.id, id))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Not found" });

      const nowFlagged = !existing.flagged;
      await db
        .update(feedbackSubmissions)
        .set({ flagged: nowFlagged, flaggedAt: nowFlagged ? new Date() : null })
        .where(eq(feedbackSubmissions.id, id));

      return res.json({ flagged: nowFlagged });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // ── Platform Health Monitor ────────────────────────────────────────────────

  // GET /api/admin/health — returns stale/actionable records grouped by category
  app.get("/api/admin/health", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      // Threshold constants (milliseconds → SQL interval strings)
      const STALE_BOOKING_HOURS = 6;   // pending booking with no vendor response
      const STALE_MESSAGE_HOURS = 4;   // unread message sitting in a conversation
      const STALE_PAYOUT_HOURS  = 48;  // payout eligible but not transferred

      // ── 1. Stale pending bookings ──────────────────────────────────────────
      // Pending bookings the vendor has not yet accepted/declined, older than threshold
      const staleBookings = await db.execute(drizzleSql`
        SELECT
          b.id,
          b.status,
          b.created_at,
          b.event_date,
          b.event_start_time,
          b.total_amount,
          b.listing_title_snapshot,
          va.business_name AS vendor_name,
          va.email         AS vendor_email,
          u.name           AS customer_name,
          u.email          AS customer_email,
          EXTRACT(EPOCH FROM (NOW() - b.created_at)) / 3600 AS hours_waiting
        FROM bookings b
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        LEFT JOIN users u            ON u.id  = b.customer_id
        WHERE b.status = 'pending'
          AND b.created_at < NOW() - (${STALE_BOOKING_HOURS} || ' hours')::interval
        ORDER BY b.created_at ASC
        LIMIT 100
      `);

      // ── 2. Unread messages ─────────────────────────────────────────────────
      // Conversations with at least one unread message older than threshold,
      // in active (pending | confirmed) bookings
      const unreadMessages = await db.execute(drizzleSql`
        SELECT
          m.booking_id,
          COUNT(*)                                           AS unread_count,
          MIN(m.created_at)                                  AS oldest_unread_at,
          EXTRACT(EPOCH FROM (NOW() - MIN(m.created_at))) / 3600 AS hours_waiting,
          b.status                                           AS booking_status,
          b.listing_title_snapshot,
          va.business_name AS vendor_name,
          va.email         AS vendor_email,
          u.name           AS customer_name,
          u.email          AS customer_email
        FROM messages m
        JOIN bookings b ON b.id = m.booking_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        LEFT JOIN users u            ON u.id  = b.customer_id
        WHERE m.read = false
          AND m.created_at < NOW() - (${STALE_MESSAGE_HOURS} || ' hours')::interval
          AND b.status IN ('pending', 'confirmed')
        GROUP BY m.booking_id, b.status, b.listing_title_snapshot,
                 va.business_name, va.email, u.name, u.email
        ORDER BY oldest_unread_at ASC
        LIMIT 100
      `);

      // ── 3. Stale eligible payouts ──────────────────────────────────────────
      // Payments that are eligible for payout but haven't been transferred
      const stalePayouts = await db.execute(drizzleSql`
        SELECT
          p.id,
          p.booking_id,
          p.payout_status,
          p.payout_eligible_at,
          p.vendor_net_payout_amount,
          p.total_amount,
          EXTRACT(EPOCH FROM (NOW() - p.payout_eligible_at)) / 3600 AS hours_waiting,
          b.listing_title_snapshot,
          b.event_date,
          va.business_name AS vendor_name,
          va.email         AS vendor_email
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        LEFT JOIN vendor_accounts va ON va.id = p.vendor_account_id
        WHERE p.payout_status = 'eligible'
          AND p.payout_eligible_at < NOW() - (${STALE_PAYOUT_HOURS} || ' hours')::interval
        ORDER BY p.payout_eligible_at ASC
        LIMIT 100
      `);

      // ── 4. Suspected double bookings ───────────────────────────────────────
      // Two or more active bookings for the same listing with overlapping time windows.
      // The system prevents these at creation time, so this is a canary — should always be empty.
      const doubleBookings = await db.execute(drizzleSql`
        SELECT
          a.id            AS booking_a_id,
          b2.id           AS booking_b_id,
          a.listing_id,
          a.listing_title_snapshot,
          a.status        AS status_a,
          b2.status       AS status_b,
          a.booking_start_at AS start_a,
          a.booking_end_at   AS end_a,
          b2.booking_start_at AS start_b,
          b2.booking_end_at   AS end_b,
          va.business_name AS vendor_name,
          va.email         AS vendor_email
        FROM bookings a
        JOIN bookings b2
          ON  b2.listing_id = a.listing_id
          AND b2.id > a.id
          AND b2.status IN ('pending', 'confirmed')
          AND b2.booking_start_at < a.booking_end_at
          AND b2.booking_end_at   > a.booking_start_at
        LEFT JOIN vendor_accounts va ON va.id = a.vendor_account_id
        WHERE a.status IN ('pending', 'confirmed')
        ORDER BY a.booking_start_at ASC
        LIMIT 50
      `);

      return res.json({
        thresholds: {
          staleBookingHours: STALE_BOOKING_HOURS,
          staleMessageHours: STALE_MESSAGE_HOURS,
          stalePayoutHours:  STALE_PAYOUT_HOURS,
        },
        staleBookings:  staleBookings.rows,
        unreadMessages: unreadMessages.rows,
        stalePayouts:   stalePayouts.rows,
        doubleBookings: doubleBookings.rows,
        summary: {
          staleBookingsCount:  staleBookings.rows.length,
          unreadMessagesCount: unreadMessages.rows.length,
          stalePayoutsCount:   stalePayouts.rows.length,
          doubleBookingsCount: doubleBookings.rows.length,
          totalAlerts:
            staleBookings.rows.length +
            unreadMessages.rows.length +
            stalePayouts.rows.length +
            doubleBookings.rows.length,
        },
      });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // ── Founding Vendor Admin Endpoints ────────────────────────────────────────

  // GET /api/admin/vendors/search?q= — search vendor accounts by name or email
  app.get("/api/admin/vendors/search", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const q = asTrimmedString(req.query.q);
      if (!q || q.length < 2) return res.json({ vendors: [] });

      const rows = await db
        .select({
          id: vendorAccounts.id,
          businessName: vendorAccounts.businessName,
          email: vendorAccounts.email,
          isMarqueeVendor: vendorAccounts.isMarqueeVendor,
          profileComplete: vendorAccounts.profileComplete,
        })
        .from(vendorAccounts)
        .where(
          and(
            isNull(vendorAccounts.deletedAt),
            eq(vendorAccounts.active, true),
            or(
              drizzleSql`lower(${vendorAccounts.businessName}) like ${"%" + q.toLowerCase() + "%"}`,
              drizzleSql`lower(${vendorAccounts.email}) like ${"%" + q.toLowerCase() + "%"}`
            )
          )
        )
        .orderBy(asc(vendorAccounts.businessName))
        .limit(10);

      return res.json({ vendors: rows });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/admin/marquee-vendors/stats
  app.get("/api/admin/marquee-vendors/stats", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const [stats] = await db
        .select({
          spotsUsed: drizzleSql<number>`count(*) filter (where ${vendorAccounts.isMarqueeVendor} = true)::int`,
          totalHolidayBookingsUsed: drizzleSql<number>`coalesce(sum(${vendorAccounts.marqueeHolidayBookingsUsed}) filter (where ${vendorAccounts.isMarqueeVendor} = true), 0)::int`,
        })
        .from(vendorAccounts)
        .where(isNull(vendorAccounts.deletedAt));

      // Return the single canonical invite regardless of active state so the admin can see and toggle it
      const [invite] = await db
        .select({
          token: marqueeVendorInvites.token,
          active: marqueeVendorInvites.active,
          redemptionCount: marqueeVendorInvites.redemptionCount,
        })
        .from(marqueeVendorInvites)
        .orderBy(desc(marqueeVendorInvites.createdAt))
        .limit(1);

      const inviteUrl = invite
        ? `${appUrl()}/vendor/onboarding?mv=${invite.token}`
        : null;

      return res.json({
        spotsUsed: stats?.spotsUsed ?? 0,
        spotsRemaining: MARQUEE_VENDOR_MAX_SPOTS - (stats?.spotsUsed ?? 0),
        totalHolidayBookingsUsed: stats?.totalHolidayBookingsUsed ?? 0,
        inviteToken: invite?.token ?? null,
        inviteUrl,
        inviteActive: invite?.active ?? false,
        redemptionCount: invite?.redemptionCount ?? 0,
      });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/admin/marquee-vendors — list all marquee vendors
  app.get("/api/admin/marquee-vendors", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const rows = await db
        .select({
          id: vendorAccounts.id,
          businessName: vendorAccounts.businessName,
          email: vendorAccounts.email,
          marqueeVendorNumber: vendorAccounts.marqueeVendorNumber,
          marqueeHolidayBookingsUsed: vendorAccounts.marqueeHolidayBookingsUsed,
          marqueeHolidayBonusBookings: vendorAccounts.marqueeHolidayBonusBookings,
          marqueeActivatedAt: vendorAccounts.marqueeActivatedAt,
          marqueeHolidayEndsAt: vendorAccounts.marqueeHolidayEndsAt,
          marqueeRateEndsAt: vendorAccounts.marqueeRateEndsAt,
          referralCode: vendorAccounts.referralCode,
          createdAt: vendorAccounts.createdAt,
        })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.isMarqueeVendor, true), isNull(vendorAccounts.deletedAt)))
        .orderBy(asc(vendorAccounts.marqueeVendorNumber));
      return res.json({ marqueeVendors: rows });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/marquee-vendors/:vendorId/grant — grant marquee status
  app.post("/api/admin/marquee-vendors/:vendorId/grant", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const { vendorId } = req.params;

      // All reads and the UPDATE run inside a SERIALIZABLE transaction so that
      // two concurrent admin requests cannot both pass the cap check and both
      // write the same marqueeVendorNumber.  Early-exit conditions are captured
      // in `txError` so we can respond after the transaction commits.
      let txError: { status: number; body: object } | null = null;
      let txResult: { marqueeVendorNumber: number; referralCode: string } | null = null;

      await db.transaction(async (tx) => {
        const [countRow] = await tx
          .select({ count: drizzleSql<number>`count(*)::int` })
          .from(vendorAccounts)
          .where(and(eq(vendorAccounts.isMarqueeVendor, true), isNull(vendorAccounts.deletedAt)));
        const currentCount = countRow?.count ?? 0;
        if (currentCount >= MARQUEE_VENDOR_MAX_SPOTS) {
          txError = { status: 400, body: { error: `All ${MARQUEE_VENDOR_MAX_SPOTS} Marquee Vendor spots are filled.`, code: "marquee_vendor_cap_reached" } };
          return;
        }

        const [vendor] = await tx
          .select({ id: vendorAccounts.id, isMarqueeVendor: vendorAccounts.isMarqueeVendor })
          .from(vendorAccounts)
          .where(and(eq(vendorAccounts.id, vendorId), isNull(vendorAccounts.deletedAt), eq(vendorAccounts.active, true)))
          .limit(1);
        if (!vendor) { txError = { status: 404, body: { error: "Vendor not found or not active" } }; return; }
        if (vendor.isMarqueeVendor) { txError = { status: 400, body: { error: "Vendor is already a Marquee Vendor" } }; return; }

        const nextSlot = currentCount + 1;
        let referralCode: string | undefined;
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = crypto.randomBytes(6).toString("hex").toUpperCase();
          const [existing] = await tx
            .select({ id: vendorAccounts.id })
            .from(vendorAccounts)
            .where(eq(vendorAccounts.referralCode, candidate))
            .limit(1);
          if (!existing) { referralCode = candidate; break; }
        }
        if (!referralCode) { txError = { status: 500, body: { error: "Could not generate a unique referral code. Please try again." } }; return; }

        await tx
          .update(vendorAccounts)
          .set({ isMarqueeVendor: true, marqueeVendorNumber: nextSlot, referralCode })
          .where(eq(vendorAccounts.id, vendorId));

        txResult = { marqueeVendorNumber: nextSlot, referralCode };
      }, { isolationLevel: "serializable" });

      if (txError) return res.status((txError as any).status).json((txError as any).body);
      if (!txResult) return res.status(500).json({ error: "Internal server error" });
      return res.json({ success: true, ...(txResult as any) });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/marquee-vendors/:vendorId/revoke — revoke marquee status
  app.post("/api/admin/marquee-vendors/:vendorId/revoke", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const { vendorId } = req.params;
      const [vendor] = await db
        .select({ id: vendorAccounts.id, isMarqueeVendor: vendorAccounts.isMarqueeVendor })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.id, vendorId), isNull(vendorAccounts.deletedAt)))
        .limit(1);
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });
      if (!vendor.isMarqueeVendor) return res.status(400).json({ error: "Vendor is not a Marquee Vendor" });

      await db
        .update(vendorAccounts)
        .set({ isMarqueeVendor: false, marqueeVendorNumber: null })
        .where(eq(vendorAccounts.id, vendorId));

      return res.json({ success: true });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/marquee-vendors/toggle-link — enable or disable the invite link
  app.post("/api/admin/marquee-vendors/toggle-link", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const { active } = req.body as { active: boolean };

      // Fetch the canonical invite (most recent)
      const [invite] = await db
        .select({ id: marqueeVendorInvites.id, token: marqueeVendorInvites.token })
        .from(marqueeVendorInvites)
        .orderBy(desc(marqueeVendorInvites.createdAt))
        .limit(1);

      if (!invite) {
        // No token exists yet — seed the first one (active or inactive per request)
        const token = crypto.randomBytes(16).toString("hex");
        await db.insert(marqueeVendorInvites).values({ token, active: Boolean(active) });
      } else {
        await db
          .update(marqueeVendorInvites)
          .set({ active: Boolean(active) })
          .where(eq(marqueeVendorInvites.id, invite.id));
      }

      return res.json({ success: true });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/jobs/run-completion — manually fire the booking auto-completion job
  app.post("/api/admin/jobs/run-completion", adminRateLimiter, requireAdminAuth, async (_req: any, res: any) => {
    try {
      const completed = await runBookingCompletionJob();
      return res.json({ completed });
    } catch (err: any) {
      return respondWithInternalServerError(_req, res, err);
    }
  });

  // POST /api/admin/jobs/run-deposit-refund — manually fire the security deposit auto-refund job
  app.post("/api/admin/jobs/run-deposit-refund", adminRateLimiter, requireAdminAuth, async (_req: any, res: any) => {
    try {
      const refunded = await runSecurityDepositRefundJob();
      return res.json({ refunded });
    } catch (err: any) {
      return respondWithInternalServerError(_req, res, err);
    }
  });

  // GET /api/admin/marquee-invites — list invitation history
  app.get("/api/admin/marquee-invites", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const rows = await db
        .select()
        .from(marqueeEmailInvites)
        .orderBy(desc(marqueeEmailInvites.sentAt))
        .limit(200);
      return res.json({ invites: rows });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/marquee-invite — send invitation emails
  app.post("/api/admin/marquee-invite", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const raw: unknown = req.body?.emails;
      if (!Array.isArray(raw) || raw.length === 0) {
        return res.status(400).json({ error: "emails must be a non-empty array" });
      }
      const emails: string[] = [...new Set(
        raw
          .map((e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )];
      if (emails.length === 0) {
        return res.status(400).json({ error: "No valid email addresses provided" });
      }

      const adminEmail = (req.adminAuth as { email?: string } | undefined)?.email ?? null;

      // Skip emails that were already successfully sent
      const alreadySentRows = await db
        .select({ email: marqueeEmailInvites.email })
        .from(marqueeEmailInvites)
        .where(and(inArray(marqueeEmailInvites.email, emails), eq(marqueeEmailInvites.accepted, true)));
      const alreadySent = new Set(alreadySentRows.map((r) => r.email));
      const toSend = emails.filter((e) => !alreadySent.has(e));

      const [activeInvite] = await db
        .select({ token: marqueeVendorInvites.token })
        .from(marqueeVendorInvites)
        .where(eq(marqueeVendorInvites.active, true))
        .orderBy(desc(marqueeVendorInvites.createdAt))
        .limit(1);

      const results: { email: string; sent: boolean }[] = [];
      for (let i = 0; i < toSend.length; i += 4) {
        const batch = toSend.slice(i, i + 4);
        const batchResults = await Promise.all(
          batch.map(async (email) => {
            const result = await sendMarqueeInviteEmail(email, {
              recipientEmail: email,
              inviteToken: activeInvite?.token,
            });
            // Update existing failed record if one exists, otherwise insert
            const [existing] = await db
              .select({ id: marqueeEmailInvites.id })
              .from(marqueeEmailInvites)
              .where(and(eq(marqueeEmailInvites.email, email), eq(marqueeEmailInvites.accepted, false)))
              .orderBy(desc(marqueeEmailInvites.sentAt))
              .limit(1);
            if (existing) {
              await db.update(marqueeEmailInvites)
                .set({ accepted: result.sent, sentAt: new Date(), sentBy: adminEmail })
                .where(eq(marqueeEmailInvites.id, existing.id));
            } else {
              await db.insert(marqueeEmailInvites).values({ email, sentBy: adminEmail, accepted: result.sent });
            }
            return { email, ...result };
          })
        );
        results.push(...batchResults);
        if (i + 4 < toSend.length) await new Promise((r) => setTimeout(r, 1100));
      }

      return res.json({ results });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // ── Founding Vendor Admin Endpoints ──────────────────────────────────────────

  // GET /api/admin/founding-vendors/stats
  app.get("/api/admin/founding-vendors/stats", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const [stats] = await db
        .select({
          spotsUsed: drizzleSql<number>`count(*) filter (where ${vendorAccounts.isFoundingVendor} = true)::int`,
          totalHolidayBookingsUsed: drizzleSql<number>`coalesce(sum(${vendorAccounts.foundingBenefitBookingsUsed}) filter (where ${vendorAccounts.isFoundingVendor} = true), 0)::int`,
        })
        .from(vendorAccounts)
        .where(isNull(vendorAccounts.deletedAt));

      // Return the single canonical invite regardless of active state so the admin can see and toggle it
      const [invite] = await db
        .select({
          token: foundingVendorInvites.token,
          active: foundingVendorInvites.active,
          redemptionCount: foundingVendorInvites.redemptionCount,
        })
        .from(foundingVendorInvites)
        .orderBy(desc(foundingVendorInvites.createdAt))
        .limit(1);

      const spotsUsed = stats?.spotsUsed ?? 0;
      const inviteUrl = invite
        ? `${appUrl()}/vendor/onboarding?fv=${invite.token}`
        : null;

      return res.json({
        spotsUsed,
        totalHolidayBookingsUsed: stats?.totalHolidayBookingsUsed ?? 0,
        inviteToken: invite?.token ?? null,
        inviteUrl,
        inviteActive: invite?.active ?? false,
        redemptionCount: invite?.redemptionCount ?? 0,
      });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/admin/founding-vendors — list all founding vendors
  app.get("/api/admin/founding-vendors", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const rows = await db
        .select({
          id: vendorAccounts.id,
          businessName: vendorAccounts.businessName,
          email: vendorAccounts.email,
          foundingVendorNumber: vendorAccounts.foundingVendorNumber,
          foundingBenefitBookingsUsed: vendorAccounts.foundingBenefitBookingsUsed,
          foundingReferralBonusBookingsRemaining: vendorAccounts.foundingReferralBonusBookingsRemaining,
          foundingBenefitsActivatedAt: vendorAccounts.foundingBenefitsActivatedAt,
          foundingHolidayEndsAt: vendorAccounts.foundingHolidayEndsAt,
          foundingRateEndsAt: vendorAccounts.foundingRateEndsAt,
          createdAt: vendorAccounts.createdAt,
        })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.isFoundingVendor, true), isNull(vendorAccounts.deletedAt)))
        .orderBy(asc(vendorAccounts.foundingVendorNumber));
      return res.json({ foundingVendors: rows });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/founding-vendors/:vendorId/revoke — revoke founding status
  app.post("/api/admin/founding-vendors/:vendorId/revoke", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const { vendorId } = req.params;
      await db
        .update(vendorAccounts)
        .set({ isFoundingVendor: false, foundingVendorNumber: null })
        .where(and(eq(vendorAccounts.id, vendorId), isNull(vendorAccounts.deletedAt)));
      return res.json({ ok: true });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/admin/founding-vendors/email-invites — list invitation email history
  app.get("/api/admin/founding-vendors/email-invites", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const rows = await db
        .select()
        .from(foundingEmailInvites)
        .orderBy(desc(foundingEmailInvites.sentAt))
        .limit(200);
      return res.json({ invites: rows });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/founding-vendors/send-invites — send founding vendor invitation emails
  app.post("/api/admin/founding-vendors/send-invites", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const raw: unknown = req.body?.emails;
      if (!Array.isArray(raw) || raw.length === 0) {
        return res.status(400).json({ error: "emails must be a non-empty array" });
      }
      const emails: string[] = [...new Set(
        raw
          .map((e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )];
      if (emails.length === 0) {
        return res.status(400).json({ error: "No valid email addresses provided" });
      }

      const adminEmail = (req.adminAuth as { email?: string } | undefined)?.email ?? null;

      // Skip emails that were already successfully sent
      const alreadySentRows = await db
        .select({ email: foundingEmailInvites.email })
        .from(foundingEmailInvites)
        .where(and(inArray(foundingEmailInvites.email, emails), eq(foundingEmailInvites.accepted, true)));
      const alreadySent = new Set(alreadySentRows.map((r) => r.email));
      const toSend = emails.filter((e) => !alreadySent.has(e));

      const [activeInvite] = await db
        .select({ token: foundingVendorInvites.token })
        .from(foundingVendorInvites)
        .where(eq(foundingVendorInvites.active, true))
        .orderBy(desc(foundingVendorInvites.createdAt))
        .limit(1);

      const results: { email: string; sent: boolean }[] = [];
      for (let i = 0; i < toSend.length; i += 4) {
        const batch = toSend.slice(i, i + 4);
        const batchResults = await Promise.all(
          batch.map(async (email) => {
            const result = await sendFoundingVendorInviteEmail(email, {
              recipientEmail: email,
              inviteToken: activeInvite?.token,
            });
            // Update existing failed record if one exists, otherwise insert
            const [existing] = await db
              .select({ id: foundingEmailInvites.id })
              .from(foundingEmailInvites)
              .where(and(eq(foundingEmailInvites.email, email), eq(foundingEmailInvites.accepted, false)))
              .orderBy(desc(foundingEmailInvites.sentAt))
              .limit(1);
            if (existing) {
              await db.update(foundingEmailInvites)
                .set({ accepted: result.sent, sentAt: new Date(), sentBy: adminEmail })
                .where(eq(foundingEmailInvites.id, existing.id));
            } else {
              await db.insert(foundingEmailInvites).values({ email, sentBy: adminEmail, accepted: result.sent });
            }
            return { email, ...result };
          })
        );
        results.push(...batchResults);
        if (i + 4 < toSend.length) await new Promise((r) => setTimeout(r, 1100));
      }

      return res.json({ results });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/founding-vendors/toggle-link — enable or disable the invite link
  app.post("/api/admin/founding-vendors/toggle-link", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const { active } = req.body as { active: boolean };

      // Fetch the canonical invite (most recent)
      const [invite] = await db
        .select({ id: foundingVendorInvites.id, token: foundingVendorInvites.token })
        .from(foundingVendorInvites)
        .orderBy(desc(foundingVendorInvites.createdAt))
        .limit(1);

      if (!invite) {
        // No token exists yet — seed the first one (active or inactive per request)
        const token = crypto.randomBytes(16).toString("hex");
        await db.insert(foundingVendorInvites).values({ token, active: Boolean(active) });
        return res.json({ ok: true, active: Boolean(active) });
      }

      await db
        .update(foundingVendorInvites)
        .set({ active: Boolean(active) })
        .where(eq(foundingVendorInvites.id, invite.id));

      return res.json({ ok: true, active: Boolean(active) });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });
}
