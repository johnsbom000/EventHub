import type { Express } from "express";
import { createServer, type Server } from "http";
import { logger } from "../lib/logger";
import { isCommissionVendor } from "../services/entitlementsService";
import { captureJobError } from "../lib/jobAlerts";
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
  getDisputeCaseStatusInTx,
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
  sendProTrialEndingEmail,
} from "../email";
import { calculateRefund } from "../lib/calculateRefund";
import { apportionChargeRefunds } from "../lib/refundApportionment";
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
    // Hoisted so the outer catch can tag the Sentry event with which Stripe
    // event was being processed when it blew up.
    let eventId: string | null = null;
    let eventType: string | null = null;
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
      eventId = asTrimmedString(event?.id);
      eventType = asTrimmedString(event?.type);

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
            void firePaymentSucceededSideEffects({
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
                paymentType: payments.paymentType,
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
              cancellationReason: bookings.cancellationReason,
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
            paymentType: payment.paymentType,
            bookingCancellationReason: bookingRow.cancellationReason,
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

        // Booking payments and security deposits share ONE PaymentIntent/charge,
        // so a charge refund can belong to more than one payment row. Attribute
        // each refund back to the row that issued it (via metadata.paymentRowId),
        // rather than writing the charge's cumulative total onto a single row.
        //
        // Fetch the authoritative refund list from Stripe — the event payload's
        // `charge.refunds` is absent on current API versions, and only the
        // per-refund metadata tags make attribution possible.
        let chargeRefunds: Array<{ amount?: number | null; metadata?: Record<string, string> | null }> = [];
        if (chargeId) {
          try {
            const { listRefundsForCharge } = await import("../stripe");
            chargeRefunds = await listRefundsForCharge(chargeId);
          } catch (refundListErr: any) {
            captureJobError("stripe_webhook", refundListErr, {
              stage: "charge_refunded_list_refunds",
              eventId,
              eventType,
              chargeId,
              note: "falling back to cumulative amount_refunded",
            });
            chargeRefunds = [];
          }
        }
        const cumulativeAmountRefunded = parseIntegerValue(charge?.amount_refunded) ?? 0;

        if (paymentIntentId || chargeId) {
          await db.transaction(async (tx) => {
            // Make sure the row exists before we load the full set for the PI.
            if (paymentIntentId) {
              await ensurePaymentRecordForIntentInTx(tx, { paymentIntentId });
            }

            // Load EVERY payment row sharing this PaymentIntent (covers booking +
            // deposit); fall back to charge match when the PI is unknown.
            const allRows = await tx
              .select({
                id: payments.id,
                bookingId: payments.bookingId,
                paymentType: payments.paymentType,
                status: payments.status,
                amount: payments.amount,
                totalAmount: payments.totalAmount,
                refundAmount: payments.refundAmount,
                refundReason: payments.refundReason,
                disputeStatus: payments.disputeStatus,
                payoutStatus: payments.payoutStatus,
                payoutBlockedReason: payments.payoutBlockedReason,
                payoutEligibleAt: payments.payoutEligibleAt,
                payoutAdjustedAmount: payments.payoutAdjustedAmount,
                paidOutAt: payments.paidOutAt,
                vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
                actualStripeFeeAmount: payments.actualStripeFeeAmount,
                vendorAbsorbsStripeFees: payments.vendorAbsorbsStripeFees,
                stripeConnectedAccountId: payments.stripeConnectedAccountId,
                stripeChargeId: payments.stripeChargeId,
                stripeTransferId: payments.stripeTransferId,
              })
              .from(payments)
              .where(
                paymentIntentId
                  ? eq(payments.stripePaymentIntentId, paymentIntentId)
                  : eq(payments.stripeChargeId, chargeId)
              );
            if (allRows.length === 0) return;

            const bookingId = allRows.find((r: any) => r.bookingId)?.bookingId;
            if (!bookingId) return;

            const now = new Date();
            const [bookingRow] = await tx
              .select({
                id: bookings.id,
                status: bookings.status,
                bookingEndAt: bookings.bookingEndAt,
                cancellationReason: bookings.cancellationReason,
              })
              .from(bookings)
              .where(eq(bookings.id, bookingId))
              .limit(1);
            if (!bookingRow?.id) return;
            const disputeCaseStatus = await getDisputeCaseStatusInTx(tx, bookingId);

            // Attribute the charge's refunds to each payment row. If Stripe's
            // refund list came back empty (API error) but the charge reports a
            // cumulative refund, synthesize one untagged refund so the
            // deposit-first fallback still allocates it.
            const refundsForApportionment =
              chargeRefunds.length > 0
                ? chargeRefunds
                : cumulativeAmountRefunded > 0
                  ? [{ amount: cumulativeAmountRefunded, metadata: null }]
                  : [];
            const attributed = apportionChargeRefunds(
              refundsForApportionment,
              allRows.map((r: any) => ({
                id: r.id,
                paymentType: r.paymentType,
                amount: parseIntegerValue(r.amount) ?? 0,
                refundAmount: parseIntegerValue(r.refundAmount) ?? 0,
              }))
            );

            for (const row of allRows as any[]) {
              const portion = attributed.get(row.id) ?? 0;
              // Nothing attributed to this row (e.g. a deposit-only refund leaves
              // the booking row's portion at 0) — leave it untouched.
              if (portion <= 0) continue;

              const rowAmount = parseIntegerValue(row.amount) ?? 0;
              const rowTotal = Math.max(0, parseIntegerValue(row.totalAmount) ?? rowAmount);
              const rowCeiling = rowTotal > 0 ? rowTotal : rowAmount;
              const rowFullyRefunded = rowCeiling > 0 && portion >= rowCeiling;
              const nextRowStatus = rowFullyRefunded ? "refunded" : "partially_refunded";
              const nextRefundReason = asTrimmedString(row.refundReason) || "stripe_charge_refunded";

              if (row.paymentType === "booking") {
                // Booking row: recompute payout eligibility from ITS OWN portion.
                const payoutEligibility = computePayoutEligibility(
                  {
                    bookingStatus: bookingRow.status,
                    paymentStatus: nextRowStatus,
                    payoutStatus: row.payoutStatus,
                    // Manual-recovery flag only when the money already moved
                    // (transferred row) AND the booking portion is a PARTIAL
                    // refund; a full refund routes to the cancel path below.
                    payoutBlockedReason:
                      asTrimmedString(row.stripeTransferId) && !rowFullyRefunded
                        ? "refund_after_payout_manual_recovery"
                        : null,
                    disputeStatus: row.disputeStatus,
                    disputeCaseStatus,
                    paidOutAt: row.paidOutAt,
                    payoutEligibleAt: row.payoutEligibleAt,
                    bookingEndAt: bookingRow.bookingEndAt,
                    totalAmount: rowCeiling,
                    refundedAmount: portion,
                    vendorNetPayoutAmount: row.vendorNetPayoutAmount,
                    actualStripeFeeAmount: row.actualStripeFeeAmount,
                    stripeConnectedAccountId: row.stripeConnectedAccountId,
                    stripeChargeId: row.stripeChargeId ?? chargeId,
                    stripeTransferId: row.stripeTransferId,
                    vendorAbsorbsStripeFees: row.vendorAbsorbsStripeFees ?? false,
                    paymentType: row.paymentType,
                    bookingCancellationReason: bookingRow.cancellationReason,
                  },
                  now
                );

                await tx
                  .update(payments)
                  .set({
                    status: nextRowStatus as any,
                    stripeChargeId: (row.stripeChargeId ?? chargeId) || null,
                    refundAmount: portion,
                    refundReason: nextRefundReason,
                    refundedAt: now,
                    payoutStatus: payoutEligibility.payoutStatus,
                    payoutEligibleAt: payoutEligibility.payoutEligibleAt,
                    payoutBlockedReason: payoutEligibility.payoutBlockedReason,
                    payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
                  })
                  .where(eq(payments.id, row.id));
              } else {
                // Deposit / travel rows: record the refund but do NOT run them
                // through the booking payout pipeline. Never disturb a deposit
                // row already settled by a dispute award (paid / transferred /
                // cancelled) — those payout fields are terminal (C4 awards).
                const rowPayoutStatus = asTrimmedString(row.payoutStatus).toLowerCase();
                const settledTerminal =
                  row.paymentType === "security_deposit" &&
                  (rowPayoutStatus === "paid" ||
                    rowPayoutStatus === "cancelled" ||
                    asTrimmedString(row.stripeTransferId).length > 0);

                await tx
                  .update(payments)
                  .set({
                    status: nextRowStatus as any,
                    stripeChargeId: (row.stripeChargeId ?? chargeId) || null,
                    refundAmount: portion,
                    refundReason: nextRefundReason,
                    refundedAt: now,
                    ...(settledTerminal
                      ? {}
                      : {
                          payoutStatus: "cancelled",
                          payoutEligibleAt: null,
                          payoutBlockedReason: "refunded",
                          payoutAdjustedAmount: 0,
                        }),
                  })
                  .where(eq(payments.id, row.id));
              }
            }

            // Booking-level status + the full-refund → cancel-booking decision is
            // keyed on the BOOKING row's own portion, not the charge cumulative
            // (a deposit-only refund must never cancel the booking).
            const bookingPortionRow = (allRows as any[]).find((r) => r.paymentType === "booking");
            const bookingPortion = bookingPortionRow
              ? attributed.get(bookingPortionRow.id) ?? 0
              : 0;
            const bookingRowCeiling = bookingPortionRow
              ? Math.max(
                  0,
                  parseIntegerValue(bookingPortionRow.totalAmount) ??
                    parseIntegerValue(bookingPortionRow.amount) ??
                    0
                )
              : 0;
            const bookingFullyRefunded =
              !!bookingPortionRow && bookingRowCeiling > 0 && bookingPortion >= bookingRowCeiling;

            const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(tx, bookingId);
            if (
              bookingFullyRefunded &&
              nextBookingPaymentStatus === "refunded" &&
              !asTrimmedString(bookingPortionRow?.stripeTransferId)
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
                where id = ${bookingId}
              `);
            } else {
              await tx
                .update(bookings)
                .set({
                  paymentStatus: nextBookingPaymentStatus as any,
                  updatedAt: now,
                })
                .where(eq(bookings.id, bookingId));
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
        const subscriptionId = asTrimmedString(subscription?.id);
        if (subscriptionId) {
          // Webhook deliveries carry no ordering guarantee: a late
          // subscription.updated (status active) delivered after
          // subscription.deleted would resurrect a canceled vendor to Pro.
          // Applying the CURRENT state retrieved from Stripe (instead of the
          // event payload snapshot) is immune to delivery order.
          const freshSubscription = await stripe.subscriptions.retrieve(subscriptionId);
          await applyStripeSubscriptionToVendor(freshSubscription as any);
        }
      } else if (eventType === "customer.subscription.deleted") {
        const subscription = event?.data?.object ?? {};
        const subscriptionId = asTrimmedString(subscription?.id);
        if (subscriptionId) {
          const { vendorAccountId, downgraded } = await markVendorSubscriptionCanceled(
            subscriptionId,
            subscription?.metadata as Record<string, string> | undefined
          );
          // Drop to Free: trim extra active listings down to the free-tier cap and
          // tear down Google Calendar sync (a Pro-only feature) so it stops for the
          // now-free vendor. Skipped when an active comp grant kept them Pro
          // (downgraded === false), so a comped vendor's listings aren't trimmed.
          if (vendorAccountId && downgraded) {
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
      } else if (eventType === "customer.subscription.trial_will_end") {
        // Day-27 nudge for the no-card trial (Treatment B). Stripe fires this ~3
        // days before the trial ends. We only nudge trials with NO card on file —
        // the card-upfront arm (Treatment A) auto-converts, so nagging it would be
        // wrong. Fetch the live subscription + customer to see the payment method
        // reliably (the card may be the subscription's OR the customer's default).
        const subscription = event?.data?.object ?? {};
        const subscriptionId = asTrimmedString(subscription?.id);
        if (subscriptionId) {
          const fresh: any = await stripe.subscriptions.retrieve(subscriptionId);
          if (asTrimmedString(fresh?.metadata?.kind) === "vendor_pro_subscription") {
            let hasCard = Boolean(fresh?.default_payment_method);
            const customerId = asTrimmedString(fresh?.customer);
            if (!hasCard && customerId) {
              const customer: any = await stripe.customers.retrieve(customerId);
              hasCard =
                Boolean(customer?.invoice_settings?.default_payment_method) ||
                Boolean(customer?.default_source);
            }
            if (!hasCard) {
              const metaVendorId = asTrimmedString(fresh?.metadata?.vendorAccountId);
              const rows = await db
                .select({
                  id: vendorAccounts.id,
                  email: vendorAccounts.email,
                  businessName: vendorAccounts.businessName,
                  subscriptionStatus: vendorAccounts.subscriptionStatus,
                  compEndsAt: vendorAccounts.compEndsAt,
                  pricingModel: vendorAccounts.pricingModel,
                })
                .from(vendorAccounts)
                .where(
                  metaVendorId
                    ? eq(vendorAccounts.id, metaVendorId)
                    : eq(vendorAccounts.stripeSubscriptionId, subscriptionId)
                )
                .limit(1);
              const vendor = rows[0];
              // Skip the "add a card" nudge for a vendor kept Pro by an active comp
              // grant — their comp outlasts this Stripe trial, so it would mislead.
              const compActive =
                vendor?.subscriptionStatus === "comp" &&
                vendor.compEndsAt != null &&
                new Date(vendor.compEndsAt).getTime() > Date.now();
              // Commission vendors have no subscription and no Pro to keep, so a
              // "your Pro trial ends soon — add a card" nudge is meaningless to
              // them. A stray Stripe trial on such an account must not produce it.
              // Mirrors the guard in jobs/reverseTrialCardPrompt.ts.
              if (vendor && !compActive && !isCommissionVendor(vendor)) {
                const trialEndMs =
                  typeof fresh?.trial_end === "number" ? fresh.trial_end * 1000 : null;
                const daysLeft = trialEndMs
                  ? Math.max(1, Math.ceil((trialEndMs - Date.now()) / 86_400_000))
                  : 3;
                await createNotification({
                  recipientId: vendor.id,
                  recipientType: "vendor",
                  type: "pro_trial_ending",
                  title: "Your Pro trial ends soon",
                  message: `Add a card to keep Pro — your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. If you don't, you'll simply move to the free plan.`,
                  link: "/vendor/dashboard",
                });
                if (vendor.email) {
                  await sendProTrialEndingEmail(vendor.email, {
                    recipientName: vendor.businessName || "there",
                    businessName: vendor.businessName || "your business",
                    daysLeft,
                    serverUrl: appUrl(),
                  });
                }
              }
            }
          }
        }
      } else if (eventType === "setup_intent.succeeded") {
        // Reverse-trial card capture: the vendor added a card in-app (Stripe
        // Elements) during their trial. Attach it as the subscription's default
        // payment method so the trial converts to paid Pro at day 30 instead of
        // cancelling, stamp the capture time (the day-21 card-capture metric), and
        // log the event. Idempotent: only the FIRST capture stamps/logs.
        const setupIntent = event?.data?.object ?? {};
        if (asTrimmedString(setupIntent?.metadata?.kind) === "reverse_trial_card_capture") {
          const paymentMethodId = asTrimmedString(setupIntent?.payment_method);
          const customerId = asTrimmedString(setupIntent?.customer);
          const metaVendorId = asTrimmedString(setupIntent?.metadata?.vendorAccountId);
          let subscriptionId = asTrimmedString(setupIntent?.metadata?.subscriptionId);

          // Resolve the vendor (prefer metadata) and their live subscription id.
          const rows = await db
            .select({
              id: vendorAccounts.id,
              stripeSubscriptionId: vendorAccounts.stripeSubscriptionId,
              reverseTrialCardCapturedAt: vendorAccounts.reverseTrialCardCapturedAt,
              paywallVariant: vendorAccounts.paywallVariant,
            })
            .from(vendorAccounts)
            .where(
              metaVendorId
                ? eq(vendorAccounts.id, metaVendorId)
                : subscriptionId
                  ? eq(vendorAccounts.stripeSubscriptionId, subscriptionId)
                  : eq(vendorAccounts.id, "__none__")
            )
            .limit(1);
          const vendor = rows[0];
          if (!subscriptionId) subscriptionId = asTrimmedString(vendor?.stripeSubscriptionId);

          if (paymentMethodId && customerId) {
            // Make the card the default for the subscription AND the customer's
            // invoices, so Stripe charges it when the trial ends.
            if (subscriptionId) {
              await stripe.subscriptions.update(subscriptionId, {
                default_payment_method: paymentMethodId,
              });
            }
            await stripe.customers.update(customerId, {
              invoice_settings: { default_payment_method: paymentMethodId },
            });
          }

          if (vendor && !vendor.reverseTrialCardCapturedAt) {
            await db
              .update(vendorAccounts)
              .set({ reverseTrialCardCapturedAt: new Date() })
              .where(eq(vendorAccounts.id, vendor.id));
            logEvent("reverse_trial_card_captured", "vendor", vendor.id, {
              subscriptionId: subscriptionId || null,
              paywallVariant: vendor.paywallVariant ?? null,
            });
          }
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
    } catch (err) {
      // F3: this outer catch previously swallowed every webhook-processing
      // failure with no log and returned 500 — invisible to Sentry (its Express
      // handler never fires on a caught error). Surface it so the failure is
      // alertable; still return 500 so Stripe retries (processed_at stays null).
      captureJobError("stripe_webhook", err, { eventId, eventType });
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

      const whereClauses: any[] = [inArray(payments.paymentType, ["booking", "travel_fee"])];
      if (bookingIds.length > 0) {
        whereClauses.push(inArray(payments.bookingId, bookingIds));
      }
      if (paymentIds.length > 0) {
        whereClauses.push(inArray(payments.id, paymentIds));
      }
      if (bookingIds.length === 0 && paymentIds.length === 0) {
        whereClauses.push(isNull(payments.stripeTransferId));
        // 'scheduled' rows are actively claimed by a processor (CAS in
        // processSinglePayoutCandidate) — re-processing them here would race
        // the claim owner. Stuck claims are handled by the payout tick's
        // stale-claim recovery; admins can still target them via explicit
        // paymentIds. 'blocked' stays admin-reprocessable (including
        // 'transfer_failed_permanent', which the auto worker never retries).
        whereClauses.push(
          drizzleSql`${payments.payoutStatus} in ('not_ready', 'eligible', 'blocked')`
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

      // Same implementation as the auto-payout worker: eligibility refresh,
      // Stripe charge cross-check, transfer, locked persist, payout email.
      // The endpoint keeps only its own candidate query (explicit ids +
      // 'blocked' rows are admin-reprocessable here, unlike the worker).
      for (const candidate of payoutCandidates) {
        const paymentId = asTrimmedString(candidate.paymentId);
        const bookingId = asTrimmedString(candidate.bookingId);
        if (!paymentId || !bookingId) continue;

        results.push(
          await processSinglePayoutCandidate({
            paymentId,
            bookingId,
            dryRun,
          })
        );
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
        WHERE p.payment_type IN ('booking', 'travel_fee')
        ORDER BY p.created_at DESC
        LIMIT 200
      `);

      const summary = await db.execute(drizzleSql`
        SELECT
          payout_status,
          COUNT(*)::int                       AS count,
          COALESCE(SUM(payout_adjusted_amount), 0)::bigint AS total_cents
        FROM payments
        -- 'deposit' is not a payment_type enum value (it's 'security_deposit');
        -- comparing the enum against it threw and 500'd this whole endpoint.
        WHERE payment_type IN ('booking', 'travel_fee')
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
