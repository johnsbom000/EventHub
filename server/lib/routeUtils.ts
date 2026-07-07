/**
 * Pure helper functions shared across route handlers.
 * No database access, no side effects — only data transformation and validation.
 */

import {
  STRIPE_FEE_ESTIMATE_PERCENT,
  STRIPE_FEE_ESTIMATE_FIXED_CENTS,
  LISTING_DESCRIPTION_MAX_CHARS,
  LISTING_SUBCATEGORY_MAX_CHARS,
  LISTING_SUBCATEGORY_DETAIL_MAX_CHARS,
  MIN_LISTING_PHOTO_COUNT,
  type ListingCategoryValue,
} from "./constants";
import {
  computeChatRetentionExpiry,
  isChatExpiredForEventDate,
} from "../streamChat";
import { resolveListingPolicyColumns } from "./cancellationPolicyPresets";

// ─── Generic primitives ───────────────────────────────────────────────────────

export function extractRows<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

export function toOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseBooleanInput(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return null;
}

export function parseMoneyToCents(value: unknown): number | null {
  const numeric = toOptionalNumber(value);
  if (numeric == null || !Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

export function parseLatLngValue(value: unknown): number | null {
  const n = toOptionalNumber(value);
  return n != null && Number.isFinite(n) ? n : null;
}

export function parseIntegerValue(value: unknown): number | null {
  const n = toOptionalNumber(value);
  if (n == null || !Number.isFinite(n)) return null;
  return Math.trunc(n);
}

/**
 * Parses a tri-state boolean from Stripe metadata ("true"/"false" strings).
 * Returns null when the key is absent or unrecognized — callers use null to
 * mean "metadata predates this key" and apply their own fallback.
 */
export function parseOptionalBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

// ─── Payment state ────────────────────────────────────────────────────────────

export function normalizePaymentStateValue(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function toCanonicalPaymentStatus(value: unknown) {
  const status = normalizePaymentStateValue(value);
  if (status === "paid") return "succeeded";
  if (status === "partial") return "partially_refunded";
  return status;
}

export function isPaymentSucceededStatus(value: unknown) {
  return toCanonicalPaymentStatus(value) === "succeeded";
}

export function isPaymentRefundedOrPartiallyRefundedStatus(value: unknown) {
  const status = toCanonicalPaymentStatus(value);
  return status === "refunded" || status === "partially_refunded";
}

export function isPaymentCollectedStatus(paymentStatus: unknown) {
  const status = toCanonicalPaymentStatus(paymentStatus);
  return (
    status === "partially_refunded" ||
    status === "succeeded" ||
    status === "refunded" ||
    status === "disputed"
  );
}

export function shouldCountBookingAsInventoryReserved(status: unknown) {
  const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
  return normalized === "pending" || normalized === "confirmed" || normalized === "completed";
}

export type PaymentScheduleEntry = {
  status: unknown;
  paymentType?: unknown;
};

// Travel-fee rows only participate in the booking's payment status once they
// carry real money state. A failed or still-pending travel-fee attempt must
// never drag down a booking whose main payment succeeded (a declined travel-fee
// card used to cancel the whole paid booking via the "failed" branch below).
const TRAVEL_FEE_PARTICIPATING_STATUSES = new Set([
  "succeeded",
  "refunded",
  "partially_refunded",
  "disputed",
]);

export function deriveBookingPaymentStatusFromScheduleStatuses(entries: PaymentScheduleEntry[]) {
  const statuses = entries
    .filter((entry) => {
      if (normalizePaymentStateValue(entry?.paymentType) !== "travel_fee") return true;
      return TRAVEL_FEE_PARTICIPATING_STATUSES.has(toCanonicalPaymentStatus(entry?.status));
    })
    .map((entry) => toCanonicalPaymentStatus(entry?.status))
    .filter(Boolean);
  if (statuses.length === 0) return "pending";

  if (statuses.includes("disputed")) return "disputed";
  if (statuses.includes("requires_action")) return "requires_action";
  if (statuses.every((s) => s === "refunded")) return "refunded";
  if (statuses.every((s) => s === "succeeded")) return "succeeded";
  if (statuses.every((s) => s === "partially_refunded")) return "partially_refunded";

  const anyPaid = statuses.includes("succeeded");
  const anyRefunded = statuses.includes("refunded");
  const anyPartialRefund = statuses.includes("partially_refunded");
  if (anyPartialRefund || (anyPaid && anyRefunded)) return "partially_refunded";

  if (statuses.some((s) => s === "failed")) return "failed";
  return "pending";
}

export function estimateStripeProcessingFeeCents(amountCents: number) {
  const amount = Math.max(0, Math.round(amountCents));
  if (amount <= 0) return 0;
  return Math.max(0, Math.round(amount * STRIPE_FEE_ESTIMATE_PERCENT) + STRIPE_FEE_ESTIMATE_FIXED_CENTS);
}

// ─── Refund-job helpers (pure orchestration, Stripe/DB injected) ─────────────

/**
 * Stripe rejects a refund on an already-fully-refunded charge with
 * `charge_already_refunded`. For our jobs that is crash recovery, not failure:
 * the refund landed on a previous attempt but the DB write didn't.
 */
export function isStripeChargeAlreadyRefundedError(err: unknown): boolean {
  const candidate = err as { code?: unknown; raw?: { code?: unknown } } | null;
  const code = candidate?.code ?? candidate?.raw?.code;
  return code === "charge_already_refunded";
}

export function computeRemainingRefundableCents(
  amountCents: unknown,
  alreadyRefundedCents: unknown
): number {
  const amount = typeof amountCents === "number" && Number.isFinite(amountCents) ? amountCents : 0;
  const refunded =
    typeof alreadyRefundedCents === "number" && Number.isFinite(alreadyRefundedCents)
      ? alreadyRefundedCents
      : 0;
  return Math.max(0, Math.round(amount) - Math.max(0, Math.round(refunded)));
}

export type RefundExecutor = (params: {
  paymentIntentId: string;
  amount?: number;
  reason?: string;
  idempotencyKey?: string;
}) => Promise<unknown>;

export type BookingRefundAttemptRow = {
  id: string;
  amount: number;
  refundAmount: number | null;
  stripePaymentIntentId: string | null;
};

export type BookingRefundAttemptResult =
  | {
      ok: true;
      totalRefundedCents: number;
      refundedRows: Array<{ id: string; refundedCents: number; alreadyRefunded: boolean }>;
    }
  | { ok: false; failedPaymentId: string; error: unknown };

/**
 * Attempts every outstanding refund for a booking, stopping at the first hard
 * failure. Nothing is persisted here — the caller must only mark payments
 * refunded (and cancel the booking) when `ok` is true, so a Stripe outage
 * leaves the booking untouched and the next tick retries under the same
 * idempotency keys. `charge_already_refunded` counts as success (the refund
 * landed on a prior crashed run).
 */
export async function attemptBookingRefundsWithFn(params: {
  bookingId: string;
  rows: BookingRefundAttemptRow[];
  idempotencyPrefix: string;
  reason?: string;
  refundFn: RefundExecutor;
}): Promise<BookingRefundAttemptResult> {
  const refundedRows: Array<{ id: string; refundedCents: number; alreadyRefunded: boolean }> = [];
  let totalRefundedCents = 0;

  for (const row of params.rows) {
    const refundable = computeRemainingRefundableCents(row.amount, row.refundAmount);
    if (refundable <= 0 || !row.stripePaymentIntentId) {
      refundedRows.push({ id: row.id, refundedCents: 0, alreadyRefunded: false });
      continue;
    }
    try {
      await params.refundFn({
        paymentIntentId: row.stripePaymentIntentId,
        amount: refundable,
        reason: params.reason,
        idempotencyKey: `${params.idempotencyPrefix}:${params.bookingId}:${row.id}`,
      });
      refundedRows.push({ id: row.id, refundedCents: refundable, alreadyRefunded: false });
      totalRefundedCents += refundable;
    } catch (err) {
      if (isStripeChargeAlreadyRefundedError(err)) {
        refundedRows.push({ id: row.id, refundedCents: refundable, alreadyRefunded: true });
        totalRefundedCents += refundable;
        continue;
      }
      return { ok: false, failedPaymentId: row.id, error: err };
    }
  }

  return { ok: true, totalRefundedCents, refundedRows };
}

export type DepositRefundAttemptResult =
  | { action: "refunded"; amountCents: number }
  | { action: "skipped_zero_remaining" }
  | { action: "skipped_no_payment_intent" }
  | { action: "failed"; error: unknown };

/**
 * Refunds only the REMAINING portion of a security deposit. The deposit shares
 * its PaymentIntent with the booking payment, so an amount-less refund would
 * return the vendor's service money too — the explicit amount is mandatory.
 */
export async function attemptDepositRefundWithFn(params: {
  paymentId: string;
  stripePaymentIntentId: string | null;
  depositCents: number;
  alreadyRefundedCents: number | null | undefined;
  refundFn: RefundExecutor;
}): Promise<DepositRefundAttemptResult> {
  const remaining = computeRemainingRefundableCents(params.depositCents, params.alreadyRefundedCents);
  if (remaining <= 0) return { action: "skipped_zero_remaining" };
  if (!params.stripePaymentIntentId) return { action: "skipped_no_payment_intent" };

  try {
    await params.refundFn({
      paymentIntentId: params.stripePaymentIntentId,
      amount: remaining,
      reason: "requested_by_customer",
      // Amount-free key on purpose: if the remaining amount changes between
      // retries, Stripe fails loudly on the key mismatch instead of issuing a
      // second refund.
      idempotencyKey: `auto-deposit-refund:${params.paymentId}`,
    });
    return { action: "refunded", amountCents: remaining };
  } catch (error) {
    return { action: "failed", error };
  }
}

// ─── Text normalizers ─────────────────────────────────────────────────────────

export function normalizeTitleCaseText(value: unknown, maxLen: number): string | unknown {
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

export function normalizeProfileNameText(value: unknown, maxLen = 120): string {
  if (typeof value !== "string") return "";

  const cleaned = value
    .replace(/[']/g, "'")
    .replace(/[^a-zA-Z0-9\s'&]/g, " ")
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

export function clampDescriptionText(value: unknown): string | unknown {
  if (typeof value !== "string") return value;
  return value.slice(0, LISTING_DESCRIPTION_MAX_CHARS);
}

export function toUniqueTrimmedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    )
  );
}

export function normalizeTagEntry(rawTag: unknown): { label: string; slug: string } | null {
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

export function deriveVendorSlug(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80);
}

export function normalizeTagsByPropType(rawTagsByPropType: unknown): unknown {
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

export function clampListingDescriptions(listingDataRaw: unknown): unknown {
  if (!listingDataRaw || typeof listingDataRaw !== "object" || Array.isArray(listingDataRaw)) {
    return listingDataRaw;
  }

  const listingData = listingDataRaw as Record<string, any>;
  const nextListingData: Record<string, any> = { ...listingData };

  nextListingData.listingTitle = normalizeTitleCaseText(nextListingData.listingTitle, 60);
  nextListingData.description = clampDescriptionText(nextListingData.description);
  nextListingData.listingDescription = clampDescriptionText(nextListingData.listingDescription);
  nextListingData.serviceDescription = clampDescriptionText(nextListingData.serviceDescription);
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

// ─── Listing classification ───────────────────────────────────────────────────

export function normalizeListingTitleCandidate(value: unknown): string | null {
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

export function normalizeListingCategory(value: unknown): ListingCategoryValue | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized) return null;

  if (normalized === "rentals" || normalized === "rental") return "Rentals";
  if (normalized === "services" || normalized === "service") return "Services";
  if (normalized === "venues" || normalized === "venue") return "Venues";
  if (normalized === "catering") return "Catering";
  return null;
}

export function isInstantBookingCategory(category: ListingCategoryValue | null) {
  return category === "Rentals";
}

export function normalizeListingSubcategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, LISTING_SUBCATEGORY_MAX_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeListingSubcategoryDetail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, LISTING_SUBCATEGORY_DETAIL_MAX_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeListingClassification(
  listingDataRaw: unknown,
  options?: { requireCategory?: boolean }
): {
  listingData: Record<string, any>;
  category: ListingCategoryValue | null;
  subcategory: string | null;
  subcategoryDetail: string | null;
  missingCategory: boolean;
} {
  const listingData =
    listingDataRaw && typeof listingDataRaw === "object" && !Array.isArray(listingDataRaw)
      ? ({ ...(listingDataRaw as Record<string, any>) } as Record<string, any>)
      : ({} as Record<string, any>);

  const category = normalizeListingCategory(listingData.category) ?? null;
  const subcategory = normalizeListingSubcategory(listingData.subcategory);
  const subcategoryDetail = normalizeListingSubcategoryDetail(listingData.subcategoryDetail);

  if (category) listingData.category = category;
  else delete listingData.category;

  if (subcategory) listingData.subcategory = subcategory;
  else delete listingData.subcategory;

  if (subcategoryDetail) listingData.subcategoryDetail = subcategoryDetail;
  else delete listingData.subcategoryDetail;

  return {
    listingData,
    category,
    subcategory,
    subcategoryDetail,
    missingCategory: Boolean(options?.requireCategory && !category),
  };
}

export function resolveBookingLifecycleMode(input: {
  listingCategory?: unknown;
  listingInstantBookEnabled?: unknown;
}) {
  const category = normalizeListingCategory(input.listingCategory);
  const explicitInstantBook = parseBooleanInput(input.listingInstantBookEnabled);
  const isInstantBooking = explicitInstantBook ?? isInstantBookingCategory(category);

  return {
    category,
    isInstantBooking,
    initialStatus: (isInstantBooking ? "confirmed" : "pending") as "confirmed" | "pending",
  };
}

// ─── Listing photos ───────────────────────────────────────────────────────────

export function getListingPhotoCount(listingDataRaw: unknown, canonicalPhotos?: unknown): number {
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

export function hasMinimumListingPhotos(listingDataRaw: unknown, canonicalPhotos?: unknown): boolean {
  return getListingPhotoCount(listingDataRaw, canonicalPhotos) >= MIN_LISTING_PHOTO_COUNT;
}

// ─── Listing tags ─────────────────────────────────────────────────────────────

export function toCanonicalTagList(listingData: Record<string, any>): string[] {
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

// ─── Listing price / logistics ────────────────────────────────────────────────

export function extractListingBasePriceCents(
  listingData: any,
  canonicalListingPriceCents?: unknown
): number | null {
  const canonicalPrice = parseIntegerValue(canonicalListingPriceCents);
  if (canonicalPrice != null && canonicalPrice > 0) return canonicalPrice;

  if (!listingData || typeof listingData !== "object") return null;
  const explicitPriceCents = parseIntegerValue(listingData?.priceCents);
  if (explicitPriceCents != null && explicitPriceCents > 0) return explicitPriceCents;

  const candidates = [listingData?.price, listingData?.rate];
  const dollars = candidates
    .map((v) => toOptionalNumber(v))
    .find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!dollars || dollars <= 0) return null;

  return Math.max(1, Math.round(dollars * 100));
}

export function hasValidListingPrice(listingDataRaw: unknown, canonicalPriceCents?: unknown): boolean {
  const cents = extractListingBasePriceCents(listingDataRaw as any, canonicalPriceCents);
  return cents != null && cents > 0;
}

export function getListingPricingUnit(listingData: any, canonicalPricingUnit?: unknown): "per_day" | "per_hour" {
  const canonicalUnit = asTrimmedString(canonicalPricingUnit).toLowerCase();
  if (canonicalUnit === "per_hour" || canonicalUnit === "per_day") return canonicalUnit;

  const unit = asTrimmedString(listingData?.pricingUnit).toLowerCase();
  return unit === "per_hour" ? "per_hour" : "per_day";
}

export function getListingMinimumHours(listingData: any, canonicalMinimumHours?: unknown): number | null {
  const canonicalHours = parseIntegerValue(canonicalMinimumHours);
  if (canonicalHours != null && canonicalHours > 0) return canonicalHours;

  if (!listingData || typeof listingData !== "object") return null;

  const hours = [listingData?.minimumHours]
    .map((v) => toOptionalNumber(v))
    .find((v) => typeof v === "number" && Number.isFinite(v) && v > 0);

  return hours != null ? Math.max(1, Math.round(hours)) : null;
}

export function getListingAvailableQuantity(listingData: any, canonicalQuantity?: unknown): number {
  const quantityFromCanonicalColumn = parseIntegerValue(canonicalQuantity);
  if (quantityFromCanonicalColumn != null && quantityFromCanonicalColumn > 0) {
    return Math.max(1, Math.floor(quantityFromCanonicalColumn));
  }

  if (!listingData || typeof listingData !== "object") return 1;

  const quantity =
    [listingData?.quantity]
      .map((v) => parseIntegerValue(v))
      .find((v) => typeof v === "number" && Number.isFinite(v) && v > 0) ?? 1;

  return Math.max(1, Math.floor(quantity));
}

export function getListingLogisticsFeeSummaryCents(input: {
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
    travelOffered &&
    (parseBooleanInput(canonical.travelFeeEnabled) ??
      parseBooleanInput(listingData?.travelFeeEnabled) ??
      false);
  const travelFeeType = asTrimmedString(canonical.travelFeeType ?? listingData?.travelFeeType).toLowerCase();
  const travelFeeAmountFromCanonical = parseIntegerValue(canonical.travelFeeAmountCents);
  const travelFlatFeeCents =
    travelFeeEnabled && travelFeeType === "flat"
      ? travelFeeAmountFromCanonical ??
        parseIntegerValue(listingData?.travelFeeAmountCents) ??
        parseMoneyToCents(listingData?.travelFeeAmount) ??
        0
      : 0;
  const variableTravelFeePending =
    travelFeeEnabled && (travelFeeType === "per_mile" || travelFeeType === "per_hour");

  return {
    deliveryFeeCents: deliveryFeeCents ?? 0,
    setupFeeCents: setupFeeCents ?? 0,
    takedownFeeCents: takedownFeeCents ?? 0,
    travelFlatFeeCents: travelFlatFeeCents ?? 0,
    variableTravelFeePending,
    totalLogisticsFeeCents:
      (deliveryFeeCents ?? 0) + (setupFeeCents ?? 0) + (takedownFeeCents ?? 0) + (travelFlatFeeCents ?? 0),
  };
}

// ─── Address parsing ──────────────────────────────────────────────────────────

export function parseAddressLabel(label: string): {
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

  return { streetAddress, city, state: stateZipChunk, zipCode: "" };
}

// ─── Geo utilities ────────────────────────────────────────────────────────────

/** Great-circle distance between two lat/lng points (Haversine formula). Returns miles. */
export function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Returns true when the event coordinates fall outside the listing's service radius. */
export function isEventOutsideServiceRadius(params: {
  listingCenterLat: number | null | undefined;
  listingCenterLng: number | null | undefined;
  serviceRadiusMiles: number | null | undefined;
  eventLat: number | null | undefined;
  eventLng: number | null | undefined;
}): boolean {
  const { listingCenterLat, listingCenterLng, serviceRadiusMiles, eventLat, eventLng } = params;
  if (
    listingCenterLat == null || listingCenterLng == null ||
    serviceRadiusMiles == null || serviceRadiusMiles <= 0 ||
    eventLat == null || eventLng == null
  ) {
    return false;
  }
  return haversineDistanceMiles(listingCenterLat, listingCenterLng, eventLat, eventLng) > serviceRadiusMiles;
}

// ─── Canonical listing columns builder ───────────────────────────────────────

export function resolveCanonicalListingCategory(
  listingDataRaw: unknown,
  canonicalCategory?: unknown
): ListingCategoryValue | null {
  return (
    normalizeListingCategory(canonicalCategory) ??
    normalizeListingClassification(listingDataRaw).category
  );
}

export function isListingPubliclyCompliant(input: {
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

export function mirrorListingQuantityIntoListingData(input: {
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

  if (category) listingData.category = category;
  if (typeof canonical.instantBookEnabled === "boolean") {
    listingData.instantBookEnabled = canonical.instantBookEnabled;
  }

  const pricingUnit = asTrimmedString(canonical.pricingUnit).toLowerCase();
  if (pricingUnit === "per_hour" || pricingUnit === "per_day") {
    listingData.pricingUnit = pricingUnit;
  }

  const priceCents = parseIntegerValue(canonical.priceCents);
  if (priceCents != null && priceCents > 0) {
    listingData.priceCents = priceCents;
  }

  const minimumHours = parseIntegerValue(canonical.minimumHours);
  if (minimumHours != null && minimumHours > 0) {
    listingData.minimumHours = minimumHours;
  }

  const serviceAreaMode = asTrimmedString(canonical.serviceAreaMode).toLowerCase();
  if (serviceAreaMode === "radius" || serviceAreaMode === "nationwide" || serviceAreaMode === "global") {
    listingData.serviceAreaMode = serviceAreaMode;
  }

  const serviceRadiusMiles = parseIntegerValue(canonical.serviceRadiusMiles);
  if (serviceRadiusMiles != null) listingData.serviceRadiusMiles = serviceRadiusMiles;

  const centerLabel = asTrimmedString(canonical.listingServiceCenterLabel);
  if (centerLabel) listingData.listingServiceCenterLabel = centerLabel;

  const centerLat = parseLatLngValue(canonical.listingServiceCenterLat);
  if (centerLat != null) listingData.listingServiceCenterLat = centerLat;

  const centerLng = parseLatLngValue(canonical.listingServiceCenterLng);
  if (centerLng != null) listingData.listingServiceCenterLng = centerLng;

  listingData.pickupOffered = parseBooleanInput(canonical.pickupOffered) ?? false;
  listingData.deliveryOffered = parseBooleanInput(canonical.deliveryOffered) ?? false;
  listingData.deliveryFeeEnabled = parseBooleanInput(canonical.deliveryFeeEnabled) ?? false;

  const deliveryFeeAmountCents = parseIntegerValue(canonical.deliveryFeeAmountCents);
  listingData.deliveryFeeAmountCents = listingData.deliveryFeeEnabled ? deliveryFeeAmountCents ?? null : null;

  listingData.setupOffered = parseBooleanInput(canonical.setupOffered) ?? false;
  listingData.setupFeeEnabled = parseBooleanInput(canonical.setupFeeEnabled) ?? false;
  const setupFeeAmountCents = parseIntegerValue(canonical.setupFeeAmountCents);
  listingData.setupFeeAmountCents = listingData.setupFeeEnabled ? setupFeeAmountCents ?? null : null;

  listingData.takedownOffered = parseBooleanInput(canonical.takedownOffered) ?? false;
  listingData.takedownFeeEnabled = parseBooleanInput(canonical.takedownFeeEnabled) ?? false;
  const takedownFeeAmountCents = parseIntegerValue(canonical.takedownFeeAmountCents);
  listingData.takedownFeeAmountCents = listingData.takedownFeeEnabled ? takedownFeeAmountCents ?? null : null;

  listingData.travelOffered = parseBooleanInput(canonical.travelOffered) ?? false;
  listingData.travelFeeEnabled = parseBooleanInput(canonical.travelFeeEnabled) ?? false;
  const travelFeeType = asTrimmedString(canonical.travelFeeType).toLowerCase();
  listingData.travelFeeType =
    listingData.travelFeeEnabled && (travelFeeType === "flat" || travelFeeType === "per_mile" || travelFeeType === "per_hour")
      ? travelFeeType
      : null;
  const travelFeeAmountCents = parseIntegerValue(canonical.travelFeeAmountCents);
  listingData.travelFeeAmountCents =
    listingData.travelFeeEnabled && travelFeeAmountCents != null && travelFeeAmountCents > 0
      ? travelFeeAmountCents
      : null;

  if (category === "Rentals") {
    listingData.quantity = normalizedQuantity;
  } else {
    listingData.quantity = null;
  }

  return listingData;
}

export function buildCanonicalListingColumns(input: {
  listingDataRaw: unknown;
  existingCanonical?: {
    category?: unknown;
    subcategory?: unknown;
    title?: unknown;
    description?: unknown;
    whatsIncluded?: unknown;
    whatsNotIncluded?: unknown;
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
    takedownOffered?: unknown;
    takedownFeeEnabled?: unknown;
    takedownFeeAmountCents?: unknown;
    allowPreBookingContact?: unknown;
    cancellationPolicy?: unknown;
    cancellationPolicyDays?: unknown;
    photos?: unknown;
  };
  classification: {
    category: ListingCategoryValue | null;
    subcategory: string | null;
    subcategoryDetail?: string | null;
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

  const allowPreBookingContact =
    parseBooleanInput(listingData?.allowPreBookingContact) ??
    parseBooleanInput(existing?.allowPreBookingContact) ??
    false;

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

  const takedownOffered =
    parseBooleanInput(listingData?.takedownOffered) ??
    parseBooleanInput(listingData?.takedownIncluded) ??
    parseBooleanInput(existing?.takedownOffered) ??
    false;
  const takedownFeeEnabledRaw =
    parseBooleanInput(listingData?.takedownFeeEnabled) ??
    parseBooleanInput(existing?.takedownFeeEnabled) ??
    false;
  const takedownFeeEnabled = takedownOffered ? takedownFeeEnabledRaw : false;
  const takedownFeeAmountCentsRaw =
    parseIntegerValue(listingData?.takedownFeeAmountCents) ??
    parseMoneyToCents(listingData?.takedownFeeAmount) ??
    parseIntegerValue(existing?.takedownFeeAmountCents);

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

  const normalizePhotoStoragePath = (p: string): string => {
    if (!p) return p;
    if (p.startsWith("/uploads/") || /^https?:\/\//i.test(p)) return p;
    return `/uploads/listings/${p}`;
  };

  const photoNames = toUniqueTrimmedStringList(listingData?.photos?.names).map(normalizePhotoStoragePath);
  const photoUrls = toUniqueTrimmedStringList(listingData?.photos?.urls).map(normalizePhotoStoragePath);
  const photoFallback = toUniqueTrimmedStringList(Array.isArray(listingData?.photos) ? listingData?.photos : []).map(normalizePhotoStoragePath);
  const existingPhotos = toUniqueTrimmedStringList(existing?.photos).map(normalizePhotoStoragePath);
  const photos =
    photoNames.length > 0 ? photoNames : photoUrls.length > 0 ? photoUrls : photoFallback.length > 0 ? photoFallback : existingPhotos;

  const resolvedDescription =
    asTrimmedString(listingData?.description) ||
    asTrimmedString(listingData?.listingDescription) ||
    asTrimmedString(listingData?.serviceDescription) ||
    asTrimmedString(existing?.description) ||
    null;

  // Cancellation policy: prefer the wizard payload, fall back to the existing
  // column so partial updates don't wipe a previously-set policy. The wizard
  // sends the window in `cancellationPolicyHours`; the column stores that number.
  const cancellationPolicyColumns = resolveListingPolicyColumns(
    listingData?.cancellationPolicy ?? existing?.cancellationPolicy,
    listingData?.cancellationPolicyHours ??
      listingData?.cancellationPolicyDays ??
      existing?.cancellationPolicyDays
  );

  return {
    category: input.classification.category ?? normalizeListingCategory(existing?.category),
    subcategory: input.classification.subcategory ?? normalizeListingSubcategory(existing?.subcategory),
    subcategoryDetail: input.classification.subcategoryDetail ?? normalizeListingSubcategoryDetail((existing as any)?.subcategoryDetail),
    title:
      normalizeListingTitleCandidate(listingData?.title) ??
      normalizeListingTitleCandidate(listingData?.listingTitle) ??
      normalizeListingTitleCandidate(existing?.title) ??
      null,
    description: resolvedDescription,
    whatsIncluded:
      toUniqueTrimmedStringList(listingData?.whatsIncluded ?? listingData?.includedItems ?? listingData?.included).length > 0
        ? toUniqueTrimmedStringList(listingData?.whatsIncluded ?? listingData?.includedItems ?? listingData?.included)
        : toUniqueTrimmedStringList(existing?.whatsIncluded),
    whatsNotIncluded:
      toUniqueTrimmedStringList(listingData?.whatsNotIncluded).length > 0
        ? toUniqueTrimmedStringList(listingData?.whatsNotIncluded)
        : toUniqueTrimmedStringList(existing?.whatsNotIncluded),
    tags: toCanonicalTagList(listingData).length > 0 ? toCanonicalTagList(listingData) : toUniqueTrimmedStringList(existing?.tags),
    popularFor:
      toUniqueTrimmedStringList(listingData?.popularFor).length > 0
        ? toUniqueTrimmedStringList(listingData?.popularFor)
        : toUniqueTrimmedStringList(existing?.popularFor),
    instantBookEnabled,
    allowPreBookingContact,
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
    takedownOffered,
    takedownFeeEnabled,
    takedownFeeAmountCents: takedownFeeEnabled ? takedownFeeAmountCentsRaw ?? null : null,
    cancellationPolicy: cancellationPolicyColumns.cancellationPolicy,
    cancellationPolicyDays: cancellationPolicyColumns.cancellationPolicyDays,
    photos,
  };
}

// ─── Booking chat context ─────────────────────────────────────────────────────

export type BookingChatContext = {
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

export function hasPaymentAccessForChat(paymentStatus: string | null | undefined) {
  return isPaymentCollectedStatus(paymentStatus);
}

export function normalizeBookingChatContext(row: any): BookingChatContext {
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

export function toConversationPayload(
  role: "customer" | "vendor",
  row: BookingChatContext,
  unreadCount: number
) {
  const retention = row.eventDate ? computeChatRetentionExpiry(row.eventDate) : null;
  const normalizedUnread = Math.max(0, Number(unreadCount || 0));
  return {
    bookingId: row.bookingId,
    eventId: row.eventId,
    counterpartName: role === "customer" ? row.vendorName || "Vendor" : row.customerName || "Customer",
    eventDate: row.eventDate,
    eventTitle: row.eventTitle || null,
    status: row.status,
    paymentStatus: row.paymentStatus,
    paymentInfoCollected: hasPaymentAccessForChat(row.paymentStatus),
    retentionExpiresAt: retention ? retention.toISOString() : null,
    expired: row.eventDate ? isChatExpiredForEventDate(row.eventDate) : false,
    unreadCount: normalizedUnread,
    hasUnread: normalizedUnread > 0,
    isInquiry: false as const,
    vendorAccountId: row.vendorAccountId ?? null,
  };
}

export function toInquiryConversationPayload(
  role: "customer" | "vendor",
  row: {
    inquiryChannelId: string;
    vendorAccountId: string;
    vendorName: string | null;
    customerId: string;
    customerName: string | null;
  },
  unreadCount: number
) {
  const normalizedUnread = Math.max(0, Number(unreadCount || 0));
  return {
    bookingId: row.inquiryChannelId, // inquiry channel ID used as the UI key
    eventId: null,
    counterpartName: role === "customer" ? row.vendorName || "Vendor" : row.customerName || "Customer",
    eventDate: null,
    eventTitle: null,
    status: "inquiry" as const,
    paymentStatus: null,
    paymentInfoCollected: false,
    retentionExpiresAt: null,
    expired: false,
    unreadCount: normalizedUnread,
    hasUnread: normalizedUnread > 0,
    isInquiry: true as const,
    vendorAccountId: row.vendorAccountId,
  };
}
