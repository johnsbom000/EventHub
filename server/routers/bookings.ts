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
} from "../services/chatService";
import {
  deactivateActiveListingsViolatingPublishGate,
  checkListingAvailabilityForBookingRequest,
  sendCancellationEmailsAsync,
} from "../services/bookingService";
import { registerGoogleRoutes } from "../routers/google";
import { registerBoardRoutes } from "../routers/boards";
import { registerCircumventionRoutes } from "../routers/circumvention";
import { storage } from "../storage";
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
  deriveVendorSlug,
} from "../lib/routeUtils";
import {
  VENDOR_FEE_RATE,
  CUSTOMER_FEE_RATE,
  MARQUEE_VENDOR_MAX_SPOTS,
  MARQUEE_HOLIDAY_BOOKING_COUNT,
  MARQUEE_HOLIDAY_DAYS,
  MARQUEE_REFERRAL_BONUS_BOOKINGS,
  MARQUEE_REFERRAL_BONUS_FEE_RATE,
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

export function registerBookingRoutes(app: Express): void {


  /**
   * GET /api/listings/:id/effective-policy
   * Returns the resolved cancellation policy for a listing.
   * Reads the cancellation_policy and cancellation_policy_days columns set during
   * listing creation. Accessible without authentication (shown on listing detail + checkout).
   */
  app.get("/api/listings/:id/effective-policy", async (req, res) => {
    try {
      const listingId = asTrimmedString(req.params.id);
      if (!listingId) return res.status(400).json({ error: "Listing id required" });

      const [row] = await db
        .select({
          cancellationPolicy: vendorListings.cancellationPolicy,
          cancellationPolicyDays: vendorListings.cancellationPolicyDays,
        })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, listingId), eq(vendorListings.status, "active")))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Listing not found" });

      return res.json(policyFromListingWizard(row.cancellationPolicy, row.cancellationPolicyDays));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  /**
   * POST /api/bookings/:id/calculate-refund
   * Preview-only: returns the refund breakdown for a given cancellation date.
   * Does NOT execute anything. Used for the "are you sure?" modal.
   * Customer auth required — booking must belong to the requesting customer.
   */
  app.post("/api/bookings/:id/calculate-refund", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer authentication required" });

      const bookingId = asTrimmedString(req.params.id);
      if (!bookingId) return res.status(400).json({ error: "Booking id required" });

      const schema = z.object({
        cancellationDate: z.string().datetime().optional(), // ISO string; defaults to now
      });
      const { cancellationDate: cancellationDateStr } = schema.parse(req.body ?? {});
      const cancellationDate = cancellationDateStr ? new Date(cancellationDateStr) : new Date();

      const [booking] = await db
        .select({
          id: bookings.id,
          customerId: bookings.customerId,
          status: bookings.status,
          eventDate: bookings.eventDate,
          eventTimezone: bookings.eventTimezone,
          totalAmount: bookings.totalAmount,
          cancellationPolicySnapshot: bookings.cancellationPolicySnapshot,
        })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      if (!booking?.id || booking.customerId !== customerAuth.id) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Booking is already cancelled" });
      }
      if (booking.status === "completed") {
        return res.status(400).json({ error: "Completed bookings cannot be cancelled" });
      }
      if (booking.status !== "pending" && booking.status !== "confirmed") {
        return res.status(400).json({ error: "Booking is not in a cancellable state" });
      }

      // Resolve policy: use snapshot if present, otherwise fall back to 100% refund
      // (pre-policy bookings had no policy disclosed — full refund is the fair default)
      const policy: CancellationPolicy = booking.cancellationPolicySnapshot
        ? (booking.cancellationPolicySnapshot as unknown as CancellationPolicy)
        : policyFromListingWizard("cancel_anytime", null);

      const result = calculateRefund({
        totalAmountCents: booking.totalAmount,
        eventDate: booking.eventDate,
        eventTimezone: booking.eventTimezone,
        cancellationDate,
        policy,
      });

      return res.json({
        bookingId,
        cancellationDate: cancellationDate.toISOString(),
        totalAmountCents: booking.totalAmount,
        ...result,
        policy,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: error.errors });
      return respondWithInternalServerError(req, res, error);
    }
  });

  /**
   * POST /api/bookings/:id/cancel
   * Executes a customer-initiated cancellation.
   * 1. Validates the booking belongs to this customer and is cancellable.
   * 2. Calculates the refund using the policy snapshot.
   * 3. Issues a partial Stripe refund.
   * 4. Updates the booking and payment records in a transaction.
   * 5. Sends cancellation emails to both parties.
   *
   * Customer auth required.
   */
  app.post("/api/bookings/:id/cancel", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer authentication required" });

      const bookingId = asTrimmedString(req.params.id);
      if (!bookingId) return res.status(400).json({ error: "Booking id required" });

      const schema = z.object({
        reason: z.string().max(500).optional(),
      });
      const { reason } = schema.parse(req.body ?? {});

      // ── Load booking with payment ──────────────────────────────────────────
      const bookingRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.customer_id             as "customerId",
          b.vendor_account_id       as "vendorAccountId",
          b.status,
          b.payment_status          as "paymentStatus",
          b.event_date              as "eventDate",
          b.event_timezone          as "eventTimezone",
          b.total_amount            as "totalAmount",
          b.cancellation_policy_snapshot as "cancellationPolicySnapshot",
          coalesce(b.listing_title_snapshot, '') as "listingTitle",
          va.email                  as "vendorEmail",
          va.business_name          as "vendorName",
          u.email                   as "customerEmail",
          u.name                    as "customerName"
        from bookings b
        join vendor_accounts va on va.id = b.vendor_account_id
        join users u            on u.id  = b.customer_id
        where b.id = ${bookingId}
        limit 1
      `);
      const booking = extractRows<{
        id: string;
        customerId: string;
        vendorAccountId: string;
        status: string;
        paymentStatus: string;
        eventDate: string;
        eventTimezone: string | null;
        totalAmount: number;
        cancellationPolicySnapshot: unknown;
        listingTitle: string;
        vendorEmail: string;
        vendorName: string;
        customerEmail: string;
        customerName: string;
      }>(bookingRows)[0];

      if (!booking?.id || booking.customerId !== customerAuth.id) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.status === "cancelled") {
        return res.status(400).json({ error: "Booking is already cancelled" });
      }
      if (booking.status === "completed") {
        return res.status(400).json({ error: "Completed bookings cannot be cancelled" });
      }
      if (booking.status !== "pending" && booking.status !== "confirmed") {
        return res.status(400).json({ error: "Booking is not in a cancellable state" });
      }

      // ── Resolve policy ────────────────────────────────────────────────────
      const policy: CancellationPolicy = booking.cancellationPolicySnapshot
        ? (booking.cancellationPolicySnapshot as CancellationPolicy)
        : policyFromListingWizard("cancel_anytime", null);

      const cancellationDate = new Date();
      const refundCalc = calculateRefund({
        totalAmountCents: booking.totalAmount,
        eventDate: booking.eventDate,
        eventTimezone: booking.eventTimezone,
        cancellationDate,
        policy,
      });

      // ── Find all payments for this booking ────────────────────────────────
      // Query all payment types separately so we refund the right amounts
      // to the right Stripe payment intents.
      const allBookingPayments = await db
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
            or(
              eq(payments.status, "succeeded"),
              eq(payments.status, "partially_refunded")
            )
          )
        )
        .orderBy(desc(payments.createdAt));

      const payment = allBookingPayments.find(
        (p) => p.paymentType === "booking"
      );
      // Vendor-proposed travel fee (separate Stripe charge, same policy % applied)
      const travelFeePayments = allBookingPayments.filter(
        (p) => p.paymentType === "travel_fee"
      );
      // Security deposit (separate Stripe charge)
      const depositPayment = allBookingPayments.find(
        (p) => p.paymentType === "security_deposit"
      );

      const now = new Date();

      if (!payment || !isPaymentSucceededStatus(payment.status)) {
        // No main payment collected yet — just cancel the booking.
        await db
          .update(bookings)
          .set({
            status: "cancelled",
            cancellationReason: reason ? `customer: ${reason}` : "customer_cancel",
            cancelledAt: now,
            updatedAt: now,
          })
          .where(eq(bookings.id, bookingId));

        void sendCancellationEmailsAsync({ booking, refundCents: 0, serverUrl: appUrl() });
        void syncBookingToGoogleCalendarSafely(bookingId, "/api/bookings/:bookingId/cancel google-sync");
        await sendBookingSystemMessage({
          bookingId,
          text: `This booking has been cancelled by the customer.${reason ? ` Reason: ${reason}.` : ""}`,
          metadata: { action: "customer_cancelled", reason: reason ?? null },
        });
        if (booking.vendorAccountId) {
          storage.createNotification({
            recipientId: booking.vendorAccountId,
            recipientType: "vendor",
            type: "booking_cancelled",
            title: "Booking cancelled",
            message: `A booking for ${booking.eventDate}${reason ? ` was cancelled by the customer. Reason: ${reason}` : " has been cancelled by the customer"}.`,
            link: `/vendor/bookings?bookingId=${encodeURIComponent(bookingId)}`,
            read: false,
          }).catch(() => {});
        }
        return res.json({ success: true, bookingId, refundCents: 0, message: "Booking cancelled. No payment was collected." });
      }

      // ── Safety cap: ensure refund never exceeds what was originally charged ─
      const safeRefundCents = (p: { amount: number; refundAmount: number | null }, requested: number) => {
        const alreadyRefunded = typeof p.refundAmount === "number" ? p.refundAmount : 0;
        return Math.min(requested, Math.max(0, p.amount - alreadyRefunded));
      };

      // ── Calculate refund amounts ──────────────────────────────────────────
      const bookingRefundCents = safeRefundCents(payment, refundCalc.grossRefundCents);

      // Travel fee refunds at the same percentage as the booking payment.
      const travelFeeRefunds = travelFeePayments.map((tfp) => ({
        payment: tfp,
        refundCents: safeRefundCents(
          tfp,
          Math.floor(tfp.amount * refundCalc.grossRefundPercentage / 100)
        ),
      }));

      // Security deposit: refund immediately only if policy gives ANY refund (i.e.
      // cancellation is within the allowed window). If policy = 0%, the deposit
      // stays put and is handled by the 72h post-event auto-refund job.
      const refundDepositNow =
        refundCalc.grossRefundPercentage > 0 &&
        !!depositPayment &&
        isPaymentSucceededStatus(depositPayment.status);
      const depositRefundCents = refundDepositNow
        ? safeRefundCents(depositPayment!, depositPayment!.amount)
        : 0;

      // ── Issue Stripe refunds ───────────────────────────────────────────────
      const { refundBookingPayment } = await import("../stripe");
      let bookingStripeRefund: any = null;

      try {
        if (bookingRefundCents > 0) {
          bookingStripeRefund = await refundBookingPayment({
            paymentIntentId: payment.stripePaymentIntentId,
            amount: bookingRefundCents,
            reason: "requested_by_customer",
            idempotencyKey: `customer-cancel:${bookingId}:${payment.id}:${bookingRefundCents}`,
          });
        }

        for (const { payment: tfp, refundCents } of travelFeeRefunds) {
          if (refundCents > 0) {
            await refundBookingPayment({
              paymentIntentId: tfp.stripePaymentIntentId,
              amount: refundCents,
              reason: "requested_by_customer",
              idempotencyKey: `customer-cancel-travelfee:${bookingId}:${tfp.id}:${refundCents}`,
            });
          }
        }

        if (refundDepositNow && depositRefundCents > 0) {
          await refundBookingPayment({
            paymentIntentId: depositPayment!.stripePaymentIntentId,
            reason: "requested_by_customer",
            idempotencyKey: `customer-cancel-deposit:${bookingId}:${depositPayment!.id}`,
          });
        }
      } catch (stripeErr: any) {
        const msg = stripeErr?.message || "Stripe refund failed";
        logger.error({ bookingId, err: msg }, "[customer cancel] Stripe refund failed");
        return res.status(502).json({ error: "Refund processing failed. Please contact support.", detail: msg });
      }

      // ── Persist in a transaction ───────────────────────────────────────────
      const totalRefundedToCustomer = bookingRefundCents +
        travelFeeRefunds.reduce((sum, r) => sum + r.refundCents, 0) +
        depositRefundCents;

      await db.transaction(async (tx) => {
        // Update main booking payment
        const existingRefund = typeof payment.refundAmount === "number" ? payment.refundAmount : 0;
        const newBookingRefundTotal = existingRefund + bookingRefundCents;
        const newPaymentStatus: string = newBookingRefundTotal >= payment.amount ? "refunded" : "partially_refunded";

        await tx
          .update(payments)
          .set({
            status: newPaymentStatus as any,
            refundAmount: newBookingRefundTotal,
            refundReason: reason ? `customer_cancel: ${reason}` : "customer_cancel",
            refundedAt: now,
            payoutStatus: "cancelled",
            payoutEligibleAt: null,
            payoutBlockedReason: "customer_cancellation",
            payoutAdjustedAmount: 0,
          })
          .where(eq(payments.id, payment.id));

        // Update each travel fee payment
        for (const { payment: tfp, refundCents } of travelFeeRefunds) {
          if (refundCents > 0) {
            const existingTfRefund = typeof tfp.refundAmount === "number" ? tfp.refundAmount : 0;
            const newTfRefundTotal = existingTfRefund + refundCents;
            await tx
              .update(payments)
              .set({
                status: (newTfRefundTotal >= tfp.amount ? "refunded" : "partially_refunded") as any,
                refundAmount: newTfRefundTotal,
                refundReason: reason ? `customer_cancel: ${reason}` : "customer_cancel",
                refundedAt: now,
                payoutStatus: "cancelled",
                payoutEligibleAt: null,
                payoutBlockedReason: "customer_cancellation",
                payoutAdjustedAmount: 0,
              })
              .where(eq(payments.id, tfp.id));
          }
        }

        // Update security deposit payment if refunded now
        if (refundDepositNow && depositRefundCents > 0) {
          await tx
            .update(payments)
            .set({
              status: "refunded" as any,
              refundAmount: depositRefundCents,
              refundReason: reason ? `customer_cancel: ${reason}` : "customer_cancel",
              refundedAt: now,
            })
            .where(eq(payments.id, depositPayment!.id));
        }

        // Update booking record
        await tx
          .update(bookings)
          .set({
            status: "cancelled",
            paymentStatus: newPaymentStatus as any,
            cancellationReason: reason ? `customer: ${reason}` : "customer_cancel",
            cancelledAt: now,
            updatedAt: now,
            ...(refundDepositNow ? { securityDepositRefundedAt: now } : {}),
          })
          .where(eq(bookings.id, bookingId));
      });

      // ── Emails + Google Calendar sync (fire-and-forget) ───────────────────
      const serverUrl = appUrl();
      void sendCancellationEmailsAsync({ booking, refundCents: totalRefundedToCustomer, serverUrl });
      void syncBookingToGoogleCalendarSafely(bookingId, "/api/bookings/:bookingId/cancel google-sync");
      await sendBookingSystemMessage({
        bookingId,
        text: `This booking has been cancelled by the customer.${reason ? ` Reason: ${reason}.` : ""}`,
        metadata: { action: "customer_cancelled", reason: reason ?? null },
      });
      if (booking.vendorAccountId) {
        storage.createNotification({
          recipientId: booking.vendorAccountId,
          recipientType: "vendor",
          type: "booking_cancelled",
          title: "Booking cancelled",
          message: `A booking for ${booking.eventDate}${reason ? ` was cancelled by the customer. Reason: ${reason}` : " has been cancelled by the customer"}.`,
          link: `/vendor/bookings?bookingId=${encodeURIComponent(bookingId)}`,
          read: false,
        }).catch(() => {});
      }

      return res.json({
        success: true,
        bookingId,
        refundCents: totalRefundedToCustomer,
        bookingRefundCents,
        depositRefundedNow: refundDepositNow,
        refundPercentage: refundCalc.grossRefundPercentage,
        daysUntilEvent: refundCalc.daysUntilEvent,
        stripeRefundId: bookingStripeRefund?.id ?? null,
        message: totalRefundedToCustomer > 0
          ? `Booking cancelled. A refund of $${(totalRefundedToCustomer / 100).toFixed(2)} has been issued.`
          : "Booking cancelled. No refund applies per the cancellation policy.",
      });
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: error.errors });
      return respondWithInternalServerError(req, res, error);
    }
  });

  const createBookingSchema = z.object({
    vendorId: z.string().optional(),
    listingId: z.string().optional(),
    quantity: z.number().int().min(1).max(99).optional(),
    paymentMethodId: z.string().regex(/^pm_/, "Invalid Stripe payment method").optional(),
    idempotencyKey: z.string().min(16).max(128).optional(),
    customerEventId: z.string().optional(),
    customerEventTitle: z.string().max(160).optional(),
    eventId: z.string().optional(),
    packageId: z.string().optional(),
    addOnIds: z.array(z.string()).max(20).optional(),
    addOns: z.array(z.object({ id: z.string(), quantity: z.number().int().min(1).max(99) })).max(20).optional(),
    eventDate: z.string(),
    eventStartTime: z.string().optional(),
    eventEndDate: z.string().optional(),
    eventEndTime: z.string().optional(),
    eventLocation: z.string().optional(),
    eventLocationLat: z.number().optional(),
    eventLocationLng: z.number().optional(),
    guestCount: z.number().optional(),
    specialRequests: z.string().optional(),
    customerNotes: z.string().max(2000).optional(),
    customerQuestions: z.string().max(2000).optional(),
    finalPaymentStrategy: z.enum(["immediately", "2_weeks_prior", "day_of_event"]),
    promoCode: z.string().max(64).optional(),
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

  app.post("/api/bookings", bookingRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    let stage = "start";
    const fail = (
      status: number,
      message: string,
      details?: Record<string, unknown>
    ): never => {
      const error = new Error(message) as Error & {
        status?: number;
        details?: Record<string, unknown>;
      };
      error.status = status;
      if (details) {
        error.details = details;
      }
      throw error;
    };
    try {
      stage = "resolve-customer";
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      await expireStalePendingBookings();

      stage = "validate-payload";
      const data = createBookingSchema.parse(req.body);
      const idempotencyKey =
        typeof data.idempotencyKey === "string" && data.idempotencyKey.trim().length > 0
          ? data.idempotencyKey.trim()
          : null;

      if (idempotencyKey) {
        const existingRows: any = await db.execute(drizzleSql`
          select
            b.id as "bookingId"
          from bookings b
          where b.customer_id = ${customerAuth.id}
            and exists (
              select 1
              from booking_items bi
              where bi.booking_id = b.id
                and coalesce(bi.item_data->>'idempotencyKey', '') = ${idempotencyKey}
            )
          order by b.created_at desc
          limit 1
        `);
        const existingBookingId = asTrimmedString(
          extractRows<{ bookingId?: string | null }>(existingRows)[0]?.bookingId
        );
        if (existingBookingId) {
          const [existingBooking] = await db
            .select()
            .from(bookings)
            .where(eq(bookings.id, existingBookingId))
            .limit(1);
          if (existingBooking?.id) {
            return res.json({
              ...existingBooking,
              payoutReleaseMode: PAYOUT_RELEASE_MODE,
              idempotencyReused: true,
            });
          }
        }
      }

      const requestedCustomerEventId =
        typeof data.customerEventId === "string" && data.customerEventId.trim().length > 0
          ? data.customerEventId.trim()
          : null;
      const requestedCustomerEventTitle =
        typeof data.customerEventTitle === "string" && data.customerEventTitle.trim().length > 0
          ? data.customerEventTitle.trim().slice(0, 160)
          : null;

      // Normalize add-on inputs: support legacy addOnIds (qty=1 each) and new addOns format
      const normalizedAddOnInputs: { id: string; quantity: number }[] =
        data.addOns && data.addOns.length > 0
          ? data.addOns
          : (data.addOnIds ?? []).map((id) => ({ id, quantity: 1 }));

      // ── A-la-carte validation: must have either listingId or add-ons ──────────
      const isAlaCarte = !data.listingId && normalizedAddOnInputs.length > 0;
      if (!data.listingId && !isAlaCarte) {
        return res.status(400).json({ error: "listingId or addOnIds is required" });
      }

      stage = "load-listing";
      // For a-la-carte bookings (no parent listing), listingRow is null.
      // For package bookings, we load the container first, then the package_item.
      const listingSelectShape = {
        id: vendorListings.id,
        accountId: vendorListings.accountId,
        profileId: vendorListings.profileId,
        category: vendorListings.category,
        title: vendorListings.title,
        listingType: vendorListings.listingType,
        parentListingId: vendorListings.parentListingId,
        packageAvailabilityMode: vendorListings.packageAvailabilityMode,
        instantBookEnabled: vendorListings.instantBookEnabled,
        pricingUnit: vendorListings.pricingUnit,
        minimumHours: vendorListings.minimumHours,
        priceCents: vendorListings.priceCents,
        quantity: vendorListings.quantity,
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
        listingData: vendorListings.listingData,
        cancellationPolicy: vendorListings.cancellationPolicy,
        cancellationPolicyDays: vendorListings.cancellationPolicyDays,
        securityDepositEnabled: vendorListings.securityDepositEnabled,
        securityDepositCents: vendorListings.securityDepositCents,
        profileOperatingTimezone: vendorProfiles.operatingTimezone,
      };

      let listingRow = isAlaCarte
        ? null
        : (
            await db
              .select(listingSelectShape)
              .from(vendorListings)
              .leftJoin(vendorProfiles, eq(vendorProfiles.id, vendorListings.profileId))
              .where(
                and(
                  eq(vendorListings.id, data.listingId!),
                  eq(vendorListings.status, "active"),
                  eq(vendorProfiles.active, true)
                )
              )
              .limit(1)
          )[0] ?? null;

      if (!isAlaCarte && !listingRow) {
        return res.status(404).json({ error: "Listing not found" });
      }

      // ── Package: if a packageId was sent, validate and swap listingRow ───────
      // The client sends listingId = container, packageId = the chosen package_item.
      // For pricing/availability, we use the package_item row.
      // containerRow is preserved so dependent-mode availability can check the
      // container's shared capacity instead of the individual package_item's quantity.
      let containerRow: typeof listingRow = null;
      let packageRow: typeof listingRow = null;
      if (data.packageId && listingRow?.listingType === "package_container") {
        containerRow = listingRow; // save before swap
        stage = "load-package";
        const [pkgRow] = await db
          .select(listingSelectShape)
          .from(vendorListings)
          .leftJoin(vendorProfiles, eq(vendorProfiles.id, vendorListings.profileId))
          .where(
            and(
              eq(vendorListings.id, data.packageId),
              eq(vendorListings.listingType, "package_item"),
              eq(vendorListings.parentListingId, listingRow.id),
              eq(vendorListings.status, "active")
            )
          )
          .limit(1);

        if (!pkgRow) {
          return res.status(400).json({ error: "Selected package not found", code: "package_not_found" });
        }
        packageRow = pkgRow;
        // For dependent packages: availability is checked against the container's quantity.
        // For independent packages: availability is checked against the package_item's own quantity.
        // The effective listing for pricing/availability is the package_item.
        listingRow = pkgRow;
      } else if (data.packageId && listingRow?.listingType !== "package_container") {
        return res.status(400).json({ error: "packageId is only valid for package_container listings", code: "package_mismatch" });
      } else if (!data.packageId && listingRow?.listingType === "package_container") {
        return res.status(400).json({ error: "A package selection is required for this listing", code: "package_required" });
      }

      // ── Add-ons: validate and load before entering the listing-dependent path ─
      // Load add-on rows now (before vendor load) so we can derive vendorId for a-la-carte.
      let resolvedAddonRows: Array<{
        id: string;
        title: string | null;
        priceCents: number | null;
        quantity: number;
        requestedQuantity: number;
        accountId: string;
      }> = [];

      if (normalizedAddOnInputs.length > 0) {
        stage = "load-addons";
        const addonInputIds = normalizedAddOnInputs.map((a) => a.id);
        const addonRows = await db
          .select({
            id: vendorListings.id,
            title: vendorListings.title,
            priceCents: vendorListings.priceCents,
            quantity: vendorListings.quantity,
            accountId: vendorListings.accountId,
          })
          .from(vendorListings)
          .where(
            and(
              inArray(vendorListings.id, addonInputIds),
              eq(vendorListings.listingType, "addon"),
              eq(vendorListings.status, "active")
            )
          );

        if (addonRows.length !== normalizedAddOnInputs.length) {
          return res.status(400).json({ error: "One or more add-ons are not available", code: "addon_not_found" });
        }

        // All add-ons must belong to the same vendor
        const addonVendorIds = Array.from(new Set(addonRows.map((r) => r.accountId)));
        if (addonVendorIds.length > 1) {
          return res.status(400).json({ error: "Add-ons must belong to the same vendor", code: "addon_vendor_mismatch" });
        }

        // For non-a-la-carte: verify all add-ons are linked to the parent listing
        if (!isAlaCarte && listingRow) {
          const linkRows = await db
            .select({ addonListingId: listingAddonLinks.addonListingId })
            .from(listingAddonLinks)
            .where(
              and(
                eq(listingAddonLinks.parentListingId, data.listingId!),
                inArray(listingAddonLinks.addonListingId, addonInputIds)
              )
            );
          const linkedIds = new Set(linkRows.map((r) => r.addonListingId));
          const unlinked = addonInputIds.filter((id) => !linkedIds.has(id));
          if (unlinked.length > 0) {
            return res.status(400).json({ error: "One or more add-ons are not attached to this listing", code: "addon_not_linked" });
          }
        }

        resolvedAddonRows = addonRows.map((row) => {
          const input = normalizedAddOnInputs.find((i) => i.id === row.id);
          return { ...row, requestedQuantity: input?.quantity ?? 1 };
        }) as typeof resolvedAddonRows;
      }

      stage = "load-vendor";
      // For a-la-carte: derive vendor from the add-on listings themselves
      const vendorIdToLoad = listingRow?.accountId ?? resolvedAddonRows[0]?.accountId ?? data.vendorId;
      if (!vendorIdToLoad) {
        return res.status(400).json({ error: "Could not determine vendor for this booking" });
      }

      const [vendorAccount] = await db
        .select({
          id: vendorAccounts.id,
          email: vendorAccounts.email,
          businessName: vendorAccounts.businessName,
          stripeConnectId: vendorAccounts.stripeConnectId,
          stripeOnboardingComplete: vendorAccounts.stripeOnboardingComplete,
          googleConnectionStatus: vendorAccounts.googleConnectionStatus,
          googleCalendarId: vendorAccounts.googleCalendarId,
          shopActive: vendorAccounts.shopActive,
          isMarqueeVendor: vendorAccounts.isMarqueeVendor,
          marqueeHolidayBookingsUsed: vendorAccounts.marqueeHolidayBookingsUsed,
          marqueeHolidayBonusBookings: vendorAccounts.marqueeHolidayBonusBookings,
          marqueeHolidayEndsAt: vendorAccounts.marqueeHolidayEndsAt,
          marqueeRateEndsAt: vendorAccounts.marqueeRateEndsAt,
          marqueeCustomerFeeEndsAt: vendorAccounts.marqueeCustomerFeeEndsAt,
        })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.id, vendorIdToLoad), eq(vendorAccounts.active, true)))
        .limit(1);

      if (!vendorAccount) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      if (data.vendorId && data.vendorId !== vendorAccount.id) {
        return res.status(400).json({ error: "Listing/vendor mismatch" });
      }
      if (!vendorAccount.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
        return res.status(400).json({
          error: "This vendor cannot accept payments yet. Please choose another listing.",
          code: "vendor_payment_not_ready",
        });
      }

      // Block if vendor has closed their shop
      if (vendorAccount.shopActive === false) {
        return res.status(409).json({
          error: "This vendor's shop is currently closed and not accepting bookings.",
          code: "shop_closed",
        });
      }

      // Block if requested date falls inside a vacation block
      const eventDateStr = String(data.eventDate || "").trim().slice(0, 10);
      if (eventDateStr) {
        const vacationConflict = await db
          .select({ id: vendorVacationBlocks.id, startDate: vendorVacationBlocks.startDate, endDate: vendorVacationBlocks.endDate })
          .from(vendorVacationBlocks)
          .where(
            and(
              eq(vendorVacationBlocks.vendorId, vendorAccount.id),
              lte(vendorVacationBlocks.startDate, eventDateStr),
              gte(vendorVacationBlocks.endDate, eventDateStr)
            )
          )
          .limit(1);

        if (vacationConflict.length > 0) {
          const block = vacationConflict[0];
          return res.status(409).json({
            error: `This vendor is unavailable from ${block.startDate} to ${block.endDate}. Please choose a different date.`,
            code: "vacation_block_conflict",
            conflictStart: block.startDate,
            conflictEnd: block.endDate,
          });
        }
      }

      // ── Service radius enforcement ────────────────────────────────────────────
      // Geographic configuration (service center, radius, travelOffered) lives on
      // the container listing for package bookings — the package_item child row has
      // no coordinates of its own. Use containerRow when present so the radius check
      // always reads from the right row regardless of listing type.
      // We only enforce when coordinates are present — if the customer didn't supply
      // event coordinates we allow the booking through (coordinates are optional at
      // checkout for some flows).
      const serviceAreaRow = containerRow ?? listingRow;
      const bookingOutsideServiceRadius =
        serviceAreaRow != null &&
        serviceAreaRow.travelOffered === false &&
        data.eventLocationLat != null &&
        data.eventLocationLng != null
          ? isEventOutsideServiceRadius({
              listingCenterLat: serviceAreaRow.listingServiceCenterLat,
              listingCenterLng: serviceAreaRow.listingServiceCenterLng,
              serviceRadiusMiles: serviceAreaRow.serviceRadiusMiles,
              eventLat: data.eventLocationLat,
              eventLng: data.eventLocationLng,
            })
          : false;

      // Resolve and snapshot the cancellation policy before the booking insert.
      //
      // Package items have their own policy set in the wizard — use that if booking a package.
      // Otherwise fall back to the listing's policy.
      // Both are stored as proper columns (cancellation_policy, cancellation_policy_days).
      // Legacy bookings with no policy snapshot get a full refund by default.
      const policySource = packageRow?.cancellationPolicy ? packageRow : listingRow;
      const bookingCancellationPolicySnapshot: CancellationPolicy = policyFromListingWizard(
        policySource?.cancellationPolicy,
        policySource?.cancellationPolicyDays,
      );

      const listingDataAny = (listingRow?.listingData ?? {}) as any;
      const itemTitle = isAlaCarte
        ? "A-la-carte Bundle"
        : (typeof listingRow?.title === "string" && listingRow.title.trim()) ||
          (typeof listingDataAny?.listingTitle === "string" && listingDataAny.listingTitle.trim()) ||
          "Listing";
      const requestedQuantity =
        typeof data.quantity === "number" && Number.isFinite(data.quantity) && data.quantity > 0
          ? Math.max(1, Math.floor(data.quantity))
          : 1;
      const listingAvailableQuantity = isAlaCarte
        ? 999
        : getListingAvailableQuantity(listingDataAny, listingRow!.quantity);
      if (!isAlaCarte && requestedQuantity > listingAvailableQuantity) {
        return res.status(400).json({
          error: `Only ${listingAvailableQuantity} identical unit${listingAvailableQuantity === 1 ? "" : "s"} available for this listing.`,
          code: "listing_quantity_exceeded",
        });
      }

      let resolvedVendorProfileId =
        listingRow?.profileId && typeof listingRow.profileId === "string" ? listingRow.profileId : null;
      let resolvedVendorTimeZone = normalizeIanaTimeZone(listingRow?.profileOperatingTimezone);
      if (!resolvedVendorProfileId) {
        const profileRows = await db
          .select({
            id: vendorProfiles.id,
            operatingTimezone: vendorProfiles.operatingTimezone,
          })
          .from(vendorProfiles)
          .where(and(eq(vendorProfiles.accountId, vendorAccount.id), eq(vendorProfiles.active, true)))
          .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id))
          .limit(1);
        if (profileRows[0]?.id) {
          resolvedVendorProfileId = profileRows[0].id;
          resolvedVendorTimeZone = normalizeIanaTimeZone(
            profileRows[0].operatingTimezone,
            resolvedVendorTimeZone
          );
          if (listingRow) {
            await db
              .update(vendorListings)
              .set({ profileId: resolvedVendorProfileId, updatedAt: new Date() })
              .where(eq(vendorListings.id, listingRow.id));
          }
        }
      }

      let resolvedBookingEventId: string | null = data.eventId ?? null;
      let resolvedCustomerEvent: { id: string; title: string } | null = null;
      if (requestedCustomerEventId) {
        stage = "resolve-customer-event";
        const [eventRow] = await db
          .select({
            id: events.id,
            title: events.path,
            date: events.date,
          })
          .from(events)
          .where(and(eq(events.id, requestedCustomerEventId), eq(events.customerId, customerAuth.id)))
          .limit(1);

        if (eventRow?.id) {
          resolvedBookingEventId = eventRow.id;
          resolvedCustomerEvent = {
            id: eventRow.id,
            title: eventRow.title || `Event on ${eventRow.date}`,
          };
        } else {
          const options = await getCustomerEventOptions(customerAuth.id);
          const matched = options.find((x) => x.id === requestedCustomerEventId);
          if (!matched) {
            return res.status(400).json({ error: "Selected event was not found for this customer" });
          }
          resolvedCustomerEvent = { id: matched.id, title: matched.title };
        }
      }

      // For a-la-carte bookings, base price is 0 (all cost is in add-ons)
      const basePriceCents = isAlaCarte
        ? 0
        : extractListingBasePriceCents(
            (listingRow!.listingData ?? {}) as any,
            listingRow!.priceCents
          );
      if (!isAlaCarte && (!basePriceCents || basePriceCents <= 0)) {
        return res.status(400).json({ error: "Listing price is not configured" });
      }

      // Compute add-on subtotal
      const addonSubtotalCents = resolvedAddonRows.reduce((sum, addon) => {
        return sum + (addon.priceCents ?? 0) * addon.requestedQuantity;
      }, 0);
      stage = "validate-booking-time-range";
      // Derive event location timezone from coordinates so times are anchored to where
      // the event happens, not where the vendor is based.
      const resolvedEventTimeZone =
        data.eventLocationLat != null && data.eventLocationLng != null
          ? timezoneFromCoords(data.eventLocationLat, data.eventLocationLng)
          : null;
      // Use listing service center timezone as the location fallback — this is where
      // the service is actually offered from, which may differ from the vendor's home base.
      const resolvedListingTimeZone =
        listingRow?.listingServiceCenterLat != null && listingRow?.listingServiceCenterLng != null
          ? timezoneFromCoords(listingRow.listingServiceCenterLat, listingRow.listingServiceCenterLng)
          : null;
      const canonicalBookingTimeRange = computeCanonicalBookingTimeRange({
        listingData: listingRow?.listingData ?? {},
        listingPricingUnit: listingRow?.pricingUnit,
        listingMinimumHours: listingRow?.minimumHours,
        vendorTimeZone: resolvedListingTimeZone ?? resolvedVendorTimeZone,
        eventTimeZone: resolvedEventTimeZone,
        eventDate: data.eventDate,
        eventStartTime: data.eventStartTime ?? null,
        eventEndDate: data.eventEndDate ?? null,
        eventEndTime: data.eventEndTime ?? null,
      });

      stage = "check-listing-conflicts";
      // A-la-carte bookings don't have a primary listing to conflict-check.
      // Addon availability is checked inside the transaction via booking_items.
      //
      // For package_container listings with packageAvailabilityMode='dependent', all
      // package_item variants share the container's capacity pool — so we check
      // availability against the container listing's ID and quantity instead of the
      // individual package_item's values. For 'independent' mode each variant has its
      // own separate capacity and we check against the package_item as usual.
      const isDependentPackage = containerRow?.packageAvailabilityMode === "dependent";
      const conflictCheckListingId = isDependentPackage ? containerRow!.id : listingRow?.id ?? "";
      const conflictCheckQuantity = isDependentPackage
        ? Math.max(1, Math.floor(containerRow!.quantity || 1))
        : listingAvailableQuantity;
      const availabilityCheck = !isAlaCarte && listingRow
        ? await checkListingAvailabilityForBookingRequest({
            vendorAccountId: vendorAccount.id,
            vendorGoogleConnectionStatus: vendorAccount.googleConnectionStatus,
            vendorGoogleCalendarId: vendorAccount.googleCalendarId,
            vendorTimeZone: canonicalBookingTimeRange.vendorTimeZone,
            listingId: conflictCheckListingId,
            listingTitle: itemTitle,
            bookingStartAt: canonicalBookingTimeRange.bookingStartAt,
            bookingEndAt: canonicalBookingTimeRange.bookingEndAt,
            requestedQuantity,
            listingAvailableQuantity: conflictCheckQuantity,
          })
        : { eventHub: { conflict: null }, google: { status: "skipped" as const, conflict: null, reason: null } };

      if (availabilityCheck.eventHub.conflict) {
        return res.status(409).json({
          error: "Not enough listing quantity is available for the requested time range.",
          code: "listing_time_conflict",
          source: "eventhub",
          conflictBookingId: availabilityCheck.eventHub.conflict.id,
          reservedUnits: availabilityCheck.eventHub.conflict.reservedUnits,
          requestedQuantity: availabilityCheck.eventHub.conflict.requestedQuantity,
          availableQuantity: availabilityCheck.eventHub.conflict.availableQuantity,
        });
      }

      if (availabilityCheck.google.status === "failed") {
        // Google API technical failure — log server-side but do not block the booking.
        // Real conflicts (status "checked" with a conflict) are still blocked below.
        // Blocking legitimate bookings because of a transient token/API error is worse
        // than accepting a booking we couldn't fully verify against Google Calendar.
        logger.warn(
          { reason: (availabilityCheck.google as any).reason, message: (availabilityCheck.google as any).message },
          "Google Calendar availability check failed during checkout — proceeding with booking"
        );
      }

      if (availabilityCheck.google.conflict?.event?.id) {
        return res.status(409).json({
          error: "This listing conflicts with an existing Google Calendar event for the same item.",
          code: "listing_time_conflict",
          source: "google",
          matchedBy: availabilityCheck.google.conflict.matchedBy,
          conflictEventId: availabilityCheck.google.conflict.event.id,
          googleAvailabilityStatus: availabilityCheck.google.status,
        });
      }

      const unitPriceCentsTotal = (basePriceCents ?? 0) * requestedQuantity;
      const logisticsFees = getListingLogisticsFeeSummaryCents({
        listingData: listingDataAny,
        canonical: {
          pickupOffered: listingRow?.pickupOffered ?? false,
          deliveryOffered: listingRow?.deliveryOffered ?? false,
          deliveryFeeEnabled: listingRow?.deliveryFeeEnabled ?? false,
          deliveryFeeAmountCents: listingRow?.deliveryFeeAmountCents ?? null,
          setupOffered: listingRow?.setupOffered ?? false,
          setupFeeEnabled: listingRow?.setupFeeEnabled ?? false,
          setupFeeAmountCents: listingRow?.setupFeeAmountCents ?? null,
          takedownOffered:
            typeof listingRow?.takedownOffered === "boolean"
              ? listingRow.takedownOffered
              : (listingDataAny as any)?.takedownOffered ?? (listingDataAny as any)?.takedownIncluded,
          takedownFeeEnabled:
            typeof listingRow?.takedownFeeEnabled === "boolean"
              ? listingRow.takedownFeeEnabled
              : (listingDataAny as any)?.takedownFeeEnabled,
          takedownFeeAmountCents:
            parseIntegerValue((listingRow as any)?.takedownFeeAmountCents) ??
            parseIntegerValue((listingDataAny as any)?.takedownFeeAmountCents) ??
            parseMoneyToCents((listingDataAny as any)?.takedownFeeAmount),
          travelOffered: listingRow?.travelOffered ?? false,
          travelFeeEnabled: listingRow?.travelFeeEnabled ?? false,
          travelFeeType: listingRow?.travelFeeType ?? null,
          travelFeeAmountCents: listingRow?.travelFeeAmountCents ?? null,
        },
      });
      const subtotalAmount =
        unitPriceCentsTotal +
        addonSubtotalCents +
        logisticsFees.deliveryFeeCents +
        logisticsFees.setupFeeCents +
        logisticsFees.takedownFeeCents +
        logisticsFees.travelFlatFeeCents;

      // ── Discount resolution ────────────────────────────────────────────────
      let appliedDiscountId: string | null = null;
      let discountAmountCents = 0;

      const requestedPromoCode =
        typeof data.promoCode === "string" ? data.promoCode.trim().toUpperCase() : null;

      if (requestedPromoCode && listingRow) {
        // Promo code path: validate and apply
        const [promoRow] = await db
          .select({
            id: vendorDiscounts.id,
            percentOff: vendorDiscounts.percentOff,
            active: vendorDiscounts.active,
            startsAt: vendorDiscounts.startsAt,
            endsAt: vendorDiscounts.endsAt,
            maxUses: vendorDiscounts.maxUses,
            usedCount: vendorDiscounts.usedCount,
          })
          .from(vendorDiscounts)
          .innerJoin(discountListings, eq(discountListings.discountId, vendorDiscounts.id))
          .where(
            and(
              eq(vendorDiscounts.code, requestedPromoCode),
              eq(vendorDiscounts.discountType, "promo_code"),
              eq(discountListings.listingId, listingRow.id),
            ),
          )
          .limit(1);

        if (!promoRow) {
          return res.status(400).json({ error: "Promo code not found or not valid for this listing", code: "promo_not_found" });
        }
        if (!promoRow.active) {
          return res.status(400).json({ error: "Promo code is no longer active", code: "promo_not_active" });
        }
        const now = new Date();
        if (now < promoRow.startsAt || now > promoRow.endsAt) {
          return res.status(400).json({ error: "Promo code is not valid at this time", code: "promo_expired" });
        }
        if (promoRow.maxUses !== null && promoRow.usedCount >= promoRow.maxUses) {
          return res.status(400).json({ error: "Promo code has reached its usage limit", code: "promo_cap_reached" });
        }
        appliedDiscountId = promoRow.id;
        discountAmountCents = Math.round(subtotalAmount * promoRow.percentOff / 100);
      } else if (listingRow) {
        // Public sale path: auto-apply if active sale exists for this listing
        const now = new Date();
        const [saleRow] = await db
          .select({
            id: vendorDiscounts.id,
            percentOff: vendorDiscounts.percentOff,
          })
          .from(vendorDiscounts)
          .innerJoin(discountListings, eq(discountListings.discountId, vendorDiscounts.id))
          .where(
            and(
              eq(vendorDiscounts.discountType, "public_sale"),
              eq(vendorDiscounts.active, true),
              eq(discountListings.listingId, listingRow.id),
              lte(vendorDiscounts.startsAt, now),
              gte(vendorDiscounts.endsAt, now),
            ),
          )
          .limit(1);

        if (saleRow) {
          appliedDiscountId = saleRow.id;
          discountAmountCents = Math.round(subtotalAmount * saleRow.percentOff / 100);
        }
      }

      const discountedSubtotal = Math.max(0, subtotalAmount - discountAmountCents);
      // ── End discount resolution ────────────────────────────────────────────

      // ── Marquee Vendor fee rates ───────────────────────────────────────────
      // Fee holiday: 0% vendor fee until 20 bookings AND 30 days have both passed.
      // (whichever comes LAST — holiday stays active until both thresholds are crossed)
      // After holiday: 6% for 24 months, then standard 8%.
      // Customer fee: 2.5% for first 12 months, then standard 5%.
      const isMarqueeVendor = vendorAccount.isMarqueeVendor ?? false;
      const now = new Date();
      let effectiveCustomerFeeRate = CUSTOMER_FEE_RATE;
      let effectiveVendorFeeRate = VENDOR_FEE_RATE;
      if (isMarqueeVendor) {
        // Customer fee window
        const customerFeeActive = vendorAccount.marqueeCustomerFeeEndsAt
          ? now < vendorAccount.marqueeCustomerFeeEndsAt
          : true; // window not yet set (pre-activation) — default to active
        effectiveCustomerFeeRate = customerFeeActive ? MARQUEE_CUSTOMER_FEE_RATE : CUSTOMER_FEE_RATE;

        // Main holiday: active while EITHER booking limit OR time limit is still true
        // (both must expire before the holiday ends — whichever comes LAST)
        const bookingsUsed = vendorAccount.marqueeHolidayBookingsUsed ?? 0;
        const bonusBookings = vendorAccount.marqueeHolidayBonusBookings ?? 0;
        const underMainBookingLimit = bookingsUsed < MARQUEE_HOLIDAY_BOOKING_COUNT;
        const underTimeLimit = vendorAccount.marqueeHolidayEndsAt
          ? now < vendorAccount.marqueeHolidayEndsAt
          : true; // pre-activation
        const mainHolidayActive = underMainBookingLimit || underTimeLimit;

        // Bonus phase: 4% on referral bonus bookings, only after main holiday ends,
        // and only within the 24-month marquee window
        const bonusPhaseActive =
          !mainHolidayActive &&
          bonusBookings > 0 &&
          bookingsUsed < MARQUEE_HOLIDAY_BOOKING_COUNT + bonusBookings;

        if (mainHolidayActive) {
          effectiveVendorFeeRate = 0;
        } else if (bonusPhaseActive) {
          effectiveVendorFeeRate = MARQUEE_REFERRAL_BONUS_FEE_RATE;
        } else if (vendorAccount.marqueeRateEndsAt && now < vendorAccount.marqueeRateEndsAt) {
          effectiveVendorFeeRate = MARQUEE_VENDOR_FEE_RATE;
        } else {
          effectiveVendorFeeRate = VENDOR_FEE_RATE;
        }
      }

      const customerFee = Math.round(discountedSubtotal * effectiveCustomerFeeRate);
      // Security deposit: collected from customer on top of the service total but never
      // paid out to the vendor. Refunded to the customer after the dispute window closes
      // with no open vendor claim, or held by admin until a dispute is resolved.
      const securityDepositCents =
        listingRow?.securityDepositEnabled && listingRow?.securityDepositCents && listingRow.securityDepositCents > 0
          ? Math.round(listingRow.securityDepositCents)
          : 0;
      // Collect the full amount up-front at booking time — service total + security deposit
      // in a single Stripe PaymentIntent. The security deposit is tracked separately in the
      // payments table so it can be partially refunded without touching the service amount.
      // vendorPayout / platformFee are calculated on the service subtotal only — the
      // security deposit is excluded from payout calculations.
      const enforcedTotalAmount = discountedSubtotal + customerFee + securityDepositCents;
      const platformFee = Math.round(discountedSubtotal * effectiveVendorFeeRate);
      const vendorPayout = discountedSubtotal - platformFee;
      const enforcedDepositAmount = enforcedTotalAmount;
      const bookingLifecycle = resolveBookingLifecycleMode({
        listingCategory: listingRow?.category ?? null,
        listingInstantBookEnabled: listingRow?.instantBookEnabled ?? false,
      });
      // Any booking whose event falls outside the listing's service radius must go
      // pending so the vendor can propose a travel fee or decline before confirming,
      // regardless of category or instant-book setting.
      const isDeliveryCategory =
        listingRow?.category === "Rentals" || listingRow?.category === "Catering";
      const idealBookingStatus = bookingOutsideServiceRadius
        ? "pending"
        : bookingLifecycle.initialStatus;
      const bookingVendorProfileId = resolvedVendorProfileId ?? null;
      const customerNotes =
        typeof data.customerNotes === "string" && data.customerNotes.trim().length > 0
          ? data.customerNotes.trim()
          : null;
      const customerQuestions =
        typeof data.customerQuestions === "string" && data.customerQuestions.trim().length > 0
          ? data.customerQuestions.trim()
          : null;

      stage = "insert-booking";
      const bookingInsertResult = await db.transaction(async (tx) => {
        let effectiveStatus: "pending" | "confirmed" = idealBookingStatus;
        let pendingReason: string | null = null;

        if (listingRow) {
          await tx.execute(drizzleSql`select pg_advisory_xact_lock(1, hashtext(${listingRow.id}))`);

          const overlapRows: any = await tx.execute(drizzleSql`
            select
              b.id,
              coalesce(b.booked_quantity, booking_item_totals.quantity, 1) as "quantity"
            from bookings b
            left join lateral (
              select sum(coalesce(bi.quantity, 1))::int as quantity
              from booking_items bi
              where bi.booking_id = b.id
                and bi.listing_id = ${listingRow.id}
            ) booking_item_totals on true
            where (
              b.listing_id = ${listingRow.id}
              or (
                b.listing_id is null
                and exists (
                  select 1
                  from booking_items bi
                  where bi.booking_id = b.id
                    and bi.listing_id = ${listingRow.id}
                )
              )
            )
              and b.status in ('pending', 'confirmed', 'completed')
              and b.booking_start_at is not null
              and b.booking_end_at is not null
              and b.booking_start_at < ${canonicalBookingTimeRange.bookingEndAt}
              and b.booking_end_at > ${canonicalBookingTimeRange.bookingStartAt}
            order by b.booking_start_at asc
          `);

          const overlappingRows = extractRows<{ id?: string | null; quantity?: number | null }>(overlapRows);
          const totalReservedUnits = overlappingRows.reduce((sum, row) => {
            const quantity = parseIntegerValue(row.quantity);
            return sum + (quantity && quantity > 0 ? quantity : 1);
          }, 0);
          if (totalReservedUnits + requestedQuantity > listingAvailableQuantity) {
            fail(409, "Not enough listing quantity is available for the requested time range.", {
              code: "listing_time_conflict",
              source: "eventhub",
              conflictBookingId: overlappingRows[0]?.id ?? null,
              reservedUnits: totalReservedUnits,
              requestedQuantity,
              availableQuantity: listingAvailableQuantity,
            });
          }
        }

        // Gap 2: a-la-carte add-on quantity enforcement with advisory locking.
        // Sort IDs before locking to guarantee consistent acquisition order and prevent deadlocks.
        if (
          isAlaCarte &&
          resolvedAddonRows.length > 0 &&
          canonicalBookingTimeRange.bookingStartAt != null &&
          canonicalBookingTimeRange.bookingEndAt != null
        ) {
          const sortedAddonIds = [...resolvedAddonRows.map((a) => a.id)].sort();
          for (const addonId of sortedAddonIds) {
            await tx.execute(drizzleSql`select pg_advisory_xact_lock(2, hashtext(${addonId}))`);
          }
          for (const addon of resolvedAddonRows) {
            const addonReservedResult: any = await tx.execute(drizzleSql`
              select coalesce(sum(coalesce(bi.quantity, 1)), 0)::int as reserved
              from booking_items bi
              join bookings b on b.id = bi.booking_id
              where bi.listing_id = ${addon.id}
                and b.status in ('pending', 'confirmed', 'completed')
                and b.booking_start_at is not null
                and b.booking_end_at is not null
                and b.booking_start_at < ${canonicalBookingTimeRange.bookingEndAt}
                and b.booking_end_at > ${canonicalBookingTimeRange.bookingStartAt}
            `);
            const reservedQty = extractRows<{ reserved?: number | null }>(addonReservedResult)[0]?.reserved ?? 0;
            if (reservedQty + addon.requestedQuantity > addon.quantity) {
              fail(409, `"${addon.title ?? "Add-on"}" is not available in that quantity for the requested time.`, {
                code: "addon_time_conflict",
                addonId: addon.id,
                reservedUnits: reservedQty,
                requestedQuantity: addon.requestedQuantity,
                availableQuantity: addon.quantity,
              });
            }
          }
        }

        // Gap 1: vendor-level conflict check — if the vendor already has any active
        // booking (across any listing) overlapping this time window, downgrade to
        // pending so the vendor can review before confirming, regardless of instant-book setting.
        if (
          canonicalBookingTimeRange.bookingStartAt != null &&
          canonicalBookingTimeRange.bookingEndAt != null
        ) {
          const vendorConflictResult: any = await tx.execute(drizzleSql`
            select id from bookings
            where vendor_account_id = ${vendorAccount.id}
              and status in ('pending', 'confirmed', 'completed')
              and booking_start_at is not null
              and booking_end_at is not null
              and booking_start_at < ${canonicalBookingTimeRange.bookingEndAt}
              and booking_end_at > ${canonicalBookingTimeRange.bookingStartAt}
            limit 1
          `);
          if (extractRows<{ id: string }>(vendorConflictResult).length > 0) {
            effectiveStatus = "pending";
            pendingReason = "vendor_has_other_booking";
          }
        }

        const effectiveConfirmedAt = effectiveStatus === "confirmed" ? new Date() : null;

        let txBookingEventId = resolvedBookingEventId;
        let txCustomerEvent = resolvedCustomerEvent;
        if (requestedCustomerEventTitle) {
          // Find-or-create: if an event with this title already exists for the customer,
          // reuse it so multiple bookings for the same event share one event record.
          const [existingEvent] = await tx
            .select({ id: events.id, path: events.path })
            .from(events)
            .where(
              and(
                eq(events.customerId, customerAuth.id),
                eq(events.path, requestedCustomerEventTitle)
              )
            )
            .limit(1);

          if (existingEvent?.id) {
            txBookingEventId = existingEvent.id;
            txCustomerEvent = {
              id: existingEvent.id,
              title: existingEvent.path || requestedCustomerEventTitle,
            };
          } else {
            const [createdEvent] = await tx
              .insert(events)
              .values({
                eventType: "custom",
                location: data.eventLocation ?? "TBD",
                date: data.eventDate,
                startTime: data.eventStartTime ?? "00:00",
                guestCount: data.guestCount ?? 1,
                vendorsNeeded: ["rentals"],
                path: requestedCustomerEventTitle,
                customerId: customerAuth.id,
                photographerDetails: null,
                videographerDetails: null,
                floristDetails: null,
                cateringDetails: null,
                djDetails: null,
                propDecorDetails: null,
              })
              .returning({ id: events.id, path: events.path });
            if (createdEvent?.id) {
              txBookingEventId = createdEvent.id;
              txCustomerEvent = {
                id: createdEvent.id,
                title: createdEvent.path || requestedCustomerEventTitle,
              };
            }
          }
        }

        const bookingRows = await tx
          .insert(bookings)
          .values({
            customerId: customerAuth.id,
            vendorAccountId: vendorAccount.id,
            vendorProfileId: bookingVendorProfileId,
            listingId: isAlaCarte ? null : (listingRow?.id ?? null),
            eventId: txBookingEventId,
            packageId: data.packageId ?? null,
            addOnIds: normalizedAddOnInputs.map((a) => a.id),
            eventDate: data.eventDate,
            eventStartTime: data.eventStartTime ?? null,
            eventEndTime: data.eventEndTime ?? null,
                eventLocation: data.eventLocation ?? null,
            eventLocationLat: data.eventLocationLat ?? null,
            eventLocationLng: data.eventLocationLng ?? null,
            outsideServiceRadius: bookingOutsideServiceRadius,
            eventTimezone: resolvedEventTimeZone,
            guestCount: data.guestCount ?? null,
            specialRequests: data.specialRequests ?? null,
            bookingStartAt: canonicalBookingTimeRange.bookingStartAt,
            bookingEndAt: canonicalBookingTimeRange.bookingEndAt,
            vendorTimezoneSnapshot: canonicalBookingTimeRange.vendorTimeZone,
            listingTitleSnapshot: itemTitle,
            pricingUnitSnapshot: canonicalBookingTimeRange.pricingUnit,
            unitPriceCentsSnapshot: basePriceCents,
            bookedQuantity: requestedQuantity,
            deliveryFeeAmountCents: logisticsFees.deliveryFeeCents,
            setupFeeAmountCents: logisticsFees.setupFeeCents,
            travelFeeAmountCents: logisticsFees.travelFlatFeeCents,
            logisticsTotalCents:
              logisticsFees.deliveryFeeCents +
              logisticsFees.setupFeeCents +
              logisticsFees.takedownFeeCents +
              logisticsFees.travelFlatFeeCents,
            baseSubtotalCents: unitPriceCentsTotal,
            subtotalAmountCents: subtotalAmount,
            customerFeeAmountCents: customerFee,
            instantBookSnapshot: bookingLifecycle.isInstantBooking,
            totalAmount: enforcedTotalAmount,
            platformFee,
            vendorPayout,
            depositAmount: enforcedDepositAmount,
            securityDepositCents: securityDepositCents > 0 ? securityDepositCents : undefined,
            finalPaymentStrategy: data.finalPaymentStrategy,
            status: effectiveStatus,
            paymentStatus: "pending",
            payoutStatus: "not_ready",
            confirmedAt: effectiveConfirmedAt,
            cancellationPolicySnapshot: bookingCancellationPolicySnapshot as any,
            appliedDiscountId: appliedDiscountId ?? undefined,
            discountAmountCents: discountAmountCents > 0 ? discountAmountCents : undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        const booking = bookingRows[0];
        if (!booking?.id) {
          fail(500, "Failed to create booking record");
        }

        // Record discount redemption inside the transaction so it's atomic with the booking
        if (appliedDiscountId) {
          await tx.insert(discountRedemptions).values({
            discountId: appliedDiscountId,
            bookingId: booking.id,
          });
          // Atomic cap guard: only increment if used_count < max_uses (or unlimited).
          // If a concurrent request already hit the cap, this UPDATE returns 0 rows
          // and fail() throws, rolling back the entire transaction.
          const capGuardResult = await tx
            .update(vendorDiscounts)
            .set({
              usedCount: drizzleSql`${vendorDiscounts.usedCount} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(vendorDiscounts.id, appliedDiscountId),
                or(
                  isNull(vendorDiscounts.maxUses),
                  drizzleSql`${vendorDiscounts.usedCount} < ${vendorDiscounts.maxUses}`,
                ),
              ),
            )
            .returning({ id: vendorDiscounts.id });
          if (capGuardResult.length === 0) {
            fail(409, "Promo code has reached its usage limit", { code: "promo_cap_reached" });
          }
          // Auto-deactivate if cap hit (re-read usedCount after increment)
          await tx
            .update(vendorDiscounts)
            .set({ active: false, updatedAt: new Date() })
            .where(
              and(
                eq(vendorDiscounts.id, appliedDiscountId),
                drizzleSql`${vendorDiscounts.maxUses} IS NOT NULL`,
                drizzleSql`${vendorDiscounts.usedCount} >= ${vendorDiscounts.maxUses}`,
              ),
            );
        }

        // Insert base booking item (skip for pure a-la-carte bookings with no parent listing)
        if (!isAlaCarte && listingRow) {
          await tx.execute(drizzleSql`
            insert into booking_items (
              booking_id,
              listing_id,
              item_type,
              title,
              quantity,
              unit_price_cents,
              total_price_cents,
              item_data
            ) values (
              ${booking.id},
              ${listingRow.id},
              ${"base"},
              ${itemTitle},
              ${requestedQuantity},
              ${basePriceCents},
              ${unitPriceCentsTotal},
              ${JSON.stringify({
                listingId: listingRow.id,
                packageId: packageRow?.id ?? null,
                vendorAccountId: vendorAccount.id,
                vendorProfileId: resolvedVendorProfileId,
                paymentMethodId: data.paymentMethodId ?? null,
                quantity: requestedQuantity,
                idempotencyKey,
                customerEvent: txCustomerEvent,
                customerNotes,
                customerQuestions,
                feePolicy: {
                  vendorFeeRate: VENDOR_FEE_RATE,
                  customerFeeRate: CUSTOMER_FEE_RATE,
                  customerFeeCents: customerFee,
                },
                logisticsFees: {
                  deliveryFeeCents: logisticsFees.deliveryFeeCents,
                  setupFeeCents: logisticsFees.setupFeeCents,
                  takedownFeeCents: logisticsFees.takedownFeeCents,
                  travelFlatFeeCents: logisticsFees.travelFlatFeeCents,
                  variableTravelFeePending: logisticsFees.variableTravelFeePending,
                },
              })}::jsonb
            )
          `);
        }

        // Insert add-on booking items
        for (const addon of resolvedAddonRows) {
          const addonPriceCents = addon.priceCents ?? 0;
          const addonTotalCents = addonPriceCents * addon.requestedQuantity;
          await tx.execute(drizzleSql`
            insert into booking_items (
              booking_id,
              listing_id,
              item_type,
              title,
              quantity,
              unit_price_cents,
              total_price_cents,
              item_data
            ) values (
              ${booking.id},
              ${addon.id},
              ${"addon"},
              ${addon.title ?? "Add-on"},
              ${addon.requestedQuantity},
              ${addonPriceCents},
              ${addonTotalCents},
              ${"{}"}::jsonb
            )
          `);
        }

        // For a-la-carte: also insert a summary base item with zero price so idempotency key check works
        if (isAlaCarte) {
          await tx.execute(drizzleSql`
            insert into booking_items (
              booking_id,
              listing_id,
              item_type,
              title,
              quantity,
              unit_price_cents,
              total_price_cents,
              item_data
            ) values (
              ${booking.id},
              ${null},
              ${"base"},
              ${"A-la-carte Bundle"},
              ${1},
              ${addonSubtotalCents},
              ${addonSubtotalCents},
              ${JSON.stringify({
                idempotencyKey,
                customerEvent: txCustomerEvent,
                customerNotes,
                customerQuestions,
              })}::jsonb
            )
          `);
        }

        return {
          booking,
          securityDepositCents,
          effectiveStatus,
          pendingReason,
        };
      });

      const booking = bookingInsertResult.booking;
      if (!booking?.id) {
        return res.status(500).json({ error: "Failed to create booking record" });
      }
      const bookingStatus = bookingInsertResult.effectiveStatus;
      const pendingReason = bookingInsertResult.pendingReason ?? null;

      stage = "create-notifications";
      await Promise.allSettled([
        storage.createNotification({
          recipientId: vendorAccount.id,
          recipientType: "vendor",
          type: "new_booking",
          title: `New booking for ${itemTitle}`,
          message:
            bookingStatus === "confirmed"
              ? `You received an instant booking for ${data.eventDate}.`
              : `You received a new booking request for ${data.eventDate}.`,
          link: `/vendor/bookings?bookingId=${encodeURIComponent(booking.id)}`,
          read: false,
        }),
        storage.createNotification({
          recipientId: customerAuth.id,
          recipientType: "customer",
          type: "booking_confirmed",
          title: bookingStatus === "confirmed" ? "Booking confirmed" : "Booking request sent",
          message:
            bookingStatus === "confirmed"
              ? `Your booking for ${data.eventDate} is confirmed.`
              : `Your booking request for ${data.eventDate} was sent.`,
          link: "/dashboard/events",
          read: false,
        }),
      ]);

      // If the event falls outside the listing's service radius, send the vendor
      // an additional notification explaining what action is needed.
      if (booking.outsideServiceRadius) {
        const notifFeeLabel = isDeliveryCategory ? "delivery fee" : "travel fee";
        await storage.createNotification({
          recipientId: vendorAccount.id,
          recipientType: "vendor",
          type: "new_booking" as any,
          title: `Booking outside your service area`,
          message: `The event on ${data.eventDate} is outside your service area. Accept and propose a ${notifFeeLabel}, or decline the booking.`,
          link: `/vendor/bookings?bookingId=${encodeURIComponent(booking.id)}`,
          read: false,
        }).catch(() => { /* non-blocking */ });
      }

      stage = "load-customer-email";
      const [customerRow] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, customerAuth.id))
        .limit(1);

      const serverUrl = appUrl();
      const emailTasks: Promise<any>[] = [];
      // isInstant reflects whether the booking was *actually* confirmed immediately.
      // Outside-radius delivery bookings are forced to pending even when the listing
      // has instant book enabled, so we use bookingStatus rather than isInstantBooking.
      const emailIsInstant = bookingStatus === "confirmed";
      const emailFeeLabel: "delivery fee" | "travel fee" =
        isDeliveryCategory ? "delivery fee" : "travel fee";

      const emailAddOns = resolvedAddonRows.map((a) => ({
        title: a.title ?? "Add-on",
        priceCents: (a.priceCents ?? 0) * a.requestedQuantity,
      }));
      const emailPackageName = packageRow?.title ?? null;
      const emailPriceBreakdown = {
        basePriceCents: isAlaCarte ? null : unitPriceCentsTotal,
        deliveryFeeAmountCents: logisticsFees.deliveryFeeCents || null,
        setupFeeAmountCents: logisticsFees.setupFeeCents || null,
        travelFeeAmountCents: logisticsFees.travelFlatFeeCents || null,
        discountAmountCents: discountAmountCents > 0 ? discountAmountCents : null,
        serviceFeeAmountCents: customerFee > 0 ? customerFee : null,
        securityDepositCents: securityDepositCents > 0 ? securityDepositCents : null,
      };

      if (customerRow?.email) {
        emailTasks.push(
          sendBookingRequestedEmail(customerRow.email, {
            recipientName: customerRow.name || "Customer",
            counterpartName: vendorAccount.businessName || "Vendor",
            eventDate: data.eventDate,
            listingTitle: itemTitle || "Service",
            packageName: emailPackageName,
            addOns: emailAddOns,
            ...emailPriceBreakdown,
            totalAmountCents: enforcedTotalAmount,
            role: "customer",
            isInstant: emailIsInstant,
            outsideServiceRadius: bookingOutsideServiceRadius,
            feeLabel: emailFeeLabel,
            serverUrl,
          })
        );
      }
      if (vendorAccount.email) {
        emailTasks.push(
          sendBookingRequestedEmail(vendorAccount.email, {
            recipientName: vendorAccount.businessName || "Vendor",
            counterpartName: customerRow?.name || "Customer",
            eventDate: data.eventDate,
            listingTitle: itemTitle || "Service",
            packageName: emailPackageName,
            addOns: emailAddOns,
            ...emailPriceBreakdown,
            totalAmountCents: enforcedTotalAmount,
            role: "vendor",
            isInstant: emailIsInstant,
            outsideServiceRadius: bookingOutsideServiceRadius,
            feeLabel: emailFeeLabel,
            serverUrl,
          })
        );
      }
      await Promise.allSettled(emailTasks);

      logEvent(
        bookingStatus === "confirmed" ? "booking_confirmed" : "booking_request_created",
        "customer",
        customerAuth.id,
        { booking_id: booking.id, listing_id: (booking as any).listingId ?? null, vendor_id: (booking as any).vendorAccountId ?? null, status: bookingStatus }
      );

      await syncBookingToGoogleCalendarSafely(booking.id, "/api/bookings google-sync");

      return res.status(201).json({
        ...booking,
        pendingReason,
        securityDepositCents: bookingInsertResult.securityDepositCents,
        payoutReleaseMode: PAYOUT_RELEASE_MODE,
      });
    } catch (error: any) {
      const errorStatus = typeof error?.status === "number" ? error.status : null;
      const errorDetails =
        error?.details && typeof error.details === "object" ? error.details : {};
      if (errorStatus) {
        return res.status(errorStatus).json({
          error: error?.message || "Booking request failed",
          ...errorDetails,
        });
      }
      if (
        stage === "validate-payload" ||
        stage === "validate-booking-time-range" ||
        stage === "check-listing-conflicts"
      ) {
        return res.status(400).json({ error: error?.message || "Invalid booking payload" });
      }
      console.error(`[POST /api/bookings] Unexpected error at stage="${stage}":`, error?.message ?? error);
      const isDev = process.env.NODE_ENV !== "production";
      return res.status(500).json({
        error: "Failed to create booking",
        ...(isDev ? { detail: error?.message, stage } : {}),
      });
    }

  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Travel Fee Proposals
  // ─────────────────────────────────────────────────────────────────────────────
  // POST   /api/bookings/:bookingId/travel-fee-proposals             — vendor proposes
  // GET    /api/bookings/:bookingId/travel-fee-proposals             — customer list
  // GET    /api/vendor/bookings/:bookingId/travel-fee-proposals      — vendor list
  // PATCH  /api/bookings/:bookingId/travel-fee-proposals/:id/accept  — customer accepts
  // PATCH  /api/bookings/:bookingId/travel-fee-proposals/:id/decline — customer declines

  const proposeSchema = z.object({
    amountCents: z.number().int().min(1).max(100_000_00),
    reason: z.string().max(500).optional(),
  });

  app.post(
    "/api/bookings/:bookingId/travel-fee-proposals",
    mutationRateLimiter,
    requireDualAuthAuth0,
    async (req, res) => {
      try {
        const { bookingId } = req.params;
        const vendorId = typeof (req as any)?.vendorAuth?.id === "string" ? (req as any).vendorAuth.id.trim() : "";
        if (!vendorId) return res.status(401).json({ error: "Vendor authentication required" });

        const data = proposeSchema.parse(req.body);

        const [booking] = await db
          .select({
            id: bookings.id,
            vendorAccountId: bookings.vendorAccountId,
            customerId: bookings.customerId,
            status: bookings.status,
            eventDate: bookings.eventDate,
            outsideServiceRadius: bookings.outsideServiceRadius,
          })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!booking) return res.status(404).json({ error: "Booking not found" });
        if (booking.vendorAccountId !== vendorId) return res.status(403).json({ error: "Access denied" });
        // Allow proposals when pending, or when confirmed but location is outside the service
        // radius (vendor must still confirm the out-of-area booking).
        const canPropose =
          booking.status === "pending" ||
          (booking.status === "confirmed" && booking.outsideServiceRadius === true);
        if (!canPropose) {
          return res.status(409).json({ error: "Travel fee proposals can only be sent before accepting a booking" });
        }

        const [existingPending] = await db
          .select({ id: travelFeeProposals.id })
          .from(travelFeeProposals)
          .where(
            and(
              eq(travelFeeProposals.bookingId, bookingId),
              eq(travelFeeProposals.status, "pending")
            )
          )
          .limit(1);

        if (existingPending) {
          return res.status(409).json({ error: "A pending travel fee proposal already exists for this booking" });
        }

        const [proposal] = await db
          .insert(travelFeeProposals)
          .values({
            bookingId,
            vendorAccountId: vendorId,
            amountCents: data.amountCents,
            reason: data.reason ?? null,
            status: "pending",
          })
          .returning();

        const [vendorRow] = await db
          .select({ businessName: vendorAccounts.businessName })
          .from(vendorAccounts)
          .where(eq(vendorAccounts.id, vendorId))
          .limit(1);

        const amountFormatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
          .format(data.amountCents / 100);

        await sendBookingSystemMessage({
          bookingId,
          text: `${vendorRow?.businessName ?? "Vendor"} has proposed a travel/delivery fee of ${amountFormatted}${data.reason ? ` — "${data.reason}"` : ""}. Please review and respond below.`,
          metadata: { proposal_id: proposal.id, proposal_status: "pending", amount_cents: data.amountCents },
        });

        if (booking.customerId) {
          storage.createNotification({
            recipientId: booking.customerId,
            recipientType: "customer",
            type: "travel_fee_proposed" as any,
            title: "Travel fee proposed",
            message: `${vendorRow?.businessName ?? "Your vendor"} proposed a travel/delivery fee of ${amountFormatted} for your booking on ${booking.eventDate}.`,
            link: "/dashboard/events",
            read: false,
          }).catch(() => {});

          // Email customer about the proposed fee (non-blocking)
          db.execute(drizzleSql`
            select u.email as "customerEmail", u.name as "customerName",
                   coalesce(b.listing_title_snapshot, '') as "listingTitle",
                   vl.category as "listingCategory"
            from bookings b
            join users u on u.id = b.customer_id
            left join vendor_listings vl on vl.id = b.listing_id
            where b.id = ${bookingId}
            limit 1
          `).then((rows: any) => {
            const [info] = extractRows<{
              customerEmail?: string | null;
              customerName?: string | null;
              listingTitle?: string | null;
              listingCategory?: string | null;
            }>(rows);
            if (!info?.customerEmail) return;
            const feeLabel: "travel fee" | "delivery fee" =
              info.listingCategory === "Rentals" || info.listingCategory === "Catering"
                ? "delivery fee"
                : "travel fee";
            sendTravelFeeProposedEmail(info.customerEmail, {
              recipientName: info.customerName || "Customer",
              vendorName: vendorRow?.businessName || "Vendor",
              listingTitle: info.listingTitle || "your booking",
              eventDate: booking.eventDate ?? "",
              amountCents: data.amountCents,
              reason: data.reason ?? null,
              feeLabel,
              serverUrl: appUrl(),
            });
          }).catch(() => {});
        }

        return res.status(201).json(proposal);
      } catch (error: any) {
        if (error?.name === "ZodError") return res.status(400).json({ error: "Invalid proposal payload" });
        return res.status(500).json({ error: "Failed to create proposal" });
      }
    }
  );

  app.get(
    "/api/bookings/:bookingId/travel-fee-proposals",
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId } = req.params;
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

        const [booking] = await db
          .select({ id: bookings.id, customerId: bookings.customerId })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!booking) return res.status(404).json({ error: "Booking not found" });
        if (booking.customerId !== customerAuth.id) return res.status(403).json({ error: "Access denied" });

        const proposals = await db
          .select()
          .from(travelFeeProposals)
          .where(eq(travelFeeProposals.bookingId, bookingId))
          .orderBy(desc(travelFeeProposals.createdAt));

        return res.json(proposals);
      } catch {
        return res.status(500).json({ error: "Failed to load proposals" });
      }
    }
  );

  app.get(
    "/api/vendor/bookings/:bookingId/travel-fee-proposals",
    requireDualAuthAuth0,
    async (req, res) => {
      try {
        const { bookingId } = req.params;
        const vendorId = typeof (req as any)?.vendorAuth?.id === "string" ? (req as any).vendorAuth.id.trim() : "";
        if (!vendorId) return res.status(401).json({ error: "Vendor authentication required" });

        const [booking] = await db
          .select({ id: bookings.id, vendorAccountId: bookings.vendorAccountId })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!booking) return res.status(404).json({ error: "Booking not found" });
        if (booking.vendorAccountId !== vendorId) return res.status(403).json({ error: "Access denied" });

        const proposals = await db
          .select()
          .from(travelFeeProposals)
          .where(eq(travelFeeProposals.bookingId, bookingId))
          .orderBy(desc(travelFeeProposals.createdAt));

        return res.json(proposals);
      } catch {
        return res.status(500).json({ error: "Failed to load proposals" });
      }
    }
  );

  app.patch(
    "/api/bookings/:bookingId/travel-fee-proposals/:proposalId/accept",
    mutationRateLimiter,
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId, proposalId } = req.params;
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) return res.status(401).json({ error: "Customer authentication required" });

        const [booking] = await db
          .select({
            id: bookings.id,
            customerId: bookings.customerId,
            vendorAccountId: bookings.vendorAccountId,
            eventDate: bookings.eventDate,
            listingId: bookings.listingId,
          })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!booking) return res.status(404).json({ error: "Booking not found" });
        if (booking.customerId !== customerAuth.id) return res.status(403).json({ error: "Access denied" });

        const [proposal] = await db
          .select()
          .from(travelFeeProposals)
          .where(
            and(
              eq(travelFeeProposals.id, proposalId),
              eq(travelFeeProposals.bookingId, bookingId)
            )
          )
          .limit(1);

        if (!proposal) return res.status(404).json({ error: "Proposal not found" });
        if (proposal.status !== "pending") return res.status(409).json({ error: "Proposal is no longer pending" });

        // Look up vendor Stripe account to create the PaymentIntent
        const [vendorAccount] = booking.vendorAccountId
          ? await db
              .select({
                id: vendorAccounts.id,
                stripeConnectId: vendorAccounts.stripeConnectId,
                stripeOnboardingComplete: vendorAccounts.stripeOnboardingComplete,
              })
              .from(vendorAccounts)
              .where(eq(vendorAccounts.id, booking.vendorAccountId))
              .limit(1)
          : [null];

        if (!vendorAccount?.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
          return res.status(400).json({ error: "Vendor payment processing not set up" });
        }

        const { createBookingPaymentIntent } = await import("../stripe");
        const stripeProcessingFeeEstimate = estimateStripeProcessingFeeCents(proposal.amountCents);
        const platformFeeAmount = Math.round(proposal.amountCents * VENDOR_FEE_RATE);
        const vendorNetPayoutAmount = Math.max(0, proposal.amountCents - platformFeeAmount);

        const paymentIntent = await createBookingPaymentIntent({
          amount: proposal.amountCents,
          platformFeeAmount,
          vendorNetPayoutAmount,
          vendorGrossAmount: proposal.amountCents,
          stripeProcessingFeeEstimate,
          vendorStripeAccountId: vendorAccount.stripeConnectId,
          vendorAccountId: booking.vendorAccountId ?? undefined,
          description: `Travel fee – booking ${bookingId}`,
          bookingId,
          paymentType: "travel_fee",
          idempotencyKey: `travel-fee:${proposalId}`,
        });

        await db.insert(payments).values({
          bookingId,
          customerId: booking.customerId,
          vendorAccountId: booking.vendorAccountId ?? undefined,
          stripePaymentIntentId: paymentIntent.id,
          amount: proposal.amountCents,
          totalAmount: proposal.amountCents,
          platformFeeAmount,
          vendorGrossAmount: proposal.amountCents,
          vendorNetPayoutAmount,
          stripeProcessingFeeEstimate,
          stripeConnectedAccountId: vendorAccount.stripeConnectId,
          paymentType: "travel_fee",
          status: "pending",
          payoutStatus: "not_ready",
        }).onConflictDoNothing();

        // Do NOT mark the proposal as accepted yet — wait until the customer
        // completes payment via the confirm-payment endpoint. This prevents the
        // chat from showing "Payment is being processed" if the user cancels.
        return res.json({
          clientSecret: paymentIntent.client_secret,
          amountCents: proposal.amountCents,
          proposalId: proposal.id,
        });
      } catch {
        return res.status(500).json({ error: "Failed to accept proposal" });
      }
    }
  );

  // Confirm that a travel fee PaymentIntent actually succeeded and finalize the proposal.
  // Called by the client after Stripe card confirmation succeeds.
  app.post(
    "/api/bookings/:bookingId/travel-fee-proposals/:proposalId/confirm-payment",
    mutationRateLimiter,
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId, proposalId } = req.params;
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) return res.status(401).json({ error: "Customer authentication required" });

        const [booking] = await db
          .select({
            id: bookings.id,
            customerId: bookings.customerId,
            vendorAccountId: bookings.vendorAccountId,
            eventDate: bookings.eventDate,
          })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!booking) return res.status(404).json({ error: "Booking not found" });
        if (booking.customerId !== customerAuth.id) return res.status(403).json({ error: "Access denied" });

        const [proposal] = await db
          .select()
          .from(travelFeeProposals)
          .where(and(eq(travelFeeProposals.id, proposalId), eq(travelFeeProposals.bookingId, bookingId)))
          .limit(1);

        if (!proposal) return res.status(404).json({ error: "Proposal not found" });
        // Idempotent: if already accepted just return success
        if (proposal.status === "accepted") return res.json({ proposal });
        if (proposal.status !== "pending") return res.status(409).json({ error: "Proposal is not in a payable state" });

        // Look up the travel fee payment record to get the Stripe PaymentIntent ID
        const [travelPayment] = await db
          .select({ stripePaymentIntentId: payments.stripePaymentIntentId })
          .from(payments)
          .where(
            and(
              eq(payments.bookingId, bookingId),
              eq(payments.paymentType, "travel_fee" as any)
            )
          )
          .limit(1);

        if (!travelPayment?.stripePaymentIntentId) {
          return res.status(400).json({ error: "No travel fee payment record found. Please start the payment again." });
        }

        // Verify with Stripe that payment actually succeeded
        const { stripeClient } = await import("../stripe");
        const pi = await stripeClient.paymentIntents.retrieve(travelPayment.stripePaymentIntentId);
        if (pi.status !== "succeeded" && pi.status !== "processing") {
          return res.status(402).json({ error: "Payment has not completed. Please try again." });
        }

        // Mark proposal as accepted
        const [updated] = await db
          .update(travelFeeProposals)
          .set({ status: "accepted", respondedAt: new Date(), updatedAt: new Date() })
          .where(eq(travelFeeProposals.id, proposalId))
          .returning();

        // Payment record status is updated by the Stripe webhook when the
        // PaymentIntent fires payment_intent.succeeded — no manual update needed here.

        const amountFormatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
          .format(proposal.amountCents / 100);

        await sendBookingSystemMessage({
          bookingId,
          text: `The travel/delivery fee of ${amountFormatted} has been paid.`,
          metadata: { proposal_id: proposalId, proposal_status: "accepted" },
        });

        if (booking.vendorAccountId) {
          storage.createNotification({
            recipientId: booking.vendorAccountId,
            recipientType: "vendor",
            type: "travel_fee_accepted" as any,
            title: "Travel fee paid",
            message: `The customer paid the travel/delivery fee of ${amountFormatted} for the booking on ${booking.eventDate}.`,
            link: `/vendor/bookings?bookingId=${encodeURIComponent(bookingId)}`,
            read: false,
          }).catch(() => {});

          // Email vendor that the fee was paid (non-blocking)
          db.execute(drizzleSql`
            select va.email as "vendorEmail", va.business_name as "vendorName",
                   u.name as "customerName",
                   coalesce(b.listing_title_snapshot, '') as "listingTitle",
                   vl.category as "listingCategory"
            from bookings b
            join vendor_accounts va on va.id = b.vendor_account_id
            join users u on u.id = b.customer_id
            left join vendor_listings vl on vl.id = b.listing_id
            where b.id = ${bookingId}
            limit 1
          `).then((rows: any) => {
            const [info] = extractRows<{
              vendorEmail?: string | null;
              vendorName?: string | null;
              customerName?: string | null;
              listingTitle?: string | null;
              listingCategory?: string | null;
            }>(rows);
            if (!info?.vendorEmail) return;
            const feeLabel: "travel fee" | "delivery fee" =
              info.listingCategory === "Rentals" || info.listingCategory === "Catering"
                ? "delivery fee"
                : "travel fee";
            sendTravelFeeRespondedEmail(info.vendorEmail, {
              recipientName: info.vendorName || "Vendor",
              customerName: info.customerName || "Customer",
              listingTitle: info.listingTitle || "your booking",
              eventDate: booking.eventDate ?? "",
              amountCents: proposal.amountCents,
              action: "accepted",
              feeLabel,
              serverUrl: appUrl(),
            });
          }).catch(() => {});
        }

        return res.json({ proposal: updated });
      } catch (err) {
        console.error("[confirm-payment] Unexpected error:", err);
        return res.status(500).json({ error: "Failed to confirm travel fee payment" });
      }
    }
  );

  app.patch(
    "/api/bookings/:bookingId/travel-fee-proposals/:proposalId/decline",
    mutationRateLimiter,
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId, proposalId } = req.params;
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) return res.status(401).json({ error: "Customer authentication required" });

        const [booking] = await db
          .select({
            id: bookings.id,
            customerId: bookings.customerId,
            vendorAccountId: bookings.vendorAccountId,
            eventDate: bookings.eventDate,
          })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!booking) return res.status(404).json({ error: "Booking not found" });
        if (booking.customerId !== customerAuth.id) return res.status(403).json({ error: "Access denied" });

        const [proposal] = await db
          .select()
          .from(travelFeeProposals)
          .where(
            and(
              eq(travelFeeProposals.id, proposalId),
              eq(travelFeeProposals.bookingId, bookingId)
            )
          )
          .limit(1);

        if (!proposal) return res.status(404).json({ error: "Proposal not found" });
        if (proposal.status !== "pending") return res.status(409).json({ error: "Proposal is no longer pending" });

        const [updated] = await db
          .update(travelFeeProposals)
          .set({ status: "declined", respondedAt: new Date(), updatedAt: new Date() })
          .where(eq(travelFeeProposals.id, proposalId))
          .returning();

        const amountFormatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
          .format(proposal.amountCents / 100);

        await sendBookingSystemMessage({
          bookingId,
          text: `The travel/delivery fee of ${amountFormatted} was declined. The vendor may propose a revised amount or cancel the booking.`,
          metadata: { proposal_id: proposalId, proposal_status: "declined" },
        });

        if (booking.vendorAccountId) {
          storage.createNotification({
            recipientId: booking.vendorAccountId,
            recipientType: "vendor",
            type: "travel_fee_declined" as any,
            title: "Travel fee declined",
            message: `The customer declined the travel/delivery fee of ${amountFormatted} for the booking on ${booking.eventDate}. You can propose a revised amount or proceed without the fee.`,
            link: `/vendor/bookings?bookingId=${encodeURIComponent(bookingId)}`,
            read: false,
          }).catch(() => {});

          // Email vendor that the fee was declined (non-blocking)
          db.execute(drizzleSql`
            select va.email as "vendorEmail", va.business_name as "vendorName",
                   u.name as "customerName",
                   coalesce(b.listing_title_snapshot, '') as "listingTitle",
                   vl.category as "listingCategory"
            from bookings b
            join vendor_accounts va on va.id = b.vendor_account_id
            join users u on u.id = b.customer_id
            left join vendor_listings vl on vl.id = b.listing_id
            where b.id = ${bookingId}
            limit 1
          `).then((rows: any) => {
            const [info] = extractRows<{
              vendorEmail?: string | null;
              vendorName?: string | null;
              customerName?: string | null;
              listingTitle?: string | null;
              listingCategory?: string | null;
            }>(rows);
            if (!info?.vendorEmail) return;
            const feeLabel: "travel fee" | "delivery fee" =
              info.listingCategory === "Rentals" || info.listingCategory === "Catering"
                ? "delivery fee"
                : "travel fee";
            sendTravelFeeRespondedEmail(info.vendorEmail, {
              recipientName: info.vendorName || "Vendor",
              customerName: info.customerName || "Customer",
              listingTitle: info.listingTitle || "your booking",
              eventDate: booking.eventDate ?? "",
              amountCents: proposal.amountCents,
              action: "declined",
              feeLabel,
              serverUrl: appUrl(),
            });
          }).catch(() => {});
        }

        return res.json({ proposal: updated });
      } catch {
        return res.status(500).json({ error: "Failed to decline proposal" });
      }
    }
  );

  app.post(
    "/api/bookings/:bookingId/refund",
    paymentRateLimiter,
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId } = req.params;
        const requestedReason =
          typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) {
          return res.status(401).json({ error: "Customer authentication required" });
        }

        const [booking] = await db
          .select({
            id: bookings.id,
            customerId: bookings.customerId,
            depositPaidAt: bookings.depositPaidAt,
          })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!booking) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (!booking.customerId || booking.customerId !== customerAuth.id) {
          return res.status(403).json({ error: "You do not have access to this booking" });
        }

        if (booking.depositPaidAt) {
          const hoursSinceDeposit = (Date.now() - booking.depositPaidAt.getTime()) / (1000 * 60 * 60);
          if (hoursSinceDeposit > 72) {
            return res.status(400).json({ error: "Refund period has expired (72 hours)" });
          }
        }

        const depositPaymentRows = await db
          .select({
            id: payments.id,
            bookingId: payments.bookingId,
            stripePaymentIntentId: payments.stripePaymentIntentId,
            amount: payments.amount,
            status: payments.status,
          })
          .from(payments)
          .where(and(eq(payments.bookingId, bookingId), eq(payments.paymentType, "booking")))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        const depositPayment = depositPaymentRows[0];

        if (!depositPayment) {
          return res.status(400).json({ error: "No deposit payment found" });
        }
        if (depositPayment.status === "refunded") {
          return res.json({ message: "Booking refund already processed" });
        }
        if (!isPaymentSucceededStatus(depositPayment.status)) {
          return res.status(400).json({ error: "Deposit payment is not in a refundable state" });
        }

        const stripeReason =
          requestedReason === "duplicate" ||
          requestedReason === "fraudulent" ||
          requestedReason === "requested_by_customer"
            ? requestedReason
            : "requested_by_customer";

        const { refundBookingPayment } = await import("../stripe");
        const refund = await refundBookingPayment({
          paymentIntentId: depositPayment.stripePaymentIntentId,
          reason: stripeReason,
          idempotencyKey: `booking-refund:${bookingId}:${depositPayment.id}`,
        });

        const now = new Date();
        await db.transaction(async (tx) => {
          await tx
            .update(payments)
            .set({
              status: "refunded",
              refundAmount: depositPayment.amount,
              refundReason: requestedReason || stripeReason,
              refundedAt: now,
              payoutStatus: "cancelled",
              payoutEligibleAt: null,
              payoutBlockedReason: "fully_refunded",
              payoutAdjustedAmount: 0,
            })
            .where(eq(payments.id, depositPayment.id));

          // Cancel any other pending payments on this booking (belt-and-suspenders)
          await tx
            .update(payments)
            .set({
              status: "refunded",
              refundAmount: depositPayment.amount,
              refundReason: requestedReason || stripeReason,
              refundedAt: now,
              payoutStatus: "cancelled",
              payoutEligibleAt: null,
              payoutBlockedReason: "fully_refunded",
              payoutAdjustedAmount: 0,
            })
            .where(
              and(
                eq(payments.bookingId, bookingId),
                eq(payments.status, "pending")
              )
            );

          await tx
            .update(bookings)
            .set({
              status: "cancelled",
              paymentStatus: "refunded",
              cancellationReason: requestedReason || stripeReason,
              cancelledAt: now,
              updatedAt: now,
            })
            .where(eq(bookings.id, bookingId));

          await recomputeBookingPaymentStatusInTx(tx, bookingId);
        });

        await syncBookingToGoogleCalendarSafely(bookingId, "/api/bookings/:bookingId/refund google-sync");

        return res.json({ refund, message: "Booking cancelled and refund processed" });
      } catch {
        return res.status(500).json({ error: "Unable to process refund" });
      }
    }
  );
}
