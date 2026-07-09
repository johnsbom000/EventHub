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
  deactivateExtraActiveListingsForFreeTier,
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


/**
 * Resolves the vendor's Stripe Connect account id for a dispute settlement
 * transfer. Prefers the immutable per-payment snapshot
 * (payments.stripe_connected_account_id — survives vendor soft-deletes that
 * null the live column), falling back to the vendor account's live
 * stripe_connect_id. NOTE: vendor_accounts has NO stripe_connected_account_id
 * column — querying it 500s the whole endpoint.
 */
async function resolveVendorConnectedAccountId(
  bookingId: string,
  paymentSnapshotAccountId: string | null | undefined
): Promise<string | null> {
  const snapshot = asTrimmedString(paymentSnapshotAccountId);
  if (snapshot) return snapshot;
  const rows: any = await db.execute(drizzleSql`
    SELECT va.stripe_connect_id AS "connectedAccountId"
    FROM bookings b
    JOIN vendor_accounts va ON va.id = b.vendor_account_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `);
  return asTrimmedString((rows.rows?.[0] as any)?.connectedAccountId) || null;
}

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
          b.platform_fee         AS booking_platform_fee,
          b.vendor_payout        AS vendor_payout_cents,
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
          // Alternative to refundAmountCents, used by the admin "Damage withhold" UI:
          // cents to withhold from the deposit and pay the vendor for damages. The
          // customer refund is derived server-side as (deposit - withheld). Clamped
          // to the deposit amount. Ignored if refundAmountCents is also provided.
          withheldAmountCents: z.number().int().min(0).optional(),
          // Travel-cost-recovery disputes only: cents to award the vendor from the
          // held travel fee (their proven incurred cost). Remainder is refunded to
          // the customer. Capped server-side at the held travel amount.
          travelAwardCents: z.number().int().min(0).optional(),
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

      // ── M11: claim the case before any settlement ──────────────────────────
      // Two admins (or a double-click) can each pass the resolved-check above
      // and both fire Stripe settlements for the same case — a double-settle
      // that can transfer/refund the money twice. CAS the case into a transient
      // 'resolving' state first; the loser matches 0 rows and 409s. 'resolving'
      // counts as an active dispute in payoutEligibility, so the automated
      // payout pipeline stays blocked while a settlement is mid-flight.
      const claimResult = await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'resolving', updated_at = ${now}
        WHERE id = ${activeCaseId} AND status IN ('open', 'pending_review')
        RETURNING id
      `);
      if (claimResult.rows.length === 0) {
        return res.status(409).json({ error: "This dispute is already being resolved" });
      }

      // From here the case is claimed. Every settlement path below ends its
      // final transaction with a guarded UPDATE ... SET status='resolved' WHERE
      // status='resolving' and then sets `disputeClaimSettled = true`. Any other
      // exit — a validation 4xx, a Stripe error, or a thrown exception — must
      // release the claim back to 'open' so the case stays actionable. The
      // finally below does that idempotently: it only fires while the case is
      // still 'resolving', so a completed resolve (now 'resolved') is a no-op.
      let disputeClaimSettled = false;
      try {

      // ── Travel-fee dispute settlement (held travel fee on a cancelled booking) ──
      // On a customer cancellation the travel/delivery fee is held (not refunded)
      // so the vendor can recover real travel costs incurred. Admin awards the
      // vendor's proven cost from the held fee; the remainder is refunded to the
      // customer. The vendor award is paid via a DIRECT authorized transfer
      // (transferToVendor) because the automated payout path correctly refuses
      // cancelled bookings (payoutEligibility cancelled-booking branch). A held
      // travel fee only ever exists on a cancelled booking, so this is mutually
      // exclusive with the deposit-dispute path below.
      const heldTravelRows = await db
        .select({
          id: payments.id,
          stripePaymentIntentId: payments.stripePaymentIntentId,
          stripeChargeId: payments.stripeChargeId,
          stripeConnectedAccountId: payments.stripeConnectedAccountId,
          amount: payments.amount,
          refundAmount: payments.refundAmount,
          status: payments.status,
        })
        .from(payments)
        .where(
          and(
            eq(payments.bookingId, resolvedBookingId),
            eq(payments.paymentType, "travel_fee"),
            eq(payments.payoutBlockedReason, "travel_fee_hold")
          )
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      const heldTravel = heldTravelRows[0];

      if (heldTravel?.id) {
        if (!isPaymentSucceededStatus(heldTravel.status)) {
          return res.status(400).json({ error: "Held travel fee is not in a settleable state" });
        }
        const alreadyRefunded = heldTravel.refundAmount ?? 0;
        const heldRemaining = Math.max(0, heldTravel.amount - alreadyRefunded);

        const requestedAward =
          typeof payload.travelAwardCents === "number"
            ? payload.travelAwardCents
            : payload.decision === "payout"
              ? heldRemaining
              : 0;
        const travelAward = Math.min(Math.max(0, requestedAward), heldRemaining);
        const travelRefundToCustomer = heldRemaining - travelAward;

        // Vendor connected account is required to pay an award.
        const connectedAccountId = await resolveVendorConnectedAccountId(
          resolvedBookingId,
          heldTravel.stripeConnectedAccountId
        );
        if (travelAward > 0 && !connectedAccountId) {
          return res.status(400).json({
            error: "Vendor has no connected Stripe account; cannot award travel costs",
          });
        }

        const { refundBookingPayment, transferToVendor } = await import("../stripe");

        // 1) Refund the customer's portion (partial refund on the travel charge).
        const travelRefund =
          travelRefundToCustomer > 0
            ? await refundBookingPayment({
                paymentIntentId: heldTravel.stripePaymentIntentId,
                // ALWAYS explicit: an amount-less refund returns the entire
                // remaining charge on the shared PaymentIntent, not just the
                // travel portion.
                amount: travelRefundToCustomer,
                reason: "requested_by_customer",
                idempotencyKey: `admin-dispute-travel-refund:${caseId}:${heldTravel.id}`,
                metadata: { paymentRowId: heldTravel.id, portion: "travel_fee" },
              })
            : null;

        // 2) Directly transfer the awarded portion to the vendor (authorized override).
        let travelTransfer: any = null;
        if (travelAward > 0) {
          travelTransfer = await transferToVendor({
            amount: travelAward,
            // Non-null: the 400 guard above rejects travelAward > 0 without an account.
            vendorStripeAccountId: connectedAccountId!,
            description: `Travel cost recovery for booking ${resolvedBookingId}`,
            sourceTransaction: asTrimmedString(heldTravel.stripeChargeId) || undefined,
            transferGroup: `booking_${resolvedBookingId}`,
            metadata: {
              bookingId: resolvedBookingId,
              paymentId: heldTravel.id,
              kind: "travel_cost_recovery",
            },
            // Key by case+payment (NOT amount) so a retry with a different award can
            // never produce a second transfer — the first settlement wins.
            idempotencyKey: `admin-dispute-travel-payout:${caseId}:${heldTravel.id}`,
          });
        }

        const resolutionNote = payload.adminNotes
          ? payload.adminNotes
          : travelAward > 0
            ? `Travel dispute: ${formatCentsAsDollars(travelAward)} awarded to vendor, ${formatCentsAsDollars(travelRefundToCustomer)} refunded to customer`
            : `Travel dispute: full travel fee ${formatCentsAsDollars(travelRefundToCustomer)} refunded to customer`;

        await db.transaction(async (tx) => {
          await tx
            .update(payments)
            .set({
              status:
                travelAward > 0
                  ? travelRefundToCustomer > 0
                    ? "partially_refunded"
                    : "succeeded"
                  : "refunded",
              ...(travelRefundToCustomer > 0
                ? {
                    refundAmount: alreadyRefunded + travelRefundToCustomer,
                    refundReason: "admin_dispute_travel",
                    refundedAt: now,
                  }
                : {}),
              ...(travelAward > 0
                ? {
                    payoutStatus: "paid",
                    payoutEligibleAt: now,
                    payoutBlockedReason: null,
                    payoutAdjustedAmount: travelAward,
                    paidOutAt: now,
                    stripeTransferId: travelTransfer?.id ?? null,
                  }
                : {
                    payoutStatus: "cancelled",
                    payoutEligibleAt: null,
                    payoutBlockedReason: "dispute_refund_approved",
                    payoutAdjustedAmount: 0,
                  }),
            })
            .where(eq(payments.id, heldTravel.id));

          await tx.execute(drizzleSql`
            UPDATE dispute_cases
            SET status = 'resolved',
                resolution = ${resolutionNote},
                withheld_amount_cents = ${travelAward > 0 ? travelAward : null},
                resolved_at = ${now},
                updated_at = ${now}
            WHERE id = ${activeCaseId} AND status = 'resolving'
          `);
          await tx.execute(drizzleSql`
            INSERT INTO dispute_filings (case_id, booking_id, filed_by, dispute_type, description, attachment_urls, created_at, updated_at)
            VALUES (${activeCaseId}, ${resolvedBookingId}, 'admin', 'admin_note', ${resolutionNote}, '{}', ${now}, ${now})
          `);
        });
        disputeClaimSettled = true;

        // Fire-and-forget outcome emails
        const serverUrlTravel = appUrl();
        const travelListingTitle = asTrimmedString(dispute.listingTitle) || "Your booking";
        const travelEventDate = asTrimmedString(dispute.eventDate) || "N/A";
        if (dispute.customerEmail) {
          sendDisputeResolvedEmail(dispute.customerEmail, {
            role: "customer",
            decision: "refund",
            recipientName: asTrimmedString(dispute.customerName) || "Customer",
            counterpartName: asTrimmedString(dispute.vendorBusinessName) || "Vendor",
            listingTitle: travelListingTitle,
            eventDate: travelEventDate,
            refundAmountCents: travelRefundToCustomer > 0 ? travelRefundToCustomer : undefined,
            serverUrl: serverUrlTravel,
          }).catch(() => {});
        }
        if (dispute.vendorEmail) {
          sendDisputeResolvedEmail(dispute.vendorEmail, {
            role: "vendor",
            decision: travelAward > 0 ? "payout" : "refund",
            recipientName: asTrimmedString(dispute.vendorBusinessName) || "Vendor",
            counterpartName: asTrimmedString(dispute.customerName) || "Customer",
            listingTitle: travelListingTitle,
            eventDate: travelEventDate,
            serverUrl: serverUrlTravel,
          }).catch(() => {});
        }

        return res.json({
          disputeId: caseId,
          bookingId: resolvedBookingId,
          decision: payload.decision,
          travelAwardCents: travelAward,
          travelRefundCents: travelRefundToCustomer,
          travelRefund,
          travelTransfer,
          resolvedAt: now,
        });
      }

      if (payload.decision === "refund") {
        const depositPaymentRows = await db
          .select({
            id: payments.id,
            bookingId: payments.bookingId,
            stripePaymentIntentId: payments.stripePaymentIntentId,
            stripeChargeId: payments.stripeChargeId,
            stripeConnectedAccountId: payments.stripeConnectedAccountId,
            amount: payments.amount,
            refundAmount: payments.refundAmount,
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
            stripeChargeId: payments.stripeChargeId,
            amount: payments.amount,
            refundAmount: payments.refundAmount,
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

        // Resolve the customer refund. Precedence:
        //  1. refundAmountCents — explicit customer refund (can exceed deposit).
        //  2. withheldAmountCents — admin "Damage withhold" UI: refund = deposit
        //     minus the withheld damages (withheld can't exceed the deposit).
        //  3. neither — full deposit refund.
        const requestedRefund = typeof payload.refundAmountCents === "number"
          ? payload.refundAmountCents
          : typeof payload.withheldAmountCents === "number"
            ? depositAmt - Math.min(payload.withheldAmountCents, depositAmt)
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

        // A withheld award is paid to the vendor via a DIRECT authorized transfer
        // (transferToVendor), NOT the automated payout pipeline: the pipeline's
        // eligibility refresh recomputes the payout from vendorNetPayoutAmount,
        // which is 0/NULL on deposit rows, so it silently cancels the award.
        // Resolve the vendor's connected account BEFORE moving any money so a
        // missing account fails the whole request with nothing half-settled.
        const withholdConnectedAccountId =
          withheld > 0
            ? await resolveVendorConnectedAccountId(
                resolvedBookingId,
                depositPayment.stripeConnectedAccountId
              )
            : null;
        if (withheld > 0 && !withholdConnectedAccountId) {
          return res.status(400).json({
            error: "Vendor has no connected Stripe account; cannot pay the withheld amount",
          });
        }

        const { refundBookingPayment, transferToVendor } = await import("../stripe");

        // Refund deposit portion. ALWAYS pass an explicit amount: the deposit
        // shares its PaymentIntent with the booking payment, so an amount-less
        // "full" refund returns the entire remaining charge including the
        // vendor's service payment.
        const depositRefund = depositRefundCents > 0
          ? await refundBookingPayment({
              paymentIntentId: depositPayment.stripePaymentIntentId,
              amount: depositRefundCents,
              reason: "requested_by_customer",
              idempotencyKey: `admin-dispute-refund:${caseId}:${depositPayment.id}`,
              metadata: { paymentRowId: depositPayment.id, portion: "security_deposit" },
            })
          : null;

        // Refund booking payment portion (vendor no-show / full cancellation).
        const bookingRefund = bookingRefundCents > 0 && bookingPayment
          ? await refundBookingPayment({
              paymentIntentId: bookingPayment.stripePaymentIntentId,
              amount: bookingRefundCents,
              reason: "requested_by_customer",
              idempotencyKey: `admin-dispute-refund-booking:${caseId}:${bookingPayment.id}`,
              metadata: { paymentRowId: bookingPayment.id, portion: "booking" },
            })
          : null;

        // Pay the withheld damages to the vendor. Guard against a prior
        // settlement first: a second dispute case on the same booking would mint
        // a fresh idempotency key, so the key alone cannot prevent a double
        // transfer — re-read the row and skip if it was already paid out.
        let depositTransfer: any = null;
        let depositAlreadyPaidOut = false;
        if (withheld > 0) {
          const freshDepositRows = await db
            .select({
              stripeTransferId: payments.stripeTransferId,
              payoutStatus: payments.payoutStatus,
            })
            .from(payments)
            .where(eq(payments.id, depositPayment.id))
            .limit(1);
          const freshDeposit = freshDepositRows[0];
          depositAlreadyPaidOut =
            Boolean(asTrimmedString(freshDeposit?.stripeTransferId)) ||
            freshDeposit?.payoutStatus === "paid";

          if (!depositAlreadyPaidOut) {
            depositTransfer = await transferToVendor({
              amount: withheld,
              // Non-null: the 400 guard above rejects withheld > 0 without an account.
              vendorStripeAccountId: withholdConnectedAccountId!,
              description: `Dispute damage withhold for booking ${resolvedBookingId}`,
              sourceTransaction:
                asTrimmedString(depositPayment.stripeChargeId) ||
                asTrimmedString(bookingPayment?.stripeChargeId) ||
                undefined,
              transferGroup: `booking_${resolvedBookingId}`,
              metadata: {
                bookingId: resolvedBookingId,
                paymentId: depositPayment.id,
                kind: "dispute_deposit_withhold",
              },
              // Key by case+payment (NOT amount) so a retry with a different
              // withhold can never produce a second transfer — the first
              // settlement wins.
              idempotencyKey: `admin-dispute-deposit-payout:${caseId}:${depositPayment.id}`,
            });
          }
        }

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

        const priorDepositRefund =
          typeof depositPayment.refundAmount === "number" ? depositPayment.refundAmount : 0;
        const priorBookingRefund =
          typeof bookingPayment?.refundAmount === "number" ? bookingPayment.refundAmount : 0;

        await db.transaction(async (tx) => {
          // Deposit payment: refunded portion goes to customer; withheld portion
          // was transferred directly to the vendor above.
          await tx
            .update(payments)
            .set({
              status:
                withheld > 0
                  ? depositRefundCents > 0
                    ? "partially_refunded"
                    : "succeeded"
                  : "refunded",
              ...(depositRefundCents > 0
                ? {
                    // Accumulate — an overwrite would erase any refund already
                    // recorded on the row (e.g. a partial refund from another flow).
                    refundAmount: priorDepositRefund + depositRefundCents,
                    refundReason: "admin_dispute_refund",
                    refundedAt: now,
                  }
                : {}),
              ...(withheld > 0
                ? depositAlreadyPaidOut
                  ? {} // keep the earlier settlement's transfer/payout fields intact
                  : {
                      payoutStatus: "paid",
                      payoutEligibleAt: now,
                      payoutBlockedReason: null,
                      payoutAdjustedAmount: withheld,
                      paidOutAt: now,
                      stripeTransferId: depositTransfer?.id ?? null,
                    }
                : {
                    payoutStatus: "cancelled",
                    payoutEligibleAt: null,
                    payoutBlockedReason: "dispute_refund_approved",
                    payoutAdjustedAmount: 0,
                  }),
            })
            .where(eq(payments.id, depositPayment.id));

          // Booking payment: cancel payout if we refunded any of it.
          if (bookingRefundCents > 0 && bookingPayment) {
            await tx
              .update(payments)
              .set({
                status: "refunded",
                refundAmount: priorBookingRefund + bookingRefundCents,
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
            WHERE id = ${activeCaseId} AND status = 'resolving'
          `);
          await tx.execute(drizzleSql`
            INSERT INTO dispute_filings (case_id, booking_id, filed_by, dispute_type, description, attachment_urls, created_at, updated_at)
            VALUES (${activeCaseId}, ${resolvedBookingId}, 'admin', 'admin_note', ${resolutionNote}, '{}', ${now}, ${now})
          `);
        });
        disputeClaimSettled = true;

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
          withheldAmountCents: withheld,
          depositTransfer,
          resolvedAt: now,
        });
      }

      // ── decision === 'payout': vendor keeps the deposit ──
      // Pay the deposit via a DIRECT authorized transfer (transferToVendor),
      // mirroring the travel-award path. The automated payout pipeline
      // (processSinglePayoutCandidate) recomputes eligibility from
      // vendorNetPayoutAmount, which is 0/NULL on deposit rows — routing the
      // award through it silently cancelled the payout and the vendor never
      // received the money.
      const depositRows = await db
        .select({
          id: payments.id,
          bookingId: payments.bookingId,
          stripePaymentIntentId: payments.stripePaymentIntentId,
          stripeChargeId: payments.stripeChargeId,
          stripeConnectedAccountId: payments.stripeConnectedAccountId,
          amount: payments.amount,
          refundAmount: payments.refundAmount,
          status: payments.status,
          payoutStatus: payments.payoutStatus,
          stripeTransferId: payments.stripeTransferId,
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
      const deposit = depositRows[0] ?? null;

      // Award = whatever of the deposit hasn't already been refunded to the
      // customer. Skip the transfer (but still resolve the case) when there is
      // nothing left to move or a prior settlement already paid it — a second
      // dispute case would mint a fresh idempotency key, so the key alone
      // cannot prevent a double transfer.
      const depositAward = deposit ? Math.max(0, (deposit.amount ?? 0) - (deposit.refundAmount ?? 0)) : 0;
      const depositPaidOutAlready =
        Boolean(asTrimmedString(deposit?.stripeTransferId)) || deposit?.payoutStatus === "paid";
      const depositTransferable =
        !!deposit &&
        !depositPaidOutAlready &&
        depositAward > 0 &&
        (isPaymentSucceededStatus(deposit.status) ||
          isPaymentRefundedOrPartiallyRefundedStatus(deposit.status));

      let payoutTransfer: any = null;
      if (depositTransferable && deposit) {
        const payoutConnectedAccountId = await resolveVendorConnectedAccountId(
          resolvedBookingId,
          deposit.stripeConnectedAccountId
        );
        if (!payoutConnectedAccountId) {
          return res.status(400).json({
            error: "Vendor has no connected Stripe account; cannot pay out the deposit",
          });
        }
        const { transferToVendor } = await import("../stripe");
        payoutTransfer = await transferToVendor({
          amount: depositAward,
          vendorStripeAccountId: payoutConnectedAccountId,
          description: `Dispute deposit payout for booking ${resolvedBookingId}`,
          sourceTransaction: asTrimmedString(deposit.stripeChargeId) || undefined,
          transferGroup: `booking_${resolvedBookingId}`,
          metadata: {
            bookingId: resolvedBookingId,
            paymentId: deposit.id,
            kind: "dispute_deposit_award",
          },
          // Key by case+payment (NOT amount) so a retry with a changed award can
          // never produce a second transfer — the first settlement wins.
          idempotencyKey: `admin-dispute-deposit-payout:${caseId}:${deposit.id}`,
        });
      }

      await db.transaction(async (tx) => {
        if (deposit && payoutTransfer) {
          await tx
            .update(payments)
            .set({
              payoutStatus: "paid",
              payoutEligibleAt: now,
              payoutBlockedReason: null,
              payoutAdjustedAmount: depositAward,
              paidOutAt: now,
              stripeTransferId: payoutTransfer.id,
            })
            .where(eq(payments.id, deposit.id));
        }

        if (deposit) {
          // Stamp the booking so the hourly deposit auto-refund job can never
          // re-select this row and refund the customer the deposit the vendor
          // was just paid (double payout).
          await tx
            .update(bookings)
            .set({ securityDepositRefundedAt: now, updatedAt: now })
            .where(eq(bookings.id, resolvedBookingId));
        }

        await tx.execute(drizzleSql`
          UPDATE dispute_cases
          SET status = 'resolved',
              resolution = ${payload.adminNotes ?? "Payout approved to vendor"},
              withheld_amount_cents = ${null},
              resolved_at = ${now},
              updated_at = ${now}
          WHERE id = ${activeCaseId} AND status = 'resolving'
        `);
        if (payload.adminNotes) {
          await tx.execute(drizzleSql`
            INSERT INTO dispute_filings (case_id, booking_id, filed_by, dispute_type, description, attachment_urls, created_at, updated_at)
            VALUES (${activeCaseId}, ${resolvedBookingId}, 'admin', 'admin_note', ${payload.adminNotes}, '{}', ${now}, ${now})
          `);
        }
      });
      disputeClaimSettled = true;

      // Same shape the payout pipeline used to return here, so any caller
      // reading the response keeps working.
      const payoutResult = deposit
        ? {
            paymentId: deposit.id,
            bookingId: deposit.bookingId,
            outcome: payoutTransfer ? "paid" : "skipped",
            reason: payoutTransfer
              ? null
              : depositPaidOutAlready
                ? "already_transferred"
                : depositAward <= 0
                  ? "deposit_fully_refunded"
                  : "deposit_not_transferable",
            payoutAmount: payoutTransfer ? depositAward : 0,
            transferId: payoutTransfer?.id ?? (asTrimmedString(deposit.stripeTransferId) || null),
          }
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
      } finally {
        // Release the M11 claim on any non-resolved exit (validation 4xx, Stripe
        // error, thrown exception). Guarded so it no-ops after a completed
        // settlement (case is 'resolved', not 'resolving'). Best-effort: a
        // failure here only leaves the case in 'resolving', which the stale-claim
        // recovery / an admin retry can still clear.
        if (!disputeClaimSettled) {
          await db
            .execute(drizzleSql`
              UPDATE dispute_cases
              SET status = 'open', updated_at = now()
              WHERE id = ${activeCaseId} AND status = 'resolving'
            `)
            .catch((releaseErr: any) => {
              logger.error(
                `[admin/disputes/resolve] failed to release 'resolving' claim for case ${activeCaseId}: ${releaseErr?.message ?? releaseErr}`
              );
            });
        }
      }
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
      const INTERNAL_EMAILS = [
        "johnsbom000@gmail.com",
        "boman@griffjohnson.com",
        "cassidymalm21@gmail.com",
        "eventhubglobal@gmail.com",
      ];

      const [totalUsersResult] = await db
        .select({ count: count() })
        .from(users)
        .where(not(inArray(users.email, INTERNAL_EMAILS)));
      const totalUsers = totalUsersResult.count;

      const [totalVendorsResult] = await db
        .select({ count: count() })
        .from(vendorAccounts)
        .where(
          drizzleSql`${vendorAccounts.userId} NOT IN (SELECT id FROM users WHERE email IN ('johnsbom000@gmail.com', 'boman@griffjohnson.com', 'cassidymalm21@gmail.com', 'eventhubglobal@gmail.com'))`
        );
      const totalVendors = totalVendorsResult.count;

      // Count distinct vendor accounts per listing category (categories live on listings now)
      const vendorsByTypeRows = await db.execute(drizzleSql`
        SELECT
          COALESCE(NULLIF(TRIM(category), ''), 'Uncategorised') AS category,
          COUNT(DISTINCT account_id)::int                        AS count
        FROM vendor_listings
        WHERE status != 'deleted'
          AND account_id NOT IN (
            SELECT id FROM vendor_accounts
            WHERE user_id IN (SELECT id FROM users WHERE email IN ('johnsbom000@gmail.com', 'boman@griffjohnson.com', 'cassidymalm21@gmail.com', 'eventhubglobal@gmail.com'))
          )
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
        .where(and(gte(users.createdAt, thirtyDaysAgo), not(inArray(users.email, INTERNAL_EMAILS))))
        .groupBy(drizzleSql`DATE(${users.createdAt})`)
        .orderBy(drizzleSql`DATE(${users.createdAt})`);

      // Vendor Pro subscription counts (active vendors only).
      const subCountsRows = await db.execute(drizzleSql`
        SELECT
          COUNT(*) FILTER (WHERE subscription_status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE subscription_status = 'trialing')::int AS trialing,
          COUNT(*) FILTER (WHERE subscription_status = 'comp' AND (comp_ends_at IS NULL OR comp_ends_at > NOW()))::int AS comp,
          COUNT(*) FILTER (WHERE subscription_status = 'past_due')::int AS past_due,
          COUNT(*) FILTER (WHERE NOT (
            subscription_status IN ('active','trialing','past_due')
            OR (subscription_status = 'comp' AND (comp_ends_at IS NULL OR comp_ends_at > NOW()))
          ))::int AS free
        FROM vendor_accounts
        WHERE deleted_at IS NULL AND active = true
      `);
      const sc = extractRows<{ active: number; trialing: number; comp: number; past_due: number; free: number }>(subCountsRows)[0];
      const subscriptionCounts = {
        active: Number(sc?.active ?? 0),
        trialing: Number(sc?.trialing ?? 0),
        comp: Number(sc?.comp ?? 0),
        pastDue: Number(sc?.past_due ?? 0),
        free: Number(sc?.free ?? 0),
        pro: Number(sc?.active ?? 0) + Number(sc?.trialing ?? 0) + Number(sc?.comp ?? 0) + Number(sc?.past_due ?? 0),
      };

      res.json({
        totalUsers,
        totalVendors,
        vendorsByType,
        userGrowth,
        subscriptionCounts,
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
          SUM(b.platform_fee)::bigint           AS platform_fee_cents,
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
          SUM(b.platform_fee)::bigint           AS platform_fee_cents,
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
          SUM(b.platform_fee)::bigint           AS platform_fee_cents,
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

  // POST /api/admin/vendors/:id/grant-comp — grant complimentary Pro (no billing).
  // Body: { days?: number } (default 30). DB-only; never touches Stripe.
  app.post("/api/admin/vendors/:id/grant-comp", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const vendorId = asTrimmedString(req.params?.id);
      if (!vendorId) return res.status(400).json({ error: "Vendor id required" });
      const days = Math.max(1, Math.min(365, parseIntegerValue(req.body?.days) ?? 30));
      const compEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const [updated] = await db
        .update(vendorAccounts)
        .set({
          subscriptionPlan: "pro",
          subscriptionStatus: "comp",
          compEndsAt,
          subscriptionUpdatedAt: new Date(),
        })
        .where(and(eq(vendorAccounts.id, vendorId), isNull(vendorAccounts.deletedAt)))
        .returning({ id: vendorAccounts.id });
      if (!updated) return res.status(404).json({ error: "Vendor not found" });

      return res.json({ ok: true, compEndsAt });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/admin/vendors/:id/cancel-comp — end a complimentary grant now and
  // drop the vendor to Free (trims extra active listings). DB-only.
  app.post("/api/admin/vendors/:id/cancel-comp", adminRateLimiter, requireAdminAuth, async (req: any, res: any) => {
    try {
      const vendorId = asTrimmedString(req.params?.id);
      if (!vendorId) return res.status(400).json({ error: "Vendor id required" });

      const [updated] = await db
        .update(vendorAccounts)
        .set({
          subscriptionPlan: "free",
          subscriptionStatus: "none",
          compEndsAt: null,
          subscriptionUpdatedAt: new Date(),
        })
        .where(
          and(
            eq(vendorAccounts.id, vendorId),
            eq(vendorAccounts.subscriptionStatus, "comp"),
            isNull(vendorAccounts.deletedAt)
          )
        )
        .returning({ id: vendorAccounts.id });
      if (!updated) return res.status(404).json({ error: "Vendor not found or not on a complimentary grant" });

      await deactivateExtraActiveListingsForFreeTier(vendorId);
      return res.json({ ok: true });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

}
