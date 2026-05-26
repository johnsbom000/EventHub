import type { Express } from "express";
import { createServer, type Server } from "http";
import { logger } from "./lib/logger";
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

/**proxy: {
  "/api": {
    target: "http://localhost:5001",
    changeOrigin: true,
    secure: false,
  },
},

 * Middleware: after requireAuth0, resolve the vendor account by auth0_sub and
 * attach a normalized vendorAuth object so existing handlers keep working.
 */
async function requireVendorAccountAuth0(req: any, res: any, next: any) {
  try {
    const auth0 = req.auth0 as { sub?: string; email?: string } | undefined;
    logger.info({ sub: auth0?.sub, email: auth0?.email }, "[vendor-auth]");
    const resolution = await resolveVendorAccountForAuth0Identity({
      auth0Sub: auth0?.sub,
      email: auth0?.email,
      context: "requireVendorAccountAuth0",
    });
    const account = resolution.account;

    if (!account) {
      // Auth0 is valid, but user doesn't have a vendor account row yet
      logger.info({ sub: auth0?.sub, email: auth0?.email }, "[vendor-auth] 404 — no account found");
      return res.status(404).json({ error: "Vendor account not found for this Auth0 user" });
    }
    if (account.deletedAt) {
      return res.status(403).json({ error: "Vendor account is deleted" });
    }
    if (account.active === false) {
      return res.status(403).json({ error: "Vendor account is not active" });
    }

    // Normalize to the shape legacy code expects
    req.vendorAuth = {
      id: account.id,
      email: account.email,
      type: "vendor",
      auth0Sub: account.auth0Sub,
    };

    // Also expose account directly if useful later
    req.vendorAccount = account;

    return next();
  } catch (err: any) {
    logger.error("requireVendorAccountAuth0 failed:", err?.message || err);
    return res.status(500).json({ error: "Failed to resolve vendor account" });
  }
}

async function getVendorAccountFromRequest(req: any) {
  const cached = req.vendorAccount;
  if (cached?.id) return cached;

  const vendorId = typeof req?.vendorAuth?.id === "string" ? req.vendorAuth.id.trim() : "";
  if (!vendorId) return undefined;

  const rows = await db
    .select()
    .from(vendorAccounts)
    .where(eq(vendorAccounts.id, vendorId))
    .limit(1);
  const account = rows[0];
  if (account) {
    req.vendorAccount = account;
  }
  return account;
}

/**
 * Convenience combo for vendor routes:
 * - verify Auth0 token
 * - resolve vendor account by auth0_sub
 */
const requireVendorAuth0 = [requireAuth0, requireVendorAccountAuth0] as const;
let moderationTableReadyPromise: Promise<void> | null = null;
let stripeWebhookTableReadyPromise: Promise<void> | null = null;
let bookingDisputesTableReadyPromise: Promise<void> | null = null;
let autoPayoutWorkerStarted = false;
let autoPayoutTickInFlight = false;


type VendorProfileContext = {
  account: any;
  profiles: any[];
  activeProfile: any | null;
  activeProfileId: string | null;
};

type VendorListingMatchContext = {
  listingsById: Map<string, { id: string; title: string | null; normalizedTitle: string | null }>;
  listingIds: Set<string>;
  listingIdsByNormalizedTitle: Map<string, string[]>;
};

type GoogleEventMappingContext = {
  calendarId: string;
  mappingsByEventId: Map<
    string,
    {
      googleEventId: string;
      listingId: string;
      mappingSource: string;
      mappingStatus: string;
    }
  >;
};

function createGoogleOauthState(vendorAccountId: string, returnTo = "/vendor/dashboard") {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  const encodedPayload = Buffer.from(
    JSON.stringify({
      vendorAccountId,
      returnTo,
      issuedAt: Date.now(),
      nonce: crypto.randomUUID(),
    }),
    "utf8"
  ).toString("base64url");

  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("hex");
  return `${encodedPayload}.${signature}`;
}

function parseGoogleOauthState(rawState: string) {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  const [encodedPayload, signature] = rawState.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("hex");

  if (signature.length !== expectedSignature.length) {
    return null;
  }

  const providedSignatureBuffer = Buffer.from(signature, "hex");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      vendorAccountId?: string;
      returnTo?: string;
      issuedAt?: number;
    };

    if (
      typeof parsed.vendorAccountId !== "string" ||
      !parsed.vendorAccountId.trim() ||
      typeof parsed.issuedAt !== "number" ||
      !Number.isFinite(parsed.issuedAt)
    ) {
      return null;
    }

    if (Date.now() - parsed.issuedAt > GOOGLE_OAUTH_STATE_TTL_MS) {
      return null;
    }

    // Only allow safe relative vendor paths to prevent open redirects
    const rawReturnTo = typeof parsed.returnTo === "string" ? parsed.returnTo.trim() : "";
    const safeReturnTo =
      rawReturnTo.startsWith("/vendor/") ? rawReturnTo : "/vendor/dashboard";

    return { vendorAccountId: parsed.vendorAccountId.trim(), returnTo: safeReturnTo };
  } catch {
    return null;
  }
}

async function assertCanonicalBookingSchemaReady() {
  const requiredColumns = [
    "vendor_account_id",
    "vendor_profile_id",
    "listing_id",
    "booking_start_at",
    "booking_end_at",
    "booked_quantity",
    "base_subtotal_cents",
    "subtotal_amount_cents",
    "customer_fee_amount_cents",
    "delivery_fee_amount_cents",
    "setup_fee_amount_cents",
    "travel_fee_amount_cents",
    "logistics_total_cents",
    "vendor_timezone_snapshot",
    "google_sync_status",
    "google_event_id",
    "google_calendar_id",
  ] as const;

  const result: any = await db.execute(drizzleSql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name in (
        'vendor_account_id',
        'vendor_profile_id',
        'listing_id',
        'booking_start_at',
        'booking_end_at',
        'booked_quantity',
        'base_subtotal_cents',
        'subtotal_amount_cents',
        'customer_fee_amount_cents',
        'delivery_fee_amount_cents',
        'setup_fee_amount_cents',
        'travel_fee_amount_cents',
        'logistics_total_cents',
        'vendor_timezone_snapshot',
        'google_sync_status',
        'google_event_id',
        'google_calendar_id'
      )
  `);
  const present = new Set(
    extractRows<{ column_name?: string }>(result)
      .map((row) => (typeof row?.column_name === "string" ? row.column_name.trim() : ""))
      .filter(Boolean)
  );
  const missing = requiredColumns.filter((columnName) => !present.has(columnName));
  if (missing.length > 0) {
    throw new Error(
      `Canonical bookings schema is missing required columns: ${missing.join(", ")}. Run migrations before starting the server.`
    );
  }
}

function isGenericProfileName(value: unknown): boolean {
  const normalized = asTrimmedString(value).toLowerCase();
  return normalized === "vendor profile";
}

function getProfileDisplayName(profile: any, fallback = "Vendor Profile"): string {
  const profileName = asTrimmedString(profile?.profileName);
  const online =
    profile?.onlineProfiles && typeof profile.onlineProfiles === "object" && !Array.isArray(profile.onlineProfiles)
      ? (profile.onlineProfiles as Record<string, unknown>)
      : null;
  const onlineProfileName = asTrimmedString((online as any)?.profileBusinessName);
  const fallbackName = asTrimmedString(fallback) || "Vendor Profile";

  if (profileName && !isGenericProfileName(profileName)) return profileName;
  if (onlineProfileName && !isGenericProfileName(onlineProfileName)) return onlineProfileName;
  if (!isGenericProfileName(fallbackName)) return fallbackName;

  if (profileName) return profileName;
  if (onlineProfileName) return onlineProfileName;
  return fallbackName;
}

function bookingRowMatchesActiveProfile(
  row: any,
  activeProfileId: string,
  profileCount: number
): boolean {
  const bookingProfileId = asTrimmedString(row?.vendorProfileId);
  const listingProfileId = asTrimmedString(row?.listingProfileId);
  if (bookingProfileId) return bookingProfileId === activeProfileId;
  if (listingProfileId) return listingProfileId === activeProfileId;
  // Legacy rows with no profile ownership are safe only when the account still has a single profile.
  return profileCount <= 1;
}

async function listVendorProfilesForAccount(accountId: string) {
  const rows = await db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.accountId, accountId))
    .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id));
  return rows;
}

async function normalizeProfileNamesForAccount(account: any) {
  const accountId = asTrimmedString(account?.id);
  if (!accountId) return;

  const accountBusinessName = asTrimmedString(account?.businessName);

  await db.execute(drizzleSql`
    update vendor_profiles vp
    set profile_name = coalesce(
      nullif(vp.online_profiles ->> 'profileBusinessName', ''),
      ${accountBusinessName || null},
      'Vendor Profile'
    )
    where vp.account_id = ${accountId}
      and (
        vp.profile_name is null
        or btrim(vp.profile_name) = ''
        or lower(btrim(vp.profile_name)) = 'vendor profile'
      )
  `);
  await db.execute(drizzleSql`
    update vendor_profiles vp
    set online_profiles = jsonb_set(
      coalesce(vp.online_profiles, '{}'::jsonb),
      '{profileBusinessName}',
      to_jsonb(
        coalesce(
          nullif(vp.profile_name, ''),
          ${accountBusinessName || null},
          'Vendor Profile'
        )
      ),
      true
    )
    where vp.account_id = ${accountId}
      and (
        vp.online_profiles is null
        or nullif(btrim(coalesce(vp.online_profiles ->> 'profileBusinessName', '')), '') is null
        or lower(btrim(coalesce(vp.online_profiles ->> 'profileBusinessName', ''))) = 'vendor profile'
      )
  `);
}

async function resolveActiveVendorProfile(req: any): Promise<VendorProfileContext | null> {
  const account = await getVendorAccountFromRequest(req);
  if (!account?.id) return null;

  await normalizeProfileNamesForAccount(account);

  const profiles = await listVendorProfilesForAccount(account.id);
  if (profiles.length === 0) {
    req.vendorProfileContext = {
      account,
      profiles: [],
      activeProfile: null,
      activeProfileId: null,
    } satisfies VendorProfileContext;
    return req.vendorProfileContext;
  }

  const headerProfileIdRaw = req.headers?.["x-vendor-profile-id"];
  const headerProfileId =
    typeof headerProfileIdRaw === "string"
      ? asTrimmedString(headerProfileIdRaw)
      : Array.isArray(headerProfileIdRaw)
        ? asTrimmedString(headerProfileIdRaw[0])
        : "";
  const queryProfileId = asTrimmedString(req.query?.profileId);
  const requestedProfileId = headerProfileId || queryProfileId;

  let activeProfile =
    (requestedProfileId ? profiles.find((profile) => profile.id === requestedProfileId) : undefined) ||
    (account.activeProfileId
      ? profiles.find((profile) => profile.id === account.activeProfileId)
      : undefined) ||
    profiles[0];

  if (!activeProfile) {
    activeProfile = profiles[0];
  }

  if (activeProfile?.id && account.activeProfileId !== activeProfile.id) {
    const [updatedAccount] = await db
      .update(vendorAccounts)
      .set({ activeProfileId: activeProfile.id })
      .where(eq(vendorAccounts.id, account.id))
      .returning();
    req.vendorAccount = updatedAccount ?? account;
  }

  const context: VendorProfileContext = {
    account: req.vendorAccount ?? account,
    profiles,
    activeProfile,
    activeProfileId: activeProfile?.id ?? null,
  };
  req.vendorProfileContext = context;
  return context;
}


function safeGoogleErrorMessage(error: import("./google").GoogleCalendarConnectionError): string {
  return SAFE_GOOGLE_ERROR_MESSAGES[error.code] ?? "A Google Calendar error occurred. Please try again.";
}

function logRouteError(route: string, error: unknown) {
  if (error instanceof Error) {
    const extra: string[] = [];
    if ((error as any).detail) extra.push(`detail: ${(error as any).detail}`);
    if ((error as any).code) extra.push(`code: ${(error as any).code}`);
    logger.error({ err: error, detail: (error as any).detail, code: (error as any).code }, "%s failed", route);
  } else {
    logger.error("%s failed: %s", route, String(error));
  }
}

function respondWithInternalServerError(req: any, res: any, error: unknown) {
  const method = typeof req?.method === "string" ? req.method : "UNKNOWN";
  const routePath =
    typeof req?.originalUrl === "string" && req.originalUrl.trim().length > 0
      ? req.originalUrl
      : typeof req?.path === "string" && req.path.trim().length > 0
        ? req.path
        : "unknown_route";
  logRouteError(`${method} ${routePath}`, error);
  return res.status(500).json({ error: "Internal server error" });
}

async function syncBookingToGoogleCalendarSafely(bookingId: string, route: string) {
  const result = await syncEventHubBookingToGoogleCalendar({ bookingId });
  if (result.status === "failed") {
    logRouteError(route, new Error(result.error));
  }
  return result;
}

/** Returns the public-facing app URL used in email links.
 *  APP_URL is the frontend origin (correct in all envs).
 *  Falls back to SERVER_URL for backwards compatibility in production
 *  where both are the same domain. */
function appUrl(): string {
  return (process.env.APP_URL || process.env.SERVER_URL || "http://localhost:5173").replace(/\/$/, "");
}

async function syncExistingBookingsToSelectedGoogleCalendar(
  vendorAccountId: string,
  selectedGoogleCalendarId: string
) {
  const bookingIds = await listSyncableExistingBookingIdsForVendorAccount(vendorAccountId);
  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failedBookings: Array<{ bookingId: string; error: string }> = [];

  for (const bookingId of bookingIds) {
    const result = await syncEventHubBookingToGoogleCalendar({
      bookingId,
      targetCalendarId: selectedGoogleCalendarId,
    });

    if (result.status === "synced") {
      syncedCount += 1;
      continue;
    }

    if (result.status === "skipped") {
      skippedCount += 1;
      continue;
    }

    if (result.status === "failed") {
      failedCount += 1;
      failedBookings.push({
        bookingId,
        error: result.error,
      });
      continue;
    }

    skippedCount += 1;
  }

  return {
    googleCalendarId: selectedGoogleCalendarId,
    bookingCount: bookingIds.length,
    syncedCount,
    skippedCount,
    failedCount,
    failedBookings,
  };
}
async function deactivateActiveListingsViolatingPublishGate(accountId?: string): Promise<number> {
  // package_item rows are managed by their parent container's publish/unpublish lifecycle.
  // They have no photos of their own, so they would always fail the photo check here and
  // get incorrectly deactivated. Exclude them entirely.
  const whereClause = accountId
    ? and(eq(vendorListings.status, "active"), eq(vendorListings.accountId, accountId), ne(vendorListings.listingType, "package_item"))
    : and(eq(vendorListings.status, "active"), ne(vendorListings.listingType, "package_item"));

  const activeListings = await db
    .select({
      id: vendorListings.id,
      category: vendorListings.category,
      priceCents: vendorListings.priceCents,
      photos: vendorListings.photos,
      listingData: vendorListings.listingData,
      listingType: vendorListings.listingType,
    })
    .from(vendorListings)
    .where(whereClause);

  const invalidPriceIds = activeListings
    // package_container pricing comes from child package_items — skip the price check
    .filter((listing) => listing.listingType !== "package_container" && !hasValidListingPrice(listing.listingData, listing.priceCents))
    .map((listing) => listing.id);

  const invalidPhotoIds = activeListings
    .filter((listing) => !hasMinimumListingPhotos(listing.listingData, listing.photos))
    .map((listing) => listing.id);

  const invalidCategoryIds = activeListings
    .filter(
      (listing) =>
        !resolveCanonicalListingCategory(listing.listingData, listing.category)
    )
    .map((listing) => listing.id);

  const invalidIds = Array.from(new Set([...invalidPriceIds, ...invalidPhotoIds, ...invalidCategoryIds]));

  for (const listingId of invalidIds) {
    await db
      .update(vendorListings)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(vendorListings.id, listingId));
  }

  if (invalidIds.length > 0) {
    logger.info(
      { count: invalidIds.length, invalidPriceIds: invalidPriceIds.length, invalidPhotoIds: invalidPhotoIds.length, invalidCategoryIds: invalidCategoryIds.length },
      "[listing publish gate] moved active listings to inactive"
    );
  }

  return invalidIds.length;
}


async function ensureModerationTable() {
  if (!moderationTableReadyPromise) {
    moderationTableReadyPromise = (async () => {
      await db.execute(drizzleSql`
        create table if not exists chat_moderation_flags (
          id uuid primary key default gen_random_uuid(),
          booking_id text not null,
          actor_type text not null,
          actor_id text not null,
          reason text not null,
          sample_text text,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
      `);
      await db.execute(drizzleSql`
        create index if not exists idx_chat_moderation_flags_actor
        on chat_moderation_flags (actor_type, actor_id, created_at desc)
      `);
      await db.execute(drizzleSql`
        create index if not exists idx_chat_moderation_flags_booking
        on chat_moderation_flags (booking_id, created_at desc)
      `);
    })().catch((error) => {
      moderationTableReadyPromise = null;
      throw error;
    });
  }

  await moderationTableReadyPromise;
}

async function ensureStripeWebhookTable() {
  if (!stripeWebhookTableReadyPromise) {
    stripeWebhookTableReadyPromise = (async () => {
      await db.execute(drizzleSql`
        create table if not exists stripe_webhook_events (
          id varchar primary key default gen_random_uuid(),
          event_id text not null unique,
          event_type text not null,
          livemode boolean not null default false,
          payload jsonb not null default '{}'::jsonb,
          processed_at timestamptz not null default now()
        )
      `);
      await db.execute(drizzleSql`
        create index if not exists idx_stripe_webhook_events_processed_at
        on stripe_webhook_events (processed_at desc)
      `);
    })().catch((error) => {
      stripeWebhookTableReadyPromise = null;
      throw error;
    });
  }

  await stripeWebhookTableReadyPromise;
}

async function ensureBookingDisputesTable() {
  if (!bookingDisputesTableReadyPromise) {
    bookingDisputesTableReadyPromise = (async () => {
      await db.execute(drizzleSql`
        do $$
        begin
          create type booking_dispute_status as enum (
            'filed',
            'vendor_responded',
            'resolved_refund',
            'resolved_payout'
          );
        exception
          when duplicate_object then null;
        end $$;
      `);
      await db.execute(drizzleSql`
        create table if not exists booking_disputes (
          id varchar primary key default gen_random_uuid(),
          booking_id varchar not null references bookings(id) on delete cascade,
          customer_id varchar not null references users(id) on delete cascade,
          vendor_account_id varchar references vendor_accounts(id) on delete set null,
          reason text not null,
          details text,
          status booking_dispute_status not null default 'filed',
          vendor_response text,
          admin_decision text,
          admin_notes text,
          filed_at timestamptz not null default now(),
          vendor_responded_at timestamptz,
          resolved_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.execute(drizzleSql`
        create unique index if not exists booking_disputes_booking_id_idx
        on booking_disputes (booking_id)
      `);
      await db.execute(drizzleSql`
        create index if not exists booking_disputes_status_idx
        on booking_disputes (status)
      `);
      await db.execute(drizzleSql`
        create index if not exists booking_disputes_filed_at_idx
        on booking_disputes (filed_at desc)
      `);
    })().catch((error) => {
      bookingDisputesTableReadyPromise = null;
      throw error;
    });
  }

  await bookingDisputesTableReadyPromise;
}

/**
 * Returns the Stripe Customer ID (cus_...) for a user, creating one if needed.
 * The ID is persisted to users.stripe_customer_id so it's reused across checkouts.
 */
async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const [userRow] = await db
    .select({ stripeCustomerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRow?.stripeCustomerId) return userRow.stripeCustomerId;

  const { stripeClient } = await import("./stripe");
  const customer = await stripeClient.customers.create({ email });

  await db
    .update(users)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return customer.id;
}

async function recomputeBookingPaymentStatusInTx(tx: any, bookingId: string) {
  // Derive booking payment status from actual payments rows.
  // Exclude security_deposit rows — they are an independent hold and do not
  // affect the booking's payment status (they are always captured separately).
  const paymentRows = await tx
    .select({
      status: payments.status,
      paymentType: payments.paymentType,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.bookingId, bookingId));

  const bookingPaymentRows = paymentRows.filter(
    (row: { paymentType?: string | null }) =>
      normalizePaymentStateValue(row.paymentType) !== "security_deposit"
  );

  const nextPaymentStatus = deriveBookingPaymentStatusFromScheduleStatuses(
    bookingPaymentRows.map((row: { status?: string | null }) => row.status)
  );

  // depositPaidAt = when the main booking payment was first collected.
  const depositPaidAt =
    bookingPaymentRows.find(
      (row: { paymentType?: string | null; status?: string | null; paidAt?: Date | null }) =>
        (normalizePaymentStateValue(row.paymentType) === "deposit" ||
          normalizePaymentStateValue(row.paymentType) === "booking") &&
        isPaymentSucceededStatus(row.status) &&
        row.paidAt instanceof Date
    )?.paidAt ?? null;

  const bookingPatch: Record<string, any> = {
    paymentStatus: nextPaymentStatus,
    updatedAt: new Date(),
  };
  if (depositPaidAt) {
    bookingPatch.depositPaidAt = depositPaidAt;
  }

  await tx
    .update(bookings)
    .set(bookingPatch as any)
    .where(eq(bookings.id, bookingId));

  return nextPaymentStatus;
}

async function markBookingAsPaymentFailedInTx(tx: any, bookingId: string, reason: string) {
  const now = new Date();
  await tx.execute(drizzleSql`
    update bookings
    set
      status = 'failed',
      payment_status = 'failed',
      cancellation_reason = coalesce(nullif(trim(cancellation_reason), ''), ${reason}),
      cancelled_at = coalesce(cancelled_at, ${now}),
      updated_at = ${now}
    where id = ${bookingId}
      and status in ('pending', 'confirmed')
  `);
}

type LockedPaymentPayoutContext = {
  paymentId: string;
  bookingId: string;
  bookingStatus: string | null;
  bookingEndAt: Date | null;
  paymentStatus: string | null;
  payoutStatus: string | null;
  payoutBlockedReason: string | null;
  disputeStatus: string | null;
  bookingDisputeStatus: string | null;
  paidOutAt: Date | null;
  payoutEligibleAt: Date | null;
  totalAmount: number | null;
  amount: number | null;
  refundAmount: number | null;
  vendorNetPayoutAmount: number | null;
  actualStripeFeeAmount: number | null;
  stripeConnectedAccountId: string | null;
  stripeChargeId: string | null;
  stripeTransferId: string | null;
  payoutAdjustedAmount: number | null;
};

async function loadPaymentPayoutContextForUpdateInTx(
  tx: any,
  paymentId: string
): Promise<LockedPaymentPayoutContext | null> {
  await ensureBookingDisputesTable();
  const rows: any = await tx.execute(drizzleSql`
    select
      p.id as "paymentId",
      p.booking_id as "bookingId",
      b.status as "bookingStatus",
      b.booking_end_at as "bookingEndAt",
      p.status as "paymentStatus",
      p.payout_status as "payoutStatus",
      p.payout_blocked_reason as "payoutBlockedReason",
      p.dispute_status as "disputeStatus",
      bd.status as "bookingDisputeStatus",
      p.paid_out_at as "paidOutAt",
      p.payout_eligible_at as "payoutEligibleAt",
      p.total_amount as "totalAmount",
      p.amount as "amount",
      p.refund_amount as "refundAmount",
      p.vendor_net_payout_amount as "vendorNetPayoutAmount",
      p.actual_stripe_fee_amount as "actualStripeFeeAmount",
      p.stripe_connected_account_id as "stripeConnectedAccountId",
      p.stripe_charge_id as "stripeChargeId",
      p.stripe_transfer_id as "stripeTransferId",
      p.payout_adjusted_amount as "payoutAdjustedAmount"
    from payments p
    inner join bookings b on b.id = p.booking_id
    left join booking_disputes bd on bd.booking_id = b.id
    where p.id = ${paymentId}
    for update
  `);
  const row = extractRows<LockedPaymentPayoutContext>(rows)[0];
  return row?.paymentId ? row : null;
}

async function getBookingDisputeStatusInTx(tx: any, bookingId: string): Promise<string | null> {
  await ensureBookingDisputesTable();
  const rows = await tx
    .select({
      status: bookingDisputes.status,
    })
    .from(bookingDisputes)
    .where(eq(bookingDisputes.bookingId, bookingId))
    .limit(1);
  const status = rows[0]?.status;
  return typeof status === "string" ? status : null;
}

async function refreshPaymentPayoutStateInTx(
  tx: any,
  paymentId: string,
  now = new Date()
) {
  const paymentContext = await loadPaymentPayoutContextForUpdateInTx(tx, paymentId);
  if (!paymentContext?.paymentId || !paymentContext.bookingId) return null;

  const payoutEligibility = computePayoutEligibility(
    {
      bookingStatus: paymentContext.bookingStatus,
      paymentStatus: paymentContext.paymentStatus,
      payoutStatus: paymentContext.payoutStatus,
      payoutBlockedReason: paymentContext.payoutBlockedReason,
      disputeStatus: paymentContext.disputeStatus,
      bookingDisputeStatus: paymentContext.bookingDisputeStatus,
      paidOutAt: paymentContext.paidOutAt,
      payoutEligibleAt: paymentContext.payoutEligibleAt,
      bookingEndAt: paymentContext.bookingEndAt,
      totalAmount:
        parseIntegerValue(paymentContext.totalAmount) ??
        parseIntegerValue(paymentContext.amount) ??
        0,
      refundedAmount: parseIntegerValue(paymentContext.refundAmount) ?? 0,
      vendorNetPayoutAmount: parseIntegerValue(paymentContext.vendorNetPayoutAmount) ?? 0,
      actualStripeFeeAmount: paymentContext.actualStripeFeeAmount,
      stripeConnectedAccountId: paymentContext.stripeConnectedAccountId,
      stripeChargeId: paymentContext.stripeChargeId,
      stripeTransferId: paymentContext.stripeTransferId,
      vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
    },
    now
  );

  await tx
    .update(payments)
    .set({
      payoutStatus: payoutEligibility.payoutStatus,
      payoutEligibleAt: payoutEligibility.payoutEligibleAt,
      payoutBlockedReason: payoutEligibility.payoutBlockedReason,
      payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
    })
    .where(eq(payments.id, paymentContext.paymentId));

  return {
    paymentContext,
    payoutEligibility,
  };
}

type PayoutProcessingResult = {
  paymentId: string;
  bookingId: string;
  outcome: "paid" | "eligible" | "skipped" | "blocked" | "duplicate";
  reason: string | null;
  payoutAmount: number;
  transferId: string | null;
};

async function processSinglePayoutCandidate(params: {
  paymentId: string;
  bookingId: string;
  dryRun: boolean;
}): Promise<PayoutProcessingResult> {
  const paymentId = asTrimmedString(params.paymentId);
  const bookingId = asTrimmedString(params.bookingId);
  if (!paymentId || !bookingId) {
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "invalid_candidate",
      payoutAmount: 0,
      transferId: null,
    };
  }

  const now = new Date();
  const refreshed = await db.transaction(async (tx) => refreshPaymentPayoutStateInTx(tx, paymentId, now));

  if (!refreshed?.paymentContext) {
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "payment_not_found",
      payoutAmount: 0,
      transferId: null,
    };
  }

  const eligibility = refreshed.payoutEligibility;
  const payoutAmount = Math.max(0, Math.round(eligibility.adjustedPayoutAmount || 0));

  if (!eligibility.eligible) {
    return {
      paymentId,
      bookingId,
      outcome: eligibility.payoutStatus === "blocked" ? "blocked" : "skipped",
      reason: eligibility.payoutBlockedReason || "not_eligible",
      payoutAmount,
      transferId: null,
    };
  }

  if (params.dryRun) {
    return {
      paymentId,
      bookingId,
      outcome: "eligible",
      reason: null,
      payoutAmount,
      transferId: null,
    };
  }

  const connectedAccountId = asTrimmedString(refreshed.paymentContext.stripeConnectedAccountId);
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
    return {
      paymentId,
      bookingId,
      outcome: "blocked",
      reason: "missing_transfer_requirements",
      payoutAmount,
      transferId: null,
    };
  }

  // Cross-check with Stripe: verify the charge actually succeeded and its
  // captured amount matches what we recorded. This guards against DB corruption
  // or race conditions where we attempt to pay out more than was collected.
  try {
    const { stripe: stripeClient } = await import("./stripe");
    const charge = await stripeClient.charges.retrieve(chargeId);
    if (!charge.paid || charge.status !== "succeeded") {
      await db
        .update(payments)
        .set({
          payoutStatus: "blocked",
          payoutBlockedReason: "stripe_charge_not_succeeded",
          payoutAdjustedAmount: payoutAmount,
        })
        .where(eq(payments.id, paymentId));
      return {
        paymentId,
        bookingId,
        outcome: "blocked",
        reason: "stripe_charge_not_succeeded",
        payoutAmount,
        transferId: null,
      };
    }
    const recordedTotal = parseIntegerValue(refreshed.paymentContext.totalAmount) ?? 0;
    if (recordedTotal > 0 && charge.amount_captured < recordedTotal) {
      logger.warn(
        `[payout] Charge amount mismatch for payment ${paymentId}: ` +
        `Stripe captured ${charge.amount_captured}, DB recorded ${recordedTotal}. Blocking payout.`
      );
      await db
        .update(payments)
        .set({
          payoutStatus: "blocked",
          payoutBlockedReason: "stripe_amount_mismatch",
          payoutAdjustedAmount: payoutAmount,
        })
        .where(eq(payments.id, paymentId));
      return {
        paymentId,
        bookingId,
        outcome: "blocked",
        reason: "stripe_amount_mismatch",
        payoutAmount,
        transferId: null,
      };
    }
  } catch (stripeErr: any) {
    logger.error(`[payout] Stripe charge verification failed for payment ${paymentId}:`, stripeErr?.message);
    return {
      paymentId,
      bookingId,
      outcome: "skipped",
      reason: "stripe_verification_failed",
      payoutAmount,
      transferId: null,
    };
  }

  try {
    const { transferToVendor } = await import("./stripe");
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
          bookingDisputeStatus: locked.bookingDisputeStatus,
          paidOutAt: locked.paidOutAt,
          payoutEligibleAt: locked.payoutEligibleAt,
          bookingEndAt: locked.bookingEndAt,
          totalAmount: parseIntegerValue(locked.totalAmount) ?? parseIntegerValue(locked.amount) ?? 0,
          refundedAmount: parseIntegerValue(locked.refundAmount) ?? 0,
          vendorNetPayoutAmount: parseIntegerValue(locked.vendorNetPayoutAmount) ?? 0,
          actualStripeFeeAmount: locked.actualStripeFeeAmount,
          stripeConnectedAccountId: locked.stripeConnectedAccountId,
          stripeChargeId: locked.stripeChargeId,
          stripeTransferId: locked.stripeTransferId,
          vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
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

    // Fire-and-forget payout email when outcome is "paid"
    if (persisted.outcome === "paid") {
      void (async () => {
        try {
          const serverUrl = appUrl();
          // Mark payout_email_sent to prevent duplicates, then send
          const updateResult = await db
            .update(payments)
            .set({ payoutEmailSent: true })
            .where(and(eq(payments.id, paymentId), eq(payments.payoutEmailSent, false)))
            .returning({ id: payments.id });
          if (updateResult.length === 0) return; // already sent

          const payoutRows: any = await db.execute(drizzleSql`
            select
              va.id           as "vendorAccountId",
              va.email        as "vendorEmail",
              va.business_name as "vendorName",
              b.event_date    as "eventDate",
              b.listing_title_snapshot as "listingTitle",
              p.stripe_transfer_id as "transferId"
            from payments p
            join bookings b on b.id = p.booking_id
            join vendor_accounts va on va.id = b.vendor_account_id
            where p.id = ${paymentId}
            limit 1
          `);
          const pr = extractRows<{
            vendorAccountId: string;
            vendorEmail: string;
            vendorName: string;
            eventDate: string;
            listingTitle: string | null;
            transferId: string | null;
          }>(payoutRows)[0];
          if (pr?.vendorAccountId) {
            await storage.createNotification({
              recipientId: pr.vendorAccountId,
              recipientType: "vendor",
              type: "payout_processed",
              title: "Payout processed",
              message: `Your payout of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(payoutAmount / 100)} for ${pr.listingTitle || "your service"} on ${pr.eventDate} has been sent.`,
              link: `/vendor/payments`,
              read: false,
            });
          }
          if (pr?.vendorEmail) {
            await sendPayoutProcessedEmail(pr.vendorEmail, {
              recipientName: pr.vendorName || "Vendor",
              amountCents: payoutAmount,
              listingTitle: pr.listingTitle || "Service",
              eventDate: pr.eventDate,
              transferId: pr.transferId ?? undefined,
              serverUrl,
            });
          }
        } catch (emailError: any) {
          logger.warn("[payout email] failed:", emailError?.message || emailError);
        }
      })();
    }

    return {
      paymentId,
      bookingId,
      outcome: persisted.outcome as PayoutProcessingResult["outcome"],
      reason: persisted.reason,
      payoutAmount,
      transferId: persisted.transferId,
    };
  } catch (error: any) {
    const errorMessage =
      typeof error?.message === "string" && error.message.trim().length > 0
        ? error.message.trim().slice(0, 200)
        : "transfer_failed";
    await db
      .update(payments)
      .set({
        payoutStatus: "blocked",
        payoutBlockedReason: "transfer_failed",
        payoutAdjustedAmount: payoutAmount,
      })
      .where(eq(payments.id, paymentId));
    return {
      paymentId,
      bookingId,
      outcome: "blocked",
      reason: errorMessage,
      payoutAmount,
      transferId: null,
    };
  }
}

async function runAutoPayoutTick() {
  await runAutoPayoutTickWithResult();
}

async function runAutoPayoutTickWithResult(): Promise<boolean> {
  if (autoPayoutTickInFlight) return false;

  // Distributed lock: stale after 15 min (1.5× the 10-min tick interval).
  // Prevents double-payouts if two instances briefly overlap during a deploy.
  const lockAcquired = await tryAcquireWorkerLock("payout", 15 * 60 * 1000);
  if (!lockAcquired) {
    logger.info("[auto-payout] lock held by another instance — skipping tick");
    return false;
  }

  autoPayoutTickInFlight = true;
  try {
    await expireStalePendingBookings();

    const payoutCandidates = await db
      .select({
        paymentId: payments.id,
        bookingId: payments.bookingId,
      })
      .from(payments)
      .where(
        and(
          eq(payments.paymentType, "deposit"),
          isNull(payments.stripeTransferId),
          inArray(payments.payoutStatus, ["not_ready", "eligible", "scheduled"])
        )
      )
      .orderBy(asc(payments.payoutEligibleAt), asc(payments.createdAt))
      .limit(25);

    for (const candidate of payoutCandidates) {
      await processSinglePayoutCandidate({
        paymentId: candidate.paymentId,
        bookingId: candidate.bookingId,
        dryRun: false,
      });
    }
    return false;
  } catch (error) {
    logger.error({ err: error }, "auto payout tick failed");
    return true;
  } finally {
    autoPayoutTickInFlight = false;
    await releaseWorkerLock("payout");
  }
}

function startAutoPayoutWorker() {
  if (autoPayoutWorkerStarted) return;
  autoPayoutWorkerStarted = true;

  let currentInterval = AUTO_PAYOUT_INTERVAL_MS;
  const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour max backoff

  const schedule = () => {
    const t = setTimeout(async () => {
      const hadError = await runAutoPayoutTickWithResult();
      if (hadError) {
        currentInterval = Math.min(currentInterval * 2, MAX_BACKOFF_MS);
        logger.warn(`[auto-payout] DB error — backing off to ${Math.round(currentInterval / 60000)}m`);
      } else {
        currentInterval = AUTO_PAYOUT_INTERVAL_MS;
      }
      schedule();
    }, currentInterval);
    t.unref?.();
  };

  // Kick once on start, then begin the backoff-aware schedule.
  void runAutoPayoutTick();
  schedule();
}

async function expireStalePendingBookings() {
  const now = new Date();
  const expiredRows: any = await db.execute(drizzleSql`
    update bookings b
    set
      status = 'expired',
      payment_status = 'failed',
      cancellation_reason = coalesce(nullif(trim(b.cancellation_reason), ''), ${BOOKING_PENDING_EXPIRY_REASON}),
      cancelled_at = coalesce(b.cancelled_at, ${now}),
      updated_at = ${now}
    where b.status in ('pending', 'confirmed')
      and b.payment_status = 'pending'
      and b.created_at < now() - (${BOOKING_PENDING_EXPIRY_MINUTES} * interval '1 minute')
      and not exists (
        select 1
        from payments p
        where p.booking_id = b.id
          and p.status in ('succeeded')
      )
    returning b.id
  `);

  const bookingIds = extractRows<{ id?: string | null }>(expiredRows)
    .map((row) => asTrimmedString(row?.id))
    .filter((id): id is string => Boolean(id));

  if (bookingIds.length === 0) {
    return 0;
  }

  await db
    .update(payments)
    .set({ status: "failed" })
    .where(and(inArray(payments.bookingId, bookingIds), eq(payments.status, "pending")));

  // Fire-and-forget: delete Google Calendar events for every expired booking.
  // Each sync call is independent — one failure doesn't block the others.
  for (const bookingId of bookingIds) {
    syncBookingToGoogleCalendarSafely(bookingId, "expireStalePendingBookings google-sync").catch(() => {});
  }

  return bookingIds.length;
}

async function cancelUnansweredBookingRequests(): Promise<number> {
  const now = new Date();

  // Find paid bookings that required vendor confirmation but were never acted on.
  // Criteria: still 'pending' (not confirmed/declined), payment succeeded, and
  // the booking was either request-to-book or outside the listing's service radius.
  const candidateRows: any = await db.execute(drizzleSql`
    select
      b.id                                    as id,
      b.total_amount                          as total_amount,
      coalesce(b.listing_title_snapshot, '')  as listing_title,
      b.event_date                            as event_date,
      va.email                                as vendor_email,
      coalesce(va.business_name, '')          as vendor_name,
      u.email                                 as customer_email,
      coalesce(u.name, '')                    as customer_name,
      b.customer_id                           as customer_id
    from bookings b
    join vendor_accounts va on va.id = b.vendor_account_id
    join users u            on u.id  = b.customer_id
    where b.status = 'pending'
      and b.payment_status in ('paid', 'succeeded', 'partial', 'partially_refunded')
      and (b.instant_book_snapshot = false or b.outside_service_radius = true)
      and b.created_at < now() - (${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} * interval '1 day')
  `);

  type CandidateRow = {
    id: string;
    total_amount: number;
    listing_title: string;
    event_date: string;
    vendor_email: string;
    vendor_name: string;
    customer_email: string;
    customer_name: string;
    customer_id: string | null;
  };

  const candidates = extractRows<CandidateRow>(candidateRows).filter(
    (r): r is CandidateRow => Boolean(r?.id && r?.customer_email)
  );

  if (candidates.length === 0) return 0;

  const { refundBookingPayment } = await import("./stripe");
  const serverUrl = appUrl();
  let cancelled = 0;

  for (const row of candidates) {
    try {
      // Fetch all refundable payments for this booking.
      const bookingPayments = await db
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
            eq(payments.bookingId, row.id),
            or(eq(payments.status, "succeeded"), eq(payments.status, "partially_refunded"))
          )
        );

      // Mark the booking cancelled.
      await db
        .update(bookings)
        .set({
          status: "cancelled" as const,
          cancellationReason: BOOKING_VENDOR_NO_RESPONSE_REASON,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(bookings.id, row.id));

      // Issue full refunds and mark each payment record.
      let totalRefundedCents = 0;
      for (const p of bookingPayments) {
        const alreadyRefunded = typeof p.refundAmount === "number" ? p.refundAmount : 0;
        const refundable = Math.max(0, p.amount - alreadyRefunded);
        if (refundable > 0 && p.stripePaymentIntentId) {
          try {
            await refundBookingPayment({
              paymentIntentId: p.stripePaymentIntentId,
              amount: refundable,
              reason: "duplicate",
              idempotencyKey: `vendor-no-response:${row.id}:${p.id}`,
            });
          } catch (stripeErr: any) {
            logger.warn(`[vendor-no-response] Stripe refund failed for payment ${p.id}:`, stripeErr?.message);
          }
        }
        await db
          .update(payments)
          .set({
            status: "refunded" as any,
            refundAmount: p.amount,
            refundReason: BOOKING_VENDOR_NO_RESPONSE_REASON,
            refundedAt: now,
            payoutStatus: "cancelled",
            payoutEligibleAt: null,
            payoutBlockedReason: BOOKING_VENDOR_NO_RESPONSE_REASON,
            payoutAdjustedAmount: 0,
          })
          .where(eq(payments.id, p.id));
        totalRefundedCents += refundable;
      }

      // Fire-and-forget: emails + calendar sync.
      const vendorReasonNote = `This booking was automatically cancelled because it was not accepted within ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days.`;
      const customerReasonNote = `Your vendor did not respond within ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days. Your booking has been automatically cancelled and a full refund has been issued.`;

      Promise.allSettled([
        row.customer_email
          ? sendBookingCancelledEmail(row.customer_email, {
              recipientName: row.customer_name || "Customer",
              counterpartName: row.vendor_name || "Vendor",
              eventDate: row.event_date,
              listingTitle: row.listing_title || "Service",
              role: "customer",
              cancelledBy: "system",
              reasonNote: customerReasonNote,
              totalAmountCents: row.total_amount,
              refundAmountCents: totalRefundedCents,
              serverUrl,
            })
          : Promise.resolve(),
        row.vendor_email
          ? sendBookingCancelledEmail(row.vendor_email, {
              recipientName: row.vendor_name || "Vendor",
              counterpartName: row.customer_name || "Customer",
              eventDate: row.event_date,
              listingTitle: row.listing_title || "Service",
              role: "vendor",
              cancelledBy: "system",
              reasonNote: vendorReasonNote,
              serverUrl,
            })
          : Promise.resolve(),
        syncBookingToGoogleCalendarSafely(row.id, "cancelUnansweredBookingRequests google-sync"),
        row.customer_id
          ? storage.createNotification({
              recipientId: row.customer_id,
              recipientType: "customer",
              type: "booking_cancelled",
              title: "Booking expired — vendor didn't respond",
              message: `Your booking for ${row.listing_title || "the service"} on ${row.event_date} was automatically cancelled because the vendor did not respond within ${BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS} days. A full refund has been issued.`,
              link: "/dashboard/events",
              read: false,
            }).catch(() => {})
          : Promise.resolve(),
      ]).catch(() => {});

      cancelled++;
    } catch (err: any) {
      logger.warn(`[vendor-no-response] failed to cancel booking ${row.id}:`, err?.message || err);
    }
  }

  return cancelled;
}

async function ensurePaymentRecordForIntentInTx(
  tx: any,
  params: {
    paymentIntentId: string;
    fallbackBookingId?: string | null;
    fallbackPaymentType?: string | null;
    fallbackAmount?: number | null;
    fallbackTotalAmount?: number | null;
    fallbackPlatformFeeAmount?: number | null;
    fallbackVendorGrossAmount?: number | null;
    fallbackVendorNetPayoutAmount?: number | null;
    fallbackStripeProcessingFeeEstimate?: number | null;
    fallbackStripeConnectedAccountId?: string | null;
  }
) {
  const paymentIntentId = asTrimmedString(params.paymentIntentId);
  if (!paymentIntentId) return null;

  const existingRows = await tx
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      paymentType: payments.paymentType,
      status: payments.status,
      amount: payments.amount,
      totalAmount: payments.totalAmount,
      platformFeeAmount: payments.platformFeeAmount,
      vendorGrossAmount: payments.vendorGrossAmount,
      vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
      stripeProcessingFeeEstimate: payments.stripeProcessingFeeEstimate,
      actualStripeFeeAmount: payments.actualStripeFeeAmount,
      refundAmount: payments.refundAmount,
      disputeStatus: payments.disputeStatus,
      payoutStatus: payments.payoutStatus,
      payoutEligibleAt: payments.payoutEligibleAt,
      payoutBlockedReason: payments.payoutBlockedReason,
      payoutAdjustedAmount: payments.payoutAdjustedAmount,
      paidOutAt: payments.paidOutAt,
      stripeChargeId: payments.stripeChargeId,
      stripeTransferId: payments.stripeTransferId,
      stripeConnectedAccountId: payments.stripeConnectedAccountId,
      customerId: payments.customerId,
      vendorAccountId: payments.vendorAccountId,
    })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntentId))
    // When a deposit is collected in the same PaymentIntent, two rows exist.
    // Always prefer the 'booking' row so webhook logic operates on the service payment.
    .orderBy(drizzleSql`CASE WHEN payment_type = 'booking' THEN 0 ELSE 1 END`)
    .limit(1);
  if (existingRows[0]) {
    const existingPayment = existingRows[0];
    const connectedAccountId = asTrimmedString(params.fallbackStripeConnectedAccountId);
    const patch: Record<string, unknown> = {};
    if (!asTrimmedString(existingPayment.stripeConnectedAccountId) && connectedAccountId) {
      patch.stripeConnectedAccountId = connectedAccountId;
    }
    if (parseIntegerValue(existingPayment.totalAmount) == null && parseIntegerValue(params.fallbackTotalAmount) != null) {
      patch.totalAmount = Math.max(0, parseIntegerValue(params.fallbackTotalAmount) ?? 0);
    }
    if (
      parseIntegerValue(existingPayment.platformFeeAmount) == null &&
      parseIntegerValue(params.fallbackPlatformFeeAmount) != null
    ) {
      patch.platformFeeAmount = Math.max(0, parseIntegerValue(params.fallbackPlatformFeeAmount) ?? 0);
    }
    if (
      parseIntegerValue(existingPayment.vendorNetPayoutAmount) == null &&
      parseIntegerValue(params.fallbackVendorNetPayoutAmount) != null
    ) {
      patch.vendorNetPayoutAmount = Math.max(0, parseIntegerValue(params.fallbackVendorNetPayoutAmount) ?? 0);
    }
    if (Object.keys(patch).length > 0) {
      await tx.update(payments).set(patch as any).where(eq(payments.id, existingPayment.id));
    }
    return existingPayment;
  }

  const bookingId = asTrimmedString(params.fallbackBookingId);
  if (!bookingId) return null;

  const [bookingRow] = await tx
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      vendorAccountId: bookings.vendorAccountId,
      bookingEndAt: bookings.bookingEndAt,
      totalAmount: bookings.totalAmount,
      platformFee: bookings.platformFee,
      subtotalAmountCents: bookings.subtotalAmountCents,
      vendorPayout: bookings.vendorPayout,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!bookingRow?.id) return null;

  const amount =
    parseIntegerValue(params.fallbackAmount) && Number.isFinite(Number(params.fallbackAmount))
      ? Math.max(0, Number(params.fallbackAmount))
      : 0;
  if (!amount) return null;

  // Always prefer DB-stored amounts over metadata to prevent price tampering via
  // manipulated payment intent metadata. Metadata is only used as a last resort.
  const totalAmount =
    parseIntegerValue(bookingRow.totalAmount) ??
    parseIntegerValue(params.fallbackTotalAmount) ??
    amount;
  const platformFeeAmount =
    parseIntegerValue(bookingRow.platformFee) ??
    parseIntegerValue(params.fallbackPlatformFeeAmount) ??
    Math.round(amount * VENDOR_FEE_RATE);
  const vendorGrossAmount =
    parseIntegerValue(bookingRow.subtotalAmountCents) ??
    parseIntegerValue(params.fallbackVendorGrossAmount) ??
    Math.max(0, totalAmount - Math.max(0, parseIntegerValue(bookingRow.platformFee) ?? 0));
  const vendorNetPayoutAmount =
    parseIntegerValue(bookingRow.vendorPayout) ??
    parseIntegerValue(params.fallbackVendorNetPayoutAmount) ??
    Math.max(0, amount - platformFeeAmount);
  const stripeProcessingFeeEstimate =
    parseIntegerValue(params.fallbackStripeProcessingFeeEstimate) ??
    estimateStripeProcessingFeeCents(totalAmount);
  const connectedAccountId = asTrimmedString(params.fallbackStripeConnectedAccountId) || null;
  const payoutEligibleAt =
    bookingRow.bookingEndAt instanceof Date
      ? new Date(bookingRow.bookingEndAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000)
      : null;

  const [inserted] = await tx
    .insert(payments)
    .values({
      bookingId,
      customerId: bookingRow.customerId,
      vendorAccountId: bookingRow.vendorAccountId,
      stripePaymentIntentId: paymentIntentId,
      amount,
      totalAmount,
      platformFeeAmount,
      vendorGrossAmount,
      vendorNetPayoutAmount,
      stripeProcessingFeeEstimate,
      stripeConnectedAccountId: connectedAccountId,
      payoutStatus: "not_ready",
      payoutEligibleAt,
      paymentType: (normalizePaymentStateValue(params.fallbackPaymentType) || "deposit") as "deposit" | "final" | "installment",
      status: "pending",
    })
    .returning({
      id: payments.id,
      bookingId: payments.bookingId,
      paymentType: payments.paymentType,
      status: payments.status,
      amount: payments.amount,
      totalAmount: payments.totalAmount,
      platformFeeAmount: payments.platformFeeAmount,
      vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
      vendorGrossAmount: payments.vendorGrossAmount,
      refundAmount: payments.refundAmount,
      disputeStatus: payments.disputeStatus,
      payoutStatus: payments.payoutStatus,
      payoutEligibleAt: payments.payoutEligibleAt,
      payoutBlockedReason: payments.payoutBlockedReason,
      payoutAdjustedAmount: payments.payoutAdjustedAmount,
      paidOutAt: payments.paidOutAt,
      actualStripeFeeAmount: payments.actualStripeFeeAmount,
      stripeChargeId: payments.stripeChargeId,
      stripeTransferId: payments.stripeTransferId,
      stripeConnectedAccountId: payments.stripeConnectedAccountId,
      customerId: payments.customerId,
      vendorAccountId: payments.vendorAccountId,
    });

  return inserted ?? null;
}

/**
 * Creates (or retrieves) a Stripe PaymentIntent for the booking total payment.
 *
 * If a pending PaymentIntent already exists for this booking (idempotent resume),
 * the existing clientSecret is returned instead of creating a new one.
 *
 * When the booking has a security deposit, it is included in the same PaymentIntent
 * as the service charge. A separate 'security_deposit' row is inserted in the payments
 * table so it can be partially refunded independently after the event.
 */
async function initializeBookingPayment(input: {
  bookingId: string;
  customerId: string;
  customerEmail: string;
}) {
  const bookingId = asTrimmedString(input.bookingId);
  const customerId = asTrimmedString(input.customerId);
  if (!bookingId || !customerId) {
    throw new Error("Invalid payment initialization payload");
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      vendorAccountId: bookings.vendorAccountId,
      status: bookings.status,
      listingId: bookings.listingId,
      bookingStartAt: bookings.bookingStartAt,
      bookingEndAt: bookings.bookingEndAt,
      totalAmount: bookings.totalAmount,
      platformFee: bookings.platformFee,
      subtotalAmountCents: bookings.subtotalAmountCents,
      vendorPayout: bookings.vendorPayout,
      securityDepositCents: bookings.securityDepositCents,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) throw new Error("Booking not found");
  if (!booking.customerId || booking.customerId !== customerId) throw new Error("You do not have access to this booking");
  if (!booking.vendorAccountId) throw new Error("Booking is missing vendor account");

  const bookingStatus = normalizePaymentStateValue(booking.status);
  if (bookingStatus === "cancelled" || bookingStatus === "expired" || bookingStatus === "failed") {
    throw new Error("This booking is no longer payable");
  }

  const [vendorAccount] = await db
    .select({
      id: vendorAccounts.id,
      stripeConnectId: vendorAccounts.stripeConnectId,
      stripeOnboardingComplete: vendorAccounts.stripeOnboardingComplete,
    })
    .from(vendorAccounts)
    .where(eq(vendorAccounts.id, booking.vendorAccountId))
    .limit(1);

  if (!vendorAccount?.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
    throw new Error("Vendor payment processing not set up");
  }

  const { stripeClient, createBookingPaymentIntent } = await import("./stripe");

  // Check if a pending PaymentIntent already exists for this booking (idempotent resume).
  const [existingPayment] = await db
    .select({ stripePaymentIntentId: payments.stripePaymentIntentId, status: payments.status })
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.paymentType, "booking")))
    .limit(1);

  if (existingPayment?.stripePaymentIntentId) {
    const existingIntent = await stripeClient.paymentIntents.retrieve(existingPayment.stripePaymentIntentId);
    if (existingIntent.status === "succeeded") throw new Error("This payment has already been completed");
    if (existingIntent.client_secret && existingIntent.status !== "canceled") {
      return { booking, clientSecret: existingIntent.client_secret, paymentIntentId: existingIntent.id };
    }
  }

  // Security deposit is included in the single upfront PaymentIntent.
  // The deposit amount is tracked in a separate payments row so it can be
  // partially refunded independently of the service payment.
  const securityDepositCents = Math.max(0, parseIntegerValue(booking.securityDepositCents) ?? 0);
  const totalAmountCents = parseIntegerValue(booking.totalAmount) ?? 0;
  // Service-only total = full booking charge minus the security deposit portion.
  // Used for payout/fee calculations so the deposit never reaches the vendor.
  const serviceOnlyTotal = Math.max(0, totalAmountCents - securityDepositCents);
  const platformFeeAmount = parseIntegerValue(booking.platformFee) ?? Math.round(serviceOnlyTotal * VENDOR_FEE_RATE);
  const vendorGrossAmount = parseIntegerValue(booking.subtotalAmountCents) ?? Math.max(0, serviceOnlyTotal - platformFeeAmount);
  const vendorNetPayoutAmount = parseIntegerValue(booking.vendorPayout) ?? Math.max(0, serviceOnlyTotal - platformFeeAmount);
  const stripeProcessingFeeEstimate = estimateStripeProcessingFeeCents(totalAmountCents);

  const paymentIntent = await createBookingPaymentIntent({
    amount: totalAmountCents, // full charge including security deposit
    platformFeeAmount,
    vendorNetPayoutAmount,
    vendorGrossAmount,
    stripeProcessingFeeEstimate,
    vendorStripeAccountId: vendorAccount.stripeConnectId,
    vendorAccountId: booking.vendorAccountId,
    listingId: booking.listingId ?? undefined,
    eventStartAt: booking.bookingStartAt,
    eventEndAt: booking.bookingEndAt,
    totalAmount: totalAmountCents,
    description: `Booking ${booking.id}`,
    bookingId: booking.id,
    paymentType: "booking",
    idempotencyKey: `booking-payment:${booking.id}`,
  });

  const payoutEligibleAt =
    booking.bookingEndAt instanceof Date
      ? new Date(booking.bookingEndAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000)
      : null;

  // Insert the service payment row (used for payout tracking and booking status).
  await db.insert(payments).values({
    bookingId: booking.id,
    customerId: booking.customerId,
    vendorAccountId: booking.vendorAccountId,
    stripePaymentIntentId: paymentIntent.id,
    amount: serviceOnlyTotal,
    totalAmount: serviceOnlyTotal,
    platformFeeAmount,
    vendorGrossAmount,
    vendorNetPayoutAmount,
    stripeProcessingFeeEstimate,
    stripeConnectedAccountId: vendorAccount.stripeConnectId,
    paymentType: "booking",
    status: "pending",
    payoutStatus: "not_ready",
    payoutEligibleAt,
  }).onConflictDoNothing(); // Safe if called twice before confirmation

  // Insert the security deposit row (same PaymentIntent, tracked separately for refunds).
  if (securityDepositCents > 0) {
    await db.insert(payments).values({
      bookingId: booking.id,
      customerId: booking.customerId,
      vendorAccountId: booking.vendorAccountId,
      stripePaymentIntentId: paymentIntent.id,
      amount: securityDepositCents,
      totalAmount: securityDepositCents,
      platformFeeAmount: 0,
      vendorGrossAmount: 0,
      vendorNetPayoutAmount: 0,
      stripeConnectedAccountId: vendorAccount.stripeConnectId,
      paymentType: "security_deposit",
      status: "pending",
      payoutStatus: "blocked",
      payoutBlockedReason: "security_deposit",
    }).onConflictDoNothing();
  }

  return { booking, clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
}

async function getBookingChatContextById(bookingId: string): Promise<BookingChatContext | null> {
  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) as "vendorAccountId",
      va.business_name as "vendorName",
      va.email as "vendorEmail",
      coalesce(b.event_date::text, e.date) as "eventDate",
      e.path as "eventTitle",
      b.status as "status",
      b.payment_status as "paymentStatus",
      b.created_at as "createdAt",
      (
        select bi.item_data->>'paymentMethodId'
        from booking_items bi
        where bi.booking_id = b.id
        limit 1
      ) as "paymentMethodId"
    from bookings b
    left join users u on u.id = b.customer_id
    left join events e on e.id = b.event_id
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select vl.account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_owner on true
    left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id)
    where b.id = ${bookingId}
    limit 1
  `);
  const row = extractRows(rows)[0];
  return row ? normalizeBookingChatContext(row) : null;
}

async function listCustomerBookingChatContexts(customerId: string): Promise<BookingChatContext[]> {
  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) as "vendorAccountId",
      va.business_name as "vendorName",
      va.email as "vendorEmail",
      coalesce(b.event_date::text, e.date) as "eventDate",
      e.path as "eventTitle",
      (
        select coalesce(
          nullif(trim(bi_t.item_data->>'listingTitle'), ''),
          nullif(trim(vl_t.title), '')
        )
        from booking_items bi_t
        left join vendor_listings vl_t on vl_t.id = bi_t.listing_id
        where bi_t.booking_id = b.id
        order by bi_t.id asc
        limit 1
      ) as "bookingTitle",
      b.status as "status",
      b.payment_status as "paymentStatus",
      b.created_at as "createdAt",
      (
        select bi2.item_data->>'paymentMethodId'
        from booking_items bi2
        where bi2.booking_id = b.id
        limit 1
      ) as "paymentMethodId"
    from bookings b
    left join users u on u.id = b.customer_id
    left join events e on e.id = b.event_id
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select vl.account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_owner on true
    left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id)
    where b.customer_id = ${customerId}
    order by b.created_at desc
  `);
  return extractRows(rows).map(normalizeBookingChatContext);
}

async function listVendorBookingChatContexts(vendorAccountId: string): Promise<BookingChatContext[]> {
  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) as "vendorAccountId",
      va.business_name as "vendorName",
      va.email as "vendorEmail",
      coalesce(b.event_date::text, e.date) as "eventDate",
      e.path as "eventTitle",
      (
        select coalesce(
          nullif(trim(bi_t.item_data->>'listingTitle'), ''),
          nullif(trim(vl_t.title), '')
        )
        from booking_items bi_t
        left join vendor_listings vl_t on vl_t.id = bi_t.listing_id
        where bi_t.booking_id = b.id
        order by bi_t.id asc
        limit 1
      ) as "bookingTitle",
      b.status as "status",
      b.payment_status as "paymentStatus",
      b.created_at as "createdAt",
      (
        select bi2.item_data->>'paymentMethodId'
        from booking_items bi2
        where bi2.booking_id = b.id
        limit 1
      ) as "paymentMethodId"
    from bookings b
    left join users u on u.id = b.customer_id
    left join events e on e.id = b.event_id
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select vl.account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_owner on true
    left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id)
    where coalesce(b.vendor_account_id, listing_owner.account_id, legacy_owner.account_id) = ${vendorAccountId}
    order by b.created_at desc
  `);
  return extractRows(rows).map(normalizeBookingChatContext);
}

async function cleanupExpiredStreamChannels() {
  if (!isStreamChatConfigured()) {
    return { checked: 0, deleted: 0 };
  }

  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      coalesce(b.event_date::text, e.date) as "eventDate"
    from bookings b
    left join events e on e.id = b.event_id
    where coalesce(b.event_date::text, e.date) is not null
    order by b.created_at desc
    limit 500
  `);

  const records = extractRows<{ bookingId?: string; eventDate?: string | null }>(rows);
  let deleted = 0;

  for (const record of records) {
    const bookingId = String(record?.bookingId || "").trim();
    const eventDate = record?.eventDate ? String(record.eventDate) : null;
    if (!bookingId || !eventDate) continue;
    if (!isChatExpiredForEventDate(eventDate)) continue;

    try {
      await deleteStreamBookingChannel(bookingId);
      deleted += 1;
    } catch {
      // Ignore non-existent channels; keep cleanup idempotent.
    }
  }

  return {
    checked: records.length,
    deleted,
  };
}


function computeCanonicalBookingTimeRange(input: {
  listingData: any;
  listingPricingUnit?: unknown;
  listingMinimumHours?: unknown;
  vendorTimeZone?: unknown;
  /** Timezone of the event delivery location (from geocoded coordinates). When provided,
   *  customer-entered times are interpreted in this timezone rather than the vendor timezone,
   *  since the customer is scheduling an event at a specific location. */
  eventTimeZone?: string | null;
  eventDate: string;
  eventStartTime?: string | null;
  eventEndDate?: string | null;
  eventEndTime?: string | null;
}) {
  const pricingUnit = getListingPricingUnit(input.listingData, input.listingPricingUnit);
  const minimumHours = getListingMinimumHours(input.listingData, input.listingMinimumHours);
  const vendorTimeZone = normalizeIanaTimeZone(input.vendorTimeZone);
  // Use event location timezone when available so that customer-entered times are
  // anchored to where the event is happening, not where the vendor is based.
  // NOTE: normalizeIanaTimeZone(null) returns "UTC" (truthy), so we cannot use
  // `|| vendorTimeZone` — the fallback would never run. Check for presence first.
  const bookingTimeZone = input.eventTimeZone
    ? normalizeIanaTimeZone(input.eventTimeZone, vendorTimeZone)
    : vendorTimeZone;
  const eventDate = asTrimmedString(input.eventDate);

  if (!eventDate || !parseIsoDateValue(eventDate)) {
    throw new Error("Booking event date is invalid");
  }

  const eventStartTime = asTrimmedString(input.eventStartTime);
  const eventEndTime = asTrimmedString(input.eventEndTime);
  const endDate = asTrimmedString(input.eventEndDate) || eventDate;

  if (pricingUnit === "per_hour") {
    const startTime = eventStartTime;
    const endTime = eventEndTime;

    if (!startTime || !endTime) {
      throw new Error("Hourly bookings require a start time and end time");
    }
    if (endDate !== eventDate) {
      throw new Error("Hourly bookings must start and end on the same day");
    }

    const startMinutes = parseTimeValueToMinutes(startTime);
    const endMinutes = parseTimeValueToMinutes(endTime);
    if (startMinutes == null || endMinutes == null) {
      throw new Error("Hourly booking time range is invalid");
    }
    if (endMinutes <= startMinutes) {
      throw new Error("Hourly booking end time must be after the start time");
    }

    const durationHours = (endMinutes - startMinutes) / 60;
    if (minimumHours != null && durationHours < minimumHours) {
      throw new Error(`Hourly bookings must be at least ${minimumHours} hour${minimumHours === 1 ? "" : "s"}`);
    }

    const bookingStartAt = zonedDateTimeToUtc(eventDate, startMinutes, bookingTimeZone);
    const bookingEndAt = zonedDateTimeToUtc(eventDate, endMinutes, bookingTimeZone);
    if (!(bookingStartAt instanceof Date) || Number.isNaN(bookingStartAt.getTime())) {
      throw new Error("Hourly booking start time is invalid");
    }
    if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
      throw new Error("Hourly booking end time is invalid");
    }

    return {
      pricingUnit,
      minimumHours,
      vendorTimeZone,
      bookingTimeZone,
      bookingStartAt,
      bookingEndAt,
    };
  }

  const hasEventTimeRange = Boolean(eventStartTime && eventEndTime);

  if (!eventStartTime || !eventEndTime) {
    throw new Error("Per-day bookings require a start time and end time");
  }

  if (hasEventTimeRange) {
    const startMinutes = parseTimeValueToMinutes(eventStartTime);
    const endMinutes = parseTimeValueToMinutes(eventEndTime);
    if (startMinutes == null || endMinutes == null) {
      throw new Error("Per-day event start/end times are invalid");
    }
    if (startMinutes === endMinutes) {
      throw new Error("Event start and end times cannot be the same");
    }
    // End time before start time means the event crosses midnight (e.g. 8 PM – 12 AM).
    // Compute the end timestamp against the following day in that case.
    const pastMidnight = endMinutes < startMinutes;
    const eventEndDateStr = pastMidnight ? addDaysToIsoDate(eventDate, 1) : eventDate;
    if (!eventEndDateStr) {
      throw new Error("Per-day event end time is invalid");
    }
    const bookingStartAt = zonedDateTimeToUtc(eventDate, startMinutes, bookingTimeZone);
    const bookingEndAt = zonedDateTimeToUtc(eventEndDateStr, endMinutes, bookingTimeZone);
    if (!(bookingStartAt instanceof Date) || Number.isNaN(bookingStartAt.getTime())) {
      throw new Error("Per-day event start time is invalid");
    }
    if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
      throw new Error("Per-day event end time is invalid");
    }
    return {
      pricingUnit,
      minimumHours,
      vendorTimeZone,
      bookingTimeZone,
      bookingStartAt,
      bookingEndAt,
    };
  }

  const bookingStartAt = zonedDateStartToUtc(eventDate, bookingTimeZone);
  const requestedEndDate = endDate;
  if (!parseIsoDateValue(requestedEndDate)) {
    throw new Error("Booking end date is invalid");
  }
  const bookingEndDateExclusive = addDaysToIsoDate(requestedEndDate, 1);
  const bookingEndAt = bookingEndDateExclusive
    ? zonedDateStartToUtc(bookingEndDateExclusive, bookingTimeZone)
    : null;

  if (!(bookingStartAt instanceof Date) || Number.isNaN(bookingStartAt.getTime())) {
    throw new Error("Booking start date is invalid");
  }
  if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
    throw new Error("Booking end date is invalid");
  }
  if (bookingEndAt.getTime() <= bookingStartAt.getTime()) {
    throw new Error("Booking end date must be on or after the start date");
  }

  return {
    pricingUnit,
    minimumHours,
    vendorTimeZone,
    bookingTimeZone,
    bookingStartAt,
    bookingEndAt,
  };
}

function doTimeRangesOverlap(
  firstStartAt: Date,
  firstEndAt: Date,
  secondStartAt: Date,
  secondEndAt: Date
) {
  return firstStartAt.getTime() < secondEndAt.getTime() && firstEndAt.getTime() > secondStartAt.getTime();
}

function getComparableGoogleEventRange(input: {
  event: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>["events"][number];
  vendorTimeZone: string;
}) {
  const { event, vendorTimeZone } = input;
  const allDayStartDate = asTrimmedString(event?.start?.date);
  const allDayEndDate = asTrimmedString(event?.end?.date);

  if (event?.isAllDay && allDayStartDate && allDayEndDate) {
    const startAt = zonedDateStartToUtc(allDayStartDate, vendorTimeZone);
    const endAt = zonedDateStartToUtc(allDayEndDate, vendorTimeZone);
    if (startAt instanceof Date && !Number.isNaN(startAt.getTime()) && endAt instanceof Date && !Number.isNaN(endAt.getTime())) {
      return { startAt, endAt };
    }
  }

  if (
    event?.startAt instanceof Date &&
    !Number.isNaN(event.startAt.getTime()) &&
    event?.endAt instanceof Date &&
    !Number.isNaN(event.endAt.getTime())
  ) {
    return {
      startAt: event.startAt,
      endAt: event.endAt,
    };
  }

  return null;
}

async function findOverlappingEventHubBookingsForListing(params: {
  listingId: string;
  bookingStartAt: Date;
  bookingEndAt: Date;
  excludeBookingId?: string | null;
}) {
  // Legacy compatibility remains only for rows missing canonical bookings.listing_id.
  const rows: any = await db.execute(drizzleSql`
    select
      b.id,
      b.status,
      b.booking_start_at as "bookingStartAt",
      b.booking_end_at as "bookingEndAt",
      coalesce(b.booked_quantity, booking_item_totals.quantity, 1) as "quantity"
    from bookings b
    left join lateral (
      select sum(coalesce(bi.quantity, 1))::int as quantity
      from booking_items bi
      where bi.booking_id = b.id
        and bi.listing_id = ${params.listingId}
    ) booking_item_totals on true
    where (
      b.listing_id = ${params.listingId}
      or (
        b.listing_id is null
        and exists (
          select 1
          from booking_items bi
          where bi.booking_id = b.id
            and bi.listing_id = ${params.listingId}
        )
      )
    )
      and b.status in ('pending', 'confirmed', 'completed')
      and (${params.excludeBookingId ?? null}::text is null or b.id <> ${params.excludeBookingId ?? null}::text)
      and b.booking_start_at is not null
      and b.booking_end_at is not null
      and b.booking_start_at < ${params.bookingEndAt}
      and b.booking_end_at > ${params.bookingStartAt}
    order by b.booking_start_at asc
  `);

  return extractRows<{
    id?: string;
    status?: string | null;
    bookingStartAt?: Date | null;
    bookingEndAt?: Date | null;
    quantity?: number | null;
  }>(rows);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractGoogleMetadataValueFromDescription(description: string | null | undefined, label: string) {
  const source = asTrimmedString(description);
  if (!source) return null;
  const match = source.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "im"));
  return match?.[1] ? asTrimmedString(match[1]) : null;
}

function normalizeComparableListingTitle(value: unknown) {
  const title = normalizeListingTitleCandidate(value);
  return title ? title.toLowerCase() : null;
}

async function loadVendorListingMatchContext(vendorAccountId: string): Promise<VendorListingMatchContext> {
  const rows = await db
    .select({
      id: vendorListings.id,
      title: vendorListings.title,
      listingData: vendorListings.listingData,
    })
    .from(vendorListings)
    .where(eq(vendorListings.accountId, vendorAccountId));

  const listingsById = new Map<string, { id: string; title: string | null; normalizedTitle: string | null }>();
  const listingIds = new Set<string>();
  const listingIdsByNormalizedTitle = new Map<string, string[]>();

  for (const row of rows) {
    const listingId = asTrimmedString(row.id);
    if (!listingId) continue;

    const listingData = row.listingData && typeof row.listingData === "object" ? row.listingData as any : {};
    const title =
      normalizeListingTitleCandidate(row.title) ??
      normalizeListingTitleCandidate(listingData?.listingTitle) ??
      null;
    const normalizedTitle = normalizeComparableListingTitle(title);

    listingsById.set(listingId, {
      id: listingId,
      title,
      normalizedTitle,
    });
    listingIds.add(listingId);

    if (normalizedTitle) {
      const current = listingIdsByNormalizedTitle.get(normalizedTitle) ?? [];
      current.push(listingId);
      listingIdsByNormalizedTitle.set(normalizedTitle, current);
    }
  }

  return {
    listingsById,
    listingIds,
    listingIdsByNormalizedTitle,
  };
}

async function loadGoogleEventMappingContext(params: {
  vendorAccountId: string;
  googleCalendarId: string;
  googleEventIds?: string[];
}): Promise<GoogleEventMappingContext> {
  const eventIds = Array.from(
    new Set(
      (params.googleEventIds ?? [])
        .map((value) => asTrimmedString(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  const query = db
    .select({
      googleEventId: googleCalendarEventMappings.googleEventId,
      listingId: googleCalendarEventMappings.listingId,
      mappingSource: googleCalendarEventMappings.mappingSource,
      mappingStatus: googleCalendarEventMappings.mappingStatus,
    })
    .from(googleCalendarEventMappings)
    .where(
      and(
        eq(googleCalendarEventMappings.vendorAccountId, params.vendorAccountId),
        eq(googleCalendarEventMappings.googleCalendarId, params.googleCalendarId),
        eventIds.length > 0
          ? inArray(googleCalendarEventMappings.googleEventId, eventIds)
          : drizzleSql`true`
      )
    );

  const rows = await query;
  const mappingsByEventId = new Map<
    string,
    {
      googleEventId: string;
      listingId: string;
      mappingSource: string;
      mappingStatus: string;
    }
  >();

  for (const row of rows) {
    const googleEventId = asTrimmedString(row.googleEventId);
    const listingId = asTrimmedString(row.listingId);
    if (!googleEventId || !listingId) continue;
    mappingsByEventId.set(googleEventId, {
      googleEventId,
      listingId,
      mappingSource: asTrimmedString(row.mappingSource) || "manual",
      mappingStatus: asTrimmedString(row.mappingStatus) || "reviewed",
    });
  }

  return {
    calendarId: params.googleCalendarId,
    mappingsByEventId,
  };
}

function matchGoogleCalendarEventToListing(
  event: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>["events"][number],
  params: {
    listingContext: VendorListingMatchContext;
    mappingContext: GoogleEventMappingContext | null;
  }
) {
  const metadataListingId =
    asTrimmedString(event.extendedProperties.private.eventHubListingId) ||
    asTrimmedString(event.extendedProperties.shared.eventHubListingId) ||
    extractGoogleMetadataValueFromDescription(event.description, "Listing ID");

  if (metadataListingId && params.listingContext.listingIds.has(metadataListingId)) {
    return {
      matched: true as const,
      listingId: metadataListingId,
      matchedBy: "metadata" as const,
    };
  }

  const manualMapping = params.mappingContext?.mappingsByEventId.get(event.id);
  if (manualMapping && params.listingContext.listingIds.has(manualMapping.listingId)) {
    return {
      matched: true as const,
      listingId: manualMapping.listingId,
      matchedBy: "manual" as const,
    };
  }

  const normalizedEventTitle = normalizeComparableListingTitle(event.summary);
  const exactTitleMatches = normalizedEventTitle
    ? params.listingContext.listingIdsByNormalizedTitle.get(normalizedEventTitle) ?? []
    : [];
  if (
    normalizedEventTitle &&
    exactTitleMatches.length === 1
  ) {
    return {
      matched: true as const,
      listingId: exactTitleMatches[0],
      matchedBy: "title" as const,
    };
  }

  return {
    matched: false as const,
    listingId: null,
    matchedBy: "unmatched" as const,
  };
}

async function findOverlappingGoogleCalendarEventForListing(params: {
  vendorAccountId: string;
  vendorGoogleCalendarId?: string | null;
  vendorTimeZone?: string | null;
  listingId: string;
  listingTitle: string | null;
  bookingStartAt: Date;
  bookingEndAt: Date;
  enabled: boolean;
}) {
  if (!params.enabled) {
    return {
      status: "skipped" as const,
      reason: "google_not_enabled",
      conflict: null,
    };
  }

  try {
    const vendorTimeZone = normalizeIanaTimeZone(params.vendorTimeZone);
    const selectedCalendarId = asTrimmedString(params.vendorGoogleCalendarId);
    if (!selectedCalendarId) {
      return {
        status: "skipped" as const,
        reason: "google_calendar_not_selected",
        conflict: null,
      };
    }

    const { events } = await listSelectedGoogleCalendarEventsForVendorAccount(params.vendorAccountId, {
      timeMin: params.bookingStartAt,
      timeMax: params.bookingEndAt,
      maxResults: 250,
    });
    const listingContext = await loadVendorListingMatchContext(params.vendorAccountId);
    const mappingContext = await loadGoogleEventMappingContext({
      vendorAccountId: params.vendorAccountId,
      googleCalendarId: selectedCalendarId,
      googleEventIds: events.map((event) => event.id),
    });

    for (const event of events) {
      if ((asTrimmedString(event.status) || "").toLowerCase() === "cancelled") continue;
      const comparableRange = getComparableGoogleEventRange({
        event,
        vendorTimeZone,
      });
      if (!comparableRange) continue;
      if (!doTimeRangesOverlap(params.bookingStartAt, params.bookingEndAt, comparableRange.startAt, comparableRange.endAt)) {
        continue;
      }

      const match = matchGoogleCalendarEventToListing(event, {
        listingContext,
        mappingContext,
      });
      if (!match.matched || match.listingId !== params.listingId) continue;

      return {
        status: "checked" as const,
        reason: null,
        conflict: {
          event,
          matchedBy: match.matchedBy,
        },
      };
    }

    return {
      status: "checked" as const,
      reason: null,
      conflict: null,
    };
  } catch (error) {
    if (
      error instanceof GoogleCalendarConnectionError &&
      (error.code === "google_not_connected" || error.code === "google_calendar_not_selected")
    ) {
      return {
        status: "skipped" as const,
        reason: error.code,
        conflict: null,
      };
    }

    const message = error instanceof Error ? error.message : "Google availability could not be verified";
    logRouteError("/api/bookings google-conflict-read", error);
    return {
      status: "failed" as const,
      reason: error instanceof GoogleCalendarConnectionError ? error.code : "google_calendar_check_failed",
      message,
      conflict: null,
    };
  }
}

async function checkListingAvailabilityForBookingRequest(params: {
  vendorAccountId: string;
  vendorGoogleConnectionStatus?: string | null;
  vendorGoogleCalendarId?: string | null;
  vendorTimeZone?: string | null;
  listingId: string;
  listingTitle: string | null;
  bookingStartAt: Date;
  bookingEndAt: Date;
  requestedQuantity: number;
  listingAvailableQuantity: number;
  excludeBookingId?: string | null;
}) {
  const overlappingEventHubBookings = await findOverlappingEventHubBookingsForListing({
    listingId: params.listingId,
    bookingStartAt: params.bookingStartAt,
    bookingEndAt: params.bookingEndAt,
    excludeBookingId: params.excludeBookingId ?? null,
  });

  const totalReservedUnits = overlappingEventHubBookings.reduce((sum, row) => {
    const quantity = parseIntegerValue(row.quantity);
    return sum + (quantity && quantity > 0 ? quantity : 1);
  }, 0);
  const requestedQuantity = Math.max(1, Math.floor(params.requestedQuantity || 1));
  const listingCapacity = Math.max(1, Math.floor(params.listingAvailableQuantity || 1));
  const capacityExceeded = totalReservedUnits + requestedQuantity > listingCapacity;
  const eventHubConflict = capacityExceeded
    ? {
        id: overlappingEventHubBookings[0]?.id ?? null,
        reservedUnits: totalReservedUnits,
        requestedQuantity,
        availableQuantity: listingCapacity,
      }
    : null;

  const googleEnabled =
    asTrimmedString(params.vendorGoogleConnectionStatus).toLowerCase() === "connected" &&
    asTrimmedString(params.vendorGoogleCalendarId).length > 0;

  const google = await findOverlappingGoogleCalendarEventForListing({
    vendorAccountId: params.vendorAccountId,
    vendorGoogleCalendarId: params.vendorGoogleCalendarId,
    vendorTimeZone: params.vendorTimeZone,
    listingId: params.listingId,
    listingTitle: params.listingTitle,
    bookingStartAt: params.bookingStartAt,
    bookingEndAt: params.bookingEndAt,
    enabled: googleEnabled,
  });

  return {
    eventHub: {
      status: "checked" as const,
      conflict: eventHubConflict,
    },
    google,
  };
}

async function listGoogleSyncReconciliationCandidatesForVendorAccount(vendorAccountId: string) {
  // Legacy compatibility remains only when canonical ownership/linkage fields are null.
  const rows: any = await db.execute(drizzleSql`
    select
      b.id,
      b.status,
      b.booking_start_at as "bookingStartAt",
      b.booking_end_at as "bookingEndAt",
      b.google_sync_status as "googleSyncStatus",
      b.google_sync_error as "googleSyncError",
      b.google_event_id as "googleEventId",
      b.google_calendar_id as "googleCalendarId",
      b.created_at as "createdAt",
      coalesce(b.listing_id, legacy_item.listing_id) as "listingId",
      coalesce(
        nullif(trim(b.listing_title_snapshot), ''),
        nullif(trim(legacy_item.title), ''),
        nullif(trim(listing_owner.title), ''),
        nullif(trim(legacy_listing.title), '')
      ) as "listingTitle"
    from bookings b
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select
        bi.listing_id,
        bi.title
      from booking_items bi
      where b.listing_id is null
        and bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_item on true
    left join vendor_listings legacy_listing on legacy_listing.id = legacy_item.listing_id
    where coalesce(b.vendor_account_id, listing_owner.account_id, legacy_listing.account_id) = ${vendorAccountId}
    order by b.created_at desc
  `);
  return extractRows(rows);
}

async function listSyncableExistingBookingIdsForVendorAccount(vendorAccountId: string) {
  // Legacy compatibility remains only when canonical ownership/linkage fields are null.
  const rows: any = await db.execute(drizzleSql`
    select
      b.id
    from bookings b
    left join vendor_listings listing_owner on listing_owner.id = b.listing_id
    left join lateral (
      select bi.listing_id
      from booking_items bi
      where b.listing_id is null
        and bi.booking_id = b.id
      order by bi.id asc
      limit 1
    ) legacy_item on true
    left join vendor_listings legacy_listing on legacy_listing.id = legacy_item.listing_id
    where coalesce(b.vendor_account_id, listing_owner.account_id, legacy_listing.account_id) = ${vendorAccountId}
      and (
        b.status in ('pending', 'confirmed', 'completed')
        or (b.status in ('cancelled', 'expired', 'failed') and b.google_event_id is not null)
      )
    order by b.created_at asc
  `);
  return extractRows<{ id?: string | null }>(rows)
    .map((row) => asTrimmedString(row?.id))
    .filter((bookingId): bookingId is string => Boolean(bookingId));
}

type GoogleBookingReconciliationIssue = {
  bookingId: string | null;
  listingId: string | null;
  listingTitle: string;
  status: string;
  bookingStartAt: Date | string | null;
  bookingEndAt: Date | string | null;
  googleSyncStatus: string | null;
  googleSyncError: string | null;
  googleEventId: string | null;
  googleCalendarId: string | null;
  selectedGoogleCalendarId: string | null;
  issueCodes: string[];
  createdAt: Date | string | null;
};

async function buildGoogleBookingReconciliationForVendorAccount(account: any) {
  const selectedGoogleCalendarId = asTrimmedString(account?.googleCalendarId) || null;
  const googleEnabled =
    asTrimmedString(account?.googleConnectionStatus).toLowerCase() === "connected" &&
    Boolean(selectedGoogleCalendarId);

  const bookingRows = await listGoogleSyncReconciliationCandidatesForVendorAccount(account.id);
  const activeBookingRows = bookingRows.filter((row: any) => {
    const s = asTrimmedString(row?.status).toLowerCase();
    return s !== "cancelled" && s !== "expired" && s !== "failed";
  });
  let googleCalendarReadStatus: "checked" | "skipped" | "failed" = googleEnabled ? "checked" : "skipped";
  let googleCalendarReadError: string | null = null;
  let existingGoogleEventIds = new Set<string>();
  let selectedGoogleCalendarEvents: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>["events"] = [];
  let unmatchedEventsCount: number | null = googleEnabled ? 0 : null;

  if (googleEnabled) {
    try {
      const { events } = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
        maxResults: 2500,
      });
      selectedGoogleCalendarEvents = events;
      existingGoogleEventIds = new Set(
        events
          .map((event) => asTrimmedString(event.id))
          .filter((eventId): eventId is string => Boolean(eventId))
      );
    } catch (error) {
      googleCalendarReadStatus = "failed";
      googleCalendarReadError =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Unable to read selected Google calendar";
      unmatchedEventsCount = null;
    }
  }

  if (
    googleEnabled &&
    googleCalendarReadStatus === "checked" &&
    selectedGoogleCalendarId &&
    selectedGoogleCalendarEvents.length > 0
  ) {
    const listingContext = await loadVendorListingMatchContext(account.id);
    const mappingContext = await loadGoogleEventMappingContext({
      vendorAccountId: account.id,
      googleCalendarId: selectedGoogleCalendarId,
      googleEventIds: selectedGoogleCalendarEvents.map((event) => event.id),
    });

    unmatchedEventsCount = selectedGoogleCalendarEvents
      .filter((event) => (asTrimmedString(event.status) || "").toLowerCase() !== "cancelled")
      .filter((event) => {
        const match = matchGoogleCalendarEventToListing(event, {
          listingContext,
          mappingContext,
        });
        return !match.matched;
      }).length;
  } else if (googleEnabled && googleCalendarReadStatus === "checked") {
    unmatchedEventsCount = 0;
  }

  if (activeBookingRows.length === 0) {
    return {
      googleEnabled,
      googleCalendarId: selectedGoogleCalendarId,
      googleCalendarReadStatus,
      googleCalendarReadError,
      bookingsChecked: 0,
      issuesFound: 0,
      unmatchedEventsCount,
      issues: [],
    };
  }

  const issues: GoogleBookingReconciliationIssue[] = bookingRows.flatMap((row: any) => {
    const status = asTrimmedString(row?.status).toLowerCase();
    // Cancelled, expired, and failed bookings should never have a Google Calendar event.
    // The sync function already handles these correctly (no event created / existing deleted).
    // Showing them as sync issues is misleading — there's nothing actionable for the vendor.
    if (status === "cancelled" || status === "expired" || status === "failed") return [];

    const issueCodes: string[] = [];
    const googleSyncStatus = asTrimmedString(row?.googleSyncStatus).toLowerCase();
    const googleSyncError = asTrimmedString(row?.googleSyncError);
    const googleEventId = asTrimmedString(row?.googleEventId);
    const bookingGoogleCalendarId = asTrimmedString(row?.googleCalendarId);
    const calendarMismatch =
      googleEnabled &&
      Boolean(bookingGoogleCalendarId) &&
      Boolean(selectedGoogleCalendarId) &&
      bookingGoogleCalendarId !== selectedGoogleCalendarId;

    if (googleSyncStatus === "failed" || googleSyncError) {
      issueCodes.push("sync_failed");
    }
    if (googleEnabled && !googleEventId) {
      issueCodes.push("missing_google_event_id");
    }
    if (calendarMismatch) {
      issueCodes.push("calendar_mismatch");
    }
    if (
      googleEnabled &&
      googleCalendarReadStatus === "checked" &&
      googleEventId &&
      !existingGoogleEventIds.has(googleEventId) &&
      !calendarMismatch
    ) {
      issueCodes.push("missing_in_selected_calendar");
    }

    if (issueCodes.length === 0) return [];

    return [{
      bookingId: asTrimmedString(row?.id),
      listingId: asTrimmedString(row?.listingId),
      listingTitle: asTrimmedString(row?.listingTitle) || "Listing",
      status: asTrimmedString(row?.status) || "unknown",
      bookingStartAt: row?.bookingStartAt ?? null,
      bookingEndAt: row?.bookingEndAt ?? null,
      googleSyncStatus: asTrimmedString(row?.googleSyncStatus) || null,
      googleSyncError,
      googleEventId,
      googleCalendarId: bookingGoogleCalendarId || null,
      selectedGoogleCalendarId,
      issueCodes,
      createdAt: row?.createdAt ?? null,
    }];
  });

  return {
    googleEnabled,
    googleCalendarId: selectedGoogleCalendarId,
    googleCalendarReadStatus,
    googleCalendarReadError,
    bookingsChecked: activeBookingRows.length,
    issuesFound: issues.length,
    unmatchedEventsCount,
    issues,
  };
}

async function runGoogleBookingSyncVerificationForVendorAccount(account: any) {
  const reconciliation = await buildGoogleBookingReconciliationForVendorAccount(account);
  return {
    vendorAccountId: asTrimmedString(account?.id) || null,
    googleEnabled: reconciliation.googleEnabled,
    googleCalendarId: reconciliation.googleCalendarId,
    googleCalendarReadStatus: reconciliation.googleCalendarReadStatus,
    googleCalendarReadError: reconciliation.googleCalendarReadError,
    bookingsChecked: reconciliation.bookingsChecked,
    issuesFound: reconciliation.issuesFound,
    unmatchedEventsCount: reconciliation.unmatchedEventsCount,
    issues: reconciliation.issues,
  };
}


function requireCustomerAnyAuth(req: any, res: any, next: any) {
  return requireDualAuthAuth0(req, res, next);
}

function isMachineGeneratedCustomerName(value: unknown): boolean {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return true;
  if (/^auth0[_-]/i.test(name)) return true;
  if (/^auth0[_-]?google[_-]?oauth2[_-]?\d+$/i.test(name)) return true;
  if (/^google[_-]?oauth2[_-]?\d+$/i.test(name)) return true;
  if (/^[a-z0-9_]{28,}$/i.test(name) && /\d/.test(name)) return true;
  return false;
}

function isSyntheticAuth0LocalEmail(value: unknown): boolean {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email) return false;
  if (!email.endsWith("@eventhub.local")) return false;
  const local = email.split("@")[0] || "";
  return local.startsWith("auth0_");
}

function normalizeIdentityEmailCandidate(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return undefined;
  if (isSyntheticAuth0LocalEmail(normalized)) return undefined;
  return normalized;
}

async function resolveCanonicalIdentityEmail(params: {
  sub?: string;
  auth0Email?: string;
  userId?: string;
}): Promise<string | undefined> {
  const auth0Email = normalizeIdentityEmailCandidate(params.auth0Email);
  if (auth0Email) return auth0Email;

  const userId = params.userId?.trim();
  if (userId) {
    try {
      const vendorByUserId = await db
        .select({ email: vendorAccounts.email })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.userId, userId))
        .limit(1);
      const byUserIdEmail = normalizeIdentityEmailCandidate(vendorByUserId[0]?.email);
      if (byUserIdEmail) return byUserIdEmail;
    } catch {
      // Ignore and continue to other fallbacks.
    }
  }

  const sub = params.sub?.trim();
  if (!sub) return undefined;

  try {
    const resolution = await resolveVendorAccountForAuth0Identity({
      auth0Sub: sub,
      context: "resolveCanonicalIdentityEmail",
    });
    return normalizeIdentityEmailCandidate(resolution.account?.email);
  } catch {
    return undefined;
  }
}

async function safelyBackfillCustomerEmail(params: {
  userId: string;
  currentEmail: string;
  nextEmail?: string;
  /** When true, allows replacing a real email with the Auth0 token email.
   *  Only pass this when the user was matched by auth0_sub — a strong identity proof. */
  allowRealEmailReplacement?: boolean;
}) {
  const currentEmail = params.currentEmail.trim().toLowerCase();
  const nextEmail = normalizeIdentityEmailCandidate(params.nextEmail);
  if (!nextEmail || nextEmail === currentEmail) return currentEmail;

  const canRepair =
    isSyntheticAuth0LocalEmail(currentEmail) ||
    !currentEmail ||
    params.allowRealEmailReplacement === true;
  if (!canRepair) return currentEmail;

  const conflict = await db
    .select({ id: users.id })
    .from(users)
    .where(and(drizzleSql`lower(${users.email}) = ${nextEmail}`, drizzleSql`${users.id} <> ${params.userId}`))
    .limit(1);

  if (conflict.length > 0) {
    return nextEmail;
  }

  const [updated] = await db
    .update(users)
    .set({
      email: nextEmail,
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId))
    .returning({ email: users.email });

  return updated?.email?.trim().toLowerCase() || nextEmail;
}

function toHumanNameFromEmail(email: string | undefined): string | null {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return null;
  const local = normalized.split("@")[0] || "";
  if (!local) return null;
  if (local.startsWith("auth0_")) return null;

  const words = local
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (words.length === 0) return null;
  const titled = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return titled.join(" ");
}

async function resolvePreferredCustomerName(params: {
  sub?: string;
  email?: string;
  auth0Name?: string;
}): Promise<string | null> {
  const auth0Name = (params.auth0Name || "").trim();
  if (auth0Name && !isMachineGeneratedCustomerName(auth0Name)) {
    return auth0Name;
  }

  const email = params.email?.trim().toLowerCase();
  return toHumanNameFromEmail(email);
}

async function resolveVendorBusinessNameForIdentity(params: {
  sub?: string;
  email?: string;
}): Promise<string | null> {
  const resolution = await resolveVendorAccountForAuth0Identity({
    auth0Sub: params.sub,
    email: params.email,
    context: "resolveVendorBusinessNameForIdentity",
  });
  const name = resolution.account?.businessName?.trim();
  return name || null;
}

async function resolveCustomerAuthFromRequest(
  req: any,
  opts?: { createIfMissing?: boolean }
): Promise<{ id: string; email: string; type: "customer" | "admin" } | null> {
  const auth0 = req?.auth0 as {
    sub?: string;
    email?: string;
    name?: string;
    nickname?: string;
    given_name?: string;
    family_name?: string;
  } | undefined;
  const sub = auth0?.sub?.trim();
  const emailFromAuth0 = auth0?.email?.toLowerCase().trim();
  const auth0Name =
    auth0?.name?.trim() ||
    [auth0?.given_name, auth0?.family_name].filter(Boolean).join(" ").trim() ||
    auth0?.nickname?.trim() ||
    "";
  const existingCustomerAuthId =
    typeof req?.customerAuth?.id === "string" ? req.customerAuth.id.trim() : "";
  if (existingCustomerAuthId) {
    const existingAuthEmail =
      typeof req?.customerAuth?.email === "string" ? req.customerAuth.email.trim().toLowerCase() : "";
    const [existingUser] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, existingCustomerAuthId))
      .limit(1);

    if (existingUser?.id) {
      const canonicalIdentityEmail = await resolveCanonicalIdentityEmail({
        sub,
        auth0Email: emailFromAuth0,
        userId: existingUser.id,
      });

      const resolvedEmail = await safelyBackfillCustomerEmail({
        userId: existingUser.id,
        currentEmail: existingUser.email,
        nextEmail: canonicalIdentityEmail || existingAuthEmail,
      });

      req.customerAuth = {
        id: existingUser.id,
        email: resolvedEmail,
        type: existingUser.role === "admin" ? "admin" : "customer",
      };
      return req.customerAuth;
    }
  }

  const canonicalIdentityEmail = await resolveCanonicalIdentityEmail({ sub, auth0Email: emailFromAuth0 });
  let email = canonicalIdentityEmail;

  // Prefer stable Auth0 subject matching when available (works even if email is missing in token).
  if (sub) {
      try {
      const subLookup = await db.execute(
        drizzleSql`select id, email, role from users where auth0_sub = ${sub} limit 1`
      );
      const subRows = extractRows<{ id?: string; email?: string; role?: string }>(subLookup);
      const subUser = subRows[0];
      if (subUser?.id && subUser?.email) {
        let resolvedUserId = subUser.id;
        let resolvedUserEmail = subUser.email.trim().toLowerCase();
        let resolvedUserRole = subUser.role;
        const canonicalForSubUser =
          canonicalIdentityEmail ||
          (await resolveCanonicalIdentityEmail({
            sub,
            auth0Email: emailFromAuth0,
            userId: resolvedUserId,
          }));
        const resolvedEmail =
          canonicalForSubUser ||
          normalizeIdentityEmailCandidate(resolvedUserEmail) ||
          resolvedUserEmail;

        resolvedUserEmail = await safelyBackfillCustomerEmail({
          userId: resolvedUserId,
          currentEmail: resolvedUserEmail,
          nextEmail: resolvedEmail,
          // We proved identity via auth0_sub — trust the Auth0 token email as authoritative.
          allowRealEmailReplacement: true,
        });

        return {
          id: resolvedUserId,
          email: resolvedUserEmail,
          type: resolvedUserRole === "admin" ? "admin" : "customer",
        };
      }
    } catch {
      // Ignore if users.auth0_sub is unavailable in this environment.
    }
  }

  // If token email is missing, use a deterministic synthetic email from sub to keep customer flows functional.
  if (!email && sub) {
    const safeSub = sub.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 48);
    email = `auth0_${safeSub}@eventhub.local`;
  }

  if (!email) return null;

  let [userRow] = await db
    .select()
    .from(users)
    .where(drizzleSql`lower(${users.email}) = ${email}`)
    .limit(1);

  const preferredName = await resolvePreferredCustomerName({
    sub,
    email,
    auth0Name,
  });
  const vendorBusinessName = await resolveVendorBusinessNameForIdentity({ sub, email });

  if (!userRow && opts?.createIfMissing) {
    const generatedName = preferredName || toHumanNameFromEmail(email) || "Customer";

    [userRow] = await db
      .insert(users)
      .values({
        name: generatedName,
        displayName: generatedName,
        email,
        role: "customer",
        lastLoginAt: new Date(),
      })
      .returning();

    if (userRow?.id && sub) {
      try {
        await db.execute(drizzleSql`update users set auth0_sub = ${sub} where id = ${userRow.id}`);
      } catch {
        // Ignore if users.auth0_sub is unavailable in this environment.
      }
    }
  }

  if (userRow && opts?.createIfMissing && preferredName) {
    const currentName = typeof userRow.name === "string" ? userRow.name.trim() : "";
    const currentDisplayName =
      typeof userRow.displayName === "string" ? userRow.displayName.trim() : "";
    const preferredNameNormalized = preferredName.toLowerCase();
    const vendorBusinessNameNormalized = vendorBusinessName?.trim().toLowerCase() || "";
    const currentNameNormalized = currentName.toLowerCase();
    const currentDisplayNameNormalized = currentDisplayName.toLowerCase();
    const currentLooksLikeVendorBusiness =
      !!vendorBusinessNameNormalized &&
      (currentNameNormalized === vendorBusinessNameNormalized ||
        currentDisplayNameNormalized === vendorBusinessNameNormalized);

    const shouldRepairName =
      isMachineGeneratedCustomerName(currentName) ||
      (currentLooksLikeVendorBusiness && currentNameNormalized !== preferredNameNormalized);
    const shouldRepairDisplayName =
      isMachineGeneratedCustomerName(currentDisplayName) ||
      (currentLooksLikeVendorBusiness && currentDisplayNameNormalized !== preferredNameNormalized);

    if (shouldRepairName || shouldRepairDisplayName) {
      const [updatedRow] = await db
        .update(users)
        .set({
          name: shouldRepairName ? preferredName : userRow.name,
          displayName: shouldRepairDisplayName ? preferredName : userRow.displayName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRow.id))
        .returning();

      if (updatedRow) {
        userRow = updatedRow;
      }
    }
  }

  if (!userRow) return null;

  return {
    id: userRow.id,
    email: userRow.email,
    type: userRow.role === "admin" ? "admin" : "customer",
  };
}

function detectUploadedImageFormat(buffer: Buffer): "jpg" | "png" | "webp" | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

function decodeImageDataUrlToBuffer(dataUrl: string): Buffer | null {
  if (typeof dataUrl !== "string") return null;
  const trimmed = dataUrl.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;

  try {
    const base64 = match[2].replace(/\s+/g, "");
    const buffer = Buffer.from(base64, "base64");
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

async function persistUploadedImage(buffer: Buffer, dir: string): Promise<{ filename: string; format: "jpg" | "png" | "webp" }> {
  const format = detectUploadedImageFormat(buffer);
  if (!format) {
    throw new Error("Unsupported file content. Upload JPG, PNG, or WebP.");
  }

  const contentTypeMap = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
  const folder = path.basename(dir) as UploadFolder;
  const key = makeObjectKey(folder, `image.${format}`);
  const filename = key.split("/").pop()!;

  if (!isObjectStorageConfigured() && process.env.NODE_ENV !== "production") {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), buffer);
    return { filename, format };
  }

  await uploadBufferToObjectStorage({ buffer, key, contentType: contentTypeMap[format] });

  // Return just the base filename so callers can build /uploads/<folder>/<filename> as before
  return { filename, format };
}

/** Fire-and-forget helper: send booking cancelled emails to both parties. */
async function sendCancellationEmailsAsync(params: {
  booking: {
    id: string;
    customerEmail: string;
    customerName: string;
    vendorEmail: string;
    vendorName: string;
    eventDate: string;
    listingTitle: string;
    totalAmount: number;
  };
  refundCents: number;
  serverUrl: string;
}): Promise<void> {
  const { booking, refundCents, serverUrl } = params;
  try {
    const tasks: Promise<any>[] = [];
    if (booking.customerEmail) {
      tasks.push(
        sendBookingCancelledEmail(booking.customerEmail, {
          recipientName: booking.customerName || "Customer",
          counterpartName: booking.vendorName || "Vendor",
          eventDate: booking.eventDate,
          listingTitle: booking.listingTitle || "Service",
          role: "customer",
          cancelledBy: "customer",
          totalAmountCents: booking.totalAmount,
          refundAmountCents: refundCents,
          serverUrl,
        })
      );
    }
    if (booking.vendorEmail) {
      tasks.push(
        sendBookingCancelledEmail(booking.vendorEmail, {
          recipientName: booking.vendorName || "Vendor",
          counterpartName: booking.customerName || "Customer",
          eventDate: booking.eventDate,
          listingTitle: booking.listingTitle || "Service",
          role: "vendor",
          cancelledBy: "customer",
          serverUrl,
        })
      );
    }
    await Promise.allSettled(tasks);
  } catch (err: any) {
    logger.warn("[cancel email] failed:", err?.message || err);
  }
}

function formatCentsAsDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Drizzle's sql template doesn't serialize JS arrays to PostgreSQL text[]
// format. Convert explicitly: ['a','b'] → '{"a","b"}'
function toPgTextArray(arr: string[]): string {
  if (arr.length === 0) return '{}';
  return `{${arr.map(s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',')}}`;
}

async function allocateUniqueVendorSlug(name: string, excludeId?: string): Promise<string> {
  const base = deriveVendorSlug(name);
  let candidate = base || "vendor";
  let suffix = 2;
  while (true) {
    const [existing] = await db
      .select({ id: vendorAccounts.id })
      .from(vendorAccounts)
      .where(and(eq(vendorAccounts.shopSlug, candidate), isNull(vendorAccounts.deletedAt)))
      .limit(1);
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // --- Listing photo uploads (local disk) ---
  const listingUploadsDir = path.join(process.cwd(), "server/uploads/listings");
  const vendorShopUploadsDir = path.join(process.cwd(), "server/uploads/vendor-shops");

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
        WHERE p.payment_type IN ('security_deposit', 'deposit')
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
          // PDFs bypass image processing — store raw
          const ext = "pdf";
          const key = `disputes/${crypto.randomUUID()}.${ext}`;
          const result = await uploadBufferToObjectStorage({ buffer: fileBuffer, key, contentType: "application/pdf" });
          url = result.url;
          if (!url.startsWith("http")) {
            // object storage not configured — fall back to local
            const fs = await import("fs");
            const localDir = disputeUploadsDir;
            if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
            const filename = `${crypto.randomUUID()}.pdf`;
            fs.writeFileSync(path.join(localDir, filename), fileBuffer);
            url = `/uploads/disputes/${filename}`;
          }
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
  app.get("/api/locations/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q || q.length < 2) return res.json([]);

      const biasLat = parseFloat(String(req.query.bias_lat || ""));
      const biasLng = parseFloat(String(req.query.bias_lng || ""));
      const hasBias = Number.isFinite(biasLat) && Number.isFinite(biasLng);

      // Nominatim (OpenStreetMap) — free, no API key required.
      // Usage policy: max 1 req/s, valid User-Agent with contact info.
      // viewbox biases results toward the user's region; bounded=0 keeps global fallback.
      const viewboxParam = hasBias
        ? `&viewbox=${biasLng - 2},${biasLat + 1.5},${biasLng + 2},${biasLat - 1.5}&bounded=0`
        : "";
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5${viewboxParam}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent": "EventHub/1.0 (eventhubglobal@gmail.com)",
          "Accept-Language": "en",
        },
      });

      if (!response.ok) {
        throw new Error(`Nominatim responded with status ${response.status}`);
      }

      const data: any[] = await response.json();

      const results = data.map((f) => {
        const addr = f.address ?? {};
        const houseNumber = (addr.house_number ?? "").trim();
        const road = (addr.road ?? addr.pedestrian ?? addr.path ?? "").trim();
        const street = houseNumber && road ? `${houseNumber} ${road}` : road || houseNumber;
        // Nominatim city may appear under several keys depending on place type.
        const city =
          addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? addr.hamlet ?? "";
        return {
          id: `nominatim-${f.place_id}`,
          label: f.display_name,
          lat: parseFloat(f.lat),
          lng: parseFloat(f.lon),
          street: street || undefined,
          city: city || undefined,
          state: addr.state || undefined,
          postalCode: addr.postcode || undefined,
          country: addr.country_code?.toUpperCase() || undefined,
        };
      });

      return res.json(results);
    } catch (err: any) {
      logRouteError("/api/locations/search", err);
      return res.status(500).json({ error: "Location search failed" });
    }
  });

  // Update current vendor account (protected route)
  const updateVendorMeSchema = z.object({
    businessName: z.string().min(1).max(100).optional(),
  });

  /**
   * PATCH /api/vendor/me  ✅ Auth0-only
   */
  app.patch("/api/vendor/me", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const parsed = updateVendorMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const updates = parsed.data;
      if (!updates.businessName) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const newBusinessName = updates.businessName.trim();

      // Enforce unique business name (exclude this vendor's own row).
      const [nameTaken] = await db
        .select({ id: vendorAccounts.id })
        .from(vendorAccounts)
        .where(and(drizzleSql`lower(${vendorAccounts.businessName}) = lower(${newBusinessName})`, isNull(vendorAccounts.deletedAt), ne(vendorAccounts.id, vendorAuth.id)))
        .limit(1);
      if (nameTaken) {
        return res.status(409).json({ error: "A vendor with this business name already exists.", code: "business_name_taken" });
      }

      const newSlug = await allocateUniqueVendorSlug(newBusinessName, vendorAuth.id);

      await db
        .update(vendorAccounts)
        .set({ businessName: newBusinessName, shopSlug: newSlug })
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const accounts = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const account = accounts[0];
      (req as any).vendorAccount = account;
      const profileContext = await resolveActiveVendorProfile(req);
      const profile = profileContext?.activeProfile;

            // ---- Seed listing defaults from vendor profile (so new listings are valid-by-default) ----
      const profileAddress = String((profile as any)?.address || "").trim();
      const profileCity = String((profile as any)?.city || "").trim();
      const profileState = String((profile as any)?.state || "").trim();
      const profileZip = String((profile as any)?.zipCode || (profile as any)?.postalCode || "").trim();

      const radius =
        Number((profile as any)?.serviceRadius ?? 25) || 25;

      // Build a geocode query (best-effort)
      const geoQ = [profileAddress, profileCity, profileState, profileZip].filter(Boolean).join(", ").trim();

      let seededLocation: any = null;
      if (geoQ) {
        try {
          const geoRes = await fetch(`http://127.0.0.1:5001/api/locations/search?q=${encodeURIComponent(geoQ)}`);
          if (geoRes.ok) {
            const results: any[] = await geoRes.json();
            if (results?.[0]) seededLocation = results[0];
          }
        } catch {
          // ignore geocode failures; listing can be edited later
        }
      }

      res.json({
        id: account.id,
        email: account.email,
        businessName: profile ? getProfileDisplayName(profile, account.businessName) : account.businessName,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        profileComplete: Boolean(profile),
        profileId: profile?.id || null,
        activeProfileId: profileContext?.activeProfileId ?? null,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  /**
   * GET /api/vendor/me ✅ Auth0-only
   */
  app.get("/api/vendor/me", ...requireVendorAuth0, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Vary", "Authorization");
    res.setHeader("ETag", `vendor-me-${Date.now()}`);
    res.setHeader("Last-Modified", new Date().toUTCString());

    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }
      const account = context.account;
      const activeProfile = context.activeProfile;
      const activeProfileName = activeProfile ? getProfileDisplayName(activeProfile, account.businessName) : null;
      const hasVendorAccount = Boolean(account?.id);
      const hasAnyVendorProfiles = context.profiles.length > 0;
      const hasActiveVendorProfile = Boolean(
        context.activeProfileId && context.profiles.some((profile) => profile.id === context.activeProfileId)
      );
      const needsNewVendorProfileOnboarding = hasVendorAccount && !hasAnyVendorProfiles;

      res.json({
        id: account.id,
        email: account.email,
        businessName: activeProfileName || account.businessName,
        accountBusinessName: account.businessName,
        ownerFirstName: account.ownerFirstName ?? null,
        ownerLastName: account.ownerLastName ?? null,
        ownerPhone: account.ownerPhone ?? null,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        profileComplete: context.profiles.length > 0,
        profileId: activeProfile?.id || null,
        activeProfileId: context.activeProfileId,
        profileName: activeProfileName,
        operatingTimezone: normalizeIanaTimeZone(activeProfile?.operatingTimezone),
        googleConnectionStatus: account.googleConnectionStatus,
        googleCalendarId: account.googleCalendarId,
        googleAccountEmail: account.googleAccountEmail ?? null,
        hasVendorAccount,
        hasAnyVendorProfiles,
        hasActiveVendorProfile,
        needsNewVendorProfileOnboarding,
        shopActive: account.shopActive ?? true,
        shopSlug: account.shopSlug || null,
        __marker: "vendor_me_route_hit",
      });
    } catch (error: any) {
      logRouteError("/api/vendor/me", error);
      res.status(500).json({ error: "Unable to load vendor account" });
    }
  });

  /**
   * POST /api/vendor/me/delete ✅ Auth0-only
   * Final account exit while preserving historical booking/payment integrity.
   */
  app.post("/api/vendor/me/delete", onboardingRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth as { id: string };

      const accountRows = await db
        .select({
          id: vendorAccounts.id,
          deletedAt: vendorAccounts.deletedAt,
          userId: vendorAccounts.userId,
        })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id))
        .limit(1);
      const account = accountRows[0];
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }
      if (account.deletedAt) {
        return res.json({
          accountId: vendorAuth.id,
          deleted: true,
          alreadyDeleted: true,
        });
      }

      // Stop all Google Calendar watch channels before account data is wiped (non-fatal)
      try {
        await stopAllGoogleCalendarWatchChannelsForVendor(vendorAuth.id);
      } catch (watchErr) {
        logRouteError("/api/vendor/me/delete stop-watch-channels", watchErr);
      }

      const now = new Date();
      const obfuscatedEmail = `deleted+${vendorAuth.id}@eventhub.deleted`;

      const inactivatedListings = await db
        .update(vendorListings)
        .set({ status: "inactive", updatedAt: now })
        .where(
          and(
            eq(vendorListings.accountId, vendorAuth.id),
            or(eq(vendorListings.status, "active"), eq(vendorListings.status, "draft"))
          )
        )
        .returning({ id: vendorListings.id });

      const deactivatedProfiles = await db
        .update(vendorProfiles)
        .set({ active: false, deactivatedAt: now, updatedAt: now })
        .where(and(eq(vendorProfiles.accountId, vendorAuth.id), eq(vendorProfiles.active, true)))
        .returning({ id: vendorProfiles.id });

      // Downgrade the linked user's role back to 'customer' before we null userId.
      // Admin accounts are never downgraded.
      if (account.userId) {
        await db
          .update(users)
          .set({ role: "customer" as const })
          .where(
            and(
              eq(users.id, account.userId),
              drizzleSql`${users.role} <> 'admin'`
            )
          );
      }

      await db
        .update(vendorAccounts)
        .set({
          active: false,
          deletedAt: now,
          email: obfuscatedEmail,
          auth0Sub: null,
          userId: null,
          businessName: `Deleted Vendor ${vendorAuth.id.slice(0, 8)}`,
          stripeConnectId: null,
          stripeAccountType: null,
          stripeOnboardingComplete: false,
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiresAt: null,
          googleCalendarId: null,
          googleConnectionStatus: "disconnected",
          activeProfileId: null,
        })
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const [preservedBookingsResult] = await db
        .select({ count: count() })
        .from(bookings)
        .where(eq(bookings.vendorAccountId, vendorAuth.id));

      return res.json({
        accountId: vendorAuth.id,
        deleted: true,
        listingsInactivated: inactivatedListings.length,
        profilesDeactivated: deactivatedProfiles.length,
        preservedHistoricalBookings: Number(preservedBookingsResult?.count || 0),
      });
    } catch (error: any) {
      logRouteError("/api/vendor/me/delete", error);
      return res.status(500).json({ error: "Unable to delete vendor account" });
    }
  });

  const CUSTOMER_PROFILE_PHOTO_KEY = "_profilePhotoDataUrl";
  const CUSTOMER_PROFILE_PHOTO_DATA_URL_REGEX = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

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

  app.get("/api/customer/me", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const userAccounts = await db.select().from(users).where(eq(users.id, customerAuth.id));

      if (userAccounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const user = userAccounts[0];
      const { defaultLocation, profilePhotoDataUrl } = splitCustomerDefaultLocation(user.defaultLocation);
      const responseEmail =
        normalizeIdentityEmailCandidate(customerAuth.email) ||
        user.email;

      res.json({
        id: user.id,
        name: user.name,
        displayName: user.displayName ?? null,
        profilePhotoDataUrl,
        email: responseEmail,
        role: user.role,
        defaultLocation,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      logRouteError("/api/customer/me", error);
      res.status(500).json({ error: "Unable to load account" });
    }
  });

  const updateCustomerMeSchema = z.object({
    displayName: z.string().trim().min(1).max(120).optional(),
    profilePhotoDataUrl: z
      .string()
      .trim()
      .max(3000000)
      .refine((value) => CUSTOMER_PROFILE_PHOTO_DATA_URL_REGEX.test(value), "Invalid profile photo format")
      .nullable()
      .optional(),
    defaultLocation: z
      .object({
        label: z.string().min(1),
        streetAddress: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .nullable()
      .optional(),
  });

  app.patch("/api/customer/me", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const data = updateCustomerMeSchema.parse(req.body ?? {});
      const existingAccounts = await db.select().from(users).where(eq(users.id, customerAuth.id)).limit(1);
      if (existingAccounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const existing = existingAccounts[0];
      const existingSplit = splitCustomerDefaultLocation(existing.defaultLocation);

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (Object.prototype.hasOwnProperty.call(data, "displayName")) {
        updates.displayName = data.displayName;
      }

      const hasDefaultLocationUpdate = Object.prototype.hasOwnProperty.call(data, "defaultLocation");
      const hasProfilePhotoUpdate = Object.prototype.hasOwnProperty.call(data, "profilePhotoDataUrl");
      if (hasDefaultLocationUpdate || hasProfilePhotoUpdate) {
        const nextDefaultLocation = hasDefaultLocationUpdate
          ? (data.defaultLocation ? ({ ...data.defaultLocation } as Record<string, unknown>) : null)
          : existingSplit.defaultLocation;
        const nextProfilePhotoDataUrl = hasProfilePhotoUpdate
          ? (typeof data.profilePhotoDataUrl === "string" ? data.profilePhotoDataUrl.trim() : null)
          : existingSplit.profilePhotoDataUrl;
        updates.defaultLocation = composeCustomerDefaultLocation(nextDefaultLocation, nextProfilePhotoDataUrl);
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, customerAuth.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Account not found" });
      }
      const { defaultLocation, profilePhotoDataUrl } = splitCustomerDefaultLocation(updated.defaultLocation);

      return res.json({
        id: updated.id,
        name: updated.name,
        displayName: updated.displayName ?? null,
        profilePhotoDataUrl,
        email: updated.email,
        role: updated.role,
        defaultLocation,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Invalid payload" });
    }
  });

  /**
   * PATCH /api/user/language
   * Saves the user's preferred language to their profile.
   * Works for both customer and vendor accounts (both have a users row).
   * Unauthenticated callers are silently ignored — language preference falls
   * back to localStorage on the client.
   */
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

  /**
   * GET /api/users/me/location
   * Returns the authenticated user's saved location preference.
   * Works for both customers and vendors.
   */
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

  /**
   * PUT /api/users/me/location
   * Saves the authenticated user's location preference.
   * Works for both customers and vendors. Preserves existing profile photo data.
   * Unauthenticated callers are silently ignored — location falls back to localStorage.
   */
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

  /**
   * POST /api/customer/me/delete
   * Cancels all active bookings for the customer, then anonymises the account.
   * Booking records are preserved for vendor history — customer_id is SET NULL
   * by the DB FK after the row is deleted, so vendors still see the booking
   * but without personal customer data attached.
   */
  app.post("/api/customer/me/delete", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const userRows = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, customerAuth.id))
        .limit(1);
      const user = userRows[0];
      if (!user?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const now = new Date();

      // Cancel all pending or confirmed bookings. The booking must have a
      // payment that has succeeded before a vendor sees it, so pending-only
      // bookings are safe to cancel without a refund flow here.
      const cancelledBookings = await db
        .update(bookings)
        .set({
          status: "cancelled",
          cancellationReason: "customer_account_deleted",
          cancelledAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookings.customerId, user.id),
            drizzleSql`${bookings.status} in ('pending', 'confirmed')`
          )
        )
        .returning({ id: bookings.id });

      // Delete this customer's notifications (no FK constraint means they'd
      // otherwise become orphaned rows after the user row is removed).
      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.recipientId, user.id),
            eq(notifications.recipientType, "customer")
          )
        );

      // Delete the user row. Planning boards are deleted by CASCADE.
      // bookings.customer_id and payments.customer_id are SET NULL by FK.
      await db
        .delete(users)
        .where(eq(users.id, user.id));

      return res.json({
        deleted: true,
        bookingsCancelled: cancelledBookings.length,
      });
    } catch (error: any) {
      logRouteError("/api/customer/me/delete", error);
      return res.status(500).json({ error: "Unable to delete account" });
    }
  });

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

  const ALL_VENDOR_TYPES = [
    "venue",
    "photography",
    "videography",
    "dj",
    "florist",
    "catering",
    "planner",
    "hair-styling",
    "prop-decor",
  ] as const;

  const ENABLED_VENDOR_TYPES = ["prop-decor"] as const;

  // Complete vendor onboarding (already Auth0)
  const completeOnboardingSchema = z.object({
    vendorType: z.enum(ENABLED_VENDOR_TYPES),
    businessName: z.string().min(2),
    operatingTimezone: z.string().min(1).max(120).optional(),

    // Owner personal details
    ownerFirstName: z.string().max(100).optional(),
    ownerLastName: z.string().max(100).optional(),
    ownerPhone: z.string().max(30).optional(),

    streetAddress: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),

    businessPhone: z.string().min(1),
    businessEmail: z.string().email(),
    showBusinessPhoneToCustomers: z.boolean().optional(),
    showBusinessEmailToCustomers: z.boolean().optional(),
    showBusinessAddressToCustomers: z.boolean().optional(),
    aboutVendor: z.string().optional(),
    aboutBusiness: z.string().optional(),
    shopTagline: z.string().optional(),
    inBusinessSinceYear: z.string().optional(),
    specialties: z.string().optional(),
    eventsServedBaseline: z.string().optional(),
    hobbies: z.string().optional(),
    homeState: z.string().optional(),
    funFacts: z.string().optional(),
    shopProfilePhotoDataUrl: z.string().trim().max(3000000).optional(),
    shopCoverPhotoDataUrl: z.string().trim().max(3000000).optional(),

    homeBaseLocation: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),

    createNewProfile: z.boolean().optional(),
  });

  app.post("/api/vendor/onboarding/complete", onboardingRateLimiter, requireAuth0, async (req, res) => {
    try {
      const customerAuth = (req as any).customerAuth;
      const vendorAuth = (req as any).vendorAuth;
      const auth0 = (req as any).auth0 as { sub: string; email?: string } | undefined;

      const onboardingData = completeOnboardingSchema.parse(req.body);
      const normalizedProfileName = normalizeProfileNameText(onboardingData.businessName, 120);
      if (normalizedProfileName.length < 2) {
        return res.status(400).json({
          error: "Business profile name is invalid. Use letters, numbers, spaces, apostrophes, and ampersands only.",
        });
      }

      const rawEmail = auth0?.email;
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
      const auth0Sub = auth0?.sub;

      if (!email) {
        return res.status(400).json({ error: "Auth0 email is required for onboarding" });
      }

      const vendorResolution = await resolveVendorAccountForAuth0Identity({
        auth0Sub,
        email,
        context: "/api/vendor/onboarding/complete",
      });
      let account = vendorResolution.account;

      // Treat deleted accounts as non-existent — re-registration gets a fresh start.
      if (account?.deletedAt) {
        account = null;
      }

      if (!account) {
        // Before inserting, check if an account already exists for this email (auth0Sub conflict
        // case — user previously signed up with a different provider). Since Auth0 has already
        // verified the user owns this email, it is safe to adopt the existing account and heal
        // the auth0Sub so future lookups resolve correctly.
        const [existingByEmail] = await db
          .select()
          .from(vendorAccounts)
          .where(and(drizzleSql`lower(${vendorAccounts.email}) = ${email}`, isNull(vendorAccounts.deletedAt)))
          .limit(1);

        if (existingByEmail) {
          const [healed] = await db
            .update(vendorAccounts)
            .set({ auth0Sub })
            .where(eq(vendorAccounts.id, existingByEmail.id))
            .returning();
          account = healed;
          logger.info(`[onboarding] healed auth0Sub conflict for account ${existingByEmail.id} (email match)`);
        } else {
          // Enforce unique business name across active vendors.
          const [nameTaken] = await db
            .select({ id: vendorAccounts.id })
            .from(vendorAccounts)
            .where(and(drizzleSql`lower(${vendorAccounts.businessName}) = lower(${normalizedProfileName})`, isNull(vendorAccounts.deletedAt)))
            .limit(1);
          if (nameTaken) {
            return res.status(409).json({ error: "A vendor with this business name already exists.", code: "business_name_taken" });
          }

          const shopSlug = await allocateUniqueVendorSlug(normalizedProfileName);
          const [created] = await db
            .insert(vendorAccounts)
            .values({
              email,
              auth0Sub,
              userId: vendorResolution.resolvedUserId || undefined,
              businessName: normalizedProfileName,
              shopSlug,
              profileComplete: false,
            })
            .returning();
          account = created;
        }
      } else {
        const currentBusinessName = asTrimmedString(account.businessName);
        const nameIsChanging = !currentBusinessName;
        if (nameIsChanging) {
          // Enforce unique business name when setting for the first time.
          const [nameTaken] = await db
            .select({ id: vendorAccounts.id })
            .from(vendorAccounts)
            .where(and(drizzleSql`lower(${vendorAccounts.businessName}) = lower(${normalizedProfileName})`, isNull(vendorAccounts.deletedAt), ne(vendorAccounts.id, account.id)))
            .limit(1);
          if (nameTaken) {
            return res.status(409).json({ error: "A vendor with this business name already exists.", code: "business_name_taken" });
          }
        }
        const newSlug = nameIsChanging ? await allocateUniqueVendorSlug(normalizedProfileName, account.id) : undefined;
        const [updated] = await db
          .update(vendorAccounts)
          .set({
            businessName: currentBusinessName || normalizedProfileName,
            ...(newSlug ? { shopSlug: newSlug } : {}),
          })
          .where(eq(vendorAccounts.id, account.id))
          .returning();

        account = updated;
      }

      // Store owner personal details on the vendor account.
      // These are used when a vendor books another vendor so they are identified
      // by their real name rather than their business name.
      const ownerFirstName = asTrimmedString(onboardingData.ownerFirstName) || null;
      const ownerLastName  = asTrimmedString(onboardingData.ownerLastName)  || null;
      const ownerPhone     = asTrimmedString(onboardingData.ownerPhone)     || null;
      await db
        .update(vendorAccounts)
        .set({ ownerFirstName, ownerLastName, ownerPhone })
        .where(eq(vendorAccounts.id, account.id));

      const existingProfiles = await db.select().from(vendorProfiles).where(and(eq(vendorProfiles.accountId, account.id), eq(vendorProfiles.active, true)));
      const existingActiveProfile =
        existingProfiles.find((candidate) => candidate.id === account.activeProfileId) || existingProfiles[0] || null;
      // Prefer timezone derived from the verified business address coords (most accurate).
      // Fall back to the browser-reported timezone sent from the client, then the existing
      // profile value. This means a vendor's operating_timezone always reflects their
      // actual business location rather than wherever their browser happened to be.
      const coordDerivedTimezone =
        onboardingData.homeBaseLocation?.lat != null &&
        onboardingData.homeBaseLocation?.lng != null
          ? timezoneFromCoords(onboardingData.homeBaseLocation.lat, onboardingData.homeBaseLocation.lng)
          : null;
      const resolvedOperatingTimezone = normalizeIanaTimeZone(
        coordDerivedTimezone || onboardingData.operatingTimezone,
        existingActiveProfile?.operatingTimezone
      );

      const address = [
        onboardingData.streetAddress,
        onboardingData.city,
        onboardingData.state,
        onboardingData.zipCode,
      ]
        .filter(Boolean)
        .join(", ");

      const aboutVendor = asTrimmedString(onboardingData.aboutVendor);
      const aboutBusiness = asTrimmedString(onboardingData.aboutBusiness);
      const shopTagline = asTrimmedString(onboardingData.shopTagline);
      const inBusinessSinceYear = asTrimmedString(onboardingData.inBusinessSinceYear).replace(/[^\d]/g, "").slice(0, 4);
      const specialties = normalizeSpecialties(onboardingData.specialties);
      const eventsServedBaseline = toNonNegativeInt(onboardingData.eventsServedBaseline, 0);
      const hobbies = serializeHobbyList(onboardingData.hobbies);
      const homeState = asTrimmedString(onboardingData.homeState);
      const funFacts = asTrimmedString(onboardingData.funFacts);
      const existingOnlineProfiles =
        existingActiveProfile?.onlineProfiles &&
        typeof existingActiveProfile.onlineProfiles === "object" &&
        !Array.isArray(existingActiveProfile.onlineProfiles)
          ? (existingActiveProfile.onlineProfiles as Record<string, unknown>)
          : {};
      const existingShopProfileImageUrl = asTrimmedString((existingOnlineProfiles as any).shopProfileImageUrl);
      const existingShopCoverImageUrl = asTrimmedString((existingOnlineProfiles as any).shopCoverImageUrl);
      const existingCoverPhotoPosition =
        normalizePhotoPosition((existingOnlineProfiles as any).shopCoverImagePosition) || { x: 0, y: 0 };
      const shopProfilePhotoDataUrl = asTrimmedString(onboardingData.shopProfilePhotoDataUrl);
      const shopCoverPhotoDataUrl = asTrimmedString(onboardingData.shopCoverPhotoDataUrl);
      let shopProfileImageUrl = existingShopProfileImageUrl || "";
      let shopCoverImageUrl = existingShopCoverImageUrl || "";
      let shopCoverImagePosition = existingCoverPhotoPosition;

      if (shopProfilePhotoDataUrl) {
        const profileBuffer = decodeImageDataUrlToBuffer(shopProfilePhotoDataUrl);
        if (!profileBuffer) {
          return res.status(400).json({ error: "Invalid profile photo format." });
        }
        try {
          const persistedProfilePhoto = await persistUploadedImage(profileBuffer, vendorShopUploadsDir);
          shopProfileImageUrl = `/uploads/vendor-shops/${persistedProfilePhoto.filename}`;
        } catch (uploadError: any) {
          logger.error({ err: uploadError }, "[onboarding/complete] profile photo upload failed");
          return res.status(500).json({
            error: "Failed to save profile photo. Please remove the photo and try again, or contact support.",
            detail: uploadError?.message || "Upload failed",
          });
        }
      }

      if (shopCoverPhotoDataUrl) {
        const coverBuffer = decodeImageDataUrlToBuffer(shopCoverPhotoDataUrl);
        if (!coverBuffer) {
          return res.status(400).json({ error: "Invalid cover photo format." });
        }
        try {
          const persistedCoverPhoto = await persistUploadedImage(coverBuffer, vendorShopUploadsDir);
          shopCoverImageUrl = `/uploads/vendor-shops/${persistedCoverPhoto.filename}`;
          shopCoverImagePosition = { x: 0, y: 0 };
        } catch (uploadError: any) {
          logger.error("[onboarding/complete] cover photo upload failed:", uploadError?.message || uploadError);
          return res.status(500).json({
            error: "Failed to save cover photo. Please remove the photo and try again, or contact support.",
            detail: uploadError?.message || "Upload failed",
          });
        }
      }
      const showBusinessPhoneToCustomers = Boolean(onboardingData.showBusinessPhoneToCustomers);
      const showBusinessEmailToCustomers = Boolean(onboardingData.showBusinessEmailToCustomers);
      const showBusinessAddressToCustomers = Boolean(onboardingData.showBusinessAddressToCustomers);

      const profilePayload = {
        accountId: account.id,
        profileName: normalizedProfileName,
        businessPhone: onboardingData.businessPhone,
        businessEmail: onboardingData.businessEmail,
        businessAddressLabel: address,
        businessStreet: onboardingData.streetAddress,
        businessCity: onboardingData.city,
        businessState: onboardingData.state,
        businessZip: onboardingData.zipCode,
        homeBaseLat: onboardingData.homeBaseLocation?.lat ?? null,
        homeBaseLng: onboardingData.homeBaseLocation?.lng ?? null,
        operatingTimezone: resolvedOperatingTimezone,
        showBusinessPhoneToCustomers,
        showBusinessEmailToCustomers,
        showBusinessAddressToCustomers,
        aboutVendor: aboutVendor || null,
        aboutBusiness: aboutBusiness || null,
        experience: 0,
        qualifications: [] as string[],
        onlineProfiles: {
          profileBusinessName: normalizedProfileName,
          businessPhone: onboardingData.businessPhone,
          businessEmail: onboardingData.businessEmail,
          streetAddress: onboardingData.streetAddress,
          city: onboardingData.city,
          state: onboardingData.state,
          zipCode: onboardingData.zipCode,
          showBusinessPhoneToCustomers,
          showBusinessEmailToCustomers,
          showBusinessAddressToCustomers,
          aboutOwner: aboutVendor || null,
          aboutBusiness: aboutBusiness || null,
          shopTagline: shopTagline || null,
          inBusinessSinceYear: inBusinessSinceYear || null,
          specialties,
          eventsServedBaseline,
          hobbies: hobbies || null,
          homeState: homeState || null,
          funFacts: funFacts || null,
          shopProfileImageUrl: shopProfileImageUrl || null,
          shopCoverImageUrl: shopCoverImageUrl || null,
          shopCoverImagePosition: shopCoverImageUrl ? shopCoverImagePosition : null,
          operatingTimezone: resolvedOperatingTimezone,

          // for LocationPicker autofill later
          homeBaseLocation: onboardingData.homeBaseLocation ?? null,

          // optional: store a “marketLocation” label so LocationPicker can show something even if we only have text
          marketLocation: {
            id: "onboarding-address",
            label: address,
            lat: onboardingData.homeBaseLocation?.lat ?? null,
            lng: onboardingData.homeBaseLocation?.lng ?? null,
          },
        },

        address,
        city: onboardingData.city,
        travelMode: "included",
        serviceRadius: null,
        serviceAddress: address,
        photos: [],
        serviceDescription: aboutBusiness || "",
      };

      let profile;
      const createNewProfile = Boolean(onboardingData.createNewProfile);
      if (existingProfiles.length > 0 && !createNewProfile) {
        const current =
          existingProfiles.find((candidate) => candidate.id === account.activeProfileId) || existingProfiles[0];
        const [updatedProfile] = await db
          .update(vendorProfiles)
          .set({
            ...profilePayload,
            updatedAt: new Date(),
          })
          .where(eq(vendorProfiles.id, current.id))
          .returning();

        profile = updatedProfile;
      } else {
        const [createdProfile] = await db.insert(vendorProfiles).values(profilePayload).returning();
        profile = createdProfile;
      }

      await db
        .update(vendorAccounts)
        .set({
          profileComplete: true,
          activeProfileId: profile.id,
        })
        .where(eq(vendorAccounts.id, account.id));

      // Sync users.role → 'vendor'. Matches by auth0_sub first, then email.
      // Admin accounts are never downgraded.
      if (auth0Sub || email) {
        await db
          .update(users)
          .set({ role: "vendor" as const })
          .where(
            and(
              or(
                ...(auth0Sub ? [eq(users.auth0Sub, auth0Sub)] : []),
                ...(email    ? [drizzleSql`lower(${users.email}) = ${email}`] : [])
              ),
              drizzleSql`${users.role} <> 'admin'`
            )
          );
      }

      const isUpgrade = Boolean(customerAuth || vendorAuth);

      // Fire-and-forget: send vendor welcome email (first-time onboarding only)
      const isFirstTimeOnboarding = existingProfiles.length === 0;
      if (account.email && isFirstTimeOnboarding) {
        void (async () => {
          try {
            const serverUrl = appUrl();
            await sendVendorWelcomeEmail(account.email!, {
              recipientName: account.businessName || "Vendor",
              businessName: account.businessName || "Your Business",
              serverUrl,
            });
          } catch (emailError: any) {
            logger.warn("[vendor welcome email] failed:", emailError?.message || emailError);
          }
        })();
      }

      return res.json({
        vendorAccountId: account.id,
        profileId: profile.id,
        activeProfileId: profile.id,
        isUpgrade,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return respondWithInternalServerError(req, res, error);
    }
  });

  const updateVendorProfileSchema = z
    .object({
      profileName: z.string().min(2).max(120).optional(),
      experience: z.number().int().optional(),
      qualifications: z.array(z.string()).optional(),
      onlineProfiles: z.any().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      travelMode: z.string().optional(),
      serviceRadius: z.number().nullable().optional(),
      serviceAddress: z.string().nullable().optional(),
      operatingTimezone: z.string().optional(),
      photos: z.array(z.string()).optional(),
      serviceDescription: z.string().optional(),
    })
    .passthrough();

    /**
   * GET /api/vendor/profile ✅ Auth0-only
   * Returns the current vendor's profile (created during onboarding)
   */
  app.get("/api/vendor/profile", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const context = await resolveActiveVendorProfile(req);
      if (!context?.activeProfile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const existingProfile = context.activeProfile;
      const onlineRaw = existingProfile.onlineProfiles;
      const onlineProfiles =
        onlineRaw && typeof onlineRaw === "object" && !Array.isArray(onlineRaw)
          ? ({ ...(onlineRaw as Record<string, unknown>) } as Record<string, unknown>)
          : ({} as Record<string, unknown>);

      let didBackfill = false;

      const fallbackEmail = asTrimmedString(vendorAuth?.email);
      if (!asTrimmedString(onlineProfiles.businessEmail) && fallbackEmail) {
        onlineProfiles.businessEmail = fallbackEmail;
        didBackfill = true;
      }

      const fallbackProfileName = getProfileDisplayName(existingProfile, context.account?.businessName ?? "Vendor Profile");
      if (!asTrimmedString(onlineProfiles.profileBusinessName) && fallbackProfileName) {
        onlineProfiles.profileBusinessName = fallbackProfileName;
        didBackfill = true;
      }

      const marketLabel = asTrimmedString((onlineProfiles.marketLocation as any)?.label);
      const fallbackLabel =
        asTrimmedString(existingProfile.serviceAddress) ||
        asTrimmedString(existingProfile.address) ||
        marketLabel;
      const parsedAddress = fallbackLabel
        ? parseAddressLabel(fallbackLabel)
        : { streetAddress: "", city: "", state: "", zipCode: "" };

      if (!asTrimmedString(onlineProfiles.streetAddress) && parsedAddress.streetAddress) {
        onlineProfiles.streetAddress = parsedAddress.streetAddress;
        didBackfill = true;
      }

      if (!asTrimmedString(onlineProfiles.city) && parsedAddress.city) {
        onlineProfiles.city = parsedAddress.city;
        didBackfill = true;
      }

      if (!asTrimmedString(onlineProfiles.state) && parsedAddress.state) {
        onlineProfiles.state = parsedAddress.state;
        didBackfill = true;
      }

      if (!asTrimmedString(onlineProfiles.zipCode) && parsedAddress.zipCode) {
        onlineProfiles.zipCode = parsedAddress.zipCode;
        didBackfill = true;
      }

      if (didBackfill) {
        const normalizedProfileName = getProfileDisplayName(
          { ...existingProfile, onlineProfiles },
          context.account?.businessName ?? "Vendor Profile"
        );
        const [updatedProfile] = await db
          .update(vendorProfiles)
          .set({
            profileName: normalizedProfileName,
            onlineProfiles,
            updatedAt: new Date(),
          })
          .where(eq(vendorProfiles.id, existingProfile.id))
          .returning();

        return res.json({
          ...(updatedProfile ?? { ...existingProfile, profileName: normalizedProfileName, onlineProfiles }),
          activeProfileId: context.activeProfileId,
        });
      }

      return res.json({
        ...existingProfile,
        profileName: getProfileDisplayName(existingProfile, context.account?.businessName ?? "Vendor Profile"),
        onlineProfiles,
        activeProfileId: context.activeProfileId,
      });
    } catch (error: any) {
      logger.error("GET /api/vendor/profile failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  /**
   * PATCH /api/vendor/profile ✅ Auth0-only
   * Updates the current vendor's profile
   */
  app.patch("/api/vendor/profile", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.activeProfile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const existing = context.activeProfile;

      const parsed = updateVendorProfileSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }

      const payload = parsed.data as Record<string, unknown>;
      const updates: Record<string, unknown> = {};

      if (payload.profileName !== undefined) {
        const normalized = normalizeProfileNameText(payload.profileName, 120);
        if (!normalized || normalized.length < 2) {
          return res.status(400).json({
            error: "Validation failed",
            details: [{ message: "profileName is invalid. Use letters, numbers, spaces, apostrophes, and ampersands only." }],
          });
        }
        updates.profileName = normalized;
      }
      if (payload.experience !== undefined) updates.experience = payload.experience;
      if (payload.qualifications !== undefined) updates.qualifications = payload.qualifications;
      if (payload.address !== undefined) updates.address = payload.address;
      if (payload.city !== undefined) updates.city = payload.city;
      if (payload.travelMode !== undefined) updates.travelMode = payload.travelMode;
      if (payload.serviceRadius !== undefined) updates.serviceRadius = payload.serviceRadius;
      if (payload.serviceAddress !== undefined) updates.serviceAddress = payload.serviceAddress;
      if (payload.operatingTimezone !== undefined) {
        updates.operatingTimezone = normalizeIanaTimeZone(payload.operatingTimezone, existing.operatingTimezone);
      }
      if (payload.photos !== undefined) updates.photos = payload.photos;
      if (payload.serviceDescription !== undefined) updates.serviceDescription = payload.serviceDescription ?? "";

      if (payload.onlineProfiles !== undefined) {
        if (payload.onlineProfiles == null) {
          updates.onlineProfiles = null;
        } else if (typeof payload.onlineProfiles === "object" && !Array.isArray(payload.onlineProfiles)) {
          const existingOnlineProfiles =
            existing.onlineProfiles && typeof existing.onlineProfiles === "object" && !Array.isArray(existing.onlineProfiles)
              ? (existing.onlineProfiles as Record<string, unknown>)
              : {};
          updates.onlineProfiles = {
            ...existingOnlineProfiles,
            ...(payload.onlineProfiles as Record<string, unknown>),
          };

          if (updates.profileName && typeof updates.onlineProfiles === "object" && updates.onlineProfiles) {
            (updates.onlineProfiles as Record<string, unknown>).profileBusinessName = updates.profileName;
          }

          const incomingProfileNameRaw = (updates.onlineProfiles as Record<string, unknown>).profileBusinessName;
          if (incomingProfileNameRaw !== undefined) {
            const incomingProfileName = normalizeProfileNameText(incomingProfileNameRaw, 120);
            if (!incomingProfileName || incomingProfileName.length < 2) {
              return res.status(400).json({
                error: "Validation failed",
                details: [{ message: "profileBusinessName is invalid" }],
              });
            }
            (updates.onlineProfiles as Record<string, unknown>).profileBusinessName = incomingProfileName;
            if (!updates.profileName) {
              updates.profileName = incomingProfileName;
            }
          }

          const incomingHobbiesRaw = (updates.onlineProfiles as Record<string, unknown>).hobbies;
          if (incomingHobbiesRaw !== undefined) {
            const normalizedHobbies = serializeHobbyList(incomingHobbiesRaw);
            (updates.onlineProfiles as Record<string, unknown>).hobbies = normalizedHobbies || null;
          }
        } else {
          return res.status(400).json({
            error: "Validation failed",
            details: [{ message: "onlineProfiles must be an object" }],
          });
        }
      }

      if (updates.profileName && payload.onlineProfiles === undefined) {
        const existingOnlineProfiles =
          existing.onlineProfiles && typeof existing.onlineProfiles === "object" && !Array.isArray(existing.onlineProfiles)
            ? (existing.onlineProfiles as Record<string, unknown>)
            : {};
        updates.onlineProfiles = {
          ...existingOnlineProfiles,
          profileBusinessName: updates.profileName,
        };
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      // ── Circumvention detection ──────────────────────────────────────────────
      const vendorAuthForCircumvention = (req as any).vendorAuth;
      const vendorAccountIdForCircumvention = vendorAuthForCircumvention?.id
        ? String(vendorAuthForCircumvention.id)
        : null;

      const profileFieldsToCheck: { value: string; contentType: string; label: string }[] = [];

      if (typeof updates.serviceDescription === "string" && updates.serviceDescription) {
        profileFieldsToCheck.push({ value: updates.serviceDescription, contentType: "vendor_description", label: "Business description" });
      }
      if (updates.onlineProfiles && typeof updates.onlineProfiles === "object" && !Array.isArray(updates.onlineProfiles)) {
        const op = updates.onlineProfiles as Record<string, unknown>;
        if (typeof op.shopTagline === "string" && op.shopTagline) {
          profileFieldsToCheck.push({ value: op.shopTagline, contentType: "tagline", label: "Tagline" });
        }
        if (typeof op.aboutVendor === "string" && op.aboutVendor) {
          profileFieldsToCheck.push({ value: op.aboutVendor, contentType: "vendor_description", label: "About section" });
        }
        if (typeof op.aboutBusiness === "string" && op.aboutBusiness) {
          profileFieldsToCheck.push({ value: op.aboutBusiness, contentType: "vendor_description", label: "About the business" });
        }
      }

      for (const field of profileFieldsToCheck) {
        const detection = checkContent(field.value);
        if (detection.hardBlocked) {
          const serverUrlForProfile = appUrl();
          let violationMeta: { phase: string; softAttemptNumber?: number; warningNumber?: number; suspended?: boolean; endsAt?: Date | null } = { phase: "soft" };
          if (vendorAccountIdForCircumvention) {
            const result = await handleCircumventionViolation({
              vendorAccountId: vendorAccountIdForCircumvention,
              contentType: field.contentType,
              contentSnapshot: field.value,
              matches: detection.matches,
              reason: `${field.label} contained ${blockReasonSummary(detection.blockReasons)}`,
              serverUrl: serverUrlForProfile,
            });
            violationMeta = result;
          }
          return res.status(422).json({
            error: "content_blocked",
            field: field.label,
            reason: `Your ${field.label.toLowerCase()} cannot include ${blockReasonSummary(detection.blockReasons)}. Please remove this information and try again.`,
            blockReasons: detection.blockReasons,
            matches: detection.matches,
            phase: violationMeta.phase,
            softAttemptNumber: (violationMeta as any).softAttemptNumber ?? null,
            warningNumber: (violationMeta as any).warningNumber ?? null,
            suspended: (violationMeta as any).suspended ?? false,
            suspensionEndsAt: (violationMeta as any).endsAt ?? null,
          });
        }
        if (detection.softFlagged && vendorAccountIdForCircumvention) {
          // Allow save but flag for admin review
          db.insert(circumventionFlags).values({
            flagType: "soft_flag",
            contentType: field.contentType as any,
            contentSnapshot: field.value.slice(0, 2000),
            matches: detection.matches,
            vendorAccountId: vendorAccountIdForCircumvention,
            status: "pending",
          }).catch((err: any) => logger.warn("[circumvention] soft flag insert failed:", err?.message));
        }
      }
      // ── End circumvention detection ──────────────────────────────────────────

      const [updated] = await db
        .update(vendorProfiles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(vendorProfiles.id, existing.id))
        .returning();

      const softFlaggedProfile = profileFieldsToCheck.some(f => checkContent(f.value).softFlagged);
      return res.json({ ...updated, activeProfileId: context.activeProfileId, softFlagged: softFlaggedProfile });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/profiles", ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const profiles = context.profiles.map((profile) => ({
        id: profile.id,
        profileName: getProfileDisplayName(profile, context.account.businessName),
        city: profile.city,
        createdAt: profile.createdAt,
        isActive: profile.id === context.activeProfileId,
        isOperational: profile.active !== false,
        deactivatedAt: profile.deactivatedAt ?? null,
      }));

      return res.json({
        activeProfileId: context.activeProfileId,
        profiles,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/vendor/profiles/switch", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const schema = z.object({
        profileId: z.string().min(1),
      });
      const data = schema.parse(req.body ?? {});
      const profileId = data.profileId.trim();

      const target = context.profiles.find((profile) => profile.id === profileId);
      if (!target) {
        return res.status(404).json({ error: "Profile not found for this vendor account" });
      }

      await db
        .update(vendorAccounts)
        .set({ activeProfileId: target.id })
        .where(eq(vendorAccounts.id, context.account.id));

      return res.json({
        activeProfileId: target.id,
        profile: {
          id: target.id,
          profileName: getProfileDisplayName(target, context.account.businessName),
          city: target.city,
          isOperational: target.active !== false,
        },
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/vendor/profiles/:id/deactivate", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const profileId = asTrimmedString(req.params?.id);
      if (!profileId) {
        return res.status(400).json({ error: "Profile id is required" });
      }

      const target = context.profiles.find((profile) => profile.id === profileId);
      if (!target) {
        return res.status(404).json({ error: "Profile not found for this vendor account" });
      }
      if (target.active === false) {
        return res.status(400).json({ error: "Profile is already inactive" });
      }

      const now = new Date();
      const inactivatedListings = await db
        .update(vendorListings)
        .set({ status: "inactive", updatedAt: now })
        .where(
          and(
            eq(vendorListings.accountId, context.account.id),
            eq(vendorListings.profileId, target.id),
            or(eq(vendorListings.status, "active"), eq(vendorListings.status, "draft"))
          )
        )
        .returning({ id: vendorListings.id });

      await db
        .update(vendorProfiles)
        .set({ active: false, deactivatedAt: now, updatedAt: now })
        .where(eq(vendorProfiles.id, target.id));

      const nextActiveProfile = context.profiles.find(
        (profile) => profile.id !== target.id && profile.active !== false
      );
      const nextActiveProfileId =
        context.activeProfileId === target.id ? nextActiveProfile?.id ?? null : context.activeProfileId;

      if (context.account.activeProfileId !== nextActiveProfileId) {
        await db
          .update(vendorAccounts)
          .set({ activeProfileId: nextActiveProfileId })
          .where(eq(vendorAccounts.id, context.account.id));
      }

      return res.json({
        profileId: target.id,
        active: false,
        activeProfileId: nextActiveProfileId,
        listingsInactivated: inactivatedListings.length,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/profiles/:id/deactivate", error);
      return res.status(500).json({ error: "Unable to deactivate profile" });
    }
  });

  app.post("/api/vendor/profiles/:id/reactivate", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const context = await resolveActiveVendorProfile(req);
      if (!context?.account?.id) {
        return res.status(404).json({ error: "Vendor account not found" });
      }

      const profileId = asTrimmedString(req.params?.id);
      if (!profileId) {
        return res.status(400).json({ error: "Profile id is required" });
      }

      const target = context.profiles.find((profile) => profile.id === profileId);
      if (!target) {
        return res.status(404).json({ error: "Profile not found for this vendor account" });
      }
      if (target.active !== false) {
        return res.status(400).json({ error: "Profile is already active" });
      }

      await db
        .update(vendorProfiles)
        .set({ active: true, deactivatedAt: null, updatedAt: new Date() })
        .where(eq(vendorProfiles.id, target.id));

      const nextActiveProfileId = context.account.activeProfileId || target.id;
      if (!context.account.activeProfileId) {
        await db
          .update(vendorAccounts)
          .set({ activeProfileId: target.id })
          .where(eq(vendorAccounts.id, context.account.id));
      }

      return res.json({
        profileId: target.id,
        active: true,
        activeProfileId: nextActiveProfileId,
        listingsRemainInactive: true,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/profiles/:id/reactivate", error);
      return res.status(500).json({ error: "Unable to reactivate profile" });
    }
  });

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

      // Main booking payment (type 'booking' or legacy 'deposit')
      const payment = allBookingPayments.find(
        (p) => p.paymentType === "booking" || p.paymentType === "deposit"
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
      const { refundBookingPayment } = await import("./stripe");
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

  // Vendor Listings Routes (already Auth0 dual middleware and working)
  app.post("/api/vendor/listings", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfile = profileContext?.activeProfile;
      if (!activeProfile?.id) {
        return res.status(400).json({
          error: "Vendor profile required before creating a listing. Complete onboarding first.",
        });
      }

      const listingData = req.body?.listingData;
      const rawListingType = req.body?.listingType;
      const allowedListingTypes = ["single", "package_container", "addon"] as const;
      type TopLevelListingType = typeof allowedListingTypes[number];
      const resolvedListingType: TopLevelListingType =
        allowedListingTypes.includes(rawListingType) ? rawListingType : "single";

      if (!listingData || typeof listingData !== "object") {
        return res.status(400).json({ error: "listingData must be a JSON object." });
      }
      const normalizedListingData = clampListingDescriptions(listingData) as Record<string, any>;
      const normalizedClassification = normalizeListingClassification(normalizedListingData);

      const seededListingData = {
        ...normalizedClassification.listingData,

        // Service area mode (listing-owned)
        serviceAreaMode: normalizedClassification.listingData?.serviceAreaMode ?? "radius",

        // Radius: listing → legacy field → default
        serviceRadiusMiles:
          normalizedClassification.listingData?.serviceRadiusMiles ?? 25,

        // Location MUST come from listing UI (map picker)
        // Do NOT infer lat/lng from vendor profile
        serviceLocation: normalizedClassification.listingData?.serviceLocation ?? null,
        serviceCenter: normalizedClassification.listingData?.serviceCenter ?? null,
        instantBookEnabled:
          parseBooleanInput(normalizedClassification.listingData?.instantBookEnabled) ??
          (normalizedClassification.category === "Rentals"),
      };
      const canonicalColumns = buildCanonicalListingColumns({
        listingDataRaw: seededListingData,
        classification: normalizedClassification,
      });
      const mirroredListingData = mirrorListingQuantityIntoListingData({
        listingDataRaw: seededListingData,
        canonical: canonicalColumns,
      });

      const defaultTitleType = normalizedClassification.category?.toLowerCase().replace(/s$/, "");

      const title =
        canonicalColumns.title ||
        (typeof normalizedListingData.title === "string" && normalizedListingData.title.trim()) ||
        (defaultTitleType ? `New ${defaultTitleType} listing` : null);
      const [listing] = await db
        .insert(vendorListings)
        .values({
          accountId: vendorAuth.id,
          profileId: activeProfile.id,
          status: "draft",
          listingType: resolvedListingType,
          ...canonicalColumns,
          title,
          listingData: mirroredListingData,
        })
        .returning();

      // Kick off async translation for all supported languages.
      translateListingAsync(listing.id, {
        title: listing.title,
        description: listing.description,
        whatsIncluded: listing.whatsIncluded,
        whatsNotIncluded: listing.whatsNotIncluded,
      });

      return res.status(201).json(listing);
    } catch (error: any) {
      logRouteError("/api/vendor/listings", error);
      return res.status(500).json({ error: "Unable to create listing" });
    }
  });

  app.patch("/api/vendor/listings/:id", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const { id } = req.params;
      const { listingData, title } = req.body;
      const normalizedListingData =
        listingData !== undefined ? (clampListingDescriptions(listingData) as Record<string, any>) : undefined;
      const normalizedClassification =
        normalizedListingData !== undefined
          ? normalizeListingClassification(normalizedListingData)
          : null;

      const existingListings = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existingListings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      const existingListing = existingListings[0];
      if ((existingListing?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existingListing.profileId && existingListing.profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }

      const updatePayload: any = {
        updatedAt: new Date(),
      };

      // Only overwrite fields if they were sent
      if (normalizedClassification) {
        const canonicalClassification = {
          category: normalizedClassification.category ?? normalizeListingCategory(existingListing?.category),
          subcategory: normalizedClassification.subcategory ?? normalizeListingSubcategory(existingListing?.subcategory),
          subcategoryDetail: normalizedClassification.subcategoryDetail ?? normalizeListingSubcategoryDetail((existingListing as any)?.subcategoryDetail),
        };
        const canonicalColumns = buildCanonicalListingColumns({
          listingDataRaw: normalizedClassification.listingData,
          existingCanonical: {
            category: existingListing?.category,
            subcategory: existingListing?.subcategory,
            title: existingListing?.title,
            description: existingListing?.description,
            whatsIncluded: existingListing?.whatsIncluded,
            whatsNotIncluded: existingListing?.whatsNotIncluded,
            tags: existingListing?.tags,
            popularFor: existingListing?.popularFor,
            instantBookEnabled: existingListing?.instantBookEnabled,
            pricingUnit: existingListing?.pricingUnit,
            priceCents: existingListing?.priceCents,
            quantity: existingListing?.quantity,
            minimumHours: existingListing?.minimumHours,
            listingServiceCenterLabel: existingListing?.listingServiceCenterLabel,
            listingServiceCenterLat: existingListing?.listingServiceCenterLat,
            listingServiceCenterLng: existingListing?.listingServiceCenterLng,
            serviceRadiusMiles: existingListing?.serviceRadiusMiles,
            serviceAreaMode: existingListing?.serviceAreaMode,
            travelOffered: existingListing?.travelOffered,
            travelFeeEnabled: existingListing?.travelFeeEnabled,
            travelFeeType: existingListing?.travelFeeType,
            travelFeeAmountCents: existingListing?.travelFeeAmountCents,
            pickupOffered: (existingListing as any)?.pickupOffered,
            deliveryOffered: existingListing?.deliveryOffered,
            deliveryFeeEnabled: (existingListing as any)?.deliveryFeeEnabled,
            deliveryFeeAmountCents: existingListing?.deliveryFeeAmountCents,
            setupOffered: existingListing?.setupOffered,
            setupFeeEnabled: (existingListing as any)?.setupFeeEnabled,
            setupFeeAmountCents: existingListing?.setupFeeAmountCents,
            takedownOffered: (existingListing as any)?.takedownOffered,
            takedownFeeEnabled: (existingListing as any)?.takedownFeeEnabled,
            takedownFeeAmountCents: (existingListing as any)?.takedownFeeAmountCents,
            photos: existingListing?.photos,
          },
          classification: canonicalClassification,
        });
        updatePayload.listingData = mirrorListingQuantityIntoListingData({
          listingDataRaw: normalizedClassification.listingData,
          canonical: canonicalColumns,
        });
        Object.assign(updatePayload, canonicalColumns);

        // package_container: certain fields are owned by child rows, not the container.
        // Never let wizard autosaves overwrite them.
        //   priceCents       — owned by syncContainerMinPrice() (derived from package_item children)
        //   whatsIncluded    — owned by each package_item child row
        //   whatsNotIncluded — owned by each package_item child row
        if (existingListing.listingType === "package_container") {
          delete updatePayload.priceCents;
          delete updatePayload.whatsIncluded;
          delete updatePayload.whatsNotIncluded;
        }
      }

      if (typeof title === "string" && title.trim()) {
        updatePayload.title = title.trim();
      }

      // Security deposit: read from top-level body (edit page) or listingData (wizard autosave).
      // listingData takes lower priority so explicit top-level values always win.
      const rawDepositEnabled =
        req.body.securityDepositEnabled !== undefined
          ? req.body.securityDepositEnabled
          : normalizedListingData?.securityDepositEnabled;
      const rawDepositCents =
        req.body.securityDepositCents !== undefined
          ? req.body.securityDepositCents
          : normalizedListingData?.securityDepositCents;
      if (rawDepositEnabled !== undefined) {
        updatePayload.securityDepositEnabled = Boolean(rawDepositEnabled);
      }
      if (rawDepositEnabled === false || rawDepositEnabled === null) {
        updatePayload.securityDepositCents = null; // clear amount when disabled
      } else if (rawDepositCents !== undefined) {
        const parsed = Number(rawDepositCents);
        updatePayload.securityDepositCents =
          Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
      }

      const nextListingData = normalizedClassification
        ? updatePayload.listingData
        : existingListing?.listingData;
      const nextCanonicalPhotos = updatePayload.photos ?? existingListing?.photos;
      const nextCanonicalCategory = updatePayload.category ?? existingListing?.category;
      const shouldAutoDeactivateForMissingPhotos =
        existingListing?.status === "active" && !hasMinimumListingPhotos(nextListingData, nextCanonicalPhotos);
      const shouldAutoDeactivateForMissingCategory =
        existingListing?.status === "active" &&
        !resolveCanonicalListingCategory(nextListingData, nextCanonicalCategory);

      if (shouldAutoDeactivateForMissingPhotos || shouldAutoDeactivateForMissingCategory) {
        updatePayload.status = "inactive";
      }

      if (!existingListing.profileId && activeProfileId) {
        updatePayload.profileId = activeProfileId;
      }

      // ── Circumvention detection ──────────────────────────────────────────────
      // If this listing was previously removed for violation, check it before saving.
      const isResubmission = existingListing.violationRemoval;
      const listingFieldsToCheck: { value: string; contentType: string; label: string }[] = [];

      const descToCheck = typeof updatePayload.description === "string"
        ? updatePayload.description
        : (typeof (updatePayload.listingData as any)?.description === "string"
          ? (updatePayload.listingData as any).description
          : null);
      const titleToCheck = typeof updatePayload.title === "string" ? updatePayload.title : null;

      if (descToCheck) listingFieldsToCheck.push({ value: descToCheck, contentType: "listing_description", label: "Listing description" });
      if (titleToCheck) listingFieldsToCheck.push({ value: titleToCheck, contentType: "listing_title", label: "Listing title" });

      const vendorAccountIdForListing = String(vendorAuth.id);
      const serverUrlForListing = appUrl();

      for (const field of listingFieldsToCheck) {
        const detection = checkContent(field.value);
        if (detection.hardBlocked) {
          const result = await handleCircumventionViolation({
            vendorAccountId: vendorAccountIdForListing,
            contentType: field.contentType,
            contentSnapshot: field.value,
            matches: detection.matches,
            reason: `${field.label} contained ${blockReasonSummary(detection.blockReasons)}`,
            listingId: id,
            serverUrl: serverUrlForListing,
          });
          return res.status(422).json({
            error: "content_blocked",
            field: field.label,
            reason: `Your ${field.label.toLowerCase()} cannot include ${blockReasonSummary(detection.blockReasons)}. Please remove this information and try again.`,
            blockReasons: detection.blockReasons,
            matches: detection.matches,
            phase: result.phase,
            softAttemptNumber: result.phase === "soft" ? result.softAttemptNumber : null,
            warningNumber: result.phase === "hard" ? result.warningNumber : null,
            suspended: result.phase === "hard" ? result.suspended : false,
            suspensionEndsAt: result.phase === "hard" ? result.endsAt : null,
          });
        }
        if (detection.softFlagged) {
          db.insert(circumventionFlags).values({
            flagType: "soft_flag",
            contentType: field.contentType as any,
            contentSnapshot: field.value.slice(0, 2000),
            matches: detection.matches,
            vendorAccountId: vendorAccountIdForListing,
            listingId: id,
            status: "pending",
          }).catch((err: any) => logger.warn("[circumvention] soft flag insert failed:", err?.message));
        }
      }

      // If this is a resubmission after violation removal, mark as awaiting admin re-review
      if (isResubmission) {
        updatePayload.pendingAdminReview = true;
      }
      // ── End circumvention detection ──────────────────────────────────────────

      const [updated] = await db
        .update(vendorListings)
        .set(updatePayload)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      // Re-translate async whenever a listing is saved (covers edits post-publish).
      translateListingAsync(updated.id, {
        title: updated.title,
        description: updated.description,
        whatsIncluded: updated.whatsIncluded,
        whatsNotIncluded: updated.whatsNotIncluded,
      });

      const softFlaggedListing = listingFieldsToCheck.some(f => checkContent(f.value).softFlagged);
      return res.json({ ...updated, softFlagged: softFlaggedListing, pendingReview: isResubmission });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id", error);
      return res.status(500).json({ error: "Unable to update listing" });
    }
  });

  app.patch("/api/vendor/listings/:id/publish", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((existing[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existing[0]?.profileId && existing[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }

      // Block publish while vendor is suspended.
      const activeSuspension = await getActiveSuspension(String(vendorAuth.id));
      if (activeSuspension) {
        const endsAt = activeSuspension.endsAt
          ? new Date(activeSuspension.endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
          : null;
        return res.status(403).json({
          error: "account_suspended",
          message: endsAt
            ? `Your account is suspended until ${endsAt}. You cannot publish listings during this period.`
            : "Your account is currently suspended. You cannot publish listings.",
          suspensionEndsAt: activeSuspension.endsAt,
        });
      }

      const incomingListingData = req.body?.listingData;
      const incomingTitle = req.body?.title;
      const incomingDescription =
        asTrimmedString(req.body?.description) ||
        asTrimmedString(req.body?.listingDescription) ||
        asTrimmedString(req.body?.serviceDescription) ||
        null;

      if (incomingListingData !== undefined && (typeof incomingListingData !== "object" || incomingListingData === null || Array.isArray(incomingListingData))) {
        return res.status(400).json({ error: "listingData must be a JSON object." });
      }

      const normalizedIncomingListingData =
        incomingListingData !== undefined
          ? (clampListingDescriptions(incomingListingData) as Record<string, any>)
          : undefined;
      const existingListing = existing[0];
      const rawListingData: any =
        (clampListingDescriptions(
          normalizedIncomingListingData !== undefined ? normalizedIncomingListingData : existingListing?.listingData
        ) as Record<string, any>) || {};
      const normalizedClassification = normalizeListingClassification(rawListingData, {
        requireCategory: false,
      });
      const ld: any = normalizedClassification.listingData;
      const canonicalClassification = {
        category: normalizedClassification.category ?? normalizeListingCategory(existingListing?.category),
        subcategory: normalizedClassification.subcategory ?? normalizeListingSubcategory(existingListing?.subcategory),
      };
      const canonicalColumns = buildCanonicalListingColumns({
        listingDataRaw: ld,
        existingCanonical: {
          category: existingListing?.category,
          subcategory: existingListing?.subcategory,
          title: existingListing?.title,
          description: existingListing?.description,
          whatsIncluded: existingListing?.whatsIncluded,
          whatsNotIncluded: existingListing?.whatsNotIncluded,
          tags: existingListing?.tags,
          popularFor: existingListing?.popularFor,
          instantBookEnabled: existingListing?.instantBookEnabled,
          pricingUnit: existingListing?.pricingUnit,
          priceCents: existingListing?.priceCents,
          quantity: existingListing?.quantity,
          minimumHours: existingListing?.minimumHours,
          listingServiceCenterLabel: existingListing?.listingServiceCenterLabel,
          listingServiceCenterLat: existingListing?.listingServiceCenterLat,
          listingServiceCenterLng: existingListing?.listingServiceCenterLng,
          serviceRadiusMiles: existingListing?.serviceRadiusMiles,
          serviceAreaMode: existingListing?.serviceAreaMode,
          travelOffered: existingListing?.travelOffered,
          travelFeeEnabled: existingListing?.travelFeeEnabled,
          travelFeeType: existingListing?.travelFeeType,
          travelFeeAmountCents: existingListing?.travelFeeAmountCents,
          pickupOffered: (existingListing as any)?.pickupOffered,
          deliveryOffered: existingListing?.deliveryOffered,
          deliveryFeeEnabled: (existingListing as any)?.deliveryFeeEnabled,
          deliveryFeeAmountCents: existingListing?.deliveryFeeAmountCents,
          setupOffered: existingListing?.setupOffered,
          setupFeeEnabled: (existingListing as any)?.setupFeeEnabled,
          setupFeeAmountCents: existingListing?.setupFeeAmountCents,
          takedownOffered: (existingListing as any)?.takedownOffered,
          takedownFeeEnabled: (existingListing as any)?.takedownFeeEnabled,
          takedownFeeAmountCents: (existingListing as any)?.takedownFeeAmountCents,
          photos: existingListing?.photos,
        },
        classification: canonicalClassification,
      });

      // ---- Publish validation (hard requirements) ----
      const mode = asTrimmedString(canonicalColumns.serviceAreaMode ?? existingListing?.serviceAreaMode).toLowerCase();
      const loc = ld.serviceLocation;
      const categoryOk = Boolean(canonicalColumns.category ?? normalizeListingCategory(existingListing?.category));
      const resolvedTitle = canonicalColumns.title ?? normalizeListingTitleCandidate(existingListing?.title);
      const listingDataDescription =
        asTrimmedString(ld?.description) ||
        asTrimmedString(ld?.listingDescription) ||
        asTrimmedString(ld?.serviceDescription) ||
        null;
      const resolvedDescription =
        canonicalColumns.description ??
        listingDataDescription ??
        incomingDescription ??
        (asTrimmedString(existingListing?.description) || null);
      const resolvedPriceCents = canonicalColumns.priceCents ?? parseIntegerValue(existingListing?.priceCents);
      const resolvedPhotos =
        canonicalColumns.photos.length > 0
          ? canonicalColumns.photos
          : toUniqueTrimmedStringList(existingListing?.photos);

      const centerLat =
        canonicalColumns.listingServiceCenterLat ?? parseLatLngValue(existingListing?.listingServiceCenterLat);
      const centerLng =
        canonicalColumns.listingServiceCenterLng ?? parseLatLngValue(existingListing?.listingServiceCenterLng);
      const centerLabel =
        asTrimmedString(canonicalColumns.listingServiceCenterLabel) ||
        asTrimmedString(existingListing?.listingServiceCenterLabel);

      const hasTypedLocation = Boolean(
        centerLabel &&
        Number.isFinite(centerLat) &&
        Number.isFinite(centerLng)
      );
      const hasLegacyLocation =
        loc &&
        typeof loc === "object" &&
        typeof loc.label === "string" &&
        Number.isFinite(Number(loc.lat)) &&
        Number.isFinite(Number(loc.lng)) &&
        typeof loc.country === "string" &&
        loc.country.trim().length > 0;
      const hasLoc = hasTypedLocation || Boolean(hasLegacyLocation);

      const isPackageContainer = existingListing?.listingType === "package_container";

      const titleOk = Boolean(resolvedTitle && resolvedTitle.trim().length >= 2);
      // package_container: description lives on each package_item, not the container
      const descOk = isPackageContainer || Boolean(resolvedDescription && resolvedDescription.trim().length >= 10);
      const photosOk = hasMinimumListingPhotos(ld, resolvedPhotos);
      // package_container: price is derived from child package_items via syncContainerMinPrice
      const priceOk = isPackageContainer || hasValidListingPrice(ld, resolvedPriceCents);

      // service area checks
      const modeOk = mode === "radius" || mode === "nationwide" || mode === "global";

      const hasCenter = Number.isFinite(centerLat) && Number.isFinite(centerLng);

      const radiusMiles = canonicalColumns.serviceRadiusMiles ?? parseIntegerValue(existingListing?.serviceRadiusMiles);
      const radiusOk =
        mode !== "radius" ? true : Number.isFinite(Number(radiusMiles)) && Number(radiusMiles) > 0;

      const missing = {
        category: !categoryOk,
        serviceAreaMode: !modeOk,
        serviceLocation: !hasLoc,
        listingTitle: !titleOk,
        listingDescription: !descOk,
        photos: !photosOk,
        price: !priceOk,
        serviceCenter: mode === "radius" ? !hasCenter : false,
        serviceRadiusMiles: mode === "radius" ? !radiusOk : false,
      };

      if (Object.values(missing).some(Boolean)) {
        const reasons: string[] = [];
        if (missing.category) reasons.push("Select category.");
        if (missing.listingTitle) reasons.push("Add listing title.");
        if (missing.listingDescription) reasons.push("Add listing description (at least 10 characters).");
        if (missing.photos) reasons.push(`Add at least ${MIN_LISTING_PHOTO_COUNT} photos.`);
        if (missing.price) reasons.push("Add a valid price.");
        if (missing.serviceAreaMode) reasons.push("Select service area mode.");
        if (missing.serviceLocation) reasons.push("Select service location.");
        if (missing.serviceCenter) reasons.push("For radius mode, set service center.");
        if (missing.serviceRadiusMiles) reasons.push("For radius mode, set service radius miles.");

        return res.status(400).json({
          error: "Listing incomplete — cannot publish",
          missing,
          reasons,
        });
      }
      const publishUpdatePayload: any = {
        status: "active",
        updatedAt: new Date(),
      };

      publishUpdatePayload.listingData = mirrorListingQuantityIntoListingData({
        listingDataRaw: ld,
        canonical: canonicalColumns,
      });
      Object.assign(
        publishUpdatePayload,
        canonicalColumns
      );
      // package_container: priceCents is owned by syncContainerMinPrice() — never overwrite it here
      if (isPackageContainer) {
        delete publishUpdatePayload.priceCents;
        delete publishUpdatePayload.whatsIncluded;
        delete publishUpdatePayload.whatsNotIncluded;
      }
      if (!existingListing?.profileId && activeProfileId) {
        publishUpdatePayload.profileId = activeProfileId;
      }

      if (typeof incomingTitle === "string" && incomingTitle.trim()) {
        publishUpdatePayload.title = incomingTitle.trim();
      }

      const [updated] = await db
        .update(vendorListings)
        .set(publishUpdatePayload)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      // For package containers, activate all child package_items and resync min price
      if (isPackageContainer) {
        await db
          .update(vendorListings)
          .set({ status: "active", updatedAt: new Date() })
          .where(
            and(
              eq(vendorListings.parentListingId, id),
              eq(vendorListings.listingType, "package_item"),
              ne(vendorListings.status, "deleted")
            )
          );
        await syncContainerMinPrice(id);
      }

      // Re-fetch so response includes the synced priceCents
      const finalListing = isPackageContainer
        ? (await db.select().from(vendorListings).where(eq(vendorListings.id, id)))[0] ?? updated
        : updated;

      return res.json(finalListing);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/publish", error);
      return res.status(500).json({ error: "Unable to publish listing" });
    }
  });

    app.patch("/api/vendor/listings/:id/unpublish", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((existing[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existing[0]?.profileId && existing[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }

      const [updated] = await db
        .update(vendorListings)
        .set({
          status: "inactive",
          ...(existing[0]?.profileId ? {} : { profileId: activeProfileId }),
          updatedAt: new Date(),
        })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      // For package containers, deactivate all child package_items too
      if (existing[0]?.listingType === "package_container") {
        await db
          .update(vendorListings)
          .set({ status: "inactive", updatedAt: new Date() })
          .where(
            and(
              eq(vendorListings.parentListingId, id),
              eq(vendorListings.listingType, "package_item"),
              ne(vendorListings.status, "deleted")
            )
          );
      }

      return res.json(updated);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/unpublish", error);
      return res.status(500).json({ error: "Unable to unpublish listing" });
    }
  });

  // ── Package Item Endpoints ───────────────────────────────────────────────────

  /**
   * Syncs the container listing's priceCents to the minimum price across its
   * package_item children. This keeps browse cards showing "Starting from $X"
   * accurately. Safe to call after any package create/update/delete.
   */
  async function syncContainerMinPrice(containerId: string) {
    const children = await db
      .select({ priceCents: vendorListings.priceCents })
      .from(vendorListings)
      .where(
        and(
          eq(vendorListings.parentListingId, containerId),
          eq(vendorListings.listingType, "package_item"),
        )
      );
    const prices = children
      .map((c) => c.priceCents)
      .filter((p): p is number => typeof p === "number" && p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : null;
    await db
      .update(vendorListings)
      .set({ priceCents: minPrice, updatedAt: new Date() })
      .where(eq(vendorListings.id, containerId));
  }

  /**
   * GET /api/vendor/listings/:id/packages
   * Returns all package_item children for a package_container listing.
   */
  app.get("/api/vendor/listings/:id/packages", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      const [container] = await db
        .select({ id: vendorListings.id, accountId: vendorListings.accountId, listingType: vendorListings.listingType })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);

      if (!container) return res.status(404).json({ error: "Listing not found" });
      if (container.listingType !== "package_container") {
        return res.status(400).json({ error: "Listing is not a package_container" });
      }

      const packages = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          description: vendorListings.description,
          whatsIncluded: vendorListings.whatsIncluded,
          whatsNotIncluded: vendorListings.whatsNotIncluded,
          priceCents: vendorListings.priceCents,
          pricingUnit: vendorListings.pricingUnit,
          sortOrder: vendorListings.sortOrder,
          status: vendorListings.status,
          dimensionUnit: vendorListings.dimensionUnit,
          dimensionWidth: vendorListings.dimensionWidth,
          dimensionLength: vendorListings.dimensionLength,
          dimensionHeight: vendorListings.dimensionHeight,
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
        })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.parentListingId, id),
            eq(vendorListings.listingType, "package_item"),
          )
        )
        .orderBy(asc(vendorListings.sortOrder), asc(vendorListings.createdAt));

      return res.json(packages);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages GET", error);
      return res.status(500).json({ error: "Unable to fetch packages" });
    }
  });

  /**
   * POST /api/vendor/listings/:id/packages
   * Creates a new package_item child row under a package_container.
   */
  app.post("/api/vendor/listings/:id/packages", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      const {
        title, description, whatsIncluded, whatsNotIncluded,
        priceCents, pricingUnit, sortOrder,
        dimensionUnit, dimensionWidth, dimensionLength, dimensionHeight,
        travelOffered, travelFeeEnabled, travelFeeType, travelFeeAmountCents,
        deliveryOffered, deliveryFeeEnabled, deliveryFeeAmountCents,
        setupOffered, setupFeeEnabled, setupFeeAmountCents,
        takedownOffered, takedownFeeEnabled, takedownFeeAmountCents,
        cancellationPolicyOverride,
      } = req.body;

      const [container] = await db
        .select({ id: vendorListings.id, accountId: vendorListings.accountId, listingType: vendorListings.listingType, profileId: vendorListings.profileId, category: vendorListings.category })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);

      if (!container) return res.status(404).json({ error: "Listing not found" });
      if (container.listingType !== "package_container") {
        return res.status(400).json({ error: "Listing is not a package_container" });
      }

      // Enforce 5-package max
      const existingCount = await db
        .select({ count: drizzleSql<number>`count(*)` })
        .from(vendorListings)
        .where(and(eq(vendorListings.parentListingId, id), eq(vendorListings.listingType, "package_item")));
      if ((existingCount[0]?.count ?? 0) >= 5) {
        return res.status(400).json({ error: "Maximum of 5 packages allowed per listing", code: "package_limit_reached" });
      }

      const packageTitle =
        typeof title === "string" && title.trim() ? title.trim() : "New Package";
      const packageDescription =
        typeof description === "string" ? description.trim() : "";
      const packageInclusions = Array.isArray(whatsIncluded)
        ? whatsIncluded.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
        : [];
      const packageNotIncluded = Array.isArray(whatsNotIncluded)
        ? whatsNotIncluded.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim())
        : [];
      const packagePriceCents =
        typeof priceCents === "number" && priceCents >= 0 ? Math.floor(priceCents) : null;
      const packagePricingUnit =
        pricingUnit === "per_hour" || pricingUnit === "per_day" ? pricingUnit : "per_day";
      const packageSortOrder = typeof sortOrder === "number" ? sortOrder : 0;

      const [pkg] = await db
        .insert(vendorListings)
        .values({
          accountId: vendorAuth.id,
          profileId: container.profileId,
          parentListingId: container.id,
          listingType: "package_item",
          status: "active",
          category: container.category,
          title: packageTitle,
          description: packageDescription,
          whatsIncluded: packageInclusions,
          whatsNotIncluded: packageNotIncluded,
          priceCents: packagePriceCents,
          pricingUnit: packagePricingUnit,
          sortOrder: packageSortOrder,
          dimensionUnit: typeof dimensionUnit === "string" ? dimensionUnit : null,
          dimensionWidth: typeof dimensionWidth === "number" && dimensionWidth > 0 ? dimensionWidth : null,
          dimensionLength: typeof dimensionLength === "number" && dimensionLength > 0 ? dimensionLength : null,
          dimensionHeight: typeof dimensionHeight === "number" && dimensionHeight > 0 ? dimensionHeight : null,
          travelOffered: travelOffered === true,
          travelFeeEnabled: travelOffered === true && travelFeeEnabled === true,
          travelFeeType: typeof travelFeeType === "string" ? travelFeeType : null,
          travelFeeAmountCents: typeof travelFeeAmountCents === "number" && travelFeeAmountCents >= 0 ? Math.floor(travelFeeAmountCents) : null,
          deliveryOffered: deliveryOffered === true,
          pickupOffered: deliveryOffered === true,
          deliveryFeeEnabled: deliveryOffered === true && deliveryFeeEnabled === true,
          deliveryFeeAmountCents: typeof deliveryFeeAmountCents === "number" && deliveryFeeAmountCents >= 0 ? Math.floor(deliveryFeeAmountCents) : null,
          setupOffered: setupOffered === true,
          setupFeeEnabled: setupOffered === true && setupFeeEnabled === true,
          setupFeeAmountCents: typeof setupFeeAmountCents === "number" && setupFeeAmountCents >= 0 ? Math.floor(setupFeeAmountCents) : null,
          takedownOffered: takedownOffered === true,
          takedownFeeEnabled: takedownOffered === true && takedownFeeEnabled === true,
          takedownFeeAmountCents: typeof takedownFeeAmountCents === "number" && takedownFeeAmountCents >= 0 ? Math.floor(takedownFeeAmountCents) : null,
          cancellationPolicy: typeof cancellationPolicyOverride?.policy === "string" ? cancellationPolicyOverride.policy : "cancel_anytime",
          cancellationPolicyDays: typeof cancellationPolicyOverride?.hours === "number" ? cancellationPolicyOverride.hours : null,
        })
        .returning();

      await syncContainerMinPrice(id);
      return res.status(201).json(pkg);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages POST", error);
      return res.status(500).json({ error: "Unable to create package" });
    }
  });

  /**
   * PATCH /api/vendor/listings/:id/packages/:pkgId
   * Updates a package_item child row.
   */
  app.patch("/api/vendor/listings/:id/packages/:pkgId", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id, pkgId } = req.params;
      const {
        title, description, whatsIncluded, whatsNotIncluded,
        priceCents, pricingUnit, sortOrder,
        dimensionUnit, dimensionWidth, dimensionLength, dimensionHeight,
        travelOffered, travelFeeEnabled, travelFeeType, travelFeeAmountCents,
        deliveryOffered, deliveryFeeEnabled, deliveryFeeAmountCents,
        setupOffered, setupFeeEnabled, setupFeeAmountCents,
        takedownOffered, takedownFeeEnabled, takedownFeeAmountCents,
        cancellationPolicyOverride,
      } = req.body;

      const [pkg] = await db
        .select({ id: vendorListings.id, accountId: vendorListings.accountId, parentListingId: vendorListings.parentListingId, listingType: vendorListings.listingType })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, pkgId),
            eq(vendorListings.parentListingId, id),
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "package_item"),
          )
        )
        .limit(1);

      if (!pkg) return res.status(404).json({ error: "Package not found" });

      const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof title === "string" && title.trim()) updatePayload.title = title.trim();
      if (typeof description === "string") updatePayload.description = description.trim();
      if (Array.isArray(whatsIncluded)) {
        updatePayload.whatsIncluded = whatsIncluded
          .filter((s: unknown) => typeof s === "string" && s.trim())
          .map((s: string) => s.trim());
      }
      if (Array.isArray(whatsNotIncluded)) {
        updatePayload.whatsNotIncluded = whatsNotIncluded
          .filter((s: unknown) => typeof s === "string" && s.trim())
          .map((s: string) => s.trim());
      }
      if (typeof priceCents === "number" && priceCents >= 0) updatePayload.priceCents = Math.floor(priceCents);
      if (pricingUnit === "per_hour" || pricingUnit === "per_day") updatePayload.pricingUnit = pricingUnit;
      if (typeof sortOrder === "number") updatePayload.sortOrder = sortOrder;
      if (typeof dimensionUnit === "string") updatePayload.dimensionUnit = dimensionUnit;
      updatePayload.dimensionWidth = typeof dimensionWidth === "number" && dimensionWidth > 0 ? dimensionWidth : null;
      updatePayload.dimensionLength = typeof dimensionLength === "number" && dimensionLength > 0 ? dimensionLength : null;
      updatePayload.dimensionHeight = typeof dimensionHeight === "number" && dimensionHeight > 0 ? dimensionHeight : null;
      updatePayload.travelOffered = travelOffered === true;
      updatePayload.travelFeeEnabled = travelOffered === true && travelFeeEnabled === true;
      if (typeof travelFeeType === "string") updatePayload.travelFeeType = travelFeeType;
      updatePayload.travelFeeAmountCents = typeof travelFeeAmountCents === "number" && travelFeeAmountCents >= 0 ? Math.floor(travelFeeAmountCents) : null;
      updatePayload.deliveryOffered = deliveryOffered === true;
      updatePayload.pickupOffered = deliveryOffered === true;
      updatePayload.deliveryFeeEnabled = deliveryOffered === true && deliveryFeeEnabled === true;
      updatePayload.deliveryFeeAmountCents = typeof deliveryFeeAmountCents === "number" && deliveryFeeAmountCents >= 0 ? Math.floor(deliveryFeeAmountCents) : null;
      updatePayload.setupOffered = setupOffered === true;
      updatePayload.setupFeeEnabled = setupOffered === true && setupFeeEnabled === true;
      updatePayload.setupFeeAmountCents = typeof setupFeeAmountCents === "number" && setupFeeAmountCents >= 0 ? Math.floor(setupFeeAmountCents) : null;
      updatePayload.takedownOffered = takedownOffered === true;
      updatePayload.takedownFeeEnabled = takedownOffered === true && takedownFeeEnabled === true;
      updatePayload.takedownFeeAmountCents = typeof takedownFeeAmountCents === "number" && takedownFeeAmountCents >= 0 ? Math.floor(takedownFeeAmountCents) : null;
      if (cancellationPolicyOverride !== undefined) {
        updatePayload.cancellationPolicy = typeof cancellationPolicyOverride?.policy === "string" ? cancellationPolicyOverride.policy : "cancel_anytime";
        updatePayload.cancellationPolicyDays = typeof cancellationPolicyOverride?.hours === "number" ? cancellationPolicyOverride.hours : null;
      }

      const [updated] = await db
        .update(vendorListings)
        .set(updatePayload as any)
        .where(eq(vendorListings.id, pkgId))
        .returning();

      await syncContainerMinPrice(id);
      return res.json(updated);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages PATCH", error);
      return res.status(500).json({ error: "Unable to update package" });
    }
  });

  /**
   * DELETE /api/vendor/listings/:id/packages/:pkgId
   * Deletes a package_item child row.
   */
  app.delete("/api/vendor/listings/:id/packages/:pkgId", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id, pkgId } = req.params;

      const [pkg] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, pkgId),
            eq(vendorListings.parentListingId, id),
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "package_item"),
          )
        )
        .limit(1);

      if (!pkg) return res.status(404).json({ error: "Package not found" });

      await db.delete(vendorListings).where(eq(vendorListings.id, pkgId));
      await syncContainerMinPrice(id);
      return res.status(204).send();
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/packages DELETE", error);
      return res.status(500).json({ error: "Unable to delete package" });
    }
  });

  // ── Add-on Link Endpoints ────────────────────────────────────────────────────

  /**
   * GET /api/vendor/listings/:id/addon-links
   * Returns all add-on listings linked to a parent listing (vendor-scoped).
   */
  app.get("/api/vendor/listings/:id/addon-links", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      // Verify ownership
      const [parent] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);
      if (!parent) return res.status(404).json({ error: "Listing not found" });

      const links = await db
        .select({
          id: listingAddonLinks.id,
          addonListingId: listingAddonLinks.addonListingId,
          title: vendorListings.title,
          priceCents: vendorListings.priceCents,
          pricingUnit: vendorListings.pricingUnit,
          quantity: vendorListings.quantity,
          photos: vendorListings.photos,
          status: vendorListings.status,
        })
        .from(listingAddonLinks)
        .innerJoin(vendorListings, eq(listingAddonLinks.addonListingId, vendorListings.id))
        .where(eq(listingAddonLinks.parentListingId, id))
        .orderBy(asc(vendorListings.title));

      return res.json(links);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/addon-links", error);
      return res.status(500).json({ error: "Unable to load add-on links" });
    }
  });

  /**
   * POST /api/vendor/listings/:id/addon-links
   * Attaches an add-on listing to a parent listing.
   * Body: { addonListingId: string }
   */
  app.post("/api/vendor/listings/:id/addon-links", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id } = req.params;
      const addonListingId = asTrimmedString(req.body?.addonListingId);
      if (!addonListingId) return res.status(400).json({ error: "addonListingId is required" });

      // Verify parent ownership
      const [parent] = await db
        .select({ id: vendorListings.id, listingType: vendorListings.listingType })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);
      if (!parent) return res.status(404).json({ error: "Listing not found" });

      // Verify add-on belongs to same vendor and is addon type
      const [addon] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, addonListingId),
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "addon")
          )
        )
        .limit(1);
      if (!addon) return res.status(400).json({ error: "Add-on listing not found or not owned by you", code: "addon_not_found" });

      // Upsert link (unique constraint handles duplicates gracefully)
      const [link] = await db
        .insert(listingAddonLinks)
        .values({ parentListingId: id, addonListingId })
        .onConflictDoNothing()
        .returning();

      return res.json({ success: true, link: link ?? null });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/addon-links POST", error);
      return res.status(500).json({ error: "Unable to attach add-on" });
    }
  });

  /**
   * DELETE /api/vendor/listings/:id/addon-links/:addonId
   * Removes an add-on link from a parent listing.
   */
  app.delete("/api/vendor/listings/:id/addon-links/:addonId", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const { id, addonId } = req.params;

      // Verify parent ownership
      const [parent] = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .limit(1);
      if (!parent) return res.status(404).json({ error: "Listing not found" });

      await db
        .delete(listingAddonLinks)
        .where(
          and(
            eq(listingAddonLinks.parentListingId, id),
            eq(listingAddonLinks.addonListingId, addonId)
          )
        );

      return res.json({ success: true });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/addon-links DELETE", error);
      return res.status(500).json({ error: "Unable to remove add-on link" });
    }
  });

  /**
   * GET /api/vendor/addon-listings
   * Returns all add-on type listings belonging to this vendor.
   * Used in the "Attach Add-ons" catalog popup.
   */
  app.get("/api/vendor/addon-listings", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      if (!vendorAuth) return res.status(403).json({ error: "Vendor account required" });

      const addons = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          description: vendorListings.description,
          priceCents: vendorListings.priceCents,
          pricingUnit: vendorListings.pricingUnit,
          quantity: vendorListings.quantity,
          status: vendorListings.status,
          photos: vendorListings.photos,
        })
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.accountId, vendorAuth.id),
            eq(vendorListings.listingType, "addon"),
            ne(vendorListings.status, "deleted")
          )
        )
        .orderBy(asc(vendorListings.title));

      return res.json(addons);
    } catch (error: any) {
      logRouteError("/api/vendor/addon-listings", error);
      return res.status(500).json({ error: "Unable to load add-on listings" });
    }
  });

  app.get("/api/rental-types", async (_req, res) => {
    const rows = await db
      .select({ slug: rentalTypes.slug, label: rentalTypes.label })
      .from(rentalTypes)
      .where(eq(rentalTypes.isActive, true));

    return res.json(rows);
  });

  function toNonNegativeInt(value: unknown, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
  }

  function normalizeSpecialties(value: unknown): string[] {
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter((item) => item.length > 0)
            .slice(0, 24)
        )
      );
    }

    if (typeof value === "string") {
      return Array.from(
        new Set(
          value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
            .slice(0, 24)
        )
      );
    }

    return [];
  }

  function normalizePhotoPosition(value: unknown): { x: number; y: number } | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rawX = Number((value as { x?: unknown }).x);
    const rawY = Number((value as { y?: unknown }).y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
    return {
      x: Math.max(-1, Math.min(1, rawX)),
      y: Math.max(-1, Math.min(1, rawY)),
    };
  }

  async function getCompletedBookingsCountForVendor(vendorId: string): Promise<number> {
    const result: any = await db.execute(drizzleSql`
      select count(distinct b.id)::int as "count"
      from bookings b
      left join vendor_listings listing_owner on listing_owner.id = b.listing_id
      left join booking_items bi on b.listing_id is null and bi.booking_id = b.id
      left join vendor_listings legacy_listing on legacy_listing.id = bi.listing_id
      where coalesce(b.vendor_account_id, listing_owner.account_id, legacy_listing.account_id) = ${vendorId}
        and b.status = 'completed'
    `);
    const row = extractRows<{ count?: number | string | null }>(result)[0];
    return toNonNegativeInt(row?.count, 0);
  }

  // Public vendor shop (guest browsing)
  // Returns one vendor's public shop details + active listings. No auth.
  app.get("/api/vendors/public/:vendorId/shop", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");

      const vendorIdParam = asTrimmedString(req.params?.vendorId);
      const requestedProfileId = asTrimmedString(req.query?.profileId);
      if (!vendorIdParam) {
        return res.status(400).json({ error: "Invalid vendor id" });
      }

      let resolvedVendorAccountId = vendorIdParam;
      let resolvedProfileId = requestedProfileId;

      const accountRows = await db
        .select({
          id: vendorAccounts.id,
          businessName: vendorAccounts.businessName,
          activeProfileId: vendorAccounts.activeProfileId,
          shopSlug: vendorAccounts.shopSlug,
        })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.id, resolvedVendorAccountId), eq(vendorAccounts.active, true), isNull(vendorAccounts.deletedAt)))
        .limit(1);

      let account = accountRows[0] as typeof accountRows[0] & { shopSlug: string } | undefined;
      if (!account) {
        const profileOwnerRows = await db
          .select({
            accountId: vendorProfiles.accountId,
            profileId: vendorProfiles.id,
            accountBusinessName: vendorAccounts.businessName,
            accountActiveProfileId: vendorAccounts.activeProfileId,
            accountShopSlug: vendorAccounts.shopSlug,
          })
          .from(vendorProfiles)
          .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
          .where(and(eq(vendorProfiles.id, vendorIdParam), eq(vendorProfiles.active, true), eq(vendorAccounts.active, true), isNull(vendorAccounts.deletedAt)))
          .limit(1);
        const profileOwner = profileOwnerRows[0];
        if (profileOwner?.accountId) {
          resolvedVendorAccountId = profileOwner.accountId;
          resolvedProfileId = resolvedProfileId || profileOwner.profileId;
          account = {
            id: profileOwner.accountId,
            businessName: profileOwner.accountBusinessName,
            activeProfileId: profileOwner.accountActiveProfileId,
            shopSlug: profileOwner.accountShopSlug,
          };
        }
      }
      // Third path: resolve by shop_slug (slug-based URLs like /shop/my-flower-shop)
      if (!account) {
        const slugRows = await db
          .select({
            id: vendorAccounts.id,
            businessName: vendorAccounts.businessName,
            activeProfileId: vendorAccounts.activeProfileId,
            shopSlug: vendorAccounts.shopSlug,
          })
          .from(vendorAccounts)
          .where(and(eq(vendorAccounts.shopSlug, vendorIdParam), eq(vendorAccounts.active, true), isNull(vendorAccounts.deletedAt)))
          .limit(1);
        if (slugRows[0]) {
          resolvedVendorAccountId = slugRows[0].id;
          account = slugRows[0];
        }
      }
      if (!account) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      await deactivateActiveListingsViolatingPublishGate(resolvedVendorAccountId);

      const profileWhere = resolvedProfileId
        ? and(
            eq(vendorProfiles.accountId, resolvedVendorAccountId),
            eq(vendorProfiles.id, resolvedProfileId),
            eq(vendorProfiles.active, true)
          )
        : account.activeProfileId
          ? and(
              eq(vendorProfiles.accountId, resolvedVendorAccountId),
              eq(vendorProfiles.id, account.activeProfileId),
              eq(vendorProfiles.active, true)
            )
          : and(eq(vendorProfiles.accountId, resolvedVendorAccountId), eq(vendorProfiles.active, true));

      const profileRows = await db
        .select()
        .from(vendorProfiles)
        .where(profileWhere)
        .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id))
        .limit(1);
      if (resolvedProfileId && !profileRows[0]) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const selectedProfile =
        profileRows[0] ||
        (
          await db
            .select()
            .from(vendorProfiles)
            .where(and(eq(vendorProfiles.accountId, resolvedVendorAccountId), eq(vendorProfiles.active, true)))
            .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id))
            .limit(1)
        )[0];

      if (!selectedProfile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const vendor = {
        id: account.id,
        businessName: getProfileDisplayName(selectedProfile, account.businessName),
        serviceDescription: selectedProfile.serviceDescription,
        city: selectedProfile.city,
        onlineProfiles: selectedProfile.onlineProfiles,
      };

      const onlineProfiles =
        vendor.onlineProfiles && typeof vendor.onlineProfiles === "object" && !Array.isArray(vendor.onlineProfiles)
          ? (vendor.onlineProfiles as Record<string, unknown>)
          : {};
      const aboutBusiness = asTrimmedString((onlineProfiles as any).aboutBusiness);
      const aboutOwner = asTrimmedString((onlineProfiles as any).aboutOwner);
      const profileImageUrl = resolveStoredUploadPath(asTrimmedString((onlineProfiles as any).shopProfileImageUrl));
      const coverImageUrl = resolveStoredUploadPath(asTrimmedString((onlineProfiles as any).shopCoverImageUrl));
      const coverImagePosition = normalizePhotoPosition((onlineProfiles as any).shopCoverImagePosition);
      const tagline = asTrimmedString((onlineProfiles as any).shopTagline);
      const serviceArea = asTrimmedString((onlineProfiles as any).serviceAreaLabel);
      const inBusinessSinceYear = asTrimmedString((onlineProfiles as any).inBusinessSinceYear);
      const yearsInBusiness = asTrimmedString((onlineProfiles as any).yearsInBusiness);
      const hobbies = serializeHobbyList((onlineProfiles as any).hobbies);
      const likesDislikes = asTrimmedString((onlineProfiles as any).likesDislikes);
      const homeState = asTrimmedString((onlineProfiles as any).homeState);
      const funFacts = asTrimmedString((onlineProfiles as any).funFacts);
      const specialties = normalizeSpecialties((onlineProfiles as any).specialties);
      const eventsServedBaseline = toNonNegativeInt((onlineProfiles as any).eventsServedBaseline, 0);

      const listings = await db
        .select({
          id: vendorListings.id,
          status: vendorListings.status,
          listingType: vendorListings.listingType,
          sortOrder: vendorListings.sortOrder,
          category: vendorListings.category,
          subcategory: vendorListings.subcategory,
          subcategoryDetail: vendorListings.subcategoryDetail,
          title: vendorListings.title,
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
          vendorName: vendorProfiles.profileName,
        })
        .from(vendorListings)
        .innerJoin(vendorAccounts, eq(vendorListings.accountId, vendorAccounts.id))
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .where(
          and(
            eq(vendorListings.accountId, resolvedVendorAccountId),
            eq(vendorListings.profileId, selectedProfile.id),
            eq(vendorListings.status, "active"),
            eq(vendorProfiles.active, true),
            eq(vendorAccounts.active, true),
            // package_item rows are child-only — they appear inside a container, not standalone
            ne(vendorListings.listingType, "package_item")
          )
        )
        .orderBy(asc(vendorListings.sortOrder), asc(vendorListings.createdAt), asc(vendorListings.id));

      const compliantListings = listings.filter(
        (listing) =>
          isListingPubliclyCompliant({
            listingDataRaw: (listing as any)?.listingData,
            canonicalCategory: (listing as any)?.category,
            canonicalPriceCents: (listing as any)?.priceCents,
            canonicalPhotos: (listing as any)?.photos,
          })
      );

      const listingsWithVendorMeta = compliantListings.map((listing: any) => ({
        ...listing,
        photos: (listing.photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
        vendorName: asTrimmedString(listing?.vendorName) || vendor.businessName,
        vendorProfileImageUrl: profileImageUrl || null,
      }));

      const reviewRowsResult: any = await db.execute(drizzleSql`
        select
          lr.id,
          lr.rating,
          lr.title,
          lr.body,
          lr.created_at as "createdAt",
          coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "authorName",
          coalesce(nullif(vl.title, ''), 'Event') as "eventLabel"
        from listing_reviews lr
        inner join vendor_listings vl on vl.id = lr.listing_id
        left join users u on u.id = lr.user_id
        where vl.account_id = ${resolvedVendorAccountId}
          and vl.profile_id = ${selectedProfile.id}
          and coalesce(lr.is_published, true) = true
        order by lr.created_at desc
        limit 200
      `);

      const reviewRows = extractRows<{
        id?: string | null;
        rating?: number | string | null;
        title?: string | null;
        body?: string | null;
        createdAt?: string | Date | null;
        authorName?: string | null;
        eventLabel?: string | null;
      }>(reviewRowsResult);

      const reviews = reviewRows
        .map((row) => ({
          id: String(row.id || "").trim(),
          rating: Number(row.rating || 0),
          title: typeof row.title === "string" ? row.title : null,
          body: typeof row.body === "string" ? row.body : "",
          createdAt: row.createdAt ?? null,
          authorName:
            typeof row.authorName === "string" && row.authorName.trim().length > 0
              ? row.authorName.trim()
              : "Customer",
          eventLabel:
            typeof row.eventLabel === "string" && row.eventLabel.trim().length > 0
              ? row.eventLabel.trim()
              : "Event",
        }))
        .filter((row) => row.id.length > 0 && Number.isFinite(row.rating) && row.rating > 0);

      const reviewCount = reviews.length;
      const rating = reviewCount > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
        : 0;

      const reviewBreakdown = {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      } as Record<1 | 2 | 3 | 4 | 5, number>;

      for (const review of reviews) {
        const star = Math.max(1, Math.min(5, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
        reviewBreakdown[star] += 1;
      }

      const completedBookingsRows: any = await db.execute(drizzleSql`
        select count(distinct b.id)::int as "count"
        from bookings b
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join lateral (
          select bi.listing_id
          from booking_items bi
          where b.listing_id is null
            and bi.booking_id = b.id
          order by bi.id asc
          limit 1
        ) legacy_item on true
        left join vendor_listings legacy_listing on legacy_listing.id = legacy_item.listing_id
        where coalesce(listing_owner.account_id, legacy_listing.account_id) = ${resolvedVendorAccountId}
          and coalesce(listing_owner.profile_id, legacy_listing.profile_id) = ${selectedProfile.id}
          and b.status = 'completed'
      `);
      const completedBookingsCount = Number(
        extractRows<{ count?: number | string }>(completedBookingsRows)[0]?.count || 0
      );
      const eventsServedTotal = eventsServedBaseline + completedBookingsCount;

      const chatContexts = await listVendorBookingChatContexts(resolvedVendorAccountId);
      const chatBookingIds = chatContexts
        .map((row) => row.bookingId)
        .filter((id) => id.length > 0);
      let avgResponseMinutes: number | null = null;
      try {
        avgResponseMinutes = await getAverageVendorResponseMinutesForBookings({
          vendorAccountId: resolvedVendorAccountId,
          bookingIds: chatBookingIds,
          channelLimit: 40,
          messageLimitPerChannel: 120,
        });
      } catch (error) {
        logger.warn({ err: error }, "avg response time compute failed");
        avgResponseMinutes = null;
      }

      return res.json({
        vendor: {
          id: vendor.id,
          profileId: selectedProfile.id,
          businessName: vendor.businessName,
          shopSlug: account.shopSlug || null,
          aboutBusiness: aboutBusiness || null,
          aboutOwner: aboutOwner || null,
          profileImageUrl: profileImageUrl || null,
          coverImageUrl: coverImageUrl || null,
          coverImagePosition,
          tagline: tagline || null,
          serviceArea: serviceArea || null,
          serviceRadius: selectedProfile.serviceRadius ?? null,
          inBusinessSinceYear: inBusinessSinceYear || null,
          yearsInBusiness: yearsInBusiness || null,
          hobbies: hobbies || null,
          likesDislikes: likesDislikes || null,
          homeState: homeState || null,
          funFacts: funFacts || null,
          specialties,
          eventsServedBaseline,
          completedBookingsCount,
          eventsServedTotal,
          avgResponseMinutes: Number.isFinite(avgResponseMinutes as number) ? avgResponseMinutes : null,
          activeListingsCount: listingsWithVendorMeta.length,
          rating,
          reviewCount,
          reviewBreakdown,
          reviews: reviews.slice(0, 60),
          city: vendor.city,
        },
        listings: listingsWithVendorMeta,
      });
    } catch (error: any) {
      logRouteError("/api/vendors/public/:vendorId/shop", error);
      return res.status(500).json({ error: "Unable to load vendor storefront" });
    }
  });

  // ── Vendor Availability: Vacation Blocks & Shop Status ─────────────────────

  // GET /api/vendor/vacation-blocks  — list vendor's vacation blocks
  app.get("/api/vendor/vacation-blocks", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const rows = await db
        .select()
        .from(vendorVacationBlocks)
        .where(eq(vendorVacationBlocks.vendorId, vendorAuth.id))
        .orderBy(asc(vendorVacationBlocks.startDate));
      return res.json(rows);
    } catch (error: any) {
      logRouteError("/api/vendor/vacation-blocks GET", error);
      return res.status(500).json({ error: "Unable to load vacation blocks" });
    }
  });

  // POST /api/vendor/vacation-blocks  — create a vacation block
  app.post("/api/vendor/vacation-blocks", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { startDate, endDate } = req.body;

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if (
        typeof startDate !== "string" || !datePattern.test(startDate) ||
        typeof endDate !== "string" || !datePattern.test(endDate)
      ) {
        return res.status(400).json({ error: "startDate and endDate are required in YYYY-MM-DD format" });
      }
      if (endDate < startDate) {
        return res.status(400).json({ error: "endDate must be on or after startDate" });
      }

      const insertBlock = async () =>
        db
          .insert(vendorVacationBlocks)
          .values({ id: crypto.randomUUID(), vendorId: vendorAuth.id, startDate, endDate })
          .returning();

      let blockRows;
      try {
        blockRows = await insertBlock();
      } catch (error: any) {
        if (typeof error?.code === "string" && error.code === "42P01") {
          await db.execute(drizzleSql`
            create table if not exists vendor_vacation_blocks (
              id          varchar primary key default gen_random_uuid(),
              vendor_id   varchar not null references vendor_accounts(id) on delete cascade,
              start_date  text not null,
              end_date    text not null,
              created_at  timestamp with time zone not null default now()
            );
          `);
          await db.execute(drizzleSql`
            create index if not exists idx_vendor_vacation_blocks_vendor_id
              on vendor_vacation_blocks (vendor_id);
          `);
          blockRows = await insertBlock();
        } else {
          throw error;
        }
      }

      const [block] = blockRows;

      // Sync vacation block to Google Calendar if vendor is connected (non-fatal)
      try {
        const vendorAccount = await getVendorAccountFromRequest(req);
        const calendarId = asTrimmedString(vendorAccount?.googleCalendarId);
        const isConnected = asTrimmedString(vendorAccount?.googleConnectionStatus).toLowerCase() === "connected";
        if (isConnected && calendarId && vendorAccount?.id) {
          const googleEventId = await createGoogleVacationBlockEvent(vendorAccount.id, calendarId, block);
          if (googleEventId) {
            await db
              .update(vendorVacationBlocks)
              .set({ googleEventId, googleCalendarId: calendarId })
              .where(eq(vendorVacationBlocks.id, block.id));
            block.googleEventId = googleEventId;
            block.googleCalendarId = calendarId;
          }
        }
      } catch (googleErr) {
        logRouteError("/api/vendor/vacation-blocks POST google-sync", googleErr);
      }

      return res.status(201).json(block);
    } catch (error: any) {
      logRouteError("/api/vendor/vacation-blocks POST", error);
      return res.status(500).json({ error: "Unable to create vacation block" });
    }
  });

  // DELETE /api/vendor/vacation-blocks/:id  — delete a vacation block
  app.delete("/api/vendor/vacation-blocks/:id", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const blockId = String(req.params.id || "").trim();

      // Fetch the block before deletion so we can clean up the Google Calendar event
      const [existingBlock] = await db
        .select()
        .from(vendorVacationBlocks)
        .where(
          and(
            eq(vendorVacationBlocks.id, blockId),
            eq(vendorVacationBlocks.vendorId, vendorAuth.id)
          )
        )
        .limit(1);

      if (!existingBlock) {
        return res.status(404).json({ error: "Vacation block not found" });
      }

      // Delete the linked Google Calendar event (non-fatal)
      const googleEventId = asTrimmedString(existingBlock.googleEventId);
      const googleCalendarId = asTrimmedString(existingBlock.googleCalendarId);
      if (googleEventId && googleCalendarId) {
        try {
          await deleteGoogleCalendarEvent(vendorAuth.id, googleCalendarId, googleEventId);
        } catch (googleErr) {
          logRouteError("/api/vendor/vacation-blocks/:id DELETE google-event", googleErr);
        }
      }

      const deleted = await db
        .delete(vendorVacationBlocks)
        .where(eq(vendorVacationBlocks.id, blockId))
        .returning({ id: vendorVacationBlocks.id });

      return res.json({ deleted: deleted[0].id });
    } catch (error: any) {
      logRouteError("/api/vendor/vacation-blocks/:id DELETE", error);
      return res.status(500).json({ error: "Unable to delete vacation block" });
    }
  });

  // PATCH /api/vendor/shop-status  — toggle shop open/closed
  app.patch("/api/vendor/shop-status", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { shopActive } = req.body;

      if (typeof shopActive !== "boolean") {
        return res.status(400).json({ error: "shopActive must be a boolean" });
      }

      const updated = await db
        .update(vendorAccounts)
        .set({ shopActive })
        .where(eq(vendorAccounts.id, vendorAuth.id))
        .returning({ id: vendorAccounts.id, shopActive: vendorAccounts.shopActive });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Vendor account not found" });
      }
      return res.json({ shopActive: updated[0].shopActive });
    } catch (error: any) {
      logRouteError("/api/vendor/shop-status PATCH", error);
      return res.status(500).json({ error: "Unable to update shop status" });
    }
  });

  // Public Listings (guest browsing)
  // Returns only active listings. No auth.
  // Supports server-side filtering via query params:
  //   category          — exact match (e.g. "rentals", "services", "venues", "catering")
  //   subs              — comma-separated subcategory values (OR match)
  //   details           — comma-separated subcategoryDetail values (OR match)
  //   minPrice          — minimum price in dollars (inclusive)
  //   maxPrice          — maximum price in dollars (inclusive)
  //   sort              — "recommended" (default, newest first) | "price-asc" | "price-desc"
  //   limit             — max rows to return (default 100, max 500)
  //   offset            — rows to skip for pagination (default 0)
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
        conditions.push(eq(vendorListings.category, categoriesFilter[0]) as any);
      } else if (categoriesFilter.length > 1) {
        conditions.push(inArray(vendorListings.category, categoriesFilter) as any);
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

      // Sort order
      const orderBy =
        rawSort === "price-asc"
          ? asc(vendorListings.priceCents)
          : rawSort === "price-desc"
          ? desc(vendorListings.priceCents)
          : desc(vendorListings.createdAt); // "recommended" = newest first

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
          .orderBy(orderBy)
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

  // Available subcategories — returns only values that appear on at least one active listing.
  // Used by hero search, browse filters, and admin dashboard to avoid showing empty options.
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

    // Public Listing Detail (guest browsing) added 1/22/26
  // Returns one active listing by id. No auth.
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

  app.get("/api/vendor/listings", requireDualAuthAuth0, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json([]);
      }
      await deactivateActiveListingsViolatingPublishGate(vendorAuth.id);

      // Backfill legacy rows that predate profile ownership.
      await db
        .update(vendorListings)
        .set({ profileId: activeProfileId })
        .where(and(eq(vendorListings.accountId, vendorAuth.id), isNull(vendorListings.profileId)));

      const requestedStatus = asTrimmedString(req.query?.status).toLowerCase();
      if (requestedStatus && !["active", "draft", "inactive"].includes(requestedStatus)) {
        return res.status(400).json({ error: "Invalid status filter" });
      }

      let whereClause = and(
        eq(vendorListings.accountId, vendorAuth.id),
        eq(vendorListings.profileId, activeProfileId),
        ne(vendorListings.status, "deleted")
      );
      if (requestedStatus) {
        whereClause = and(whereClause, eq(vendorListings.status, requestedStatus as any));
      }

      const listings = await db
        .select()
        .from(vendorListings)
        .where(whereClause)
        .orderBy(desc(vendorListings.updatedAt), desc(vendorListings.createdAt), asc(vendorListings.id));

      res.json(listings.map((l) => ({
        ...l,
        photos: (l.photos ?? []).map((p) => resolveStoredUploadPath(p) ?? p),
      })));
    } catch (error: any) {
      logRouteError("/api/vendor/listings", error);
      res.status(500).json({ error: "Unable to load listings" });
    }
  });

  app.get("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const { id } = req.params;

      const listings = await db
        .select()
        .from(vendorListings)
        .where(
          and(
            eq(vendorListings.id, id),
            eq(vendorListings.accountId, vendorAuth.id)
          )
        );

      if (listings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((listings[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listings[0]?.profileId && listings[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }
      const resolvePhotos = (row: any) => ({
        ...row,
        photos: (row?.photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
      });

      if (!listings[0]?.profileId) {
        const [backfilled] = await db
          .update(vendorListings)
          .set({ profileId: activeProfileId, updatedAt: new Date() })
          .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
          .returning();
        return res.json(resolvePhotos(backfilled));
      }

      res.json(resolvePhotos(listings[0]));
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id", error);
      res.status(500).json({ error: "Unable to load listing" });
    }
  });

  app.delete("/api/vendor/listings/:id", mutationRateLimiter, requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if ((existing[0]?.status || "").toLowerCase() === "deleted") {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (existing[0]?.profileId && existing[0].profileId !== activeProfileId) {
        return res.status(404).json({ error: "Listing not found in active profile" });
      }
      if (!existing[0]?.profileId) {
        await db
          .update(vendorListings)
          .set({ profileId: activeProfileId, updatedAt: new Date() })
          .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));
      }

      const bookingHistoryResult: any = await db.execute(drizzleSql`
        select count(distinct b.id)::int as "count"
        from bookings b
        left join booking_items bi on bi.booking_id = b.id
        where b.listing_id = ${id}
           or (b.listing_id is null and bi.listing_id = ${id})
      `);
      const preservedBookingHistoryCount = Number(
        extractRows<{ count?: number | string | null }>(bookingHistoryResult)[0]?.count || 0
      );

      const activeBookingCheckResult: any = await db.execute(drizzleSql`
        select count(distinct b.id)::int as "count"
        from bookings b
        left join booking_items bi on bi.booking_id = b.id
        where (b.listing_id = ${id} or (b.listing_id is null and bi.listing_id = ${id}))
          and b.status in ('pending', 'confirmed')
      `);
      const activeBookingCount = Number(
        extractRows<{ count?: number | string | null }>(activeBookingCheckResult)[0]?.count || 0
      );
      if (activeBookingCount > 0) {
        return res.status(409).json({
          error: "Cannot delete a listing with active bookings. Cancel or complete all pending and confirmed bookings first.",
          code: "listing_has_active_bookings",
          activeBookingCount,
        });
      }

      const [inactivatedListing] = await db
        .update(vendorListings)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning({
          id: vendorListings.id,
          status: vendorListings.status,
        });

      return res.json({
        listingId: inactivatedListing?.id ?? id,
        status: inactivatedListing?.status ?? "deleted",
        action: "deleted",
        hiddenFromVendor: true,
        preservedBookingHistoryCount,
      });
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id DELETE", error);
      return res.status(500).json({ error: "Unable to deactivate listing" });
    }
  });

  // Stripe Connect onboarding routes ✅ Auth0-only now
  // accountType is optional — V2 Connect uses a unified "recipient" configuration,
  // so new accounts do not need an explicit type. Kept for backward compatibility
  // with any existing UI that still sends the field.
  const stripeOnboardingSchema = z.object({
    accountType: z.enum(["express", "standard", "recipient"]).optional(),
    businessName: z.string().min(2),
  });

  app.post("/api/vendor/connect/onboard", onboardingRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const { businessName } = stripeOnboardingSchema.parse(req.body);
      const account = await getVendorAccountFromRequest(req);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      if (account.stripeConnectId) {
        return res.status(400).json({ error: "Stripe account already connected" });
      }

      const { createConnectAccount } = await import("./stripe");

      // Creates a V2 Connect account (unified "recipient" configuration —
      // the platform collects fees and controls when funds are transferred).
      const result = await createConnectAccount({
        email: account.email,
        businessName,
      });

      // Store "recipient" to indicate this is a V2 account.
      // V1 accounts stored "express" or "standard" here.
      await db
        .update(vendorAccounts)
        .set({
          stripeConnectId: result.accountId,
          stripeAccountType: "recipient",
        })
        .where(eq(vendorAccounts.id, account.id));

      res.json({
        accountId: result.accountId,
        onboardingUrl: result.onboardingUrl,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/connect/status", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account || !account.stripeConnectId) {
        return res.json({ connected: false });
      }

      const { checkAccountOnboardingStatus, ensureManualPayoutSchedule } = await import("./stripe");
      const status = await checkAccountOnboardingStatus(account.stripeConnectId);

      if (status.complete && !account.stripeOnboardingComplete) {
        await db
          .update(vendorAccounts)
          .set({ stripeOnboardingComplete: true })
          .where(eq(vendorAccounts.id, account.id));
      }
      if (status.complete && !status.manualPayoutSchedule) {
        await ensureManualPayoutSchedule(account.stripeConnectId);
      }

      res.json({
        connected: true,
        complete: status.complete,
        detailsSubmitted: status.detailsSubmitted,
        chargesEnabled: status.chargesEnabled,
        manualPayoutSchedule: true,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/connect/dashboard", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account || !account.stripeConnectId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }

      const { createDashboardLoginLink } = await import("./stripe");
      const url = await createDashboardLoginLink(account.stripeConnectId);

      res.json({ url });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/connect/setup-link", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const businessName = (account.businessName || "").trim() || "EventHub Vendor";

      if (!account.stripeConnectId) {
        const { createConnectAccount } = await import("./stripe");

        // Creates a V2 Connect account with recipient configuration.
        const result = await createConnectAccount({
          email: account.email,
          businessName,
        });

        if (!result.onboardingUrl) {
          return res.status(500).json({ error: "Could not generate Stripe onboarding link" });
        }

        await db
          .update(vendorAccounts)
          .set({
            stripeConnectId: result.accountId,
            stripeAccountType: "recipient", // V2 unified account type
            stripeOnboardingComplete: false,
          })
          .where(eq(vendorAccounts.id, account.id));

        return res.json({ url: result.onboardingUrl });
      }

      const {
        checkAccountOnboardingStatus,
        createDashboardLoginLink,
        createAccountOnboardingLink,
        ensureManualPayoutSchedule,
      } = await import("./stripe");
      const status = await checkAccountOnboardingStatus(account.stripeConnectId);

      if (status.complete) {
        if (!account.stripeOnboardingComplete) {
          await db
            .update(vendorAccounts)
            .set({ stripeOnboardingComplete: true })
            .where(eq(vendorAccounts.id, account.id));
        }

        // For V1 "standard" accounts (created before the V2 migration),
        // send vendors to the full Stripe dashboard directly.
        if (account.stripeAccountType === "standard") {
          return res.json({ url: "https://dashboard.stripe.com" });
        }

        // For V1 "express" accounts, ensure manual payout schedule.
        // V2 "recipient" accounts skip this — manualPayoutSchedule is always
        // true because transfers are platform-initiated (no auto-payouts).
        if (!status.manualPayoutSchedule) {
          await ensureManualPayoutSchedule(account.stripeConnectId);
        }

        const url = await createDashboardLoginLink(account.stripeConnectId);
        return res.json({ url });
      }

      if (account.stripeOnboardingComplete) {
        await db
          .update(vendorAccounts)
          .set({ stripeOnboardingComplete: false })
          .where(eq(vendorAccounts.id, account.id));
      }

      const url = await createAccountOnboardingLink(account.stripeConnectId);
      return res.json({ url });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // Vendor Dashboard & Management Routes ✅ Auth0-only now
  app.get("/api/vendor/stats", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.json({
          totalBookings: 0,
          bookingsThisMonth: 0,
          revenue: 0,
          revenueGrowth: 0,
          profileViews: 0,
          profileViewsGrowth: 0,
          recentBookings: [],
        });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json({
          totalBookings: 0,
          bookingsThisMonth: 0,
          revenue: 0,
          revenueGrowth: 0,
          profileViews: 0,
          profileViewsGrowth: 0,
          recentBookings: [],
        });
      }

      const normalizeAmountToCents = (value: unknown) => {
        const n = Number(value ?? 0);
        if (!Number.isFinite(n) || n <= 0) return 0;
        // The current booking flow always writes amounts in cents (integers).
        // Non-integer values are legacy float-dollar rows (e.g. 36.80 → 3680 cents).
        if (!Number.isInteger(n)) return Math.round(n * 100);
        return Math.round(n);
      };

      let bookingRows: Array<{
        id: string;
        status: string | null;
        totalAmount: number | null;
        vendorProfileId?: string | null;
        createdAt: Date | string | null;
        eventDate: string | null;
        eventLocation: string | null;
      }> = [];
      const rows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.total_amount as "totalAmount",
          b.listing_title_snapshot as "listingTitleSnapshot",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          b.created_at as "createdAt",
          coalesce(b.event_date::text, e.date) as "eventDate",
          b.event_location as "eventLocation"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
        order by b.created_at desc
      `);
      bookingRows = extractRows(rows);

      const bookingRowsWithContext = await attachBookingItemContext(bookingRows as any);
      const profileCount = Array.isArray(profileContext?.profiles) ? profileContext.profiles.length : 0;
      const scopedBookingRows = bookingRowsWithContext.filter((row: any) =>
        bookingRowMatchesActiveProfile(row, activeProfileId, profileCount)
      ) as any[];

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(weekStart.getDate() - 7);

      const totalBookings = scopedBookingRows.length;
      const bookingsThisMonth = scopedBookingRows.filter((r: any) => {
        const created = r.createdAt ? new Date(r.createdAt) : null;
        return created instanceof Date && !isNaN(created.getTime()) && created >= monthStart;
      }).length;

      const revenueRows = scopedBookingRows.filter((r: any) => {
        const s = String(r.status || "").toLowerCase();
        return s === "confirmed" || s === "completed";
      });
      const revenue = revenueRows.reduce((sum, r) => sum + normalizeAmountToCents(r.totalAmount), 0);

      const revenueThisMonth = revenueRows.reduce((sum, r) => {
        const created = r.createdAt ? new Date(r.createdAt) : null;
        if (!(created instanceof Date) || isNaN(created.getTime()) || created < monthStart) return sum;
        return sum + normalizeAmountToCents(r.totalAmount);
      }, 0);
      const revenueLastMonth = revenueRows.reduce((sum, r) => {
        const created = r.createdAt ? new Date(r.createdAt) : null;
        if (
          !(created instanceof Date) ||
          isNaN(created.getTime()) ||
          created < lastMonthStart ||
          created >= monthStart
        ) {
          return sum;
        }
        return sum + normalizeAmountToCents(r.totalAmount);
      }, 0);
      const revenueGrowth =
        revenueLastMonth > 0
          ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100)
          : revenueThisMonth > 0
            ? 100
            : 0;

      let profileViews = 0;
      let profileViewsGrowth = 0;
      try {
        const viewsRows: any = await db.execute(drizzleSql`
          select lt.occurred_at as "occurredAt"
          from listing_traffic lt
          inner join vendor_listings vl on vl.id = lt.listing_id
          where vl.account_id = ${vendorAccountId}
            and vl.profile_id = ${activeProfileId}
            and lt.event_type = 'view'
        `);
        const views = extractRows<{ occurredAt?: Date | string }>(viewsRows);
        profileViews = views.length;
        const thisWeekViews = views.filter((v) => {
          const d = v.occurredAt ? new Date(v.occurredAt) : null;
          return d instanceof Date && !isNaN(d.getTime()) && d >= weekStart;
        }).length;
        const lastWeekViews = views.filter((v) => {
          const d = v.occurredAt ? new Date(v.occurredAt) : null;
          return d instanceof Date && !isNaN(d.getTime()) && d >= lastWeekStart && d < weekStart;
        }).length;
        profileViewsGrowth =
          lastWeekViews > 0
            ? Math.round(((thisWeekViews - lastWeekViews) / lastWeekViews) * 100)
            : thisWeekViews > 0
              ? 100
              : 0;
      } catch {
        // listing_traffic table may not exist in all environments — return zero views.
      }

      const recentBookingRows = scopedBookingRows
        .slice()
        .sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dbt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dbt - da;
        })
        .slice(0, 6);

      const recentBookingsWithContext = await attachBookingItemContext(recentBookingRows as any);

      const recentBookings = recentBookingsWithContext.map((r: any) => ({
          id: r.id,
          itemTitle: typeof r.itemTitle === "string" && r.itemTitle.trim().length > 0 ? r.itemTitle.trim() : null,
          status: String(r.status || "pending").toLowerCase(),
          totalAmount: normalizeAmountToCents(r.totalAmount),
          eventDate: r.eventDate,
          eventLocation: r.eventLocation,
          createdAt: r.createdAt,
        }));

      return res.json({
        totalBookings,
        bookingsThisMonth,
        revenue,
        revenueGrowth,
        profileViews,
        profileViewsGrowth,
        recentBookings,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  async function attachBookingItemContext<
    T extends {
      id: string;
      specialRequests?: string | null;
      eventTitle?: string | null;
      listingTitleSnapshot?: string | null;
      listingId?: string | null;
      bookedQuantity?: number | null;
      deliveryFeeAmountCents?: number | null;
      setupFeeAmountCents?: number | null;
      travelFeeAmountCents?: number | null;
      logisticsTotalCents?: number | null;
      baseSubtotalCents?: number | null;
      subtotalAmountCents?: number | null;
      customerFeeAmountCents?: number | null;
    }
  >(rows: T[]) {
    if (!Array.isArray(rows) || rows.length === 0) return rows as Array<T & {
      itemTitle?: string | null;
      customerNotes?: string | null;
      customerQuestions?: string | null;
      listingDescription?: string | null;
      listingId?: string | null;
      listingProfileId?: string | null;
      bookedQuantity?: number;
      deliveryFeeAmountCents?: number | null;
      setupFeeAmountCents?: number | null;
      travelFeeAmountCents?: number | null;
      logisticsTotalCents?: number | null;
      baseSubtotalCents?: number | null;
      subtotalAmountCents?: number | null;
      customerFeeAmountCents?: number | null;
      includedItems?: string[];
      deliveryIncluded?: boolean | null;
      setupIncluded?: boolean | null;
      addOnItems?: { title: string; priceCents: number }[];
    }>;

    return Promise.all(
      rows.map(async (row) => {
        const itemRes: any = await db.execute(drizzleSql`
          select
            bi.item_type as "itemType",
            bi.title,
            bi.unit_price_cents as "unitPriceCents",
            bi.total_price_cents as "totalPriceCents",
            bi.listing_id as "listingId",
            bi.item_data as "itemData",
            vl.title as "listingTitle",
            vl.description as "listingDescription",
            vl.whats_included as "listingWhatsIncluded",
            vl.delivery_offered as "deliveryOffered",
            vl.setup_offered as "setupOffered",
            vl.profile_id as "listingProfileId",
            nullif(trim(parent_listing.title), '') as "parentListingTitle"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          left join vendor_listings parent_listing on parent_listing.id = vl.parent_listing_id
          where bi.booking_id = ${row.id}
          order by bi.item_type = 'base' desc
        `);
        const allBookingItems = extractRows<{
          itemType?: string | null;
          unitPriceCents?: number | null;
          totalPriceCents?: number | null;
          title?: string | null;
          listingId?: string | null;
          itemData?: any;
          listingTitle?: string | null;
          listingDescription?: string | null;
          listingWhatsIncluded?: string[] | null;
          deliveryOffered?: boolean | null;
          setupOffered?: boolean | null;
          listingProfileId?: string | null;
          parentListingTitle?: string | null;
        }>(itemRes);
        const item = allBookingItems.find(i => i.itemType !== "addon") ?? allBookingItems[0];
        const addOnItems: { title: string; priceCents: number }[] = allBookingItems
          .filter(i => i.itemType === "addon")
          .map(i => ({ title: i.title ?? "Add-on", priceCents: i.totalPriceCents ?? i.unitPriceCents ?? 0 }));
        const itemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
        const listingSnapshot =
          itemData?.listingSnapshot && typeof itemData.listingSnapshot === "object"
            ? itemData.listingSnapshot
            : {};
        const itemLogisticsFees =
          itemData?.logisticsFees && typeof itemData.logisticsFees === "object"
            ? itemData.logisticsFees
            : {};

        const itemTitleFromBookingSnapshot = normalizeListingTitleCandidate((row as any)?.listingTitleSnapshot);
        const itemTitleFromItem = normalizeListingTitleCandidate(item?.title);
        const itemTitleFromItemData =
          normalizeListingTitleCandidate(itemData?.listingTitle) ??
          normalizeListingTitleCandidate(listingSnapshot?.title);
        const itemTitleFromListing = normalizeListingTitleCandidate(item?.listingTitle);
        const resolvedItemTitle =
          itemTitleFromBookingSnapshot ?? itemTitleFromItem ?? itemTitleFromItemData ?? itemTitleFromListing;

        const notesFromItem =
          typeof itemData?.customerNotes === "string" && itemData.customerNotes.trim().length > 0
            ? itemData.customerNotes.trim()
            : null;
        const questionsFromItem =
          typeof itemData?.customerQuestions === "string" && itemData.customerQuestions.trim().length > 0
            ? itemData.customerQuestions.trim()
            : null;
        const customerEventTitleFromItem =
          typeof itemData?.customerEvent?.title === "string" && itemData.customerEvent.title.trim().length > 0
            ? itemData.customerEvent.title.trim()
            : null;
        const notesFallback =
          typeof row.specialRequests === "string" && row.specialRequests.trim().length > 0
            ? row.specialRequests.trim()
            : null;
        const descriptionFromSnapshot =
          typeof listingSnapshot?.listingDescription === "string" && listingSnapshot.listingDescription.trim().length > 0
            ? listingSnapshot.listingDescription.trim()
            : null;
        const descriptionFromTypedListing =
          typeof item?.listingDescription === "string" && item.listingDescription.trim().length > 0
            ? item.listingDescription.trim()
            : null;
        const normalizedIncluded = Array.from(
          new Set(
            [
              ...(Array.isArray(item?.listingWhatsIncluded) ? item.listingWhatsIncluded : []),
              ...(Array.isArray(listingSnapshot?.included) ? listingSnapshot.included : []),
              ...(Array.isArray(listingSnapshot?.includedItems) ? listingSnapshot.includedItems : []),
            ]
              .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
              .filter((entry) => entry.length > 0)
          )
        );
        const deliveryIncluded =
          typeof item?.deliveryOffered === "boolean"
            ? item.deliveryOffered
            : typeof listingSnapshot?.deliveryIncluded === "boolean"
              ? listingSnapshot.deliveryIncluded
              : null;
        const setupIncluded =
          typeof item?.setupOffered === "boolean"
            ? item.setupOffered
            : typeof listingSnapshot?.setupIncluded === "boolean"
              ? listingSnapshot.setupIncluded
              : null;
        const bookedQuantity =
          parseIntegerValue((row as any)?.bookedQuantity) ??
          parseIntegerValue(itemData?.quantity) ??
          1;
        const deliveryFeeAmountCents =
          parseIntegerValue((row as any)?.deliveryFeeAmountCents) ??
          parseIntegerValue(itemLogisticsFees?.deliveryFeeCents);
        const setupFeeAmountCents =
          parseIntegerValue((row as any)?.setupFeeAmountCents) ??
          parseIntegerValue(itemLogisticsFees?.setupFeeCents);
        const takedownFeeAmountCents = parseIntegerValue(itemLogisticsFees?.takedownFeeCents);
        const travelFeeAmountCents =
          parseIntegerValue((row as any)?.travelFeeAmountCents) ??
          parseIntegerValue(itemLogisticsFees?.travelFlatFeeCents) ??
          parseIntegerValue(itemLogisticsFees?.travelFeeCents);
        const logisticsTotalFromTyped = parseIntegerValue((row as any)?.logisticsTotalCents);
        const logisticsTotalCents =
          logisticsTotalFromTyped ??
          (deliveryFeeAmountCents != null || setupFeeAmountCents != null || takedownFeeAmountCents != null || travelFeeAmountCents != null
            ? Math.max(0, deliveryFeeAmountCents ?? 0) +
              Math.max(0, setupFeeAmountCents ?? 0) +
              Math.max(0, takedownFeeAmountCents ?? 0) +
              Math.max(0, travelFeeAmountCents ?? 0)
            : null);
        const baseSubtotalCents = parseIntegerValue((row as any)?.baseSubtotalCents);
        const subtotalAmountCents = parseIntegerValue((row as any)?.subtotalAmountCents);
        const customerFeeAmountCents =
          parseIntegerValue((row as any)?.customerFeeAmountCents) ??
          parseIntegerValue(itemData?.feePolicy?.customerFeeCents);

        const parentListingTitle = normalizeListingTitleCandidate(item?.parentListingTitle) ?? null;

        return {
          ...row,
          itemTitle: resolvedItemTitle,
          parentListingTitle,
          customerEventTitle: customerEventTitleFromItem ?? row.eventTitle ?? null,
          customerNotes: notesFromItem ?? notesFallback,
          customerQuestions: questionsFromItem,
          listingDescription: descriptionFromSnapshot ?? descriptionFromTypedListing,
          listingId: (row as any)?.listingId ?? item?.listingId ?? null,
          listingProfileId: item?.listingProfileId ?? null,
          bookedQuantity: Math.max(1, bookedQuantity),
          deliveryFeeAmountCents: deliveryFeeAmountCents != null ? Math.max(0, deliveryFeeAmountCents) : null,
          setupFeeAmountCents: setupFeeAmountCents != null ? Math.max(0, setupFeeAmountCents) : null,
          takedownFeeAmountCents: takedownFeeAmountCents != null ? Math.max(0, takedownFeeAmountCents) : null,
          travelFeeAmountCents: travelFeeAmountCents != null ? Math.max(0, travelFeeAmountCents) : null,
          logisticsTotalCents: logisticsTotalCents != null ? Math.max(0, logisticsTotalCents) : null,
          baseSubtotalCents: baseSubtotalCents != null ? Math.max(0, baseSubtotalCents) : null,
          subtotalAmountCents: subtotalAmountCents != null ? Math.max(0, subtotalAmountCents) : null,
          customerFeeAmountCents: customerFeeAmountCents != null ? Math.max(0, customerFeeAmountCents) : null,
          includedItems: normalizedIncluded,
          deliveryIncluded,
          setupIncluded,
          addOnItems,
        };
      })
    );
  }

  app.get("/api/vendor/bookings", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.json([]);
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json([]);
      }

      const rawRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.listing_id as "listingId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.pricing_unit_snapshot as "pricingUnitSnapshot",
          b.unit_price_cents_snapshot as "unitPriceCentsSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.delivery_fee_amount_cents as "deliveryFeeAmountCents",
          b.setup_fee_amount_cents as "setupFeeAmountCents",
          b.travel_fee_amount_cents as "travelFeeAmountCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          b.platform_fee as "platformFee",
          b.vendor_payout as "vendorPayout",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          b.created_at as "createdAt",
          b.updated_at as "updatedAt",
          b.event_id as "eventId",
          e.path as "eventTitle",
          b.event_location as "eventLocation",
          b.guest_count as "guestCount",
          b.special_requests as "specialRequests",
          b.google_sync_status as "googleSyncStatus",
          b.google_event_id as "googleEventId",
          b.google_calendar_id as "googleCalendarId",
          coalesce(b.event_date::text, e.date) as "eventDate",
          coalesce(b.event_start_time, e.start_time) as "eventStartTime",
          b.event_end_time as "eventEndTime",
          b.event_timezone as "eventTimezone",
          b.vendor_timezone_snapshot as "vendorTimezoneSnapshot",
          b.payout_status as "payoutStatus",
          b.payout_eligible_at as "payoutEligibleAt",
          b.payout_blocked_reason as "payoutBlockedReason",
          b.paid_out_at as "paidOutAt",
          b.outside_service_radius as "outsideServiceRadius",
          b.instant_book_snapshot as "instantBookSnapshot"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
          and b.vendor_dismissed_at is null
        order by b.created_at desc
      `);

      const withContext = await attachBookingItemContext(extractRows(rawRows) as any);
      const profileCount = Array.isArray(profileContext?.profiles) ? profileContext.profiles.length : 0;
      const scopedRows = withContext.filter((row: any) =>
        bookingRowMatchesActiveProfile(row, activeProfileId, profileCount)
      );
      return res.json(scopedRows);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/bookings/pending-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json({ pendingCount: 0 });

      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) return res.json({ pendingCount: 0 });

      const sinceParam = typeof req.query.since === "string" ? req.query.since : null;
      const sinceDate = sinceParam ? new Date(sinceParam) : null;
      const sinceIsValid = sinceDate && !Number.isNaN(sinceDate.getTime());

      const [row] = await db
        .select({ count: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.vendorProfileId, activeProfileId),
            inArray(bookings.status, ["pending", "confirmed"]),
            ...(sinceIsValid ? [gte(bookings.createdAt, sinceDate)] : [])
          )
        );

      return res.json({ pendingCount: row?.count ?? 0 });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.patch("/api/vendor/bookings/:id", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const bookingId = String(req.params.id || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const updateVendorBookingSchema = z.object({
        status: z.enum(["confirmed", "completed", "cancelled"]),
        cancellationReason: z.string().max(500).optional(),
      });
      const { status: nextStatus, cancellationReason: vendorCancellationReason } = updateVendorBookingSchema.parse(req.body ?? {});

      let ownedBookingRows: Array<{
        id: string;
        status: string | null;
        eventDate: string | null;
        listingTitleSnapshot?: string | null;
        vendorProfileId?: string | null;
      }> = [];
      const ownedRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.listing_id as "listingId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          coalesce(b.event_date::text, e.date) as "eventDate",
          b.event_end_time as "eventEndTime"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where b.id = ${bookingId}
          and coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
        limit 1
      `);
      ownedBookingRows = extractRows(ownedRows);

      const current = ownedBookingRows[0];
      if (!current?.id) {
        return res.status(404).json({ error: "Booking not found for this vendor" });
      }
      const [currentWithContext] = await attachBookingItemContext([current as any]);
      const bookingProfileId =
        asTrimmedString((currentWithContext as any)?.vendorProfileId) ||
        asTrimmedString((currentWithContext as any)?.listingProfileId);
      if (bookingProfileId && bookingProfileId !== activeProfileId) {
        return res.status(404).json({ error: "Booking not found in active profile" });
      }
      const currentStatus = String(current.status || "").toLowerCase();

      if (currentStatus === "confirmed" && nextStatus === "completed") {
        if (!current.eventDate) {
          return res.status(400).json({ error: "Booking event date is missing or invalid" });
        }
        // Use the event end time if available so same-day events can be completed
        // once the end time has passed. Fall back to end of day if no end time.
        const endTimeStr = asTrimmedString((current as any).eventEndTime);
        const eventCutoff = endTimeStr
          ? new Date(`${current.eventDate}T${endTimeStr}`)
          : new Date(`${current.eventDate}T23:59:59`);
        if (isNaN(eventCutoff.getTime())) {
          return res.status(400).json({ error: "Booking event date is missing or invalid" });
        }
        if (new Date() <= eventCutoff) {
          return res.status(400).json({
            error: "You can only mark this booking completed after the event date has passed.",
          });
        }
      }

      const isValidTransition =
        (currentStatus === "pending" && (nextStatus === "confirmed" || nextStatus === "cancelled")) ||
        (currentStatus === "confirmed" && (nextStatus === "completed" || nextStatus === "cancelled"));
      if (!isValidTransition) {
        return res.status(400).json({
          error: `Invalid status transition: ${currentStatus || "unknown"} -> ${nextStatus}`,
        });
      }

      const now = new Date();
      const vendorCancelReasonStored = nextStatus === "cancelled"
        ? (vendorCancellationReason ? `vendor: ${vendorCancellationReason}` : "vendor_cancel")
        : null;
      const updatedResult: any = await db.execute(drizzleSql`
        update bookings b
        set status = ${nextStatus},
            updated_at = ${now},
            confirmed_at = case when ${nextStatus} = 'confirmed' then ${now} else b.confirmed_at end,
            completed_at = case when ${nextStatus} = 'completed' then ${now} else b.completed_at end,
            cancelled_at = case when ${nextStatus} = 'cancelled' then ${now} else b.cancelled_at end,
            cancellation_reason = case when ${nextStatus} = 'cancelled' then ${vendorCancelReasonStored} else b.cancellation_reason end
        where b.id = ${bookingId}
          and (
            b.vendor_account_id = ${vendorAccountId}
            or (
              b.vendor_account_id is null
              and exists (
                select 1
                from vendor_listings vl
                where vl.id = b.listing_id
                  and vl.account_id = ${vendorAccountId}
              )
            )
          )
        returning b.id, b.status, b.updated_at as "updatedAt"
      `);
      const updatedRows = extractRows<{ id?: string; status?: string; updatedAt?: string | Date }>(updatedResult);

      const updated = updatedRows[0];
      if (!updated?.id) {
        return res.status(500).json({ error: "Failed to update booking status" });
      }

      // When a vendor cancels (pending decline or confirmed cancellation), issue full
      // refunds to the customer for all payment types immediately — no cancellation
      // policy penalty applies since it is vendor-initiated.
      if (nextStatus === "cancelled") {
        // Fetch all succeeded/partially-refunded payments for this booking,
        // keyed by type so we target the right Stripe payment intent for each.
        const vendorCancelPayments = await db
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
              or(eq(payments.status, "succeeded"), eq(payments.status, "partially_refunded"))
            )
          )
          .orderBy(desc(payments.createdAt));

        const vcMainPayment = vendorCancelPayments.find(
          (p) => p.paymentType === "booking" || p.paymentType === "deposit"
        );
        const vcTravelFeePayments = vendorCancelPayments.filter(
          (p) => p.paymentType === "travel_fee"
        );
        const vcDepositPayment = vendorCancelPayments.find(
          (p) => p.paymentType === "security_deposit"
        );

        // Safety cap helper — never refund more than the remaining balance on a charge.
        const vcSafeCap = (p: { amount: number; refundAmount: number | null }) => {
          const alreadyRefunded = typeof p.refundAmount === "number" ? p.refundAmount : 0;
          return Math.max(0, p.amount - alreadyRefunded);
        };

        if (vcMainPayment || vcTravelFeePayments.length > 0 || vcDepositPayment) {
          try {
            const { refundBookingPayment } = await import("./stripe");

            // Refund main booking payment (full remaining balance)
            if (vcMainPayment?.stripePaymentIntentId) {
              const refundable = vcSafeCap(vcMainPayment);
              if (refundable > 0) {
                await refundBookingPayment({
                  paymentIntentId: vcMainPayment.stripePaymentIntentId,
                  amount: refundable,
                  reason: "duplicate",
                  idempotencyKey: `vendor-cancel-booking:${bookingId}:${vcMainPayment.id}`,
                });
              }
              await db
                .update(payments)
                .set({
                  status: "refunded" as any,
                  refundAmount: vcMainPayment.amount,
                  refundReason: "vendor_cancellation",
                  refundedAt: now,
                  payoutStatus: "cancelled",
                  payoutEligibleAt: null,
                  payoutBlockedReason: "vendor_cancellation",
                  payoutAdjustedAmount: 0,
                })
                .where(eq(payments.id, vcMainPayment.id));
            }

            // Refund each travel fee payment (full remaining balance)
            for (const tfp of vcTravelFeePayments) {
              if (!tfp.stripePaymentIntentId) continue;
              const refundable = vcSafeCap(tfp);
              if (refundable > 0) {
                await refundBookingPayment({
                  paymentIntentId: tfp.stripePaymentIntentId,
                  amount: refundable,
                  reason: "duplicate",
                  idempotencyKey: `vendor-cancel-travelfee:${bookingId}:${tfp.id}`,
                });
              }
              await db
                .update(payments)
                .set({
                  status: "refunded" as any,
                  refundAmount: tfp.amount,
                  refundReason: "vendor_cancellation",
                  refundedAt: now,
                  payoutStatus: "cancelled",
                  payoutEligibleAt: null,
                  payoutBlockedReason: "vendor_cancellation",
                  payoutAdjustedAmount: 0,
                })
                .where(eq(payments.id, tfp.id));
            }

            // Refund security deposit (full remaining balance)
            if (vcDepositPayment?.stripePaymentIntentId) {
              const refundable = vcSafeCap(vcDepositPayment);
              if (refundable > 0) {
                await refundBookingPayment({
                  paymentIntentId: vcDepositPayment.stripePaymentIntentId,
                  amount: refundable,
                  reason: "duplicate",
                  idempotencyKey: `vendor-cancel-deposit:${bookingId}:${vcDepositPayment.id}`,
                });
              }
              await db
                .update(payments)
                .set({
                  status: "refunded" as any,
                  refundAmount: vcDepositPayment.amount,
                  refundReason: "vendor_cancellation",
                  refundedAt: now,
                })
                .where(eq(payments.id, vcDepositPayment.id));

              // Mark the deposit as refunded on the booking so the auto-job skips it
              await db
                .update(bookings)
                .set({ securityDepositRefundedAt: now, updatedAt: now })
                .where(eq(bookings.id, bookingId));
            }
          } catch (refundErr: any) {
            logger.error(
              { bookingId, err: refundErr?.message },
              "[vendor cancel] Stripe refund failed"
            );
            return res.status(502).json({
              error: "Booking cancelled but refund processing failed. Please contact support.",
            });
          }
        }
      }

      await syncBookingToGoogleCalendarSafely(updated.id, "/api/vendor/bookings/:id google-sync");

      if (nextStatus === "cancelled") {
        const reasonText = vendorCancellationReason
          ? `Reason: ${vendorCancellationReason}`
          : null;
        await sendBookingSystemMessage({
          bookingId,
          text: `This booking has been cancelled by the vendor.${reasonText ? ` ${reasonText}.` : ""}`,
          metadata: { action: "vendor_cancelled", reason: vendorCancellationReason ?? null },
        });
      }

      // Send confirmed/cancelled emails to both parties (fire-and-forget)
      if (nextStatus === "confirmed" || nextStatus === "cancelled") {
        void (async () => {
          try {
            const serverUrl = appUrl();
            const emailRows: any = await db.execute(drizzleSql`
              select
                b.customer_id as "customerId",
                u.email  as "customerEmail",
                u.name   as "customerName",
                va.email as "vendorEmail",
                va.business_name as "vendorName",
                b.event_date as "eventDate",
                coalesce(b.listing_title_snapshot, '') as "listingTitle",
                b.total_amount as "totalAmount"
              from bookings b
              join users u on u.id = b.customer_id
              join vendor_accounts va on va.id = b.vendor_account_id
              where b.id = ${bookingId}
              limit 1
            `);
            const info = extractRows<{
              customerId: string;
              customerEmail: string;
              customerName: string;
              vendorEmail: string;
              vendorName: string;
              eventDate: string;
              listingTitle: string;
              totalAmount: number;
            }>(emailRows)[0];

            if (!info) return;

            const sharedParams = {
              eventDate: info.eventDate,
              listingTitle: info.listingTitle || "your booking",
              serverUrl,
            };

            const addonRows: any = await db.execute(drizzleSql`
              SELECT title, unit_price_cents, total_price_cents
              FROM booking_items
              WHERE booking_id = ${bookingId} AND item_type = 'addon'
              ORDER BY created_at ASC
            `);
            const confirmedAddOns = (addonRows.rows as any[]).map((r: any) => ({
              title: String(r.title ?? "Add-on"),
              priceCents: Number(r.total_price_cents ?? r.unit_price_cents ?? 0),
            }));

            const tasks: Promise<any>[] = [];

            if (nextStatus === "confirmed") {
              if (info.customerEmail) {
                tasks.push(
                  sendBookingConfirmedEmail(info.customerEmail, {
                    ...sharedParams,
                    recipientName: info.customerName || "Customer",
                    counterpartName: info.vendorName || "Vendor",
                    totalAmountCents: info.totalAmount || 0,
                    addOns: confirmedAddOns,
                    role: "customer",
                  })
                );
              }
            } else {
              if (info.customerEmail) {
                tasks.push(
                  sendBookingCancelledEmail(info.customerEmail, {
                    ...sharedParams,
                    recipientName: info.customerName || "Customer",
                    counterpartName: info.vendorName || "Vendor",
                    role: "customer",
                  })
                );
              }
            }

            await Promise.allSettled(tasks);

            // In-app notification: vendor confirmed → tell the customer
            if (nextStatus === "confirmed" && info.customerId) {
              storage.createNotification({
                recipientId: info.customerId,
                recipientType: "customer",
                type: "booking_confirmed",
                title: "Booking confirmed",
                message: `Your booking for ${info.listingTitle || "the service"} on ${info.eventDate} has been confirmed.`,
                link: `/dashboard/events`,
                read: false,
              }).catch(() => {});
            }

            // In-app notification: vendor cancelled → tell the customer
            if (nextStatus === "cancelled" && info.customerId) {
              storage.createNotification({
                recipientId: info.customerId,
                recipientType: "customer",
                type: "booking_cancelled",
                title: "Booking cancelled by vendor",
                message: `Your booking for ${info.listingTitle || "the service"} on ${info.eventDate} has been cancelled by the vendor.`,
                link: `/dashboard/events`,
                read: false,
              }).catch(() => {});
            }
          } catch (emailError: any) {
            logger.warn("[booking status email] failed:", emailError?.message || emailError);
          }
        })();
      }

      return res.json({
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // DELETE /api/vendor/bookings/:id
  // Vendor dismisses an expired or failed booking so it no longer appears in their list.
  app.delete("/api/vendor/bookings/:id", mutationRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id: bookingId } = req.params;

      const [booking] = await db
        .select({ id: bookings.id, status: bookings.status, vendorAccountId: bookings.vendorAccountId })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.vendorAccountId !== vendorAccountId) {
        return res.status(403).json({ error: "Not your booking" });
      }
      if (booking.status !== "expired" && booking.status !== "failed") {
        return res.status(400).json({ error: "Only expired or failed bookings can be dismissed" });
      }

      await db
        .update(bookings)
        .set({ vendorDismissedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      return res.json({ ok: true });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/messages/conversations", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json([]);

      const rows = await listVendorBookingChatContexts(vendorAccountId);
      // Show all active bookings regardless of payment status so "Message Customer"
      // always lands on the right conversation. The bootstrap endpoint enforces the
      // payment gate when the vendor actually tries to open the chat.
      const ACTIVE_BOOKING_STATUSES = new Set(["pending", "confirmed", "completed"]);
      const activeRows = rows.filter(
        (row) =>
          row.bookingId.length > 0 &&
          ACTIVE_BOOKING_STATUSES.has(String(row.status || "").toLowerCase()) &&
          (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
      );
      const unread = await getStreamUnreadCountsForBookings({
        role: "vendor",
        appUserId: vendorAccountId,
        bookingIds: activeRows.map((row) => row.bookingId),
      });
      const conversations = activeRows.map((row) =>
        toConversationPayload("vendor", row, unread.counts[row.bookingId] || 0)
      );
      return res.json(conversations);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/messages/unread-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json({ unreadCount: 0 });

      const rows = await listVendorBookingChatContexts(vendorAccountId);
      const ACTIVE_BOOKING_STATUSES_UC = new Set(["pending", "confirmed", "completed"]);
      const paidBookingIds = rows
        .filter(
          (row) =>
            row.bookingId.length > 0 &&
            ACTIVE_BOOKING_STATUSES_UC.has(String(row.status || "").toLowerCase()) &&
            (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
        )
        .map((row) => row.bookingId);
      const unread = await getStreamUnreadCountsForBookings({
        role: "vendor",
        appUserId: vendorAccountId,
        bookingIds: paidBookingIds,
      });
      return res.json({ unreadCount: unread.totalUnread });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/vendor/messages/:bookingId/bootstrap", messagingRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      if (!isStreamChatConfigured()) {
        return res.status(503).json({ error: "Stream chat is not configured on the server" });
      }

      const bookingId = String(req.params.bookingId || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const booking = await getBookingChatContextById(bookingId);
      if (!booking || booking.bookingId !== bookingId) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (!booking.vendorAccountId || booking.vendorAccountId !== vendorAccountId) {
        return res.status(403).json({ error: "You do not have access to this conversation" });
      }
      if (!booking.customerId) {
        return res.status(400).json({ error: "Booking has no linked customer account" });
      }
      if (!booking.eventDate) {
        return res.status(400).json({ error: "Booking event date is required for chat retention policy" });
      }

      if (isChatExpiredForEventDate(booking.eventDate)) {
        await deleteStreamBookingChannel(bookingId).catch(() => {
          // If channel did not exist yet, keep response deterministic.
        });
        return res.status(410).json({ error: "Chat expired 30 days after the event date" });
      }

      const streamState = await ensureStreamBookingChannel({
        bookingId,
        eventDate: booking.eventDate,
        eventTitle: booking.eventTitle,
        customerId: booking.customerId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        vendorAccountId: booking.vendorAccountId,
        vendorName: booking.vendorName,
        vendorEmail: booking.vendorEmail,
      });

      const streamUserId = toStreamUserId("vendor", vendorAccountId);
      const streamToken = streamState.tokenForUser(streamUserId);

      return res.json({
        streamApiKey: getStreamApiKey(),
        streamToken,
        streamUser: {
          id: streamUserId,
          name: booking.vendorName || "Vendor",
        },
        channel: {
          type: streamState.channelType,
          id: streamState.channelId,
          cid: streamState.channelCid,
        },
        booking: {
          id: booking.bookingId,
          eventDate: booking.eventDate,
          eventTitle: booking.eventTitle,
          counterpartName: booking.customerName || "Customer",
        },
        policyWarning: CHAT_POLICY_WARNING,
        retentionExpiresAt: streamState.retentionExpiresAt,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/customer/messages/conversations", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const rows = await listCustomerBookingChatContexts(customerAuth.id);
      const ACTIVE_BOOKING_STATUSES_C = new Set(["pending", "confirmed", "completed"]);
      const activeRows = rows.filter(
        (row) =>
          row.bookingId.length > 0 &&
          ACTIVE_BOOKING_STATUSES_C.has(String(row.status || "").toLowerCase()) &&
          (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
      );
      const unread = await getStreamUnreadCountsForBookings({
        role: "customer",
        appUserId: customerAuth.id,
        bookingIds: activeRows.map((row) => row.bookingId),
      });
      const conversations = activeRows.map((row) =>
        toConversationPayload("customer", row, unread.counts[row.bookingId] || 0)
      );
      return res.json(conversations);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/customer/messages/unread-count", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const rows = await listCustomerBookingChatContexts(customerAuth.id);
      const ACTIVE_BOOKING_STATUSES_CU = new Set(["pending", "confirmed", "completed"]);
      const paidBookingIds = rows
        .filter(
          (row) =>
            row.bookingId.length > 0 &&
            ACTIVE_BOOKING_STATUSES_CU.has(String(row.status || "").toLowerCase()) &&
            (!row.eventDate || !isChatWindowClosedForEventDate(row.eventDate))
        )
        .map((row) => row.bookingId);
      const unread = await getStreamUnreadCountsForBookings({
        role: "customer",
        appUserId: customerAuth.id,
        bookingIds: paidBookingIds,
      });
      return res.json({ unreadCount: unread.totalUnread });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/customer/messages/:bookingId/bootstrap", messagingRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      if (!isStreamChatConfigured()) {
        return res.status(503).json({ error: "Stream chat is not configured on the server" });
      }

      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const bookingId = String(req.params.bookingId || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const booking = await getBookingChatContextById(bookingId);
      if (!booking || booking.bookingId !== bookingId) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (!booking.customerId || booking.customerId !== customerAuth.id) {
        return res.status(403).json({ error: "You do not have access to this conversation" });
      }
      if (!booking.vendorAccountId) {
        return res.status(400).json({ error: "Booking has no linked vendor account" });
      }
      if (!booking.eventDate) {
        return res.status(400).json({ error: "Booking event date is required for chat retention policy" });
      }

      if (isChatExpiredForEventDate(booking.eventDate)) {
        await deleteStreamBookingChannel(bookingId).catch(() => {
          // If channel did not exist yet, keep response deterministic.
        });
        return res.status(410).json({ error: "Chat expired 30 days after the event date" });
      }

      const streamState = await ensureStreamBookingChannel({
        bookingId,
        eventDate: booking.eventDate,
        eventTitle: booking.eventTitle,
        customerId: booking.customerId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        vendorAccountId: booking.vendorAccountId,
        vendorName: booking.vendorName,
        vendorEmail: booking.vendorEmail,
      });

      const streamUserId = toStreamUserId("customer", booking.customerId);
      const streamToken = streamState.tokenForUser(streamUserId);

      return res.json({
        streamApiKey: getStreamApiKey(),
        streamToken,
        streamUser: {
          id: streamUserId,
          name: booking.customerName || "Customer",
        },
        channel: {
          type: streamState.channelType,
          id: streamState.channelId,
          cid: streamState.channelCid,
        },
        booking: {
          id: booking.bookingId,
          eventDate: booking.eventDate,
          eventTitle: booking.eventTitle,
          counterpartName: booking.vendorName || "Vendor",
        },
        policyWarning: CHAT_POLICY_WARNING,
        retentionExpiresAt: streamState.retentionExpiresAt,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // ── Stream Chat webhook — new message email notifications ────────────────
  // Configure this URL in the Stream Chat dashboard:
  //   https://dashboard.getstream.io → App → Webhooks → add /api/webhooks/stream
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

      // Only act on new messages in booking channels
      if (
        event.type !== "message.new" ||
        event.channel_type !== "messaging" ||
        !String(event.channel_id || "").startsWith("booking_")
      ) {
        return res.status(200).json({ ok: true });
      }

      const bookingId = String(event.channel_id || "").replace(/^booking_/, "");
      if (!bookingId) {
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

  app.get("/api/vendor/payments", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.json({
          totalNetEarned: 0,
          upcomingNetPayout: 0,
          history: [],
        });
      }
      const profileContext = await resolveActiveVendorProfile(req);
      const activeProfileId = profileContext?.activeProfileId;
      if (!activeProfileId) {
        return res.json({
          totalNetEarned: 0,
          upcomingNetPayout: 0,
          history: [],
        });
      }

      const normalizeAmountToCents = (value: unknown) => {
        const n = Number(value ?? 0);
        if (!Number.isFinite(n) || n <= 0) return 0;
        // The current booking flow always writes amounts in cents (integers).
        // Non-integer values are legacy float-dollar rows (e.g. 36.80 → 3680 cents).
        // Integer-dollar legacy rows require a data migration; no heuristic can safely
        // distinguish them from a legitimately small cents value.
        if (!Number.isInteger(n)) return Math.round(n * 100);
        return Math.round(n);
      };

      let rows: Array<{
        id: string;
        status: string | null;
        paymentStatus: string | null;
        totalAmount: number | null;
        vendorPayout: number | null;
        platformFee?: number | null;
        listingTitleSnapshot?: string | null;
        bookedQuantity?: number | null;
        baseSubtotalCents?: number | null;
        logisticsTotalCents?: number | null;
        subtotalAmountCents?: number | null;
        customerFeeAmountCents?: number | null;
        vendorProfileId?: string | null;
        eventDate: string | null;
        createdAt: Date | string | null;
        payoutStatus?: string | null;
        payoutEligibleAt?: Date | string | null;
        paidOutAt?: Date | string | null;
      }> = [];
      const bookingRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.vendor_payout as "vendorPayout",
          b.platform_fee as "platformFee",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          coalesce(b.event_date::text, e.date) as "eventDate",
          b.created_at as "createdAt",
          b.payout_status as "payoutStatus",
          b.payout_eligible_at as "payoutEligibleAt",
          b.paid_out_at as "paidOutAt"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
        order by b.created_at desc
      `);
      rows = extractRows(bookingRows);

      const rowsWithContext = await attachBookingItemContext(rows as any);
      const profileCount = Array.isArray(profileContext?.profiles) ? profileContext.profiles.length : 0;
      rows = rowsWithContext.filter((row: any) =>
        bookingRowMatchesActiveProfile(row, activeProfileId, profileCount)
      ) as typeof rows;

      const baseAmountByBookingId = new Map<string, number>();
      for (const row of rows) {
        const grossCents = normalizeAmountToCents(row.totalAmount);
        const typedSubtotalCents = normalizeAmountToCents(row.subtotalAmountCents);
        if (typedSubtotalCents > 0) {
          baseAmountByBookingId.set(row.id, typedSubtotalCents);
          continue;
        }

        const typedBaseCents = normalizeAmountToCents(row.baseSubtotalCents);
        const typedLogisticsCents = normalizeAmountToCents(row.logisticsTotalCents);
        if (typedBaseCents > 0 || typedLogisticsCents > 0) {
          baseAmountByBookingId.set(row.id, typedBaseCents + typedLogisticsCents);
          continue;
        }

        const baseRows: any = await db.execute(drizzleSql`
          select coalesce(sum(bi.total_price_cents), 0)::bigint as "baseAmountCents"
          from booking_items bi
          where bi.booking_id = ${row.id}
        `);
        const baseAmountRaw = Number(
          extractRows<{ baseAmountCents?: number | string }>(baseRows)[0]?.baseAmountCents || 0
        );

        let baseAmountCents = Number.isFinite(baseAmountRaw) && baseAmountRaw > 0
          ? Math.round(baseAmountRaw)
          : 0;

        // Legacy guard: some rows were written in dollars into *_cents fields (e.g. 370 instead of 37000).
        // If base is implausibly tiny relative to booking gross, upscale by 100.
        if (baseAmountCents > 0 && grossCents > 0 && baseAmountCents <= Math.round(grossCents / 10)) {
          baseAmountCents = baseAmountCents * 100;
        }

        if (Number.isFinite(baseAmountCents) && baseAmountCents > 0) {
          baseAmountByBookingId.set(row.id, Math.round(baseAmountCents));
          continue;
        }

        // Fallback for legacy rows without booking_items:
        // treat booking total as listing/base value to avoid leaking old payout math.
        baseAmountByBookingId.set(row.id, normalizeAmountToCents(row.totalAmount));
      }

      const now = new Date();
      const toNetCents = (r: { id: string; vendorPayout?: number | null }) => {
        const typedVendorPayout = normalizeAmountToCents(r.vendorPayout);
        if (typedVendorPayout > 0) return typedVendorPayout;

        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? 0;
        if (!baseAmountCents) return 0;
        const vendorFee = Math.round(baseAmountCents * VENDOR_FEE_RATE);
        return Math.max(0, baseAmountCents - vendorFee);
      };

      const toPlatformFeeCents = (r: { id: string; platformFee?: number | null }) => {
        const typed = normalizeAmountToCents(r.platformFee);
        if (typed > 0) return typed;
        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? 0;
        return Math.round(baseAmountCents * VENDOR_FEE_RATE);
      };

      const toRowPayoutStatus = (r: { payoutStatus?: string | null }) =>
        String(r.payoutStatus || "not_ready").toLowerCase();

      const completedRows = rows.filter((r) => String(r.status || "").toLowerCase() === "completed");

      const totalPaidOut = completedRows
        .filter((r) => toRowPayoutStatus(r) === "paid")
        .reduce((sum, r) => sum + toNetCents(r), 0);

      const pendingNetPayout = completedRows
        .filter((r) => ["not_ready", "eligible", "scheduled"].includes(toRowPayoutStatus(r)))
        .reduce((sum, r) => sum + toNetCents(r), 0);

      const blockedRows = completedRows.filter((r) => toRowPayoutStatus(r) === "blocked");
      const blockedCount = blockedRows.length;
      const blockedNetAmount = blockedRows.reduce((sum, r) => sum + toNetCents(r), 0);

      const historyBase = completedRows.map((r) => {
        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? normalizeAmountToCents(r.totalAmount);
        const typedCustomerFeeCents = normalizeAmountToCents(r.customerFeeAmountCents);
        const grossCentsFromTypedTotal = normalizeAmountToCents(r.totalAmount);
        const grossCents =
          grossCentsFromTypedTotal > 0
            ? grossCentsFromTypedTotal
            : baseAmountCents + (typedCustomerFeeCents > 0 ? typedCustomerFeeCents : Math.round(baseAmountCents * CUSTOMER_FEE_RATE));
        const netCents = toNetCents(r);
        const platformFeeAmount = toPlatformFeeCents(r);
        return {
          id: r.id,
          status: String(r.status || "pending").toLowerCase(),
          payoutStatus: toRowPayoutStatus(r),
          payoutEligibleAt: r.payoutEligibleAt ?? null,
          paidOutAt: r.paidOutAt ?? null,
          eventDate: r.eventDate,
          createdAt: r.createdAt,
          listingTitleSnapshot: r.listingTitleSnapshot ?? null,
          netAmount: netCents,
          grossAmount: grossCents,
          platformFeeAmount,
        };
      });

      const historyWithContext = await attachBookingItemContext(historyBase as any);

      return res.json({
        totalPaidOut,
        pendingNetPayout,
        blockedCount,
        blockedNetAmount,
        payoutReleaseMode: PAYOUT_RELEASE_MODE,
        payoutPolicyNote:
          "Funds are auto-released after a 72-hour post-event dispute window unless a dispute is filed.",
        history: historyWithContext.map((entry: any) => ({
          ...entry,
          itemTitle:
            typeof entry?.itemTitle === "string" && entry.itemTitle.trim().length > 0
              ? entry.itemTitle.trim()
              : null,
        })),
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/vendor/notifications", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account?.id) {
        return res.json([]);
      }

      const notifications = await storage.getNotificationsByRecipient(
        account.id,
        "vendor"
      );

      res.json(notifications);
    } catch (error: any) {
      logRouteError("/api/vendor/notifications", error);
      res.status(500).json({ error: "Unable to load notifications" });
    }
  });

  app.get("/api/vendor/notifications/unread-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.json({ unreadCount: 0 });
      const notifications = await storage.getNotificationsByRecipient(account.id, "vendor");
      const unreadCount = notifications.filter((n: any) => !n.read).length;
      res.json({ unreadCount });
    } catch (error: any) {
      logRouteError("/api/vendor/notifications/unread-count", error);
      res.json({ unreadCount: 0 });
    }
  });

  app.patch(
    "/api/vendor/notifications/bulk/read",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.status(403).json({ error: "Vendor account required" });

        const { ids } = req.body as { ids?: unknown };
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
          return res.status(400).json({ error: "ids must be an array of strings" });
        }

        const count = await storage.bulkMarkNotificationsRead(ids, account.id, "vendor");
        res.json({ updated: count });
      } catch (error: any) {
        logRouteError("/api/vendor/notifications/bulk/read", error);
        res.status(500).json({ error: "Unable to mark notifications as read" });
      }
    }
  );

  app.patch(
    "/api/vendor/notifications/bulk/archive",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) return res.status(403).json({ error: "Vendor account required" });

        const { ids } = req.body as { ids?: unknown };
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
          return res.status(400).json({ error: "ids must be an array of strings" });
        }

        const count = await storage.bulkArchiveNotifications(ids, account.id, "vendor");
        res.json({ archived: count });
      } catch (error: any) {
        logRouteError("/api/vendor/notifications/bulk/archive", error);
        res.status(500).json({ error: "Unable to archive notifications" });
      }
    }
  );

  app.patch(
    "/api/vendor/notifications/:id/read",
    mutationRateLimiter,
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const { id } = req.params;
        const account = await getVendorAccountFromRequest(req);
        if (!account?.id) {
          return res.status(403).json({ error: "Vendor account required" });
        }

        const updated = await storage.markNotificationAsRead(id, account.id, "vendor");
        if (!updated) {
          return res.status(404).json({ error: "Notification not found" });
        }

        res.json({ success: true });
      } catch (error: any) {
        logRouteError("/api/vendor/notifications/:id/read", error);
        res.status(500).json({ error: "Unable to update notification" });
      }
    }
  );

  app.get("/api/vendor/reviews", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);

      if (!account?.id) {
        return res.json([]);
      }

      // Fetch all published reviews for this vendor, joined with reviewer name,
      // listing title, and any existing vendor reply.
      const rows = await db
        .select({
          id: listingReviews.id,
          listingId: listingReviews.listingId,
          listingTitle: vendorListings.title,
          bookingId: listingReviews.bookingId,
          rating: listingReviews.rating,
          title: listingReviews.title,
          body: listingReviews.body,
          createdAt: listingReviews.createdAt,
          reviewerName: users.name,
          replyId: reviewReplies.id,
          replyText: reviewReplies.reply,
          repliedAt: reviewReplies.createdAt,
        })
        .from(listingReviews)
        .leftJoin(vendorListings, eq(listingReviews.listingId, vendorListings.id))
        .leftJoin(users, eq(listingReviews.userId, users.id))
        .leftJoin(reviewReplies, eq(reviewReplies.listingReviewId, listingReviews.id))
        .where(
          and(
            eq(listingReviews.vendorAccountId, account.id),
            eq(listingReviews.isPublished, true)
          )
        )
        .orderBy(desc(listingReviews.createdAt));

      res.json(rows);
    } catch (error: any) {
      logRouteError("/api/vendor/reviews", error);
      res.status(500).json({ error: "Unable to load reviews" });
    }
  });

  app.post("/api/vendor/reviews/:id/reply", socialRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(401).json({ error: "Vendor account not found" });
      }

      const reviewId = req.params.id;
      const replySchema = z.object({ reply: z.string().min(1).max(2000) });
      const { reply } = replySchema.parse(req.body);

      // Verify the review belongs to this vendor before allowing a reply
      const [review] = await db
        .select({ id: listingReviews.id })
        .from(listingReviews)
        .where(
          and(
            eq(listingReviews.id, reviewId),
            eq(listingReviews.vendorAccountId, account.id),
            eq(listingReviews.isPublished, true)
          )
        )
        .limit(1);

      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      // Upsert: delete any existing reply for this review, then insert the new one.
      // This allows vendors to edit their reply by re-submitting.
      await db
        .delete(reviewReplies)
        .where(
          and(
            eq(reviewReplies.listingReviewId, reviewId),
            eq(reviewReplies.vendorAccountId, account.id)
          )
        );

      const [inserted] = await db
        .insert(reviewReplies)
        .values({
          vendorAccountId: account.id,
          listingReviewId: reviewId,
          reply,
        })
        .returning();

      res.json({ success: true, reply: inserted });
    } catch (error: any) {
      logRouteError("/api/vendor/reviews/:id/reply", error);
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid reply text" });
      }
      res.status(500).json({ error: "Unable to submit review reply" });
    }
  });

  // Customer-facing routes (existing)
  app.post("/api/events", eventsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      const [event] = await db.insert(events).values({ ...validatedData }).returning();
      res.json(event);
    } catch (error: any) {
      logRouteError("/api/events POST", error);
      res.status(400).json({ error: "Invalid event payload" });
    }
  });

  app.get("/api/events/:eventId/recommendations", requireCustomerAnyAuth, async (req, res) => {
    try {
      const [event] = await db.select().from(events).where(eq(events.id, req.params.eventId));
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Real recommendations: return active listings for now (scoring can be added later)
      const listings = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          quantity: vendorListings.quantity,
          listingData: vendorListings.listingData,
          vendorProfileId: vendorListings.profileId,
          vendorAccountId: vendorListings.accountId,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorListings.accountId, vendorAccounts.id))
        .where(
          and(
            eq(vendorListings.status, "active"),
            eq(vendorProfiles.active, true),
            eq(vendorAccounts.active, true)
          )
        )
        .limit(50);

      res.json(listings);
    } catch (error: any) {
      logRouteError("/api/events/:eventId/recommendations", error);
      res.status(500).json({ error: "Unable to load recommendations" });
    }
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

  app.get("/api/customer/events", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const options = await getCustomerEventOptions(customerAuth.id);
      return res.json(options);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  async function attachCustomerBookingContext<
    T extends {
      id: string;
      eventId?: string | null;
      eventTitle?: string | null;
      listingId?: string | null;
      listingTitleSnapshot?: string | null;
      bookedQuantity?: number | null;
      pricingUnitSnapshot?: string | null;
      unitPriceCentsSnapshot?: number | null;
      deliveryFeeAmountCents?: number | null;
      setupFeeAmountCents?: number | null;
      travelFeeAmountCents?: number | null;
      logisticsTotalCents?: number | null;
      baseSubtotalCents?: number | null;
      subtotalAmountCents?: number | null;
      customerFeeAmountCents?: number | null;
      vendorDisplayName?: string | null;
      vendorBusinessName?: string | null;
    }
  >(rows: T[]) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return rows as Array<
        T & {
          customerEventId?: string | null;
          customerEventTitle?: string | null;
          listingId?: string | null;
          itemTitle?: string | null;
          displayTitle?: string | null;
          bookedQuantity?: number;
          pricingUnitSnapshot?: string | null;
          unitPriceCentsSnapshot?: number | null;
          deliveryFeeAmountCents?: number | null;
          setupFeeAmountCents?: number | null;
          travelFeeAmountCents?: number | null;
          logisticsTotalCents?: number | null;
          baseSubtotalCents?: number | null;
          subtotalAmountCents?: number | null;
          customerFeeAmountCents?: number | null;
          reviewSubmitted?: boolean;
          reviewRating?: number | null;
          reviewBody?: string | null;
        }
      >;
    }

    return Promise.all(
      rows.map(async (row) => {
        const itemRes: any = await db.execute(drizzleSql`
          select
            bi.title,
            bi.listing_id as "listingId",
            bi.item_data as "itemData",
            vl.title as "listingTitle",
            va.business_name as "listingVendorBusinessName",
            nullif(trim(parent_listing.title), '') as "parentListingTitle"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          left join vendor_accounts va on va.id = vl.account_id
          left join vendor_listings parent_listing on parent_listing.id = vl.parent_listing_id
          where bi.booking_id = ${row.id}
          limit 1
        `);
        const [item] = extractRows<{
          title?: string | null;
          listingId?: string | null;
          itemData?: any;
          listingTitle?: string | null;
          listingVendorBusinessName?: string | null;
          parentListingTitle?: string | null;
        }>(itemRes);
        const itemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
        const customerEvent = itemData?.customerEvent && typeof itemData.customerEvent === "object"
          ? itemData.customerEvent
          : null;
        const reviewMeta = itemData?.review && typeof itemData.review === "object"
          ? itemData.review
          : null;

        const customerEventId =
          typeof customerEvent?.id === "string" && customerEvent.id.trim().length > 0
            ? customerEvent.id.trim()
            : row.eventId ?? null;
        const customerEventTitle =
          typeof customerEvent?.title === "string" && customerEvent.title.trim().length > 0
            ? customerEvent.title.trim()
            : row.eventTitle ?? null;
        const itemTitleFromSnapshot = normalizeListingTitleCandidate(row.listingTitleSnapshot);
        const itemTitleFromItem =
          typeof item?.title === "string" && item.title.trim().length > 0
            ? item.title.trim()
            : null;
        const itemTitleFromJson =
          typeof itemData?.listingSnapshot?.title === "string" && itemData.listingSnapshot.title.trim().length > 0
            ? itemData.listingSnapshot.title.trim()
            : null;
        const itemTitleFromListing =
          typeof item?.listingTitle === "string" && item.listingTitle.trim().length > 0
            ? item.listingTitle.trim()
            : null;
        const itemTitle = itemTitleFromSnapshot ?? itemTitleFromItem ?? itemTitleFromJson ?? itemTitleFromListing ?? null;
        const reviewRating =
          typeof reviewMeta?.rating === "number" && Number.isFinite(reviewMeta.rating)
            ? Math.max(1, Math.min(5, Math.round(reviewMeta.rating)))
            : null;
        const reviewBody =
          typeof reviewMeta?.body === "string" && reviewMeta.body.trim().length > 0
            ? reviewMeta.body.trim()
            : null;
        const reviewSubmitted =
          (typeof reviewMeta?.reviewId === "string" && reviewMeta.reviewId.trim().length > 0) ||
          reviewRating !== null ||
          reviewBody !== null;
        const vendorName =
          row.vendorDisplayName ||
          row.vendorBusinessName ||
          (typeof itemData?.vendorDisplayName === "string" && itemData.vendorDisplayName.trim().length > 0
            ? itemData.vendorDisplayName.trim()
            : null) ||
          (typeof itemData?.vendorBusinessName === "string" && itemData.vendorBusinessName.trim().length > 0
            ? itemData.vendorBusinessName.trim()
            : null) ||
          item?.listingVendorBusinessName ||
          "Vendor";
        const parentListingTitle =
          typeof item?.parentListingTitle === "string" && item.parentListingTitle.trim().length > 0
            ? item.parentListingTitle.trim()
            : null;
        const displayTitle = itemTitle ? `${itemTitle} from ${vendorName}` : vendorName;

        return {
          ...row,
          customerEventId,
          customerEventTitle,
          listingId: row.listingId ?? item?.listingId ?? null,
          itemTitle,
          parentListingTitle,
          displayTitle,
          bookedQuantity: Math.max(1, parseIntegerValue(row.bookedQuantity) ?? parseIntegerValue(itemData?.quantity) ?? 1),
          pricingUnitSnapshot: asTrimmedString(row.pricingUnitSnapshot) || null,
          unitPriceCentsSnapshot: parseIntegerValue(row.unitPriceCentsSnapshot),
          deliveryFeeAmountCents: parseIntegerValue(row.deliveryFeeAmountCents),
          setupFeeAmountCents: parseIntegerValue(row.setupFeeAmountCents),
          travelFeeAmountCents: parseIntegerValue(row.travelFeeAmountCents),
          logisticsTotalCents: parseIntegerValue(row.logisticsTotalCents),
          baseSubtotalCents: parseIntegerValue(row.baseSubtotalCents),
          subtotalAmountCents: parseIntegerValue(row.subtotalAmountCents),
          customerFeeAmountCents:
            parseIntegerValue(row.customerFeeAmountCents) ?? parseIntegerValue(itemData?.feePolicy?.customerFeeCents),
          reviewSubmitted,
          reviewRating,
          reviewBody,
        };
      })
    );
  }

  // Booking and Payment Routes (unchanged)
  app.get("/api/customer/bookings", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const rows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.event_id as "eventId",
          b.listing_id as "listingId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.pricing_unit_snapshot as "pricingUnitSnapshot",
          b.unit_price_cents_snapshot as "unitPriceCentsSnapshot",
          b.delivery_fee_amount_cents as "deliveryFeeAmountCents",
          b.setup_fee_amount_cents as "setupFeeAmountCents",
          b.travel_fee_amount_cents as "travelFeeAmountCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          e.path as "eventTitle",
          b.event_date as "eventDate",
          b.event_start_time as "eventStartTime",
          b.event_location as "eventLocation",
          b.created_at as "createdAt",
          coalesce(nullif(u.display_name, ''), nullif(u.name, '')) as "vendorDisplayName",
          coalesce(va.business_name, listing_owner_account.business_name) as "vendorBusinessName"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_accounts va on va.id = b.vendor_account_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join vendor_accounts listing_owner_account on listing_owner_account.id = listing_owner.account_id
        left join users u on u.id = coalesce(va.user_id, listing_owner_account.user_id)
        where b.customer_id = ${customerAuth.id}
          and b.customer_dismissed_at is null
        order by b.created_at desc
      `);
      return res.json(await attachCustomerBookingContext(extractRows(rows) as any));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // DELETE /api/customer/bookings/:id
  // Customer dismisses an expired or failed booking so it no longer appears in their list.
  app.delete("/api/customer/bookings/:id", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const { id: bookingId } = req.params;

      const [booking] = await db
        .select({ id: bookings.id, status: bookings.status, customerId: bookings.customerId })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.customerId !== customerAuth.id) {
        return res.status(403).json({ error: "Not your booking" });
      }
      if (booking.status !== "expired" && booking.status !== "failed") {
        return res.status(400).json({ error: "Only expired or failed bookings can be dismissed" });
      }

      await db
        .update(bookings)
        .set({ customerDismissedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      return res.json({ ok: true });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/customer/bookings/:id", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }
      const { id: bookingId } = req.params;

      const rows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.event_id as "eventId",
          b.listing_id as "listingId",
          b.package_id as "packageId",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.pricing_unit_snapshot as "pricingUnitSnapshot",
          b.unit_price_cents_snapshot as "unitPriceCentsSnapshot",
          b.delivery_fee_amount_cents as "deliveryFeeAmountCents",
          b.setup_fee_amount_cents as "setupFeeAmountCents",
          b.travel_fee_amount_cents as "travelFeeAmountCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          b.security_deposit_cents as "securityDepositCents",
          b.event_date as "eventDate",
          b.event_start_time as "eventStartTime",
          b.event_end_time as "eventEndTime",
          b.event_location as "eventLocation",
          b.guest_count as "guestCount",
          b.special_requests as "specialRequests",
          b.created_at as "createdAt",
          b.confirmed_at as "confirmedAt",
          b.cancelled_at as "cancelledAt",
          e.path as "eventTitle",
          coalesce(nullif(u.display_name, ''), nullif(u.name, '')) as "vendorDisplayName",
          coalesce(va.business_name, listing_owner_account.business_name) as "vendorBusinessName"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_accounts va on va.id = b.vendor_account_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join vendor_accounts listing_owner_account on listing_owner_account.id = listing_owner.account_id
        left join users u on u.id = coalesce(va.user_id, listing_owner_account.user_id)
        where b.id = ${bookingId} and b.customer_id = ${customerAuth.id}
      `);

      const extracted = extractRows(rows) as any[];
      if (!extracted.length) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Enrich with booking item data (notes, questions, title)
      const row = extracted[0];
      const itemRes: any = await db.execute(drizzleSql`
        select
          bi.title,
          bi.listing_id as "listingId",
          bi.item_type as "itemType",
          bi.unit_price_cents as "unitPriceCents",
          bi.total_price_cents as "totalPriceCents",
          bi.item_data as "itemData",
          vl.title as "listingTitle",
          va2.business_name as "listingVendorBusinessName"
        from booking_items bi
        left join vendor_listings vl on vl.id = bi.listing_id
        left join vendor_accounts va2 on va2.id = vl.account_id
        where bi.booking_id = ${bookingId}
        order by bi.created_at asc
      `);
      const allItems = extractRows<{
        title?: string | null;
        listingId?: string | null;
        itemType?: string | null;
        unitPriceCents?: number | null;
        totalPriceCents?: number | null;
        itemData?: any;
        listingTitle?: string | null;
        listingVendorBusinessName?: string | null;
      }>(itemRes);
      const item = allItems.find((i) => i.itemType === "base") ?? allItems[0];
      const addonItems = allItems.filter((i) => i.itemType === "addon");
      const itemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
      const customerEventFromItem = itemData?.customerEvent && typeof itemData.customerEvent === "object"
        ? itemData.customerEvent
        : null;
      const itemTitleResolved =
        normalizeListingTitleCandidate(row.listingTitleSnapshot) ??
        normalizeListingTitleCandidate(item?.title) ??
        normalizeListingTitleCandidate(itemData?.listingSnapshot?.title) ??
        normalizeListingTitleCandidate(item?.listingTitle) ??
        null;
      const vendorName =
        row.vendorDisplayName ||
        row.vendorBusinessName ||
        item?.listingVendorBusinessName ||
        "Vendor";
      const customerNotes =
        typeof itemData?.customerNotes === "string" && itemData.customerNotes.trim().length > 0
          ? itemData.customerNotes.trim()
          : typeof row.specialRequests === "string" && row.specialRequests.trim().length > 0
          ? row.specialRequests.trim()
          : null;
      const customerQuestions =
        typeof itemData?.customerQuestions === "string" && itemData.customerQuestions.trim().length > 0
          ? itemData.customerQuestions.trim()
          : null;
      const customerEventTitle =
        typeof customerEventFromItem?.title === "string" && customerEventFromItem.title.trim().length > 0
          ? customerEventFromItem.title.trim()
          : row.eventTitle ?? null;

      // For package bookings, resolve the parent container listing ID so the
      // detail page shows the container (with all packages) instead of the
      // individual package_item listing.
      let resolvedListingId: string | null = row.listingId ?? item?.listingId ?? null;
      if (row.packageId) {
        const parentRows: any = await db.execute(drizzleSql`
          select parent_listing_id as "parentListingId"
          from vendor_listings
          where id = ${row.packageId}
            and listing_type = 'package_item'
          limit 1
        `);
        const [parentRow] = extractRows<{ parentListingId?: string | null }>(parentRows);
        if (parentRow?.parentListingId) {
          resolvedListingId = parentRow.parentListingId;
        }
      }

      return res.json({
        ...row,
        itemTitle: itemTitleResolved,
        displayTitle: itemTitleResolved ? `${itemTitleResolved} from ${vendorName}` : vendorName,
        vendorName,
        customerEventTitle,
        listingId: resolvedListingId,
        bookedQuantity: Math.max(1, parseIntegerValue(row.bookedQuantity) ?? parseIntegerValue(itemData?.quantity) ?? 1),
        customerNotes,
        customerQuestions,
        addOns: addonItems.map((a) => ({
          title: a.title ?? "Add-on",
          priceCents: a.totalPriceCents ?? a.unitPriceCents ?? 0,
        })),
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.patch("/api/customer/bookings/:id/event", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const bookingId = String(req.params.id || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const schema = z.object({
        customerEventId: z.string().optional(),
        customerEventTitle: z.string().max(160).optional(),
        unlink: z.boolean().optional(),
      });
      const data = schema.parse(req.body ?? {});

      // ── Unlink path ───────────────────────────────────────────────────────
      if (data.unlink === true) {
        const [bookingCheck] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)))
          .limit(1);
        if (!bookingCheck?.id) {
          return res.status(404).json({ error: "Booking not found for this customer" });
        }

        await db
          .update(bookings)
          .set({ eventId: null, updatedAt: new Date() })
          .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)));

        await db.execute(drizzleSql`
          update booking_items bi
          set item_data = jsonb_set(
            coalesce(bi.item_data, '{}'::jsonb),
            '{customerEvent}',
            'null'::jsonb,
            true
          )
          where bi.booking_id = ${bookingId}
        `);

        return res.json({ bookingId, customerEvent: null });
      }

      // ── Link / change path ────────────────────────────────────────────────
      const requestedEventId =
        typeof data.customerEventId === "string" && data.customerEventId.trim().length > 0
          ? data.customerEventId.trim()
          : null;
      const requestedEventTitle =
        typeof data.customerEventTitle === "string" && data.customerEventTitle.trim().length > 0
          ? data.customerEventTitle.trim().slice(0, 160)
          : null;

      if (!requestedEventId && !requestedEventTitle) {
        return res.status(400).json({ error: "Provide customerEventId, customerEventTitle, or unlink: true" });
      }

      const [bookingRow] = await db
        .select({
          id: bookings.id,
          eventDate: bookings.eventDate,
          eventStartTime: bookings.eventStartTime,
          eventLocation: bookings.eventLocation,
          guestCount: bookings.guestCount,
        })
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)))
        .limit(1);

      if (!bookingRow?.id) {
        return res.status(404).json({ error: "Booking not found for this customer" });
      }

      let targetEvent: { id: string; title: string } | null = null;

      if (requestedEventId) {
        const ownedEvents = await getCustomerEventOptions(customerAuth.id);
        const matched = ownedEvents.find((e) => e.id === requestedEventId);
        if (!matched) {
          return res.status(400).json({ error: "Selected event not found" });
        }
        targetEvent = { id: matched.id, title: matched.title };
      } else if (requestedEventTitle) {
        const [createdEvent] = await db
          .insert(events)
          .values({
            eventType: "custom",
            location: bookingRow.eventLocation ?? "TBD",
            date: bookingRow.eventDate,
            startTime: bookingRow.eventStartTime ?? "00:00",
            guestCount: bookingRow.guestCount ?? 1,
            vendorsNeeded: ["rentals"],
            path: requestedEventTitle,
            photographerDetails: null,
            videographerDetails: null,
            floristDetails: null,
            cateringDetails: null,
            djDetails: null,
            propDecorDetails: null,
          })
          .returning({ id: events.id, path: events.path });
        if (!createdEvent?.id) {
          return res.status(500).json({ error: "Failed to create event" });
        }
        targetEvent = {
          id: createdEvent.id,
          title: createdEvent.path || requestedEventTitle,
        };
      }

      if (!targetEvent?.id) {
        return res.status(500).json({ error: "Failed to resolve target event" });
      }

      await db
        .update(bookings)
        .set({
          eventId: targetEvent.id,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, customerAuth.id)));

      await db.execute(drizzleSql`
        update booking_items bi
        set item_data = jsonb_set(
          coalesce(bi.item_data, '{}'::jsonb),
          '{customerEvent}',
          ${JSON.stringify(targetEvent)}::jsonb,
          true
        )
        where bi.booking_id = ${bookingId}
      `);

      return res.json({
        bookingId,
        customerEvent: targetEvent,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/customer/bookings/:id/review", socialRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    const fail = (status: number, message: string): never => {
      const error = new Error(message) as Error & { status?: number };
      error.status = status;
      throw error;
    };

    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const bookingId = String(req.params.id || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const schema = z.object({
        rating: z.number().int().min(1).max(5),
        body: z.string().min(4).max(2000),
      });
      const data = schema.parse(req.body ?? {});
      const reviewBody = data.body.trim();

      if (reviewBody.length < 4) {
        return res.status(400).json({ error: "Review body is too short" });
      }

      const bookingRows: any = await db.execute(drizzleSql`
        select b.id, b.status, b.customer_id as "customerId", b.event_date as "eventDate", b.created_at as "createdAt"
        from bookings b
        where b.id = ${bookingId}
        limit 1
      `);
      const booking = extractRows<{
        id?: string;
        status?: string | null;
        customerId?: string | null;
        eventDate?: string | null;
        createdAt?: string | Date | null;
      }>(bookingRows)[0];

      if (!booking?.id || booking.customerId !== customerAuth.id) {
        return res.status(404).json({ error: "Booking not found for this customer" });
      }
      if (booking.status !== "completed") {
        return res.status(400).json({ error: "Reviews can only be submitted for completed bookings" });
      }

      const reviewResult = await db.transaction(async (tx) => {
        const itemRows: any = await tx.execute(drizzleSql`
          select
            bi.id as "bookingItemId",
            bi.listing_id as "listingId",
            bi.title as "itemTitle",
            bi.item_data as "itemData",
            vl.account_id as "vendorAccountId"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          where bi.booking_id = ${bookingId}
          limit 1
          for update of bi
        `);

        const item = extractRows<{
          bookingItemId?: string | null;
          listingId?: string | null;
          itemTitle?: string | null;
          itemData?: any;
          vendorAccountId?: string | null;
        }>(itemRows)[0];

        if (!item?.bookingItemId || !item?.listingId) {
          fail(400, "Listing not found for this booking");
        }

        const existingItemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};
        const existingReview = existingItemData?.review && typeof existingItemData.review === "object"
          ? existingItemData.review
          : null;
        const hasReviewAlready =
          (typeof existingReview?.reviewId === "string" && existingReview.reviewId.trim().length > 0) ||
          (typeof existingReview?.rating === "number" && Number.isFinite(existingReview.rating)) ||
          (typeof existingReview?.body === "string" && existingReview.body.trim().length > 0);

        if (hasReviewAlready) {
          fail(409, "Review already submitted for this booking");
        }

        const titleBase =
          typeof item.itemTitle === "string" && item.itemTitle.trim().length > 0
            ? item.itemTitle.trim()
            : "Listing";
        const reviewTitle = `${data.rating}-star review for ${titleBase}`.slice(0, 160);
        const reviewId = crypto.randomUUID();
        const now = new Date();
        const submittedAt = now.toISOString();

        await tx.execute(drizzleSql`
          insert into listing_reviews (
            id,
            listing_id,
            vendor_account_id,
            user_id,
            rating,
            title,
            body,
            is_published,
            created_at,
            updated_at
          ) values (
            ${reviewId},
            ${item.listingId},
            ${item.vendorAccountId ?? null},
            ${customerAuth.id},
            ${data.rating},
            ${reviewTitle},
            ${reviewBody},
            ${true},
            ${now},
            ${now}
          )
        `);

        const reviewMeta = {
          reviewId,
          bookingId,
          listingId: item.listingId,
          rating: data.rating,
          body: reviewBody,
          submittedAt,
        };

        await tx.execute(drizzleSql`
          update booking_items bi
          set item_data = jsonb_set(
            coalesce(bi.item_data, '{}'::jsonb),
            '{review}',
            ${JSON.stringify(reviewMeta)}::jsonb,
            true
          )
          where bi.id = ${item.bookingItemId}
        `);

        return {
          listingId: item.listingId,
          vendorAccountId: item.vendorAccountId,
          listingTitle: titleBase,
          reviewId,
        };
      });

      // Fire-and-forget: notify vendor of new review (email + in-app)
      void (async () => {
        try {
          if (!reviewResult.vendorAccountId) return;
          const serverUrl = appUrl();
          const [vendorRow] = await db
            .select({ email: vendorAccounts.email, businessName: vendorAccounts.businessName })
            .from(vendorAccounts)
            .where(eq(vendorAccounts.id, reviewResult.vendorAccountId))
            .limit(1);
          const [customerRow] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, customerAuth.id))
            .limit(1);
          const stars = "★".repeat(data.rating) + "☆".repeat(5 - data.rating);
          await storage.createNotification({
            recipientId: reviewResult.vendorAccountId,
            recipientType: "vendor",
            type: "review_received",
            title: "New review received",
            message: `${customerRow?.name || "A customer"} left a ${data.rating}-star review (${stars}) for ${reviewResult.listingTitle}.`,
            link: `/vendor/reviews`,
            read: false,
          });
          if (vendorRow?.email) {
            await sendNewReviewReceivedEmail(vendorRow.email, {
              recipientName: vendorRow.businessName || "Vendor",
              reviewerName: customerRow?.name || "Customer",
              listingTitle: reviewResult.listingTitle,
              rating: data.rating,
              reviewText: reviewBody,
              serverUrl,
            });
          }
        } catch (emailError: any) {
          logger.warn("[review email] failed:", emailError?.message || emailError);
        }
      })();

      return res.json({
        bookingId,
        listingId: reviewResult.listingId,
        reviewId: reviewResult.reviewId,
        rating: data.rating,
        body: reviewBody,
      });
    } catch (error: any) {
      // Only surface error.message when it was thrown by our fail() helper (has explicit status).
      // Unexpected errors (DB failures, etc.) go through the safe internal-error handler.
      if (typeof error?.status !== "number") {
        return respondWithInternalServerError(req, res, error);
      }
      const status = error.status;
      if (status >= 500) {
        return respondWithInternalServerError(req, res, error);
      }
      return res.status(status).json({ error: error.message });
    }
  });

  app.post("/api/customer/bookings/:id/dispute", socialRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      await ensureBookingDisputesTable();

      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      const bookingId = asTrimmedString(req.params?.id);
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const payload = z
        .object({
          reason: z.enum([
            "item_not_as_described",
            "late_or_no_show",
            "damaged_or_missing",
            "other",
          ]),
          details: z.string().trim().min(8).max(2000),
        })
        .parse(req.body ?? {});

      const bookingRows: any = await db.execute(drizzleSql`
        select
          b.id as "bookingId",
          b.customer_id as "customerId",
          b.booking_end_at as "bookingEndAt",
          b.event_date as "eventDate",
          coalesce(b.vendor_account_id, listing_owner.account_id) as "vendorAccountId",
          coalesce(b.listing_title_snapshot, listing_owner.title) as "listingTitle",
          cust.email as "customerEmail",
          cust.name as "customerName",
          va.email as "vendorEmail",
          va.business_name as "vendorBusinessName"
        from bookings b
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join customers cust on cust.id = b.customer_id
        left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id)
        where b.id = ${bookingId}
        limit 1
      `);
      const booking = extractRows<{
        bookingId?: string | null;
        customerId?: string | null;
        bookingEndAt?: Date | string | null;
        eventDate?: string | null;
        vendorAccountId?: string | null;
        listingTitle?: string | null;
        customerEmail?: string | null;
        customerName?: string | null;
        vendorEmail?: string | null;
        vendorBusinessName?: string | null;
      }>(bookingRows)[0];

      if (!booking?.bookingId || booking.customerId !== customerAuth.id) {
        return res.status(404).json({ error: "Booking not found for this customer" });
      }

      const bookingEndAt =
        booking.bookingEndAt instanceof Date
          ? booking.bookingEndAt
          : booking.bookingEndAt
            ? new Date(booking.bookingEndAt)
            : null;
      if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
        return res.status(400).json({ error: "Booking does not have a valid event completion time" });
      }

      const now = new Date();
      if (now < bookingEndAt) {
        return res.status(400).json({ error: "Disputes can only be filed after the event has ended" });
      }

      const disputeWindowCloseAt = deriveDisputeWindowCloseAt(bookingEndAt);
      if (!disputeWindowCloseAt || !isDisputeWindowOpen(bookingEndAt, now)) {
        return res.status(400).json({
          error: `Dispute window closed. Disputes are only allowed within ${DISPUTE_WINDOW_HOURS} hours after event completion.`,
        });
      }

      const existingRows = await db
        .select({
          id: bookingDisputes.id,
        })
        .from(bookingDisputes)
        .where(eq(bookingDisputes.bookingId, bookingId))
        .limit(1);
      if (existingRows[0]?.id) {
        return res.status(409).json({ error: "A dispute already exists for this booking" });
      }

      const [createdDispute] = await db
        .insert(bookingDisputes)
        .values({
          bookingId,
          customerId: customerAuth.id,
          vendorAccountId: asTrimmedString(booking.vendorAccountId) || null,
          reason: payload.reason,
          details: payload.details,
          status: "filed",
          filedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await db
        .update(payments)
        .set({
          payoutStatus: "blocked",
          payoutBlockedReason: "customer_dispute_open",
        })
        .where(eq(payments.bookingId, bookingId));

      // Fire-and-forget emails — do not await; never block the 201 response
      const serverUrl = appUrl();
      const disputeEventDate = asTrimmedString(booking.eventDate) || "N/A";
      const disputeListingTitle = asTrimmedString(booking.listingTitle) || "Your booking";
      const disputeFiledAtStr = createdDispute.filedAt
        ? new Date(createdDispute.filedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

      if (booking.customerEmail) {
        sendDisputeFiledEmail(booking.customerEmail, {
          role: "customer",
          recipientName: asTrimmedString(booking.customerName) || "Customer",
          counterpartName: asTrimmedString(booking.vendorBusinessName) || "Vendor",
          listingTitle: disputeListingTitle,
          eventDate: disputeEventDate,
          reason: payload.reason,
          details: payload.details,
          filedAt: disputeFiledAtStr,
          serverUrl,
        }).catch(() => {});
      }

      if (booking.vendorEmail) {
        sendDisputeFiledEmail(booking.vendorEmail, {
          role: "vendor",
          recipientName: asTrimmedString(booking.vendorBusinessName) || "Vendor",
          counterpartName: asTrimmedString(booking.customerName) || "Customer",
          listingTitle: disputeListingTitle,
          eventDate: disputeEventDate,
          reason: payload.reason,
          details: payload.details,
          filedAt: disputeFiledAtStr,
          serverUrl,
        }).catch(() => {});
      }

      return res.status(201).json({
        disputeId: createdDispute.id,
        bookingId,
        status: createdDispute.status,
        reason: createdDispute.reason,
        details: createdDispute.details,
        filedAt: createdDispute.filedAt,
        disputeWindowCloseAt,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return res.status(500).json({ error: "Unable to file dispute" });
    }
  });

  app.post("/api/vendor/bookings/:id/dispute/respond", socialRateLimiter, ...requireVendorAuth0, async (req, res) => {
    try {
      await ensureBookingDisputesTable();

      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = asTrimmedString(vendorAuth?.id);
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const bookingId = asTrimmedString(req.params?.id);
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const payload = z
        .object({
          response: z.string().trim().min(4).max(2000),
        })
        .parse(req.body ?? {});

      const disputeRows: any = await db.execute(drizzleSql`
        select
          d.id as "disputeId",
          d.status as "status",
          d.booking_id as "bookingId",
          coalesce(b.vendor_account_id, listing_owner.account_id) as "vendorAccountId",
          coalesce(b.listing_title_snapshot, listing_owner.title) as "listingTitle",
          b.event_date as "eventDate",
          cust.email as "customerEmail",
          cust.name as "customerName",
          va.business_name as "vendorBusinessName"
        from booking_disputes d
        inner join bookings b on b.id = d.booking_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        left join customers cust on cust.id = b.customer_id
        left join vendor_accounts va on va.id = coalesce(b.vendor_account_id, listing_owner.account_id)
        where d.booking_id = ${bookingId}
        limit 1
      `);
      const dispute = extractRows<{
        disputeId?: string | null;
        status?: string | null;
        bookingId?: string | null;
        vendorAccountId?: string | null;
        listingTitle?: string | null;
        eventDate?: string | null;
        customerEmail?: string | null;
        customerName?: string | null;
        vendorBusinessName?: string | null;
      }>(disputeRows)[0];

      if (!dispute?.disputeId) {
        return res.status(404).json({ error: "Dispute not found for this booking" });
      }
      if (asTrimmedString(dispute.vendorAccountId) !== vendorAccountId) {
        return res.status(403).json({ error: "You do not have access to this dispute" });
      }
      if (dispute.status === "resolved_refund" || dispute.status === "resolved_payout") {
        return res.status(409).json({ error: "Dispute is already resolved" });
      }

      const now = new Date();
      const [updatedDispute] = await db
        .update(bookingDisputes)
        .set({
          status: "vendor_responded",
          vendorResponse: payload.response,
          vendorRespondedAt: now,
          updatedAt: now,
        })
        .where(eq(bookingDisputes.id, dispute.disputeId))
        .returning();

      // Notify the customer that the vendor has responded
      if (dispute.customerEmail) {
        const serverUrl = appUrl();
        sendDisputeVendorRespondedEmail(dispute.customerEmail, {
          recipientName: asTrimmedString(dispute.customerName) || "Customer",
          vendorBusinessName: asTrimmedString(dispute.vendorBusinessName) || "Vendor",
          listingTitle: asTrimmedString(dispute.listingTitle) || "Your booking",
          eventDate: asTrimmedString(dispute.eventDate) || "N/A",
          vendorResponse: payload.response,
          serverUrl,
        }).catch(() => {});
      }

      return res.json({
        disputeId: updatedDispute.id,
        bookingId: updatedDispute.bookingId,
        status: updatedDispute.status,
        vendorResponse: updatedDispute.vendorResponse,
        vendorRespondedAt: updatedDispute.vendorRespondedAt,
      });
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return res.status(500).json({ error: "Unable to submit dispute response" });
    }
  });

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
      await ensureBookingDisputesTable();

      // :id is now a dispute_cases.id; fall back to legacy booking_disputes.id lookup
      const caseId = asTrimmedString(req.params?.id);
      if (!caseId) {
        return res.status(400).json({ error: "Case id is required" });
      }

      // Resolve to a booking_id via dispute_cases first, then legacy table
      let resolvedBookingId: string | null = null;
      const caseRow = await db.execute(drizzleSql`SELECT booking_id FROM dispute_cases WHERE id = ${caseId} LIMIT 1`);
      if (caseRow.rows[0]) {
        resolvedBookingId = String((caseRow.rows[0] as any).booking_id);
      }

      // Legacy fallback: treat id as booking_disputes.id
      const disputeId = caseId;

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
        WHERE b.id = ${resolvedBookingId ?? disputeId}
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

      const resolvedDisputeId = disputeId;
      resolvedBookingId = bookingContext.bookingId as string;
      const activeCaseId = bookingContext.caseId as string | null;
      const dispute = { ...bookingContext, id: resolvedDisputeId };

      const now = new Date();

      if (payload.decision === "refund") {
        // Find the security deposit payment — check both new type ('security_deposit')
        // and legacy type ('deposit') for backward compatibility with old bookings.
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
              inArray(payments.paymentType, ["security_deposit", "deposit"])
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

        const { refundBookingPayment } = await import("./stripe");

        // Refund deposit portion.
        const depositRefund = depositRefundCents > 0
          ? await refundBookingPayment({
              paymentIntentId: depositPayment.stripePaymentIntentId,
              amount: depositRefundCents < depositAmt ? depositRefundCents : undefined,
              reason: "requested_by_customer",
              idempotencyKey: `admin-dispute-refund:${resolvedDisputeId}:${depositPayment.id}`,
            })
          : null;

        // Refund booking payment portion (vendor no-show / full cancellation).
        const bookingRefund = bookingRefundCents > 0 && bookingPayment
          ? await refundBookingPayment({
              paymentIntentId: bookingPayment.stripePaymentIntentId,
              amount: bookingRefundCents < (bookingPayment.amount ?? 0) ? bookingRefundCents : undefined,
              reason: "requested_by_customer",
              idempotencyKey: `admin-dispute-refund-booking:${resolvedDisputeId}:${bookingPayment.id}`,
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

          await tx
            .update(bookingDisputes)
            .set({
              status: "resolved_refund",
              adminDecision: withheld > 0 ? "partial_refund" : "refund",
              adminNotes: payload.adminNotes ?? null,
              resolvedAt: now,
              updatedAt: now,
            })
            .where(eq(bookingDisputes.id, resolvedDisputeId));

          // Update dispute_cases
          if (activeCaseId) {
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
          }
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
          disputeId: resolvedDisputeId,
          bookingId: resolvedBookingId,
          decision: "refund",
          depositRefund,
          bookingRefund,
          resolvedAt: now,
        });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(bookingDisputes)
          .set({
            status: "resolved_payout",
            adminDecision: "payout",
            adminNotes: payload.adminNotes ?? null,
            resolvedAt: now,
            updatedAt: now,
          })
          .where(eq(bookingDisputes.id, resolvedDisputeId));

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
              inArray(payments.paymentType, ["security_deposit", "deposit"])
            )
          );

        // Update dispute_cases
        if (activeCaseId) {
          const withheldForCase = null; // payout path: vendor receives full deposit, nothing withheld
          await tx.execute(drizzleSql`
            UPDATE dispute_cases
            SET status = 'resolved',
                resolution = ${payload.adminNotes ?? "Payout approved to vendor"},
                withheld_amount_cents = ${withheldForCase},
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
            inArray(payments.paymentType, ["security_deposit", "deposit"])
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
        disputeId: resolvedDisputeId,
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

  const createBookingSchema = z.object({
    vendorId: z.string().optional(),
    // listingId is optional for a-la-carte add-on-only bookings
    listingId: z.string().optional(),
    quantity: z.number().int().min(1).max(99).optional(),
    paymentMethodId: z.string().regex(/^pm_/, "Invalid Stripe payment method").optional(),
    idempotencyKey: z.string().min(16).max(128).optional(),
    customerEventId: z.string().optional(),
    customerEventTitle: z.string().max(160).optional(),
    eventId: z.string().optional(),
    // packageId: the package_item listing id selected within a package_container
    packageId: z.string().optional(),
    // addOnIds: legacy flat array of addon ids (each defaults to quantity=1)
    addOnIds: z.array(z.string()).max(20).optional(),
    // addOns: preferred format with per-item quantities
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

      const customerFee = Math.round(discountedSubtotal * CUSTOMER_FEE_RATE);
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
      const platformFee = Math.round(discountedSubtotal * VENDOR_FEE_RATE);
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

        const { createBookingPaymentIntent } = await import("./stripe");
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
        const { stripeClient } = await import("./stripe");
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

  // ---------------------------------------------------------------------------
  // Hosted Checkout Session — marketplace destination charge
  // ---------------------------------------------------------------------------
  // Creates a Stripe-hosted checkout page for a direct listing purchase.
  // The payment flows through the platform account and the net amount is
  // automatically transferred to the vendor via a destination charge.
  //
  // Usage: POST /api/checkout/session  { listingId: "..." }
  // Returns: { url: "https://checkout.stripe.com/..." }
  //
  // After the customer pays, Stripe fires checkout.session.completed to
  // /api/stripe/webhook and the session metadata links it back to the listing.

  const checkoutSessionSchema = z.object({
    listingId: z.string().min(1),
  });

  app.post("/api/checkout/session", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const { listingId } = checkoutSessionSchema.parse(req.body);

      // ── 1. Resolve the listing ──────────────────────────────────────────
      const [listing] = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          priceCents: vendorListings.priceCents,
          status: vendorListings.status,
          accountId: vendorListings.accountId,
        })
        .from(vendorListings)
        .where(eq(vendorListings.id, listingId))
        .limit(1);

      if (!listing) {
        return res.status(404).json({ error: "Listing not found" });
      }
      if (listing.status !== "active") {
        return res.status(400).json({ error: "This listing is not available for purchase" });
      }
      if (!listing.priceCents || listing.priceCents <= 0) {
        return res.status(400).json({ error: "Listing does not have a valid price" });
      }

      // ── 2. Resolve the vendor's connected Stripe account ───────────────
      const [vendor] = await db
        .select({
          stripeConnectId: vendorAccounts.stripeConnectId,
          stripeOnboardingComplete: vendorAccounts.stripeOnboardingComplete,
        })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, listing.accountId))
        .limit(1);

      if (!vendor?.stripeConnectId || !vendor.stripeOnboardingComplete) {
        return res.status(400).json({ error: "Vendor payment processing is not set up" });
      }

      // ── 3. Calculate fees ───────────────────────────────────────────────
      // application_fee_amount: the cut the platform retains from this charge.
      // The vendor receives: listingPrice − applicationFee − Stripe processing fee.
      const applicationFeeAmountCents = Math.round(listing.priceCents * VENDOR_FEE_RATE);

      // ── 4. Build redirect URLs ──────────────────────────────────────────
      const appBaseUrl = (process.env.APP_URL || "http://localhost:5173").trim().replace(/\/+$/, "");

      // {CHECKOUT_SESSION_ID} is a Stripe template literal — it is replaced by
      // the real session ID at redirect time, allowing the success page to verify
      // the payment via GET /api/checkout/session/:sessionId.
      const successUrl = `${appBaseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${appBaseUrl}/checkout/cancel`;

      // ── 5. Create the Stripe Checkout Session ──────────────────────────
      const { createCheckoutSession } = await import("./stripe");

      const session = await createCheckoutSession({
        listingName: listing.title || "EventHub Service",
        amountCents: listing.priceCents,
        currency: "usd",
        applicationFeeAmountCents,
        vendorStripeAccountId: vendor.stripeConnectId,
        successUrl,
        cancelUrl,
        // Store IDs in metadata so the checkout.session.completed webhook
        // can reconcile this payment with the listing and vendor in our DB.
        metadata: {
          listingId: listing.id,
          vendorAccountId: listing.accountId,
          vendorStripeAccountId: vendor.stripeConnectId,
          applicationFeeAmountCents: applicationFeeAmountCents.toString(),
        },
      });

      // Return the hosted checkout URL — the client should redirect to this.
      return res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  // GET /api/checkout/session/:sessionId — verify a completed checkout session.
  // Called by the success page to confirm payment before showing confirmation UI.
  app.get("/api/checkout/session/:sessionId", requireCustomerAnyAuth, async (req, res) => {
    try {
      const sessionId = asTrimmedString(req.params.sessionId);
      if (!sessionId) {
        return res.status(400).json({ error: "Missing session ID" });
      }

      const { stripeClient } = await import("./stripe");

      // Retrieve the session and expand the payment_intent so we can expose
      // payment status without requiring a separate API call from the client.
      const session = await stripeClient.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });

      return res.json({
        sessionId: session.id,
        paymentStatus: session.payment_status,   // "paid" | "unpaid" | "no_payment_required"
        status: session.status,                   // "open" | "complete" | "expired"
        amountTotal: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.post("/api/stripe/webhook", async (req, res) => {
    try {
      await ensureStripeWebhookTable();

      const signatureHeader = req.headers["stripe-signature"];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      if (!signature) {
        return res.status(400).json({ error: "Missing Stripe signature" });
      }

      const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
      if (!webhookSecret) {
        return res.status(503).json({ error: "Stripe webhook is not configured" });
      }

      if (!(req.rawBody instanceof Buffer)) {
        return res.status(400).json({ error: "Missing raw request body — ensure express.json verify middleware is active" });
      }
      const rawBody = req.rawBody;
      const { stripe } = await import("./stripe");

      let event: any;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch {
        return res.status(400).json({ error: "Invalid Stripe signature" });
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
        return res.json({ received: true, duplicate: true });
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

          await db.transaction(async (tx) => {
            const payment = await ensurePaymentRecordForIntentInTx(tx, {
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
            });
            if (!payment?.id || !payment.bookingId) return;

            const now = new Date();
            const [bookingRow] = await tx
              .select({
                id: bookings.id,
                status: bookings.status,
                cancellationReason: bookings.cancellationReason,
                bookingEndAt: bookings.bookingEndAt,
                totalAmount: bookings.totalAmount,
                platformFee: bookings.platformFee,
                subtotalAmountCents: bookings.subtotalAmountCents,
                vendorPayout: bookings.vendorPayout,
                instantBookSnapshot: bookings.instantBookSnapshot,
                outsideServiceRadius: bookings.outsideServiceRadius,
              })
              .from(bookings)
              .where(eq(bookings.id, payment.bookingId))
              .limit(1);
            if (!bookingRow?.id) return;
            const bookingDisputeStatus = await getBookingDisputeStatusInTx(tx, payment.bookingId);

            const payoutEligibility = computePayoutEligibility({
              bookingStatus: bookingRow.status,
              paymentStatus: eventType === "payment_intent.payment_failed" ? "failed" : "succeeded",
              payoutStatus: payment.payoutStatus,
              payoutBlockedReason: payment.payoutBlockedReason,
              disputeStatus: payment.disputeStatus,
              bookingDisputeStatus,
              paidOutAt: payment.paidOutAt,
              payoutEligibleAt: payment.payoutEligibleAt,
              bookingEndAt: bookingRow.bookingEndAt,
              totalAmount: payment.totalAmount ?? parseIntegerValue(bookingRow.totalAmount) ?? payment.amount,
              refundedAmount: payment.refundAmount,
              vendorNetPayoutAmount: payment.vendorNetPayoutAmount,
              actualStripeFeeAmount: actualStripeFeeAmount ?? payment.actualStripeFeeAmount,
              stripeConnectedAccountId:
                payment.stripeConnectedAccountId ?? fallbackStripeConnectedAccountId,
              stripeChargeId: payment.stripeChargeId ?? latestChargeId,
              stripeTransferId: payment.stripeTransferId,
              vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
            }, now);

            if (eventType === "payment_intent.succeeded") {
              if (isPaymentSucceededStatus(payment.status)) return;

              await tx
                .update(payments)
                .set({
                  status: "succeeded",
                  paidAt: now,
                  stripeChargeId: latestChargeId || payment.stripeChargeId || null,
                  actualStripeFeeAmount:
                    actualStripeFeeAmount ??
                    parseIntegerValue(payment.actualStripeFeeAmount) ??
                    parseIntegerValue(fallbackStripeProcessingFeeEstimate),
                  totalAmount:
                    parseIntegerValue(payment.totalAmount) ??
                    parseIntegerValue(bookingRow.totalAmount) ??
                    parseIntegerValue(payment.amount) ??
                    null,
                  platformFeeAmount:
                    parseIntegerValue(payment.platformFeeAmount) ??
                    parseIntegerValue(bookingRow.platformFee) ??
                    null,
                  vendorGrossAmount:
                    parseIntegerValue(payment.vendorGrossAmount) ??
                    parseIntegerValue(bookingRow.subtotalAmountCents),
                  vendorNetPayoutAmount:
                    parseIntegerValue(payment.vendorNetPayoutAmount) ??
                    parseIntegerValue(bookingRow.vendorPayout) ??
                    null,
                  stripeProcessingFeeEstimate:
                    parseIntegerValue(payment.stripeProcessingFeeEstimate) ??
                    parseIntegerValue(fallbackStripeProcessingFeeEstimate),
                  stripeConnectedAccountId:
                    payment.stripeConnectedAccountId ?? fallbackStripeConnectedAccountId,
                  payoutStatus: payoutEligibility.payoutStatus,
                  payoutEligibleAt: payoutEligibility.payoutEligibleAt,
                  payoutBlockedReason: payoutEligibility.payoutBlockedReason,
                  payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
                  disputeStatus: null,
                })
                .where(eq(payments.id, payment.id));

              // Mark the security deposit row (same PaymentIntent, separate row) as
              // succeeded so the auto-refund job and cancellation logic can find it.
              await tx
                .update(payments)
                .set({
                  status: "succeeded",
                  paidAt: now,
                  stripeChargeId: latestChargeId || null,
                })
                .where(
                  and(
                    eq(payments.stripePaymentIntentId, paymentIntentId),
                    eq(payments.paymentType, "security_deposit")
                  )
                );

              const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(
                tx,
                payment.bookingId
              );
              const bookingStatus = normalizePaymentStateValue(bookingRow.status);
              if (
                bookingStatus === "cancelled" ||
                bookingStatus === "expired" ||
                bookingStatus === "failed"
              ) {
                await tx
                  .update(bookings)
                  .set({
                    cancellationReason:
                      bookingRow.cancellationReason ||
                      `payment_succeeded_after_${bookingStatus || "closure"}`,
                    paymentStatus: nextBookingPaymentStatus as any,
                    updatedAt: now,
                  })
                  .where(eq(bookings.id, bookingRow.id));
              } else {
                // Request-to-book listings (instantBookSnapshot = false) must stay
                // "pending" after payment — the vendor needs to explicitly accept.
                // Instant-book listings outside the service radius also stay
                // "pending" because the vendor must confirm the out-of-area booking.
                // Only instant-book listings within the service radius are auto-confirmed.
                const isInstantBook = bookingRow.instantBookSnapshot !== false;
                const requiresVendorConfirmation = !isInstantBook || bookingRow.outsideServiceRadius === true;
                await tx
                  .update(bookings)
                  .set({
                    ...(!requiresVendorConfirmation
                      ? { status: "confirmed" as const, confirmedAt: now }
                      : {}),
                    paymentStatus: nextBookingPaymentStatus as any,
                    updatedAt: now,
                  })
                  .where(eq(bookings.id, bookingRow.id));
              }
              return;
            }

            if (isPaymentSucceededStatus(payment.status) || isPaymentRefundedOrPartiallyRefundedStatus(payment.status)) {
              return;
            }

            await tx
              .update(payments)
              .set({
                status: "failed",
                payoutStatus: "cancelled",
                payoutBlockedReason: "payment_failed",
                payoutAdjustedAmount: 0,
              })
              .where(eq(payments.id, payment.id));

            const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(
              tx,
              payment.bookingId
            );
            if (nextBookingPaymentStatus === "failed") {
              await markBookingAsPaymentFailedInTx(tx, payment.bookingId, "stripe_payment_failed");
            }
          });

          // Notify vendor of payment received (booking payments only, fire-and-forget)
          if (eventType === "payment_intent.succeeded" && fallbackPaymentType === "booking" && fallbackBookingId) {
            void (async () => {
              try {
                const paymentRows: any = await db.execute(drizzleSql`
                  select
                    b.vendor_account_id as "vendorAccountId",
                    b.event_date        as "eventDate",
                    coalesce(b.listing_title_snapshot, '') as "listingTitle"
                  from payments p
                  join bookings b on b.id = p.booking_id
                  where p.stripe_payment_intent_id = ${paymentIntentId}
                    and p.payment_type = 'booking'
                  limit 1
                `);
                const pr = extractRows<{ vendorAccountId: string; eventDate: string; listingTitle: string }>(paymentRows)[0];
                if (!pr?.vendorAccountId) return;
                await storage.createNotification({
                  recipientId: pr.vendorAccountId,
                  recipientType: "vendor",
                  type: "payment_received",
                  title: "Payment received",
                  message: `Payment for ${pr.listingTitle || "your service"} on ${pr.eventDate} has been received.`,
                  link: `/vendor/bookings?bookingId=${encodeURIComponent(fallbackBookingId)}`,
                  read: false,
                });
              } catch {}
            })();
          }

          // Fire-and-forget: send payment receipt to customer + booking confirmed to vendor
          if (eventType === "payment_intent.succeeded") {
            void (async () => {
              try {
                const serverUrl = appUrl();
                const receiptRows: any = await db.execute(drizzleSql`
                  select
                    u.email          as "customerEmail",
                    u.name           as "customerName",
                    va.email         as "vendorEmail",
                    va.business_name as "vendorName",
                    b.event_date     as "eventDate",
                    b.listing_title_snapshot as "listingTitle",
                    b.subtotal_amount_cents   as "subtotalCents",
                    b.customer_fee_amount_cents as "feeCents",
                    (b.total_amount - coalesce(b.security_deposit_cents, 0)) as "totalCents",
                    p.stripe_payment_intent_id as "paymentIntentId"
                  from payments p
                  join bookings b on b.id = p.booking_id
                  join users u on u.id = b.customer_id
                  join vendor_accounts va on va.id = b.vendor_account_id
                  where p.stripe_payment_intent_id = ${paymentIntentId}
                  limit 1
                `);
                const receipt = extractRows<{
                  customerEmail: string;
                  customerName: string;
                  vendorEmail: string | null;
                  vendorName: string;
                  eventDate: string;
                  listingTitle: string | null;
                  subtotalCents: number | null;
                  feeCents: number | null;
                  totalCents: number;
                  paymentIntentId: string;
                }>(receiptRows)[0];
                const receiptAddonRows: any = fallbackBookingId ? await db.execute(drizzleSql`
                  SELECT title, unit_price_cents, total_price_cents
                  FROM booking_items
                  WHERE booking_id = ${fallbackBookingId} AND item_type = 'addon'
                  ORDER BY created_at ASC
                `) : { rows: [] };
                const receiptAddOns = (receiptAddonRows.rows as any[]).map((r: any) => ({
                  title: String(r.title ?? "Add-on"),
                  priceCents: Number(r.total_price_cents ?? r.unit_price_cents ?? 0),
                }));

                const emailTasks: Promise<any>[] = [];
                if (receipt?.customerEmail) {
                  emailTasks.push(
                    sendPaymentReceiptEmail(receipt.customerEmail, {
                      recipientName: receipt.customerName || "Customer",
                      vendorName: receipt.vendorName || "Vendor",
                      listingTitle: receipt.listingTitle || "Service",
                      eventDate: receipt.eventDate,
                      subtotalCents: receipt.subtotalCents ?? receipt.totalCents,
                      platformFeeCents: receipt.feeCents ?? 0,
                      totalCents: receipt.totalCents,
                      paymentIntentId: receipt.paymentIntentId,
                      addOns: receiptAddOns,
                      serverUrl,
                    })
                  );
                }
                if (receipt?.vendorEmail) {
                  emailTasks.push(
                    sendBookingConfirmedEmail(receipt.vendorEmail, {
                      recipientName: receipt.vendorName || "Vendor",
                      counterpartName: receipt.customerName || "Customer",
                      eventDate: receipt.eventDate,
                      listingTitle: receipt.listingTitle || "Service",
                      totalAmountCents: receipt.totalCents,
                      addOns: receiptAddOns,
                      role: "vendor",
                      serverUrl,
                    })
                  );
                }
                await Promise.allSettled(emailTasks);
              } catch (emailError: any) {
                logger.warn("[payment email] failed:", emailError?.message || emailError);
              }
            })();

            // Fire-and-forget: eagerly create the Stream Chat channel so the vendor
            // can message the customer immediately after payment without waiting for
            // the lazy bootstrap triggered on first chat open.
            if (isStreamChatConfigured() && fallbackBookingId) {
              void (async () => {
                try {
                  const chatCtx = await getBookingChatContextById(fallbackBookingId);
                  if (chatCtx?.customerId && chatCtx?.vendorAccountId && chatCtx?.eventDate) {
                    await ensureStreamBookingChannel({
                      bookingId: chatCtx.bookingId,
                      eventDate: chatCtx.eventDate,
                      eventTitle: chatCtx.eventTitle,
                      customerId: chatCtx.customerId,
                      customerName: chatCtx.customerName,
                      customerEmail: chatCtx.customerEmail,
                      vendorAccountId: chatCtx.vendorAccountId,
                      vendorName: chatCtx.vendorName,
                      vendorEmail: chatCtx.vendorEmail,
                    });
                  }
                } catch (streamErr: any) {
                  logger.warn("[stream-chat] Failed to eagerly create booking channel:", streamErr?.message);
                }
              })();
            }
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
          const bookingDisputeStatus = await getBookingDisputeStatusInTx(tx, payment.bookingId);
          const payoutEligibility = computePayoutEligibility({
            bookingStatus: bookingRow.status,
            paymentStatus: nextPaymentStatus,
            payoutStatus: payment.payoutStatus,
            payoutBlockedReason: null,
            disputeStatus,
            bookingDisputeStatus,
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
            vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
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
            const bookingDisputeStatus = await getBookingDisputeStatusInTx(tx, payment.bookingId);

            const payoutEligibility = computePayoutEligibility({
              bookingStatus: bookingRow.status,
              paymentStatus: nextStatus,
              payoutStatus: payment.payoutStatus,
              payoutBlockedReason:
                asTrimmedString(payment.stripeTransferId) && !fullRefund
                  ? "refund_after_payout_manual_recovery"
                  : null,
              disputeStatus: payment.disputeStatus,
              bookingDisputeStatus,
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
              vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
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

      const whereClauses: any[] = [eq(payments.paymentType, "deposit")];
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

      const { transferToVendor } = await import("./stripe");

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
                bookingDisputeStatus: locked.bookingDisputeStatus,
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
                vendorAbsorbsStripeFees: VENDOR_ABSORBS_STRIPE_FEES,
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
          .where(and(eq(payments.bookingId, bookingId), eq(payments.paymentType, "deposit")))
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

        const { refundBookingPayment } = await import("./stripe");
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

  // ============================================
  // ADMIN ANALYTICS ENDPOINTS (unchanged)
  // ============================================

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
          if (email) {
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
      const [totalVisitsResult] = await db.select({ count: count() }).from(webTraffic);
      const totalVisits = totalVisitsResult.count;

      const [uniqueVisitorsResult] = await db
        .select({
          count: drizzleSql<number>`COUNT(DISTINCT ${webTraffic.userId})`,
        })
        .from(webTraffic)
        .where(drizzleSql`${webTraffic.userId} IS NOT NULL`);
      const uniqueVisitors = uniqueVisitorsResult.count;

      const topPaths = await db
        .select({
          path: webTraffic.path,
          count: count(),
        })
        .from(webTraffic)
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
        .where(gte(webTraffic.timestamp, thirtyDaysAgo))
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
        FROM booking_disputes
        WHERE status NOT IN ('resolved_refund', 'resolved_payout')
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
        WHERE p.payment_type = 'deposit'
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
      const { stripe } = await import("./stripe");
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

  // ── Circumvention Prevention ─────────────────────────────────────────────────

  // Helper: issue a warning to a vendor. If this is warning #3, trigger suspension.
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
      // Check if there is already an active suspension — do not double-suspend
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

        // Deactivate all listings for this vendor.
        // Intentionally leaves all existing bookings untouched — suspension
        // prevents NEW bookings by hiding listings, but does not cancel
        // in-progress or confirmed bookings that customers already made.
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

    // Fire-and-forget email notification
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

  // ── Soft-attempt thresholds ───────────────────────────────────────────────
  // Vendors get 5 "fix it" soft attempts before formal warnings begin.
  // Formal warnings count toward the 3-warning suspension threshold.
  const SOFT_ATTEMPT_LIMIT = 5;

  type ViolationResult =
    | { phase: "soft"; softAttemptNumber: number; flagId: string }
    | { phase: "hard"; warningNumber: number; suspended: boolean; endsAt: Date | null; flagId: string };

  /**
   * Central handler for automated hard-block detection across listings,
   * profiles, and chat messages.
   *
   * Phase 1 (soft attempts 1–5): logs the flag as `soft_attempt`, returns
   *   immediately — no warning issued, no email sent, no account action.
   * Phase 2 (hard warnings 1–3): logs flag as `hard_block_attempt`, issues
   *   a formal warning via issueCircumventionWarning, sends a warning email.
   * Phase 3 (after warning 3): suspension is triggered inside
   *   issueCircumventionWarning, email sent, listings deactivated.
   */
  async function handleCircumventionViolation(params: {
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

    // Count soft attempts already recorded for this vendor.
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
      // ── Soft phase: log and return, no warning ──────────────────────────
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

    // ── Hard phase: log and issue formal warning ──────────────────────────
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

  // Helper: get active suspension for a vendor (null if none)
  async function getActiveSuspension(vendorAccountId: string) {
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

  await ensureBookingDisputesTable();
  startAutoPayoutWorker();

  // ── Planning Boards ────────────────────────────────────────────────────────
  // All routes require a logged-in customer.

  // GET /api/boards/saved-ids — flat list of all listing IDs the customer has saved
  // (used client-side to fill the heart icon without fetching every board's details)
  app.get("/api/boards/saved-ids", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const rows = await db
        .select({ listingId: boardSavedListings.listingId })
        .from(boardSavedListings)
        .innerJoin(planningBoards, eq(planningBoards.id, boardSavedListings.boardId))
        .where(eq(planningBoards.customerId, customerAuth.id));

      return res.json({ listingIds: rows.map((r) => r.listingId) });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/boards/for-listing/:listingId — boards list with hasSaved flag for this listing
  // (drives the popover checkmarks; registered before /:id routes to avoid Express capture)
  app.get("/api/boards/for-listing/:listingId", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const listingId = req.params.listingId?.trim();
      if (!listingId) return res.status(400).json({ error: "listingId required" });

      const boards = await db
        .select({
          id: planningBoards.id,
          name: planningBoards.name,
          createdAt: planningBoards.createdAt,
          savedCount: count(boardSavedListings.id),
        })
        .from(planningBoards)
        .leftJoin(boardSavedListings, eq(boardSavedListings.boardId, planningBoards.id))
        .where(eq(planningBoards.customerId, customerAuth.id))
        .groupBy(planningBoards.id, planningBoards.name, planningBoards.createdAt)
        .orderBy(desc(planningBoards.createdAt));

      const savedRows = await db
        .select({ boardId: boardSavedListings.boardId })
        .from(boardSavedListings)
        .innerJoin(planningBoards, eq(planningBoards.id, boardSavedListings.boardId))
        .where(
          and(
            eq(planningBoards.customerId, customerAuth.id),
            eq(boardSavedListings.listingId, listingId),
          ),
        );

      const savedBoardIds = new Set(savedRows.map((r) => r.boardId));
      return res.json(boards.map((b) => ({ ...b, hasSaved: savedBoardIds.has(b.id) })));
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/boards — list boards for the authenticated customer
  app.get("/api/boards", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boards = await db
        .select({
          id: planningBoards.id,
          name: planningBoards.name,
          createdAt: planningBoards.createdAt,
          savedCount: count(boardSavedListings.id),
        })
        .from(planningBoards)
        .leftJoin(boardSavedListings, eq(boardSavedListings.boardId, planningBoards.id))
        .where(eq(planningBoards.customerId, customerAuth.id))
        .groupBy(planningBoards.id, planningBoards.name, planningBoards.createdAt)
        .orderBy(desc(planningBoards.createdAt));

      return res.json(boards);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/boards — create a new board
  app.post("/api/boards", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!name) return res.status(400).json({ error: "name is required" });
      if (name.length > 120) return res.status(400).json({ error: "name must be 120 characters or fewer" });

      const [board] = await db
        .insert(planningBoards)
        .values({ customerId: customerAuth.id, name })
        .returning();

      return res.status(201).json(board);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // DELETE /api/boards/:id — delete a board (owner only)
  app.delete("/api/boards/:id", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      if (!boardId) return res.status(400).json({ error: "Board id required" });

      const [existing] = await db
        .select({ id: planningBoards.id, customerId: planningBoards.customerId })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Board not found" });
      if (existing.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      await db.delete(planningBoards).where(eq(planningBoards.id, boardId));
      return res.status(204).send();
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // GET /api/boards/:id/listings — list saved listings for a board
  app.get("/api/boards/:id/listings", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      if (!boardId) return res.status(400).json({ error: "Board id required" });

      const [board] = await db
        .select({ id: planningBoards.id, customerId: planningBoards.customerId, name: planningBoards.name })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!board) return res.status(404).json({ error: "Board not found" });
      if (board.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      const rows = await db
        .select({
          savedAt: boardSavedListings.savedAt,
          listing: vendorListings,
        })
        .from(boardSavedListings)
        .innerJoin(vendorListings, eq(vendorListings.id, boardSavedListings.listingId))
        .where(and(
          eq(boardSavedListings.boardId, boardId),
          ne(vendorListings.status, "deleted")
        ))
        .orderBy(desc(boardSavedListings.savedAt));

      return res.json({
        board: { id: board.id, name: board.name },
        listings: rows.map((r) => ({
          ...r.listing,
          photos: (r.listing.photos ?? []).map((p: string) => resolveStoredUploadPath(p) ?? p),
          savedAt: r.savedAt,
        })),
      });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/boards/:id/listings — save a listing to a board
  app.post("/api/boards/:id/listings", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      const listingId = typeof req.body?.listingId === "string" ? req.body.listingId.trim() : "";
      if (!boardId) return res.status(400).json({ error: "Board id required" });
      if (!listingId) return res.status(400).json({ error: "listingId is required" });

      const [board] = await db
        .select({ customerId: planningBoards.customerId })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!board) return res.status(404).json({ error: "Board not found" });
      if (board.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      // Upsert — ignore conflict on (board_id, listing_id)
      const [saved] = await db
        .insert(boardSavedListings)
        .values({ boardId, listingId })
        .onConflictDoNothing()
        .returning();

      return res.status(201).json(saved ?? { boardId, listingId });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // DELETE /api/boards/:id/listings/:listingId — remove a listing from a board
  app.delete("/api/boards/:id/listings/:listingId", boardsRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });

      const boardId = req.params.id?.trim();
      const listingId = req.params.listingId?.trim();
      if (!boardId || !listingId) return res.status(400).json({ error: "Board id and listing id required" });

      const [board] = await db
        .select({ customerId: planningBoards.customerId })
        .from(planningBoards)
        .where(eq(planningBoards.id, boardId))
        .limit(1);

      if (!board) return res.status(404).json({ error: "Board not found" });
      if (board.customerId !== customerAuth.id) return res.status(403).json({ error: "Forbidden" });

      await db
        .delete(boardSavedListings)
        .where(
          and(
            eq(boardSavedListings.boardId, boardId),
            eq(boardSavedListings.listingId, listingId),
          ),
        );

      return res.status(204).send();
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });
  // ── End Planning Boards ────────────────────────────────────────────────────

  // ── Customer Notifications ─────────────────────────────────────────────────

  app.get("/api/customer/notifications", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.json([]);
      const notifs = await storage.getNotificationsByRecipient(customerAuth.id, "customer");
      res.json(notifs);
    } catch (err: any) {
      logRouteError("/api/customer/notifications", err);
      res.status(500).json({ error: "Unable to load notifications" });
    }
  });

  app.get("/api/customer/notifications/unread-count", requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.json({ unreadCount: 0 });
      const notifs = await storage.getNotificationsByRecipient(customerAuth.id, "customer");
      const unreadCount = notifs.filter((n: any) => !n.read).length;
      res.json({ unreadCount });
    } catch (err: any) {
      logRouteError("/api/customer/notifications/unread-count", err);
      res.status(500).json({ unreadCount: 0 });
    }
  });

  app.patch("/api/customer/notifications/bulk/read", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });
      const { ids } = req.body as { ids?: unknown };
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return res.status(400).json({ error: "ids must be an array of strings" });
      }
      const updated = await storage.bulkMarkNotificationsRead(ids, customerAuth.id, "customer");
      res.json({ updated });
    } catch (err: any) {
      logRouteError("/api/customer/notifications/bulk/read", err);
      res.status(500).json({ error: "Unable to mark notifications as read" });
    }
  });

  app.patch("/api/customer/notifications/:id/read", mutationRateLimiter, requireCustomerAnyAuth, async (req, res) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Authentication required" });
      const updated = await storage.markNotificationAsRead(req.params.id, customerAuth.id, "customer");
      if (!updated) return res.status(404).json({ error: "Notification not found" });
      res.json({ success: true });
    } catch (err: any) {
      logRouteError("/api/customer/notifications/:id/read", err);
      res.status(500).json({ error: "Unable to update notification" });
    }
  });

  // ── End Customer Notifications ─────────────────────────────────────────────

  // ── Feedback Submissions ───────────────────────────────────────────────────
  // Customers and vendors can submit feature requests and bug reports.
  // Admins can view and flag submissions for follow-up.

  const feedbackUploadsDir = path.join(process.cwd(), "server/uploads/feedback");

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

        const ext = path.extname(req.file.originalname).toLowerCase() || ".bin";
        const filename = `${crypto.randomUUID()}${ext}`;

        if (isObjectStorageConfigured()) {
          const key = `feedback/${filename}`;
          const { url } = await uploadBufferToObjectStorage({ buffer: req.file.buffer, key, contentType: req.file.mimetype });
          return res.json({ url });
        }

        await fs.mkdir(feedbackUploadsDir, { recursive: true });
        await fs.writeFile(path.join(feedbackUploadsDir, filename), req.file.buffer);
        return res.json({ url: `/uploads/feedback/${filename}` });
      } catch (err: any) {
        return respondWithInternalServerError(req, res, err);
      }
    }
  );

  // POST /api/feedback — submit a feature request or bug report
  app.post("/api/feedback", mutationRateLimiter, requireAuth0, async (req: any, res: any) => {
    try {
      const auth0 = req.auth0 as { sub?: string; email?: string; name?: string } | undefined;
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
        ? await resolveVendorAccountForAuth0Identity({ auth0Sub: auth0.sub, email: auth0.email, context: "feedback" })
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

  // ── End Feedback Submissions ───────────────────────────────────────────────

  // ── Dispute Case System ────────────────────────────────────────────────────

  /**
   * Shared helper: find or create a dispute_cases row for a booking.
   * Returns { caseId }.
   */
  async function findOrCreateDisputeCase(bookingId: string): Promise<string> {
    const existing = await db.execute(drizzleSql`
      SELECT id FROM dispute_cases WHERE booking_id = ${bookingId} LIMIT 1
    `);
    if (existing.rows[0]) return String((existing.rows[0] as any).id);

    const inserted = await db.execute(drizzleSql`
      INSERT INTO dispute_cases (booking_id, status, response_deadline_at, created_at, updated_at)
      VALUES (${bookingId}, 'open', now() + interval '72 hours', now(), now())
      ON CONFLICT (booking_id) DO UPDATE SET updated_at = now()
      RETURNING id
    `);
    return String((inserted.rows[0] as any).id);
  }

  /**
   * GET /api/vendor/disputes
   * Returns all dispute cases for the authenticated vendor, with filings.
   */
  app.get("/api/vendor/disputes", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

      const rows = await db.execute(drizzleSql`
        SELECT
          dc.id                  AS case_id,
          dc.booking_id,
          dc.status              AS case_status,
          dc.resolution,
          dc.resolved_at,
          dc.response_deadline_at,
          dc.created_at          AS case_created_at,
          dc.updated_at          AS case_updated_at,
          b.event_date,
          b.listing_title_snapshot,
          b.status               AS booking_status,
          u.name                 AS customer_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN users u ON u.id = b.customer_id
        WHERE b.vendor_account_id = ${account.id}
        ORDER BY dc.updated_at DESC
        LIMIT 100
      `);

      const cases = rows.rows as any[];
      if (cases.length === 0) return res.json([]);

      const caseIds = cases.map((c: any) => c.case_id);
      const filingsRows = await db.execute(drizzleSql`
        SELECT
          df.id, df.case_id, df.filed_by, df.dispute_type,
          df.description, df.attachment_urls, df.claim_amount_cents,
          df.is_response, df.created_at,
          u.name           AS filer_customer_name,
          va.business_name AS filer_vendor_name
        FROM dispute_filings df
        LEFT JOIN users u ON u.id = df.filer_customer_id
        LEFT JOIN vendor_accounts va ON va.id = df.filer_vendor_account_id
        WHERE df.case_id = ANY(${toPgTextArray(caseIds)}::text[])
        ORDER BY df.created_at ASC
      `);

      const filingsByCaseId: Record<string, any[]> = {};
      for (const f of filingsRows.rows as any[]) {
        if (!filingsByCaseId[f.case_id]) filingsByCaseId[f.case_id] = [];
        filingsByCaseId[f.case_id].push(f);
      }

      return res.json(cases.map((c: any) => ({
        ...c,
        filings: filingsByCaseId[c.case_id] ?? [],
      })));
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * POST /api/vendor/disputes
   * Vendor files a new dispute filing (creates a case if none exists for the booking).
   */
  app.post("/api/vendor/disputes", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

      const payload = z.object({
        bookingId: z.string().min(1),
        disputeType: z.enum(["travel_cost_recovery", "damage_claim", "customer_no_show", "other"]),
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
        claimAmountCents: z.number().int().positive().optional(),
      }).parse(req.body ?? {});

      // Verify the booking belongs to this vendor
      const bookingResult = await db.execute(drizzleSql`
        SELECT id, status, vendor_account_id, customer_id,
               listing_title_snapshot, event_date
        FROM bookings
        WHERE id = ${payload.bookingId}
          AND vendor_account_id = ${account.id}
        LIMIT 1
      `);
      const bk = bookingResult.rows[0] as any;
      if (!bk) return res.status(404).json({ error: "Booking not found" });

      const allowedStatuses = ["pending", "confirmed", "completed", "cancelled"];
      if (!allowedStatuses.includes(bk.status)) {
        return res.status(400).json({ error: "Disputes can only be filed on active or closed bookings" });
      }

      const caseId = await findOrCreateDisputeCase(payload.bookingId);

      // Mark case as pending_review since vendor just filed
      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_vendor_account_id,
          dispute_type, description, attachment_urls, claim_amount_cents,
          created_at, updated_at
        ) VALUES (
          ${caseId}, ${payload.bookingId}, 'vendor',
          ${account.id},
          ${payload.disputeType}, ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[], ${payload.claimAmountCents ?? null},
          now(), now()
        )
        RETURNING *
      `);

      return res.status(201).json({ caseId, filing: (filing.rows[0] as any) });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * GET /api/customer/disputes
   * Returns all dispute cases for the authenticated customer, with filings.
   */
  app.get("/api/customer/disputes", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const rows = await db.execute(drizzleSql`
        SELECT
          dc.id                  AS case_id,
          dc.booking_id,
          dc.status              AS case_status,
          dc.resolution,
          dc.resolved_at,
          dc.response_deadline_at,
          dc.created_at          AS case_created_at,
          dc.updated_at          AS case_updated_at,
          b.event_date,
          b.listing_title_snapshot,
          b.status               AS booking_status,
          va.business_name       AS vendor_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        WHERE b.customer_id = ${customerAuth.id}
        ORDER BY dc.updated_at DESC
        LIMIT 100
      `);

      const cases = rows.rows as any[];
      if (cases.length === 0) return res.json([]);

      const caseIds = cases.map((c: any) => c.case_id);
      const filingsRows = await db.execute(drizzleSql`
        SELECT
          df.id, df.case_id, df.filed_by, df.dispute_type,
          df.description, df.attachment_urls, df.claim_amount_cents,
          df.is_response, df.created_at,
          u.name           AS filer_customer_name,
          va.business_name AS filer_vendor_name
        FROM dispute_filings df
        LEFT JOIN users u ON u.id = df.filer_customer_id
        LEFT JOIN vendor_accounts va ON va.id = df.filer_vendor_account_id
        WHERE df.case_id = ANY(${toPgTextArray(caseIds)}::text[])
        ORDER BY df.created_at ASC
      `);

      const filingsByCaseId: Record<string, any[]> = {};
      for (const f of filingsRows.rows as any[]) {
        if (!filingsByCaseId[f.case_id]) filingsByCaseId[f.case_id] = [];
        filingsByCaseId[f.case_id].push(f);
      }

      return res.json(cases.map((c: any) => ({
        ...c,
        filings: filingsByCaseId[c.case_id] ?? [],
      })));
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * POST /api/customer/disputes
   * Customer files a new dispute filing.
   */
  app.post("/api/customer/disputes", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const payload = z.object({
        bookingId: z.string().min(1),
        disputeType: z.enum(["service_not_as_described", "vendor_no_show", "safety_concern", "other"]),
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
        claimAmountCents: z.number().int().positive().optional(),
      }).parse(req.body ?? {});

      const bookingResult = await db.execute(drizzleSql`
        SELECT id, status, customer_id, vendor_account_id,
               listing_title_snapshot, event_date, booking_end_at
        FROM bookings
        WHERE id = ${payload.bookingId}
          AND customer_id = ${customerAuth.id}
        LIMIT 1
      `);
      const bk = bookingResult.rows[0] as any;
      if (!bk) return res.status(404).json({ error: "Booking not found" });
      const allowedStatuses = ["pending", "confirmed", "completed", "cancelled"];
      if (!allowedStatuses.includes(bk.status)) {
        return res.status(400).json({ error: "Disputes can only be filed on active or closed bookings" });
      }

      // Event must have ended and dispute window must still be open
      if (bk.booking_end_at) {
        const endAt = new Date(bk.booking_end_at);
        const now = new Date();
        if (now < endAt) {
          return res.status(400).json({ error: "Disputes can only be filed after the event has ended" });
        }
        if (!isDisputeWindowOpen(endAt, now)) {
          return res.status(400).json({
            error: `Dispute window closed. Disputes are only allowed within ${DISPUTE_WINDOW_HOURS} hours after event completion.`,
          });
        }
      }

      // Block filing on an already-resolved case
      const existingCaseResult = await db.execute(drizzleSql`
        SELECT id, status FROM dispute_cases WHERE booking_id = ${payload.bookingId} LIMIT 1
      `);
      const existingCase = existingCaseResult.rows[0] as any;
      if (existingCase?.status === "resolved") {
        return res.status(409).json({ error: "This dispute has already been resolved" });
      }

      const caseId = await findOrCreateDisputeCase(payload.bookingId);

      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_customer_id,
          dispute_type, description, attachment_urls, claim_amount_cents,
          created_at, updated_at
        ) VALUES (
          ${caseId}, ${payload.bookingId}, 'customer',
          ${customerAuth.id},
          ${payload.disputeType}, ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[], ${payload.claimAmountCents ?? null},
          now(), now()
        )
        RETURNING *
      `);

      return res.status(201).json({ caseId, filing: (filing.rows[0] as any) });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * POST /api/vendor/disputes/:caseId/respond
   * Vendor submits a one-time response to a customer-initiated dispute case.
   * Blocked if: case is resolved, deadline passed, vendor already responded,
   * or the original filing was from the vendor (can't respond to your own).
   */
  app.post("/api/vendor/disputes/:caseId/respond", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

      const caseId = asTrimmedString(req.params?.caseId);
      if (!caseId) return res.status(400).json({ error: "Case id required" });

      const payload = z.object({
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
      }).parse(req.body ?? {});

      // Load the case and verify it belongs to this vendor's booking
      const caseResult = await db.execute(drizzleSql`
        SELECT
          dc.id, dc.status, dc.response_deadline_at,
          b.vendor_account_id,
          b.listing_title_snapshot,
          b.event_date,
          cust.email AS customer_email,
          cust.name  AS customer_name,
          va.business_name AS vendor_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN users cust ON cust.id = b.customer_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        WHERE dc.id = ${caseId}
        LIMIT 1
      `);
      const dc = caseResult.rows[0] as any;
      if (!dc) return res.status(404).json({ error: "Dispute case not found" });
      if (dc.vendor_account_id !== account.id) return res.status(403).json({ error: "Access denied" });
      if (dc.status === "resolved") return res.status(409).json({ error: "This dispute has already been resolved" });

      const now = new Date();
      if (dc.response_deadline_at && now > new Date(dc.response_deadline_at)) {
        return res.status(409).json({ error: "The 72-hour response window for this dispute has closed" });
      }

      // Check all filings: ensure at least one is from a customer, and vendor hasn't already responded
      const filingsResult = await db.execute(drizzleSql`
        SELECT filed_by, is_response FROM dispute_filings WHERE case_id = ${caseId}
      `);
      const filings = filingsResult.rows as any[];
      const hasCustomerFiling = filings.some((f: any) => f.filed_by === "customer");
      const vendorAlreadyResponded = filings.some((f: any) => f.filed_by === "vendor" && f.is_response === true);

      if (!hasCustomerFiling) {
        return res.status(409).json({ error: "There is no customer filing to respond to" });
      }
      if (vendorAlreadyResponded) {
        return res.status(409).json({ error: "You have already submitted a response to this dispute" });
      }

      // Insert the response filing
      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_vendor_account_id,
          dispute_type, description, attachment_urls,
          is_response, created_at, updated_at
        )
        SELECT
          ${caseId}, dc.booking_id, 'vendor',
          ${account.id},
          'response_to_dispute', ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[],
          true, now(), now()
        FROM dispute_cases dc WHERE dc.id = ${caseId}
        RETURNING *
      `);

      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      // Notify the customer that the vendor has responded
      if (dc.customer_email) {
        sendDisputeResponseEmail(dc.customer_email, {
          recipientName: asTrimmedString(dc.customer_name) || "Customer",
          otherPartyName: asTrimmedString(dc.vendor_name) || "Vendor",
          listingTitle: asTrimmedString(dc.listing_title_snapshot) || "Your booking",
          eventDate: asTrimmedString(dc.event_date) || "N/A",
          serverUrl: appUrl(),
        }).catch(() => {});
      }

      return res.status(201).json({ caseId, filing: filing.rows[0] });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * POST /api/customer/disputes/:caseId/respond
   * Customer submits a one-time response to a vendor-initiated dispute case.
   * Blocked if: case is resolved, deadline passed, customer already responded,
   * or the original filing was from the customer (can't respond to your own).
   */
  app.post("/api/customer/disputes/:caseId/respond", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const caseId = asTrimmedString(req.params?.caseId);
      if (!caseId) return res.status(400).json({ error: "Case id required" });

      const payload = z.object({
        description: z.string().trim().min(10).max(3000),
        attachmentUrls: z.array(z.string().min(1)).max(5).default([]),
      }).parse(req.body ?? {});

      // Load the case and verify it belongs to this customer's booking
      const caseResult = await db.execute(drizzleSql`
        SELECT
          dc.id, dc.status, dc.response_deadline_at,
          b.customer_id,
          b.listing_title_snapshot,
          b.event_date,
          cust.name AS customer_name,
          va.email  AS vendor_email,
          va.business_name AS vendor_name
        FROM dispute_cases dc
        JOIN bookings b ON b.id = dc.booking_id
        LEFT JOIN users cust ON cust.id = b.customer_id
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        WHERE dc.id = ${caseId}
        LIMIT 1
      `);
      const dc = caseResult.rows[0] as any;
      if (!dc) return res.status(404).json({ error: "Dispute case not found" });
      if (dc.customer_id !== customerAuth.id) return res.status(403).json({ error: "Access denied" });
      if (dc.status === "resolved") return res.status(409).json({ error: "This dispute has already been resolved" });

      const now = new Date();
      if (dc.response_deadline_at && now > new Date(dc.response_deadline_at)) {
        return res.status(409).json({ error: "The 72-hour response window for this dispute has closed" });
      }

      // Check all filings: ensure at least one is from a vendor, and customer hasn't already responded
      const filingsResult = await db.execute(drizzleSql`
        SELECT filed_by, is_response FROM dispute_filings WHERE case_id = ${caseId}
      `);
      const filings = filingsResult.rows as any[];
      const hasVendorFiling = filings.some((f: any) => f.filed_by === "vendor");
      const customerAlreadyResponded = filings.some((f: any) => f.filed_by === "customer" && f.is_response === true);

      if (!hasVendorFiling) {
        return res.status(409).json({ error: "There is no vendor filing to respond to" });
      }
      if (customerAlreadyResponded) {
        return res.status(409).json({ error: "You have already submitted a response to this dispute" });
      }

      // Insert the response filing
      const filing = await db.execute(drizzleSql`
        INSERT INTO dispute_filings (
          case_id, booking_id, filed_by,
          filer_customer_id,
          dispute_type, description, attachment_urls,
          is_response, created_at, updated_at
        )
        SELECT
          ${caseId}, dc.booking_id, 'customer',
          ${customerAuth.id},
          'response_to_dispute', ${payload.description},
          ${toPgTextArray(payload.attachmentUrls)}::text[],
          true, now(), now()
        FROM dispute_cases dc WHERE dc.id = ${caseId}
        RETURNING *
      `);

      await db.execute(drizzleSql`
        UPDATE dispute_cases
        SET status = 'pending_review', updated_at = now()
        WHERE id = ${caseId} AND status = 'open'
      `);

      // Notify the vendor that the customer has responded
      if (dc.vendor_email) {
        sendDisputeResponseEmail(dc.vendor_email, {
          recipientName: asTrimmedString(dc.vendor_name) || "Vendor",
          otherPartyName: asTrimmedString(dc.customer_name) || "Customer",
          listingTitle: asTrimmedString(dc.listing_title_snapshot) || "Your booking",
          eventDate: asTrimmedString(dc.event_date) || "N/A",
          serverUrl: appUrl(),
        }).catch(() => {});
      }

      return res.status(201).json({ caseId, filing: filing.rows[0] });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: err.errors });
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * GET /api/vendor/disputes/bookings
   * Returns the vendor's bookings eligible to have a dispute filed (pending/confirmed/completed/cancelled).
   */
  app.get("/api/vendor/disputes/bookings", socialRateLimiter, ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });

      const rows = await db.execute(drizzleSql`
        SELECT
          b.id, b.status, b.event_date, b.booking_end_at, b.listing_title_snapshot,
          b.total_amount, b.vendor_payout, b.platform_fee, b.base_subtotal_cents,
          b.delivery_fee_amount_cents, b.setup_fee_amount_cents, b.travel_fee_amount_cents,
          b.discount_amount_cents, b.security_deposit_cents,
          b.booked_quantity, b.unit_price_cents_snapshot, b.pricing_unit_snapshot,
          u.name AS customer_name,
          dc.id  AS existing_case_id
        FROM bookings b
        LEFT JOIN users u ON u.id = b.customer_id
        LEFT JOIN dispute_cases dc ON dc.booking_id = b.id
        WHERE b.vendor_account_id = ${account.id}
          AND b.status IN ('pending', 'confirmed', 'completed', 'cancelled')
          AND (
            b.booking_end_at IS NULL
            OR (now() >= b.booking_end_at AND now() < b.booking_end_at + INTERVAL '72 hours')
          )
        ORDER BY
          CASE b.status
            WHEN 'pending'   THEN 1
            WHEN 'confirmed' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'cancelled' THEN 4
            ELSE 5
          END,
          b.event_date DESC NULLS LAST
        LIMIT 200
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  /**
   * GET /api/customer/disputes/bookings
   * Returns the customer's bookings eligible to have a dispute filed.
   */
  app.get("/api/customer/disputes/bookings", socialRateLimiter, requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });

      const rows = await db.execute(drizzleSql`
        SELECT
          b.id, b.status, b.event_date, b.booking_end_at, b.listing_title_snapshot,
          b.total_amount, b.base_subtotal_cents, b.customer_fee_amount_cents,
          b.delivery_fee_amount_cents, b.setup_fee_amount_cents, b.travel_fee_amount_cents,
          b.discount_amount_cents, b.security_deposit_cents,
          b.booked_quantity, b.unit_price_cents_snapshot, b.pricing_unit_snapshot,
          va.business_name AS vendor_name,
          dc.id            AS existing_case_id
        FROM bookings b
        LEFT JOIN vendor_accounts va ON va.id = b.vendor_account_id
        LEFT JOIN dispute_cases dc ON dc.booking_id = b.id
        WHERE b.customer_id = ${customerAuth.id}
          AND b.status IN ('pending', 'confirmed', 'completed', 'cancelled')
          AND (
            b.booking_end_at IS NULL
            OR (now() >= b.booking_end_at AND now() < b.booking_end_at + INTERVAL '72 hours')
          )
        ORDER BY
          CASE b.status
            WHEN 'pending'   THEN 1
            WHEN 'confirmed' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'cancelled' THEN 4
            ELSE 5
          END,
          b.event_date DESC NULLS LAST
        LIMIT 200
      `);
      return res.json(rows.rows);
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // ── End Dispute Case System ────────────────────────────────────────────────

  // ── Booking Add-on Items ───────────────────────────────────────────────────

  app.get("/api/vendor/bookings/:bookingId/addon-items", ...requireVendorAuth0, async (req: any, res: any) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) return res.status(401).json({ error: "Vendor auth required" });
      const { bookingId } = req.params;
      const owns = await db.execute(drizzleSql`SELECT id FROM bookings WHERE id = ${bookingId} AND vendor_account_id = ${account.id} LIMIT 1`);
      if (!owns.rows[0]) return res.status(403).json({ error: "Not authorized" });
      const rows = await db.execute(drizzleSql`
        SELECT title, unit_price_cents, total_price_cents
        FROM booking_items
        WHERE booking_id = ${bookingId} AND item_type = 'addon'
        ORDER BY created_at ASC
      `);
      return res.json((rows.rows as any[]).map(r => ({
        title: r.title ?? "Add-on",
        priceCents: r.total_price_cents ?? r.unit_price_cents ?? 0,
      })));
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  app.get("/api/customer/bookings/:bookingId/addon-items", requireCustomerAnyAuth, async (req: any, res: any) => {
    try {
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
      if (!customerAuth?.id) return res.status(401).json({ error: "Customer auth required" });
      const { bookingId } = req.params;
      const owns = await db.execute(drizzleSql`SELECT id FROM bookings WHERE id = ${bookingId} AND customer_id = ${customerAuth.id} LIMIT 1`);
      if (!owns.rows[0]) return res.status(403).json({ error: "Not authorized" });
      const rows = await db.execute(drizzleSql`
        SELECT title, unit_price_cents, total_price_cents
        FROM booking_items
        WHERE booking_id = ${bookingId} AND item_type = 'addon'
        ORDER BY created_at ASC
      `);
      return res.json((rows.rows as any[]).map(r => ({
        title: r.title ?? "Add-on",
        priceCents: r.total_price_cents ?? r.unit_price_cents ?? 0,
      })));
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

  // ── End Platform Health Monitor ────────────────────────────────────────────

  // ── Vendor Discount System ─────────────────────────────────────────────────

  // GET /api/listings/:id/active-sale — public endpoint, returns active public sale for a listing
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

  // POST /api/discounts/validate-code — public endpoint, validates a promo code for a listing
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

  // GET /api/vendor/discounts — list vendor's discounts with listing IDs
  app.get("/api/vendor/discounts", requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      const rows = await db
        .select({
          id: vendorDiscounts.id,
          discountType: vendorDiscounts.discountType,
          code: vendorDiscounts.code,
          percentOff: vendorDiscounts.percentOff,
          startsAt: vendorDiscounts.startsAt,
          endsAt: vendorDiscounts.endsAt,
          maxUses: vendorDiscounts.maxUses,
          usedCount: vendorDiscounts.usedCount,
          active: vendorDiscounts.active,
          createdAt: vendorDiscounts.createdAt,
          listingId: discountListings.listingId,
        })
        .from(vendorDiscounts)
        .leftJoin(discountListings, eq(discountListings.discountId, vendorDiscounts.id))
        .where(eq(vendorDiscounts.vendorAccountId, vendorAccount.id))
        .orderBy(desc(vendorDiscounts.createdAt));

      // Group listing IDs per discount
      const discountMap = new Map<string, any>();
      for (const row of rows) {
        if (!discountMap.has(row.id)) {
          discountMap.set(row.id, {
            id: row.id,
            discountType: row.discountType,
            code: row.code,
            percentOff: row.percentOff,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            maxUses: row.maxUses,
            usedCount: row.usedCount,
            active: row.active,
            createdAt: row.createdAt,
            listingIds: [],
          });
        }
        if (row.listingId) {
          discountMap.get(row.id).listingIds.push(row.listingId);
        }
      }

      const now = new Date();
      const result = Array.from(discountMap.values()).map((d) => ({
        ...d,
        status: !d.active
          ? "expired"
          : now > d.endsAt
            ? "expired"
            : now < d.startsAt
              ? "scheduled"
              : "active",
      }));

      return res.json({ discounts: result });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // POST /api/vendor/discounts — create a discount
  app.post("/api/vendor/discounts", mutationRateLimiter, requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      const createDiscountSchema = z.object({
        discountType: z.enum(["promo_code", "public_sale"]),
        code: z.string().max(32).optional(),
        percentOff: z.number().int().min(1).max(100),
        startsAt: z.string(),
        endsAt: z.string(),
        maxUses: z.number().int().min(1).optional(),
        listingIds: z.array(z.string()).min(1, "At least one listing is required"),
      });

      const parsed = createDiscountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }
      const body = parsed.data;

      // Validate code format for promo codes
      if (body.discountType === "promo_code") {
        if (!body.code) return res.status(400).json({ error: "Promo code is required for promo_code type" });
        if (!/^[A-Z0-9]+$/.test(body.code.toUpperCase())) {
          return res.status(400).json({ error: "Promo code must be uppercase letters and numbers only" });
        }
        body.code = body.code.toUpperCase();
      }

      const startsAt = new Date(body.startsAt);
      const endsAt = new Date(body.endsAt);
      if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      if (endsAt <= startsAt) {
        return res.status(400).json({ error: "End date must be after start date" });
      }

      // Verify vendor owns all listed listings
      const ownedListings = await db
        .select({ id: vendorListings.id })
        .from(vendorListings)
        .where(
          and(
            inArray(vendorListings.id, body.listingIds),
            eq(vendorListings.accountId, vendorAccount.id),
          ),
        );

      if (ownedListings.length !== body.listingIds.length) {
        return res.status(403).json({ error: "One or more listings do not belong to this vendor" });
      }

      // Warn on overlapping public sales for the same listing (non-blocking)
      let overlappingSale = false;
      if (body.discountType === "public_sale") {
        const overlaps = await db
          .select({ id: vendorDiscounts.id })
          .from(vendorDiscounts)
          .innerJoin(discountListings, eq(discountListings.discountId, vendorDiscounts.id))
          .where(
            and(
              eq(vendorDiscounts.discountType, "public_sale"),
              eq(vendorDiscounts.active, true),
              inArray(discountListings.listingId, body.listingIds),
              lte(vendorDiscounts.startsAt, endsAt),
              gte(vendorDiscounts.endsAt, startsAt),
            ),
          )
          .limit(1);
        overlappingSale = overlaps.length > 0;
      }

      const [discount] = await db
        .insert(vendorDiscounts)
        .values({
          vendorAccountId: vendorAccount.id,
          discountType: body.discountType,
          code: body.discountType === "promo_code" ? body.code : null,
          percentOff: body.percentOff,
          startsAt,
          endsAt,
          maxUses: body.discountType === "promo_code" ? (body.maxUses ?? null) : null,
          active: true,
        })
        .returning();

      if (body.listingIds.length > 0) {
        await db.insert(discountListings).values(
          body.listingIds.map((listingId) => ({ discountId: discount.id, listingId })),
        );
      }

      return res.status(201).json({ discount, overlappingSale });
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ error: "A promo code with that name already exists" });
      }
      return respondWithInternalServerError(req, res, err);
    }
  });

  // PATCH /api/vendor/discounts/:id — update a discount
  app.patch("/api/vendor/discounts/:id", mutationRateLimiter, requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      const discountId = req.params.id?.trim();
      if (!discountId) return res.status(400).json({ error: "Discount ID required" });

      const [existing] = await db
        .select({ id: vendorDiscounts.id, vendorAccountId: vendorDiscounts.vendorAccountId, discountType: vendorDiscounts.discountType })
        .from(vendorDiscounts)
        .where(eq(vendorDiscounts.id, discountId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Discount not found" });
      if (existing.vendorAccountId !== vendorAccount.id) return res.status(403).json({ error: "Forbidden" });

      const updateSchema = z.object({
        code: z.string().max(32).optional(),
        percentOff: z.number().int().min(1).max(100).optional(),
        startsAt: z.string().optional(),
        endsAt: z.string().optional(),
        maxUses: z.number().int().min(1).nullable().optional(),
        active: z.boolean().optional(),
        listingIds: z.array(z.string()).min(1).optional(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", details: parsed.error.errors });
      }
      const body = parsed.data;

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (body.percentOff !== undefined) updates.percentOff = body.percentOff;
      if (body.active !== undefined) updates.active = body.active;
      if (body.maxUses !== undefined) updates.maxUses = body.maxUses;

      if (body.code !== undefined && existing.discountType === "promo_code") {
        const upperCode = body.code.toUpperCase();
        if (!/^[A-Z0-9]+$/.test(upperCode)) {
          return res.status(400).json({ error: "Promo code must be uppercase letters and numbers only" });
        }
        updates.code = upperCode;
      }

      if (body.startsAt) updates.startsAt = new Date(body.startsAt);
      if (body.endsAt) updates.endsAt = new Date(body.endsAt);
      if (updates.startsAt && updates.endsAt && updates.endsAt <= updates.startsAt) {
        return res.status(400).json({ error: "End date must be after start date" });
      }

      const [updated] = await db
        .update(vendorDiscounts)
        .set(updates)
        .where(eq(vendorDiscounts.id, discountId))
        .returning();

      if (body.listingIds) {
        // Verify ownership
        const owned = await db
          .select({ id: vendorListings.id })
          .from(vendorListings)
          .where(and(inArray(vendorListings.id, body.listingIds), eq(vendorListings.accountId, vendorAccount.id)));

        if (owned.length !== body.listingIds.length) {
          return res.status(403).json({ error: "One or more listings do not belong to this vendor" });
        }

        await db.delete(discountListings).where(eq(discountListings.discountId, discountId));
        await db.insert(discountListings).values(
          body.listingIds.map((listingId) => ({ discountId, listingId })),
        );
      }

      return res.json({ discount: updated });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // DELETE /api/vendor/discounts/:id — delete a discount
  app.delete("/api/vendor/discounts/:id", mutationRateLimiter, requireAuth0, requireVendorAccountAuth0, async (req, res) => {
    try {
      const vendorAccount = await getVendorAccountFromRequest(req);
      if (!vendorAccount?.id) return res.status(401).json({ error: "Unauthorized" });

      const discountId = req.params.id?.trim();
      if (!discountId) return res.status(400).json({ error: "Discount ID required" });

      const [existing] = await db
        .select({ id: vendorDiscounts.id, vendorAccountId: vendorDiscounts.vendorAccountId })
        .from(vendorDiscounts)
        .where(eq(vendorDiscounts.id, discountId))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Discount not found" });
      if (existing.vendorAccountId !== vendorAccount.id) return res.status(403).json({ error: "Forbidden" });

      await db.delete(vendorDiscounts).where(eq(vendorDiscounts.id, discountId));

      return res.json({ deleted: true });
    } catch (err: any) {
      return respondWithInternalServerError(req, res, err);
    }
  });

  // ── End Vendor Discount System ─────────────────────────────────────────────

  const httpServer = createServer(app);
  return httpServer;
}
