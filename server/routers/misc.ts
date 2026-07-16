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
  persistUploadedFile,
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
import { registerBookingRoutes } from "../routers/bookings";
import { registerPaymentRoutes } from "../routers/payments";
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
  vendorInquiries,
} from "@shared/schema";
import {
  requireDualAuthAuth0,
  requireAdminAuth,
  resolveVendorAccountForAuth0Identity,
} from "../auth";
import { requireAuth0, verifyAuth0Token, sendVerificationEmailForUser } from "../auth0"; // ✅ Auth0 middleware
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
  makeObjectKey,
  resolveStoredUploadPath,
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

export function registerMiscRoutes(app: Express): void {

  const listingUploadsDir = path.join(process.cwd(), "server/uploads/listings");
  const vendorShopUploadsDir = path.join(process.cwd(), "server/uploads/vendor-shops");


  function validateImageMagicBytes(buf: Buffer): boolean {
    if (!buf || buf.length < 12) return false;
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isWebp = buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
    return isJpeg || isPng || isWebp;
  }

  const listingUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
      if (!ok) return cb(null, false); // silently reject
      return cb(null, true);
    },

  });

  // Upload one listing photo. Returns a public URL under /uploads/...
app.post(
  "/api/uploads/listing-photo",
  uploadRateLimiter,
  ...requireVendorAuth0,
  listingUpload.single("photo"),
  async (req: any, res) => {
    // multer rejected the file OR no file was provided
    const fileBuffer = req?.file?.buffer as Buffer | undefined;
    if (!fileBuffer) {
      return res.status(400).json({ error: "Only JPG, PNG, or WebP allowed (max 10MB)." });
    }
    if (!validateImageMagicBytes(fileBuffer)) {
      return res.status(400).json({ error: "Invalid image file. Only JPEG, PNG, and WebP are allowed." });
    }

    let persisted;
    try {
      persisted = await persistUploadedImage(fileBuffer, listingUploadsDir);
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Invalid upload" });
    }

    const storagePath = `/uploads/listings/${persisted.filename}`;
    const url = resolveStoredUploadPath(storagePath) ?? storagePath;
    return res.json({ url, filename: persisted.filename, storagePath });
  }
);

  const vendorShopUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
      if (!ok) return cb(null, false);
      return cb(null, true);
    },
  });

  app.post(
    "/api/uploads/vendor-shop-photo",
    uploadRateLimiter,
    ...requireVendorAuth0,
    vendorShopUpload.single("photo"),
    async (req: any, res) => {
      const fileBuffer = req?.file?.buffer as Buffer | undefined;
      if (!fileBuffer) {
        return res.status(400).json({ error: "Only JPG, PNG, or WebP allowed (max 10MB)." });
      }
      if (!validateImageMagicBytes(fileBuffer)) {
        return res.status(400).json({ error: "Invalid image file. Only JPEG, PNG, and WebP are allowed." });
      }

      let persisted;
      try {
        persisted = await persistUploadedImage(fileBuffer, vendorShopUploadsDir);
      } catch (error: any) {
        return res.status(400).json({ error: error?.message || "Invalid upload" });
      }

      const storagePath = `/uploads/vendor-shops/${persisted.filename}`;
      const url = resolveStoredUploadPath(storagePath) ?? storagePath;
      return res.json({ url, filename: persisted.filename, storagePath });
    }
  );

  // ── Dispute attachment upload ─────────────────────────────────────────────
  // Accepts PDF, JPG, PNG up to 10MB. Used by both vendor and customer dispute flows.
  // Returns a public URL to the stored file.
  const disputeUploadsDir = path.join(process.cwd(), "server/uploads/disputes");
  const disputeAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype);
      cb(null, ok);
    },
  });

  app.post(
    "/api/uploads/dispute-attachment",
    uploadRateLimiter,
    requireAuth0,
    disputeAttachmentUpload.single("file"),
    async (req: any, res) => {
      const fileBuffer = req?.file?.buffer as Buffer | undefined;
      const mimetype: string = req?.file?.mimetype ?? "";
      const originalName: string = req?.file?.originalname ?? "attachment";
      if (!fileBuffer) {
        return res.status(400).json({ error: "Only JPG, PNG, WebP, or PDF allowed (max 10MB)." });
      }

      try {
        let url: string;
        if (mimetype === "application/pdf") {
          // PDFs bypass image processing — store raw. persistUploadedFile requires
          // object storage in production (throws on failure), never ephemeral disk.
          const { storagePath } = await persistUploadedFile(fileBuffer, "disputes", {
            contentType: "application/pdf",
            ext: "pdf",
          });
          url = resolveStoredUploadPath(storagePath) ?? storagePath;
        } else {
          const persisted = await persistUploadedImage(fileBuffer, disputeUploadsDir);
          const storagePath = `/uploads/disputes/${persisted.filename}`;
          url = resolveStoredUploadPath(storagePath) ?? storagePath;
        }
        return res.json({ url, originalName });
      } catch (error: any) {
        return res.status(400).json({ error: error?.message || "Upload failed" });
      }
    }
  );

  // Public fee rate config — lets the frontend stay in sync with env-driven rates
  app.get("/api/config/fees", (_req, res) => {
    res.json({ vendorFeeRate: VENDOR_FEE_RATE, customerFeeRate: CUSTOMER_FEE_RATE });
  });

  // Location search (used by LocationPicker autocomplete)
  // Backed by the Mapbox Geocoding API. Nominatim (the previous backend) both
  // prohibits autocomplete in its usage policy and fails to parse common US
  // grid addresses like "8477 s 115 e, Sandy, Utah, 84070" (returns zero
  // results), which hard-blocked vendor onboarding.
  const mapboxGeocodingToken =
    process.env.MAPBOX_PLACES_TOKEN ||
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.VITE_MAPBOX_TOKEN ||
    "";

  app.get("/api/locations/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q || q.length < 2) return res.json([]);

      if (!mapboxGeocodingToken) {
        throw new Error("No Mapbox token configured (MAPBOX_ACCESS_TOKEN)");
      }

      const biasLat = parseFloat(String(req.query.bias_lat || ""));
      const biasLng = parseFloat(String(req.query.bias_lng || ""));
      const hasBias = Number.isFinite(biasLat) && Number.isFinite(biasLng);

      // "lat,lng" queries come from the "use my location" button and are
      // reverse geocodes — Mapbox expects those as "{lng},{lat}" and only
      // allows limit=1 unless a single type filter is given.
      const coordMatch = q.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
      const isReverse =
        !!coordMatch &&
        Math.abs(parseFloat(coordMatch[1])) <= 90 &&
        Math.abs(parseFloat(coordMatch[2])) <= 180;

      const searchText = isReverse ? `${coordMatch![2]},${coordMatch![1]}` : q;
      const params = isReverse
        ? ""
        : `&autocomplete=true&limit=5` +
          (hasBias ? `&proximity=${biasLng},${biasLat}` : "");

      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchText)}.json` +
        `?access_token=${mapboxGeocodingToken}&language=en${params}`;

      // The token is URL-restricted to the production domain, so the proxy
      // must present a matching Referer.
      const response = await fetch(url, {
        headers: { Referer: "https://eventhubglobal.com/" },
      });

      if (!response.ok) {
        throw new Error(`Mapbox responded with status ${response.status}`);
      }

      const data: any = await response.json();

      const results = (data?.features ?? [])
        .map((f: any) => {
          // Flatten the context array ("place.123" → place) for city/state/zip.
          const ctx: Record<string, any> = {};
          for (const c of f.context ?? []) {
            const key = String(c.id || "").split(".")[0];
            if (key && !ctx[key]) ctx[key] = c;
          }

          const placeType: string = f.place_type?.[0] ?? "";
          // Addresses: "8477 South 115 East". POIs keep their street in
          // properties.address and fall back to the venue name so the street
          // box isn't left empty when someone picks a venue by name. Cities,
          // regions, and other area results have no street.
          const street =
            placeType === "address"
              ? [f.address, f.text].filter(Boolean).join(" ")
              : placeType === "poi"
                ? String(f.properties?.address || f.text || "").trim()
                : "";
          const city =
            placeType === "place"
              ? f.text
              : ctx.place?.text || ctx.locality?.text || "";

          return {
            id: String(f.id || ""),
            label: f.place_name,
            lat: f.center?.[1],
            lng: f.center?.[0],
            street: street || undefined,
            city: city || undefined,
            state: ctx.region?.text || undefined,
            postalCode: ctx.postcode?.text || undefined,
            country: ctx.country?.short_code?.toUpperCase() || undefined,
            placeType: placeType || undefined,
          };
        })
        .filter((r: any) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

      return res.json(results);
    } catch (err: any) {
      logRouteError("/api/locations/search", err);
      return res.status(500).json({ error: "Location search failed" });
    }
  });

  app.patch("/api/user/language", mutationRateLimiter, async (req, res) => {
    try {
      const supported = new Set(["en", "es", "pt"]);
      const { language } = req.body;
      if (!language || !supported.has(language)) {
        return res.status(400).json({ error: "Unsupported language. Allowed: en, es, pt" });
      }

      // Try to resolve user from customer auth or vendor auth.
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false }).catch(() => null);
      const vendorAuth = (req as any).vendorAuth as { userId?: string } | undefined;

      const userId = customerAuth?.id ?? vendorAuth?.userId;
      if (!userId) {
        // Unauthenticated — client should fall back to localStorage only.
        return res.json({ ok: true, persisted: false });
      }

      await db
        .update(users)
        .set({ preferredLanguage: language, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return res.json({ ok: true, persisted: true, language });
    } catch (error: any) {
      logRouteError("/api/user/language", error);
      return res.status(500).json({ error: "Unable to save language preference" });
    }
  });

  const CUSTOMER_PROFILE_PHOTO_KEY = "_profilePhotoDataUrl";

  const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  };

  const splitCustomerDefaultLocation = (value: unknown) => {
    const record = asRecord(value);
    if (!record) {
      return {
        defaultLocation: null as Record<string, unknown> | null,
        profilePhotoDataUrl: null as string | null,
      };
    }

    const { [CUSTOMER_PROFILE_PHOTO_KEY]: rawPhoto, ...locationOnly } = record;
    const profilePhotoDataUrl =
      typeof rawPhoto === "string" && rawPhoto.trim().length > 0 ? rawPhoto.trim() : null;
    const defaultLocation = Object.keys(locationOnly).length > 0 ? locationOnly : null;

    return {
      defaultLocation,
      profilePhotoDataUrl,
    };
  };

  const composeCustomerDefaultLocation = (
    defaultLocation: Record<string, unknown> | null,
    profilePhotoDataUrl: string | null,
  ) => {
    const merged: Record<string, unknown> = defaultLocation ? { ...defaultLocation } : {};
    if (profilePhotoDataUrl) {
      merged[CUSTOMER_PROFILE_PHOTO_KEY] = profilePhotoDataUrl;
    }
    return Object.keys(merged).length > 0 ? merged : null;
  };

  app.get("/api/users/me/location", async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false }).catch(() => null);
      const vendorAuth = (req as any).vendorAuth as { userId?: string } | undefined;
      const userId = customerAuth?.id ?? vendorAuth?.userId;

      if (!userId) {
        return res.json({ location: null });
      }

      const [user] = await db
        .select({ defaultLocation: users.defaultLocation })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const { defaultLocation } = splitCustomerDefaultLocation(user?.defaultLocation);
      return res.json({ location: defaultLocation ?? null });
    } catch (error: any) {
      logRouteError("/api/users/me/location", error);
      return res.status(500).json({ error: "Unable to fetch location preference" });
    }
  });

  app.put("/api/users/me/location", mutationRateLimiter, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false }).catch(() => null);
      const vendorAuth = (req as any).vendorAuth as { userId?: string } | undefined;
      const userId = customerAuth?.id ?? vendorAuth?.userId;

      if (!userId) {
        return res.json({ ok: true, persisted: false });
      }

      const locationSchema = z.object({
        id: z.string().max(300).optional(),
        label: z.string().max(300),
        street: z.string().max(300).optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        postalCode: z.string().max(20).optional(),
        country: z.string().max(100).optional(),
        lat: z.number(),
        lng: z.number(),
      }).nullable().optional();

      const parseResult = locationSchema.safeParse(req.body?.location ?? null);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid location format" });
      }
      const location = parseResult.data ?? null;

      // Fetch existing record to preserve profile photo stored alongside location in the JSONB column
      const [existing] = await db
        .select({ defaultLocation: users.defaultLocation })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const { profilePhotoDataUrl } = splitCustomerDefaultLocation(existing?.defaultLocation);
      const composed = composeCustomerDefaultLocation(
        location ? (location as Record<string, unknown>) : null,
        profilePhotoDataUrl,
      );

      await db
        .update(users)
        .set({ defaultLocation: composed, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return res.json({ ok: true, persisted: true });
    } catch (error: any) {
      logRouteError("/api/users/me/location", error);
      return res.status(500).json({ error: "Unable to save location preference" });
    }
  });

  app.get("/api/rental-types", async (_req, res) => {
    const rows = await db
      .select({ slug: rentalTypes.slug, label: rentalTypes.label })
      .from(rentalTypes)
      .where(eq(rentalTypes.isActive, true));

    return res.json(rows);
  });

  app.get("/api/listings/public", browseRateLimiter, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");

      // Parse filter params
      // category: comma-separated (single value from hero, multi from browse filters)
      const rawCategoryParam = ((req.query.category as string) ?? "").trim();
      const categoriesFilter = rawCategoryParam
        ? rawCategoryParam.split(",").map((c) => normalizeListingCategory(c.trim())).filter(Boolean)
        : [];
      const rawSubs = ((req.query.subs as string) ?? "").trim();
      const rawDetails = ((req.query.details as string) ?? "").trim();
      // Dual price range — per_day and per_hour filtered independently
      const rawMinDailyPrice = parseFloat((req.query.minDailyPrice as string) ?? "");
      const rawMaxDailyPrice = parseFloat((req.query.maxDailyPrice as string) ?? "");
      const rawMinHourlyPrice = parseFloat((req.query.minHourlyPrice as string) ?? "");
      const rawMaxHourlyPrice = parseFloat((req.query.maxHourlyPrice as string) ?? "");
      // Pricing unit filter (e.g. "per_day" to show only daily listings)
      const rawPricingUnits = ((req.query.pricingUnits as string) ?? "").trim();
      const pricingUnitsFilter = rawPricingUnits
        ? rawPricingUnits.split(",").map((u) => u.trim()).filter((u) => u === "per_day" || u === "per_hour")
        : [];
      const rawSort = ((req.query.sort as string) ?? "recommended").trim();
      const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? "100", 10) || 100, 1), 500);
      const offset = Math.max(parseInt((req.query.offset as string) ?? "0", 10) || 0, 0);
      const rawSearchLat = parseFloat((req.query.lat as string) ?? "");
      const rawSearchLng = parseFloat((req.query.lng as string) ?? "");
      const hasLocationFilter = !isNaN(rawSearchLat) && !isNaN(rawSearchLng);

      const subsFilter = rawSubs ? rawSubs.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const detailsFilter = rawDetails ? rawDetails.split(",").map((s) => s.trim()).filter(Boolean) : [];

      // Base conditions — always applied
      // IMPORTANT: package_item rows are child rows — never show in browse. addon listings are shown.
      const conditions: ReturnType<typeof eq>[] = [
        eq(vendorListings.status, "active"),
        eq(vendorProfiles.active, true),
        eq(vendorAccounts.active, true),
        eq(vendorAccounts.shopActive, true),
        not(inArray(vendorListings.listingType, ["package_item"])),
      ] as any[];

      // Multi-category filter (OR across selected categories)
      if (categoriesFilter.length === 1) {
        conditions.push(eq(vendorListings.category, categoriesFilter[0] as string) as any);
      } else if (categoriesFilter.length > 1) {
        conditions.push(inArray(vendorListings.category, categoriesFilter as string[]) as any);
      }
      if (subsFilter.length === 1) {
        conditions.push(eq(vendorListings.subcategory, subsFilter[0]) as any);
      } else if (subsFilter.length > 1) {
        conditions.push(inArray(vendorListings.subcategory, subsFilter) as any);
      }
      if (detailsFilter.length === 1) {
        conditions.push(eq(vendorListings.subcategoryDetail, detailsFilter[0]) as any);
      } else if (detailsFilter.length > 1) {
        conditions.push(inArray(vendorListings.subcategoryDetail, detailsFilter) as any);
      }

      // Pricing unit filter (when only one type is toggled on)
      if (pricingUnitsFilter.length === 1) {
        conditions.push(eq(vendorListings.pricingUnit, pricingUnitsFilter[0]) as any);
      }

      // Dual price range — each range applies only to its pricing unit type.
      // A listing passes if it matches its type's range, or no range is set for its type.
      const hasDailyRange =
        (!isNaN(rawMinDailyPrice) && rawMinDailyPrice >= 0) ||
        (!isNaN(rawMaxDailyPrice) && rawMaxDailyPrice >= 0);
      const hasHourlyRange =
        (!isNaN(rawMinHourlyPrice) && rawMinHourlyPrice >= 0) ||
        (!isNaN(rawMaxHourlyPrice) && rawMaxHourlyPrice >= 0);

      if (hasDailyRange || hasHourlyRange) {
        const priceOrParts: any[] = [];

        if (hasDailyRange) {
          const dailyParts: any[] = [eq(vendorListings.pricingUnit, "per_day") as any];
          if (!isNaN(rawMinDailyPrice) && rawMinDailyPrice >= 0)
            dailyParts.push(gte(vendorListings.priceCents, Math.round(rawMinDailyPrice * 100)) as any);
          if (!isNaN(rawMaxDailyPrice) && rawMaxDailyPrice >= 0)
            dailyParts.push(lte(vendorListings.priceCents, Math.round(rawMaxDailyPrice * 100)) as any);
          priceOrParts.push(and(...dailyParts) as any);
        } else {
          priceOrParts.push(eq(vendorListings.pricingUnit, "per_day") as any);
        }

        if (hasHourlyRange) {
          const hourlyParts: any[] = [eq(vendorListings.pricingUnit, "per_hour") as any];
          if (!isNaN(rawMinHourlyPrice) && rawMinHourlyPrice >= 0)
            hourlyParts.push(gte(vendorListings.priceCents, Math.round(rawMinHourlyPrice * 100)) as any);
          if (!isNaN(rawMaxHourlyPrice) && rawMaxHourlyPrice >= 0)
            hourlyParts.push(lte(vendorListings.priceCents, Math.round(rawMaxHourlyPrice * 100)) as any);
          priceOrParts.push(and(...hourlyParts) as any);
        } else {
          priceOrParts.push(eq(vendorListings.pricingUnit, "per_hour") as any);
        }

        // Any other pricing unit always passes the price filter
        priceOrParts.push(not(inArray(vendorListings.pricingUnit, ["per_day", "per_hour"])) as any);
        conditions.push(or(...priceOrParts) as any);
      }

      // Location filter: the search point must fall within each listing's service radius.
      // Nationwide/global listings always pass. Listings with no coordinates are kept (forgiving).
      if (hasLocationFilter) {
        conditions.push(drizzleSql`(
          vendor_listings.service_area_mode IN ('nationwide', 'global')
          OR vendor_listings.listing_service_center_lat IS NULL
          OR vendor_listings.listing_service_center_lng IS NULL
          OR vendor_listings.service_radius_miles IS NULL
          OR (
            3958.8 * acos(
              GREATEST(-1.0::float8, LEAST(1.0::float8,
                cos(radians(${rawSearchLat}::float8)) * cos(radians(vendor_listings.listing_service_center_lat)) *
                cos(radians(vendor_listings.listing_service_center_lng) - radians(${rawSearchLng}::float8)) +
                sin(radians(${rawSearchLat}::float8)) * sin(radians(vendor_listings.listing_service_center_lat))
              ))
            ) <= vendor_listings.service_radius_miles
          )
        )` as any);
      }

      const whereClause = and(...(conditions as any[]));

      // Sort order — the default "recommended" sort applies a light Pro search
      // boost: vendors with Pro in effect rank above free vendors, then newest
      // first within each group. This is a soft tiebreak, NOT a hard top
      // placement — a separate paid "Featured" slot is reserved for the future.
      // The Pro condition mirrors getVendorEntitlements()'s `isPro` exactly
      // (active/trialing/past_due, or an unexpired comp grant); keep them in sync.
      // To disable the boost, drop `desc(proBoostExpr)` from the recommended case.
      const proBoostExpr = drizzleSql`(
        ${vendorAccounts.subscriptionStatus} IN ('active', 'trialing', 'past_due')
        OR (
          ${vendorAccounts.subscriptionStatus} = 'comp'
          AND (${vendorAccounts.compEndsAt} IS NULL OR ${vendorAccounts.compEndsAt} > now())
        )
      )`;
      const orderBy: any[] =
        rawSort === "price-asc"
          ? [asc(vendorListings.priceCents)]
          : rawSort === "price-desc"
          ? [desc(vendorListings.priceCents)]
          : [desc(proBoostExpr), desc(vendorListings.createdAt)];

      const selectShape = {
        id: vendorListings.id,
        status: vendorListings.status,
        listingType: vendorListings.listingType,
        title: vendorListings.title,
        category: vendorListings.category,
        subcategory: vendorListings.subcategory,
        subcategoryDetail: vendorListings.subcategoryDetail,
        description: vendorListings.description,
        whatsIncluded: vendorListings.whatsIncluded,
        whatsNotIncluded: vendorListings.whatsNotIncluded,
        tags: vendorListings.tags,
        popularFor: vendorListings.popularFor,
        instantBookEnabled: vendorListings.instantBookEnabled,
        pricingUnit: vendorListings.pricingUnit,
        priceCents: vendorListings.priceCents,
        quantity: vendorListings.quantity,
        minimumHours: vendorListings.minimumHours,
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
        photos: vendorListings.photos,
        listingData: vendorListings.listingData,
        city: vendorProfiles.city,
        vendorId: vendorAccounts.id,
        vendorName: vendorAccounts.businessName,
        vendorOnlineProfiles: vendorProfiles.onlineProfiles,
      };

      // Fetch page + total count in parallel
      const [listings, countRows] = await Promise.all([
        db
          .select(selectShape)
          .from(vendorListings)
          .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
          .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
          .where(whereClause)
          .orderBy(...orderBy)
          .limit(limit)
          .offset(offset),
        db
          .select({ total: drizzleSql<number>`count(*)::int` })
          .from(vendorListings)
          .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
          .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
          .where(whereClause),
      ]);

      const total: number = countRows[0]?.total ?? 0;

      const compliantListings = listings.filter(
        (listing) =>
          isListingPubliclyCompliant({
            listingDataRaw: (listing as any)?.listingData,
            canonicalCategory: (listing as any)?.category,
            canonicalPriceCents: (listing as any)?.priceCents,
            canonicalPhotos: (listing as any)?.photos,
          })
      );
      const listingsWithVendorMeta = compliantListings.map((listing: any) => {
        const onlineProfiles =
          listing.vendorOnlineProfiles &&
          typeof listing.vendorOnlineProfiles === "object" &&
          !Array.isArray(listing.vendorOnlineProfiles)
            ? (listing.vendorOnlineProfiles as Record<string, unknown>)
            : {};
        const vendorProfileImageUrl = resolveStoredUploadPath(asTrimmedString((onlineProfiles as any).shopProfileImageUrl));
        const { vendorOnlineProfiles: _ignored, ...safeListing } = listing;
        return {
          ...safeListing,
          photos: ((safeListing as any).photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
          vendorProfileImageUrl: vendorProfileImageUrl || null,
        };
      });

      return res.json({ listings: listingsWithVendorMeta, total, offset, limit });
    } catch (error: any) {
      logRouteError("/api/listings/public", error);
      return res.status(500).json({ error: "Unable to load listings" });
    }

  });

  app.get("/api/listings/available-subcategories", async (req, res) => {
    try {
      const rows = await db.execute(drizzleSql`
        SELECT
          LOWER(TRIM(category))                  AS category_key,
          TRIM(subcategory)                      AS subcategory,
          TRIM(subcategory_detail)               AS subcategory_detail,
          COUNT(*)::int                          AS count
        FROM vendor_listings
        WHERE status = 'active'
          AND TRIM(COALESCE(category, '')) != ''
          AND TRIM(COALESCE(subcategory, '')) != ''
        GROUP BY 1, 2, 3
        ORDER BY 1, count DESC
      `);

      type SubcatRow = { category_key: string; subcategory: string; subcategory_detail: string | null; count: number };
      const typed = extractRows<SubcatRow>(rows);

      // Shape: { rentals: { subcategories: string[], details: Record<string,string[]> }, ... }
      const result: Record<string, { subcategories: string[]; details: Record<string, string[]> }> = {};

      for (const row of typed) {
        const key = row.category_key; // e.g. "rentals", "venues"
        if (!result[key]) result[key] = { subcategories: [], details: {} };

        const sub = row.subcategory;
        if (!result[key].subcategories.includes(sub)) {
          result[key].subcategories.push(sub);
        }

        if (row.subcategory_detail) {
          if (!result[key].details[sub]) result[key].details[sub] = [];
          if (!result[key].details[sub].includes(row.subcategory_detail)) {
            result[key].details[sub].push(row.subcategory_detail);
          }
        }
      }

      res.setHeader("Cache-Control", "no-store");
      return res.json(result);
    } catch (error: any) {
      logRouteError("/api/listings/available-subcategories", error);
      return res.status(500).json({ error: "Unable to load subcategories" });
    }
  });

  app.get("/api/listings/public/:id", browseRateLimiter, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");

      // Listing IDs are UUID strings (not numbers)
      const id = String(req.params.id || "").trim();

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

      if (!isUuid) {
        return res.status(400).json({ error: "Invalid listing id" });
      }

      const rows = await db
        .select({
          id: vendorListings.id,
          status: vendorListings.status,
          listingType: vendorListings.listingType,
          packageAvailabilityMode: vendorListings.packageAvailabilityMode,
          title: vendorListings.title,
          category: vendorListings.category,
          subcategory: vendorListings.subcategory,
          subcategoryDetail: vendorListings.subcategoryDetail,
          description: vendorListings.description,
          whatsIncluded: vendorListings.whatsIncluded,
          whatsNotIncluded: vendorListings.whatsNotIncluded,
          tags: vendorListings.tags,
          popularFor: vendorListings.popularFor,
          instantBookEnabled: vendorListings.instantBookEnabled,
          allowPreBookingContact: vendorListings.allowPreBookingContact,
          pricingUnit: vendorListings.pricingUnit,
          priceCents: vendorListings.priceCents,
          quantity: vendorListings.quantity,
          minimumHours: vendorListings.minimumHours,
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
          cancellationPolicy: vendorListings.cancellationPolicy,
          cancellationPolicyDays: vendorListings.cancellationPolicyDays,
          securityDepositEnabled: vendorListings.securityDepositEnabled,
          securityDepositCents: vendorListings.securityDepositCents,
          photos: vendorListings.photos,
          listingData: vendorListings.listingData,

          city: vendorProfiles.city,
          businessState: vendorProfiles.businessState,
          vendorId: vendorAccounts.id,
          vendorName: vendorAccounts.businessName,
          vendorOnlineProfiles: vendorProfiles.onlineProfiles,
          shopActive: vendorAccounts.shopActive,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
        .where(
          and(
            eq(vendorListings.status, "active"),
            eq(vendorListings.id, id),
            eq(vendorProfiles.active, true),
            eq(vendorAccounts.active, true),
            // Allow direct access to package_item and addon rows when fetched by explicit id
            // (e.g., for checkout), but the browse guard above prevents accidental exposure.
          )
        )
        .limit(1);

      const listingRaw = rows[0];
      const listingTypeRaw = (listingRaw as any)?.listingType;
      const isPackageContainerListing = listingTypeRaw === "package_container";
      // package_container: price comes from child package_items, not the container row — skip price check
      const isCompliantListing = listingRaw
        ? (isPackageContainerListing
            ? Boolean(
                resolveCanonicalListingCategory((listingRaw as any).listingData, (listingRaw as any).category) &&
                hasMinimumListingPhotos((listingRaw as any).listingData, (listingRaw as any).photos)
              )
            : isListingPubliclyCompliant({
                listingDataRaw: (listingRaw as any).listingData,
                canonicalCategory: (listingRaw as any).category,
                canonicalPriceCents: (listingRaw as any).priceCents,
                canonicalPhotos: (listingRaw as any).photos,
              }))
        : false;
      if (!isCompliantListing) {
        return res.status(404).json({ error: "Not found" });
      }
      const onlineProfiles =
        listingRaw?.vendorOnlineProfiles &&
        typeof listingRaw.vendorOnlineProfiles === "object" &&
        !Array.isArray(listingRaw.vendorOnlineProfiles)
          ? (listingRaw.vendorOnlineProfiles as Record<string, unknown>)
          : {};
      const vendorProfileImageUrl = resolveStoredUploadPath(asTrimmedString((onlineProfiles as any).shopProfileImageUrl));
      const listing = listingRaw
        ? (() => {
            const { vendorOnlineProfiles: _ignored, ...safeListing } = listingRaw as any;
            return {
              ...safeListing,
              photos: ((safeListing as any).photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
              vendorProfileImageUrl: vendorProfileImageUrl || null,
            };
          })()
        : null;
      if (!listing) return res.status(404).json({ error: "Not found" });

      const reviewsResult: any = await db.execute(drizzleSql`
        select
          lr.id,
          lr.rating,
          lr.title,
          lr.body,
          lr.created_at as "createdAt",
          coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "authorName",
          rr.reply as "vendorReply",
          rr.created_at as "vendorRepliedAt"
        from listing_reviews lr
        left join users u on u.id = lr.user_id
        left join review_replies rr on rr.listing_review_id = lr.id
        where lr.listing_id = ${listing.id}
          and coalesce(lr.is_published, true) = true
        order by lr.created_at desc
        limit 20
      `);

      const reviewRows = extractRows<{
        id?: string;
        rating?: number | string | null;
        title?: string | null;
        body?: string | null;
        createdAt?: string | Date | null;
        authorName?: string | null;
        vendorReply?: string | null;
        vendorRepliedAt?: string | Date | null;
      }>(reviewsResult);

      const publishedReviews = reviewRows
        .map((row) => ({
          id: String(row.id || "").trim(),
          rating: Number(row.rating || 0),
          title: typeof row.title === "string" ? row.title : null,
          body: typeof row.body === "string" ? row.body : null,
          createdAt: row.createdAt ?? null,
          authorName:
            typeof row.authorName === "string" && row.authorName.trim().length > 0
              ? row.authorName.trim()
              : "Customer",
          vendorReply: typeof row.vendorReply === "string" && row.vendorReply.trim().length > 0
            ? row.vendorReply.trim()
            : null,
          vendorRepliedAt: row.vendorRepliedAt ?? null,
        }))
        .filter((row) => row.id.length > 0 && Number.isFinite(row.rating) && row.rating > 0);

      const reviewCount = publishedReviews.length;
      const rating =
        reviewCount > 0
          ? publishedReviews.reduce((sum, row) => sum + row.rating, 0) / reviewCount
          : 0;

      // 🔹 analytics: listing view (non-blocking)
      try {
        await db.insert(listingTraffic).values({
          id: crypto.randomUUID(),
          listingId: listing.id,
          eventType: "view",
          userId: (req as any).user?.id ?? null,
          occurredAt: new Date(),
          meta: {},
        });
      } catch (err) {
        logger.warn({ err }, "listing_traffic insert failed");
      }
      // Fetch vendor vacation blocks so the listing detail page can show inline warnings
      const vacationBlocks = listing.vendorId
        ? await db
            .select({
              id: vendorVacationBlocks.id,
              startDate: vendorVacationBlocks.startDate,
              endDate: vendorVacationBlocks.endDate,
            })
            .from(vendorVacationBlocks)
            .where(eq(vendorVacationBlocks.vendorId, listing.vendorId))
            .orderBy(asc(vendorVacationBlocks.startDate))
        : [];

      // ── Packages: fetch child package_item rows if this is a package_container ──
      const isPackageContainer = (listing as any).listingType === "package_container";
      const packages = isPackageContainer
        ? await db
            .select({
              id: vendorListings.id,
              title: vendorListings.title,
              description: vendorListings.description,
              whatsIncluded: vendorListings.whatsIncluded,
              whatsNotIncluded: vendorListings.whatsNotIncluded,
              priceCents: vendorListings.priceCents,
              pricingUnit: vendorListings.pricingUnit,
              quantity: vendorListings.quantity,
              minimumHours: vendorListings.minimumHours,
              sortOrder: vendorListings.sortOrder,
              photos: vendorListings.photos,
              serviceAreaMode: vendorListings.serviceAreaMode,
              listingServiceCenterLabel: vendorListings.listingServiceCenterLabel,
              listingServiceCenterLat: vendorListings.listingServiceCenterLat,
              listingServiceCenterLng: vendorListings.listingServiceCenterLng,
              serviceRadiusMiles: vendorListings.serviceRadiusMiles,
              serviceAreaOverride: vendorListings.serviceAreaOverride,
              travelOffered: vendorListings.travelOffered,
              travelFeeEnabled: vendorListings.travelFeeEnabled,
              travelFeeType: vendorListings.travelFeeType,
              travelFeeAmountCents: vendorListings.travelFeeAmountCents,
              deliveryOffered: vendorListings.deliveryOffered,
              deliveryFeeEnabled: vendorListings.deliveryFeeEnabled,
              deliveryFeeAmountCents: vendorListings.deliveryFeeAmountCents,
              setupOffered: vendorListings.setupOffered,
              setupFeeEnabled: vendorListings.setupFeeEnabled,
              setupFeeAmountCents: vendorListings.setupFeeAmountCents,
              takedownOffered: vendorListings.takedownOffered,
              takedownFeeEnabled: vendorListings.takedownFeeEnabled,
              takedownFeeAmountCents: vendorListings.takedownFeeAmountCents,
              cancellationPolicy: vendorListings.cancellationPolicy,
              cancellationPolicyDays: vendorListings.cancellationPolicyDays,
              listingData: vendorListings.listingData,
            })
            .from(vendorListings)
            .where(
              and(
                eq(vendorListings.parentListingId, listing.id),
                eq(vendorListings.listingType, "package_item"),
                eq(vendorListings.status, "active")
              )
            )
            .orderBy(asc(vendorListings.sortOrder), asc(vendorListings.createdAt))
        : [];

      // ── Add-ons: fetch any add-on listings attached to this listing ──────────
      const attachedAddonLinks = await db
        .select({
          addonListingId: listingAddonLinks.addonListingId,
        })
        .from(listingAddonLinks)
        .where(eq(listingAddonLinks.parentListingId, listing.id));

      const addonIds = attachedAddonLinks.map((r) => r.addonListingId);
      const attachedAddons =
        addonIds.length > 0
          ? await db
              .select({
                id: vendorListings.id,
                title: vendorListings.title,
                description: vendorListings.description,
                priceCents: vendorListings.priceCents,
                pricingUnit: vendorListings.pricingUnit,
                quantity: vendorListings.quantity,
                minimumHours: vendorListings.minimumHours,
                photos: vendorListings.photos,
                whatsIncluded: vendorListings.whatsIncluded,
              })
              .from(vendorListings)
              .where(
                and(
                  inArray(vendorListings.id, addonIds),
                  eq(vendorListings.status, "active")
                )
              )
          : [];

      const resolvedAddons = attachedAddons.map((a) => ({
        ...a,
        photos: ((a.photos ?? []) as string[]).map((p) => resolveStoredUploadPath(p) ?? p),
      }));

      // Overlay translated content if a non-English language is requested.
      const requestedLang = resolveRequestLanguage(
        req.query.lang as string | undefined,
        undefined,
        req.headers["accept-language"]
      );

      // Helper: extract the best-available string array from a value
      const toStrArr = (v: unknown): string[] =>
        Array.isArray(v)
          ? (v as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => (s as string).trim())
          : [];

      let translation: Awaited<ReturnType<typeof getListingTranslation>> = null;
      const pkgTranslationMap = new Map<string, Awaited<ReturnType<typeof getListingTranslation>>>();

      if (requestedLang !== "en") {
        // Use JSONB listingData as fallback when canonical columns are null/empty.
        const ld = (listing.listingData ?? {}) as Record<string, any>;
        const effectiveDescription =
          (typeof listing.description === "string" && listing.description.trim() ? listing.description : null) ??
          (typeof ld.description === "string" && ld.description.trim() ? ld.description : null) ??
          (typeof ld.listingDescription === "string" && ld.listingDescription.trim() ? ld.listingDescription : null) ??
          (typeof ld.serviceDescription === "string" && ld.serviceDescription.trim() ? ld.serviceDescription : null) ??
          null;
        const effectiveWhatsIncluded = listing.whatsIncluded?.length
          ? listing.whatsIncluded
          : toStrArr(ld.whatsIncluded ?? ld.includedItems ?? ld.included);
        const effectiveWhatsNotIncluded = listing.whatsNotIncluded?.length
          ? listing.whatsNotIncluded
          : toStrArr(ld.whatsNotIncluded);

        // ensureListingTranslation: returns cached translation or translates synchronously.
        translation = await ensureListingTranslation(listing.id, {
          title: listing.title,
          description: effectiveDescription,
          whatsIncluded: effectiveWhatsIncluded,
          whatsNotIncluded: effectiveWhatsNotIncluded,
        }, requestedLang);

        // Packages: same pattern — synchronous on first miss.
        if (packages.length > 0) {
          await Promise.all(packages.map(async (pkg) => {
            const pkgLd = (pkg as any).listingData ?? {};
            const pkgTrans = await ensureListingTranslation(pkg.id, {
              title: pkg.title,
              description: (typeof pkg.description === "string" && pkg.description.trim() ? pkg.description : null) ??
                (typeof pkgLd.description === "string" && pkgLd.description.trim() ? pkgLd.description : null) ?? null,
              whatsIncluded: pkg.whatsIncluded?.length ? pkg.whatsIncluded : toStrArr(pkgLd.whatsIncluded ?? pkgLd.includedItems),
              whatsNotIncluded: pkg.whatsNotIncluded?.length ? pkg.whatsNotIncluded : toStrArr(pkgLd.whatsNotIncluded),
            }, requestedLang);
            if (pkgTrans) pkgTranslationMap.set(pkg.id, pkgTrans);
          }));
        }
      }

      const translatedListing = translation
        ? {
            ...listing,
            title: translation.title ?? listing.title,
            description: translation.description ?? listing.description,
            whatsIncluded: translation.whatsIncluded.length ? translation.whatsIncluded : listing.whatsIncluded,
            whatsNotIncluded: translation.whatsNotIncluded.length ? translation.whatsNotIncluded : listing.whatsNotIncluded,
          }
        : listing;

      return res.json({
        ...translatedListing,
        rating,
        reviewCount,
        reviews: publishedReviews,
        shopActive: listing.shopActive ?? true,
        vacationBlocks,
        detectedLanguage: requestedLang,
        // Packages (empty array for single/addon listings)
        packages: packages.map((pkg) => {
          const pkgTrans = pkgTranslationMap.get(pkg.id);
          return {
            ...pkg,
            photos: ((pkg.photos ?? []) as string[]).map((p) => resolveStoredUploadPath(p) ?? p),
            ...(pkgTrans
              ? {
                  title: pkgTrans.title ?? pkg.title,
                  description: pkgTrans.description ?? pkg.description,
                  whatsIncluded: pkgTrans.whatsIncluded.length ? pkgTrans.whatsIncluded : pkg.whatsIncluded,
                  whatsNotIncluded: pkgTrans.whatsNotIncluded.length ? pkgTrans.whatsNotIncluded : pkg.whatsNotIncluded,
                }
              : {}),
          };
        }),
        // Attached add-ons ("People that order X frequently add on:")
        attachedAddons: resolvedAddons,
      });
    } catch (error: any) {
      logRouteError("/api/listings/public/:id", error);
      return res.status(500).json({ error: "Unable to load listing" });
    }
  });

  app.post("/api/webhooks/stream", async (req, res) => {
    try {
      if (!isStreamChatConfigured()) {
        return res.status(200).json({ ok: true }); // Acknowledge silently when not configured
      }

      const signature = String(req.headers["x-signature"] || "").trim();
      if (!signature) {
        return res.status(400).json({ error: "Missing x-signature header" });
      }

      // Verify webhook signature using raw body (same pattern as Stripe webhook)
      const { StreamChat } = await import("stream-chat");
      const apiKey = (process.env.STREAM_API_KEY || "").trim();
      const apiSecret = (process.env.STREAM_API_SECRET || "").trim();
      const client = StreamChat.getInstance(apiKey, apiSecret);

      const rawBody =
        (req as any).rawBody instanceof Buffer
          ? (req as any).rawBody.toString("utf8")
          : JSON.stringify(req.body || {});

      const isValid = client.verifyWebhook(rawBody, signature);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      const event = req.body as {
        type?: string;
        message?: { text?: string; user?: { id?: string } };
        channel_id?: string;
        channel_type?: string;
      };

      // Act on new messages in booking channels and pre-booking inquiry channels
      const channelId = String(event.channel_id || "");
      const isBookingChannel = channelId.startsWith("booking_");
      const isInquiryChannel = channelId.startsWith("inquiry_");
      if (event.type !== "message.new" || (!isBookingChannel && !isInquiryChannel)) {
        return res.status(200).json({ ok: true });
      }

      const senderStreamUserId = String(event.message?.user?.id || "");
      const messageText = String(event.message?.text || "").trim();

      // Determine who sent the message so we can email the other party
      const senderIsCustomer = senderStreamUserId.startsWith("customer_");
      const senderIsVendor = senderStreamUserId.startsWith("vendor_");
      if (!senderIsCustomer && !senderIsVendor) {
        return res.status(200).json({ ok: true });
      }

      if (isBookingChannel) {
      const bookingId = channelId.replace(/^booking_/, "");
      void (async () => {
        try {
          const serverUrl = appUrl();
          const emailRows: any = await db.execute(drizzleSql`
            select
              u.email     as "customerEmail",
              u.name      as "customerName",
              va.email    as "vendorEmail",
              va.business_name as "vendorName",
              b.event_date as "eventDate"
            from bookings b
            join users u  on u.id  = b.customer_id
            join vendor_accounts va on va.id = b.vendor_account_id
            where b.id = ${bookingId}
            limit 1
          `);
          const info = extractRows<{
            customerEmail: string;
            customerName: string;
            vendorEmail: string;
            vendorName: string;
            eventDate: string;
          }>(emailRows)[0];

          if (!info) return;

          const THIRTY_MINUTES_MS = 30 * 60 * 1000;
          const now = new Date();

          if (senderIsCustomer && info.vendorEmail) {
            // Customer sent — notify vendor (rate limited per booking)
            const [cooldownRow] = await db
              .select({ lastSent: bookings.vendorMsgEmailLastSentAt })
              .from(bookings)
              .where(eq(bookings.id, bookingId))
              .limit(1);
            const lastSent = cooldownRow?.lastSent;
            if (!lastSent || now.getTime() - new Date(lastSent).getTime() > THIRTY_MINUTES_MS) {
              await sendNewMessageEmail(info.vendorEmail, {
                recipientName: info.vendorName || "Vendor",
                senderName: info.customerName || "Customer",
                eventDate: info.eventDate,
                messagePreview: messageText,
                serverUrl,
                bookingId,
                recipientRole: "vendor",
              });
              await db
                .update(bookings)
                .set({ vendorMsgEmailLastSentAt: now })
                .where(eq(bookings.id, bookingId));
            }
          } else if (senderIsVendor && info.customerEmail) {
            // Vendor sent — notify customer (rate limited per booking)
            const [cooldownRow] = await db
              .select({ lastSent: bookings.customerMsgEmailLastSentAt })
              .from(bookings)
              .where(eq(bookings.id, bookingId))
              .limit(1);
            const lastSent = cooldownRow?.lastSent;
            if (!lastSent || now.getTime() - new Date(lastSent).getTime() > THIRTY_MINUTES_MS) {
              await sendNewMessageEmail(info.customerEmail, {
                recipientName: info.customerName || "Customer",
                senderName: info.vendorName || "Vendor",
                eventDate: info.eventDate,
                messagePreview: messageText,
                serverUrl,
                bookingId,
                recipientRole: "customer",
              });
              await db
                .update(bookings)
                .set({ customerMsgEmailLastSentAt: now })
                .where(eq(bookings.id, bookingId));
            }
          }
        } catch (emailError: any) {
          logger.warn("[stream webhook email] failed:", emailError?.message || emailError);
        }
      })();
      }

      if (isInquiryChannel) {
      void (async () => {
        try {
          const serverUrl = appUrl();
          const inqRows: any = await db.execute(drizzleSql`
            select
              vi.id                              as "inquiryId",
              vi.vendor_account_id               as "vendorAccountId",
              vi.vendor_msg_email_last_sent_at   as "vendorMsgLastSent",
              vi.customer_msg_email_last_sent_at as "customerMsgLastSent",
              u.email          as "customerEmail",
              u.name           as "customerName",
              va.email         as "vendorEmail",
              va.business_name as "vendorName"
            from vendor_inquiries vi
            join users u on u.id = vi.customer_id
            join vendor_accounts va on va.id = vi.vendor_account_id
            where vi.stream_channel_id = ${channelId}
            limit 1
          `);
          const inq = extractRows<{
            inquiryId: string;
            vendorAccountId: string;
            vendorMsgLastSent: string | null;
            customerMsgLastSent: string | null;
            customerEmail: string;
            customerName: string;
            vendorEmail: string;
            vendorName: string;
          }>(inqRows)[0];
          if (!inq) return;

          const THIRTY_MINUTES_MS = 30 * 60 * 1000;
          const now = new Date();

          if (senderIsCustomer && inq.vendorEmail) {
            // Customer messaged the vendor before booking — notify vendor (rate limited per inquiry)
            const lastSent = inq.vendorMsgLastSent;
            if (!lastSent || now.getTime() - new Date(lastSent).getTime() > THIRTY_MINUTES_MS) {
              await sendNewMessageEmail(inq.vendorEmail, {
                recipientName: inq.vendorName || "Vendor",
                senderName: inq.customerName || "Customer",
                messagePreview: messageText,
                serverUrl,
                recipientRole: "vendor",
              });
              await db
                .update(vendorInquiries)
                .set({ vendorMsgEmailLastSentAt: now })
                .where(eq(vendorInquiries.id, inq.inquiryId));
            }
          } else if (senderIsVendor && inq.customerEmail) {
            // Vendor replied to the inquiry — notify customer (rate limited per inquiry)
            const lastSent = inq.customerMsgLastSent;
            if (!lastSent || now.getTime() - new Date(lastSent).getTime() > THIRTY_MINUTES_MS) {
              await sendNewMessageEmail(inq.customerEmail, {
                recipientName: inq.customerName || "Customer",
                senderName: inq.vendorName || "Vendor",
                messagePreview: messageText,
                serverUrl,
                vendorAccountId: inq.vendorAccountId,
                recipientRole: "customer",
              });
              await db
                .update(vendorInquiries)
                .set({ customerMsgEmailLastSentAt: now })
                .where(eq(vendorInquiries.id, inq.inquiryId));
            }
          }
        } catch (emailError: any) {
          logger.warn("[stream webhook inquiry email] failed:", emailError?.message || emailError);
        }
      })();
      }

      return res.status(200).json({ ok: true });
    } catch (error: any) {
      logger.warn("[stream webhook] error:", error?.message || error);
      return res.status(200).json({ ok: true }); // Always 200 to prevent Stream Chat retries
    }
  });

  app.post("/api/chat/moderation/flag", messagingRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      await ensureModerationTable();

      const payload = z
        .object({
          bookingId: z.string().min(1),
          reason: z
            .enum(["profanity", "toxicity", "inappropriate_content", "pii_attempt"])
            .default("inappropriate_content"),
          sampleText: z.string().max(280).optional(),
          metadata: z.record(z.unknown()).optional(),
        })
        .parse(req.body ?? {});

      const booking = await getBookingChatContextById(payload.bookingId);
      if (!booking?.bookingId) {
        return res.status(404).json({ error: "Booking not found" });
      }

      let actorType: "vendor" | "customer";
      let actorId: string;
      if ((req as any).vendorAuth?.id) {
        actorType = "vendor";
        actorId = String((req as any).vendorAuth.id);
        if (!booking.vendorAccountId || booking.vendorAccountId !== actorId) {
          return res.status(403).json({ error: "Vendor does not belong to this booking" });
        }
      } else {
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) {
          return res.status(401).json({ error: "Customer authentication required" });
        }
        actorType = "customer";
        actorId = customerAuth.id;
        if (!booking.customerId || booking.customerId !== actorId) {
          return res.status(403).json({ error: "Customer does not belong to this booking" });
        }
      }

      const sampleText = typeof payload.sampleText === "string" ? payload.sampleText.trim() : null;

      await db.execute(drizzleSql`
        insert into chat_moderation_flags (
          booking_id,
          actor_type,
          actor_id,
          reason,
          sample_text,
          metadata
        ) values (
          ${payload.bookingId},
          ${actorType},
          ${actorId},
          ${payload.reason},
          ${sampleText || null},
          ${JSON.stringify(payload.metadata || {})}::jsonb
        )
      `);

      return res.status(201).json({ success: true });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/track", trackRateLimiter, async (req, res) => {
    try {
      const { path, referrer } = req.body;

      if (typeof path !== "string" || !path.startsWith("/")) {
        return res.status(400).json({ error: "Invalid path" });
      }

      let userId: string | null = null;
      let userType: string | null = null;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
          const auth0 = await verifyAuth0Token(token);
          const email = typeof auth0?.email === "string" ? auth0.email.trim().toLowerCase() : "";
          // Fail closed: only resolve a real account for analytics when the email
          // is verified. An unverified identity records anonymous analytics
          // (userId null) and can never be a backdoor for account resolution.
          if (email && auth0?.email_verified === true) {
            const OWNER_EMAILS = [
              "johnsbom000@gmail.com",
              "boman@griffjohnson.com",
              "cassidymalm21@gmail.com",
              "eventhubglobal@gmail.com",
            ];
            if (OWNER_EMAILS.includes(email)) {
              return res.json({ success: true });
            }
            const [user] = await db
              .select({
                id: users.id,
                role: users.role,
              })
              .from(users)
              .where(drizzleSql`lower(${users.email}) = ${email}`)
              .limit(1);
            if (user?.id) {
              userId = user.id;
              userType = user.role;
            }
          }
        } catch {
          // Ignore auth failures; analytics ingestion is best-effort.
        }
      }

      await db.insert(webTraffic).values({
        userId,
        userType,
        path,
        referrer: referrer || null,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false });
    }
  });

  // ── Meta Conversions API (server-side pixel) ──────────────────────────────
  // Forwards conversion events to Meta's Graph API. Almost all of our paid
  // traffic arrives inside the Instagram/Facebook in-app webview, where the
  // browser pixel is unreliable, so the server copy is what actually lands.
  // The browser fires the SAME event with a shared event_id (see
  // client/src/lib/tracking.ts); Meta dedupes the browser + server copies by
  // (event_name, event_id) so conversions are never double-counted.
  //
  // Access token lives in META_CAPI_ACCESS_TOKEN (env only, never committed).
  // When it's unset the endpoint no-ops quietly so the client never errors.
  app.post("/api/meta-capi", trackRateLimiter, async (req, res) => {
    try {
      const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
      const pixelId = process.env.META_PIXEL_ID || "1047034731185783";
      if (!accessToken) {
        return res.json({ success: false, reason: "not_configured" });
      }

      const { event_name, event_id, event_source_url, email, custom_data } = req.body ?? {};
      if (typeof event_name !== "string" || !event_name) {
        return res.status(400).json({ error: "event_name required" });
      }

      // Parse _fbp / _fbc from the request cookies (no cookie-parser middleware).
      // The browser sends them automatically on this same-origin request. A body
      // override is allowed for webviews that strip cookies.
      const cookieHeader = typeof req.headers.cookie === "string" ? req.headers.cookie : "";
      const cookies: Record<string, string> = {};
      for (const part of cookieHeader.split(";")) {
        const idx = part.indexOf("=");
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        if (key) cookies[key] = decodeURIComponent(part.slice(idx + 1).trim());
      }
      const fbp = typeof req.body?.fbp === "string" ? req.body.fbp : cookies["_fbp"];
      const fbc = typeof req.body?.fbc === "string" ? req.body.fbc : cookies["_fbc"];

      const sha256 = (v: string) =>
        crypto.createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

      const userData: Record<string, unknown> = {
        client_ip_address: req.ip,
        client_user_agent: req.headers["user-agent"] || undefined,
      };
      if (fbp) userData.fbp = fbp;
      if (fbc) userData.fbc = fbc;
      // Hash email (SHA-256, lowercased/trimmed) when the caller has one.
      if (typeof email === "string" && email.includes("@")) {
        userData.em = [sha256(email)];
      }

      const payload = {
        data: [
          {
            event_name,
            event_time: Math.floor(Date.now() / 1000),
            event_id: typeof event_id === "string" && event_id ? event_id : undefined,
            event_source_url:
              typeof event_source_url === "string" && event_source_url ? event_source_url : undefined,
            action_source: "website",
            user_data: userData,
            custom_data: custom_data && typeof custom_data === "object" ? custom_data : {},
          },
        ],
      };

      const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(
        accessToken,
      )}`;
      const fbRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const bodyText = await fbRes.text().catch(() => "");
      if (!fbRes.ok) {
        logger.warn(`[meta-capi] Graph API ${fbRes.status}: ${bodyText.slice(0, 300)}`);
        return res.json({ success: false });
      }
      res.json({ success: true });
    } catch (error: any) {
      logRouteError("/api/meta-capi POST", error);
      res.json({ success: false });
    }
  });

  // ── Client-side event tracking ────────────────────────────────────────────
  // Receives structured analytics events from the frontend (vendor onboarding,
  // search interactions, vendor profile views, etc.). Fire-and-forget on the
  // server side — never blocks the response path.

  app.post("/api/events", trackRateLimiter, async (req: any, res: any) => {
    try {
      const { name, properties, sessionId } = req.body;

      if (typeof name !== "string" || !name) {
        return res.status(400).json({ error: "Missing event name" });
      }

      let actorId: string | null = null;
      let actorType: "vendor" | "customer" | "system" = "system";

      const authHeader = req.headers.authorization;
      if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        try {
          const auth0 = await verifyAuth0Token(token);
          const email = typeof auth0?.email === "string" ? auth0.email.trim().toLowerCase() : "";
          // Fail closed: only attribute an event to a real account when the email
          // is verified; otherwise the event is logged as a system/anonymous actor.
          if (email && auth0?.email_verified === true) {
            const [user] = await db
              .select({ id: users.id, role: users.role })
              .from(users)
              .where(drizzleSql`lower(${users.email}) = ${email}`)
              .limit(1);
            if (user?.id) {
              actorId = user.id;
              actorType = user.role === "vendor" ? "vendor" : "customer";
            }
          }
        } catch {
          // Ignore auth failures; analytics ingestion is best-effort.
        }
      }

      logEvent(
        name,
        actorType,
        actorId,
        typeof properties === "object" && properties !== null ? properties : {},
        typeof sessionId === "string" ? sessionId : null
      );

      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });

  // ── Resend verification email ───────────────────────────────────────────────
  // Deliberately NOT behind requireAuth0: that middleware rejects unverified
  // emails (403 email_not_verified), and unverified users are exactly who needs
  // this. The token is still fully verified; only its sub is used, so a caller
  // can only ever resend their own verification email.
  app.post("/api/auth/resend-verification-email", onboardingRateLimiter, async (req, res) => {
    try {
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing Authorization Bearer token" });
      }
      const auth0 = await verifyAuth0Token(authHeader.slice("Bearer ".length).trim());
      if (!auth0?.sub) {
        return res.status(401).json({ error: "Invalid Auth0 token" });
      }

      const result = await sendVerificationEmailForUser(auth0.sub);
      if (!result.ok) {
        if (result.reason === "not_configured") {
          return res.status(503).json({ error: "resend_not_configured" });
        }
        return res.status(502).json({ error: "resend_failed" });
      }
      return res.json({ sent: true });
    } catch {
      return res.status(401).json({ error: "Invalid Auth0 token" });
    }
  });

  // ── Feedback Submissions ───────────────────────────────────────────────────
  // Customers and vendors can submit feature requests and bug reports.
  // Admins can view and flag submissions for follow-up.

  const feedbackAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  // POST /api/feedback/attachment — upload a file, returns { url }
  app.post(
    "/api/feedback/attachment",
    uploadRateLimiter,
    requireAuth0,
    feedbackAttachmentUpload.single("file"),
    async (req: any, res: any) => {
      try {
        if (!req.file) return res.status(400).json({ error: "No file provided or file type not allowed" });

        // persistUploadedFile requires object storage in production (throws on
        // failure), never ephemeral disk. Dev falls back to local disk.
        const ext = path.extname(req.file.originalname).replace(/^\./, "").toLowerCase() || "bin";
        const { storagePath } = await persistUploadedFile(req.file.buffer, "feedback", {
          contentType: req.file.mimetype,
          ext,
        });
        return res.json({ url: resolveStoredUploadPath(storagePath) ?? storagePath });
      } catch (err: any) {
        return respondWithInternalServerError(req, res, err);
      }
    }
  );

  // POST /api/feedback — submit a feature request or bug report
  app.post("/api/feedback", mutationRateLimiter, requireAuth0, async (req: any, res: any) => {
    try {
      const auth0 = req.auth0 as { sub?: string; email?: string; email_verified?: boolean; name?: string } | undefined;
      const body = req.body as { type?: string; title?: string; description?: string; attachmentUrl?: string };

      if (!body.type || !["feature_request", "bug_report"].includes(body.type)) {
        return res.status(400).json({ error: "type must be 'feature_request' or 'bug_report'" });
      }
      if (!body.title?.trim()) return res.status(400).json({ error: "title is required" });
      if (!body.description?.trim()) return res.status(400).json({ error: "description is required" });

      // Resolve identity — try vendor first, then customer
      let submitterRole: "customer" | "vendor" = "customer";
      let submittedByUserId: string | null = null;
      let submittedByVendorAccountId: string | null = null;
      let submitterName: string | null = auth0?.name ?? null;
      let submitterEmail: string | null = auth0?.email ?? null;

      const vendorResolution = auth0?.sub
        ? await resolveVendorAccountForAuth0Identity({ auth0Sub: auth0.sub, email: auth0.email, context: "feedback", emailVerified: auth0?.email_verified === true })
        : null;

      if (vendorResolution?.account && !vendorResolution.account.deletedAt) {
        submitterRole = "vendor";
        submittedByVendorAccountId = vendorResolution.account.id;
        submitterName = vendorResolution.account.businessName ?? submitterName;
        submitterEmail = vendorResolution.account.email ?? submitterEmail;
      } else if (auth0?.sub) {
        const [userRow] = await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.auth0Sub, auth0.sub))
          .limit(1);
        if (userRow) {
          submittedByUserId = userRow.id;
          submitterName = userRow.name ?? submitterName;
          submitterEmail = userRow.email ?? submitterEmail;
        }
      }

      const [row] = await db
        .insert(feedbackSubmissions)
        .values({
          type: body.type as "feature_request" | "bug_report",
          title: body.title.trim(),
          description: body.description.trim(),
          attachmentUrl: body.attachmentUrl?.trim() || null,
          submittedByUserId,
          submittedByVendorAccountId,
          submitterRole,
          submitterName,
          submitterEmail,
        })
        .returning({ id: feedbackSubmissions.id });

      return res.status(201).json({ id: row.id });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  app.get("/api/listings/:id/active-sale", async (req, res) => {
    try {
      const listingId = req.params.id?.trim();
      if (!listingId) return res.status(400).json({ error: "Listing ID required" });

      const now = new Date();
      const [sale] = await db
        .select({
          id: vendorDiscounts.id,
          percentOff: vendorDiscounts.percentOff,
          endsAt: vendorDiscounts.endsAt,
          startsAt: vendorDiscounts.startsAt,
        })
        .from(vendorDiscounts)
        .innerJoin(discountListings, eq(discountListings.discountId, vendorDiscounts.id))
        .where(
          and(
            eq(vendorDiscounts.discountType, "public_sale"),
            eq(vendorDiscounts.active, true),
            eq(discountListings.listingId, listingId),
            lte(vendorDiscounts.startsAt, now),
            gte(vendorDiscounts.endsAt, now),
          ),
        )
        .limit(1);

      if (!sale) return res.json({ sale: null });
      return res.json({ sale });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  app.post("/api/discounts/validate-code", socialRateLimiter, async (req, res) => {
    try {
      const { code, listingId } = req.body ?? {};
      if (!code || !listingId) {
        return res.status(400).json({ valid: false, reason: "code and listingId are required" });
      }
      const normalizedCode = String(code).trim().toUpperCase();
      const now = new Date();

      const [row] = await db
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
            eq(vendorDiscounts.code, normalizedCode),
            eq(vendorDiscounts.discountType, "promo_code"),
            eq(discountListings.listingId, listingId),
          ),
        )
        .limit(1);

      if (!row) return res.json({ valid: false, reason: "not_found" });
      if (!row.active) return res.json({ valid: false, reason: "not_active" });
      if (now < row.startsAt || now > row.endsAt) return res.json({ valid: false, reason: "expired" });
      if (row.maxUses !== null && row.usedCount >= row.maxUses) return res.json({ valid: false, reason: "cap_reached" });

      return res.json({ valid: true, percentOff: row.percentOff, discountId: row.id });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });
}
