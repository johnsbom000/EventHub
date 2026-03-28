import type { Express } from "express";
import { createServer, type Server } from "http";
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
  insertUserSchema,
  webTraffic,
  bookings,
  events,
  paymentSchedules,
  payments,
  bookingDisputes,
  rentalTypes,
  stripeWebhookEvents,
} from "@shared/schema";
import {
  hashPassword,
  verifyToken,
  requireDualAuthAuth0,
  requireAdminAuth,
  resolveVendorAccountForAuth0Identity,
} from "./auth";
import { requireAuth0, verifyAuth0Token } from "./auth0"; // ✅ Auth0 middleware
import { z } from "zod";
import { db } from "./db";
import { eq, and, or, ne, isNull, inArray, sql as drizzleSql, count, sum, gte, lte, desc, asc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendBookingConfirmationEmail } from "./email";
import {
  computeChatRetentionExpiry,
  deleteStreamBookingChannel,
  ensureStreamBookingChannel,
  getAverageVendorResponseMinutesForBookings,
  getStreamUnreadCountsForBookings,
  getStreamApiKey,
  isChatExpiredForEventDate,
  isStreamChatConfigured,
  toStreamUserId,
} from "./streamChat";
import {
  GoogleCalendarConnectionError,
  createGoogleCalendarForVendorAccount,
  listGoogleCalendarsForVendorAccount,
  listSelectedGoogleCalendarEventsForVendorAccount,
  syncEventHubBookingToGoogleCalendar,
} from "./google";
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
    const resolution = await resolveVendorAccountForAuth0Identity({
      auth0Sub: auth0?.sub,
      email: auth0?.email,
      context: "requireVendorAccountAuth0",
    });
    const account = resolution.account;

    if (!account) {
      // Auth0 is valid, but user doesn't have a vendor account row yet
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
    console.error("requireVendorAccountAuth0 failed:", err?.message || err);
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
const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const VENDOR_FEE_RATE = 0.08;
const CUSTOMER_FEE_RATE = 0.05;
const BOOKING_PENDING_EXPIRY_MINUTES = 30;
const BOOKING_PENDING_EXPIRY_REASON = "payment_session_expired";
const PAYOUT_RELEASE_MODE = "auto_24h_hold";
const STRIPE_FEE_ESTIMATE_PERCENT = 0.029;
const STRIPE_FEE_ESTIMATE_FIXED_CENTS = 30;
const VENDOR_ABSORBS_STRIPE_FEES = false;
const AUTO_PAYOUT_INTERVAL_MS = 30 * 1000;
const MIN_LISTING_PHOTO_COUNT = 3;
const LISTING_DESCRIPTION_MAX_CHARS = 1000;
const LISTING_SUBCATEGORY_MAX_CHARS = 120;
const LISTING_CATEGORY_VALUES = ["Rentals", "Services", "Venues", "Catering"] as const;
type ListingCategoryValue = (typeof LISTING_CATEGORY_VALUES)[number];
const CHAT_POLICY_WARNING =
  "For your safety, do not share personal contact info, payment card details, or sensitive personal data in chat.";
let moderationTableReadyPromise: Promise<void> | null = null;
let stripeWebhookTableReadyPromise: Promise<void> | null = null;
let bookingDisputesTableReadyPromise: Promise<void> | null = null;
let autoPayoutWorkerStarted = false;
let autoPayoutTickInFlight = false;
const IP_RATE_WINDOW_MS = 60 * 1000;

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

function createGoogleOauthState(vendorAccountId: string) {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }

  const encodedPayload = Buffer.from(
    JSON.stringify({
      vendorAccountId,
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

    return { vendorAccountId: parsed.vendorAccountId.trim() };
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

type IpRateState = {
  count: number;
  resetAt: number;
};

function getRequestIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return (req.ip || req.socket?.remoteAddress || "unknown").toString();
}

function createIpRateLimiter(options: { label: string; maxPerMinute: number }) {
  const state = new Map<string, IpRateState>();
  const maxPerMinute = Math.max(1, Math.min(options.maxPerMinute, 100));

  return (req: any, res: any, next: any) => {
    const now = Date.now();
    const ip = getRequestIp(req);
    const key = `${options.label}:${ip}`;
    const current = state.get(key);

    if (!current || current.resetAt <= now) {
      state.set(key, { count: 1, resetAt: now + IP_RATE_WINDOW_MS });
      return next();
    }

    if (current.count >= maxPerMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Too many requests. Please try again shortly." });
    }

    current.count += 1;
    state.set(key, current);
    return next();
  };
}

const paymentRateLimiter = createIpRateLimiter({
  label: "payments",
  maxPerMinute: 20,
});

const uploadRateLimiter = createIpRateLimiter({
  label: "uploads",
  maxPerMinute: 30,
});

const bookingRateLimiter = createIpRateLimiter({
  label: "bookings",
  maxPerMinute: 5,
});

function logRouteError(route: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${route} failed:`, message);
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

function extractRows<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function normalizePaymentStateValue(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toCanonicalPaymentStatus(value: unknown) {
  const status = normalizePaymentStateValue(value);
  if (status === "paid") return "succeeded";
  if (status === "partial") return "partially_refunded";
  return status;
}

function isPaymentSucceededStatus(value: unknown) {
  const status = toCanonicalPaymentStatus(value);
  return status === "succeeded";
}

function isPaymentRefundedOrPartiallyRefundedStatus(value: unknown) {
  const status = toCanonicalPaymentStatus(value);
  return status === "refunded" || status === "partially_refunded";
}

function estimateStripeProcessingFeeCents(amountCents: number) {
  const amount = Math.max(0, Math.round(amountCents));
  if (amount <= 0) return 0;
  return Math.max(0, Math.round(amount * STRIPE_FEE_ESTIMATE_PERCENT) + STRIPE_FEE_ESTIMATE_FIXED_CENTS);
}

function deriveBookingPaymentStatusFromScheduleStatuses(rawStatuses: unknown[]) {
  const statuses = rawStatuses.map(toCanonicalPaymentStatus).filter(Boolean);
  if (statuses.length === 0) return "pending";

  if (statuses.includes("disputed")) return "disputed";
  if (statuses.includes("requires_action")) return "requires_action";
  if (statuses.every((status) => status === "refunded")) return "refunded";
  if (statuses.every((status) => status === "succeeded")) return "succeeded";
  if (statuses.every((status) => status === "partially_refunded")) return "partially_refunded";

  const anyPaid = statuses.includes("succeeded");
  const anyRefunded = statuses.includes("refunded");
  const anyPartialRefund = statuses.includes("partially_refunded");
  if (anyPartialRefund || (anyPaid && anyRefunded)) return "partially_refunded";

  if (statuses.some((status) => status === "failed")) return "failed";
  return "pending";
}

function isPaymentCollectedStatus(paymentStatus: unknown) {
  const status = toCanonicalPaymentStatus(paymentStatus);
  return (
    status === "partially_refunded" ||
    status === "succeeded" ||
    status === "refunded" ||
    status === "disputed"
  );
}

function shouldCountBookingAsInventoryReserved(status: unknown) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return normalized === "pending" || normalized === "confirmed" || normalized === "completed";
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeListingTitleCandidate(value: unknown): string | null {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title) return null;
  const normalized = title.toLowerCase();
  if (
    normalized === "listing" ||
    normalized === "untitled listing" ||
    normalized === "new unspecified listing" ||
    normalized === "new unspecified lisitng" ||
    normalized === "untitled"
  ) {
    return null;
  }
  return title;
}

function parseAddressLabel(label: string): {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
} {
  const parts = label
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return { streetAddress: "", city: "", state: "", zipCode: "" };
  }

  if (parts.length === 2) {
    return {
      streetAddress: "",
      city: parts[0] ?? "",
      state: parts[1] ?? "",
      zipCode: "",
    };
  }

  const streetAddress = parts[0] ?? "";
  const city = parts[1] ?? "";
  const stateZipChunk = parts[2] ?? "";
  const stateZipMatch = stateZipChunk.match(/^(.+?)\s+(\d{5})(?:-\d{4})?$/);

  if (stateZipMatch) {
    return {
      streetAddress,
      city,
      state: stateZipMatch[1].trim(),
      zipCode: stateZipMatch[2].trim(),
    };
  }

  return {
    streetAddress,
    city,
    state: stateZipChunk,
    zipCode: "",
  };
}

function hasValidListingPrice(listingDataRaw: unknown, canonicalPriceCents?: unknown): boolean {
  const cents = extractListingBasePriceCents(listingDataRaw as any, canonicalPriceCents);
  return cents != null && cents > 0;
}

function normalizeListingCategory(value: unknown): ListingCategoryValue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized) return null;

  if (normalized === "rentals" || normalized === "rental") return "Rentals";
  if (normalized === "services" || normalized === "service") return "Services";
  if (normalized === "venues" || normalized === "venue") return "Venues";
  if (normalized === "catering") return "Catering";
  return null;
}

function mapServiceTypeToListingCategory(serviceType: unknown): ListingCategoryValue {
  const normalized = asTrimmedString(serviceType).toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized) return "Services";

  if (normalized === "prop-decor" || normalized === "prop-rental" || normalized === "rental" || normalized === "rentals") {
    return "Rentals";
  }
  if (normalized === "venue" || normalized === "venues") return "Venues";
  if (normalized === "catering") return "Catering";
  return "Services";
}

function isInstantBookingCategory(category: ListingCategoryValue | null) {
  return category === "Rentals";
}

function resolveBookingLifecycleMode(input: {
  listingCategory?: unknown;
  listingInstantBookEnabled?: unknown;
  fallbackServiceType?: unknown;
}) {
  const category =
    normalizeListingCategory(input.listingCategory) ??
    (input.fallbackServiceType ? mapServiceTypeToListingCategory(input.fallbackServiceType) : null);
  const explicitInstantBook = parseBooleanInput(input.listingInstantBookEnabled);
  const isInstantBooking = explicitInstantBook ?? isInstantBookingCategory(category);

  return {
    category,
    isInstantBooking,
    initialStatus: (isInstantBooking ? "confirmed" : "pending") as "confirmed" | "pending",
  };
}

function normalizeListingSubcategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, LISTING_SUBCATEGORY_MAX_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeListingClassification(
  listingDataRaw: unknown,
  options?: {
    fallbackServiceType?: unknown;
    requireCategory?: boolean;
    allowLegacyFallback?: boolean;
  }
): {
  listingData: Record<string, any>;
  category: ListingCategoryValue | null;
  subcategory: string | null;
  missingCategory: boolean;
} {
  const listingData =
    listingDataRaw && typeof listingDataRaw === "object" && !Array.isArray(listingDataRaw)
      ? ({ ...(listingDataRaw as Record<string, any>) } as Record<string, any>)
      : ({} as Record<string, any>);

  let category =
    normalizeListingCategory(listingData.category) ?? null;

  const allowLegacyFallback = options?.allowLegacyFallback ?? true;

  if (!category && allowLegacyFallback) {
    const legacyListingType = asTrimmedString(listingData.vendorType) || asTrimmedString(listingData.serviceType);
    if (legacyListingType) {
      category = mapServiceTypeToListingCategory(legacyListingType);
    }
  }

  if (!category && allowLegacyFallback && options?.fallbackServiceType) {
    category = mapServiceTypeToListingCategory(options.fallbackServiceType);
  }

  const subcategory = normalizeListingSubcategory(listingData.subcategory);

  if (category) listingData.category = category;
  else delete listingData.category;

  if (subcategory) listingData.subcategory = subcategory;
  else delete listingData.subcategory;

  return {
    listingData,
    category,
    subcategory,
    missingCategory: Boolean(options?.requireCategory && !category),
  };
}

async function backfillListingCategoriesFromProfileType(accountId?: string): Promise<number> {
  const accountFilterSql = accountId ? drizzleSql`and vl.account_id = ${accountId}` : drizzleSql``;

  const result: any = await db.execute(drizzleSql`
    with updated as (
      update vendor_listings vl
      set
        listing_data = jsonb_set(
          coalesce(vl.listing_data, '{}'::jsonb),
          '{category}',
          to_jsonb(
            case
              when lower(coalesce(vp.service_type, '')) in ('prop-decor', 'prop-rental', 'rental', 'rentals') then 'Rentals'
              when lower(coalesce(vp.service_type, '')) in ('venue', 'venues') then 'Venues'
              when lower(coalesce(vp.service_type, '')) = 'catering' then 'Catering'
              else 'Services'
            end
          ),
          true
        ),
        updated_at = now()
      from vendor_profiles vp
      where vp.id = vl.profile_id
        and (
          vl.listing_data is null
          or nullif(btrim(coalesce(vl.listing_data ->> 'category', '')), '') is null
        )
        ${accountFilterSql}
      returning vl.id
    )
    select count(*)::int as "count" from updated
  `);

  const rows = extractRows<{ count?: number | string }>(result);
  return Number(rows[0]?.count || 0);
}

function toUniqueTrimmedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    )
  );
}

function clampDescriptionText(value: unknown): string | unknown {
  if (typeof value !== "string") return value;
  return value.slice(0, LISTING_DESCRIPTION_MAX_CHARS);
}

function normalizeTitleCaseText(value: unknown, maxLen: number): string | unknown {
  if (typeof value !== "string") return value;

  const cleaned = value
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeProfileNameText(value: unknown, maxLen = 120): string {
  if (typeof value !== "string") return "";

  const cleaned = value
    .replace(/[’]/g, "'")
    .replace(/[^a-zA-Z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeTagEntry(rawTag: unknown): { label: string; slug: string } | null {
  const source =
    typeof rawTag === "string"
      ? rawTag
      : rawTag && typeof rawTag === "object"
        ? typeof (rawTag as Record<string, unknown>).label === "string"
          ? ((rawTag as Record<string, unknown>).label as string)
          : typeof (rawTag as Record<string, unknown>).slug === "string"
            ? ((rawTag as Record<string, unknown>).slug as string).replace(/-/g, " ")
            : ""
        : "";

  const normalizedLabel = normalizeTitleCaseText(source, 30);
  const label = typeof normalizedLabel === "string" ? normalizedLabel : "";
  if (!label) return null;

  const slug = label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  if (!slug) return null;
  return { label, slug };
}

function normalizeTagsByPropType(rawTagsByPropType: unknown): unknown {
  if (!rawTagsByPropType || typeof rawTagsByPropType !== "object" || Array.isArray(rawTagsByPropType)) {
    return rawTagsByPropType;
  }

  const normalizedByPropType: Record<string, { label: string; slug: string }[]> = {};

  for (const [key, rawTags] of Object.entries(rawTagsByPropType as Record<string, unknown>)) {
    if (!Array.isArray(rawTags)) {
      normalizedByPropType[key] = [];
      continue;
    }

    const seenSlugs = new Set<string>();
    const normalizedTags: { label: string; slug: string }[] = [];

    for (const rawTag of rawTags) {
      const normalizedTag = normalizeTagEntry(rawTag);
      if (!normalizedTag) continue;
      if (seenSlugs.has(normalizedTag.slug)) continue;
      seenSlugs.add(normalizedTag.slug);
      normalizedTags.push(normalizedTag);
      if (normalizedTags.length >= 15) break;
    }

    normalizedByPropType[key] = normalizedTags;
  }

  return normalizedByPropType;
}

function clampListingDescriptions(listingDataRaw: unknown): unknown {
  if (!listingDataRaw || typeof listingDataRaw !== "object" || Array.isArray(listingDataRaw)) {
    return listingDataRaw;
  }

  const listingData = listingDataRaw as Record<string, any>;
  const nextListingData: Record<string, any> = { ...listingData };

  nextListingData.listingTitle = normalizeTitleCaseText(nextListingData.listingTitle, 60);
  nextListingData.listingDescription = clampDescriptionText(nextListingData.listingDescription);
  nextListingData.tagsByPropType = normalizeTagsByPropType(nextListingData.tagsByPropType);

  const rawPerPropDetails = nextListingData.perPropDetails;
  if (rawPerPropDetails && typeof rawPerPropDetails === "object" && !Array.isArray(rawPerPropDetails)) {
    const nextPerPropDetails: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawPerPropDetails)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        nextPerPropDetails[key] = value;
        continue;
      }
      nextPerPropDetails[key] = {
        ...(value as Record<string, any>),
        title: normalizeTitleCaseText((value as Record<string, any>).title, 60),
        description: clampDescriptionText((value as Record<string, any>).description),
      };
    }
    nextListingData.perPropDetails = nextPerPropDetails;
  }

  return nextListingData;
}

function getListingPhotoCount(listingDataRaw: unknown, canonicalPhotos?: unknown): number {
  const typedPhotos = toUniqueTrimmedStringList(canonicalPhotos);
  if (typedPhotos.length > 0) return typedPhotos.length;

  const listingData =
    listingDataRaw && typeof listingDataRaw === "object" ? (listingDataRaw as Record<string, any>) : {};
  const photoBlock = listingData?.photos;

  const names = toUniqueTrimmedStringList(photoBlock?.names);
  const urls = toUniqueTrimmedStringList(photoBlock?.urls);
  const directList = toUniqueTrimmedStringList(Array.isArray(photoBlock) ? photoBlock : []);

  const dedupedPhotos = new Set<string>([
    ...names.map((name) => `name:${name}`),
    ...urls.map((url) => `url:${url}`),
    ...directList.map((item) => `direct:${item}`),
  ]);

  if (dedupedPhotos.size > 0) return dedupedPhotos.size;

  const fallbackCount = Number(photoBlock?.count);
  if (Number.isFinite(fallbackCount) && fallbackCount > 0) {
    return Math.floor(fallbackCount);
  }

  return 0;
}

function hasMinimumListingPhotos(listingDataRaw: unknown, canonicalPhotos?: unknown): boolean {
  return getListingPhotoCount(listingDataRaw, canonicalPhotos) >= MIN_LISTING_PHOTO_COUNT;
}

function parseBooleanInput(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return null;
}

function parseMoneyToCents(value: unknown): number | null {
  const numeric = toOptionalNumber(value);
  if (numeric == null || !Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function parseLatLngValue(value: unknown): number | null {
  const n = toOptionalNumber(value);
  return n != null && Number.isFinite(n) ? n : null;
}

function parseIntegerValue(value: unknown): number | null {
  const n = toOptionalNumber(value);
  if (n == null || !Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function toCanonicalTagList(listingData: Record<string, any>): string[] {
  const directTags = toUniqueTrimmedStringList(listingData?.tags);
  if (directTags.length > 0) return directTags;

  const listingTags: unknown[] = Array.isArray(listingData?.tagsByPropType?.__listing__)
    ? listingData.tagsByPropType.__listing__
    : [];
  const normalizedTags = listingTags
    .map((tag: unknown) => normalizeTagEntry(tag))
    .filter((tag): tag is { label: string; slug: string } => Boolean(tag))
    .map((tag: { label: string; slug: string }) => tag.label);
  return toUniqueTrimmedStringList(normalizedTags);
}

function buildCanonicalListingColumns(input: {
  listingDataRaw: unknown;
  existingCanonical?: {
    category?: unknown;
    subcategory?: unknown;
    title?: unknown;
    description?: unknown;
    whatsIncluded?: unknown;
    tags?: unknown;
    popularFor?: unknown;
    instantBookEnabled?: unknown;
    pricingUnit?: unknown;
    priceCents?: unknown;
    quantity?: unknown;
    minimumHours?: unknown;
    listingServiceCenterLabel?: unknown;
    listingServiceCenterLat?: unknown;
    listingServiceCenterLng?: unknown;
    serviceRadiusMiles?: unknown;
    serviceAreaMode?: unknown;
    travelOffered?: unknown;
    travelFeeEnabled?: unknown;
    travelFeeType?: unknown;
    travelFeeAmountCents?: unknown;
    pickupOffered?: unknown;
    deliveryOffered?: unknown;
    deliveryFeeEnabled?: unknown;
    deliveryFeeAmountCents?: unknown;
    setupOffered?: unknown;
    setupFeeEnabled?: unknown;
    setupFeeAmountCents?: unknown;
    photos?: unknown;
  };
  classification: {
    category: ListingCategoryValue | null;
    subcategory: string | null;
  };
}) {
  const listingData =
    input.listingDataRaw && typeof input.listingDataRaw === "object" && !Array.isArray(input.listingDataRaw)
      ? (input.listingDataRaw as Record<string, any>)
      : {};

  const existing = input.existingCanonical ?? {};
  const pricingUnitRaw = asTrimmedString(listingData?.pricingUnit || existing?.pricingUnit).toLowerCase();
  const pricingUnit =
    pricingUnitRaw === "per_hour" || pricingUnitRaw === "per_day"
      ? pricingUnitRaw
      : asTrimmedString(existing?.pricingUnit).toLowerCase() === "per_hour"
        ? "per_hour"
        : "per_day";

  const explicitInstantBook = parseBooleanInput(listingData?.instantBookEnabled);
  const instantBookEnabled =
    explicitInstantBook ??
    parseBooleanInput(existing?.instantBookEnabled) ??
    (input.classification.category === "Rentals" ? true : false);

  const explicitPriceCents = parseIntegerValue(listingData?.priceCents);
  const fallbackPriceCents =
    parseMoneyToCents(listingData?.price) ??
    parseMoneyToCents(listingData?.rate) ??
    parseIntegerValue(existing?.priceCents);
  const priceCents =
    explicitPriceCents != null && explicitPriceCents >= 0 ? explicitPriceCents : fallbackPriceCents;

  const minimumHoursRaw = parseIntegerValue(listingData?.minimumHours ?? existing?.minimumHours);
  const minimumHours =
    pricingUnit === "per_hour" && minimumHoursRaw != null && minimumHoursRaw > 0 ? minimumHoursRaw : null;

  const quantityCandidates = [listingData?.quantity, existing?.quantity];
  const quantity =
    quantityCandidates
      .map((value) => parseIntegerValue(value))
      .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ?? 1;

  const serviceAreaModeRaw = asTrimmedString(listingData?.serviceAreaMode ?? existing?.serviceAreaMode).toLowerCase();
  const serviceAreaMode =
    serviceAreaModeRaw === "radius" || serviceAreaModeRaw === "nationwide" || serviceAreaModeRaw === "global"
      ? serviceAreaModeRaw
      : "radius";

  const listingServiceCenterLat =
    parseLatLngValue(listingData?.listingServiceCenterLat) ??
    parseLatLngValue(listingData?.serviceCenter?.lat) ??
    parseLatLngValue(listingData?.serviceLocation?.lat) ??
    parseLatLngValue(existing?.listingServiceCenterLat);
  const listingServiceCenterLng =
    parseLatLngValue(listingData?.listingServiceCenterLng) ??
    parseLatLngValue(listingData?.serviceCenter?.lng) ??
    parseLatLngValue(listingData?.serviceLocation?.lng) ??
    parseLatLngValue(existing?.listingServiceCenterLng);

  const deliveryOffered =
    parseBooleanInput(listingData?.deliveryOffered) ??
    parseBooleanInput(listingData?.deliveryIncluded) ??
    parseBooleanInput(existing?.deliveryOffered) ??
    false;
  const deliveryFeeEnabledRaw =
    parseBooleanInput(listingData?.deliveryFeeEnabled) ??
    parseBooleanInput(existing?.deliveryFeeEnabled) ??
    false;
  const deliveryFeeEnabled = deliveryOffered ? deliveryFeeEnabledRaw : false;
  const deliveryFeeAmountCentsRaw =
    parseIntegerValue(listingData?.deliveryFeeAmountCents) ??
    parseMoneyToCents(listingData?.deliveryFeeAmount) ??
    parseIntegerValue(existing?.deliveryFeeAmountCents);

  const setupOffered =
    parseBooleanInput(listingData?.setupOffered) ??
    parseBooleanInput(listingData?.setupIncluded) ??
    parseBooleanInput(existing?.setupOffered) ??
    false;
  const setupFeeEnabledRaw =
    parseBooleanInput(listingData?.setupFeeEnabled) ??
    parseBooleanInput(existing?.setupFeeEnabled) ??
    false;
  const setupFeeEnabled = setupOffered ? setupFeeEnabledRaw : false;
  const setupFeeAmountCentsRaw =
    parseIntegerValue(listingData?.setupFeeAmountCents) ??
    parseMoneyToCents(listingData?.setupFeeAmount) ??
    parseIntegerValue(existing?.setupFeeAmountCents);

  const travelOffered =
    parseBooleanInput(listingData?.travelOffered) ??
    parseBooleanInput(existing?.travelOffered) ??
    false;
  const travelFeeEnabledRaw =
    parseBooleanInput(listingData?.travelFeeEnabled) ??
    parseBooleanInput(existing?.travelFeeEnabled) ??
    false;
  const travelFeeEnabled = travelOffered ? travelFeeEnabledRaw : false;
  const travelFeeTypeRaw = asTrimmedString(listingData?.travelFeeType ?? existing?.travelFeeType).toLowerCase();
  const travelFeeTypeNormalized =
    travelFeeTypeRaw === "flat" || travelFeeTypeRaw === "per_mile" || travelFeeTypeRaw === "per_hour"
      ? travelFeeTypeRaw
      : null;
  const travelFeeType = travelFeeEnabled ? travelFeeTypeNormalized ?? "flat" : null;
  const travelFeeAmountCentsRaw =
    parseIntegerValue(listingData?.travelFeeAmountCents) ??
    parseMoneyToCents(listingData?.travelFeeAmount) ??
    parseIntegerValue(existing?.travelFeeAmountCents);

  const pickupCategoryDefault =
    input.classification.category === "Rentals" || input.classification.category === "Catering";
  const pickupOffered =
    parseBooleanInput(listingData?.pickupOffered) ??
    parseBooleanInput(existing?.pickupOffered) ??
    pickupCategoryDefault;

  const photoNames = toUniqueTrimmedStringList(listingData?.photos?.names);
  const photoUrls = toUniqueTrimmedStringList(listingData?.photos?.urls);
  const photoFallback = toUniqueTrimmedStringList(Array.isArray(listingData?.photos) ? listingData?.photos : []);
  const existingPhotos = toUniqueTrimmedStringList(existing?.photos);
  const photos =
    photoNames.length > 0 ? photoNames : photoUrls.length > 0 ? photoUrls : photoFallback.length > 0 ? photoFallback : existingPhotos;

  return {
    category: input.classification.category ?? normalizeListingCategory(existing?.category),
    subcategory: input.classification.subcategory ?? normalizeListingSubcategory(existing?.subcategory),
    title:
      normalizeListingTitleCandidate(listingData?.title) ??
      normalizeListingTitleCandidate(listingData?.listingTitle) ??
      normalizeListingTitleCandidate(existing?.title) ??
      null,
    description:
      asTrimmedString(listingData?.description || listingData?.listingDescription) ||
      asTrimmedString(existing?.description) ||
      null,
    whatsIncluded:
      toUniqueTrimmedStringList(listingData?.whatsIncluded ?? listingData?.includedItems ?? listingData?.included).length > 0
        ? toUniqueTrimmedStringList(listingData?.whatsIncluded ?? listingData?.includedItems ?? listingData?.included)
        : toUniqueTrimmedStringList(existing?.whatsIncluded),
    tags: toCanonicalTagList(listingData).length > 0 ? toCanonicalTagList(listingData) : toUniqueTrimmedStringList(existing?.tags),
    popularFor:
      toUniqueTrimmedStringList(listingData?.popularFor).length > 0
        ? toUniqueTrimmedStringList(listingData?.popularFor)
        : toUniqueTrimmedStringList(existing?.popularFor),
    instantBookEnabled,
    pricingUnit,
    priceCents,
    quantity: Math.max(1, Math.floor(quantity)),
    minimumHours,
    listingServiceCenterLabel:
      asTrimmedString(listingData?.listingServiceCenterLabel) ||
      asTrimmedString(listingData?.serviceLocation?.label) ||
      asTrimmedString(existing?.listingServiceCenterLabel) ||
      null,
    listingServiceCenterLat,
    listingServiceCenterLng,
    serviceRadiusMiles:
      parseIntegerValue(listingData?.serviceRadiusMiles) ??
      parseIntegerValue(existing?.serviceRadiusMiles),
    serviceAreaMode,
    travelOffered,
    travelFeeEnabled,
    travelFeeType,
    travelFeeAmountCents: travelFeeEnabled ? travelFeeAmountCentsRaw ?? null : null,
    pickupOffered,
    deliveryOffered,
    deliveryFeeEnabled,
    deliveryFeeAmountCents: deliveryFeeEnabled ? deliveryFeeAmountCentsRaw ?? null : null,
    setupOffered,
    setupFeeEnabled,
    setupFeeAmountCents: setupFeeEnabled ? setupFeeAmountCentsRaw ?? null : null,
    photos,
  };
}

function resolveCanonicalListingCategory(listingDataRaw: unknown, canonicalCategory?: unknown): ListingCategoryValue | null {
  return (
    normalizeListingCategory(canonicalCategory) ??
    normalizeListingClassification(listingDataRaw, {
      allowLegacyFallback: false,
    }).category
  );
}

function isListingPubliclyCompliant(input: {
  listingDataRaw: unknown;
  canonicalCategory?: unknown;
  canonicalPriceCents?: unknown;
  canonicalPhotos?: unknown;
}) {
  const category = resolveCanonicalListingCategory(input.listingDataRaw, input.canonicalCategory);
  const priceOk = hasValidListingPrice(input.listingDataRaw, input.canonicalPriceCents);
  const photosOk = hasMinimumListingPhotos(input.listingDataRaw, input.canonicalPhotos);
  return Boolean(category && priceOk && photosOk);
}

async function deactivateActiveListingsViolatingPublishGate(accountId?: string): Promise<number> {
  const whereClause = accountId
    ? and(eq(vendorListings.status, "active"), eq(vendorListings.accountId, accountId))
    : eq(vendorListings.status, "active");

  const activeListings = await db
    .select({
      id: vendorListings.id,
      category: vendorListings.category,
      priceCents: vendorListings.priceCents,
      photos: vendorListings.photos,
      listingData: vendorListings.listingData,
    })
    .from(vendorListings)
    .where(whereClause);

  const invalidPriceIds = activeListings
    .filter((listing) => !hasValidListingPrice(listing.listingData, listing.priceCents))
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
    console.log(
      "[listing publish gate] moved active listings to inactive:",
      invalidIds.length,
      `| invalid price: ${invalidPriceIds.length} | insufficient photos: ${invalidPhotoIds.length} | missing category: ${invalidCategoryIds.length}`
    );
  }

  return invalidIds.length;
}

type BookingChatContext = {
  bookingId: string;
  eventId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  vendorAccountId: string | null;
  vendorName: string | null;
  vendorEmail: string | null;
  eventDate: string | null;
  eventTitle: string | null;
  paymentMethodId: string | null;
  status: string | null;
  paymentStatus: string | null;
  createdAt: string | Date | null;
};

function hasPaymentAccessForChat(paymentStatus: string | null | undefined) {
  return isPaymentCollectedStatus(paymentStatus);
}

function normalizeBookingChatContext(row: any): BookingChatContext {
  return {
    bookingId: String(row?.bookingId || row?.id || "").trim(),
    eventId: row?.eventId ? String(row.eventId) : null,
    customerId: row?.customerId ? String(row.customerId) : null,
    customerName: row?.customerName ? String(row.customerName) : null,
    customerEmail: row?.customerEmail ? String(row.customerEmail) : null,
    vendorAccountId: row?.vendorAccountId ? String(row.vendorAccountId) : null,
    vendorName: row?.vendorName ? String(row.vendorName) : null,
    vendorEmail: row?.vendorEmail ? String(row.vendorEmail) : null,
    eventDate: row?.eventDate ? String(row.eventDate) : null,
    eventTitle: row?.eventTitle ? String(row.eventTitle) : null,
    paymentMethodId: row?.paymentMethodId ? String(row.paymentMethodId) : null,
    status: row?.status ? String(row.status) : null,
    paymentStatus: row?.paymentStatus ? String(row.paymentStatus) : null,
    createdAt: row?.createdAt ?? null,
  };
}

function toConversationPayload(
  role: "customer" | "vendor",
  row: BookingChatContext,
  unreadCount: number
) {
  const retention = row.eventDate ? computeChatRetentionExpiry(row.eventDate) : null;
  const normalizedUnread = Math.max(0, Number(unreadCount || 0));
  return {
    bookingId: row.bookingId,
    eventId: row.eventId,
    counterpartName:
      role === "customer"
        ? row.vendorName || "Vendor"
        : row.customerName || "Customer",
    eventDate: row.eventDate,
    eventTitle: row.eventTitle || null,
    status: row.status,
    paymentStatus: row.paymentStatus,
    paymentInfoCollected: hasPaymentAccessForChat(row.paymentStatus),
    retentionExpiresAt: retention ? retention.toISOString() : null,
    expired: row.eventDate ? isChatExpiredForEventDate(row.eventDate) : false,
    unreadCount: normalizedUnread,
    hasUnread: normalizedUnread > 0,
  };
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

async function recomputeBookingPaymentStatusInTx(tx: any, bookingId: string) {
  const scheduleRows = await tx
    .select({
      status: paymentSchedules.status,
      paymentType: paymentSchedules.paymentType,
      paidAt: paymentSchedules.paidAt,
    })
    .from(paymentSchedules)
    .where(eq(paymentSchedules.bookingId, bookingId));

  const nextPaymentStatus = deriveBookingPaymentStatusFromScheduleStatuses(
    scheduleRows.map((row: { status?: string | null }) => row.status)
  );
  const depositPaidAt =
    scheduleRows.find(
      (row: { paymentType?: string | null; status?: string | null; paidAt?: Date | null }) =>
        normalizePaymentStateValue(row.paymentType) === "deposit" &&
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
  refundedAmount: number | null;
  refundAmount: number | null;
  vendorNetPayoutAmount: number | null;
  vendorPayout: number | null;
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
      p.refunded_amount as "refundedAmount",
      p.refund_amount as "refundAmount",
      p.vendor_net_payout_amount as "vendorNetPayoutAmount",
      p.vendor_payout as "vendorPayout",
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
      refundedAmount:
        parseIntegerValue(paymentContext.refundedAmount) ??
        parseIntegerValue(paymentContext.refundAmount) ??
        0,
      vendorNetPayoutAmount:
        parseIntegerValue(paymentContext.vendorNetPayoutAmount) ??
        parseIntegerValue(paymentContext.vendorPayout) ??
        0,
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
          refundedAmount: parseIntegerValue(locked.refundedAmount) ?? parseIntegerValue(locked.refundAmount) ?? 0,
          vendorNetPayoutAmount:
            parseIntegerValue(locked.vendorNetPayoutAmount) ?? parseIntegerValue(locked.vendorPayout) ?? 0,
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
  if (autoPayoutTickInFlight) return;
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
  } catch (error) {
    console.error("auto payout tick failed:", error);
  } finally {
    autoPayoutTickInFlight = false;
  }
}

function startAutoPayoutWorker() {
  if (autoPayoutWorkerStarted) return;
  autoPayoutWorkerStarted = true;

  // Kick once on start so recently elapsed windows release without waiting for first interval.
  void runAutoPayoutTick();
  setInterval(() => {
    void runAutoPayoutTick();
  }, AUTO_PAYOUT_INTERVAL_MS);
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
        from payment_schedules ps
        where ps.booking_id = b.id
          and ps.status in ('paid', 'succeeded')
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
    .update(paymentSchedules)
    .set({ status: "failed" })
    .where(and(inArray(paymentSchedules.bookingId, bookingIds), eq(paymentSchedules.status, "pending")));

  await db
    .update(payments)
    .set({ status: "failed" })
    .where(and(inArray(payments.bookingId, bookingIds), eq(payments.status, "pending")));

  return bookingIds.length;
}

async function ensurePaymentRecordForIntentInTx(
  tx: any,
  params: {
    paymentIntentId: string;
    fallbackBookingId?: string | null;
    fallbackScheduleId?: string | null;
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
      scheduleId: payments.scheduleId,
      paymentType: payments.paymentType,
      status: payments.status,
      amount: payments.amount,
      totalAmount: payments.totalAmount,
      platformFee: payments.platformFee,
      platformFeeAmount: payments.platformFeeAmount,
      vendorPayout: payments.vendorPayout,
      vendorGrossAmount: payments.vendorGrossAmount,
      vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
      stripeProcessingFeeEstimate: payments.stripeProcessingFeeEstimate,
      actualStripeFeeAmount: payments.actualStripeFeeAmount,
      refundedAmount: payments.refundedAmount,
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

  let scheduleRow: {
    id: string;
    amount: number;
    paymentType: "deposit" | "final" | "installment";
  } | null = null;
  const scheduleId = asTrimmedString(params.fallbackScheduleId);
  if (scheduleId) {
    const [specificSchedule] = await tx
      .select({
        id: paymentSchedules.id,
        amount: paymentSchedules.amount,
        paymentType: paymentSchedules.paymentType,
      })
      .from(paymentSchedules)
      .where(and(eq(paymentSchedules.id, scheduleId), eq(paymentSchedules.bookingId, bookingId)))
      .limit(1);
    if (specificSchedule?.id) {
      scheduleRow = specificSchedule;
    }
  }

  if (!scheduleRow) {
    const fallbackType = normalizePaymentStateValue(params.fallbackPaymentType) || "deposit";
    const [typedSchedule] = await tx
      .select({
        id: paymentSchedules.id,
        amount: paymentSchedules.amount,
        paymentType: paymentSchedules.paymentType,
      })
      .from(paymentSchedules)
      .where(and(eq(paymentSchedules.bookingId, bookingId), eq(paymentSchedules.paymentType, fallbackType as any)))
      .limit(1);
    if (typedSchedule?.id) {
      scheduleRow = typedSchedule;
    }
  }

  const amount =
    (scheduleRow?.amount ?? parseIntegerValue(params.fallbackAmount)) && Number.isFinite(Number(scheduleRow?.amount ?? params.fallbackAmount))
      ? Math.max(0, Number(scheduleRow?.amount ?? params.fallbackAmount))
      : 0;
  if (!amount) return null;

  const totalAmount =
    parseIntegerValue(params.fallbackTotalAmount) ??
    parseIntegerValue(bookingRow.totalAmount) ??
    amount;
  const platformFeeAmount =
    parseIntegerValue(params.fallbackPlatformFeeAmount) ??
    parseIntegerValue(bookingRow.platformFee) ??
    Math.round(amount * VENDOR_FEE_RATE);
  const vendorGrossAmount =
    parseIntegerValue(params.fallbackVendorGrossAmount) ??
    parseIntegerValue(bookingRow.subtotalAmountCents) ??
    Math.max(0, totalAmount - Math.max(0, parseIntegerValue(bookingRow.platformFee) ?? 0));
  const vendorNetPayoutAmount =
    parseIntegerValue(params.fallbackVendorNetPayoutAmount) ??
    parseIntegerValue(bookingRow.vendorPayout) ??
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
      scheduleId: scheduleRow?.id ?? null,
      customerId: bookingRow.customerId,
      vendorAccountId: bookingRow.vendorAccountId,
      stripePaymentIntentId: paymentIntentId,
      amount,
      totalAmount,
      platformFee: platformFeeAmount,
      platformFeeAmount,
      vendorGrossAmount,
      vendorPayout: vendorNetPayoutAmount,
      vendorNetPayoutAmount,
      stripeProcessingFeeEstimate,
      stripeConnectedAccountId: connectedAccountId,
      payoutStatus: "not_ready",
      payoutEligibleAt,
      paymentType: (scheduleRow?.paymentType ??
        (normalizePaymentStateValue(params.fallbackPaymentType) || "deposit")) as "deposit" | "final" | "installment",
      status: "pending",
    })
    .returning({
      id: payments.id,
      bookingId: payments.bookingId,
      scheduleId: payments.scheduleId,
      paymentType: payments.paymentType,
      status: payments.status,
      amount: payments.amount,
      totalAmount: payments.totalAmount,
      platformFee: payments.platformFee,
      platformFeeAmount: payments.platformFeeAmount,
      vendorPayout: payments.vendorPayout,
      vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
      vendorGrossAmount: payments.vendorGrossAmount,
      refundedAmount: payments.refundedAmount,
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

async function initializeBookingPaymentIntentForSchedule(input: {
  bookingId: string;
  scheduleId: string;
  customerId: string;
}) {
  const bookingId = asTrimmedString(input.bookingId);
  const scheduleId = asTrimmedString(input.scheduleId);
  const customerId = asTrimmedString(input.customerId);
  if (!bookingId || !scheduleId || !customerId) {
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
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    throw new Error("Booking not found");
  }
  if (!booking.customerId || booking.customerId !== customerId) {
    throw new Error("You do not have access to this booking");
  }
  if (!booking.vendorAccountId) {
    throw new Error("Booking is missing vendor account");
  }
  const bookingStatus = normalizePaymentStateValue(booking.status);
  if (bookingStatus === "cancelled" || bookingStatus === "expired" || bookingStatus === "failed") {
    throw new Error("This booking is no longer payable");
  }

  const [schedule] = await db
    .select({
      id: paymentSchedules.id,
      bookingId: paymentSchedules.bookingId,
      amount: paymentSchedules.amount,
      paymentType: paymentSchedules.paymentType,
      status: paymentSchedules.status,
      stripePaymentIntentId: paymentSchedules.stripePaymentIntentId,
    })
    .from(paymentSchedules)
    .where(
      and(
        eq(paymentSchedules.id, scheduleId),
        eq(paymentSchedules.bookingId, bookingId)
      )
    )
    .limit(1);

  if (!schedule) {
    throw new Error("Payment schedule not found");
  }
  if (isPaymentSucceededStatus(schedule.status)) {
    throw new Error("This payment has already been completed");
  }
  if (schedule.status === "refunded") {
    throw new Error("This payment has already been refunded");
  }
  if (schedule.status === "disputed") {
    throw new Error("This payment is currently disputed");
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

  const { stripe, createBookingPaymentIntent } = await import("./stripe");
  if (schedule.stripePaymentIntentId) {
    const existingIntent = await stripe.paymentIntents.retrieve(schedule.stripePaymentIntentId);
    if (existingIntent.status === "succeeded") {
      throw new Error("This payment has already been completed");
    }
    if (existingIntent.client_secret && existingIntent.status !== "canceled") {
      return {
        booking,
        schedule,
        clientSecret: existingIntent.client_secret,
        paymentIntentId: existingIntent.id,
      };
    }
  }

  const totalAmountCents = parseIntegerValue(booking.totalAmount) ?? schedule.amount;
  const platformFeeAmount = parseIntegerValue(booking.platformFee) ?? Math.round(schedule.amount * VENDOR_FEE_RATE);
  const vendorGrossAmount =
    parseIntegerValue(booking.subtotalAmountCents) ?? Math.max(0, totalAmountCents - Math.max(0, parseIntegerValue(booking.platformFee) ?? 0));
  const vendorNetPayoutAmount =
    parseIntegerValue(booking.vendorPayout) ?? Math.max(0, totalAmountCents - platformFeeAmount);
  const stripeProcessingFeeEstimate = estimateStripeProcessingFeeCents(totalAmountCents);

  const paymentIntent = await createBookingPaymentIntent({
    amount: schedule.amount,
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
    description: `Booking ${booking.id} - ${schedule.paymentType}`,
    bookingId: booking.id,
    scheduleId: schedule.id,
    paymentType: schedule.paymentType,
    idempotencyKey: `booking-payment:${booking.id}:${schedule.id}`,
  });

  await db.transaction(async (tx) => {
    const lockedRows: any = await tx.execute(drizzleSql`
      select id, status, stripe_payment_intent_id as "stripePaymentIntentId"
      from payment_schedules
      where id = ${schedule.id}
        and booking_id = ${booking.id}
      for update
    `);
    const lockedSchedule = extractRows<{ id?: string; status?: string; stripePaymentIntentId?: string | null }>(lockedRows)[0];
    if (!lockedSchedule?.id) {
      throw new Error("Payment schedule not found");
    }
    if (isPaymentSucceededStatus(lockedSchedule.status)) {
      throw new Error("This payment has already been completed");
    }
    if (lockedSchedule.status === "refunded") {
      throw new Error("This payment has already been refunded");
    }
    if (lockedSchedule.status === "disputed") {
      throw new Error("This payment is currently disputed");
    }

      await tx
        .update(paymentSchedules)
        .set({
          stripePaymentIntentId: paymentIntent.id,
        })
      .where(eq(paymentSchedules.id, schedule.id));

    const existingPayments = await tx
      .select({
        id: payments.id,
      })
      .from(payments)
      .where(eq(payments.scheduleId, schedule.id))
      .limit(1);

    if (existingPayments.length > 0) {
      await tx
        .update(payments)
        .set({
          stripePaymentIntentId: paymentIntent.id,
          status: "pending",
          stripeConnectedAccountId: vendorAccount.stripeConnectId,
          totalAmount: totalAmountCents,
          platformFeeAmount,
          vendorGrossAmount,
          vendorNetPayoutAmount,
          stripeProcessingFeeEstimate,
        })
        .where(eq(payments.id, existingPayments[0]!.id));
    } else {
      await tx.insert(payments).values({
        bookingId: booking.id,
        scheduleId: schedule.id,
        customerId: booking.customerId,
        vendorAccountId: booking.vendorAccountId,
        stripePaymentIntentId: paymentIntent.id,
        amount: schedule.amount,
        totalAmount: totalAmountCents,
        platformFee: platformFeeAmount,
        platformFeeAmount,
        vendorGrossAmount,
        vendorPayout: vendorNetPayoutAmount,
        vendorNetPayoutAmount,
        stripeProcessingFeeEstimate,
        stripeConnectedAccountId: vendorAccount.stripeConnectId,
        paymentType: schedule.paymentType,
        status: "pending",
        payoutStatus: "not_ready",
        payoutEligibleAt:
          booking.bookingEndAt instanceof Date
            ? new Date(booking.bookingEndAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000)
            : null,
      });
    }
  });

  return {
    booking,
    schedule,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
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
      coalesce(b.event_date, e.date) as "eventDate",
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
      coalesce(b.event_date, e.date) as "eventDate",
      e.path as "eventTitle",
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
      coalesce(b.event_date, e.date) as "eventDate",
      e.path as "eventTitle",
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
      coalesce(b.event_date, e.date) as "eventDate"
    from bookings b
    left join events e on e.id = b.event_id
    where coalesce(b.event_date, e.date) is not null
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

function extractListingBasePriceCents(
  listingData: any,
  canonicalListingPriceCents?: unknown
): number | null {
  const canonicalPrice = parseIntegerValue(canonicalListingPriceCents);
  if (canonicalPrice != null && canonicalPrice > 0) {
    return canonicalPrice;
  }

  if (!listingData || typeof listingData !== "object") return null;
  // Legacy compatibility: allow direct mirrored draft keys while canonical price_cents is rolling out.
  const explicitPriceCents = parseIntegerValue(listingData?.priceCents);
  if (explicitPriceCents != null && explicitPriceCents > 0) {
    return explicitPriceCents;
  }

  const candidates = [listingData?.price, listingData?.rate];

  const dollars = candidates
    .map((v) => toOptionalNumber(v))
    .find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!dollars || dollars <= 0) return null;

  return Math.max(1, Math.round(dollars * 100));
}

function getListingPricingUnit(listingData: any, canonicalPricingUnit?: unknown): "per_day" | "per_hour" {
  const canonicalUnit = asTrimmedString(canonicalPricingUnit).toLowerCase();
  if (canonicalUnit === "per_hour" || canonicalUnit === "per_day") {
    return canonicalUnit;
  }

  // Legacy compatibility: read only the direct mirrored key (not nested alias trees).
  const unit = asTrimmedString(listingData?.pricingUnit).toLowerCase();
  return unit === "per_hour" ? "per_hour" : "per_day";
}

function getListingMinimumHours(listingData: any, canonicalMinimumHours?: unknown): number | null {
  const canonicalHours = parseIntegerValue(canonicalMinimumHours);
  if (canonicalHours != null && canonicalHours > 0) {
    return canonicalHours;
  }

  if (!listingData || typeof listingData !== "object") return null;

  const candidates = [listingData?.minimumHours];

  const hours = candidates
    .map((value) => toOptionalNumber(value))
    .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0);

  return hours != null ? Math.max(1, Math.round(hours)) : null;
}

function getListingAvailableQuantity(listingData: any, canonicalQuantity?: unknown): number {
  const quantityFromCanonicalColumn = parseIntegerValue(canonicalQuantity);
  if (quantityFromCanonicalColumn != null && quantityFromCanonicalColumn > 0) {
    return Math.max(1, Math.floor(quantityFromCanonicalColumn));
  }

  if (!listingData || typeof listingData !== "object") return 1;

  const quantityCandidates = [listingData?.quantity];

  const quantity =
    quantityCandidates
      .map((value) => parseIntegerValue(value))
      .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ?? 1;

  return Math.max(1, Math.floor(quantity));
}

function mirrorListingQuantityIntoListingData(input: {
  listingDataRaw: unknown;
  canonical: {
    category?: ListingCategoryValue | null;
    quantity?: unknown;
    instantBookEnabled?: unknown;
    pricingUnit?: unknown;
    priceCents?: unknown;
    minimumHours?: unknown;
    serviceAreaMode?: unknown;
    serviceRadiusMiles?: unknown;
    listingServiceCenterLabel?: unknown;
    listingServiceCenterLat?: unknown;
    listingServiceCenterLng?: unknown;
    pickupOffered?: unknown;
    deliveryOffered?: unknown;
    deliveryFeeEnabled?: unknown;
    deliveryFeeAmountCents?: unknown;
    setupOffered?: unknown;
    setupFeeEnabled?: unknown;
    setupFeeAmountCents?: unknown;
    takedownOffered?: unknown;
    takedownFeeEnabled?: unknown;
    takedownFeeAmountCents?: unknown;
    travelOffered?: unknown;
    travelFeeEnabled?: unknown;
    travelFeeType?: unknown;
    travelFeeAmountCents?: unknown;
  };
}): Record<string, any> {
  const listingData =
    input.listingDataRaw && typeof input.listingDataRaw === "object" && !Array.isArray(input.listingDataRaw)
      ? ({ ...(input.listingDataRaw as Record<string, any>) } as Record<string, any>)
      : {};

  const canonical = input.canonical ?? {};
  const parsedQuantity = parseIntegerValue(canonical.quantity);
  const normalizedQuantity = parsedQuantity != null && parsedQuantity > 0 ? Math.max(1, parsedQuantity) : 1;
  const category = canonical.category ?? null;

  if (category) {
    listingData.category = category;
  }
  if (typeof canonical.instantBookEnabled === "boolean") {
    listingData.instantBookEnabled = canonical.instantBookEnabled;
  }
  if (typeof canonical.pricingUnit === "string" && canonical.pricingUnit.trim()) {
    listingData.pricingUnit = canonical.pricingUnit.trim();
  }
  const mirroredPriceCents = parseIntegerValue(canonical.priceCents);
  if (mirroredPriceCents != null && mirroredPriceCents >= 0) {
    listingData.priceCents = mirroredPriceCents;
  }
  const mirroredMinimumHours = parseIntegerValue(canonical.minimumHours);
  listingData.minimumHours = mirroredMinimumHours != null && mirroredMinimumHours > 0 ? mirroredMinimumHours : null;

  if (typeof canonical.serviceAreaMode === "string" && canonical.serviceAreaMode.trim()) {
    listingData.serviceAreaMode = canonical.serviceAreaMode.trim();
  }
  const mirroredServiceRadius = parseIntegerValue(canonical.serviceRadiusMiles);
  listingData.serviceRadiusMiles = mirroredServiceRadius != null && mirroredServiceRadius > 0 ? mirroredServiceRadius : null;

  const mirroredCenterLabel = asTrimmedString(canonical.listingServiceCenterLabel);
  listingData.listingServiceCenterLabel = mirroredCenterLabel || null;
  const mirroredCenterLat = parseLatLngValue(canonical.listingServiceCenterLat);
  const mirroredCenterLng = parseLatLngValue(canonical.listingServiceCenterLng);
  listingData.listingServiceCenterLat = mirroredCenterLat;
  listingData.listingServiceCenterLng = mirroredCenterLng;

  if (mirroredCenterLat != null && mirroredCenterLng != null) {
    listingData.serviceCenter = {
      lat: mirroredCenterLat,
      lng: mirroredCenterLng,
    };
  }

  const pickupOffered = parseBooleanInput(canonical.pickupOffered);
  if (pickupOffered != null) {
    listingData.pickupOffered = pickupOffered;
  }

  const deliveryOffered = parseBooleanInput(canonical.deliveryOffered);
  const deliveryFeeEnabled = parseBooleanInput(canonical.deliveryFeeEnabled);
  const deliveryFeeAmountCents = parseIntegerValue(canonical.deliveryFeeAmountCents);
  if (deliveryOffered != null) {
    listingData.deliveryOffered = deliveryOffered;
  }
  if (deliveryFeeEnabled != null) {
    listingData.deliveryFeeEnabled = deliveryFeeEnabled;
  }
  listingData.deliveryFeeAmountCents =
    deliveryFeeEnabled && deliveryFeeAmountCents != null && deliveryFeeAmountCents > 0 ? deliveryFeeAmountCents : null;

  const setupOffered = parseBooleanInput(canonical.setupOffered);
  const setupFeeEnabled = parseBooleanInput(canonical.setupFeeEnabled);
  const setupFeeAmountCents = parseIntegerValue(canonical.setupFeeAmountCents);
  if (setupOffered != null) {
    listingData.setupOffered = setupOffered;
  }
  if (setupFeeEnabled != null) {
    listingData.setupFeeEnabled = setupFeeEnabled;
  }
  listingData.setupFeeAmountCents =
    setupFeeEnabled && setupFeeAmountCents != null && setupFeeAmountCents > 0 ? setupFeeAmountCents : null;

  const travelOffered = parseBooleanInput(canonical.travelOffered);
  const travelFeeEnabled = parseBooleanInput(canonical.travelFeeEnabled);
  const travelFeeType = asTrimmedString(canonical.travelFeeType).toLowerCase();
  const travelFeeAmountCents = parseIntegerValue(canonical.travelFeeAmountCents);
  if (travelOffered != null) {
    listingData.travelOffered = travelOffered;
  }
  if (travelFeeEnabled != null) {
    listingData.travelFeeEnabled = travelFeeEnabled;
  }
  listingData.travelFeeType =
    travelFeeEnabled && (travelFeeType === "flat" || travelFeeType === "per_mile" || travelFeeType === "per_hour")
      ? travelFeeType
      : null;
  listingData.travelFeeAmountCents =
    travelFeeEnabled && travelFeeAmountCents != null && travelFeeAmountCents > 0 ? travelFeeAmountCents : null;

  if (category === "Rentals") {
    listingData.quantity = normalizedQuantity;
  } else {
    listingData.quantity = null;
  }

  return listingData;
}

function getListingLogisticsFeeSummaryCents(input: {
  listingData: any;
  canonical?: {
    pickupOffered?: unknown;
    deliveryOffered?: unknown;
    deliveryFeeEnabled?: unknown;
    deliveryFeeAmountCents?: unknown;
    setupOffered?: unknown;
    setupFeeEnabled?: unknown;
    setupFeeAmountCents?: unknown;
    takedownOffered?: unknown;
    takedownFeeEnabled?: unknown;
    takedownFeeAmountCents?: unknown;
    travelOffered?: unknown;
    travelFeeEnabled?: unknown;
    travelFeeType?: unknown;
    travelFeeAmountCents?: unknown;
  };
}) {
  const listingData =
    input.listingData && typeof input.listingData === "object" && !Array.isArray(input.listingData)
      ? input.listingData
      : {};
  const canonical = input.canonical ?? {};

  const deliveryIncluded =
    parseBooleanInput(canonical.deliveryOffered) ??
    parseBooleanInput(listingData?.deliveryIncluded) ??
    parseBooleanInput(listingData?.deliveryOffered) ??
    false;
  const deliveryFeeAmountFromCanonical = parseIntegerValue(canonical.deliveryFeeAmountCents);
  const deliveryFeeEnabled =
    parseBooleanInput(canonical.deliveryFeeEnabled) ??
    parseBooleanInput(listingData?.deliveryFeeEnabled) ??
    false;
  const deliveryFeeCents =
    deliveryIncluded && deliveryFeeEnabled
      ? deliveryFeeAmountFromCanonical ??
        parseIntegerValue(listingData?.deliveryFeeAmountCents) ??
        parseMoneyToCents(listingData?.deliveryFeeAmount) ??
        0
      : 0;

  const setupIncluded =
    parseBooleanInput(canonical.setupOffered) ??
    parseBooleanInput(listingData?.setupIncluded) ??
    parseBooleanInput(listingData?.setupOffered) ??
    false;
  const setupFeeAmountFromCanonical = parseIntegerValue(canonical.setupFeeAmountCents);
  const setupFeeEnabled =
    parseBooleanInput(canonical.setupFeeEnabled) ??
    parseBooleanInput(listingData?.setupFeeEnabled) ??
    false;
  const setupFeeCents =
    setupIncluded && setupFeeEnabled
      ? setupFeeAmountFromCanonical ??
        parseIntegerValue(listingData?.setupFeeAmountCents) ??
        parseMoneyToCents(listingData?.setupFeeAmount) ??
        0
      : 0;

  const takedownIncluded =
    parseBooleanInput(canonical.takedownOffered) ??
    parseBooleanInput(listingData?.takedownIncluded) ??
    parseBooleanInput(listingData?.takedownOffered) ??
    false;
  const takedownFeeAmountFromCanonical = parseIntegerValue(canonical.takedownFeeAmountCents);
  const takedownFeeEnabled =
    parseBooleanInput(canonical.takedownFeeEnabled) ??
    parseBooleanInput(listingData?.takedownFeeEnabled) ??
    false;
  const takedownFeeCents =
    takedownIncluded && takedownFeeEnabled
      ? takedownFeeAmountFromCanonical ??
        parseIntegerValue(listingData?.takedownFeeAmountCents) ??
        parseMoneyToCents(listingData?.takedownFeeAmount) ??
        0
      : 0;

  const travelOffered =
    parseBooleanInput(canonical.travelOffered) ??
    parseBooleanInput(listingData?.travelOffered) ??
    false;
  const travelFeeEnabled =
    parseBooleanInput(canonical.travelFeeEnabled) ??
    parseBooleanInput(listingData?.travelFeeEnabled) ??
    false;
  const travelFeeType = asTrimmedString(canonical.travelFeeType ?? listingData?.travelFeeType).toLowerCase();
  const travelFeeAmountFromCanonical = parseIntegerValue(canonical.travelFeeAmountCents);
  const travelFeeCents =
    travelOffered && travelFeeEnabled && (!travelFeeType || travelFeeType === "flat")
      ? travelFeeAmountFromCanonical ??
        parseIntegerValue(listingData?.travelFeeAmountCents) ??
        parseMoneyToCents(listingData?.travelFeeAmount) ??
        0
      : 0;
  const variableTravelFeePending =
    travelOffered &&
    travelFeeEnabled &&
    (travelFeeType === "per_mile" || travelFeeType === "per_hour");

  return {
    deliveryFeeCents: Math.max(0, deliveryFeeCents),
    setupFeeCents: Math.max(0, setupFeeCents),
    takedownFeeCents: Math.max(0, takedownFeeCents),
    travelFlatFeeCents: Math.max(0, travelFeeCents),
    variableTravelFeePending,
  };
}

function computeCanonicalBookingTimeRange(input: {
  listingData: any;
  listingPricingUnit?: unknown;
  listingMinimumHours?: unknown;
  vendorTimeZone?: unknown;
  eventDate: string;
  eventStartTime?: string | null;
  eventEndDate?: string | null;
  eventEndTime?: string | null;
  itemNeededByTime?: string | null;
  itemDoneByTime?: string | null;
}) {
  const pricingUnit = getListingPricingUnit(input.listingData, input.listingPricingUnit);
  const minimumHours = getListingMinimumHours(input.listingData, input.listingMinimumHours);
  const vendorTimeZone = normalizeIanaTimeZone(input.vendorTimeZone);
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

    const bookingStartAt = zonedDateTimeToUtc(eventDate, startMinutes, vendorTimeZone);
    const bookingEndAt = zonedDateTimeToUtc(eventDate, endMinutes, vendorTimeZone);
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
      bookingStartAt,
      bookingEndAt,
    };
  }

  const itemNeededByTime = asTrimmedString(input.itemNeededByTime);
  const itemDoneByTime = asTrimmedString(input.itemDoneByTime);
  const hasEventTimeRange = Boolean(eventStartTime && eventEndTime);
  const hasLogisticsRange = Boolean(itemNeededByTime && itemDoneByTime);

  if ((eventStartTime && !eventEndTime) || (!eventStartTime && eventEndTime)) {
    throw new Error("Per-day bookings require both event start and end times");
  }

  if ((itemNeededByTime && !itemDoneByTime) || (!itemNeededByTime && itemDoneByTime)) {
    throw new Error("Per-day logistics require both the needed-by time and done-with time");
  }

  if (hasEventTimeRange) {
    const eventStartMinutes = parseTimeValueToMinutes(eventStartTime);
    const eventEndMinutes = parseTimeValueToMinutes(eventEndTime);
    if (eventStartMinutes == null || eventEndMinutes == null) {
      throw new Error("Per-day event start/end times are invalid");
    }
    if (eventEndMinutes <= eventStartMinutes) {
      throw new Error("Per-day event end time must be after the event start time");
    }
    if (endDate !== eventDate) {
      throw new Error("Per-day bookings must start and end on the same day");
    }
  } else if (itemNeededByTime || itemDoneByTime) {
    throw new Error("Per-day bookings require event start and end times");
  }

  if (hasLogisticsRange) {
    const startMinutes = parseTimeValueToMinutes(itemNeededByTime);
    const endMinutes = parseTimeValueToMinutes(itemDoneByTime);
    if (startMinutes == null || endMinutes == null) {
      throw new Error("Per-day logistics time range is invalid");
    }
    if (endMinutes <= startMinutes) {
      throw new Error("Done-with time must be after the needed-by time");
    }

    const bookingStartAt = zonedDateTimeToUtc(eventDate, startMinutes, vendorTimeZone);
    const bookingEndAt = zonedDateTimeToUtc(eventDate, endMinutes, vendorTimeZone);
    if (!(bookingStartAt instanceof Date) || Number.isNaN(bookingStartAt.getTime())) {
      throw new Error("Needed-by time is invalid");
    }
    if (!(bookingEndAt instanceof Date) || Number.isNaN(bookingEndAt.getTime())) {
      throw new Error("Done-with time is invalid");
    }

    return {
      pricingUnit,
      minimumHours,
      vendorTimeZone,
      bookingStartAt,
      bookingEndAt,
    };
  }

  if (hasEventTimeRange) {
    const startMinutes = parseTimeValueToMinutes(eventStartTime);
    const endMinutes = parseTimeValueToMinutes(eventEndTime);
    if (startMinutes == null || endMinutes == null) {
      throw new Error("Per-day event start/end times are invalid");
    }
    const bookingStartAt = zonedDateTimeToUtc(eventDate, startMinutes, vendorTimeZone);
    const bookingEndAt = zonedDateTimeToUtc(eventDate, endMinutes, vendorTimeZone);
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
      bookingStartAt,
      bookingEndAt,
    };
  }

  const bookingStartAt = zonedDateStartToUtc(eventDate, vendorTimeZone);
  const requestedEndDate = endDate;
  if (!parseIsoDateValue(requestedEndDate)) {
    throw new Error("Booking end date is invalid");
  }
  const bookingEndDateExclusive = addDaysToIsoDate(requestedEndDate, 1);
  const bookingEndAt = bookingEndDateExclusive
    ? zonedDateStartToUtc(bookingEndDateExclusive, vendorTimeZone)
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
  event: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>[number];
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
      and (${params.excludeBookingId ?? null} is null or b.id <> ${params.excludeBookingId ?? null})
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
  event: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>>[number],
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

    const events = await listSelectedGoogleCalendarEventsForVendorAccount(params.vendorAccountId, {
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
      and b.status in ('pending', 'confirmed', 'completed')
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
  const activeBookingRows = bookingRows.filter((row: any) => asTrimmedString(row?.status).toLowerCase() !== "cancelled");
  let googleCalendarReadStatus: "checked" | "skipped" | "failed" = googleEnabled ? "checked" : "skipped";
  let googleCalendarReadError: string | null = null;
  let existingGoogleEventIds = new Set<string>();
  let selectedGoogleCalendarEvents: Awaited<ReturnType<typeof listSelectedGoogleCalendarEventsForVendorAccount>> = [];
  let unmatchedEventsCount: number | null = googleEnabled ? 0 : null;

  if (googleEnabled) {
    try {
      const events = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
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
    if (status === "cancelled") return [];

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

function formatVendorTypeForDraftTitle(vendorType: string): string {
  if (vendorType === "prop-decor") return "rental";
  return vendorType.replace(/-/g, " ");
}

function requireCustomerAnyAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const jwtPayload = verifyToken(token);
  if (jwtPayload && (jwtPayload.type === "customer" || jwtPayload.type === "admin")) {
    req.customerAuth = {
      id: jwtPayload.id,
      email: jwtPayload.email,
      type: jwtPayload.type,
    };
    return next();
  }

  // Fallback to Auth0 bearer tokens.
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
}) {
  const currentEmail = params.currentEmail.trim().toLowerCase();
  const nextEmail = normalizeIdentityEmailCandidate(params.nextEmail);
  if (!nextEmail || nextEmail === currentEmail) return currentEmail;

  const canRepair = isSyntheticAuth0LocalEmail(currentEmail) || !currentEmail;
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
    const hashed = await hashPassword(crypto.randomUUID());

    [userRow] = await db
      .insert(users)
      .values({
        name: generatedName,
        displayName: generatedName,
        email,
        password: hashed,
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

  const filename = `${Date.now()}-${crypto.randomUUID()}.${format}`;
  const destination = path.join(dir, filename);
  await fs.promises.writeFile(destination, buffer);
  return { filename, format };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // --- Listing photo uploads (local disk) ---
  const listingUploadsDir = path.join(process.cwd(), "server/uploads/listings");
  if (!fs.existsSync(listingUploadsDir)) fs.mkdirSync(listingUploadsDir, { recursive: true });
  const vendorShopUploadsDir = path.join(process.cwd(), "server/uploads/vendor-shops");
  if (!fs.existsSync(vendorShopUploadsDir)) fs.mkdirSync(vendorShopUploadsDir, { recursive: true });

  await assertCanonicalBookingSchemaReady();

  // One-time startup reconciliation so legacy active listings that fail publish rules
  // (missing price and/or insufficient photos) are immediately hidden after deploy.
  try {
    await deactivateActiveListingsViolatingPublishGate();
  } catch (error: any) {
    console.warn(
      "[listing publish gate] startup reconciliation failed:",
      error?.message || error
    );
  }

  const runPendingExpiryCleanup = async () => {
    try {
      const expiredCount = await expireStalePendingBookings();
      if (expiredCount > 0) {
        console.log(`[booking expiry] expired stale pending bookings: ${expiredCount}`);
      }
    } catch (error: any) {
      console.warn("[booking expiry] cleanup failed:", error?.message || error);
    }
  };
  void runPendingExpiryCleanup();
  const pendingExpiryTimer = setInterval(runPendingExpiryCleanup, 5 * 60 * 1000);
  pendingExpiryTimer.unref();

  if (isStreamChatConfigured()) {
    const runChatCleanup = async () => {
      try {
        await cleanupExpiredStreamChannels();
      } catch (error: any) {
        console.warn("Expired chat cleanup failed:", error?.message || error);
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
              console.warn(
                "[google verification] vendor=%s checked=%d issues=%d unmatched=%s readStatus=%s",
                summary.vendorAccountId || "unknown",
                summary.bookingsChecked,
                summary.issuesFound,
                summary.unmatchedEventsCount == null ? "n/a" : String(summary.unmatchedEventsCount),
                summary.googleCalendarReadStatus
              );
            }
          } catch (error: any) {
            console.warn(
              "[google verification] vendor=%s failed: %s",
              asTrimmedString(account.id) || "unknown",
              error?.message || error
            );
          }
        }
      } catch (error: any) {
        console.warn("[google verification] recurring run failed:", error?.message || error);
      }
    };

    const verificationTimer = setInterval(
      runRecurringGoogleVerification,
      googleVerificationIntervalMinutes * 60 * 1000
    );
    verificationTimer.unref();
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

    let persisted;
    try {
      persisted = await persistUploadedImage(fileBuffer, listingUploadsDir);
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || "Invalid upload" });
    }

    return res.json({
      url: `/uploads/listings/${persisted.filename}`,
      filename: persisted.filename,
    });
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

      let persisted;
      try {
        persisted = await persistUploadedImage(fileBuffer, vendorShopUploadsDir);
      } catch (error: any) {
        return res.status(400).json({ error: error?.message || "Invalid upload" });
      }

      return res.json({
        url: `/uploads/vendor-shops/${persisted.filename}`,
        filename: persisted.filename,
      });
    }
  );

  // Location search (used by LocationPicker autocomplete)
  app.get("/api/locations/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q || q.length < 2) return res.json([]);

      // Accept legacy/current env names so autocomplete works across environments.
      const token =
        (process.env.MAPBOX_ACCESS_TOKEN || "").trim() ||
        (process.env.MAPBOX_PLACES_TOKEN || "").trim() ||
        (process.env.MAPBOX_TOKEN || "").trim() ||
        (process.env.VITE_MAPBOX_TOKEN || "").trim();
      if (!token) {
        logRouteError(
          "/api/locations/search",
          new Error(
            "Mapbox token missing (expected MAPBOX_ACCESS_TOKEN, MAPBOX_PLACES_TOKEN, MAPBOX_TOKEN, or VITE_MAPBOX_TOKEN)"
          )
        );
        return res.status(500).json({ error: "Location search is unavailable" });
      }

      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${encodeURIComponent(q)}.json` +
        `?autocomplete=true&limit=5&access_token=${token}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Mapbox responded with status ${response.status}`);
      }
      const data = await response.json();

      const results = (data.features || []).map((f: any) => ({
        id: f.id,
        label: f.place_name,
        lat: f.center[1],
        lng: f.center[0],
      }));

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
  app.patch("/api/vendor/me", ...requireVendorAuth0, async (req, res) => {
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

      await db
        .update(vendorAccounts)
        .set({ businessName: updates.businessName.trim() })
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
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        profileComplete: context.profiles.length > 0,
        profileId: activeProfile?.id || null,
        activeProfileId: context.activeProfileId,
        profileName: activeProfileName,
        vendorType: activeProfile?.serviceType || "unspecified",
        operatingTimezone: normalizeIanaTimeZone(activeProfile?.operatingTimezone),
        googleConnectionStatus: account.googleConnectionStatus,
        googleCalendarId: account.googleCalendarId,
        hasVendorAccount,
        hasAnyVendorProfiles,
        hasActiveVendorProfile,
        needsNewVendorProfileOnboarding,
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
  app.post("/api/vendor/me/delete", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth as { id: string };

      const accountRows = await db
        .select({
          id: vendorAccounts.id,
          deletedAt: vendorAccounts.deletedAt,
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

      const now = new Date();
      const obfuscatedEmail = `deleted+${vendorAuth.id}@eventhub.deleted`;
      const randomPassword = await hashPassword(`deleted-${vendorAuth.id}-${now.getTime()}-${crypto.randomUUID()}`);

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

      await db
        .update(vendorAccounts)
        .set({
          active: false,
          deletedAt: now,
          email: obfuscatedEmail,
          auth0Sub: null,
          userId: null,
          password: randomPassword,
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
        streetAddress: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(1),
        zipCode: z.string().min(1),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
      .nullable()
      .optional(),
  });

  app.patch("/api/customer/me", requireCustomerAnyAuth, async (req, res) => {
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

  app.get("/api/google/oauth/start", async (req, res) => {
    const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    if (!clientId) {
      return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID" });
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

      state = createGoogleOauthState(vendorAccount.id);
    } catch (error: any) {
      console.error("Google OAuth start auth failed:", error?.message || error);
      return res.status(401).json({ error: "Invalid Auth0 token" });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/calendar.readonly",
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
    if (!code) {
      return res.status(400).json({ error: "Missing OAuth code" });
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "Missing Google OAuth configuration" });
    }

    const redirectUri = (
      process.env.GOOGLE_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/api/google/oauth/callback`
    ).trim();
    const appUrl = (process.env.APP_URL || "http://localhost:5173").trim().replace(/\/+$/, "");
    const parsedState = parseGoogleOauthState(state);

    if (!parsedState?.vendorAccountId) {
      return res.redirect(`${appUrl}/vendor/dashboard?google_calendar=error`);
    }

    try {
      const vendorRows = await db
        .select({
          id: vendorAccounts.id,
          googleRefreshToken: vendorAccounts.googleRefreshToken,
          googleCalendarId: vendorAccounts.googleCalendarId,
        })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, parsedState.vendorAccountId))
        .limit(1);

      const vendorAccount = vendorRows[0];
      if (!vendorAccount) {
        return res.redirect(`${appUrl}/vendor/dashboard?google_calendar=error`);
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
        console.error("Google OAuth token exchange failed:", tokenResponse.status, tokenError);
        await db
          .update(vendorAccounts)
          .set({ googleConnectionStatus: "error" })
          .where(eq(vendorAccounts.id, vendorAccount.id));
        return res.redirect(`${appUrl}/vendor/dashboard?google_calendar=error`);
      }

      const tokens = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const accessToken =
        typeof tokens.access_token === "string" ? tokens.access_token.trim() : "";
      if (!accessToken) {
        console.error("Google OAuth token exchange succeeded without an access token");
        await db
          .update(vendorAccounts)
          .set({ googleConnectionStatus: "error" })
          .where(eq(vendorAccounts.id, vendorAccount.id));
        return res.redirect(`${appUrl}/vendor/dashboard?google_calendar=error`);
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
                console.warn(
                  "[google] legacy plaintext token detected for vendor, re-encrypt on next OAuth"
                );
                return existing;
              }
            })();
      const expiresAt =
        typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in)
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null;

      await db
        .update(vendorAccounts)
        .set({
          googleAccessToken: encryptToken(accessToken),
          googleRefreshToken: refreshToken ? encryptToken(refreshToken) : null,
          googleTokenExpiresAt: expiresAt,
          googleCalendarId: vendorAccount.googleCalendarId ?? null,
          googleConnectionStatus: "connected",
        })
        .where(eq(vendorAccounts.id, vendorAccount.id));

      return res.redirect(`${appUrl}/vendor/dashboard?google_calendar=connected`);
    } catch (error: any) {
      console.error("Google OAuth callback error:", error?.message || error);
      return res.redirect(`${appUrl}/vendor/dashboard?google_calendar=error`);
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
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      logRouteError("/api/google/calendars", error);
      return res.status(500).json({ error: "Unable to load Google calendars" });
    }
  });

  app.post("/api/google/calendars/select", ...requireVendorAuth0, async (req, res) => {
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

      await db
        .update(vendorAccounts)
        .set({
          googleCalendarId: selectedCalendar.id,
        })
        .where(eq(vendorAccounts.id, account.id));

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
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message || "Invalid calendar selection" });
      }
      logRouteError("/api/google/calendars/select", error);
      return res.status(500).json({ error: "Unable to save selected Google calendar" });
    }
  });

  app.post("/api/google/calendars/create", ...requireVendorAuth0, async (req, res) => {
    try {
      const account = await getVendorAccountFromRequest(req);
      if (!account?.id) {
        return res.status(404).json({ error: "Account not found" });
      }

      const calendar = await createGoogleCalendarForVendorAccount(account.id);
      return res.json(calendar);
    } catch (error: any) {
      if (error instanceof GoogleCalendarConnectionError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      logRouteError("/api/google/calendars/create", error);
      return res.status(500).json({ error: "Unable to create Google calendar" });
    }
  });

  app.post("/api/google/calendars/sync-existing", ...requireVendorAuth0, async (req, res) => {
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
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
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

      const events = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
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

      const unmatchedEvents = events
        .filter((event) => (asTrimmedString(event.status) || "").toLowerCase() !== "cancelled")
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
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      logRouteError("/api/google/events/unmatched", error);
      return res.status(500).json({ error: "Unable to load unmatched Google events" });
    }
  });

  app.post("/api/google/events/map", ...requireVendorAuth0, async (req, res) => {
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

      const events = await listSelectedGoogleCalendarEventsForVendorAccount(account.id, {
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
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message || "Invalid Google event mapping" });
      }
      logRouteError("/api/google/events/map", error);
      return res.status(500).json({ error: "Unable to save Google event mapping" });
    }
  });

  app.delete("/api/google/events/map/:googleEventId", ...requireVendorAuth0, async (req, res) => {
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

  app.post("/api/google/bookings/reconciliation/:bookingId/repair", ...requireVendorAuth0, async (req, res) => {
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
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
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

  app.post("/api/vendor/onboarding/complete", requireAuth0, async (req, res) => {
    try {
      const customerAuth = (req as any).customerAuth;
      const vendorAuth = (req as any).vendorAuth;
      const auth0 = (req as any).auth0 as { sub: string; email?: string } | undefined;

      const onboardingData = completeOnboardingSchema.parse(req.body);
      const normalizedProfileName = normalizeProfileNameText(onboardingData.businessName, 120);
      if (normalizedProfileName.length < 2) {
        return res.status(400).json({
          error: "Business profile name is invalid. Use letters, numbers, spaces, and apostrophes only.",
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
        const [created] = await db
          .insert(vendorAccounts)
          .values({
            email,
            auth0Sub,
            userId: vendorResolution.resolvedUserId || undefined,
            password: "auth0-external",
            businessName: normalizedProfileName,
            profileComplete: false,
          })
          .returning();

        account = created;
      } else {
        const currentBusinessName = asTrimmedString(account.businessName);
        const [updated] = await db
          .update(vendorAccounts)
          .set({
            businessName: currentBusinessName || normalizedProfileName,
          })
          .where(eq(vendorAccounts.id, account.id))
          .returning();

        account = updated;
      }

      const existingProfiles = await db.select().from(vendorProfiles).where(and(eq(vendorProfiles.accountId, account.id), eq(vendorProfiles.active, true)));
      const existingActiveProfile =
        existingProfiles.find((candidate) => candidate.id === account.activeProfileId) || existingProfiles[0] || null;
      const resolvedOperatingTimezone = normalizeIanaTimeZone(
        onboardingData.operatingTimezone,
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
        const persistedProfilePhoto = await persistUploadedImage(profileBuffer, vendorShopUploadsDir);
        shopProfileImageUrl = `/uploads/vendor-shops/${persistedProfilePhoto.filename}`;
      }

      if (shopCoverPhotoDataUrl) {
        const coverBuffer = decodeImageDataUrlToBuffer(shopCoverPhotoDataUrl);
        if (!coverBuffer) {
          return res.status(400).json({ error: "Invalid cover photo format." });
        }
        const persistedCoverPhoto = await persistUploadedImage(coverBuffer, vendorShopUploadsDir);
        shopCoverImageUrl = `/uploads/vendor-shops/${persistedCoverPhoto.filename}`;
        shopCoverImagePosition = { x: 0, y: 0 };
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
        serviceType: onboardingData.vendorType,
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

      const isUpgrade = Boolean(customerAuth || vendorAuth);

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
      serviceType: z.string().min(1).optional(),
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
      console.error("GET /api/vendor/profile failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  /**
   * PATCH /api/vendor/profile ✅ Auth0-only
   * Updates the current vendor's profile
   */
  app.patch("/api/vendor/profile", ...requireVendorAuth0, async (req, res) => {
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
            details: [{ message: "profileName is invalid. Use letters, numbers, spaces, and apostrophes only." }],
          });
        }
        updates.profileName = normalized;
      }
      if (payload.serviceType !== undefined) updates.serviceType = payload.serviceType;
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

      const [updated] = await db
        .update(vendorProfiles)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(vendorProfiles.id, existing.id))
        .returning();

      return res.json({ ...updated, activeProfileId: context.activeProfileId });
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
        serviceType: profile.serviceType,
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

  app.post("/api/vendor/profiles/switch", ...requireVendorAuth0, async (req, res) => {
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
          serviceType: target.serviceType,
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

  app.post("/api/vendor/profiles/:id/deactivate", ...requireVendorAuth0, async (req, res) => {
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

  app.post("/api/vendor/profiles/:id/reactivate", ...requireVendorAuth0, async (req, res) => {
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

  // Vendor Listings Routes (already Auth0 dual middleware and working)
  app.post("/api/vendor/listings", requireDualAuthAuth0, async (req, res) => {
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

      if (!listingData || typeof listingData !== "object") {
        return res.status(400).json({ error: "listingData must be a JSON object." });
      }
      const vendorType = activeProfile.serviceType;
      const normalizedListingData = clampListingDescriptions(listingData) as Record<string, any>;
      const normalizedClassification = normalizeListingClassification(normalizedListingData, {
        allowLegacyFallback: false,
      });

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

      const safeVendorType =
        typeof vendorType === "string" && vendorType.trim() ? vendorType.trim() : "vendor";
      const defaultTitleType = formatVendorTypeForDraftTitle(safeVendorType);

      const title =
        canonicalColumns.title ||
        (typeof normalizedListingData.title === "string" && normalizedListingData.title.trim()) ||
        `New ${defaultTitleType} listing`;
      const [listing] = await db
        .insert(vendorListings)
        .values({
          accountId: vendorAuth.id,
          profileId: activeProfile.id,
          status: "draft",
          ...canonicalColumns,
          title,
          listingData: mirroredListingData,
        })
        .returning();

      return res.status(201).json(listing);
    } catch (error: any) {
      logRouteError("/api/vendor/listings", error);
      return res.status(500).json({ error: "Unable to create listing" });
    }
  });

  app.patch("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
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
          ? normalizeListingClassification(normalizedListingData, { allowLegacyFallback: false })
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
        };
        const canonicalColumns = buildCanonicalListingColumns({
          listingDataRaw: normalizedClassification.listingData,
          existingCanonical: {
            category: existingListing?.category,
            subcategory: existingListing?.subcategory,
            title: existingListing?.title,
            description: existingListing?.description,
            whatsIncluded: existingListing?.whatsIncluded,
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
            photos: existingListing?.photos,
          },
          classification: canonicalClassification,
        });
        updatePayload.listingData = mirrorListingQuantityIntoListingData({
          listingDataRaw: normalizedClassification.listingData,
          canonical: canonicalColumns,
        });
        Object.assign(updatePayload, canonicalColumns);
      }

      if (typeof title === "string" && title.trim()) {
        updatePayload.title = title.trim();
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

      const [updated] = await db
        .update(vendorListings)
        .set(updatePayload)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      return res.json(updated);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id", error);
      return res.status(500).json({ error: "Unable to update listing" });
    }
  });

  app.patch("/api/vendor/listings/:id/publish", requireDualAuthAuth0, async (req, res) => {
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

      const incomingListingData = req.body?.listingData;
      const incomingTitle = req.body?.title;

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
        allowLegacyFallback: false,
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
          photos: existingListing?.photos,
        },
        classification: canonicalClassification,
      });

      // ---- Publish validation (hard requirements) ----
      const mode = asTrimmedString(canonicalColumns.serviceAreaMode ?? existingListing?.serviceAreaMode).toLowerCase();
      const loc = ld.serviceLocation;
      const categoryOk = Boolean(canonicalColumns.category ?? normalizeListingCategory(existingListing?.category));
      const resolvedTitle = canonicalColumns.title ?? normalizeListingTitleCandidate(existingListing?.title);
      const resolvedDescription =
        canonicalColumns.description ?? (asTrimmedString(existingListing?.description) || null);
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

      const titleOk = Boolean(resolvedTitle && resolvedTitle.trim().length >= 2);
      const descOk = Boolean(resolvedDescription && resolvedDescription.trim().length >= 10);
      const photosOk = hasMinimumListingPhotos(ld, resolvedPhotos);
      const priceOk = hasValidListingPrice(ld, resolvedPriceCents);

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

      return res.json(updated);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/publish", error);
      return res.status(500).json({ error: "Unable to publish listing" });
    }
  });

    app.patch("/api/vendor/listings/:id/unpublish", requireDualAuthAuth0, async (req, res) => {
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

      return res.json(updated);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id/unpublish", error);
      return res.status(500).json({ error: "Unable to unpublish listing" });
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
        })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.id, resolvedVendorAccountId), eq(vendorAccounts.active, true)))
        .limit(1);

      let account = accountRows[0];
      if (!account) {
        const profileOwnerRows = await db
          .select({
            accountId: vendorProfiles.accountId,
            profileId: vendorProfiles.id,
            accountBusinessName: vendorAccounts.businessName,
            accountActiveProfileId: vendorAccounts.activeProfileId,
          })
          .from(vendorProfiles)
          .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
          .where(and(eq(vendorProfiles.id, vendorIdParam), eq(vendorProfiles.active, true), eq(vendorAccounts.active, true)))
          .limit(1);
        const profileOwner = profileOwnerRows[0];
        if (profileOwner?.accountId) {
          resolvedVendorAccountId = profileOwner.accountId;
          resolvedProfileId = resolvedProfileId || profileOwner.profileId;
          account = {
            id: profileOwner.accountId,
            businessName: profileOwner.accountBusinessName,
            activeProfileId: profileOwner.accountActiveProfileId,
          };
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
        serviceType: selectedProfile.serviceType,
        onlineProfiles: selectedProfile.onlineProfiles,
      };

      const onlineProfiles =
        vendor.onlineProfiles && typeof vendor.onlineProfiles === "object" && !Array.isArray(vendor.onlineProfiles)
          ? (vendor.onlineProfiles as Record<string, unknown>)
          : {};
      const aboutBusiness = asTrimmedString((onlineProfiles as any).aboutBusiness);
      const aboutOwner = asTrimmedString((onlineProfiles as any).aboutOwner);
      const profileImageUrl = asTrimmedString((onlineProfiles as any).shopProfileImageUrl);
      const coverImageUrl = asTrimmedString((onlineProfiles as any).shopCoverImageUrl);
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
          category: vendorListings.category,
          subcategory: vendorListings.subcategory,
          title: vendorListings.title,
          description: vendorListings.description,
          whatsIncluded: vendorListings.whatsIncluded,
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
          photos: vendorListings.photos,
          listingData: vendorListings.listingData,
          serviceType: vendorProfiles.serviceType,
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
            eq(vendorAccounts.active, true)
          )
        )
        .orderBy(asc(vendorListings.createdAt), asc(vendorListings.id));

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
        console.warn("avg response time compute failed:", error);
        avgResponseMinutes = null;
      }

      return res.json({
        vendor: {
          id: vendor.id,
          profileId: selectedProfile.id,
          businessName: vendor.businessName,
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
          serviceType: vendor.serviceType,
        },
        listings: listingsWithVendorMeta,
      });
    } catch (error: any) {
      logRouteError("/api/vendors/public/:vendorId/shop", error);
      return res.status(500).json({ error: "Unable to load vendor storefront" });
    }
  });

  // Public Listings (guest browsing)
  // Returns only active listings. No auth.
  app.get("/api/listings/public", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      await deactivateActiveListingsViolatingPublishGate();
      const listings = await db
        .select({
          id: vendorListings.id,
          status: vendorListings.status,
          title: vendorListings.title,
          category: vendorListings.category,
          subcategory: vendorListings.subcategory,
          description: vendorListings.description,
          whatsIncluded: vendorListings.whatsIncluded,
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
          photos: vendorListings.photos,
          listingData: vendorListings.listingData,

          serviceType: vendorProfiles.serviceType,
          city: vendorProfiles.city,
          vendorId: vendorAccounts.id,
          vendorName: vendorAccounts.businessName,
          vendorOnlineProfiles: vendorProfiles.onlineProfiles,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
        .where(
          and(
            eq(vendorListings.status, "active"),
            eq(vendorProfiles.active, true),
            eq(vendorAccounts.active, true)
          )
        );
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
        const vendorProfileImageUrl = asTrimmedString((onlineProfiles as any).shopProfileImageUrl);
        const { vendorOnlineProfiles: _ignored, ...safeListing } = listing;
        return {
          ...safeListing,
          vendorProfileImageUrl: vendorProfileImageUrl || null,
        };
      });
      return res.json(listingsWithVendorMeta);
    } catch (error: any) {
      logRouteError("/api/listings/public", error);
      return res.status(500).json({ error: "Unable to load listings" });
    }

  });

    // Public Listing Detail (guest browsing) added 1/22/26
  // Returns one active listing by id. No auth.
  app.get("/api/listings/public/:id", async (req, res) => {
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
          title: vendorListings.title,
          category: vendorListings.category,
          subcategory: vendorListings.subcategory,
          description: vendorListings.description,
          whatsIncluded: vendorListings.whatsIncluded,
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
          photos: vendorListings.photos,
          listingData: vendorListings.listingData,

          serviceType: vendorProfiles.serviceType,
          city: vendorProfiles.city,
          vendorId: vendorAccounts.id,
          vendorName: vendorAccounts.businessName,
          vendorOnlineProfiles: vendorProfiles.onlineProfiles,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
        .where(
          and(
            eq(vendorListings.status, "active"),
            eq(vendorListings.id, id),
            eq(vendorProfiles.active, true),
            eq(vendorAccounts.active, true)
          )
        )
        .limit(1);

      const listingRaw = rows[0];
      const isCompliantListing = listingRaw
        ? isListingPubliclyCompliant({
            listingDataRaw: (listingRaw as any).listingData,
            canonicalCategory: (listingRaw as any).category,
            canonicalPriceCents: (listingRaw as any).priceCents,
            canonicalPhotos: (listingRaw as any).photos,
          })
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
      const vendorProfileImageUrl = asTrimmedString((onlineProfiles as any).shopProfileImageUrl);
      const listing = listingRaw
        ? (() => {
            const { vendorOnlineProfiles: _ignored, ...safeListing } = listingRaw as any;
            return {
              ...safeListing,
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
          coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "authorName"
        from listing_reviews lr
        left join users u on u.id = lr.user_id
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
        console.warn("listing_traffic insert failed", err);
      }
      return res.json({
        ...listing,
        rating,
        reviewCount,
        reviews: publishedReviews,
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

      res.json(listings);
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
      if (!listings[0]?.profileId) {
        const [backfilled] = await db
          .update(vendorListings)
          .set({ profileId: activeProfileId, updatedAt: new Date() })
          .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
          .returning();
        return res.json(backfilled);
      }

      res.json(listings[0]);
    } catch (error: any) {
      logRouteError("/api/vendor/listings/:id", error);
      res.status(500).json({ error: "Unable to load listing" });
    }
  });

  app.delete("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
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
  const stripeOnboardingSchema = z.object({
    accountType: z.enum(["express", "standard"]),
    businessName: z.string().min(2),
  });

  app.post("/api/vendor/connect/onboard", ...requireVendorAuth0, async (req, res) => {
    try {
      const { accountType, businessName } = stripeOnboardingSchema.parse(req.body);
      const account = await getVendorAccountFromRequest(req);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      if (account.stripeConnectId) {
        return res.status(400).json({ error: "Stripe account already connected" });
      }

      const { createConnectAccount } = await import("./stripe");

      const result = await createConnectAccount({
        email: account.email,
        businessName,
        accountType,
      });

      await db
        .update(vendorAccounts)
        .set({
          stripeConnectId: result.accountId,
          stripeAccountType: accountType,
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

      const accountType = account.stripeAccountType === "standard" ? "standard" : "express";
      const businessName = (account.businessName || "").trim() || "EventHub Vendor";

      if (!account.stripeConnectId) {
        const { createConnectAccount } = await import("./stripe");
        const result = await createConnectAccount({
          email: account.email,
          businessName,
          accountType,
        });

        if (!result.onboardingUrl) {
          return res.status(500).json({ error: "Could not generate Stripe onboarding link" });
        }

        await db
          .update(vendorAccounts)
          .set({
            stripeConnectId: result.accountId,
            stripeAccountType: accountType,
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

        if (accountType === "standard") {
          return res.json({ url: "https://dashboard.stripe.com" });
        }

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
        if (!Number.isInteger(n)) return Math.round(n * 100);
        if (n < 1000) return n * 100;
        return n;
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
          coalesce(b.event_date, e.date) as "eventDate",
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

      const viewsRows: any = await db.execute(drizzleSql`
        select lt.occurred_at as "occurredAt"
        from listing_traffic lt
        inner join vendor_listings vl on vl.id = lt.listing_id
        where vl.account_id = ${vendorAccountId}
          and vl.profile_id = ${activeProfileId}
          and lt.event_type = 'view'
      `);
      const views = extractRows<{ occurredAt?: Date | string }>(viewsRows);
      const profileViews = views.length;
      const thisWeekViews = views.filter((v) => {
        const d = v.occurredAt ? new Date(v.occurredAt) : null;
        return d instanceof Date && !isNaN(d.getTime()) && d >= weekStart;
      }).length;
      const lastWeekViews = views.filter((v) => {
        const d = v.occurredAt ? new Date(v.occurredAt) : null;
        return d instanceof Date && !isNaN(d.getTime()) && d >= lastWeekStart && d < weekStart;
      }).length;
      const profileViewsGrowth =
        lastWeekViews > 0
          ? Math.round(((thisWeekViews - lastWeekViews) / lastWeekViews) * 100)
          : thisWeekViews > 0
            ? 100
            : 0;

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
    }>;

    return Promise.all(
      rows.map(async (row) => {
        const itemRes: any = await db.execute(drizzleSql`
          select
            bi.title,
            bi.listing_id as "listingId",
            bi.item_data as "itemData",
            vl.title as "listingTitle",
            vl.description as "listingDescription",
            vl.whats_included as "listingWhatsIncluded",
            vl.delivery_offered as "deliveryOffered",
            vl.setup_offered as "setupOffered",
            vl.profile_id as "listingProfileId"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          where bi.booking_id = ${row.id}
          limit 1
        `);
        const [item] = extractRows<{
          title?: string | null;
          listingId?: string | null;
          itemData?: any;
          listingTitle?: string | null;
          listingDescription?: string | null;
          listingWhatsIncluded?: string[] | null;
          deliveryOffered?: boolean | null;
          setupOffered?: boolean | null;
          listingProfileId?: string | null;
        }>(itemRes);
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

        return {
          ...row,
          itemTitle: resolvedItemTitle,
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
          coalesce(b.event_date, e.date) as "eventDate",
          coalesce(b.event_start_time, e.start_time) as "eventStartTime",
          b.payout_status as "payoutStatus",
          b.payout_eligible_at as "payoutEligibleAt",
          b.payout_blocked_reason as "payoutBlockedReason",
          b.paid_out_at as "paidOutAt"
        from bookings b
        left join events e on e.id = b.event_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where coalesce(b.vendor_account_id, listing_owner.account_id) = ${vendorAccountId}
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

  app.patch("/api/vendor/bookings/:id", ...requireVendorAuth0, async (req, res) => {
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
      });
      const { status: nextStatus } = updateVendorBookingSchema.parse(req.body ?? {});

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
          coalesce(b.event_date, e.date) as "eventDate"
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
        const eventDate = current.eventDate ? new Date(`${current.eventDate}T00:00:00`) : null;
        if (!(eventDate instanceof Date) || isNaN(eventDate.getTime())) {
          return res.status(400).json({ error: "Booking event date is missing or invalid" });
        }
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (todayStart <= eventDate) {
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
      const updatedResult: any = await db.execute(drizzleSql`
        update bookings b
        set status = ${nextStatus},
            updated_at = ${now},
            confirmed_at = case when ${nextStatus} = 'confirmed' then ${now} else b.confirmed_at end,
            completed_at = case when ${nextStatus} = 'completed' then ${now} else b.completed_at end,
            cancelled_at = case when ${nextStatus} = 'cancelled' then ${now} else b.cancelled_at end
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

      await syncBookingToGoogleCalendarSafely(updated.id, "/api/vendor/bookings/:id google-sync");

      return res.json({
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/vendor/messages", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json([]);

      const rows = await listVendorBookingChatContexts(vendorAccountId);
      const paidRows = rows.filter(
        (row) => row.bookingId.length > 0 && hasPaymentAccessForChat(row.paymentStatus)
      );
      const unread = await getStreamUnreadCountsForBookings({
        role: "vendor",
        appUserId: vendorAccountId,
        bookingIds: paidRows.map((row) => row.bookingId),
      });
      const conversations = paidRows.map((row) =>
        toConversationPayload("vendor", row, unread.counts[row.bookingId] || 0)
      );
      return res.json(conversations);
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
      const paidRows = rows.filter(
        (row) => row.bookingId.length > 0 && hasPaymentAccessForChat(row.paymentStatus)
      );
      const unread = await getStreamUnreadCountsForBookings({
        role: "vendor",
        appUserId: vendorAccountId,
        bookingIds: paidRows.map((row) => row.bookingId),
      });
      const conversations = paidRows.map((row) =>
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
      const paidBookingIds = rows
        .filter((row) => row.bookingId.length > 0 && hasPaymentAccessForChat(row.paymentStatus))
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

  app.post("/api/vendor/messages/:bookingId/bootstrap", ...requireVendorAuth0, async (req, res) => {
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
      if (!hasPaymentAccessForChat(booking.paymentStatus)) {
        return res.status(403).json({ error: "Chat becomes available after payment succeeds" });
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
      const paidRows = rows.filter(
        (row) => row.bookingId.length > 0 && hasPaymentAccessForChat(row.paymentStatus)
      );
      const unread = await getStreamUnreadCountsForBookings({
        role: "customer",
        appUserId: customerAuth.id,
        bookingIds: paidRows.map((row) => row.bookingId),
      });
      const conversations = paidRows.map((row) =>
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
      const paidBookingIds = rows
        .filter((row) => row.bookingId.length > 0 && hasPaymentAccessForChat(row.paymentStatus))
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

  app.post("/api/customer/messages/:bookingId/bootstrap", requireCustomerAnyAuth, async (req, res) => {
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
      if (!hasPaymentAccessForChat(booking.paymentStatus)) {
        return res.status(403).json({ error: "Chat becomes available after payment succeeds" });
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

  app.post("/api/chat/moderation/flag", requireDualAuthAuth0, async (req, res) => {
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
      return res.status(400).json({ error: error.message });
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
        // Booking totals are stored as either cents (int) or legacy dollars (int/float).
        // Heuristic: amounts >= 10,000 are almost certainly cents for this MVP range.
        if (Number.isInteger(n) && n >= 10_000) return n;
        return Math.round(n * 100);
      };

      let rows: Array<{
        id: string;
        status: string | null;
        paymentStatus: string | null;
        totalAmount: number | null;
        vendorPayout: number | null;
        listingTitleSnapshot?: string | null;
        bookedQuantity?: number | null;
        baseSubtotalCents?: number | null;
        logisticsTotalCents?: number | null;
        subtotalAmountCents?: number | null;
        customerFeeAmountCents?: number | null;
        vendorProfileId?: string | null;
        eventDate: string | null;
        createdAt: Date | string | null;
      }> = [];
      const bookingRows: any = await db.execute(drizzleSql`
        select
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.vendor_payout as "vendorPayout",
          b.listing_title_snapshot as "listingTitleSnapshot",
          b.booked_quantity as "bookedQuantity",
          b.base_subtotal_cents as "baseSubtotalCents",
          b.logistics_total_cents as "logisticsTotalCents",
          b.subtotal_amount_cents as "subtotalAmountCents",
          b.customer_fee_amount_cents as "customerFeeAmountCents",
          coalesce(b.vendor_profile_id, listing_owner.profile_id) as "vendorProfileId",
          coalesce(b.event_date, e.date) as "eventDate",
          b.created_at as "createdAt"
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
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const toNetCents = (r: { id: string; vendorPayout?: number | null }) => {
        const typedVendorPayout = normalizeAmountToCents(r.vendorPayout);
        if (typedVendorPayout > 0) return typedVendorPayout;

        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? 0;
        if (!baseAmountCents) return 0;
        const vendorFee = Math.round(baseAmountCents * VENDOR_FEE_RATE);
        return Math.max(0, baseAmountCents - vendorFee);
      };

      const totalNetEarned = rows
        .filter((r) => {
          const s = String(r.status || "").toLowerCase();
          return s === "completed";
        })
        .reduce((sum, r) => sum + toNetCents(r), 0);

      const upcomingNetPayout = rows
        .filter((r) => {
          const s = String(r.status || "").toLowerCase();
          const paymentState = toCanonicalPaymentStatus((r as any).paymentStatus);
          if (s !== "completed") return false;
          return paymentState === "succeeded" || paymentState === "partially_refunded";
        })
        .reduce((sum, r) => sum + toNetCents(r), 0);

      const historyBase = rows
        .filter((r) => String(r.status || "").toLowerCase() === "completed")
        .map((r) => {
        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? normalizeAmountToCents(r.totalAmount);
        const typedCustomerFeeCents = normalizeAmountToCents(r.customerFeeAmountCents);
        const grossCentsFromTypedTotal = normalizeAmountToCents(r.totalAmount);
        const grossCents =
          grossCentsFromTypedTotal > 0
            ? grossCentsFromTypedTotal
            : baseAmountCents + (typedCustomerFeeCents > 0 ? typedCustomerFeeCents : Math.round(baseAmountCents * CUSTOMER_FEE_RATE));
        const netCents = toNetCents(r);
        return {
          id: r.id,
          status: String(r.status || "pending").toLowerCase(),
          eventDate: r.eventDate,
          createdAt: r.createdAt,
          listingTitleSnapshot: r.listingTitleSnapshot ?? null,
          netAmount: netCents,
          grossAmount: grossCents,
        };
      });

      const historyWithContext = await attachBookingItemContext(historyBase as any);

      return res.json({
        totalNetEarned,
        upcomingNetPayout,
        payoutReleaseMode: PAYOUT_RELEASE_MODE,
        payoutPolicyNote:
          "Funds are auto-released after a 24-hour post-event dispute window unless a dispute is filed.",
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

  app.patch(
    "/api/vendor/notifications/:id/read",
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

      res.json([]);
    } catch (error: any) {
      logRouteError("/api/vendor/reviews", error);
      res.status(500).json({ error: "Unable to load reviews" });
    }
  });

  app.post("/api/vendor/reviews/:id/reply", ...requireVendorAuth0, async (req, res) => {
    try {
      res.json({ success: true });
    } catch (error: any) {
      logRouteError("/api/vendor/reviews/:id/reply", error);
      res.status(500).json({ error: "Unable to submit review reply" });
    }
  });

  // Customer-facing routes (existing)
  app.post("/api/events", async (req, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      const event = await storage.createEvent(validatedData);
      res.json(event);
    } catch (error: any) {
      logRouteError("/api/events POST", error);
      res.status(400).json({ error: "Invalid event payload" });
    }
  });

  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getAllEvents();
      res.json(events);
    } catch (error: any) {
      logRouteError("/api/events", error);
      res.status(500).json({ error: "Unable to load events" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error: any) {
      logRouteError("/api/events/:id", error);
      res.status(500).json({ error: "Unable to load event" });
    }
  });

  app.get("/api/events/:eventId/recommendations", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
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
            va.business_name as "listingVendorBusinessName"
          from booking_items bi
          left join vendor_listings vl on vl.id = bi.listing_id
          left join vendor_accounts va on va.id = vl.account_id
          where bi.booking_id = ${row.id}
          limit 1
        `);
        const [item] = extractRows<{
          title?: string | null;
          listingId?: string | null;
          itemData?: any;
          listingTitle?: string | null;
          listingVendorBusinessName?: string | null;
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
        const displayTitle = itemTitle ? `${itemTitle} from ${vendorName}` : vendorName;

        return {
          ...row,
          customerEventId,
          customerEventTitle,
          listingId: row.listingId ?? item?.listingId ?? null,
          itemTitle,
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
        order by b.created_at desc
      `);
      return res.json(await attachCustomerBookingContext(extractRows(rows) as any));
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.patch("/api/customer/bookings/:id/event", requireCustomerAnyAuth, async (req, res) => {
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
      });
      const data = schema.parse(req.body ?? {});
      const requestedEventId =
        typeof data.customerEventId === "string" && data.customerEventId.trim().length > 0
          ? data.customerEventId.trim()
          : null;
      const requestedEventTitle =
        typeof data.customerEventTitle === "string" && data.customerEventTitle.trim().length > 0
          ? data.customerEventTitle.trim().slice(0, 160)
          : null;

      if (!requestedEventId && !requestedEventTitle) {
        return res.status(400).json({ error: "Provide customerEventId or customerEventTitle" });
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
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/customer/bookings/:id/review", requireCustomerAnyAuth, async (req, res) => {
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
          reviewId,
        };
      });

      return res.json({
        bookingId,
        listingId: reviewResult.listingId,
        reviewId: reviewResult.reviewId,
        rating: data.rating,
        body: reviewBody,
      });
    } catch (error: any) {
      const status = typeof error?.status === "number" ? error.status : 400;
      if (status >= 500) {
        return respondWithInternalServerError(req, res, error);
      }
      return res.status(status).json({ error: error.message });
    }
  });

  app.post("/api/customer/bookings/:id/dispute", requireCustomerAnyAuth, async (req, res) => {
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
          coalesce(b.vendor_account_id, listing_owner.account_id) as "vendorAccountId"
        from bookings b
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where b.id = ${bookingId}
        limit 1
      `);
      const booking = extractRows<{
        bookingId?: string | null;
        customerId?: string | null;
        bookingEndAt?: Date | string | null;
        vendorAccountId?: string | null;
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

  app.post("/api/vendor/bookings/:id/dispute/respond", ...requireVendorAuth0, async (req, res) => {
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
          coalesce(b.vendor_account_id, listing_owner.account_id) as "vendorAccountId"
        from booking_disputes d
        inner join bookings b on b.id = d.booking_id
        left join vendor_listings listing_owner on listing_owner.id = b.listing_id
        where d.booking_id = ${bookingId}
        limit 1
      `);
      const dispute = extractRows<{
        disputeId?: string | null;
        status?: string | null;
        bookingId?: string | null;
        vendorAccountId?: string | null;
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

  app.get("/api/admin/disputes", requireAdminAuth, async (req, res) => {
    try {
      await ensureBookingDisputesTable();

      const requestedStatus = asTrimmedString(req.query?.status).toLowerCase();
      const allowed = new Set(["filed", "vendor_responded", "resolved_refund", "resolved_payout"]);
      if (requestedStatus && !allowed.has(requestedStatus)) {
        return res.status(400).json({ error: "Invalid dispute status filter" });
      }

      const whereClause = requestedStatus
        ? eq(bookingDisputes.status, requestedStatus as any)
        : undefined;

      const baseQuery = db
        .select({
          id: bookingDisputes.id,
          bookingId: bookingDisputes.bookingId,
          status: bookingDisputes.status,
          reason: bookingDisputes.reason,
          details: bookingDisputes.details,
          vendorResponse: bookingDisputes.vendorResponse,
          adminDecision: bookingDisputes.adminDecision,
          adminNotes: bookingDisputes.adminNotes,
          filedAt: bookingDisputes.filedAt,
          vendorRespondedAt: bookingDisputes.vendorRespondedAt,
          resolvedAt: bookingDisputes.resolvedAt,
          customerId: bookingDisputes.customerId,
          customerName: users.name,
          customerEmail: users.email,
          vendorAccountId: bookingDisputes.vendorAccountId,
          vendorBusinessName: vendorAccounts.businessName,
          bookingStatus: bookings.status,
          bookingEndAt: bookings.bookingEndAt,
          payoutStatus: bookings.payoutStatus,
          payoutBlockedReason: bookings.payoutBlockedReason,
        })
        .from(bookingDisputes)
        .innerJoin(bookings, eq(bookings.id, bookingDisputes.bookingId))
        .leftJoin(users, eq(users.id, bookingDisputes.customerId))
        .leftJoin(vendorAccounts, eq(vendorAccounts.id, bookingDisputes.vendorAccountId));
      const disputes = await (whereClause ? baseQuery.where(whereClause) : baseQuery).orderBy(
        desc(bookingDisputes.filedAt)
      );

      return res.json(disputes);
    } catch (error: any) {
      return res.status(500).json({ error: "Unable to load disputes" });
    }
  });

  app.post("/api/admin/disputes/:id/resolve", requireAdminAuth, async (req, res) => {
    try {
      await ensureBookingDisputesTable();

      const disputeId = asTrimmedString(req.params?.id);
      if (!disputeId) {
        return res.status(400).json({ error: "Dispute id is required" });
      }

      const payload = z
        .object({
          decision: z.enum(["refund", "payout"]),
          adminNotes: z.string().trim().max(2000).optional(),
        })
        .parse(req.body ?? {});

      const disputeRows = await db
        .select({
          id: bookingDisputes.id,
          bookingId: bookingDisputes.bookingId,
          status: bookingDisputes.status,
        })
        .from(bookingDisputes)
        .where(eq(bookingDisputes.id, disputeId))
        .limit(1);
      const dispute = disputeRows[0];
      if (!dispute?.id) {
        return res.status(404).json({ error: "Dispute not found" });
      }
      if (dispute.status === "resolved_refund" || dispute.status === "resolved_payout") {
        return res.status(409).json({ error: "Dispute already resolved" });
      }

      const now = new Date();

      if (payload.decision === "refund") {
        const depositPaymentRows = await db
          .select({
            id: payments.id,
            bookingId: payments.bookingId,
            scheduleId: payments.scheduleId,
            stripePaymentIntentId: payments.stripePaymentIntentId,
            amount: payments.amount,
            status: payments.status,
          })
          .from(payments)
          .where(and(eq(payments.bookingId, dispute.bookingId), eq(payments.paymentType, "deposit")))
          .orderBy(desc(payments.createdAt))
          .limit(1);
        const depositPayment = depositPaymentRows[0];

        if (!depositPayment?.id) {
          return res.status(400).json({ error: "No deposit payment found for this dispute" });
        }
        if (!isPaymentSucceededStatus(depositPayment.status)) {
          return res.status(400).json({ error: "Deposit payment is not in a refundable state" });
        }

        const { refundBookingPayment } = await import("./stripe");
        const refund = await refundBookingPayment({
          paymentIntentId: depositPayment.stripePaymentIntentId,
          reason: "requested_by_customer",
          idempotencyKey: `admin-dispute-refund:${dispute.id}:${depositPayment.id}`,
        });

        await db.transaction(async (tx) => {
          await tx
            .update(payments)
            .set({
              status: "refunded",
              refundAmount: depositPayment.amount,
              refundedAmount: depositPayment.amount,
              refundReason: "admin_dispute_refund",
              refundedAt: now,
              payoutStatus: "cancelled",
              payoutEligibleAt: null,
              payoutBlockedReason: "dispute_refund_approved",
              payoutAdjustedAmount: 0,
            })
            .where(eq(payments.id, depositPayment.id));

          if (depositPayment.scheduleId) {
            await tx
              .update(paymentSchedules)
              .set({ status: "refunded" })
              .where(eq(paymentSchedules.id, depositPayment.scheduleId));
          }

          await tx
            .update(bookings)
            .set({
              paymentStatus: "refunded",
              cancellationReason: "admin_dispute_refund",
              updatedAt: now,
            })
            .where(eq(bookings.id, dispute.bookingId));

          await tx
            .update(bookingDisputes)
            .set({
              status: "resolved_refund",
              adminDecision: "refund",
              adminNotes: payload.adminNotes ?? null,
              resolvedAt: now,
              updatedAt: now,
            })
            .where(eq(bookingDisputes.id, dispute.id));
        });

        return res.json({
          disputeId: dispute.id,
          bookingId: dispute.bookingId,
          decision: "refund",
          refund,
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
          .where(eq(bookingDisputes.id, dispute.id));

        await tx
          .update(payments)
          .set({
            payoutStatus: "eligible",
            payoutEligibleAt: now,
            payoutBlockedReason: null,
          })
          .where(and(eq(payments.bookingId, dispute.bookingId), eq(payments.paymentType, "deposit")));
      });

      const depositRows = await db
        .select({
          id: payments.id,
          bookingId: payments.bookingId,
        })
        .from(payments)
        .where(and(eq(payments.bookingId, dispute.bookingId), eq(payments.paymentType, "deposit")))
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

      return res.json({
        disputeId: dispute.id,
        bookingId: dispute.bookingId,
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
    listingId: z.string(),
    quantity: z.number().int().min(1).max(99).optional(),
    paymentMethodId: z.string().regex(/^pm_/, "Invalid Stripe payment method").optional(),
    idempotencyKey: z.string().min(16).max(128).optional(),
    customerEventId: z.string().optional(),
    customerEventTitle: z.string().max(160).optional(),
    eventId: z.string().optional(),
    packageId: z.string().optional(),
    addOnIds: z.array(z.string()).optional(),
    eventDate: z.string(),
    eventStartTime: z.string().optional(),
    eventEndDate: z.string().optional(),
    eventEndTime: z.string().optional(),
    itemNeededByTime: z.string().optional(),
    itemDoneByTime: z.string().optional(),
    eventLocation: z.string().optional(),
    guestCount: z.number().optional(),
    specialRequests: z.string().optional(),
    customerNotes: z.string().max(2000).optional(),
    customerQuestions: z.string().max(2000).optional(),
    finalPaymentStrategy: z.enum(["immediately", "2_weeks_prior", "day_of_event"]),
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
          const [existingDepositSchedule] = await db
            .select({
              id: paymentSchedules.id,
              status: paymentSchedules.status,
            })
            .from(paymentSchedules)
            .where(
              and(
                eq(paymentSchedules.bookingId, existingBookingId),
                eq(paymentSchedules.paymentType, "deposit")
              )
            )
            .limit(1);

          if (existingBooking?.id) {
            return res.json({
              ...existingBooking,
              payment: {
                depositScheduleId: existingDepositSchedule?.id ?? null,
                depositScheduleStatus: existingDepositSchedule?.status ?? null,
              },
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

      stage = "load-listing";
      const [listingRow] = await db
        .select({
          id: vendorListings.id,
          accountId: vendorListings.accountId,
          profileId: vendorListings.profileId,
          category: vendorListings.category,
          title: vendorListings.title,
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
          listingData: vendorListings.listingData,
          profileServiceType: vendorProfiles.serviceType,
          profileOperatingTimezone: vendorProfiles.operatingTimezone,
        })
        .from(vendorListings)
        .leftJoin(vendorProfiles, eq(vendorProfiles.id, vendorListings.profileId))
        .where(
          and(
            eq(vendorListings.id, data.listingId),
            eq(vendorListings.status, "active"),
            eq(vendorProfiles.active, true)
          )
        )
        .limit(1);

      if (!listingRow) {
        return res.status(404).json({ error: "Listing not found" });
      }

      stage = "load-vendor";
      const [vendorAccount] = await db
        .select({
          id: vendorAccounts.id,
          email: vendorAccounts.email,
          businessName: vendorAccounts.businessName,
          stripeConnectId: vendorAccounts.stripeConnectId,
          stripeOnboardingComplete: vendorAccounts.stripeOnboardingComplete,
          googleConnectionStatus: vendorAccounts.googleConnectionStatus,
          googleCalendarId: vendorAccounts.googleCalendarId,
        })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.id, listingRow.accountId), eq(vendorAccounts.active, true)))
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

      const listingDataAny = (listingRow.listingData ?? {}) as any;
      const itemTitle =
        (typeof listingRow.title === "string" && listingRow.title.trim()) ||
        (typeof listingDataAny?.listingTitle === "string" && listingDataAny.listingTitle.trim()) ||
        "Listing";
      const requestedQuantity =
        typeof data.quantity === "number" && Number.isFinite(data.quantity) && data.quantity > 0
          ? Math.max(1, Math.floor(data.quantity))
          : 1;
      const listingAvailableQuantity = getListingAvailableQuantity(listingDataAny, listingRow.quantity);
      if (requestedQuantity > listingAvailableQuantity) {
        return res.status(400).json({
          error: `Only ${listingAvailableQuantity} identical unit${listingAvailableQuantity === 1 ? "" : "s"} available for this listing.`,
          code: "listing_quantity_exceeded",
        });
      }

      let resolvedVendorProfileId =
        listingRow.profileId && typeof listingRow.profileId === "string" ? listingRow.profileId : null;
      let resolvedVendorServiceType =
        typeof listingRow.profileServiceType === "string" && listingRow.profileServiceType.trim().length > 0
          ? listingRow.profileServiceType.trim()
          : null;
      let resolvedVendorTimeZone = normalizeIanaTimeZone(listingRow.profileOperatingTimezone);
      if (!resolvedVendorProfileId) {
        const profileRows = await db
          .select({
            id: vendorProfiles.id,
            serviceType: vendorProfiles.serviceType,
            operatingTimezone: vendorProfiles.operatingTimezone,
          })
          .from(vendorProfiles)
          .where(and(eq(vendorProfiles.accountId, vendorAccount.id), eq(vendorProfiles.active, true)))
          .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id))
          .limit(1);
        if (profileRows[0]?.id) {
          resolvedVendorProfileId = profileRows[0].id;
          resolvedVendorServiceType =
            typeof profileRows[0].serviceType === "string" && profileRows[0].serviceType.trim().length > 0
              ? profileRows[0].serviceType.trim()
              : resolvedVendorServiceType;
          resolvedVendorTimeZone = normalizeIanaTimeZone(
            profileRows[0].operatingTimezone,
            resolvedVendorTimeZone
          );
          await db
            .update(vendorListings)
            .set({ profileId: resolvedVendorProfileId, updatedAt: new Date() })
            .where(eq(vendorListings.id, listingRow.id));
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
          .where(eq(events.id, requestedCustomerEventId))
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

      const basePriceCents = extractListingBasePriceCents(
        (listingRow.listingData ?? {}) as any,
        listingRow.priceCents
      );
      if (!basePriceCents || basePriceCents <= 0) {
        return res.status(400).json({ error: "Listing price is not configured" });
      }
      stage = "validate-booking-time-range";
      const canonicalBookingTimeRange = computeCanonicalBookingTimeRange({
        listingData: listingRow.listingData ?? {},
        listingPricingUnit: listingRow.pricingUnit,
        listingMinimumHours: listingRow.minimumHours,
        vendorTimeZone: resolvedVendorTimeZone,
        eventDate: data.eventDate,
        eventStartTime: data.eventStartTime ?? null,
        eventEndDate: data.eventEndDate ?? null,
        eventEndTime: data.eventEndTime ?? null,
        itemNeededByTime: data.itemNeededByTime ?? null,
        itemDoneByTime: data.itemDoneByTime ?? null,
      });

      stage = "check-listing-conflicts";
      const availabilityCheck = await checkListingAvailabilityForBookingRequest({
        vendorAccountId: vendorAccount.id,
        vendorGoogleConnectionStatus: vendorAccount.googleConnectionStatus,
        vendorGoogleCalendarId: vendorAccount.googleCalendarId,
        vendorTimeZone: canonicalBookingTimeRange.vendorTimeZone,
        listingId: listingRow.id,
        listingTitle: itemTitle,
        bookingStartAt: canonicalBookingTimeRange.bookingStartAt,
        bookingEndAt: canonicalBookingTimeRange.bookingEndAt,
        requestedQuantity,
        listingAvailableQuantity,
      });

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
        return res.status(503).json({
          error: "Availability could not be verified against the vendor's Google Calendar. Please try again.",
          code: "google_availability_unverifiable",
          source: "google",
          googleAvailabilityStatus: availabilityCheck.google.status,
          googleAvailabilityReason: availabilityCheck.google.reason,
        });
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

      const unitPriceCentsTotal = basePriceCents * requestedQuantity;
      const logisticsFees = getListingLogisticsFeeSummaryCents({
        listingData: listingDataAny,
        canonical: {
          pickupOffered: listingRow.pickupOffered,
          deliveryOffered: listingRow.deliveryOffered,
          deliveryFeeEnabled: listingRow.deliveryFeeEnabled,
          deliveryFeeAmountCents: listingRow.deliveryFeeAmountCents,
          setupOffered: listingRow.setupOffered,
          setupFeeEnabled: listingRow.setupFeeEnabled,
          setupFeeAmountCents: listingRow.setupFeeAmountCents,
          takedownOffered: (listingDataAny as any)?.takedownOffered ?? (listingDataAny as any)?.takedownIncluded,
          takedownFeeEnabled: (listingDataAny as any)?.takedownFeeEnabled,
          takedownFeeAmountCents:
            parseIntegerValue((listingDataAny as any)?.takedownFeeAmountCents) ??
            parseMoneyToCents((listingDataAny as any)?.takedownFeeAmount),
          travelOffered: listingRow.travelOffered,
          travelFeeEnabled: listingRow.travelFeeEnabled,
          travelFeeType: listingRow.travelFeeType,
          travelFeeAmountCents: listingRow.travelFeeAmountCents,
        },
      });
      const subtotalAmount =
        unitPriceCentsTotal +
        logisticsFees.deliveryFeeCents +
        logisticsFees.setupFeeCents +
        logisticsFees.takedownFeeCents +
        logisticsFees.travelFlatFeeCents;
      const customerFee = Math.round(subtotalAmount * CUSTOMER_FEE_RATE);
      const enforcedTotalAmount = subtotalAmount + customerFee;
      const platformFee = Math.round(subtotalAmount * VENDOR_FEE_RATE);
      const vendorPayout = subtotalAmount - platformFee;
      // MVP checkout policy: collect the full amount up-front at booking time.
      const enforcedDepositAmount = enforcedTotalAmount;
      const bookingLifecycle = resolveBookingLifecycleMode({
        listingCategory: listingRow.category,
        listingInstantBookEnabled: listingRow.instantBookEnabled,
        fallbackServiceType: resolvedVendorServiceType,
      });
      const bookingStatus = bookingLifecycle.initialStatus;
      const bookingConfirmedAt = bookingStatus === "confirmed" ? new Date() : null;
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
        await tx.execute(drizzleSql`select pg_advisory_xact_lock(hashtext(${listingRow.id}))`);

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

        let txBookingEventId = resolvedBookingEventId;
        let txCustomerEvent = resolvedCustomerEvent;
        if (requestedCustomerEventTitle) {
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

        const bookingRows = await tx
          .insert(bookings)
          .values({
            customerId: customerAuth.id,
            vendorAccountId: vendorAccount.id,
            vendorProfileId: bookingVendorProfileId,
            listingId: listingRow.id,
            eventId: txBookingEventId,
            packageId: data.packageId ?? null,
            addOnIds: data.addOnIds ?? [],
            eventDate: data.eventDate,
            eventStartTime: data.eventStartTime ?? null,
            eventEndTime: data.eventEndTime ?? null,
            itemNeededByTime: data.itemNeededByTime ?? null,
            itemDoneByTime: data.itemDoneByTime ?? null,
            eventLocation: data.eventLocation ?? null,
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
            finalPaymentStrategy: data.finalPaymentStrategy,
            status: bookingStatus,
            paymentStatus: "pending",
            payoutStatus: "not_ready",
            confirmedAt: bookingConfirmedAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        const booking = bookingRows[0];
        if (!booking?.id) {
          fail(500, "Failed to create booking record");
        }

        await tx.execute(drizzleSql`
          insert into booking_items (
            booking_id,
            listing_id,
            title,
            quantity,
            unit_price_cents,
            total_price_cents,
            item_data
          ) values (
            ${booking.id},
            ${listingRow.id},
            ${itemTitle},
            ${requestedQuantity},
            ${basePriceCents},
            ${subtotalAmount},
            ${JSON.stringify({
              listingId: listingRow.id,
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

        const [depositSchedule] = await tx
          .insert(paymentSchedules)
          .values({
            bookingId: booking.id,
            installmentNumber: 1,
            amount: enforcedDepositAmount,
            dueDate: new Date().toISOString().split("T")[0],
            paymentType: "deposit",
            status: "pending",
          })
          .returning({
            id: paymentSchedules.id,
            status: paymentSchedules.status,
          });

        return {
          booking,
          depositScheduleId: depositSchedule?.id ?? null,
          depositScheduleStatus: depositSchedule?.status ?? null,
          finalScheduleId: null,
        };
      });

      const booking = bookingInsertResult.booking;
      if (!booking?.id) {
        return res.status(500).json({ error: "Failed to create booking record" });
      }

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

      const emailTasks: Promise<any>[] = [];
      if (customerRow?.email) {
        emailTasks.push(
          sendBookingConfirmationEmail({
            to: customerRow.email,
            recipientName: customerRow.name || "Customer",
            counterpartName: vendorAccount.businessName || "Vendor",
            eventDate: data.eventDate,
            totalAmountCents: enforcedTotalAmount,
            role: "customer",
          })
        );
      }
      if (vendorAccount.email) {
        emailTasks.push(
          sendBookingConfirmationEmail({
            to: vendorAccount.email,
            recipientName: vendorAccount.businessName || "Vendor",
            counterpartName: customerRow?.name || "Customer",
            eventDate: data.eventDate,
            totalAmountCents: enforcedTotalAmount,
            role: "vendor",
          })
        );
      }
      await Promise.allSettled(emailTasks);

      await syncBookingToGoogleCalendarSafely(booking.id, "/api/bookings google-sync");

      return res.status(201).json({
        ...booking,
        payment: {
          depositScheduleId: bookingInsertResult.depositScheduleId,
          depositScheduleStatus: bookingInsertResult.depositScheduleStatus,
          finalScheduleId: bookingInsertResult.finalScheduleId,
        },
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
      return res.status(500).json({ error: "Failed to create booking" });
    }
  });

  app.post(
    "/api/bookings/:bookingId/payments/:scheduleId",
    paymentRateLimiter,
    requireCustomerAnyAuth,
    async (req, res) => {
      try {
        const { bookingId, scheduleId } = req.params;
        const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: false });
        if (!customerAuth?.id) {
          return res.status(401).json({ error: "Customer authentication required" });
        }
        const initialized = await initializeBookingPaymentIntentForSchedule({
          bookingId,
          scheduleId,
          customerId: customerAuth.id,
        });
        return res.json({
          bookingId: initialized.booking.id,
          scheduleId: initialized.schedule.id,
          paymentType: initialized.schedule.paymentType,
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
        if (message.includes("Payment schedule not found")) {
          return res.status(404).json({ error: "Payment schedule not found" });
        }
        if (message.includes("Booking not found")) {
          return res.status(404).json({ error: "Booking not found" });
        }
        if (message.includes("do not have access")) {
          return res.status(403).json({ error: "You do not have access to this booking" });
        }
        if (message.includes("Invalid payment initialization payload")) {
          return res.status(400).json({ error: "Invalid payment initialization payload" });
        }
        if (message.includes("Vendor payment processing not set up")) {
          return res.status(400).json({ error: "Vendor payment processing not set up" });
        }
        return res.status(500).json({ error: "Unable to initialize payment" });
      }
    }
  );

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

      const rawBody =
        req.rawBody instanceof Buffer
          ? req.rawBody
          : Buffer.from(JSON.stringify(req.body || {}));
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
          const fallbackScheduleId = asTrimmedString((metadata as any)?.scheduleId);
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
              fallbackScheduleId,
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
              totalAmount: payment.totalAmount ?? fallbackTotalAmount ?? payment.amount,
              refundedAmount: payment.refundedAmount ?? payment.refundAmount,
              vendorNetPayoutAmount: payment.vendorNetPayoutAmount ?? payment.vendorPayout,
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
                    parseIntegerValue(fallbackTotalAmount) ??
                    parseIntegerValue(payment.amount) ??
                    null,
                  platformFeeAmount:
                    parseIntegerValue(payment.platformFeeAmount) ??
                    parseIntegerValue(fallbackPlatformFeeAmount) ??
                    parseIntegerValue(payment.platformFee) ??
                    null,
                  vendorGrossAmount:
                    parseIntegerValue(payment.vendorGrossAmount) ??
                    parseIntegerValue(fallbackVendorGrossAmount),
                  vendorNetPayoutAmount:
                    parseIntegerValue(payment.vendorNetPayoutAmount) ??
                    parseIntegerValue(fallbackVendorNetPayoutAmount) ??
                    parseIntegerValue(payment.vendorPayout) ??
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

              if (payment.scheduleId) {
                await tx
                  .update(paymentSchedules)
                  .set({
                    status: "succeeded",
                    paidAt: now,
                  })
                  .where(eq(paymentSchedules.id, payment.scheduleId));
              }

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
                await tx
                  .update(bookings)
                  .set({
                    status: "confirmed",
                    paymentStatus: nextBookingPaymentStatus as any,
                    confirmedAt: now,
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

            if (payment.scheduleId) {
              await tx
                .update(paymentSchedules)
                .set({
                  status: "failed",
                })
                .where(eq(paymentSchedules.id, payment.scheduleId));
            }

            const nextBookingPaymentStatus = await recomputeBookingPaymentStatusInTx(
              tx,
              payment.bookingId
            );
            if (nextBookingPaymentStatus === "failed") {
              await markBookingAsPaymentFailedInTx(tx, payment.bookingId, "stripe_payment_failed");
            }
          });
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
                scheduleId: payments.scheduleId,
                status: payments.status,
                payoutStatus: payments.payoutStatus,
                payoutBlockedReason: payments.payoutBlockedReason,
                payoutAdjustedAmount: payments.payoutAdjustedAmount,
                disputeStatus: payments.disputeStatus,
                paidOutAt: payments.paidOutAt,
                payoutEligibleAt: payments.payoutEligibleAt,
                totalAmount: payments.totalAmount,
                amount: payments.amount,
                refundedAmount: payments.refundedAmount,
                refundAmount: payments.refundAmount,
                vendorNetPayoutAmount: payments.vendorNetPayoutAmount,
                vendorPayout: payments.vendorPayout,
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

            if (payment.scheduleId) {
              await tx
                .update(paymentSchedules)
                .set({
                  status: "disputed",
                })
                .where(eq(paymentSchedules.id, payment.scheduleId));
            }

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

          const refundedAmount = Math.max(
            0,
            parseIntegerValue(payment.refundedAmount) ??
              parseIntegerValue(payment.refundAmount) ??
              0
          );
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
            vendorNetPayoutAmount: payment.vendorNetPayoutAmount ?? payment.vendorPayout,
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
          if (payment.scheduleId) {
            await tx
              .update(paymentSchedules)
              .set({
                status: nextPaymentStatus as any,
              })
              .where(eq(paymentSchedules.id, payment.scheduleId));
          }

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
              vendorNetPayoutAmount: payment.vendorNetPayoutAmount ?? payment.vendorPayout,
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
                refundedAmount: amountRefunded > 0 ? amountRefunded : parseIntegerValue(payment.amount),
                refundReason: "stripe_charge_refunded",
                refundedAt: now,
                payoutStatus: payoutEligibility.payoutStatus,
                payoutEligibleAt: payoutEligibility.payoutEligibleAt,
                payoutBlockedReason: payoutEligibility.payoutBlockedReason,
                payoutAdjustedAmount: payoutEligibility.adjustedPayoutAmount,
              })
              .where(eq(payments.id, payment.id));

            if (payment.scheduleId) {
              await tx
                .update(paymentSchedules)
                .set({
                  status: nextStatus as any,
                })
                .where(eq(paymentSchedules.id, payment.scheduleId));
            }

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

  app.post("/api/admin/payouts/process", requireAdminAuth, async (req, res) => {
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
                refundedAmount:
                  parseIntegerValue(locked.refundedAmount) ??
                  parseIntegerValue(locked.refundAmount) ??
                  0,
                vendorNetPayoutAmount:
                  parseIntegerValue(locked.vendorNetPayoutAmount) ??
                  parseIntegerValue(locked.vendorPayout) ??
                  0,
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
          results.push({
            paymentId,
            bookingId,
            outcome: "blocked",
            reason: errorMessage,
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
          if (hoursSinceDeposit > 48) {
            return res.status(400).json({ error: "Refund period has expired (48 hours)" });
          }
        }

        const depositPaymentRows = await db
          .select({
            id: payments.id,
            bookingId: payments.bookingId,
            scheduleId: payments.scheduleId,
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
              refundedAmount: depositPayment.amount,
              refundReason: requestedReason || stripeReason,
              refundedAt: now,
              payoutStatus: "cancelled",
              payoutEligibleAt: null,
              payoutBlockedReason: "fully_refunded",
              payoutAdjustedAmount: 0,
            })
            .where(eq(payments.id, depositPayment.id));

          if (depositPayment.scheduleId) {
            await tx
              .update(paymentSchedules)
              .set({
                status: "refunded",
              })
              .where(eq(paymentSchedules.id, depositPayment.scheduleId));
          }

          await tx
            .update(paymentSchedules)
            .set({
              status: "refunded",
            })
            .where(
              and(
                eq(paymentSchedules.bookingId, bookingId),
                eq(paymentSchedules.status, "pending")
              )
            );

          await tx
            .update(payments)
            .set({
              status: "refunded",
              refundedAmount: depositPayment.amount,
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

  app.post("/api/track", async (req, res) => {
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
        const payload = verifyToken(token);
        if (payload) {
          userId = payload.id;
          userType = payload.type;
        } else {
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
            // Ignore auth0 lookup failures; keep analytics ingestion best-effort.
          }
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

  app.post("/api/admin/chat/cleanup-expired", requireAdminAuth, async (req, res) => {
    try {
      const result = await cleanupExpiredStreamChannels();
      return res.json(result);
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/admin/stats/users", requireAdminAuth, async (req, res) => {
    try {
      const [totalUsersResult] = await db.select({ count: count() }).from(users);
      const totalUsers = totalUsersResult.count;

      const [totalVendorsResult] = await db.select({ count: count() }).from(vendorAccounts);
      const totalVendors = totalVendorsResult.count;

      const vendorsByType = await db
        .select({
          serviceType: vendorProfiles.serviceType,
          count: count(),
        })
        .from(vendorProfiles)
        .groupBy(vendorProfiles.serviceType);

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

  app.get("/api/admin/stats/listings", requireAdminAuth, async (req, res) => {
    try {
      const [totalListingsResult] = await db.select({ count: count() }).from(vendorListings);
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

      const listingsByType = await db
        .select({
          serviceType: vendorProfiles.serviceType,
          count: count(),
        })
        .from(vendorProfiles)
        .groupBy(vendorProfiles.serviceType);

      res.json({
        totalListings,
        listingsByType,
        activeListings,
        draftListings,
        inactiveListings,
      });
    } catch (error: any) {
      return respondWithInternalServerError(req, res, error);
    }
  });

  app.get("/api/admin/stats/bookings", requireAdminAuth, async (req, res) => {
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

  app.get("/api/admin/stats/chat-flags", requireAdminAuth, async (req, res) => {
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

  app.get("/api/admin/stats/traffic", requireAdminAuth, async (req, res) => {
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

  await ensureBookingDisputesTable();
  startAutoPayoutWorker();

  const httpServer = createServer(app);
  return httpServer;
}
