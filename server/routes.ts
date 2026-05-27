import type { Express } from "express";
import { createServer, type Server } from "http";
import { logger } from "./lib/logger";
import {
  safeGoogleErrorMessage,
  logRouteError,
  respondWithInternalServerError,
  appUrl,
  formatCentsAsDollars,
  toPgTextArray,
} from "./lib/routeHelpers";
import {
  detectUploadedImageFormat,
  decodeImageDataUrlToBuffer,
  persistUploadedImage,
} from "./lib/imageUpload";
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
} from "./services/backgroundJobs";
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
} from "./services/vendorAuth";
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
} from "./services/customerAuth";
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
} from "./services/paymentService";
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
} from "./services/googleSyncService";
import {
  getBookingChatContextById,
  listCustomerBookingChatContexts,
  listVendorBookingChatContexts,
} from "./services/chatService";
import {
  deactivateActiveListingsViolatingPublishGate,
  checkListingAvailabilityForBookingRequest,
  sendCancellationEmailsAsync,
} from "./services/bookingService";
import { registerGoogleRoutes } from "./routers/google";
import { registerBoardRoutes } from "./routers/boards";
import { registerCircumventionRoutes } from "./routers/circumvention";
import { registerBookingRoutes } from "./routers/bookings";
import { registerPaymentRoutes } from "./routers/payments";
import { registerMiscRoutes } from "./routers/misc";
import { registerCustomerRoutes } from "./routers/customer";
import { registerVendorRoutes } from "./routers/vendor";
import { registerAdminRoutes } from "./routers/admin";
import { storage } from "./storage";
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
} from "./auth";
import { requireAuth0, verifyAuth0Token } from "./auth0"; // ✅ Auth0 middleware
import { z } from "zod";
import { db } from "./db";
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
} from "./email";
import { calculateRefund } from "./lib/calculateRefund";
import {
  CancellationPolicy,
  policyFromListingWizard,
} from "./lib/cancellationPolicyPresets";
import { checkContent, blockReasonSummary } from "../shared/circumvention-detection";
import { translateListingAsync, getListingTranslation, ensureListingTranslation, resolveRequestLanguage } from "./translationService";
import {
  uploadBufferToObjectStorage,
  makeObjectKey,
  resolveStoredUploadPath,
  isObjectStorageConfigured,
  type UploadFolder,
} from "./lib/objectStorage";
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
} from "./streamChat";
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
} from "./google";
import {
  handleGoogleCalendarWebhook,
  processGoogleWebhookForChannel,
} from "./googleWebhookHandler";
import {
  addDaysToIsoDate,
  normalizeIanaTimeZone,
  parseIsoDateValue,
  parseTimeValueToMinutes,
  zonedDateStartToUtc,
  zonedDateTimeToUtc,
} from "./timezone";
import { serializeHobbyList } from "@shared/hobby-tags";
import {
  computePayoutEligibility,
  deriveDisputeWindowCloseAt,
  isDisputeWindowOpen,
  DISPUTE_WINDOW_HOURS,
} from "./payoutEligibility";
import { decryptToken, encryptToken } from "./lib/tokenEncryption";
import { createDbRateLimiter } from "./lib/dbRateLimiter";
import { timezoneFromCoords } from "./lib/timezoneFromCoords";
import { tryAcquireWorkerLock, releaseWorkerLock } from "./lib/workerLocks";
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
} from "./lib/routeUtils";
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
} from "./lib/constants";
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
} from "./lib/rateLimiters";


export async function registerRoutes(app: Express): Promise<Server> {
  // --- Listing photo uploads (local disk) ---

  await assertCanonicalBookingSchemaReady();

  // One-time startup reconciliation so legacy active listings that fail publish rules
  // (missing price and/or insufficient photos) are immediately hidden after deploy.
  try {
    await deactivateActiveListingsViolatingPublishGate();
  } catch (error: any) {
    logger.warn(
      "[listing publish gate] startup reconciliation failed:",
      error?.message || error
    );
  }

  let expiryBackoffMs = 5 * 60 * 1000; // start at 5 min
  const EXPIRY_MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour max

  const runExpiryCleanupTick = async () => {
    // Distributed lock: stale after 8 min (1.6× the 5-min tick interval).
    const lockAcquired = await tryAcquireWorkerLock("booking_expiry", 8 * 60 * 1000);
    if (!lockAcquired) return; // another instance is handling this tick
    try {
      const expiredCount = await expireStalePendingBookings();
      if (expiredCount > 0) {
        logger.info(`[booking expiry] expired stale pending bookings: ${expiredCount}`);
      }
      const noResponseCount = await cancelUnansweredBookingRequests();
      if (noResponseCount > 0) {
        logger.info(`[booking expiry] auto-cancelled ${noResponseCount} unanswered booking request(s) after ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days`);
      }
      expiryBackoffMs = 5 * 60 * 1000; // reset on success
    } catch (error: any) {
      logger.warn("[booking expiry] cleanup failed:", error?.message || error);
      expiryBackoffMs = Math.min(expiryBackoffMs * 2, EXPIRY_MAX_BACKOFF_MS);
    } finally {
      await releaseWorkerLock("booking_expiry");
    }
  };

  const scheduleExpiryCleanup = () => {
    const t = setTimeout(async () => {
      await runExpiryCleanupTick();
      scheduleExpiryCleanup();
    }, expiryBackoffMs);
    t.unref();
  };

  void (async () => {
    await runExpiryCleanupTick();
    scheduleExpiryCleanup();
  })();

  if (isStreamChatConfigured()) {
    const runChatCleanup = async () => {
      try {
        await cleanupExpiredStreamChannels();
      } catch (error: any) {
        logger.warn("Expired chat cleanup failed:", error?.message || error);
      }
    };
    void runChatCleanup();
    const cleanupTimer = setInterval(runChatCleanup, 6 * 60 * 60 * 1000);
    cleanupTimer.unref();
  }

  const googleVerificationIntervalMinutesRaw = Number(process.env.GOOGLE_SYNC_VERIFICATION_INTERVAL_MINUTES || 30);
  const googleVerificationIntervalMinutes =
    Number.isFinite(googleVerificationIntervalMinutesRaw) && googleVerificationIntervalMinutesRaw > 0
      ? Math.max(5, Math.round(googleVerificationIntervalMinutesRaw))
      : 0;

  if (googleVerificationIntervalMinutes > 0) {
    const runRecurringGoogleVerification = async () => {
      try {
        const eligibleAccounts = await db
          .select({
            id: vendorAccounts.id,
            googleConnectionStatus: vendorAccounts.googleConnectionStatus,
            googleCalendarId: vendorAccounts.googleCalendarId,
          })
          .from(vendorAccounts)
          .where(
            and(
              eq(vendorAccounts.googleConnectionStatus, "connected"),
              drizzleSql`nullif(trim(${vendorAccounts.googleCalendarId}), '') is not null`
            )
          );

        for (const account of eligibleAccounts) {
          try {
            const summary = await runGoogleBookingSyncVerificationForVendorAccount(account);
            if (summary.googleCalendarReadStatus === "failed" || summary.issuesFound > 0) {
              logger.warn(
                "[google verification] vendor=%s checked=%d issues=%d unmatched=%s readStatus=%s",
                summary.vendorAccountId || "unknown",
                summary.bookingsChecked,
                summary.issuesFound,
                summary.unmatchedEventsCount == null ? "n/a" : String(summary.unmatchedEventsCount),
                summary.googleCalendarReadStatus
              );
            }
          } catch (error: any) {
            logger.warn(
              "[google verification] vendor=%s failed: %s",
              asTrimmedString(account.id) || "unknown",
              error?.message || error
            );
          }
        }
      } catch (error: any) {
        logger.warn("[google verification] recurring run failed:", error?.message || error);
      }
    };

    const verificationTimer = setInterval(
      runRecurringGoogleVerification,
      googleVerificationIntervalMinutes * 60 * 1000
    );
    verificationTimer.unref();
  }

  // ── Daily review prompt job ──────────────────────────────────────────────
  // Sends a review request to customers whose event date was ≥48h ago and
  // who have not yet received a review prompt (review_prompt_sent = false).
  const REVIEW_PROMPT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  const runReviewPromptJob = async () => {
    try {
      const serverUrl = appUrl();
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const cutoffDate = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

      const rows: any = await db.execute(drizzleSql`
        select
          b.id             as "bookingId",
          b.event_date     as "eventDate",
          coalesce(b.listing_title_snapshot, '') as "listingTitle",
          u.email          as "customerEmail",
          u.name           as "customerName",
          va.business_name as "vendorName"
        from bookings b
        join users u           on u.id  = b.customer_id
        join vendor_accounts va on va.id = b.vendor_account_id
        where b.review_prompt_sent = false
          and b.status not in ('cancelled', 'failed', 'expired')
          and b.event_date <= ${cutoffDate}
        limit 200
      `);

      const eligible = extractRows<{
        bookingId: string;
        eventDate: string;
        listingTitle: string;
        customerEmail: string;
        customerName: string;
        vendorName: string;
      }>(rows);

      if (eligible.length === 0) return;

      let sent = 0;
      for (const row of eligible) {
        try {
          if (row.customerEmail) {
            await sendReviewPromptEmail(row.customerEmail, {
              customerName: row.customerName || "Customer",
              vendorName: row.vendorName || "Vendor",
              eventDate: row.eventDate,
              listingTitle: row.listingTitle || "your booking",
              bookingId: row.bookingId,
              serverUrl,
            });
          }
          await db.execute(drizzleSql`
            update bookings set review_prompt_sent = true where id = ${row.bookingId}
          `);
          sent++;
        } catch (rowError: any) {
          logger.warn(
            "[review prompt] failed for booking %s: %s",
            row.bookingId,
            rowError?.message || rowError
          );
        }
      }

      if (sent > 0) {
        logger.info("[review prompt] sent %d review prompt(s)", sent);
      }
    } catch (error: any) {
      logger.warn("[review prompt] job failed:", error?.message || error);
    }
  };

  // Stagger 5 min after startup, then every 24 hours.
  const reviewPromptStartTimer = setTimeout(() => {
    void runReviewPromptJob();
    const reviewPromptTimer = setInterval(() => void runReviewPromptJob(), REVIEW_PROMPT_INTERVAL_MS);
    reviewPromptTimer.unref();
  }, 5 * 60 * 1000);
  reviewPromptStartTimer.unref();

  // ── Google Calendar watch channel renewal ────────────────────────────────
  // Channels expire in ~30 days. Renewal (expiring within 3 days) is cheap — just
  // a DB read most runs. Missing-channel healing also runs each tick via the same job.
  const WATCH_CHANNEL_RENEWAL_INTERVAL_MS = 60 * 1000; // 1 minute
  const runWatchChannelRenewal = async () => {
    try {
      const result = await renewExpiringGoogleCalendarWatchChannels();
      if (result.renewed > 0 || result.healed > 0 || result.failed > 0) {
        logger.info(
          "[watch channel renewal] renewed=%d healed=%d failed=%d",
          result.renewed,
          result.healed,
          result.failed
        );
      }
    } catch (error: any) {
      logger.warn("[watch channel renewal] job failed:", error?.message || error);
    }
  };
  const watchRenewalStartTimer = setTimeout(() => {
    void runWatchChannelRenewal();
    const watchRenewalTimer = setInterval(() => void runWatchChannelRenewal(), WATCH_CHANNEL_RENEWAL_INTERVAL_MS);
    watchRenewalTimer.unref();
  }, 15 * 1000);
  watchRenewalStartTimer.unref();

  // ── Event day reminder job ────────────────────────────────────────────────
  // Sends a 24h-before-event reminder to both vendor and customer.
  // Runs every 4 hours; uses event_day_reminder_sent to fire exactly once per booking.
  const EVENT_DAY_REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000;

  const runEventDayReminderJob = async () => {
    try {
      const serverUrl = appUrl();
      // Find bookings whose event starts in the next 20–28 hours and haven't been reminded yet.
      // We use a window (not exactly 24h) so the job doesn't miss events between runs.
      const windowStart = new Date(Date.now() + 20 * 60 * 60 * 1000);
      const windowEnd   = new Date(Date.now() + 28 * 60 * 60 * 1000);
      const windowStartDate = windowStart.toISOString().split("T")[0];
      const windowEndDate   = windowEnd.toISOString().split("T")[0];

      const rows: any = await db.execute(drizzleSql`
        select
          b.id                    as "bookingId",
          b.event_date            as "eventDate",
          b.event_start_time      as "eventTime",
          b.event_location        as "eventLocation",
          coalesce(b.listing_title_snapshot, '') as "listingTitle",
          u.email                 as "customerEmail",
          u.name                  as "customerName",
          va.email                as "vendorEmail",
          va.business_name        as "vendorName"
        from bookings b
        join users u              on u.id  = b.customer_id
        join vendor_accounts va   on va.id = b.vendor_account_id
        where b.event_day_reminder_sent = false
          and b.status = 'confirmed'
          and b.event_date >= ${windowStartDate}
          and b.event_date <= ${windowEndDate}
        limit 200
      `);

      const eligible = extractRows<{
        bookingId: string;
        eventDate: string;
        eventTime: string | null;
        eventLocation: string | null;
        listingTitle: string;
        customerEmail: string;
        customerName: string;
        vendorEmail: string;
        vendorName: string;
      }>(rows);

      if (eligible.length === 0) return;

      let sent = 0;
      for (const row of eligible) {
        try {
          const eventTime = row.eventTime || "See booking details";
          const tasks: Promise<any>[] = [];
          if (row.customerEmail) {
            tasks.push(sendEventDayReminderEmail(row.customerEmail, {
              recipientName: row.customerName || "Customer",
              counterpartName: row.vendorName || "Vendor",
              listingTitle: row.listingTitle || "Service",
              eventDate: row.eventDate,
              eventTime,
              eventLocation: row.eventLocation ?? undefined,
              role: "customer",
              serverUrl,
            }));
          }
          if (row.vendorEmail) {
            tasks.push(sendEventDayReminderEmail(row.vendorEmail, {
              recipientName: row.vendorName || "Vendor",
              counterpartName: row.customerName || "Customer",
              listingTitle: row.listingTitle || "Service",
              eventDate: row.eventDate,
              eventTime,
              eventLocation: row.eventLocation ?? undefined,
              role: "vendor",
              serverUrl,
            }));
          }
          await Promise.allSettled(tasks);
          await db
            .update(bookings)
            .set({ eventDayReminderSent: true })
            .where(eq(bookings.id, row.bookingId));
          sent++;
        } catch (rowError: any) {
          logger.warn("[event day reminder] failed for booking %s: %s", row.bookingId, rowError?.message || rowError);
        }
      }
      if (sent > 0) logger.info("[event day reminder] sent %d reminder(s)", sent);
    } catch (error: any) {
      logger.warn("[event day reminder] job failed:", error?.message || error);
    }
  };

  const eventDayStartTimer = setTimeout(() => {
    void runEventDayReminderJob();
    const eventDayTimer = setInterval(() => void runEventDayReminderJob(), EVENT_DAY_REMINDER_INTERVAL_MS);
    eventDayTimer.unref();
  }, 7 * 60 * 1000);
  eventDayStartTimer.unref();

  // ── Suspension lifted job ─────────────────────────────────────────────────
  // Daily check: vendors whose suspension has ended but haven't received the
  // "your account is restored" email (lift_email_sent = false).
  const SUSPENSION_LIFTED_INTERVAL_MS = 24 * 60 * 60 * 1000;

  const runSuspensionLiftedJob = async () => {
    try {
      const serverUrl = appUrl();
      const now = new Date();

      const rows: any = await db.execute(drizzleSql`
        select
          vs.id               as "suspensionId",
          va.email            as "vendorEmail",
          va.business_name    as "businessName"
        from vendor_suspensions vs
        join vendor_accounts va on va.id = vs.vendor_account_id
        where vs.lift_email_sent = false
          and vs.ends_at <= ${now}
          and va.email is not null
        limit 100
      `);

      const expired = extractRows<{
        suspensionId: string;
        vendorEmail: string;
        businessName: string;
      }>(rows);

      if (expired.length === 0) return;

      let sent = 0;
      for (const row of expired) {
        try {
          await sendSuspensionLiftedEmail(row.vendorEmail, {
            recipientName: row.businessName || "Vendor",
            businessName: row.businessName || "Your Business",
            serverUrl,
          });
          await db.execute(drizzleSql`
            update vendor_suspensions set lift_email_sent = true where id = ${row.suspensionId}
          `);
          sent++;
        } catch (rowError: any) {
          logger.warn("[suspension lifted] failed for %s: %s", row.suspensionId, rowError?.message || rowError);
        }
      }
      if (sent > 0) logger.info("[suspension lifted] sent %d notification(s)", sent);
    } catch (error: any) {
      logger.warn("[suspension lifted] job failed:", error?.message || error);
    }
  };

  const suspensionLiftedStartTimer = setTimeout(() => {
    void runSuspensionLiftedJob();
    const suspensionLiftedTimer = setInterval(() => void runSuspensionLiftedJob(), SUSPENSION_LIFTED_INTERVAL_MS);
    suspensionLiftedTimer.unref();
  }, 15 * 60 * 1000);
  suspensionLiftedStartTimer.unref();

  // ── Pending request reminder job ──────────────────────────────────────────
  // Sends up to 3 follow-up reminders to vendors with unanswered booking requests:
  //   • 6pm same day (vendor's local time) — skipped if booking arrived at/after 6pm
  //   • 9am next morning (vendor's local time)
  //   • 24h after creation
  // Uses operating_timezone from the vendor's profile for time-of-day logic.
  const PENDING_REMINDER_INTERVAL_MS = 10 * 60 * 1000; // every 10 min

  const runPendingRequestReminderJob = async () => {
    try {
      const serverUrl = appUrl();
      const now = new Date();

      // Load all pending bookings not yet confirmed/declined, created within the last 48h
      const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const rows: any = await db.execute(drizzleSql`
        select
          b.id                        as "bookingId",
          b.event_date                as "eventDate",
          b.total_amount              as "totalCents",
          coalesce(b.listing_title_snapshot, '') as "listingTitle",
          b.pending_reminder_6pm_sent  as "sent6pm",
          b.pending_reminder_9am_sent  as "sent9am",
          b.pending_reminder_24h_sent  as "sent24h",
          b.created_at                as "createdAt",
          va.email                    as "vendorEmail",
          va.business_name            as "vendorName",
          coalesce(vp.operating_timezone, 'UTC') as "vendorTimezone",
          u.name                      as "customerName"
        from bookings b
        join vendor_accounts va   on va.id = b.vendor_account_id
        left join vendor_profiles vp on vp.account_id = va.id and vp.active = true
        join users u              on u.id  = b.customer_id
        where b.status = 'pending'
          and b.created_at >= ${cutoff}
          and (
            b.pending_reminder_6pm_sent = false
            or b.pending_reminder_9am_sent = false
            or b.pending_reminder_24h_sent = false
          )
          and va.email is not null
        limit 200
      `);

      const candidates = extractRows<{
        bookingId: string;
        eventDate: string;
        totalCents: number;
        listingTitle: string;
        sent6pm: boolean;
        sent9am: boolean;
        sent24h: boolean;
        createdAt: string | Date;
        vendorEmail: string;
        vendorName: string;
        vendorTimezone: string;
        customerName: string;
      }>(rows);

      if (candidates.length === 0) return;

      let sent = 0;
      for (const row of candidates) {
        try {
          const createdAt = new Date(row.createdAt);
          const tz = row.vendorTimezone || "UTC";

          // Helper: get current time-of-day in vendor's timezone
          const nowInVendorTz = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            hour12: false,
          }).format(now);
          const vendorHour = parseInt(nowInVendorTz, 10);

          // Helper: get creation time-of-day in vendor's timezone
          const createdHourStr = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            hour12: false,
          }).format(createdAt);
          const createdHour = parseInt(createdHourStr, 10);

          const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
          const isAfterMidnightOfCreation = now.toDateString() !== createdAt.toDateString();

          let cadenceSent: "6pm" | "9am" | "24h" | null = null;
          let columnToSet: Partial<typeof bookings.$inferInsert> = {};

          if (!row.sent24h && hoursSinceCreation >= 24) {
            cadenceSent = "24h";
            columnToSet = { pendingReminder24hSent: true };
          } else if (!row.sent9am && isAfterMidnightOfCreation && vendorHour >= 9 && vendorHour < 11) {
            cadenceSent = "9am";
            columnToSet = { pendingReminder9amSent: true };
          } else if (!row.sent6pm && vendorHour >= 18 && vendorHour < 20 && createdHour < 18) {
            cadenceSent = "6pm";
            columnToSet = { pendingReminder6pmSent: true };
          }

          if (!cadenceSent) continue;

          await sendPendingRequestReminderEmail(row.vendorEmail, {
            recipientName: row.vendorName || "Vendor",
            customerName: row.customerName || "Customer",
            listingTitle: row.listingTitle || "Service",
            eventDate: row.eventDate,
            totalAmountCents: row.totalCents,
            cadence: cadenceSent,
            serverUrl,
          });

          await db
            .update(bookings)
            .set(columnToSet as any)
            .where(eq(bookings.id, row.bookingId));

          sent++;
        } catch (rowError: any) {
          logger.warn("[pending reminder] failed for booking %s: %s", row.bookingId, rowError?.message || rowError);
        }
      }
      if (sent > 0) logger.info("[pending reminder] sent %d reminder(s)", sent);
    } catch (error: any) {
      logger.warn("[pending reminder] job failed:", error?.message || error);
    }
  };

  const pendingReminderStartTimer = setTimeout(() => {
    void runPendingRequestReminderJob();
    const pendingReminderTimer = setInterval(() => void runPendingRequestReminderJob(), PENDING_REMINDER_INTERVAL_MS);
    pendingReminderTimer.unref();
  }, 3 * 60 * 1000);
  pendingReminderStartTimer.unref();

  // ── Security deposit auto-refund job ─────────────────────────────────────
  // After an event ends and the 72-hour dispute window expires, automatically
  // refund the security deposit to the customer if no damage-claim dispute case
  // is open for that booking.
  //
  // Eligibility criteria (all must be true):
  //   1. Booking has security_deposit_cents > 0
  //   2. security_deposit_refunded_at IS NULL (not yet refunded)
  //   3. booking_end_at + 72h has passed (falls back to event_date + 4 days)
  //   4. No unresolved dispute_cases row exists for the booking (open OR pending_review)
  //   5. A succeeded security_deposit (or legacy deposit) payment row exists
  //
  // Runs every hour; uses a distributed lock to prevent double-refunds across
  // multiple server instances.
  const SECURITY_DEPOSIT_REFUND_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  const runSecurityDepositRefundJob = async () => {
    const lockAcquired = await tryAcquireWorkerLock("security_deposit_refund", 70 * 60 * 1000);
    if (!lockAcquired) {
      logger.info("[security-deposit-refund] lock held by another instance — skipping");
      return;
    }
    try {
      // Find eligible security deposit payments.
      // booking_end_at is the authoritative end time; fall back to event_date + 1 day
      // when it's absent (e.g. per-day bookings without an explicit end time).
      const eligible: any = await db.execute(drizzleSql`
        SELECT
          p.id                       AS payment_id,
          p.stripe_payment_intent_id AS stripe_pi_id,
          p.amount                   AS deposit_cents,
          b.id                       AS booking_id,
          b.listing_title_snapshot   AS listing_title
        FROM payments p
        JOIN bookings b ON b.id = p.booking_id
        WHERE p.payment_type = 'security_deposit'
          AND p.status = 'succeeded'
          AND b.security_deposit_cents > 0
          AND b.security_deposit_refunded_at IS NULL
          AND (
            -- 72 hours past booking_end_at (preferred)
            (b.booking_end_at IS NOT NULL AND b.booking_end_at < now() - interval '72 hours')
            OR
            -- Fallback: 72 hours past the day after the event date
            (b.booking_end_at IS NULL AND (b.event_date::date + interval '1 day') < now() - interval '72 hours')
          )
          AND b.status IN ('confirmed', 'completed')
          AND NOT EXISTS (
            SELECT 1 FROM dispute_cases dc
            WHERE dc.booking_id = b.id AND dc.status != 'resolved'
          )
        LIMIT 50
      `);

      const rows = extractRows<{
        payment_id: string;
        stripe_pi_id: string | null;
        deposit_cents: number;
        booking_id: string;
        listing_title: string | null;
      }>(eligible);

      if (rows.length === 0) return;

      logger.info("[security-deposit-refund] %d eligible deposit(s) to refund", rows.length);
      const { refundBookingPayment } = await import("./stripe");
      const now = new Date();
      let refunded = 0;

      for (const row of rows) {
        if (!row.stripe_pi_id) {
          logger.warn("[security-deposit-refund] payment %s has no stripe_pi_id — skipping", row.payment_id);
          continue;
        }
        try {
          await refundBookingPayment({
            paymentIntentId: row.stripe_pi_id,
            reason: "requested_by_customer",
            idempotencyKey: `auto-deposit-refund:${row.payment_id}`,
          });

          await db.transaction(async (tx) => {
            await tx
              .update(payments)
              .set({
                status: "refunded",
                refundAmount: row.deposit_cents,
                refundReason: "auto_deposit_refund_72h",
                refundedAt: now,
                payoutStatus: "cancelled",
                payoutEligibleAt: null,
                payoutBlockedReason: "auto_refunded_no_dispute",
                payoutAdjustedAmount: 0,
              })
              .where(eq(payments.id, row.payment_id));

            await tx
              .update(bookings)
              .set({ securityDepositRefundedAt: now, updatedAt: now })
              .where(eq(bookings.id, row.booking_id));
          });

          refunded++;
          logger.info(
            "[security-deposit-refund] refunded booking=%s amount=%d cents",
            row.booking_id,
            row.deposit_cents
          );
        } catch (rowErr: any) {
          logger.warn(
            "[security-deposit-refund] failed for payment=%s booking=%s: %s",
            row.payment_id,
            row.booking_id,
            rowErr?.message || rowErr
          );
        }
      }

      if (refunded > 0) {
        logger.info("[security-deposit-refund] auto-refunded %d security deposit(s)", refunded);
      }
    } catch (err: any) {
      logger.warn("[security-deposit-refund] job failed: %s", err?.message || err);
    } finally {
      await releaseWorkerLock("security_deposit_refund");
    }
  };

  // Stagger 7 min after startup, then every hour.
  const secDepositRefundStartTimer = setTimeout(() => {
    void runSecurityDepositRefundJob();
    const secDepositRefundTimer = setInterval(() => void runSecurityDepositRefundJob(), SECURITY_DEPOSIT_REFUND_INTERVAL_MS);
    secDepositRefundTimer.unref();
  }, 7 * 60 * 1000);
  secDepositRefundStartTimer.unref();

  // ---------------------------------------------------------------------------
  // Booking auto-completion job
  // Transitions confirmed bookings to completed once the event has passed.
  // Required so customers can submit reviews (review endpoint requires
  // status = 'completed') and so the vendor dashboard reflects reality.
  // ---------------------------------------------------------------------------
  const BOOKING_COMPLETION_INTERVAL_MS = 4 * 60 * 60 * 1000; // every 4 hours

  const runBookingCompletionJob = async () => {
    const lockAcquired = await tryAcquireWorkerLock("booking_auto_complete", 5 * 60 * 60 * 1000);
    if (!lockAcquired) {
      logger.info("[booking-completion] lock held by another instance — skipping");
      return;
    }
    try {
      const now = new Date();
      const result: any = await db.execute(drizzleSql`
        UPDATE bookings
        SET
          status       = 'completed',
          completed_at = ${now},
          updated_at   = ${now}
        WHERE status = 'confirmed'
          AND (
            -- Use booking_end_at when set, with a 2-hour grace window
            (booking_end_at IS NOT NULL AND booking_end_at < now() - interval '2 hours')
            OR
            -- Fallback: event_date with no explicit end time — complete the day after
            (booking_end_at IS NULL AND event_date::date < current_date)
          )
      `);
      const rowCount = result?.rowCount ?? result?.rows?.length ?? 0;
      if (rowCount > 0) {
        logger.info("[booking-completion] auto-completed %d booking(s)", rowCount);
      }
    } catch (err: any) {
      logger.warn("[booking-completion] job failed: %s", err?.message || err);
    } finally {
      await releaseWorkerLock("booking_auto_complete");
    }
  };

  // Stagger 10 min after startup, then every 4 hours.
  const bookingCompletionStartTimer = setTimeout(() => {
    void runBookingCompletionJob();
    const bookingCompletionTimer = setInterval(() => void runBookingCompletionJob(), BOOKING_COMPLETION_INTERVAL_MS);
    bookingCompletionTimer.unref();
  }, 10 * 60 * 1000);
  bookingCompletionStartTimer.unref();




  registerGoogleRoutes(app);
  registerMiscRoutes(app);
  registerVendorRoutes(app);
  registerCustomerRoutes(app);




  await ensureBookingDisputesTable();
  startAutoPayoutWorker();

  registerBookingRoutes(app);
  registerPaymentRoutes(app);
  registerBoardRoutes(app);
  registerCircumventionRoutes(app);
  registerAdminRoutes(app);


  const httpServer = createServer(app);
  return httpServer;
}
