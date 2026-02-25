import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import crypto from "crypto";
import {
  insertEventSchema,
  insertVendorAccountSchema,
  insertVendorProfileSchema,
  vendorProfiles,
  vendorAccounts,
  vendorListings,
  listingTraffic,
  users,
  insertUserSchema,
  webTraffic,
  bookings,
  events,
  paymentSchedules,
  rentalTypes,
} from "@shared/schema";
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  requireVendorAuth, // legacy (kept for now; not used on vendor routes below)
  requireDualAuth,
  requireDualAuthAuth0,
  requireAdminAuth,
} from "./auth";
import { requireAuth0 } from "./auth0"; // ✅ Auth0 middleware
import { z } from "zod";
import { db } from "./db";
import { eq, and, sql as drizzleSql, count, sum, gte, lte, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sendBookingConfirmationEmail } from "./email";
import {
  computeChatRetentionExpiry,
  deleteStreamBookingChannel,
  ensureStreamBookingChannel,
  getStreamUnreadCountsForBookings,
  getStreamApiKey,
  isChatExpiredForEventDate,
  isStreamChatConfigured,
  toStreamUserId,
} from "./streamChat";

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
    const auth0Sub = auth0?.sub;
    const rawEmail = auth0?.email;
    const emailNormalized = rawEmail ? rawEmail.toLowerCase().trim() : undefined;

    if (!auth0Sub && !emailNormalized) {
      return res.status(401).json({ error: "Missing Auth0 identity (sub/email)" });
    }

    let account: any | undefined;

    // 1) Prefer lookup by normalized email to avoid duplicate accounts per email
    if (emailNormalized) {
      const byEmail = await db
        .select()
        .from(vendorAccounts)
        .where(drizzleSql`lower(${vendorAccounts.email}) = ${emailNormalized}`);

      if (byEmail.length > 0) {
        account = byEmail[0];
      }

      // Backfill auth0Sub onto the vendor account so future logins work even if email is missing
      if (account && auth0Sub && !account.auth0Sub) {
        const [updated] = await db
          .update(vendorAccounts)
          .set({ auth0Sub })
          .where(eq(vendorAccounts.id, account.id))
          .returning();

        account = updated;
      }
    }

    // 2) Fallback: lookup by auth0Sub if still not found
    if (!account && auth0Sub) {
      const bySub = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.auth0Sub, auth0Sub));

      if (bySub.length > 0) {
        account = bySub[0];
      }
    }

    if (!account) {
      // Auth0 is valid, but user doesn't have a vendor account row yet
      return res.status(404).json({ error: "Vendor account not found for this Auth0 user" });
    }

    // Ensure auth0Sub is stored/kept in sync on the vendor account
    if (auth0Sub && account.auth0Sub !== auth0Sub) {
      const [updated] = await db
        .update(vendorAccounts)
        .set({ auth0Sub })
        .where(eq(vendorAccounts.id, account.id))
        .returning();
      account = updated;
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

/**
 * Convenience combo for vendor routes:
 * - verify Auth0 token
 * - resolve vendor account by auth0_sub
 */
const requireVendorAuth0 = [requireAuth0, requireVendorAccountAuth0] as const;
const VENDOR_FEE_RATE = 0.08;
const CUSTOMER_FEE_RATE = 0.05;
const CHAT_POLICY_WARNING =
  "For your safety, do not share personal contact info, payment card details, or sensitive personal data in chat.";
let moderationTableReadyPromise: Promise<void> | null = null;
let bookingsVendorRefColumnCache: "vendor_account_id" | "vendor_id" | "none" | null = null;

function extractRows<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function collectRateValues(source: unknown): number[] {
  if (!source || typeof source !== "object") return [];
  const next: number[] = [];
  for (const value of Object.values(source as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const rate = toOptionalNumber((value as any).rate);
    if (rate != null) next.push(rate);
  }
  return next;
}

function hasValidListingPrice(listingDataRaw: unknown): boolean {
  const listingData =
    listingDataRaw && typeof listingDataRaw === "object" ? (listingDataRaw as Record<string, any>) : {};
  const candidates: number[] = [];

  const baseRate = toOptionalNumber(listingData?.pricing?.rate);
  if (baseRate != null) candidates.push(baseRate);

  const legacyRate = toOptionalNumber(listingData?.rate);
  if (legacyRate != null) candidates.push(legacyRate);

  candidates.push(...collectRateValues(listingData?.pricing?.pricingByPropType));
  candidates.push(...collectRateValues(listingData?.pricingByPropType));

  if (Array.isArray(listingData?.offerings)) {
    for (const offering of listingData.offerings) {
      const offeringPrice = toOptionalNumber((offering as any)?.price);
      if (offeringPrice != null) candidates.push(offeringPrice);
    }
  }

  return candidates.some((value) => value > 0);
}

async function deactivateActiveListingsWithoutValidPrice(accountId?: string): Promise<number> {
  const whereClause = accountId
    ? and(eq(vendorListings.status, "active"), eq(vendorListings.accountId, accountId))
    : eq(vendorListings.status, "active");

  const activeListings = await db
    .select({ id: vendorListings.id, listingData: vendorListings.listingData })
    .from(vendorListings)
    .where(whereClause);

  const invalidIds = activeListings
    .filter((listing) => !hasValidListingPrice(listing.listingData))
    .map((listing) => listing.id);

  for (const listingId of invalidIds) {
    await db
      .update(vendorListings)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(vendorListings.id, listingId));
  }

  if (invalidIds.length > 0) {
    console.log(
      "[listing price gate] moved active listings to inactive due to missing/invalid price:",
      invalidIds.length
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

function hasPaymentMethodForChat(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed.startsWith("pm_");
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
    paymentInfoCollected: hasPaymentMethodForChat(row.paymentMethodId),
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

async function getBookingChatContextById(bookingId: string): Promise<BookingChatContext | null> {
  const vendorRefCol = await getBookingsVendorRefColumn();

  if (vendorRefCol === "vendor_account_id") {
    const rows: any = await db.execute(drizzleSql`
      select
        b.id as "bookingId",
        b.event_id as "eventId",
        b.customer_id as "customerId",
        coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
        u.email as "customerEmail",
        b.vendor_account_id as "vendorAccountId",
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
      left join vendor_accounts va on va.id = b.vendor_account_id
      left join events e on e.id = b.event_id
      where b.id = ${bookingId}
      limit 1
    `);
    const row = extractRows(rows)[0];
    return row ? normalizeBookingChatContext(row) : null;
  }

  if (vendorRefCol === "vendor_id") {
    const rows: any = await db.execute(drizzleSql`
      select
        b.id as "bookingId",
        b.event_id as "eventId",
        b.customer_id as "customerId",
        coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
        u.email as "customerEmail",
        b.vendor_id as "vendorAccountId",
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
      left join vendor_accounts va on va.id = b.vendor_id
      left join events e on e.id = b.event_id
      where b.id = ${bookingId}
      limit 1
    `);
    const row = extractRows(rows)[0];
    return row ? normalizeBookingChatContext(row) : null;
  }

  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      owner.vendor_account_id as "vendorAccountId",
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
    left join lateral (
      select vl.account_id as vendor_account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      limit 1
    ) owner on true
    left join vendor_accounts va on va.id = owner.vendor_account_id
    where b.id = ${bookingId}
    limit 1
  `);
  const row = extractRows(rows)[0];
  return row ? normalizeBookingChatContext(row) : null;
}

async function listCustomerBookingChatContexts(customerId: string): Promise<BookingChatContext[]> {
  const vendorRefCol = await getBookingsVendorRefColumn();

  if (vendorRefCol === "vendor_account_id") {
    const rows: any = await db.execute(drizzleSql`
      select
        b.id as "bookingId",
        b.event_id as "eventId",
        b.customer_id as "customerId",
        coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
        u.email as "customerEmail",
        b.vendor_account_id as "vendorAccountId",
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
      left join vendor_accounts va on va.id = b.vendor_account_id
      left join events e on e.id = b.event_id
      where b.customer_id = ${customerId}
      order by b.created_at desc
    `);
    return extractRows(rows).map(normalizeBookingChatContext);
  }

  if (vendorRefCol === "vendor_id") {
    const rows: any = await db.execute(drizzleSql`
      select
        b.id as "bookingId",
        b.event_id as "eventId",
        b.customer_id as "customerId",
        coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
        u.email as "customerEmail",
        b.vendor_id as "vendorAccountId",
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
      left join vendor_accounts va on va.id = b.vendor_id
      left join events e on e.id = b.event_id
      where b.customer_id = ${customerId}
      order by b.created_at desc
    `);
    return extractRows(rows).map(normalizeBookingChatContext);
  }

  const rows: any = await db.execute(drizzleSql`
    select
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      owner.vendor_account_id as "vendorAccountId",
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
    left join lateral (
      select vl.account_id as vendor_account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      limit 1
    ) owner on true
    left join vendor_accounts va on va.id = owner.vendor_account_id
    where b.customer_id = ${customerId}
    order by b.created_at desc
  `);
  return extractRows(rows).map(normalizeBookingChatContext);
}

async function listVendorBookingChatContexts(vendorAccountId: string): Promise<BookingChatContext[]> {
  const vendorRefCol = await getBookingsVendorRefColumn();

  if (vendorRefCol === "vendor_account_id") {
    const rows: any = await db.execute(drizzleSql`
      select
        b.id as "bookingId",
        b.event_id as "eventId",
        b.customer_id as "customerId",
        coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
        u.email as "customerEmail",
        b.vendor_account_id as "vendorAccountId",
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
      left join vendor_accounts va on va.id = b.vendor_account_id
      left join events e on e.id = b.event_id
      where b.vendor_account_id = ${vendorAccountId}
      order by b.created_at desc
    `);
    return extractRows(rows).map(normalizeBookingChatContext);
  }

  if (vendorRefCol === "vendor_id") {
    const rows: any = await db.execute(drizzleSql`
      select
        b.id as "bookingId",
        b.event_id as "eventId",
        b.customer_id as "customerId",
        coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
        u.email as "customerEmail",
        b.vendor_id as "vendorAccountId",
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
      left join vendor_accounts va on va.id = b.vendor_id
      left join events e on e.id = b.event_id
      where b.vendor_id = ${vendorAccountId}
      order by b.created_at desc
    `);
    return extractRows(rows).map(normalizeBookingChatContext);
  }

  const rows: any = await db.execute(drizzleSql`
    select distinct on (b.id)
      b.id as "bookingId",
      b.event_id as "eventId",
      b.customer_id as "customerId",
      coalesce(nullif(u.display_name, ''), nullif(u.name, ''), 'Customer') as "customerName",
      u.email as "customerEmail",
      owner.vendor_account_id as "vendorAccountId",
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
    inner join lateral (
      select vl.account_id as vendor_account_id
      from booking_items bi
      inner join vendor_listings vl on vl.id = bi.listing_id
      where bi.booking_id = b.id
      limit 1
    ) owner on true
    left join vendor_accounts va on va.id = owner.vendor_account_id
    where owner.vendor_account_id = ${vendorAccountId}
    order by b.id, b.created_at desc
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

function extractListingBasePriceCents(listingData: any): number | null {
  if (!listingData || typeof listingData !== "object") return null;

  const rentalTypes = Array.isArray(listingData?.rentalTypes)
    ? listingData.rentalTypes
    : Array.isArray(listingData?.rentalTypes?.selected)
      ? listingData.rentalTypes.selected
      : Array.isArray(listingData?.propTypes)
        ? listingData.propTypes
        : Array.isArray(listingData?.propTypes?.selected)
          ? listingData.propTypes.selected
          : [];
  const firstRentalType = rentalTypes[0];

  const candidates = [
    listingData?.pricing?.rate,
    firstRentalType ? listingData?.pricing?.pricingByPropType?.[firstRentalType]?.rate : null,
    firstRentalType ? listingData?.pricingByPropType?.[firstRentalType]?.rate : null,
    listingData?.pricingByPropType?.__listing__?.rate,
    listingData?.rate,
  ];

  const dollars = candidates
    .map((v) => toOptionalNumber(v))
    .find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!dollars || dollars <= 0) return null;

  return Math.max(1, Math.round(dollars * 100));
}

function formatVendorTypeForDraftTitle(vendorType: string): string {
  if (vendorType === "prop-decor") return "rental";
  return vendorType.replace(/-/g, " ");
}

async function getBookingsVendorRefColumn(): Promise<"vendor_account_id" | "vendor_id" | "none"> {
  if (bookingsVendorRefColumnCache) return bookingsVendorRefColumnCache;

  const result: any = await db.execute(drizzleSql`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookings'
      and column_name in ('vendor_account_id', 'vendor_id')
    order by case when column_name = 'vendor_account_id' then 0 else 1 end
    limit 1
  `);

  const rows = extractRows<{ column_name?: string }>(result);
  const col = rows[0]?.column_name as "vendor_account_id" | "vendor_id" | undefined;
  if (col === "vendor_account_id" || col === "vendor_id") {
    bookingsVendorRefColumnCache = col;
  } else {
    bookingsVendorRefColumnCache = "none";
  }
  return bookingsVendorRefColumnCache;
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

async function resolveCustomerAuthFromRequest(
  req: any,
  opts?: { createIfMissing?: boolean }
): Promise<{ id: string; email: string; type: "customer" | "admin" } | null> {
  if (req?.customerAuth?.id) {
    return req.customerAuth;
  }

  const auth0 = req?.auth0 as { sub?: string; email?: string } | undefined;
  const sub = auth0?.sub?.trim();
  const emailFromAuth0 = auth0?.email?.toLowerCase().trim();
  let email = emailFromAuth0;

  // Prefer stable Auth0 subject matching when available (works even if email is missing in token).
  if (sub) {
      try {
      const subLookup = await db.execute(
        drizzleSql`select id, email, role from users where auth0_sub = ${sub} limit 1`
      );
      const subRows = extractRows<{ id?: string; email?: string; role?: string }>(subLookup);
      const subUser = subRows[0];
      if (subUser?.id && subUser?.email) {
        return {
          id: subUser.id,
          email: subUser.email,
          type: subUser.role === "admin" ? "admin" : "customer",
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

  if (!userRow && opts?.createIfMissing) {
    const generatedName = email.split("@")[0] || "Customer";
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

  if (!userRow) return null;

  return {
    id: userRow.id,
    email: userRow.email,
    type: userRow.role === "admin" ? "admin" : "customer",
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // --- Listing photo uploads (local disk) ---
  const listingUploadsDir = path.join(process.cwd(), "server/uploads/listings");
  if (!fs.existsSync(listingUploadsDir)) fs.mkdirSync(listingUploadsDir, { recursive: true });

  // One-time startup reconciliation so legacy active listings without valid prices
  // are immediately hidden from public browse after deploy.
  try {
    await deactivateActiveListingsWithoutValidPrice();
  } catch (error: any) {
    console.warn(
      "[listing price gate] startup reconciliation failed:",
      error?.message || error
    );
  }

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

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, listingUploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const safeExt = ext && ext.length <= 8 ? ext : ".jpg";
        const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        cb(null, `${base}${safeExt}`);
      },
    }),
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
  requireDualAuthAuth0,
  upload.single("photo"),
  async (req: any, res) => {
    console.log(">>> HIT /api/uploads/listing-photo", req.method, req.path);
    // multer rejected the file OR no file was provided
    if (!req.file) {
      return res.status(400).json({ error: "Only JPG, PNG, or WebP allowed (max 10MB)." });
    }

    return res.json({
      url: `/uploads/listings/${req.file.filename}`,
      filename: req.file.filename,
    });
  }
);

  // Location search (used by LocationPicker autocomplete)
  app.get("/api/locations/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q || q.length < 2) return res.json([]);

      const token = process.env.MAPBOX_ACCESS_TOKEN;
      console.log("MAPBOX_ACCESS_TOKEN exists:", Boolean(token));

      if (!token) {
        return res.status(500).json({ error: "Mapbox token not configured" });
      }

      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${encodeURIComponent(q)}.json` +
        `?autocomplete=true&limit=5&access_token=${token}`;

      const response = await fetch(url);
      const text = await response.text();

      if (!response.ok) {
        // Mapbox returns a helpful JSON message here; include it
        throw new Error(`Mapbox error: ${response.status} - ${text}`);
      }

      const data = JSON.parse(text);

      const results = (data.features || []).map((f: any) => ({
        id: f.id,
        label: f.place_name,
        lat: f.center[1],
        lng: f.center[0],
      }));

      return res.json(results);
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || "Location search failed",
      });
    }
  });

  // Vendor Authentication Routes (legacy; kept but not required for Auth0-only flow)
  const vendorSignupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    businessName: z.string().min(2),
  });

  const vendorLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
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

      const profiles = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, account.id));

      const profile = profiles[0];

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
        businessName: account.businessName,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        profileComplete: profile !== undefined,
        profileId: profile?.id || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Legacy vendor signup/login (kept; not used for Auth0-only vendors)
  app.post("/api/vendor/signup", async (req, res) => {
    try {
      const { email, password, businessName } = vendorSignupSchema.parse(req.body);

      // Check if vendor account already exists (check database)
      const existing = await db.select().from(vendorAccounts).where(eq(vendorAccounts.email, email));
      if (existing.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create vendor account in database
      const [account] = await db
        .insert(vendorAccounts)
        .values({
          email,
          password: hashedPassword,
          businessName,
          stripeConnectId: null,
          stripeAccountType: null,
          stripeOnboardingComplete: false,
        })
        .returning();

      // Generate JWT token
      const token = generateToken({
        id: account.id,
        email: account.email,
        type: "vendor",
      });

      res.json({
        token,
        vendorAccount: {
          id: account.id,
          email: account.email,
          profileComplete: account.profileComplete,
          stripeOnboardingComplete: account.stripeOnboardingComplete,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/vendor/login", async (req, res) => {
    try {
      const { email, password } = vendorLoginSchema.parse(req.body);

      // Find vendor account (from database)
      const accounts = await db.select().from(vendorAccounts).where(eq(vendorAccounts.email, email));
      if (accounts.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const account = accounts[0];

      // Verify password
      const valid = await comparePassword(password, account.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Generate JWT token
      const token = generateToken({
        id: account.id,
        email: account.email,
        type: "vendor",
      });

      res.json({
        token,
        vendorAccount: {
          id: account.id,
          email: account.email,
          profileComplete: account.profileComplete,
          stripeOnboardingComplete: account.stripeOnboardingComplete,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/vendor/me ✅ Auth0-only
   */
  app.get("/api/vendor/me", ...requireVendorAuth0, async (req, res) => {
    console.log("HIT /api/vendor/me");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Vary", "Authorization");
    res.setHeader("ETag", `vendor-me-${Date.now()}`);
    res.setHeader("Last-Modified", new Date().toUTCString());

    try {
      const vendorAuth = (req as any).vendorAuth;

      const accounts = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id));

      if (accounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const account = accounts[0];

      // Check if vendor has completed profile (using database)
      const profiles = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, account.id));
      const profile = profiles[0];

      res.json({
        id: account.id,
        email: account.email,
        businessName: account.businessName,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,        profileComplete: profile !== undefined,
        profileId: profile?.id || null,
        vendorType: profile?.serviceType || "unspecified",
        __marker: "vendor_me_route_hit",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Customer Authentication Routes (unchanged)
  const customerSignupSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  });

  const customerLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  app.post("/api/customer/signup", async (req, res) => {
    try {
      const { name, email, password } = customerSignupSchema.parse(req.body);

      // Check if customer already exists
      const existing = await db.select().from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        // Smart error handling: instead of hard error, tell frontend to switch to login
        return res.status(400).json({
          emailExists: true,
          email,
          message: "You already have an account with this email. Please log in instead.",
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Auto-assign admin role if email matches ADMIN_EMAIL
      const adminEmail = process.env.ADMIN_EMAIL;
      const role = adminEmail && email.toLowerCase() === adminEmail.toLowerCase() ? "admin" : "customer";

      // Create customer account with role and lastLoginAt
      const [user] = await db
        .insert(users)
        .values({
          name,
          email,
          password: hashedPassword,
          role,
          displayName: name,
          lastLoginAt: new Date(),
        })
        .returning();

      // Generate JWT token with appropriate type
      const tokenType = user.role === "admin" ? "admin" : "customer";
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: tokenType,
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/customer/login", async (req, res) => {
    try {
      const { email, password } = customerLoginSchema.parse(req.body);

      // Find customer account
      const userAccounts = await db.select().from(users).where(eq(users.email, email));
      if (userAccounts.length === 0) {
        // Smart error handling: tell frontend to offer creating account
        return res.status(404).json({
          userNotFound: true,
          email,
          message: "We couldn't find an account with this email. Would you like to create one?",
        });
      }
      const user = userAccounts[0];

      // Verify password
      const valid = await comparePassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // Update last login timestamp
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      // Generate JWT token with appropriate type
      const tokenType = user.role === "admin" ? "admin" : "customer";
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: tokenType,
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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

      res.json({
        id: user.id,
        name: user.name,
        displayName: user.displayName ?? null,
        profilePhotoDataUrl,
        email: user.email,
        role: user.role,
        defaultLocation,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

  // Unified Login Endpoint (legacy; kept)
  const unifiedLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = unifiedLoginSchema.parse(req.body);

      // SPECIAL CASE: Check if this is the admin email first
      const adminEmail = process.env.ADMIN_EMAIL;
      const isAdminEmail = adminEmail && email.toLowerCase() === adminEmail.toLowerCase();

      if (isAdminEmail) {
        // For admin email, ONLY check customer accounts (users table)
        const customerAccounts = await db.select().from(users).where(eq(users.email, email));
        if (customerAccounts.length > 0) {
          const user = customerAccounts[0];

          // Verify password
          const valid = await comparePassword(password, user.password);
          if (!valid) {
            return res.status(401).json({ error: "Invalid password" });
          }

          // Ensure admin role is set
          await db
            .update(users)
            .set({
              lastLoginAt: new Date(),
              role: "admin",
            })
            .where(eq(users.id, user.id));

          // Generate admin JWT token
          const token = generateToken({
            id: user.id,
            email: user.email,
            type: "admin",
          });

          return res.json({
            token,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: "admin",
            },
          });
        } else {
          // Admin email but no customer account exists
          return res.status(404).json({
            userNotFound: true,
            email,
            message: "Admin account not found. Please sign up first.",
          });
        }
      }

      // For non-admin emails, check vendor accounts FIRST (legacy)
      const vendorAccountsResult = await db.select().from(vendorAccounts).where(eq(vendorAccounts.email, email));
      if (vendorAccountsResult.length > 0) {
        const account = vendorAccountsResult[0];

        // Verify password
        const valid = await comparePassword(password, account.password);
        if (!valid) {
          return res.status(401).json({ error: "Invalid password" });
        }

        // Generate vendor JWT token
        const token = generateToken({
          id: account.id,
          email: account.email,
          type: "vendor",
        });

        return res.json({
          token,
          user: {
            id: account.id,
            email: account.email,
            businessName: account.businessName,
            role: "vendor",
            profileComplete: account.profileComplete,
            stripeOnboardingComplete: account.stripeOnboardingComplete,
          },
        });
      }

      // Second, check customer accounts (users table)
      const customerAccounts = await db.select().from(users).where(eq(users.email, email));
      if (customerAccounts.length > 0) {
        const user = customerAccounts[0];

        // Verify password
        const valid = await comparePassword(password, user.password);
        if (!valid) {
          return res.status(401).json({ error: "Invalid password" });
        }

        // Update last login timestamp
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

        // Generate customer JWT token
        const token = generateToken({
          id: user.id,
          email: user.email,
          type: "customer",
        });

        return res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        });
      }

      // No account found in either table
      return res.status(404).json({
        userNotFound: true,
        email,
        message: "We couldn't find an account with this email. Would you like to create one?",
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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

    streetAddress: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),

    businessPhone: z.string().min(1),
    businessEmail: z.string().email(),
    aboutBusiness: z.string().optional(),

    homeBaseLocation: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),

    serviceRadiusMiles: z.coerce.number().optional(),
  });

  app.post("/api/vendor/onboarding/complete", requireAuth0, async (req, res) => {
    try {
      const customerAuth = (req as any).customerAuth;
      const vendorAuth = (req as any).vendorAuth;
      const auth0 = (req as any).auth0 as { sub: string; email?: string } | undefined;

      const onboardingData = completeOnboardingSchema.parse(req.body);

      const rawEmail = auth0?.email;
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
      const auth0Sub = auth0?.sub;

      if (!email) {
        return res.status(400).json({ error: "Auth0 email is required for onboarding" });
      }

      const existingAccounts = await db
        .select()
        .from(vendorAccounts)
        .where(drizzleSql`lower(${vendorAccounts.email}) = ${email}`);
      let account = existingAccounts[0];

      if (!account) {
        const [created] = await db
          .insert(vendorAccounts)
          .values({
            email,
            auth0Sub,
            password: "auth0-external",
            businessName: onboardingData.businessName,
            profileComplete: false,
          })
          .returning();

        account = created;
      } else {
        const [updated] = await db
          .update(vendorAccounts)
          .set({
            businessName: onboardingData.businessName,
            auth0Sub: auth0Sub ?? account.auth0Sub,
          })
          .where(eq(vendorAccounts.id, account.id))
          .returning();

        account = updated;
      }

      const existingProfiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, account.id));

      const address = [
        onboardingData.streetAddress,
        onboardingData.city,
        onboardingData.state,
        onboardingData.zipCode,
      ]
        .filter(Boolean)
        .join(", ");

      const radius = onboardingData.serviceRadiusMiles ?? 25;

      const profilePayload = {
        accountId: account.id,
        serviceType: onboardingData.vendorType,
        experience: 0,
        qualifications: [] as string[],
        onlineProfiles: {
          businessPhone: onboardingData.businessPhone,
          businessEmail: onboardingData.businessEmail,
          state: onboardingData.state,
          zipCode: onboardingData.zipCode,

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
        serviceRadius: radius,
        serviceAddress: address,
        photos: [],
        serviceDescription: onboardingData.aboutBusiness?.trim() || "",
      };

      let profile;
      if (existingProfiles.length > 0) {
        const current = existingProfiles[0];
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

      await db.update(vendorAccounts).set({ profileComplete: true }).where(eq(vendorAccounts.id, account.id));

      const isUpgrade = Boolean(customerAuth || vendorAuth);

      return res.json({
        vendorAccountId: account.id,
        profileId: profile.id,
        isUpgrade,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  // Create vendor profile (protected route, steps 1-6 of onboarding)
  const createVendorProfileSchema = insertVendorProfileSchema
    .omit({ accountId: true })
    .extend({
      serviceType: z.enum(ENABLED_VENDOR_TYPES, {
        errorMap: () => ({ message: "Select a valid vendor type" }),
      }),
      serviceRadius: z.number().optional(),
      serviceAddress: z.string().optional(),
      onlineProfiles: z.any().optional(),
    })
    .refine(
      (data) => {
        if (data.travelMode === "travel-to-guests") {
          return data.serviceRadius !== undefined && data.serviceRadius > 0;
        }
        return true;
      },
      {
        message: "Service radius is required when you travel to guests",
        path: ["serviceRadius"],
      }
    )
    .refine(
      (data) => {
        if (data.travelMode === "guests-come-to-me") {
          return data.serviceAddress !== undefined && data.serviceAddress.length > 0;
        }
        return true;
      },
      {
        message: "Service address is required when guests come to you",
        path: ["serviceAddress"],
      }
    );

  /**
   * POST /api/vendor/profile ✅ Auth0-only
   */
  app.post("/api/vendor/profile", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const accounts = await db.select().from(vendorAccounts).where(eq(vendorAccounts.id, vendorAuth.id));
      if (accounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const account = accounts[0];

      const existingProfiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, account.id));
      if (existingProfiles.length > 0) {
        return res.status(409).json({
          error: "Profile already exists. Use PUT/PATCH to update existing profile.",
        });
      }

      const validatedData = createVendorProfileSchema.parse(req.body);

      const profileData = {
        ...validatedData,
        accountId: account.id,
      };

      const [profile] = await db.insert(vendorProfiles).values(profileData).returning();

      res.json({
        account: {
          id: account.id,
          email: account.email,
          businessName: account.businessName,
          stripeConnectId: account.stripeConnectId,
          stripeAccountType: account.stripeAccountType,
          stripeOnboardingComplete: account.stripeOnboardingComplete,          profileComplete: true,
          profileId: profile.id,
        },
        profile,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

    /**
   * GET /api/vendor/profile ✅ Auth0-only
   * Returns the current vendor's profile (created during onboarding)
   */
  app.get("/api/vendor/profile", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const profiles = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, vendorAuth.id));

      if (profiles.length === 0) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      return res.json(profiles[0]);
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
      const vendorAuth = (req as any).vendorAuth;

      const profiles = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, vendorAuth.id));

      if (profiles.length === 0) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      const existing = profiles[0];

      // Allow partial updates, but validate against the schema by merging
      const merged = { ...existing, ...req.body };
      const validated = createVendorProfileSchema.parse(merged);

      const [updated] = await db
        .update(vendorProfiles)
        .set({
          ...validated,
          accountId: existing.accountId, // never change
        })
        .where(eq(vendorProfiles.id, existing.id))
        .returning();

      return res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  // Vendor Listings Routes (already Auth0 dual middleware and working)
  app.post("/api/vendor/listings", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const listingData = req.body?.listingData;

      console.log("POST /api/vendor/listings body keys:", Object.keys(req.body ?? {}));
      console.log("POST /api/vendor/listings req.body.status:", (req.body as any)?.status);

      if (!listingData || typeof listingData !== "object") {
        return res.status(400).json({ error: "listingData must be a JSON object." });
      }

      const profiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, vendorAuth.id));

      if (profiles.length === 0) {
        return res.status(400).json({
          error: "Vendor profile required before creating a listing. Complete onboarding first.",
        });
      }

      const profile = profiles[0];
      const vendorType = profile.serviceType;
      const seededListingData = {
        ...listingData,

        // Service area mode (listing-owned)
        serviceAreaMode: listingData?.serviceAreaMode ?? "radius",

        // Radius: listing → legacy field → default
        serviceRadiusMiles:
          listingData?.serviceRadiusMiles ??
          listingData?.serviceRadius ??
          25,

        // Location MUST come from listing UI (map picker)
        // Do NOT infer lat/lng from vendor profile
        serviceLocation: listingData?.serviceLocation ?? null,
        serviceCenter: listingData?.serviceCenter ?? null,
      };

      const safeVendorType =
        typeof vendorType === "string" && vendorType.trim() ? vendorType.trim() : "vendor";
      const defaultTitleType = formatVendorTypeForDraftTitle(safeVendorType);

      const title =
        (typeof listingData.title === "string" && listingData.title.trim()) || `New ${defaultTitleType} listing`;
        const [listing] = await db
          .insert(vendorListings)
          .values({
            accountId: vendorAuth.id,
            profileId: profile.id,
            status: "draft",
            title,
            listingData: seededListingData,
          })
          .returning();

        console.log("CREATED listing id=", listing.id, "status=", listing.status);

      return res.status(201).json(listing);
    } catch (error: any) {
      console.error("POST /api/vendor/listings failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  app.patch("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      console.log("PATCH ROUTE MARKER v2", new Date().toISOString());
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id } = req.params;
      const { listingData, status, title } = req.body;
      console.log("PATCH /api/vendor/listings/:id req.body.status:", status);

      const existingListings = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existingListings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }
      console.log("PATCH listing status BEFORE:", existingListings[0]?.status, "id=", id);

      const profiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, vendorAuth.id));

      if (profiles.length === 0) {
        return res.status(400).json({ error: "Vendor profile required" });
      }

      const normalizedStatus =
        status === "active" ? "active" :
        status === "inactive" ? "inactive" :
        status === "draft" ? "draft" :
        undefined;

      const updatePayload: any = {
        updatedAt: new Date(),
      };

      // Only overwrite fields if they were sent
      if (listingData !== undefined) updatePayload.listingData = listingData;

      if (typeof title === "string" && title.trim()) {
        updatePayload.title = title.trim();
      }

      const [updated] = await db
        .update(vendorListings)
        .set(updatePayload)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();
      
      console.log("PATCH listing status AFTER:", updated?.status, "id=", id);

      return res.json(updated);
    } catch (error: any) {
      console.error("PATCH /api/vendor/listings/:id failed:", error);
      return res.status(500).json({
        error: error?.message ?? "Unknown error",
        stack: error?.stack,
      });
    }
  });

  app.patch("/api/vendor/listings/:id/publish", requireDualAuthAuth0, async (req, res) => {
    try {

      console.log("PUBLISH called id=", req.params.id);

      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const ld: any = existing[0]?.listingData || {};

      // ---- Publish validation (hard requirements) ----
      const mode = String(ld.serviceAreaMode || "").trim(); // radius | nationwide | global
      const loc = ld.serviceLocation;

      const hasLoc =
        loc &&
        typeof loc === "object" &&
        typeof loc.label === "string" &&
        Number.isFinite(Number(loc.lat)) &&
        Number.isFinite(Number(loc.lng)) &&
        typeof loc.country === "string" &&
        loc.country.trim().length > 0;

      const titleOk =
        typeof ld.listingTitle === "string" && ld.listingTitle.trim().length >= 2;

      const descOk =
        typeof ld.listingDescription === "string" && ld.listingDescription.trim().length >= 10;

      const photosOk =
        Array.isArray(ld?.photos?.names) && ld.photos.names.length > 0;
      const priceOk = hasValidListingPrice(ld);

      // service area checks
      const modeOk = mode === "radius" || mode === "nationwide" || mode === "global";

      const center = ld.serviceCenter;
      const hasCenter =
        center &&
        typeof center === "object" &&
        Number.isFinite(Number(center.lat)) &&
        Number.isFinite(Number(center.lng));

      const radiusMiles = ld.serviceRadiusMiles ?? ld.serviceRadius ?? null;
      const radiusOk =
        mode !== "radius" ? true : Number.isFinite(Number(radiusMiles)) && Number(radiusMiles) > 0;

      if (!modeOk || !hasLoc || !titleOk || !descOk || !photosOk || !priceOk || !radiusOk || (mode === "radius" && !hasCenter)) {
        return res.status(400).json({
          error: "Listing incomplete — cannot publish",
          missing: {
            serviceAreaMode: !modeOk,
            serviceLocation: !hasLoc,
            listingTitle: !titleOk,
            listingDescription: !descOk,
            photos: !photosOk,
            price: !priceOk,
            serviceCenter: mode === "radius" ? !hasCenter : false,
            serviceRadiusMiles: mode === "radius" ? !radiusOk : false,
          },
        });
      }
      const [updated] = await db
        .update(vendorListings)
        .set({
          status: "active",
          updatedAt: new Date(),
        })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      return res.json(updated);
    } catch (error: any) {
      console.error("PATCH /api/vendor/listings/:id/publish failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

    app.patch("/api/vendor/listings/:id/unpublish", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const [updated] = await db
        .update(vendorListings)
        .set({
          status: "inactive",
          updatedAt: new Date(),
        })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      return res.json(updated);
    } catch (error: any) {
      console.error("PATCH /api/vendor/listings/:id/unpublish failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  app.get("/api/rental-types", async (_req, res) => {
    const rows = await db
      .select({ slug: rentalTypes.slug, label: rentalTypes.label })
      .from(rentalTypes)
      .where(eq(rentalTypes.isActive, true));

    return res.json(rows);
  });

  // Public Listings (guest browsing)
  // Returns only active listings. No auth.
  app.get("/api/listings/public", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      await deactivateActiveListingsWithoutValidPrice();
      const listings = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          listingData: vendorListings.listingData,

          serviceType: vendorProfiles.serviceType,
          city: vendorProfiles.city,
          vendorId: vendorAccounts.id,
          vendorName: vendorAccounts.businessName,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
        .where(eq(vendorListings.status, "active"));
      const pricedListings = listings.filter((listing) => hasValidListingPrice((listing as any)?.listingData));
      return res.json(pricedListings);
    } catch (error: any) {
      console.error("GET /api/listings/public failed:", error);
      return res.status(500).json({
        error: error?.message ?? "Unknown error",
        stack: error?.stack,
      });
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
          title: vendorListings.title,
          listingData: vendorListings.listingData,

          serviceType: vendorProfiles.serviceType,
          city: vendorProfiles.city,
          vendorId: vendorAccounts.id,
          vendorName: vendorAccounts.businessName,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
        .where(and(eq(vendorListings.status, "active"), eq(vendorListings.id, id)))
        .limit(1);

      const listing = rows[0];
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
      console.error("GET /api/listings/public/:id failed:", error);
      return res.status(500).json({
        error: error?.message ?? "Unknown error",
        stack: error?.stack,
      });
    }
  });

  app.get("/api/vendor/listings", requireDualAuthAuth0, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      await deactivateActiveListingsWithoutValidPrice(vendorAuth.id);
      const { status } = req.query;

      // Map UI bucket names to DB status values
      const normalizedStatus =
        status === "active" ? "active" :
        status === "inactive" ? "inactive" :
        status === "draft" ? "draft" :
        undefined;

      const whereClause = normalizedStatus
        ? and(eq(vendorListings.accountId, vendorAuth.id), eq(vendorListings.status, normalizedStatus))
        : eq(vendorListings.accountId, vendorAuth.id);

      const listings = await db.select().from(vendorListings).where(whereClause);

      console.log(
        "[GET /api/vendor/listings] accountId=",
        vendorAuth.id,
        "status=",
        status,
        "count=",
        listings.length
      );

      res.json(listings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id } = req.params;

      const listings = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (listings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      res.json(listings[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      await db
        .delete(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
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
      const vendorAuth = (req as any).vendorAuth;

      const account = await storage.getVendorAccount(vendorAuth.id);
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

      await storage.updateVendorAccount(account.id, {
        stripeConnectId: result.accountId,
        stripeAccountType: accountType,
      });

      res.json({
        accountId: result.accountId,
        onboardingUrl: result.onboardingUrl,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/connect/status", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account || !account.stripeConnectId) {
        return res.json({ connected: false });
      }

      const { checkAccountOnboardingStatus } = await import("./stripe");
      const status = await checkAccountOnboardingStatus(account.stripeConnectId);

      if (status.complete && !account.stripeOnboardingComplete) {
        await storage.updateVendorAccount(account.id, {
          stripeOnboardingComplete: true,
        });
      }

      res.json({
        connected: true,
        complete: status.complete,
        detailsSubmitted: status.detailsSubmitted,
        chargesEnabled: status.chargesEnabled,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/connect/dashboard", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account || !account.stripeConnectId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }

      const { createDashboardLoginLink } = await import("./stripe");
      const url = await createDashboardLoginLink(account.stripeConnectId);

      res.json({ url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

      const normalizeAmountToCents = (value: unknown) => {
        const n = Number(value ?? 0);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return n % 100 === 0 ? n : n * 100;
      };

      const vendorRefCol = await getBookingsVendorRefColumn();

      let bookingRows: Array<{
        id: string;
        status: string | null;
        totalAmount: number | null;
        createdAt: Date | string | null;
        eventDate: string | null;
        eventLocation: string | null;
      }> = [];

      if (vendorRefCol === "vendor_account_id") {
        const rows = await db
          .select({
            id: bookings.id,
            status: bookings.status,
            totalAmount: bookings.totalAmount,
            createdAt: bookings.createdAt,
            eventDate: bookings.eventDate,
            eventLocation: bookings.eventLocation,
          })
          .from(bookings)
          .where(eq(bookings.vendorAccountId, vendorAccountId))
          .orderBy(desc(bookings.createdAt));
        bookingRows = rows as typeof bookingRows;
      } else if (vendorRefCol === "vendor_id") {
        const rows: any = await db.execute(drizzleSql`
          select
            b.id,
            b.status,
            b.total_amount as "totalAmount",
            b.created_at as "createdAt",
            b.event_date as "eventDate",
            b.event_location as "eventLocation"
          from bookings b
          where b.vendor_id = ${vendorAccountId}
          order by b.created_at desc
        `);
        bookingRows = extractRows(rows);
      } else {
        const rows: any = await db.execute(drizzleSql`
          select distinct on (b.id)
            b.id,
            b.status,
            b.total_amount as "totalAmount",
            b.created_at as "createdAt",
            b.event_date as "eventDate",
            b.event_location as "eventLocation"
          from bookings b
          inner join booking_items bi on bi.booking_id = b.id
          inner join vendor_listings vl on vl.id = bi.listing_id
          where vl.account_id = ${vendorAccountId}
          order by b.id, b.created_at desc
        `);
        bookingRows = extractRows(rows);
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(weekStart.getDate() - 7);

      const totalBookings = bookingRows.length;
      const bookingsThisMonth = bookingRows.filter((r) => {
        const created = r.createdAt ? new Date(r.createdAt) : null;
        return created instanceof Date && !isNaN(created.getTime()) && created >= monthStart;
      }).length;

      const revenueRows = bookingRows.filter((r) => {
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

      const recentBookings = bookingRows
        .slice()
        .sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dbt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dbt - da;
        })
        .slice(0, 6)
        .map((r) => ({
          id: r.id,
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
      res.status(500).json({ error: error.message });
    }
  });

  async function attachBookingItemContext<T extends { id: string; specialRequests?: string | null; eventTitle?: string | null }>(rows: T[]) {
    if (!Array.isArray(rows) || rows.length === 0) return rows as Array<T & {
      itemTitle?: string | null;
      customerNotes?: string | null;
      customerQuestions?: string | null;
    }>;

    return Promise.all(
      rows.map(async (row) => {
        const itemRes: any = await db.execute(drizzleSql`
          select bi.title, bi.item_data as "itemData"
          from booking_items bi
          where bi.booking_id = ${row.id}
          limit 1
        `);
        const [item] = extractRows<{ title?: string | null; itemData?: any }>(itemRes);
        const itemData = item?.itemData && typeof item.itemData === "object" ? item.itemData : {};

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

        return {
          ...row,
          itemTitle: item?.title ?? null,
          customerEventTitle: customerEventTitleFromItem ?? row.eventTitle ?? null,
          customerNotes: notesFromItem ?? notesFallback,
          customerQuestions: questionsFromItem,
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

      const vendorRefCol = await getBookingsVendorRefColumn();

      if (vendorRefCol === "vendor_account_id") {
        const rows = await db
          .select({
            id: bookings.id,
            status: bookings.status,
            paymentStatus: bookings.paymentStatus,
            totalAmount: bookings.totalAmount,
            platformFee: bookings.platformFee,
            vendorPayout: bookings.vendorPayout,
            createdAt: bookings.createdAt,
            updatedAt: bookings.updatedAt,
            eventId: bookings.eventId,
            eventTitle: events.path,
            eventLocation: bookings.eventLocation,
            guestCount: bookings.guestCount,
            specialRequests: bookings.specialRequests,
            eventDate: drizzleSql<string>`coalesce(${bookings.eventDate}, ${events.date})`.as("eventDate"),
            eventStartTime: drizzleSql<string>`coalesce(${bookings.eventStartTime}, ${events.startTime})`.as("eventStartTime"),
          })
          .from(bookings)
          .leftJoin(events, eq(events.id, bookings.eventId))
          .where(eq(bookings.vendorAccountId, vendorAccountId))
          .orderBy(desc(bookings.createdAt));

        return res.json(await attachBookingItemContext(rows as any));
      }

      if (vendorRefCol === "vendor_id") {
        const fallback: any = await db.execute(drizzleSql`
          select
            b.id,
            b.status,
            b.payment_status as "paymentStatus",
            b.total_amount as "totalAmount",
            b.platform_fee as "platformFee",
            b.vendor_payout as "vendorPayout",
            b.created_at as "createdAt",
            b.updated_at as "updatedAt",
            b.event_id as "eventId",
            e.path as "eventTitle",
            b.event_location as "eventLocation",
            b.guest_count as "guestCount",
            b.special_requests as "specialRequests",
            coalesce(b.event_date, e.date) as "eventDate",
            coalesce(b.event_start_time, e.start_time) as "eventStartTime"
          from bookings b
          left join events e on e.id = b.event_id
          where b.vendor_id = ${vendorAccountId}
          order by b.created_at desc
        `);
        return res.json(await attachBookingItemContext(extractRows(fallback) as any));
      }

      // Legacy schema without vendor reference on bookings: derive ownership through booking_items -> vendor_listings.
      const legacyRows: any = await db.execute(drizzleSql`
        select distinct on (b.id)
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.platform_fee as "platformFee",
          b.vendor_payout as "vendorPayout",
          b.created_at as "createdAt",
          b.updated_at as "updatedAt",
          b.event_id as "eventId",
          e.path as "eventTitle",
          b.event_location as "eventLocation",
          b.guest_count as "guestCount",
          b.special_requests as "specialRequests",
          coalesce(b.event_date, e.date) as "eventDate",
          coalesce(b.event_start_time, e.start_time) as "eventStartTime"
        from bookings b
        left join events e on e.id = b.event_id
        inner join booking_items bi on bi.booking_id = b.id
        inner join vendor_listings vl on vl.id = bi.listing_id
        where vl.account_id = ${vendorAccountId}
        order by b.id, b.created_at desc
      `);
      return res.json(await attachBookingItemContext(extractRows(legacyRows) as any));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/vendor/bookings/:id", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const bookingId = String(req.params.id || "").trim();
      if (!bookingId) {
        return res.status(400).json({ error: "Booking id is required" });
      }

      const updateVendorBookingSchema = z.object({
        status: z.enum(["confirmed", "completed", "cancelled"]),
      });
      const { status: nextStatus } = updateVendorBookingSchema.parse(req.body ?? {});

      const vendorRefCol = await getBookingsVendorRefColumn();

      let ownedBookingRows: Array<{ id: string; status: string | null; eventDate: string | null }> = [];
      if (vendorRefCol === "vendor_account_id") {
        const rows = await db
          .select({
            id: bookings.id,
            status: bookings.status,
            eventDate: drizzleSql<string>`coalesce(${bookings.eventDate}, ${events.date})`.as("eventDate"),
          })
          .from(bookings)
          .leftJoin(events, eq(events.id, bookings.eventId))
          .where(and(eq(bookings.id, bookingId), eq(bookings.vendorAccountId, vendorAccountId)))
          .limit(1);
        ownedBookingRows = rows as Array<{ id: string; status: string | null; eventDate: string | null }>;
      } else if (vendorRefCol === "vendor_id") {
        const rows: any = await db.execute(drizzleSql`
          select
            b.id,
            b.status,
            coalesce(b.event_date, e.date) as "eventDate"
          from bookings b
          left join events e on e.id = b.event_id
          where b.id = ${bookingId} and b.vendor_id = ${vendorAccountId}
          limit 1
        `);
        ownedBookingRows = extractRows(rows);
      } else {
        const rows: any = await db.execute(drizzleSql`
          select distinct
            b.id,
            b.status,
            coalesce(b.event_date, e.date) as "eventDate"
          from bookings b
          left join events e on e.id = b.event_id
          inner join booking_items bi on bi.booking_id = b.id
          inner join vendor_listings vl on vl.id = bi.listing_id
          where b.id = ${bookingId}
            and vl.account_id = ${vendorAccountId}
          limit 1
        `);
        ownedBookingRows = extractRows(rows);
      }

      const current = ownedBookingRows[0];
      if (!current?.id) {
        return res.status(404).json({ error: "Booking not found for this vendor" });
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
      let updatedRows: Array<{ id: string; status: string; updatedAt: string | Date }> = [];
      if (vendorRefCol === "vendor_account_id") {
        const rows = await db
          .update(bookings)
          .set({
            status: nextStatus,
            updatedAt: now,
            confirmedAt: nextStatus === "confirmed" ? now : bookings.confirmedAt,
            completedAt: nextStatus === "completed" ? now : bookings.completedAt,
            cancelledAt: nextStatus === "cancelled" ? now : bookings.cancelledAt,
          })
          .where(and(eq(bookings.id, bookingId), eq(bookings.vendorAccountId, vendorAccountId)))
          .returning({
            id: bookings.id,
            status: bookings.status,
            updatedAt: bookings.updatedAt,
          });
        updatedRows = rows as Array<{ id: string; status: string; updatedAt: string | Date }>;
      } else if (vendorRefCol === "vendor_id") {
        const rows: any = await db.execute(drizzleSql`
          update bookings b
          set status = ${nextStatus},
              updated_at = ${now},
              confirmed_at = case when ${nextStatus} = 'confirmed' then ${now} else b.confirmed_at end,
              completed_at = case when ${nextStatus} = 'completed' then ${now} else b.completed_at end,
              cancelled_at = case when ${nextStatus} = 'cancelled' then ${now} else b.cancelled_at end
          where b.id = ${bookingId}
            and b.vendor_id = ${vendorAccountId}
          returning b.id, b.status, b.updated_at as "updatedAt"
        `);
        updatedRows = extractRows(rows);
      } else {
        const rows: any = await db.execute(drizzleSql`
          update bookings b
          set status = ${nextStatus},
              updated_at = ${now},
              confirmed_at = case when ${nextStatus} = 'confirmed' then ${now} else b.confirmed_at end,
              completed_at = case when ${nextStatus} = 'completed' then ${now} else b.completed_at end,
              cancelled_at = case when ${nextStatus} = 'cancelled' then ${now} else b.cancelled_at end
          where b.id = ${bookingId}
            and exists (
              select 1
              from booking_items bi
              inner join vendor_listings vl on vl.id = bi.listing_id
              where bi.booking_id = b.id
                and vl.account_id = ${vendorAccountId}
            )
          returning b.id, b.status, b.updated_at as "updatedAt"
        `);
        updatedRows = extractRows(rows);
      }

      const updated = updatedRows[0];
      if (!updated?.id) {
        return res.status(500).json({ error: "Failed to update booking status" });
      }

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
        (row) => row.bookingId.length > 0 && hasPaymentMethodForChat(row.paymentMethodId)
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
      return res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/messages/conversations", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json([]);

      const rows = await listVendorBookingChatContexts(vendorAccountId);
      const paidRows = rows.filter(
        (row) => row.bookingId.length > 0 && hasPaymentMethodForChat(row.paymentMethodId)
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
      return res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/messages/unread-count", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const vendorAccountId = vendorAuth?.id as string | undefined;
      if (!vendorAccountId) return res.json({ unreadCount: 0 });

      const rows = await listVendorBookingChatContexts(vendorAccountId);
      const paidBookingIds = rows
        .filter((row) => row.bookingId.length > 0 && hasPaymentMethodForChat(row.paymentMethodId))
        .map((row) => row.bookingId);
      const unread = await getStreamUnreadCountsForBookings({
        role: "vendor",
        appUserId: vendorAccountId,
        bookingIds: paidBookingIds,
      });
      return res.json({ unreadCount: unread.totalUnread });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
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
      if (!hasPaymentMethodForChat(booking.paymentMethodId)) {
        return res.status(403).json({ error: "Chat becomes available after payment info is collected" });
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
      return res.status(500).json({ error: error.message });
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
        (row) => row.bookingId.length > 0 && hasPaymentMethodForChat(row.paymentMethodId)
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
      return res.status(500).json({ error: error.message });
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
        .filter((row) => row.bookingId.length > 0 && hasPaymentMethodForChat(row.paymentMethodId))
        .map((row) => row.bookingId);
      const unread = await getStreamUnreadCountsForBookings({
        role: "customer",
        appUserId: customerAuth.id,
        bookingIds: paidBookingIds,
      });
      return res.json({ unreadCount: unread.totalUnread });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
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
      if (!hasPaymentMethodForChat(booking.paymentMethodId)) {
        return res.status(403).json({ error: "Chat becomes available after payment info is collected" });
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
      return res.status(500).json({ error: error.message });
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

      const normalizeAmountToCents = (value: unknown) => {
        const n = Number(value ?? 0);
        if (!Number.isFinite(n) || n <= 0) return 0;
        // Booking totals are stored as either cents (int) or legacy dollars (int/float).
        // Heuristic: amounts >= 10,000 are almost certainly cents for this MVP range.
        if (Number.isInteger(n) && n >= 10_000) return n;
        return Math.round(n * 100);
      };

      const vendorRefCol = await getBookingsVendorRefColumn();
      let rows: Array<{
        id: string;
        status: string | null;
        totalAmount: number | null;
        vendorPayout: number | null;
        eventDate: string | null;
        createdAt: Date | string | null;
      }> = [];

      if (vendorRefCol === "vendor_account_id") {
        const bookingRows = await db
          .select({
            id: bookings.id,
            status: bookings.status,
            totalAmount: bookings.totalAmount,
            vendorPayout: bookings.vendorPayout,
            eventDate: drizzleSql<string>`coalesce(${bookings.eventDate}, ${events.date})`.as("eventDate"),
            createdAt: bookings.createdAt,
          })
          .from(bookings)
          .leftJoin(events, eq(events.id, bookings.eventId))
          .where(eq(bookings.vendorAccountId, vendorAccountId))
          .orderBy(desc(bookings.createdAt));
        rows = bookingRows as typeof rows;
      } else if (vendorRefCol === "vendor_id") {
        const bookingRows: any = await db.execute(drizzleSql`
          select
            b.id,
            b.status,
            b.total_amount as "totalAmount",
            b.vendor_payout as "vendorPayout",
            b.event_date as "eventDate",
            b.created_at as "createdAt"
          from bookings b
          left join events e on e.id = b.event_id
          where b.vendor_id = ${vendorAccountId}
          order by b.created_at desc
        `);
        rows = extractRows(bookingRows);
      } else {
        const bookingRows: any = await db.execute(drizzleSql`
          select distinct on (b.id)
            b.id,
            b.status,
            b.total_amount as "totalAmount",
            b.vendor_payout as "vendorPayout",
            b.event_date as "eventDate",
            b.created_at as "createdAt"
          from bookings b
          inner join booking_items bi on bi.booking_id = b.id
          inner join vendor_listings vl on vl.id = bi.listing_id
          where vl.account_id = ${vendorAccountId}
          order by b.id, b.created_at desc
        `);
        rows = extractRows(bookingRows);
      }

      // Safety fallback: some environments have mixed/legacy booking ownership wiring.
      // If primary ownership path yields no rows, try legacy booking_items -> vendor_listings join.
      if (rows.length === 0) {
        const legacyRows: any = await db.execute(drizzleSql`
          select distinct on (b.id)
            b.id,
            b.status,
            b.total_amount as "totalAmount",
            b.vendor_payout as "vendorPayout",
            coalesce(b.event_date, e.date) as "eventDate",
            b.created_at as "createdAt"
          from bookings b
          left join events e on e.id = b.event_id
          inner join booking_items bi on bi.booking_id = b.id
          inner join vendor_listings vl on vl.id = bi.listing_id
          where vl.account_id = ${vendorAccountId}
          order by b.id, b.created_at desc
        `);
        rows = extractRows(legacyRows);
      }

      const baseAmountByBookingId = new Map<string, number>();
      for (const row of rows) {
        const grossCents = normalizeAmountToCents(row.totalAmount);
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
      const toNetCents = (r: { id: string }) => {
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
          if (s !== "confirmed") return false;
          if (!r.eventDate) return false;
          const d = new Date(`${r.eventDate}T00:00:00`);
          return !isNaN(d.getTime()) && d >= today;
        })
        .reduce((sum, r) => sum + toNetCents(r), 0);

      const history = rows.map((r) => {
        const baseAmountCents = baseAmountByBookingId.get(r.id) ?? normalizeAmountToCents(r.totalAmount);
        const grossCents = baseAmountCents + Math.round(baseAmountCents * CUSTOMER_FEE_RATE);
        const netCents = toNetCents(r);
        return {
          id: r.id,
          status: String(r.status || "pending").toLowerCase(),
          eventDate: r.eventDate,
          createdAt: r.createdAt,
          netAmount: netCents,
          grossAmount: grossCents,
        };
      });

      return res.json({
        totalNetEarned,
        upcomingNetPayout,
        history,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/notifications", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account?.id) {
        return res.json([]);
      }

      const notifications = await storage.getNotificationsByRecipient(
        account.id,
        "vendor"
      );

      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch(
    "/api/vendor/notifications/:id/read",
    ...requireVendorAuth0,
    async (req, res) => {
      try {
        const { id } = req.params;

        await storage.markNotificationAsRead(id);

        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  app.get("/api/vendor/reviews", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account?.id) {
        return res.json([]);
      }

      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/vendor/reviews/:id/reply", ...requireVendorAuth0, async (req, res) => {
    try {
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Customer-facing routes (existing)
  app.post("/api/events", async (req, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      const event = await storage.createEvent(validatedData);
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getAllEvents();
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
          listingData: vendorListings.listingData,
          vendorProfileId: vendorListings.profileId,
          vendorAccountId: vendorListings.accountId,
        })
        .from(vendorListings)
        .where(eq(vendorListings.status, "active"))
        .limit(50);

      res.json(listings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  async function attachCustomerBookingContext<
    T extends {
      id: string;
      eventId?: string | null;
      eventTitle?: string | null;
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
        const itemTitleFromItem =
          typeof item?.title === "string" && item.title.trim().length > 0
            ? item.title.trim()
            : null;
        const itemTitleFromJson =
          typeof itemData?.listingTitle === "string" && itemData.listingTitle.trim().length > 0
            ? itemData.listingTitle.trim()
            : typeof itemData?.listingSnapshot?.title === "string" && itemData.listingSnapshot.title.trim().length > 0
              ? itemData.listingSnapshot.title.trim()
              : null;
        const itemTitleFromListing =
          typeof item?.listingTitle === "string" && item.listingTitle.trim().length > 0
            ? item.listingTitle.trim()
            : null;
        const itemTitle = itemTitleFromItem ?? itemTitleFromJson ?? itemTitleFromListing ?? null;
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
          row.vendorBusinessName ||
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
          listingId: item?.listingId ?? null,
          itemTitle,
          displayTitle,
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

      const vendorRefCol = await getBookingsVendorRefColumn();

      if (vendorRefCol === "vendor_account_id") {
        const rows = await db
          .select({
            id: bookings.id,
            status: bookings.status,
            paymentStatus: bookings.paymentStatus,
            totalAmount: bookings.totalAmount,
            eventId: bookings.eventId,
            eventTitle: events.path,
            eventDate: bookings.eventDate,
            eventStartTime: bookings.eventStartTime,
            eventLocation: bookings.eventLocation,
            createdAt: bookings.createdAt,
            vendorBusinessName: vendorAccounts.businessName,
          })
          .from(bookings)
          .leftJoin(vendorAccounts, eq(vendorAccounts.id, bookings.vendorAccountId))
          .leftJoin(events, eq(events.id, bookings.eventId))
          .where(eq(bookings.customerId, customerAuth.id))
          .orderBy(desc(bookings.createdAt));
        return res.json(await attachCustomerBookingContext(rows as any));
      }

      if (vendorRefCol === "vendor_id") {
        const fallback: any = await db.execute(drizzleSql`
          select
            b.id,
            b.status,
            b.payment_status as "paymentStatus",
            b.total_amount as "totalAmount",
            b.event_id as "eventId",
            e.path as "eventTitle",
            b.event_date as "eventDate",
            b.event_start_time as "eventStartTime",
            b.event_location as "eventLocation",
            b.created_at as "createdAt",
            va.business_name as "vendorBusinessName"
          from bookings b
          left join vendor_accounts va on va.id = b.vendor_id
          left join events e on e.id = b.event_id
          where b.customer_id = ${customerAuth.id}
          order by b.created_at desc
        `);
        return res.json(await attachCustomerBookingContext(extractRows(fallback) as any));
      }

      const legacyRows: any = await db.execute(drizzleSql`
        select distinct on (b.id)
          b.id,
          b.status,
          b.payment_status as "paymentStatus",
          b.total_amount as "totalAmount",
          b.event_id as "eventId",
          e.path as "eventTitle",
          b.event_date as "eventDate",
          b.event_start_time as "eventStartTime",
          b.event_location as "eventLocation",
          b.created_at as "createdAt",
          va.business_name as "vendorBusinessName"
        from bookings b
        left join booking_items bi on bi.booking_id = b.id
        left join vendor_listings vl on vl.id = bi.listing_id
        left join vendor_accounts va on va.id = vl.account_id
        left join events e on e.id = b.event_id
        where b.customer_id = ${customerAuth.id}
        order by b.id, b.created_at desc
      `);
      return res.json(await attachCustomerBookingContext(extractRows(legacyRows) as any));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
      return res.status(status).json({ error: error.message });
    }
  });

  const createBookingSchema = z.object({
    vendorId: z.string().optional(),
    listingId: z.string(),
    paymentMethodId: z.string().regex(/^pm_/, "Invalid Stripe payment method"),
    customerEventId: z.string().optional(),
    customerEventTitle: z.string().max(160).optional(),
    eventId: z.string().optional(),
    packageId: z.string().optional(),
    addOnIds: z.array(z.string()).optional(),
    eventDate: z.string(),
    eventStartTime: z.string().optional(),
    eventLocation: z.string().optional(),
    guestCount: z.number().optional(),
    specialRequests: z.string().optional(),
    customerNotes: z.string().max(2000).optional(),
    customerQuestions: z.string().max(2000).optional(),
    totalAmount: z.number().int().positive(),
    depositAmount: z.number().int().positive(),
    finalPaymentStrategy: z.enum(["immediately", "2_weeks_prior", "day_of_event"]),
  });

  app.post("/api/bookings", requireCustomerAnyAuth, async (req, res) => {
    let stage = "start";
    try {
      stage = "resolve-customer";
      const customerAuth = await resolveCustomerAuthFromRequest(req, { createIfMissing: true });
      if (!customerAuth?.id) {
        return res.status(401).json({ error: "Customer authentication required" });
      }

      stage = "validate-payload";
      const data = createBookingSchema.parse(req.body);
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
          title: vendorListings.title,
          listingData: vendorListings.listingData,
        })
        .from(vendorListings)
        .where(eq(vendorListings.id, data.listingId))
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
        })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, listingRow.accountId))
        .limit(1);

      if (!vendorAccount) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      if (data.vendorId && data.vendorId !== vendorAccount.id) {
        return res.status(400).json({ error: "Listing/vendor mismatch" });
      }

      let resolvedBookingEventId: string | null = data.eventId ?? null;
      let resolvedCustomerEvent: { id: string; title: string } | null = null;
      if (requestedCustomerEventTitle) {
        stage = "create-customer-event";
        const [createdEvent] = await db
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
          resolvedBookingEventId = createdEvent.id;
          resolvedCustomerEvent = {
            id: createdEvent.id,
            title: createdEvent.path || requestedCustomerEventTitle,
          };
        }
      } else if (requestedCustomerEventId) {
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

      const basePriceCents = extractListingBasePriceCents((listingRow.listingData ?? {}) as any);
      if (!basePriceCents || basePriceCents <= 0) {
        return res.status(400).json({ error: "Listing price is not configured" });
      }
      const customerFee = Math.round(basePriceCents * CUSTOMER_FEE_RATE);
      const enforcedTotalAmount = basePriceCents + customerFee;
      const platformFee = Math.round(basePriceCents * VENDOR_FEE_RATE);
      const vendorPayout = basePriceCents - platformFee;
      const enforcedDepositAmount = Math.max(1, Math.round(enforcedTotalAmount * 0.25));
      stage = "detect-bookings-vendor-column";
      const vendorRefCol = await getBookingsVendorRefColumn();
      let booking: any = null;

      if (vendorRefCol === "vendor_account_id") {
        stage = "insert-booking-vendor-account-id";
        const rows = await db
          .insert(bookings)
          .values({
            customerId: customerAuth.id,
            vendorAccountId: vendorAccount.id,
            eventId: resolvedBookingEventId,
            packageId: data.packageId ?? null,
            addOnIds: data.addOnIds ?? [],
            eventDate: data.eventDate,
            eventStartTime: data.eventStartTime ?? null,
            eventLocation: data.eventLocation ?? null,
            guestCount: data.guestCount ?? null,
            specialRequests: data.specialRequests ?? null,
            totalAmount: enforcedTotalAmount,
            platformFee,
            vendorPayout,
            depositAmount: enforcedDepositAmount,
            finalPaymentStrategy: data.finalPaymentStrategy,
            status: "pending",
            paymentStatus: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();
        booking = rows[0];
      } else if (vendorRefCol === "vendor_id") {
        stage = "insert-booking-vendor-id";
        const inserted = await db.execute(drizzleSql`
          insert into bookings (
            customer_id,
            vendor_id,
            event_id,
            package_id,
            event_date,
            event_start_time,
            event_location,
            guest_count,
            special_requests,
            total_amount,
            platform_fee,
            vendor_payout,
            deposit_amount,
            final_payment_strategy,
            status,
            payment_status
          ) values (
            ${customerAuth.id},
            ${vendorAccount.id},
            ${resolvedBookingEventId},
            ${data.packageId ?? null},
            ${data.eventDate},
            ${data.eventStartTime ?? null},
            ${data.eventLocation ?? null},
            ${data.guestCount ?? null},
            ${data.specialRequests ?? null},
            ${enforcedTotalAmount},
            ${platformFee},
            ${vendorPayout},
            ${enforcedDepositAmount},
            ${data.finalPaymentStrategy},
            ${"pending"},
            ${"pending"}
          )
          returning *
        `);
        booking = extractRows(inserted)[0];
      } else {
        stage = "insert-booking-no-vendor-column";
        const inserted = await db.execute(drizzleSql`
          insert into bookings (
            customer_id,
            event_id,
            package_id,
            event_date,
            event_start_time,
            event_location,
            guest_count,
            special_requests,
            total_amount,
            platform_fee,
            vendor_payout,
            deposit_amount,
            final_payment_strategy,
            status,
            payment_status
          ) values (
            ${customerAuth.id},
            ${resolvedBookingEventId},
            ${data.packageId ?? null},
            ${data.eventDate},
            ${data.eventStartTime ?? null},
            ${data.eventLocation ?? null},
            ${data.guestCount ?? null},
            ${data.specialRequests ?? null},
            ${enforcedTotalAmount},
            ${platformFee},
            ${vendorPayout},
            ${enforcedDepositAmount},
            ${data.finalPaymentStrategy},
            ${"pending"},
            ${"pending"}
          )
          returning id
        `);
        booking = extractRows(inserted)[0];
      }

      if (!booking?.id) {
        return res.status(500).json({ error: "Failed to create booking record" });
      }

      const listingDataAny = (listingRow.listingData ?? {}) as any;
      const itemTitle =
        (typeof listingRow.title === "string" && listingRow.title.trim()) ||
        (typeof listingDataAny?.listingTitle === "string" && listingDataAny.listingTitle.trim()) ||
        "Listing";
      const customerNotes =
        typeof data.customerNotes === "string" && data.customerNotes.trim().length > 0
          ? data.customerNotes.trim()
          : null;
      const customerQuestions =
        typeof data.customerQuestions === "string" && data.customerQuestions.trim().length > 0
          ? data.customerQuestions.trim()
          : null;

      stage = "insert-booking-item";
      await db.execute(drizzleSql`
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
          1,
          ${basePriceCents},
          ${basePriceCents},
          ${JSON.stringify({
            listingId: listingRow.id,
            vendorAccountId: vendorAccount.id,
            paymentMethodId: data.paymentMethodId,
            customerEvent: resolvedCustomerEvent,
            customerNotes,
            customerQuestions,
            feePolicy: {
              vendorFeeRate: VENDOR_FEE_RATE,
              customerFeeRate: CUSTOMER_FEE_RATE,
              customerFeeCents: customerFee,
            },
          })}::jsonb
        )
      `);

      stage = "create-notifications";
      await Promise.allSettled([
        storage.createNotification({
          recipientId: vendorAccount.id,
          recipientType: "vendor",
          type: "new_booking",
          title: "New booking request",
          message: `You received a new booking request for ${data.eventDate}.`,
          link: "/vendor/bookings",
          read: false,
        }),
        storage.createNotification({
          recipientId: customerAuth.id,
          recipientType: "customer",
          type: "booking_confirmed",
          title: "Booking request sent",
          message: `Your booking request for ${data.eventDate} was sent.`,
          link: "/dashboard/events",
          read: false,
        }),
      ]);

      stage = "insert-payment-schedule-deposit";
      await db.insert(paymentSchedules).values({
        bookingId: booking.id,
        installmentNumber: 1,
        amount: enforcedDepositAmount,
        dueDate: new Date().toISOString().split("T")[0],
        paymentType: "deposit",
        status: "pending",
      });

      const finalAmount = enforcedTotalAmount - enforcedDepositAmount;
      let finalDueDate: string;

      if (data.finalPaymentStrategy === "immediately") {
        finalDueDate = new Date().toISOString().split("T")[0];
      } else if (data.finalPaymentStrategy === "2_weeks_prior") {
        const eventDate = new Date(data.eventDate);
        const twoWeeksPrior = new Date(eventDate);
        twoWeeksPrior.setDate(twoWeeksPrior.getDate() - 14);
        finalDueDate = twoWeeksPrior.toISOString().split("T")[0];
      } else {
        finalDueDate = data.eventDate;
      }

      stage = "insert-payment-schedule-final";
      await db.insert(paymentSchedules).values({
        bookingId: booking.id,
        installmentNumber: 2,
        amount: finalAmount,
        dueDate: finalDueDate,
        paymentType: "final",
        status: "pending",
      });

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

      res.json(booking);
    } catch (error: any) {
      res.status(400).json({ error: `[${stage}] ${error.message}` });
    }
  });

  app.post("/api/bookings/:bookingId/payments/:scheduleId", async (req, res) => {
    try {
      const { bookingId, scheduleId } = req.params;

      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const schedule = (await storage.getPaymentSchedulesByBooking(bookingId)).find((s) => s.id === scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Payment schedule not found" });
      }

      if (!booking.vendorAccountId) {
        return res.status(400).json({ message: "Booking is missing vendorAccountId" });
      }

      const vendorAccount = await storage.getVendorAccountById(booking.vendorAccountId);
      if (!vendorAccount || !vendorAccount.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
        return res.status(400).json({ error: "Vendor payment processing not set up" });
      }

      const { createBookingPaymentIntent } = await import("./stripe");
      const paymentIntent = await createBookingPaymentIntent({
        amount: schedule.amount,
        platformFeePercent: VENDOR_FEE_RATE * 100,
        vendorStripeAccountId: vendorAccount.stripeConnectId,
        description: `Booking ${booking.id} - ${schedule.paymentType}`,
      });

      await storage.updatePaymentSchedule(scheduleId, {
        stripePaymentIntentId: paymentIntent.id,
      });

      const platformFee = Math.round(schedule.amount * VENDOR_FEE_RATE);
      await storage.createPayment({
        bookingId: booking.id,
        scheduleId: schedule.id,
        customerId: booking.customerId,
        vendorAccountId: booking.vendorAccountId,
        stripePaymentIntentId: paymentIntent.id,
        amount: schedule.amount,
        platformFee,
        vendorPayout: schedule.amount - platformFee,
        paymentType: schedule.paymentType,
        status: "pending",
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      const event = req.body;

      if (event.type === "payment_intent.succeeded") {
        res.json({ received: true });
      } else {
        res.json({ received: true });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bookings/:bookingId/refund", async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { reason } = req.body;

      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (booking.depositPaidAt) {
        const hoursSinceDeposit = (Date.now() - booking.depositPaidAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceDeposit > 48) {
          return res.status(400).json({ error: "Refund period has expired (48 hours)" });
        }
      }

      const payments = await storage.getPaymentsByBooking(bookingId);
      const depositPayment = payments.find((p) => p.paymentType === "deposit" && p.status === "paid");

      if (!depositPayment) {
        return res.status(400).json({ error: "No deposit payment found" });
      }

      const { refundBookingPayment } = await import("./stripe");
      const refund = await refundBookingPayment({
        paymentIntentId: depositPayment.stripePaymentIntentId,
        reason: reason || "requested_by_customer",
      });

      await storage.updatePayment(depositPayment.id, {
        status: "refunded",
        refundAmount: depositPayment.amount,
        refundReason: reason,
        refundedAt: new Date(),
      });

      await storage.updateBooking(bookingId, {
        status: "cancelled",
        paymentStatus: "refunded",
        cancellationReason: reason,
        cancelledAt: new Date(),
      });

      res.json({ refund, message: "Booking cancelled and refund processed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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

  app.post("/api/admin/chat/cleanup-expired", requireAdminAuth, async (_req, res) => {
    try {
      const result = await cleanupExpiredStreamChannels();
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/stats/chat-flags", requireAdminAuth, async (_req, res) => {
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
      return res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
