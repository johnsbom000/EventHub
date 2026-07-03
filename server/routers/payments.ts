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
  reconcileVendorStripeOnboarding,
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
  getDisputeCaseStatusInTx,
  refreshPaymentPayoutStateInTx,
  processSinglePayoutCandidate,
  ensurePaymentRecordForIntentInTx,
  initializeBookingPayment,
  applyPaymentIntentSuccessInTx,
  applyPaymentIntentFailureInTx,
} from "../services/paymentService";
import {
  firePaymentSucceededSideEffects,
  reconcilePaymentIntent,
} from "../services/paymentReconcile";
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
import {
  applyStripeSubscriptionToVendor,
  markVendorSubscriptionCanceled,
} from "./billing";
import { registerGoogleRoutes } from "../routers/google";
import { registerBoardRoutes } from "../routers/boards";
import { registerCircumventionRoutes } from "../routers/circumvention";
import { createNotification } from "../lib/notificationHelpers";
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
  disconnectGoogleCalendarForVendor,
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
  parseOptionalBooleanFlag,
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

const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET env var is required but not set.");
}

export function registerPaymentRoutes(app: Express): void {


  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/bookings/:bookingId/initialize-payment
  // Creates (or retrieves) the Stripe PaymentIntent for a booking's total charge.
  // Returns a clientSecret the client uses to confirm payment with Stripe.js.
  // ─────────────────────────────────────────────────────────────────────────────

  app.post(
    "/api/bookings/:bookingId/initialize-payment",
    paymentRateLimiter,
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId } = req.params;
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) {
          return res.status(401).json({ error: "Customer authentication required" });
        }
        const customerEmail = asTrimmedString(customerAuth.email) || "";
        const initialized = await initializeBookingPayment({
          bookingId,
          customerId: customerAuth.id,
          customerEmail,
        });
        return res.json({
          bookingId: initialized.booking.id,
          clientSecret: initialized.clientSecret,
          paymentIntentId: initialized.paymentIntentId,
          payoutReleaseMode: PAYOUT_RELEASE_MODE,
        });
      } catch (error: any) {
        const message = String(error?.message || "");
        if (
          message.includes("already been completed") ||
          message.includes("already been refunded") ||
          message.includes("currently disputed") ||
          message.includes("no longer payable")
        ) {
          return res.status(409).json({ error: message });
        }
        if (message.includes("Booking not found")) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (message.includes("do not have access")) {
          return res.status(403).json({ error: "You do not have access to this booking" });
        }
        if (message.includes("Vendor payment processing not set up")) {
          return res.status(400).json({ error: "Vendor payment processing not set up" });
        }
        return res.status(500).json({ error: "Unable to initialize payment" });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // POST /api/bookings/:bookingId/reconcile-payment
  // Synchronous fallback the client calls right after confirmCardPayment succeeds.
  // Authoritatively checks Stripe and marks the booking paid without waiting for
  // the webhook — so a lost/late webhook can't leave a paid booking stuck pending
  // (and then get reaped by the expiry job). Idempotent and safe to retry.
  // ─────────────────────────────────────────────────────────────────────────────
  app.post(
    "/api/bookings/:bookingId/reconcile-payment",
    paymentRateLimiter,
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId } = req.params;
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) {
          return res.status(401).json({ error: "Customer authentication required" });
        }

        // Verify the caller owns the booking and grab its PaymentIntent id from
        // the booking-type payment row (populated at initialize-payment). We never
        // trust a client-supplied PaymentIntent id.
        const [row] = await db
          .select({
            customerId: bookings.customerId,
            status: bookings.status,
            paymentStatus: bookings.paymentStatus,
            paymentIntentId: payments.stripePaymentIntentId,
          })
          .from(bookings)
          .leftJoin(
            payments,
            and(eq(payments.bookingId, bookings.id), eq(payments.paymentType, "booking"))
          )
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (!row) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (row.customerId !== customerAuth.id) {
          return res.status(403).json({ error: "You do not have access to this booking" });
        }

        const paymentIntentId = asTrimmedString(row.paymentIntentId);
        if (!paymentIntentId) {
          // Nothing initialized yet — nothing to reconcile.
          return res.json({ status: row.status, paymentStatus: row.paymentStatus, reconciled: false });
        }

        await reconcilePaymentIntent(paymentIntentId, { source: "sync_reconcile" });

        // Return the freshest booking state after reconciliation.
        const [updated] = await db
          .select({ status: bookings.status, paymentStatus: bookings.paymentStatus })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);

        return res.json({
          status: updated?.status ?? row.status,
          paymentStatus: updated?.paymentStatus ?? row.paymentStatus,
          reconciled: true,
        });
      } catch (error: any) {
        return respondWithInternalServerError(req, res, error);
      }
    }
  );

  // Note: the legacy hosted-checkout destination-charge routes
  // (POST/GET /api/checkout/session) and stripe.createCheckoutSession were
  // removed — they had no client callers and bypassed the 72h payout hold +
  // eligibility checks. All real payments go through the booking payment-intent
  // flow (separate charges & transfers). The checkout.session.completed webhook
  // handler below is retained for defensiveness.

  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      await ensureStripeWebhookTable();

      const signatureHeader = req.headers["stripe-signature"];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      if (!signature) {
        return res.status(400).json({ error: "Missing Stripe signature" });
      }

      const webhookSecret = STRIPE_WEBHOOK_SECRET;

      if (!(req.rawBody instanceof Buffer)) {
        return res.status(400).json({ error: "Missing raw request body — ensure express.json verify middleware is active" });
      }
      const rawBody = req.rawBody;
      const { stripe } = await import("../stripe");

      let event: any;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        return res.status(400).json({ error: "Invalid Stripe signature" });
      }

      if (process.env.NODE_ENV === "production" && !event.livemode) {
        return res.status(400).json({ error: "Test-mode events rejected in production" });
      }

      const insertedRows = await db
        .insert(stripeWebhookEvents)
        .values({
          eventId: event.id,
          eventType: event.type,
          livemode: Boolean(event.livemode),
          payload: event,
        })
        .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
        .returning({ id: stripeWebhookEvents.id });

      if (insertedRows.length === 0) {
        // The event was received before, but only skip it if that earlier
        // delivery actually finished processing. If processed_at is still
        // null, the prior attempt failed — let this retry process it.
        const [existingEvent] = await db
          .select({ processedAt: stripeWebhookEvents.processedAt })
          .from(stripeWebhookEvents)
          .where(eq(stripeWebhookEvents.eventId, event.id))
          .limit(1);
        if (existingEvent?.processedAt) {
          return res.json({ received: true, duplicate: true });
        }
      }

      const eventType = asTrimmedString(event?.type);
      if (
        eventType === "payment_intent.succeeded" ||
        eventType === "payment_intent.payment_failed"
      ) {
        const paymentIntent = event?.data?.object ?? {};
        const paymentIntentId = asTrimmedString(paymentIntent?.id);
        if (paymentIntentId) {
          const metadata = paymentIntent?.metadata && typeof paymentIntent.metadata === "object"
            ? paymentIntent.metadata
            : {};
          const fallbackBookingId = asTrimmedString((metadata as any)?.bookingId);
          const fallbackPaymentType = asTrimmedString((metadata as any)?.paymentType);
          const fallbackAmount = parseIntegerValue(paymentIntent?.amount);
          const fallbackTotalAmount =
            parseIntegerValue((metadata as any)?.totalAmount) ??
            fallbackAmount;
          const fallbackPlatformFeeAmount = parseIntegerValue((metadata as any)?.platformFee);
          const fallbackVendorGrossAmount = parseIntegerValue((metadata as any)?.vendorGross);
          const fallbackVendorNetPayoutAmount =
            parseIntegerValue((metadata as any)?.vendorNetPayout) ??
            parseIntegerValue((metadata as any)?.vendorPayout);
          const fallbackStripeProcessingFeeEstimate = parseIntegerValue(
            (metadata as any)?.stripeProcessingFeeEstimate
          );
          const fallbackStripeConnectedAccountId =
            asTrimmedString((metadata as any)?.stripeConnectedAccountId) ||
            asTrimmedString((metadata as any)?.vendorStripeAccountId) ||
            null;
          const fallbackVendorAbsorbsStripeFees = parseOptionalBooleanFlag(
            (metadata as any)?.vendorAbsorbsStripeFees
          );

          let latestChargeId = "";
          let actualStripeFeeAmount: number | null = null;
          if (eventType === "payment_intent.succeeded") {
            latestChargeId =
              typeof paymentIntent?.latest_charge === "string"
                ? paymentIntent.latest_charge.trim()
                : asTrimmedString(paymentIntent?.latest_charge?.id);
            if (latestChargeId) {
              try {
                const charge = await stripe.charges.retrieve(latestChargeId, {
                  expand: ["balance_transaction"],
                });
                if (
                  charge.balance_transaction &&
                  typeof charge.balance_transaction !== "string" &&
                  Number.isFinite((charge.balance_transaction as any).fee)
                ) {
                  actualStripeFeeAmount = Math.max(
                    0,
                    Math.round((charge.balance_transaction as any).fee)
                  );
                }
              } catch {
                // Non-fatal; payout calculations can fall back to estimates.
              }
            }
          }

          // Apply the outcome via the shared reconcile logic so the webhook, the
          // synchronous post-checkout endpoint, and the expiry guard all behave
          // identically. `alreadyProcessed` lets us fire one-time side effects
          // exactly once even if another path won the race.
          let succeededResult: { bookingId: string | null; alreadyProcessed: boolean } | null = null;
          if (eventType === "payment_intent.succeeded") {
            succeededResult = await db.transaction(async (tx) =>
              applyPaymentIntentSuccessInTx(tx, {
                paymentIntentId,
                latestChargeId,
                actualStripeFeeAmount,
                fallbackBookingId,
                fallbackPaymentType,
                fallbackAmount,
                fallbackTotalAmount,
                fallbackPlatformFeeAmount,
                fallbackVendorGrossAmount,
                fallbackVendorNetPayoutAmount,
                fallbackStripeProcessingFeeEstimate,
                fallbackStripeConnectedAccountId,
                fallbackVendorAbsorbsStripeFees,
              })
            );
          } else {
            await db.transaction(async (tx) =>
              applyPaymentIntentFailureInTx(tx, {
                paymentIntentId,
                fallbackBookingId,
                fallbackPaymentType,
                fallbackAmount,
                fallbackTotalAmount,
                fallbackPlatformFeeAmount,
                fallbackVendorGrossAmount,
                fallbackVendorNetPayoutAmount,
                fallbackStripeProcessingFeeEstimate,
                fallbackStripeConnectedAccountId,
                fallbackVendorAbsorbsStripeFees,
              })
            );
          }

          // One-time side effects (notification, emails, chat) — fired only on a
          // genuine transition to succeeded, so a later webhook re-delivery or a
          // racing synchronous reconcile can't double-send.
          if (succeededResult?.bookingId && !succeededResult.alreadyProcessed) {
            firePaymentSucceededSideEffects({
              paymentIntentId,
              bookingId: succeededResult.bookingId,
              paymentType: fallbackPaymentType,
            });
          }
        }
      } else if (eventType === "charge.dispute.created" || eventType === "charge.dispute.closed") {
        const dispute = event?.data?.object ?? {};
        const paymentIntentId =
          typeof dispute?.payment_intent === "string" ? dispute.payment_intent.trim() : "";
        const chargeId =
          typeof dispute?.charge === "string" ? dispute.charge.trim() : "";
        const disputeStatus = asTrimmedString(dispute?.status).toLowerCase() || "needs_response";

        await db.transaction(async (tx) => {
          let payment: any = null;
          if (paymentIntentId) {
            payment = await ensurePaymentRecordForIntentInTx(tx, {
              paymentIntentId,
            });
          } else if (chargeId) {
            const [byCharge] = await tx
              .select({
                id: payments.id,
                bookingId: payments.bookingId,
                status: payments.status,
                payoutStatus: payments.payoutStatus,
                payoutBlockedReason: payments.payoutBlockedReason,
                payoutAdjustedAmount: payments.payoutAdjustedAmount,
                disputeStatus: payments.disputeStatus,
                paidOutAt: payments.paidOutAt,
                payoutEligibleAt: payments.payoutEligibleAt,
                totalAmount: payments.totalAmount,
                amount: payments.amount,
                refundAmount: payments.refundAmount,
                vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
                actualStripeFeeAmount: payments.actualStripeFeeAmount,
                vendorAbsorbsStripeFees: payments.vendorAbsorbsStripeFees,
                stripeConnectedAccountId: payments.stripeConnectedAccountId,
                stripeChargeId: payments.stripeChargeId,
                stripeTransferId: payments.stripeTransferId,
              })
              .from(payments)
              .where(eq(payments.stripeChargeId, chargeId))
              .limit(1);
            payment = byCharge ?? null;
          }
          if (!payment?.id || !payment.bookingId) return;

          const now = new Date();
          const [bookingRow] = await tx
            .select({
              id: bookings.id,
              status: bookings.status,
              bookingEndAt: bookings.bookingEndAt,
            })
            .from(bookings)
            .where(eq(bookings.id, payment.bookingId))
            .limit(1);
          if (!bookingRow?.id) return;

          if (eventType === "charge.dispute.created") {
            await tx
              .update(payments)
              .set({
                status: "disputed",
                disputeStatus,
                stripeChargeId: (payment.stripeChargeId ?? chargeId) || null,
                payoutStatus: "blocked",
                payoutBlockedReason: "active_dispute",
                payoutAdjustedAmount: parseIntegerValue(payment.payoutAdjustedAmount) ?? null,
              })
              .where(eq(payments.id, payment.id));

            await recomputeBookingPaymentStatusInTx(tx, payment.bookingId);
            return;
          }

          const disputeClosedAsWon =
            disputeStatus === "won" || disputeStatus === "warning_closed";
          if (!disputeClosedAsWon) {
            await tx
              .update(payments)
              .set({
                disputeStatus,
                payoutStatus: "cancelled",
                payoutBlockedReason: "dispute_lost",
                payoutAdjustedAmount: 0,
              })
              .where(eq(payments.id, payment.id));
            return;
          }

          const refundedAmount = Math.max(0, parseIntegerValue(payment.refundAmount) ?? 0);
          const totalAmount = Math.max(
            0,
            parseIntegerValue(payment.totalAmount) ??
              parseIntegerValue(payment.amount) ??
              0
          );
          const nextPaymentStatus =
            refundedAmount >= totalAmount && totalAmount > 0
              ? "refunded"
              : refundedAmount > 0
                ? "partially_refunded"
                : "succeeded";
          const disputeCaseStatus = await getDisputeCaseStatusInTx(tx, payment.bookingId);
          const payoutEligibility = computePayoutEligibility({
            bookingStatus: bookingRow.status,
            paymentStatus: nextPaymentStatus,
            payoutStatus: payment.payoutStatus,
            payoutBlockedReason: null,
            disputeStatus,
            disputeCaseStatus,
            paidOutAt: payment.paidOutAt,
            payoutEligibleAt: payment.payoutEligibleAt,
            bookingEndAt: bookingRow.bookingEndAt,
            totalAmount,
            refundedAmount,
            vendorNetPayoutAmount: payment.vendorNetPayoutAmount,
            actualStripeFeeAmount: payment.actualStripeFeeAmount,
            stripeConnectedAccountId: payment.stripeConnectedAccountId,
            stripeChargeId: payment.stripeChargeId ?? chargeId,
            stripeTransferId: payment.stripeTransferId,
            vendorAbsorbsStripeFees: payment.vendorAbsorbsStripeFees ?? false,
          }, now);

          await tx
            .update(payments)
            .set({
              status: nextPaymentStatus as any,
              disputeStatus,
              payoutStatus: payoutEligibility.payoutStatus,
              payoutEligibleAt: payoutEligibility.payoutEligibleAt,
              payoutBlockedReason: payoutEligibility.payoutBlockedReason,
              payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
            })
            .where(eq(payments.id, payment.id));
          const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(
            tx,
            payment.bookingId
          );
          await tx
            .update(bookings)
            .set({
              paymentStatus: nextBookingPaymentStatus as any,
              updatedAt: now,
            })
            .where(eq(bookings.id, payment.bookingId));
        });
      } else if (eventType === "charge.refunded") {
        const charge = event?.data?.object ?? {};
        const paymentIntentId =
          typeof charge?.payment_intent === "string" ? charge.payment_intent.trim() : "";
        const chargeId = typeof charge?.id === "string" ? charge.id.trim() : "";
        if (paymentIntentId) {
          const amountRefunded = parseIntegerValue(charge?.amount_refunded) ?? 0;
          await db.transaction(async (tx) => {
            const payment = await ensurePaymentRecordForIntentInTx(tx, {
              paymentIntentId,
            });
            if (!payment?.id || !payment.bookingId) return;

            const totalAmount = Math.max(
              0,
              parseIntegerValue(payment.totalAmount) ??
                parseIntegerValue(payment.amount) ??
                0
            );
            const fullRefund = amountRefunded >= totalAmount && totalAmount > 0;
            const nextStatus = fullRefund ? "refunded" : "partially_refunded";
            const now = new Date();

            const [bookingRow] = await tx
              .select({
                id: bookings.id,
                status: bookings.status,
                bookingEndAt: bookings.bookingEndAt,
              })
              .from(bookings)
              .where(eq(bookings.id, payment.bookingId))
              .limit(1);
            if (!bookingRow?.id) return;
            const disputeCaseStatus = await getDisputeCaseStatusInTx(tx, payment.bookingId);

            const payoutEligibility = computePayoutEligibility({
              bookingStatus: bookingRow.status,
              paymentStatus: nextStatus,
              payoutStatus: payment.payoutStatus,
              payoutBlockedReason:
                asTrimmedString(payment.stripeTransferId) && !fullRefund
                  ? "refund_after_payout_manual_recovery"
                  : null,
              disputeStatus: payment.disputeStatus,
              disputeCaseStatus,
              paidOutAt: payment.paidOutAt,
              payoutEligibleAt: payment.payoutEligibleAt,
              bookingEndAt: bookingRow.bookingEndAt,
              totalAmount,
              refundedAmount: amountRefunded,
              vendorNetPayoutAmount: payment.vendorNetPayoutAmount,
              actualStripeFeeAmount: payment.actualStripeFeeAmount,
              stripeConnectedAccountId: payment.stripeConnectedAccountId,
              stripeChargeId: payment.stripeChargeId ?? chargeId,
              stripeTransferId: payment.stripeTransferId,
              vendorAbsorbsStripeFees: payment.vendorAbsorbsStripeFees ?? false,
            }, now);

            await tx
              .update(payments)
              .set({
                status: nextStatus as any,
                stripeChargeId: (payment.stripeChargeId ?? chargeId) || null,
                refundAmount: amountRefunded > 0 ? amountRefunded : parseIntegerValue(payment.amount),
                refundReason: "stripe_charge_refunded",
                refundedAt: now,
                payoutStatus: payoutEligibility.payoutStatus,
                payoutEligibleAt: payoutEligibility.payoutEligibleAt,
                payoutBlockedReason: payoutEligibility.payoutBlockedReason,
                payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
              })
              .where(eq(payments.id, payment.id));

            const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(
              tx,
              payment.bookingId
            );
            if (
              fullRefund &&
              nextBookingPaymentStatus === "refunded" &&
              !asTrimmedString(payment.stripeTransferId)
            ) {
              await tx.execute(drizzleSql`
                update bookings
                set
                  status = case
                    when status in ('pending', 'confirmed', 'failed', 'expired') then 'cancelled'
                    else status
                  end,
                  cancellation_reason = coalesce(nullif(trim(cancellation_reason), ''), 'payment_refunded'),
                  cancelled_at = coalesce(cancelled_at, ${now}),
                  updated_at = ${now}
                where id = ${payment.bookingId}
              `);
            } else {
              await tx
                .update(bookings)
                .set({
                  paymentStatus: nextBookingPaymentStatus as any,
                  updatedAt: now,
                })
                .where(eq(bookings.id, payment.bookingId));
            }
          });
        }
      }

      // ── checkout.session.completed ──────────────────────────────────────────
      // Fired when a customer completes payment on a Stripe-hosted checkout page.
      // Created by POST /api/checkout/session for direct marketplace purchases
      // (no booking required — vendor receives funds via the destination charge).
      //
      // The session is already stored verbatim in stripe_webhook_events above,
      // so the full payment record is always preserved for reconciliation.
      //
      // The session.metadata carries listingId, vendorAccountId, and
      // applicationFeeAmountCents so future reporting queries can join on them.
      // No insert into the `payments` table here because that table requires a
      // bookingId (direct checkout purchases have no associated booking in MVP).
      // Extend this handler when a direct-purchase booking flow is added.
      if (eventType === "checkout.session.completed") {
        const session = event?.data?.object ?? {};
        const paymentStatus = asTrimmedString(session?.payment_status);
        const sessionId = asTrimmedString(session?.id);
        const sessionMeta = session?.metadata && typeof session.metadata === "object"
          ? session.metadata as Record<string, string>
          : {};

        // Vendor Pro subscription checkouts also fire this event, but the
        // customer.subscription.* events below are the source of truth for tier
        // state — skip them here to avoid logging them as direct purchases.
        if (asTrimmedString(sessionMeta?.kind) === "vendor_pro_subscription") {
          // no-op: handled by the subscription webhook events
        } else {

        const listingId = asTrimmedString(sessionMeta?.listingId);
        const vendorStripeAccountId = asTrimmedString(sessionMeta?.vendorStripeAccountId);
        const amountTotal = parseIntegerValue(session?.amount_total);

        if (paymentStatus === "paid") {
          // Log a structured record to aid reconciliation and vendor payout tracking.
          // In a future iteration: create a booking/order record here and trigger
          // the vendor payout eligibility check (same as payment_intent.succeeded).
          logger.info(
            `[webhook] checkout.session.completed — session=${sessionId}` +
            ` listing=${listingId} vendor=${vendorStripeAccountId}` +
            ` amount=${amountTotal} status=paid`
          );
        }
        }
      }

      // ── Vendor Pro subscription events ──────────────────────────────────────
      // Source of truth for vendor tier state. Mirrors Stripe's subscription
      // status onto vendor_accounts. NEVER touches Connect payouts/transfers.
      if (
        eventType === "customer.subscription.created" ||
        eventType === "customer.subscription.updated"
      ) {
        const subscription = event?.data?.object ?? {};
        await applyStripeSubscriptionToVendor(subscription);
      } else if (eventType === "customer.subscription.deleted") {
        const subscription = event?.data?.object ?? {};
        const subscriptionId = asTrimmedString(subscription?.id);
        if (subscriptionId) {
          const { vendorAccountId } = await markVendorSubscriptionCanceled(subscriptionId);
          // Drop to Free: trim extra active listings down to the free-tier cap and
          // tear down Google Calendar sync (a Pro-only feature) so it stops for the
          // now-free vendor.
          if (vendorAccountId) {
            await deactivateExtraActiveListingsForFreeTier(vendorAccountId);
            await disconnectGoogleCalendarForVendor(vendorAccountId);
          }
        }
      } else if (eventType === "invoice.payment_failed") {
        // Belt-and-suspenders: Stripe also sends subscription.updated with status
        // past_due, but mark it here too so the vendor keeps Pro during dunning
        // with the "update card" banner regardless of event ordering.
        const invoice = event?.data?.object ?? {};
        const subscriptionId = asTrimmedString(invoice?.subscription);
        if (subscriptionId) {
          await db
            .update(vendorAccounts)
            .set({
              subscriptionStatus: "past_due",
              subscriptionPlan: "pro",
              subscriptionUpdatedAt: new Date(),
            })
            // Only affect an already-live subscription. Guards against a late /
            // out-of-order invoice.payment_failed resurrecting a canceled vendor
            // to Pro (the subscription id is retained on cancel).
            .where(
              and(
                eq(vendorAccounts.stripeSubscriptionId, subscriptionId),
                inArray(vendorAccounts.subscriptionStatus, ["active", "trialing", "past_due"])
              )
            );
        }
      } else if (
        eventType === "account.updated" ||
        eventType === "account.application.authorized" ||
        eventType.startsWith("v2.core.account")
      ) {
        // Fast-path for Connect onboarding completion. The classic
        // `account.updated` fires for V1 accounts; V2 recipient accounts emit
        // `v2.core.account[...]` events. Either way we re-check status and flip
        // the payout-ready flag. This is best-effort — the reconciliation worker
        // (runStripeConnectReconcileJob) is the delivery-independent guarantee.
        const accountObject = event?.data?.object ?? {};
        const connectedAccountId =
          asTrimmedString((accountObject as any)?.id) || asTrimmedString(event?.account);
        if (connectedAccountId) {
          await reconcileVendorStripeOnboarding(connectedAccountId);
        }
      }

      // Mark the event processed only after every handler above succeeded, so
      // a failure leaves processed_at null and Stripe's retry is not deduped.
      await db
        .update(stripeWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(stripeWebhookEvents.eventId, event.id));

      return res.json({ received: true });
    } catch {
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  const processPayoutsSchema = z.object({
    bookingIds: z.array(z.string().min(1)).max(200).optional(),
    paymentIds: z.array(z.string().min(1)).max(200).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    dryRun: z.boolean().optional(),
  });

  app.post("/api/admin/payouts/process", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const payload = processPayoutsSchema.parse(req.body ?? {});
      const dryRun = payload.dryRun === true;
      const limit = payload.limit ?? 50;
      const bookingIds = Array.from(
        new Set((payload.bookingIds ?? []).map((id) => asTrimmedString(id)).filter(Boolean))
      );
      const paymentIds = Array.from(
        new Set((payload.paymentIds ?? []).map((id) => asTrimmedString(id)).filter(Boolean))
      );

      const whereClauses: any[] = [eq(payments.paymentType, "booking")];
      if (bookingIds.length > 0) {
        whereClauses.push(inArray(payments.bookingId, bookingIds));
      }
      if (paymentIds.length > 0) {
        whereClauses.push(inArray(payments.id, paymentIds));
      }
      if (bookingIds.length === 0 && paymentIds.length === 0) {
        whereClauses.push(isNull(payments.stripeTransferId));
        whereClauses.push(
          drizzleSql`${payments.payoutStatus} in ('not_ready', 'eligible', 'scheduled', 'blocked')`
        );
      }

      const payoutCandidates = await db
        .select({
          paymentId: payments.id,
          bookingId: payments.bookingId,
        })
        .from(payments)
        .where(and(...whereClauses))
        .orderBy(asc(payments.payoutEligibleAt), asc(payments.createdAt))
        .limit(limit);

      const results: Array<{
        paymentId: string;
        bookingId: string;
        outcome: "paid" | "eligible" | "skipped" | "blocked" | "duplicate";
        reason: string | null;
        payoutAmount: number;
        transferId: string | null;
      }> = [];

      const { transferToVendor } = await import("../stripe");

      for (const candidate of payoutCandidates) {
        const paymentId = asTrimmedString(candidate.paymentId);
        const bookingId = asTrimmedString(candidate.bookingId);
        if (!paymentId || !bookingId) continue;

        const now = new Date();
        const refreshed = await db.transaction(async (tx) =>
          refreshPaymentPayoutStateInTx(tx, paymentId, now)
        );

        if (!refreshed?.paymentContext) {
          results.push({
            paymentId,
            bookingId,
            outcome: "skipped",
            reason: "payment_not_found",
            payoutAmount: 0,
            transferId: null,
          });
          continue;
        }

        const eligibility = refreshed.payoutEligibility;
        const payoutAmount = Math.max(0, Math.round(eligibility.adjustedPayoutAmount || 0));

        if (!eligibility.eligible) {
          results.push({
            paymentId,
            bookingId,
            outcome: eligibility.payoutStatus === "blocked" ? "blocked" : "skipped",
            reason: eligibility.payoutBlockedReason || "not_eligible",
            payoutAmount,
            transferId: null,
          });
          continue;
        }

        if (dryRun) {
          results.push({
            paymentId,
            bookingId,
            outcome: "eligible",
            reason: null,
            payoutAmount,
            transferId: null,
          });
          continue;
        }

        const connectedAccountId = asTrimmedString(
          refreshed.paymentContext.stripeConnectedAccountId
        );
        const chargeId = asTrimmedString(refreshed.paymentContext.stripeChargeId);

        if (!connectedAccountId || !chargeId || payoutAmount <= 0) {
          await db
            .update(payments)
            .set({
              payoutStatus: "blocked",
              payoutBlockedReason: "missing_transfer_requirements",
              payoutAdjustedAmount: payoutAmount,
            })
            .where(eq(payments.id, paymentId));
          results.push({
            paymentId,
            bookingId,
            outcome: "blocked",
            reason: "missing_transfer_requirements",
            payoutAmount,
            transferId: null,
          });
          continue;
        }

        try {
          const transfer = await transferToVendor({
            amount: payoutAmount,
            vendorStripeAccountId: connectedAccountId,
            description: `EventHub payout for booking ${bookingId}`,
            sourceTransaction: chargeId,
            transferGroup: `booking_${bookingId}`,
            metadata: {
              bookingId,
              paymentId,
              payoutAmount: String(payoutAmount),
              sourceChargeId: chargeId,
            },
            idempotencyKey: `eventhub-payout:${paymentId}:${payoutAmount}`,
          });

          const persisted = await db.transaction(async (tx) => {
            const locked = await loadPaymentPayoutContextForUpdateInTx(tx, paymentId);
            if (!locked?.paymentId || !locked.bookingId) {
              return {
                outcome: "skipped" as const,
                reason: "payment_not_found",
                transferId: null as string | null,
              };
            }

            const existingTransferId = asTrimmedString(locked.stripeTransferId);
            if (existingTransferId) {
              return {
                outcome: "duplicate" as const,
                reason: "already_paid",
                transferId: existingTransferId,
              };
            }

            const nowLocked = new Date();
            const eligibilityLocked = computePayoutEligibility(
              {
                bookingStatus: locked.bookingStatus,
                paymentStatus: locked.paymentStatus,
                payoutStatus: locked.payoutStatus,
                payoutBlockedReason: locked.payoutBlockedReason,
                disputeStatus: locked.disputeStatus,
                disputeCaseStatus: locked.disputeCaseStatus,
                paidOutAt: locked.paidOutAt,
                payoutEligibleAt: locked.payoutEligibleAt,
                bookingEndAt: locked.bookingEndAt,
                totalAmount:
                  parseIntegerValue(locked.totalAmount) ??
                  parseIntegerValue(locked.amount) ??
                  0,
                refundedAmount: parseIntegerValue(locked.refundAmount) ?? 0,
                vendorNetPayoutAmount: parseIntegerValue(locked.vendorNetPayoutAmount) ?? 0,
                actualStripeFeeAmount: locked.actualStripeFeeAmount,
                stripeConnectedAccountId: locked.stripeConnectedAccountId,
                stripeChargeId: locked.stripeChargeId,
                stripeTransferId: locked.stripeTransferId,
                vendorAbsorbsStripeFees: locked.vendorAbsorbsStripeFees ?? false,
              },
              nowLocked
            );

            if (!eligibilityLocked.eligible) {
              await tx
                .update(payments)
                .set({
                  payoutStatus: eligibilityLocked.payoutStatus,
                  payoutEligibleAt: eligibilityLocked.payoutEligibleAt,
                  payoutBlockedReason: eligibilityLocked.payoutBlockedReason,
                  payoutAdjustedAmount: eligibilityLocked.adjustedPayoutAmount,
                })
                .where(eq(payments.id, paymentId));
              return {
                outcome: eligibilityLocked.payoutStatus === "blocked" ? "blocked" : "skipped",
                reason: eligibilityLocked.payoutBlockedReason || "not_eligible",
                transferId: null as string | null,
              };
            }

            await tx
              .update(payments)
              .set({
                stripeTransferId: transfer.id,
                payoutStatus: "paid",
                payoutScheduledAt: nowLocked,
                paidOutAt: nowLocked,
                payoutBlockedReason: null,
                payoutAdjustedAmount: payoutAmount,
              })
              .where(eq(payments.id, paymentId));

            return {
              outcome: "paid" as const,
              reason: null as string | null,
              transferId: transfer.id,
            };
          });

          results.push({
            paymentId,
            bookingId,
            outcome: persisted.outcome as "paid" | "eligible" | "blocked" | "skipped" | "duplicate",
            reason: persisted.reason,
            payoutAmount,
            transferId: persisted.transferId,
          });
        } catch (error: any) {
          logger.error("[admin payout] transfer error:", error?.message || error);
          await db
            .update(payments)
            .set({
              payoutStatus: "blocked",
              payoutBlockedReason: "transfer_failed",
              payoutAdjustedAmount: payoutAmount,
            })
            .where(eq(payments.id, paymentId));
          results.push({
            paymentId,
            bookingId,
            outcome: "blocked",
            reason: "transfer_failed",
            payoutAmount,
            transferId: null,
          });
        }
      }

      const summary = {
        checked: results.length,
        paid: results.filter((row) => row.outcome === "paid").length,
        eligible: results.filter((row) => row.outcome === "eligible").length,
        blocked: results.filter((row) => row.outcome === "blocked").length,
        skipped: results.filter((row) => row.outcome === "skipped").length,
        duplicate: results.filter((row) => row.outcome === "duplicate").length,
      };

      return res.json({
        dryRun,
        limit,
        candidates: payoutCandidates.length,
        summary,
        results,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid payout processing payload" });
      }
      return res.status(500).json({ error: "Unable to process payouts" });
    }

  });

  // ── Payout records ────────────────────────────────────────────────────────
  app.get("/api/admin/payouts", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const rows = await db.execute(drizzleSql`
        SELECT
          p.id,
          p.booking_id,
          p.stripe_transfer_id,
          p.stripe_charge_id,
          p.stripe_connected_account_id,
          p.payout_status,
          p.payout_adjusted_amount,
          p.vendor_net_payout_amount,
          p.platform_fee_amount,
          p.total_amount,
          p.actual_stripe_fee_amount,
          p.payout_eligible_at,
          p.paid_out_at,
          p.payout_blocked_reason,
          p.payment_type,
          p.status         AS payment_status,
          p.created_at,
          b.event_date,
          b.listing_title_snapshot,
          b.status         AS booking_status,
          va.business_name AS vendor_business_name,
          va.email         AS vendor_email,
          u.name           AS customer_name,
          u.email          AS customer_email
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        LEFT JOIN vendor_accounts va ON va.id = p.vendor_account_id
        LEFT JOIN users u ON u.id = p.customer_id
        WHERE p.payment_type = 'booking'
        ORDER BY p.created_at DESC
        LIMIT 200
      `);

      const summary = await db.execute(drizzleSql`
        SELECT
          payout_status,
          COUNT(*)::int                       AS count,
          COALESCE(SUM(payout_adjusted_amount), 0)::bigint AS total_cents
        FROM payments
        WHERE payment_type = 'deposit'
        GROUP BY payout_status
      `);

      return res.json({
        records: extractRows<any>(rows).map((r) => ({
          id: String(r.id ?? ""),
          bookingId: String(r.booking_id ?? ""),
          stripeTransferId: r.stripe_transfer_id ? String(r.stripe_transfer_id) : null,
          stripeChargeId: r.stripe_charge_id ? String(r.stripe_charge_id) : null,
          stripeConnectedAccountId: r.stripe_connected_account_id ? String(r.stripe_connected_account_id) : null,
          payoutStatus: String(r.payout_status ?? ""),
          payoutAdjustedAmount: r.payout_adjusted_amount != null ? Number(r.payout_adjusted_amount) : null,
          vendorNetPayoutAmount: r.vendor_net_payout_amount != null ? Number(r.vendor_net_payout_amount) : null,
          platformFeeAmount: r.platform_fee_amount != null ? Number(r.platform_fee_amount) : null,
          totalAmount: r.total_amount != null ? Number(r.total_amount) : null,
          actualStripeFeeAmount: r.actual_stripe_fee_amount != null ? Number(r.actual_stripe_fee_amount) : null,
          payoutEligibleAt: r.payout_eligible_at ?? null,
          paidOutAt: r.paid_out_at ?? null,
          payoutBlockedReason: r.payout_blocked_reason ? String(r.payout_blocked_reason) : null,
          eventDate: r.event_date ? String(r.event_date) : null,
          listingTitle: r.listing_title_snapshot ? String(r.listing_title_snapshot) : null,
          bookingStatus: String(r.booking_status ?? ""),
          paymentStatus: String(r.payment_status ?? ""),
          vendorBusinessName: r.vendor_business_name ? String(r.vendor_business_name) : null,
          vendorEmail: r.vendor_email ? String(r.vendor_email) : null,
          customerName: r.customer_name ? String(r.customer_name) : null,
          customerEmail: r.customer_email ? String(r.customer_email) : null,
          createdAt: r.created_at ?? null,
        })),
        summary: extractRows<any>(summary).map((r) => ({
          payoutStatus: String(r.payout_status ?? ""),
          count: Number(r.count ?? 0),
          totalCents: Number(r.total_cents ?? 0),
        })),
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // ── Stripe platform balance ───────────────────────────────────────────────
  app.get("/api/admin/stripe/balance", adminRateLimiter, requireAdminAuth, async (req, res) => {
    try {
      const { stripe } = await import("../stripe");
      const balance = await stripe.balance.retrieve();
      const usdAvailable = balance.available.find((b) => b.currency === "usd");
      const usdPending = balance.pending.find((b) => b.currency === "usd");
      return res.json({
        availableCents: usdAvailable?.amount ?? 0,
        pendingCents: usdPending?.amount ?? 0,
        currency: "usd",
      });
    } catch (error: any) {
      return res.status(500).json({ error: "Unable to fetch Stripe balance" });
    }
  });
}
