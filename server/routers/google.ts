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


export function registerGoogleRoutes(app: Express): void {
  app.get("/api/google/oauth/start", async (req, res) => {
    const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID" });
    }
    const jwtSecret = (process.env.JWT_SECRET || "").trim();
    if (!jwtSecret) {
      return res.status(500).json({ error: "Missing JWT_SECRET environment variable" });
    }

    const redirectUri = (
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/google/oauth/callback`
    ).trim();

    const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    let state = "";
    let vendorAccountId = "";

    try {
      const auth0 = await verifyAuth0Token(authHeader.slice("Bearer ".length).trim());
      const vendorResolution = await resolveVendorAccountForAuth0Identity({
        auth0Sub: auth0.sub,
        email: auth0.email,
        context: "/api/google/oauth/start",
      });
      const vendorAccount = vendorResolution.account;

      if (!vendorAccount?.id) {
        return res.status(404).json({ error: "Vendor account not found for this Auth0 user" });
      }
      vendorAccountId = vendorAccount.id;
    } catch (error: any) {
      logger.error("Google OAuth start auth failed:", error?.message || error);
      return res.status(401).json({ error: "Invalid Auth0 token" });
    }
    const rawReturnTo = typeof req.query.returnTo === "string" ? req.query.returnTo.trim() : "";
    const ALLOWED_RETURN_TO_PREFIXES = ["/vendor/dashboard", "/vendor/listings", "/vendor/bookings", "/vendor/calendar", "/vendor/settings", "/vendor/profile"];
    const returnTo = ALLOWED_RETURN_TO_PREFIXES.some((prefix) => rawReturnTo === prefix || rawReturnTo.startsWith(prefix + "/") || rawReturnTo.startsWith(prefix + "?"))
      ? rawReturnTo
      : "/vendor/dashboard";
    try {
      state = createGoogleOauthState(vendorAccountId, returnTo);
    } catch (error: any) {
      logger.error("Google OAuth state generation failed:", error?.message || error);
      return res.status(500).json({ error: error?.message || "Unable to start Google OAuth" });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
    });

    if (state) {
      params.set("state", state);
    }

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.json({ url: authUrl });
  });

  app.get("/api/google/oauth/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
    const state = typeof req.query.state === "string" ? req.query.state.trim() : "";
    const googleError = typeof req.query.error === "string" ? req.query.error.trim() : "";
    const appUrl = (process.env.APP_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
    const isDev = process.env.NODE_ENV !== "production";

    // Helper: redirect with an error code so the frontend toast can show what went wrong
    const errorRedirect = (returnPath: string, reason: string) => {
      const params = new URLSearchParams({ google_calendar: "error" });
      if (isDev) params.set("reason", reason);
      return res.redirect(`${appUrl}${returnPath}?${params.toString()}`);
    };

    // Google redirected with an error (e.g. user denied, redirect_uri_mismatch)
    if (googleError || !code) {
      logger.error({ googleError }, "Google OAuth callback — missing code or Google error");
      return errorRedirect("/vendor/dashboard", googleError || "missing_code");
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      logger.error("Google OAuth callback — missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
      return errorRedirect("/vendor/dashboard", "missing_oauth_config");
    }

    const redirectUri = (
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/google/oauth/callback`
    ).trim();

    let parsedState: { vendorAccountId: string; returnTo: string } | null = null;
    try {
      parsedState = parseGoogleOauthState(state);
    } catch (error: any) {
      logger.error("Google OAuth callback state parse failed:", error?.message || error);
      return errorRedirect("/vendor/dashboard", "state_parse_error");
    }
    const returnPath = parsedState?.returnTo || "/vendor/dashboard";

    if (!parsedState?.vendorAccountId) {
      logger.error("Google OAuth callback — state missing vendorAccountId (expired or invalid)");
      return errorRedirect(returnPath, "invalid_state");
    }

    try {
      const vendorRows = await db
        .select({
          id: vendorAccounts.id,
          googleRefreshToken: vendorAccounts.googleRefreshToken,
          googleCalendarId: vendorAccounts.googleCalendarId,
          googleAccountEmail: vendorAccounts.googleAccountEmail,
        })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, parsedState.vendorAccountId))
        .limit(1);

      const vendorAccount = vendorRows[0];
      if (!vendorAccount) {
        logger.error({ vendorAccountId: parsedState.vendorAccountId }, "Google OAuth callback — vendor account not found");
        return errorRedirect(returnPath, "vendor_not_found");
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.text();
        logger.error({ status: tokenResponse.status, body: tokenError, redirectUri }, "Google OAuth token exchange failed");
        await db
          .update(vendorAccounts)
          .set({ googleConnectionStatus: "error" })
          .where(eq(vendorAccounts.id, vendorAccount.id));
        // Parse Google's error code if available (e.g. "redirect_uri_mismatch", "invalid_client")
        let googleErrorCode = "token_exchange_failed";
        try {
          const parsed = JSON.parse(tokenError);
          if (typeof parsed?.error === "string") googleErrorCode = parsed.error;
        } catch { /* ignore */ }
        return errorRedirect(returnPath, googleErrorCode);
      }

      const tokens = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const accessToken =
        typeof tokens.access_token === "string" ? tokens.access_token.trim() : "";
      if (!accessToken) {
        logger.error("Google OAuth token exchange succeeded without an access token");
        await db
          .update(vendorAccounts)
          .set({ googleConnectionStatus: "error" })
          .where(eq(vendorAccounts.id, vendorAccount.id));
        return errorRedirect(returnPath, "missing_access_token");
      }

      const refreshToken =
        typeof tokens.refresh_token === "string" && tokens.refresh_token.trim()
          ? tokens.refresh_token.trim()
          : (() => {
              const existing = vendorAccount.googleRefreshToken;
              if (!existing) return null;
              try {
                return decryptToken(existing);
              } catch {
                logger.warn(
                  "[google] legacy plaintext token detected for vendor, re-encrypt on next OAuth"
                );
                return existing;
              }
            })();
      const expiresAt =
        typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in)
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null;

      const googleAccountEmail = await fetchGoogleAccountEmail(accessToken);

      await db
        .update(vendorAccounts)
        .set({
          googleAccessToken: encryptToken(accessToken),
          googleRefreshToken: refreshToken ? encryptToken(refreshToken) : null,
          googleTokenExpiresAt: expiresAt,
          googleCalendarId: vendorAccount.googleCalendarId ?? null,
          googleConnectionStatus: "connected",
          googleAccountEmail: googleAccountEmail ?? vendorAccount.googleAccountEmail ?? null,
        })
        .where(eq(vendorAccounts.id, vendorAccount.id));

      // On reconnect, if a calendar was already selected, auto-sync any bookings
      // that previously failed to sync (e.g. due to expired tokens).
      const existingCalendarId = asTrimmedString(vendorAccount.googleCalendarId);
      if (existingCalendarId) {
        syncExistingBookingsToSelectedGoogleCalendar(vendorAccount.id, existingCalendarId).catch(
          (syncErr) => logRouteError("/api/google/oauth/callback auto-sync", syncErr)
        );
      }

      return res.redirect(`${appUrl}${returnPath}?google_calendar=connected`);
    } catch (error: any) {
      logger.error("Google OAuth callback error:", error?.message || error);
      return errorRedirect(returnPath, "server_exception");
    }
  });

  app.post("/api/google/oauth/disconnect", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }
      if (account.googleConnectionStatus !== "connected") {
        return res.status(400).json({ error: "Google Calendar is not connected" });
      }

      // Best-effort token revocation — non-fatal if it fails
      if (account.googleAccessToken) {
        try {
          const rawToken = decryptToken(account.googleAccessToken);
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rawToken)}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          });
        } catch (revokeErr) {
          logger.warn({ vendorAccountId: account.id }, "[google disconnect] token revocation failed (non-fatal)");
        }
      }

      await stopAllGoogleCalendarWatchChannelsForVendor(account.id);

      await db
        .update(vendorAccounts)
        .set({
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiresAt: null,
          googleCalendarId: null,
          googleConnectionStatus: "disconnected",
          googleAccountEmail: null,
        })
        .where(eq(vendorAccounts.id, account.id));

      return res.json({ success: true });
    } catch (error: any) {
      logRouteError("/api/google/oauth/disconnect", error);
      res.status(500).json({ error: "Failed to disconnect Google Calendar" });
    }
  });

  const selectGoogleCalendarSchema = z.object({
    calendarId: z.string().trim().min(1, "Calendar id is required"),
  });
  const saveGoogleEventMappingSchema = z.object({
    googleEventId: z.string().trim().min(1, "Google event id is required"),
    listingId: z.string().trim().min(1, "Listing id is required"),
  });

  app.get("/api/google/calendars", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const calendars = await listGoogleCalendarsForVendorAccount(account.id);
      return res.json(calendars);
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      logRouteError("/api/google/calendars", error);
      return res.status(500).json({ error: "Unable to load Google calendars" });
    }
  });

  app.post("/api/google/calendars/select", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const { calendarId } = selectGoogleCalendarSchema.parse(req.body ?? {});
      const calendars = await listGoogleCalendarsForVendorAccount(account.id);
      const selectedCalendar = calendars.find((calendar) => calendar.id === calendarId);

      if (!selectedCalendar) {
        return res.status(400).json({ error: "Selected calendar is not available for this Google account" });
      }

      // Stop the old watch channel if switching calendars
      const previousCalendarId = asTrimmedString(account.googleCalendarId);
      if (previousCalendarId && previousCalendarId !== selectedCalendar.id) {
        try {
          await stopGoogleCalendarWatchChannel(account.id, previousCalendarId);
        } catch (stopErr) {
          logRouteError("/api/google/calendars/select stop-old-watch", stopErr);
        }
      }

      await db
        .update(vendorAccounts)
        .set({
          googleCalendarId: selectedCalendar.id,
        })
        .where(eq(vendorAccounts.id, account.id));

      // Start watching the newly selected calendar (non-fatal if it fails)
      try {
        await createGoogleCalendarWatchChannel(account.id, selectedCalendar.id);
      } catch (watchErr) {
        logRouteError("/api/google/calendars/select create-watch", watchErr);
      }

      let existingBookingsSync:
        | Awaited<ReturnType<typeof syncExistingBookingsToSelectedGoogleCalendar>>
        | null = null;

      try {
        existingBookingsSync = await syncExistingBookingsToSelectedGoogleCalendar(
          account.id,
          selectedCalendar.id
        );
      } catch (syncError) {
        logRouteError("/api/google/calendars/select auto-sync", syncError);
      }

      return res.json({
        ...selectedCalendar,
        existingBookingsSync,
      });
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message || "Invalid calendar selection" });
      }
      logRouteError("/api/google/calendars/select", error);
      return res.status(500).json({ error: "Unable to save selected Google calendar" });
    }
  });

  app.post("/api/google/calendars/create", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const calendar = await createGoogleCalendarForVendorAccount(account.id);

      // Start watching the newly created calendar (non-fatal)
      try {
        await createGoogleCalendarWatchChannel(account.id, calendar.id);
      } catch (watchErr) {
        logRouteError("/api/google/calendars/create create-watch", watchErr);
      }

      return res.json(calendar);
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      logRouteError("/api/google/calendars/create", error);
      return res.status(500).json({ error: "Unable to create Google calendar" });
    }
  });

  app.post("/api/google/calendars/sync-existing", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const selectedGoogleCalendarId = asTrimmedString(account.googleCalendarId);
      if (!selectedGoogleCalendarId) {
        return res.status(400).json({
          error: "Google calendar is not selected",
          code: "google_calendar_not_selected",
        });
      }

      if (asTrimmedString(account.googleConnectionStatus).toLowerCase() !== "connected") {
        return res.status(400).json({
          error: "Google Calendar is not connected",
          code: "google_not_connected",
        });
      }

      const summary = await syncExistingBookingsToSelectedGoogleCalendar(
        account.id,
        selectedGoogleCalendarId
      );
      return res.json(summary);
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      logRouteError("/api/google/calendars/sync-existing", error);
      return res.status(500).json({ error: "Unable to sync existing EventHub bookings to Google Calendar" });
    }
  });

  app.get("/api/google/events/unmatched", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const googleCalendarId = asTrimmedString(account.googleCalendarId);
      if (!googleCalendarId) {
        return res.status(400).json({ error: "Google calendar is not selected", code: "google_calendar_not_selected" });
      }

      const { events } = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
        maxResults: 2500,
      });
      if (events.length === 0) {
        return res.json({ events: [] });
      }

      const listingContext = await loadVendorListingMatchContext(account.id);
      const mappingContext = await loadGoogleEventMappingContext({
        vendorAccountId: account.id,
        googleCalendarId,
        googleEventIds: events.map((event) => event.id),
      });

      // Exclude events already mapped as vacation blocks
      const vacationMappings = await db
        .select({ googleEventId: googleCalendarVacationMappings.googleEventId })
        .from(googleCalendarVacationMappings)
        .where(
          and(
            eq(googleCalendarVacationMappings.vendorAccountId, account.id),
            eq(googleCalendarVacationMappings.googleCalendarId, googleCalendarId)
          )
        );
      const vacationMappedEventIds = new Set(vacationMappings.map((m) => m.googleEventId));

      const unmatchedEvents = events
        .filter((event) => (asTrimmedString(event.status) || "").toLowerCase() !== "cancelled")
        .filter((event) => !vacationMappedEventIds.has(event.id))
        .filter((event) => {
          const match = matchGoogleCalendarEventToListing(event, {
            listingContext,
            mappingContext,
          });
          return !match.matched;
        })
        .map((event) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          status: event.status,
          start: event.start,
          end: event.end,
          updated: event.updated,
        }));

      return res.json({ events: unmatchedEvents });
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      logRouteError("/api/google/events/unmatched", error);
      return res.status(500).json({ error: "Unable to load unmatched Google events" });
    }
  });

  app.get("/api/google/events/mapped", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const googleCalendarId = asTrimmedString(account.googleCalendarId);
      if (!googleCalendarId) {
        return res.status(400).json({ error: "Google calendar is not selected", code: "google_calendar_not_selected" });
      }

      const mappings = await db
        .select({
          googleEventId: googleCalendarEventMappings.googleEventId,
          listingId: googleCalendarEventMappings.listingId,
          listingTitle: vendorListings.title,
          createdAt: googleCalendarEventMappings.createdAt,
        })
        .from(googleCalendarEventMappings)
        .innerJoin(vendorListings, eq(googleCalendarEventMappings.listingId, vendorListings.id))
        .where(
          and(
            eq(googleCalendarEventMappings.vendorAccountId, account.id),
            eq(googleCalendarEventMappings.googleCalendarId, googleCalendarId)
          )
        )
        .orderBy(googleCalendarEventMappings.createdAt);

      if (mappings.length === 0) {
        return res.json({ mappings: [] });
      }

      // Fetch Google events to enrich with title/dates
      const { events } = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
        maxResults: 2500,
      });
      const eventById = new Map(events.map((e) => [e.id, e]));

      const result = mappings.map((mapping) => {
        const googleEvent = eventById.get(mapping.googleEventId);
        return {
          googleEventId: mapping.googleEventId,
          googleEventSummary: googleEvent?.summary ?? null,
          googleEventStart: googleEvent?.start ?? null,
          googleEventEnd: googleEvent?.end ?? null,
          listingId: mapping.listingId,
          listingTitle: mapping.listingTitle,
          createdAt: mapping.createdAt,
        };
      });

      return res.json({ mappings: result });
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      logRouteError("/api/google/events/mapped", error);
      return res.status(500).json({ error: "Unable to load mapped Google events" });
    }
  });

  app.post("/api/google/events/map", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const googleCalendarId = asTrimmedString(account.googleCalendarId);
      if (!googleCalendarId) {
        return res.status(400).json({ error: "Google calendar is not selected", code: "google_calendar_not_selected" });
      }

      const { googleEventId, listingId } = saveGoogleEventMappingSchema.parse(req.body ?? {});

      const [listingRow] = await db
        .select({
          id: vendorListings.id,
        })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, listingId),
            eq(vendorListings.accountId, account.id),
            ne(vendorListings.status, "deleted")
          )
        )
        .limit(1);
      if (!listingRow?.id) {
        return res.status(400).json({ error: "Listing is not available for this vendor account" });
      }

      const { events } = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
        maxResults: 2500,
      });
      const selectedEvent = events.find((event) => event.id === googleEventId);
      if (!selectedEvent) {
        return res.status(400).json({ error: "Google event was not found in the selected calendar" });
      }

      const now = new Date();
      await db
        .insert(googleCalendarEventMappings)
        .values({
          vendorAccountId: account.id,
          googleEventId,
          googleCalendarId,
          listingId,
          mappingSource: "manual",
          mappingStatus: "reviewed",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            googleCalendarEventMappings.vendorAccountId,
            googleCalendarEventMappings.googleCalendarId,
            googleCalendarEventMappings.googleEventId,
          ],
          set: {
            listingId,
            mappingSource: "manual",
            mappingStatus: "reviewed",
            updatedAt: now,
          },
        });

      return res.json({
        googleEventId,
        googleCalendarId,
        listingId,
        mappingSource: "manual",
        mappingStatus: "reviewed",
      });
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message || "Invalid Google event mapping" });
      }
      logRouteError("/api/google/events/map", error);
      return res.status(500).json({ error: "Unable to save Google event mapping" });
    }
  });

  app.delete("/api/google/events/map/:googleEventId", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const googleCalendarId = asTrimmedString(account.googleCalendarId);
      if (!googleCalendarId) {
        return res.status(400).json({ error: "Google calendar is not selected", code: "google_calendar_not_selected" });
      }

      const googleEventId = asTrimmedString(req.params.googleEventId);
      if (!googleEventId) {
        return res.status(400).json({ error: "Google event id is required" });
      }

      await db
        .delete(googleCalendarEventMappings)
        .where(
          and(
            eq(googleCalendarEventMappings.vendorAccountId, account.id),
            eq(googleCalendarEventMappings.googleCalendarId, googleCalendarId),
            eq(googleCalendarEventMappings.googleEventId, googleEventId)
          )
        );

      return res.json({ googleEventId, cleared: true });
    } catch (error: any) {
      logRouteError("/api/google/events/map/:googleEventId DELETE", error);
      return res.status(500).json({ error: "Unable to clear Google event mapping" });
    }
  });

  // Mark an unmatched Google Calendar event as a vacation block
  app.post("/api/google/events/mark-vacation", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const googleCalendarId = asTrimmedString(account.googleCalendarId);
      if (!googleCalendarId) {
        return res.status(400).json({ error: "Google calendar is not selected", code: "google_calendar_not_selected" });
      }

      const googleEventId = asTrimmedString(
        typeof req.body?.googleEventId === "string" ? req.body.googleEventId : null
      );
      if (!googleEventId) {
        return res.status(400).json({ error: "googleEventId is required" });
      }

      // Fetch the event from Google Calendar to get its dates
      const event = await getGoogleCalendarEvent(account.id, googleCalendarId, googleEventId);
      if (!event) {
        return res.status(404).json({ error: "Google Calendar event not found" });
      }

      // Extract inclusive date range
      // All-day events use .date (exclusive end = day after last day)
      // Timed events use .dateTime — we take just the date portion
      const startDate =
        asTrimmedString(event.start?.date) ||
        (event.startAt ? event.startAt.toISOString().split("T")[0] : null);

      let endDate: string | null = null;
      if (asTrimmedString(event.end?.date)) {
        // All-day end is exclusive — subtract 1 day
        const exclusiveEnd = new Date(event.end!.date as string);
        exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() - 1);
        endDate = exclusiveEnd.toISOString().split("T")[0];
      } else if (event.endAt) {
        endDate = event.endAt.toISOString().split("T")[0];
      }

      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Unable to determine date range for this Google event" });
      }

      // Check for an existing vacation mapping (idempotent)
      const [existingMapping] = await db
        .select({ id: googleCalendarVacationMappings.id })
        .from(googleCalendarVacationMappings)
        .where(
          and(
            eq(googleCalendarVacationMappings.vendorAccountId, account.id),
            eq(googleCalendarVacationMappings.googleCalendarId, googleCalendarId),
            eq(googleCalendarVacationMappings.googleEventId, googleEventId)
          )
        )
        .limit(1);

      if (existingMapping) {
        return res.json({ alreadyExists: true });
      }

      // Create vacation block (source = google_calendar so the outbound sync is skipped)
      const blockId = crypto.randomUUID();
      await db.insert(vendorVacationBlocks).values({
        id: blockId,
        vendorId: account.id,
        startDate,
        endDate,
        googleEventId,
        googleCalendarId,
        source: "google_calendar",
      });

      // Record the vacation mapping for bidirectional delete
      await db.insert(googleCalendarVacationMappings).values({
        vendorAccountId: account.id,
        googleEventId,
        googleCalendarId,
        vacationBlockId: blockId,
        mappingSource: "manual",
      }).onConflictDoNothing();

      return res.json({ vacationBlockId: blockId, startDate, endDate });
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      logRouteError("/api/google/events/mark-vacation", error);
      return res.status(500).json({ error: "Unable to mark Google event as vacation block" });
    }
  });

  app.get("/api/google/bookings/reconciliation", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      return res.json(await buildGoogleBookingReconciliationForVendorAccount(account));
    } catch (error: any) {
      logRouteError("/api/google/bookings/reconciliation", error);
      return res.status(500).json({ error: "Unable to load Google booking reconciliation" });
    }
  });

  app.get("/api/google/bookings/verification/run", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      return res.json(await runGoogleBookingSyncVerificationForVendorAccount(account));
    } catch (error: any) {
      logRouteError("/api/google/bookings/verification/run", error);
      return res.status(500).json({ error: "Unable to run Google booking verification" });
    }
  });

  // ── Google Calendar push notification webhook ──────────────────────────────
  // No auth — Google calls this directly. We validate via X-Goog-Channel-Token.
  // Always responds 200 immediately; processing happens inline.
  app.post("/api/google/webhooks/calendar", async (req, res) => {
    res.status(200).json({ received: true });
    handleGoogleCalendarWebhook(req).catch((err) => {
      logger.error("[webhook] Unhandled error in handleGoogleCalendarWebhook:", err);
    });
  });

  // Dev-only: simulate a Google Calendar webhook notification for a vendor
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/internal/test/google-webhook", ...requireVendorAuth0, async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) {
          return res.status(404).json({ error: "Account not found" });
        }

        const { eq: eqFn } = await import("drizzle-orm");
        const { googleCalendarWatchChannels: watchChannelsTable } = await import("@shared/schema");

        const [channel] = await db
          .select()
          .from(watchChannelsTable)
          .where(eqFn(watchChannelsTable.vendorAccountId, account.id))
          .limit(1);

        if (!channel) {
          return res.status(400).json({ error: "No watch channel found for this vendor. Connect a Google Calendar first." });
        }

        await processGoogleWebhookForChannel(
          channel.vendorAccountId,
          channel.channelId,
          channel.calendarId
        );

        return res.json({ processed: true, channelId: channel.channelId });
      } catch (error: any) {
        logRouteError("/api/internal/test/google-webhook", error);
        return res.status(500).json({ error: "Test webhook processing failed" });
      }
    });
  }

  app.get("/api/internal/launch/smoke-summary", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfile = profileContext?.activeProfile ?? null;
      const activeProfileId = profileContext?.activeProfileId ?? null;
      if (!activeProfile?.id || !activeProfileId) {
        return res.status(404).json({ error: "Active profile not found" });
      }

      const [latestListing] = await db
        .select({
          id: vendorListings.id,
          status: vendorListings.status,
          title: vendorListings.title,
          instantBookEnabled: vendorListings.instantBookEnabled,
          pricingUnit: vendorListings.pricingUnit,
          quantity: vendorListings.quantity,
          serviceAreaMode: vendorListings.serviceAreaMode,
          serviceRadiusMiles: vendorListings.serviceRadiusMiles,
          listingServiceCenterLabel: vendorListings.listingServiceCenterLabel,
          listingServiceCenterLat: vendorListings.listingServiceCenterLat,
          listingServiceCenterLng: vendorListings.listingServiceCenterLng,
          updatedAt: vendorListings.updatedAt,
        })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.accountId, account.id),
            eq(vendorListings.profileId, activeProfileId),
            ne(vendorListings.status, "deleted")
          )
        )
        .orderBy(desc(vendorListings.updatedAt), desc(vendorListings.createdAt))
        .limit(1);

      const [latestBooking] = await db
        .select({
          id: bookings.id,
          status: bookings.status,
          listingId: bookings.listingId,
          pricingUnitSnapshot: bookings.pricingUnitSnapshot,
          bookingStartAt: bookings.bookingStartAt,
          bookingEndAt: bookings.bookingEndAt,
          vendorTimezoneSnapshot: bookings.vendorTimezoneSnapshot,
          googleSyncStatus: bookings.googleSyncStatus,
          googleEventId: bookings.googleEventId,
          googleCalendarId: bookings.googleCalendarId,
          createdAt: bookings.createdAt,
        })
        .from(bookings)
        .where(and(eq(bookings.vendorAccountId, account.id), eq(bookings.vendorProfileId, activeProfileId)))
        .orderBy(desc(bookings.createdAt))
        .limit(1);

      const googleVerification = await runGoogleBookingSyncVerificationForVendorAccount(account);
      const operatingTimezone = normalizeIanaTimeZone(activeProfile.operatingTimezone);

      const onboardingCanonicalReady = Boolean(
        asTrimmedString(activeProfile.profileName) &&
          asTrimmedString(activeProfile.businessPhone) &&
          asTrimmedString(activeProfile.businessEmail) &&
          asTrimmedString(activeProfile.businessAddressLabel)
      );
      const listingCanonicalReady = Boolean(
        latestListing?.id &&
          asTrimmedString(latestListing.pricingUnit) &&
          asTrimmedString(latestListing.serviceAreaMode) &&
          typeof latestListing.instantBookEnabled === "boolean"
      );
      const bookingTimingReady = Boolean(
        latestBooking?.id &&
          latestBooking.bookingStartAt instanceof Date &&
          latestBooking.bookingEndAt instanceof Date &&
          latestBooking.bookingEndAt.getTime() > latestBooking.bookingStartAt.getTime()
      );

      return res.json({
        generatedAt: new Date().toISOString(),
        vendor: {
          accountId: account.id,
          activeProfileId,
          operatingTimezone,
        },
        onboarding: {
          profileName: activeProfile.profileName,
          businessPhone: activeProfile.businessPhone,
          businessEmail: activeProfile.businessEmail,
          businessAddressLabel: activeProfile.businessAddressLabel,
          homeBaseLat: activeProfile.homeBaseLat,
          homeBaseLng: activeProfile.homeBaseLng,
          showBusinessPhoneToCustomers: activeProfile.showBusinessPhoneToCustomers,
          showBusinessEmailToCustomers: activeProfile.showBusinessEmailToCustomers,
          showBusinessAddressToCustomers: activeProfile.showBusinessAddressToCustomers,
          aboutVendor: activeProfile.aboutVendor,
          aboutBusiness: activeProfile.aboutBusiness,
          canonicalReady: onboardingCanonicalReady,
        },
        latestListing: latestListing
          ? {
              ...latestListing,
              ctaLabel: latestListing.instantBookEnabled ? "Book Now" : "Request to Book",
              canonicalReady: listingCanonicalReady,
            }
          : null,
        latestBooking: latestBooking
          ? {
              ...latestBooking,
              canonicalTimingReady: bookingTimingReady,
            }
          : null,
        google: googleVerification,
        checks: {
          onboardingCanonicalReady,
          listingCanonicalReady,
          bookingTimingReady,
        },
      });
    } catch (error: any) {
      logRouteError("/api/internal/launch/smoke-summary", error);
      return res.status(500).json({ error: "Unable to build launch smoke summary" });
    }
  });

  app.post("/api/google/bookings/reconciliation/:bookingId/repair", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const selectedGoogleCalendarId = asTrimmedString(account.googleCalendarId) || null;
      const googleEnabled =
        asTrimmedString(account.googleConnectionStatus).toLowerCase() === "connected" &&
        Boolean(selectedGoogleCalendarId);
      if (!googleEnabled || !selectedGoogleCalendarId) {
        return res.status(400).json({
          error: "Google Calendar must be connected and a calendar selected before repair can run.",
          code: "google_calendar_not_ready",
        });
      }

      const bookingId = asTrimmedString(req.params.bookingId);
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const candidateRows = await listGoogleSyncReconciliationCandidatesForVendorAccount(account.id);
      const candidateRow = candidateRows.find((row: any) => asTrimmedString(row?.id) === bookingId);
      if (!candidateRow) {
        return res.status(404).json({ error: "Booking not found for this vendor account" });
      }

      const syncResult = await syncEventHubBookingToGoogleCalendar({
        bookingId,
        targetCalendarId: selectedGoogleCalendarId,
      });

      if (syncResult.status === "failed") {
        return res.status(502).json({
          bookingId,
          status: "failed",
          syncResult,
          remainingIssueCodes: ["sync_failed"],
          googleCalendarId: selectedGoogleCalendarId,
          googleCalendarReadStatus: "skipped",
          googleCalendarReadError: null,
        });
      }

      if (syncResult.status === "skipped") {
        return res.status(400).json({
          bookingId,
          status: "skipped",
          syncResult,
          remainingIssueCodes: [],
          googleCalendarId: selectedGoogleCalendarId,
          googleCalendarReadStatus: "skipped",
          googleCalendarReadError: null,
        });
      }

      const reconciliation = await buildGoogleBookingReconciliationForVendorAccount(account);
      const remainingIssue =
        reconciliation.issues.find((issue) => issue.bookingId === bookingId) || null;

      if (reconciliation.googleCalendarReadStatus === "failed") {
        return res.status(502).json({
          bookingId,
          status: "verification_failed",
          syncResult,
          remainingIssueCodes: remainingIssue?.issueCodes || [],
          issue: remainingIssue,
          googleCalendarId: reconciliation.googleCalendarId,
          googleCalendarReadStatus: reconciliation.googleCalendarReadStatus,
          googleCalendarReadError: reconciliation.googleCalendarReadError,
        });
      }

      return res.json({
        bookingId,
        status: remainingIssue ? "needs_attention" : "repaired",
        syncResult,
        remainingIssueCodes: remainingIssue?.issueCodes || [],
        issue: remainingIssue,
        googleCalendarId: reconciliation.googleCalendarId,
        googleCalendarReadStatus: reconciliation.googleCalendarReadStatus,
        googleCalendarReadError: reconciliation.googleCalendarReadError,
      });
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: safeGoogleErrorMessage(error), code: error.code });
      }
      logRouteError("/api/google/bookings/reconciliation/:bookingId/repair", error);
      return res.status(500).json({ error: "Unable to repair Google booking sync" });
    }
  });
}
