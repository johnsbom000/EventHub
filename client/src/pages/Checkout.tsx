import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ChevronLeft, Calendar, CheckCircle2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import AuthModal from "@/components/AuthModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationPicker } from "@/components/LocationPicker";
import { MapLocationPicker } from "@/components/MapLocationPicker";
import type { LocationResult } from "@/types/location";
import { resolveAssetUrl } from "@/lib/runtimeUrls";
import { useFeeRates } from "@/hooks/useFeeRates";
import { TimeInput } from "@/components/ui/TimeInput";

type CheckoutRouteParams = { listingId: string };
type SavedCustomerLocation = {
  label: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  lat?: number;
  lng?: number;
};
type CheckoutDeliveryDraft = {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  label?: string;
  lat?: number;
  lng?: number;
};
type CustomerEventOption = {
  id: string;
  title: string;
  bookingCount?: number;
  lastUsedAt?: string | null;
};
const CHECKOUT_DELIVERY_DRAFT_KEY = "eventhub.checkout.delivery_draft.v1";
const CHECKOUT_PENDING_PAYMENT_KEY = "eventhub.checkout.pending_payment.v1";
const CHECKOUT_IDEMPOTENCY_KEY_PREFIX = "eventhub.checkout.idempotency.v1";

type CheckoutPendingPaymentDraft = {
  listingId: string;
  bookingId: string;
  idempotencyKey: string;
  createdAt: string;
};

function createCheckoutIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `checkout-${crypto.randomUUID()}`;
  }
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getCheckoutIdempotencyStorageKey(listingId: string) {
  return `${CHECKOUT_IDEMPOTENCY_KEY_PREFIX}:${listingId}`;
}

function normalizeListingCategory(value: unknown): "Rentals" | "Services" | "Venues" | "Catering" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized) return null;
  if (normalized === "rentals" || normalized === "rental" || normalized === "prop-decor" || normalized === "prop-rental") {
    return "Rentals";
  }
  if (normalized === "venues" || normalized === "venue") return "Venues";
  if (normalized === "catering") return "Catering";
  if (normalized === "services" || normalized === "service") return "Services";
  return null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizePhotoToUrl(photo: any): string | undefined {
  if (typeof photo === "string") {
    if (photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("/")) return resolveAssetUrl(photo);
    return undefined;
  }
  if (photo && typeof photo === "object") {
    const url = photo.url;
    if (isNonEmptyString(url) && (url.startsWith("http") || url.startsWith("/"))) return resolveAssetUrl(url);
    const name = photo.name || photo.filename;
    if (isNonEmptyString(name)) return resolveAssetUrl(`/uploads/listings/${name}`);
  }
  return undefined;
}

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function parseAddressFromLabel(label: string): {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
} {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  const streetAddress = parts[0] || "";
  const city = parts[1] || "";

  let state = "";
  let zipCode = "";
  const stateZipChunk = parts[2] || "";
  const m = stateZipChunk.match(/^(.+?)\s+(\d{5})(?:-\d{4})?$/);
  if (m) {
    state = m[1].trim();
    zipCode = m[2].trim();
  } else {
    state = stateZipChunk.trim();
  }

  return { streetAddress, city, state, zipCode };
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseMoneyToCents(value: unknown): number | null {
  const numberValue = parseOptionalNumber(value);
  if (numberValue == null || !Number.isFinite(numberValue) || numberValue <= 0) return null;
  return Math.round(numberValue * 100);
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  if (typeof value === "number") return value === 1;
  return false;
}

function parseBooleanMaybe(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return null;
}

function toUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0),
    ),
  );
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutesAsTime(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getSuggestedEndTime(startTime: string, minimumHours: number | null | undefined): string {
  const startMinutes = parseTimeToMinutes(startTime);
  const minHours = typeof minimumHours === "number" && Number.isFinite(minimumHours) && minimumHours > 0
    ? minimumHours
    : 1;
  if (startMinutes == null) return "";

  const nextMinutes = startMinutes + minHours * 60;
  if (nextMinutes >= 24 * 60) return "";
  return formatMinutesAsTime(nextMinutes);
}

function buildHourlyWindowGuidance(input: {
  listingTitle: string;
  deliveryIncluded: boolean;
  pickupEnabled: boolean;
  setupIncluded: boolean;
  takedownIncluded?: boolean;
}) {
  const listingName = input.listingTitle || "this item";
  const setupTakedownLabel =
    input.setupIncluded && input.takedownIncluded
      ? "setup and takedown"
      : input.setupIncluded
        ? "setup"
        : input.takedownIncluded
          ? "takedown"
          : null;
  const logisticsParts = [
    input.deliveryIncluded ? "delivery" : input.pickupEnabled ? "pickup" : "on-site service",
    setupTakedownLabel,
  ].filter(Boolean);
  const logisticsLabel = logisticsParts.join(" plus ");

  return `Choose the full rental window for ${listingName}. Include enough buffer for ${logisticsLabel} so you do not go over your booked rental time.`;
}

const rawStripePublishableKey = ((import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) || "").trim();
const stripePublishableKey = rawStripePublishableKey.startsWith("pk_") ? rawStripePublishableKey : "";
const stripeConfigError =
  rawStripePublishableKey.length > 0 && !rawStripePublishableKey.startsWith("pk_")
    ? "Stripe publishable key is invalid. `VITE_STRIPE_PUBLISHABLE_KEY` must start with `pk_`."
    : null;
const stripePromise: Promise<import("@stripe/stripe-js").Stripe | null> = stripePublishableKey
  ? loadStripe(stripePublishableKey).catch((error) => {
      console.error("Failed to initialize Stripe.js", error);
      return null;
    })
  : Promise.resolve(null);

export default function CheckoutPage() {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutContent stripeConfigured={Boolean(stripePublishableKey)} stripeConfigError={stripeConfigError} />
    </Elements>
  );
}

function CheckoutContent({
  stripeConfigured,
  stripeConfigError,
}: {
  stripeConfigured: boolean;
  stripeConfigError: string | null;
}) {
  const { t } = useTranslation();
  const { customerFeeRate } = useFeeRates();
  const [path, setLocation] = useLocation();
  const [, params] = useRoute<CheckoutRouteParams>("/checkout/:listingId");
  const listingId =
    params?.listingId ||
    (path.startsWith("/checkout/") ? path.replace("/checkout/", "").split("/")[0] : undefined);

  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, [path]);

  const initialDate = useMemo(() => {
    const raw = searchParams.get("date");
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return new Date().toISOString().split("T")[0];
  }, [searchParams]);
  const initialQuantity = useMemo(() => {
    const raw = searchParams.get("quantity");
    const parsed = raw ? Number(raw) : 1;
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
  }, [searchParams]);
  const initialStartTime = useMemo(() => {
    const raw = searchParams.get("startTime");
    if (raw && /^\d{2}:\d{2}$/.test(raw)) return raw;
    return "";
  }, [searchParams]);
  const initialEndTime = useMemo(() => {
    const raw = searchParams.get("endTime");
    if (raw && /^\d{2}:\d{2}$/.test(raw)) return raw;
    return "";
  }, [searchParams]);
  const selectedPackageId = useMemo(() => searchParams.get("packageId") || undefined, [searchParams]);
  // Parse add-ons with quantities. Preferred format: addons=id1:qty1,id2:qty2
  // Fallback: legacy addonIds=id1,id2 (each defaults to qty=1)
  const selectedAddons = useMemo<{ id: string; quantity: number }[]>(() => {
    const addonsRaw = searchParams.get("addons");
    if (addonsRaw) {
      return addonsRaw.split(",").filter(Boolean).map((part) => {
        const [id, qtyStr] = part.split(":");
        const qty = Math.max(1, parseInt(qtyStr ?? "1", 10) || 1);
        return { id, quantity: qty };
      });
    }
    const legacyRaw = searchParams.get("addonIds");
    if (!legacyRaw) return [];
    return legacyRaw.split(",").filter(Boolean).map((id) => ({ id, quantity: 1 }));
  }, [searchParams]);
  // Derived list of just IDs for backward-compat rendering logic
  const selectedAddonIds = useMemo(() => selectedAddons.map((a) => a.id), [selectedAddons]);

  const [eventDate, setEventDate] = useState(initialDate);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [eventStartTime, setEventStartTime] = useState(initialStartTime);
  const [eventEndTime, setEventEndTime] = useState(initialEndTime);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState<LocationResult | null>(null);
  const [useMapPicker, setUseMapPicker] = useState(false);
  const [eventMode, setEventMode] = useState<"existing" | "new">("existing");
  const [selectedCustomerEventId, setSelectedCustomerEventId] = useState("");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventQueuedTitle, setNewEventQueuedTitle] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerQuestions, setCustomerQuestions] = useState("");

  const [cardComplete, setCardComplete] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "creating-booking" | "initializing-payment" | "confirming-payment">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPaymentDraft, setPendingPaymentDraft] = useState<CheckoutPendingPaymentDraft | null>(null);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState("");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; percentOff: number; discountId: string } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [bookingPendingReason, setBookingPendingReason] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const stripe = useStripe();
  const elements = useElements();
  const { isAuthenticated, getAccessTokenSilently, user } = useAuth0();
  const { toast } = useToast();

  // Fetch vendor account so we can use the owner's real name when a vendor is the one booking.
  const { data: vendorMe } = useQuery<{
    ownerFirstName?: string | null;
    ownerLastName?: string | null;
  }>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (user?.email && !contactEmail) {
      setContactEmail(user.email);
    }
    if (!contactName) {
      // Prefer the owner's stored real name (reliable for all signup methods).
      // Fall back to Auth0 display name (only reliable for Google OAuth).
      const ownerName = [vendorMe?.ownerFirstName, vendorMe?.ownerLastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const fallback = typeof user?.name === "string" ? user.name.trim() : "";
      const resolved = ownerName || fallback;
      if (resolved) setContactName(resolved);
    }
  }, [user, vendorMe, contactEmail, contactName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CHECKOUT_DELIVERY_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as CheckoutDeliveryDraft;
      if (!draft || typeof draft !== "object") return;
      if (!draft.streetAddress && !draft.city && !draft.state && !draft.zipCode) return;

      setDeliveryAddress(draft.streetAddress || "");
      setDeliveryCity(draft.city || "");
      setDeliveryState(draft.state || "");
      setDeliveryZip(draft.zipCode || "");

      if (draft.label) {
        setDeliveryLocation({
          id: `draft-${draft.label}`,
          label: draft.label,
          lat: draft.lat,
          lng: draft.lng,
        } as unknown as LocationResult);
      }
    } catch {
      // Ignore local draft parse errors.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !listingId) return;
    try {
      const raw = window.localStorage.getItem(CHECKOUT_PENDING_PAYMENT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CheckoutPendingPaymentDraft;
      if (
        parsed &&
        parsed.listingId === listingId &&
        typeof parsed.bookingId === "string" &&
        typeof parsed.idempotencyKey === "string"
      ) {
        setPendingPaymentDraft(parsed);
      }
    } catch {
      // Ignore local draft parse errors.
    }
  }, [listingId]);

  useEffect(() => {
    if (typeof window === "undefined" || !listingId) return;
    const storageKey = getCheckoutIdempotencyStorageKey(listingId);
    const fromDraft =
      pendingPaymentDraft && pendingPaymentDraft.listingId === listingId
        ? pendingPaymentDraft.idempotencyKey
        : "";
    const existingKey = (window.localStorage.getItem(storageKey) || "").trim();
    const nextKey = fromDraft || existingKey || createCheckoutIdempotencyKey();
    window.localStorage.setItem(storageKey, nextKey);
    setCheckoutIdempotencyKey(nextKey);
  }, [listingId, pendingPaymentDraft]);

  const persistPendingPaymentDraft = (draft: CheckoutPendingPaymentDraft | null) => {
    setPendingPaymentDraft(draft);
    if (typeof window === "undefined") return;
    if (!draft) {
      window.localStorage.removeItem(CHECKOUT_PENDING_PAYMENT_KEY);
      if (listingId) {
        window.localStorage.removeItem(getCheckoutIdempotencyStorageKey(listingId));
      }
      return;
    }
    window.localStorage.setItem(CHECKOUT_PENDING_PAYMENT_KEY, JSON.stringify(draft));
    window.localStorage.setItem(
      getCheckoutIdempotencyStorageKey(draft.listingId),
      draft.idempotencyKey
    );
  };

  const isAlaCarte = listingId === "alacarte";

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/listings/public", listingId],
    enabled: Boolean(listingId) && !isAlaCarte,
    queryFn: async () => {
      const res = await fetch(`/api/listings/public/${listingId}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to load listing ${listingId}`);
      const raw = await res.json();
      const ld = (raw?.listingData ?? {}) as any;
      // Compatibility-only fallback object. Canonical contract comes from typed listing fields on `raw`.

      const photosFromObjects: string[] = Array.isArray(raw?.photos)
        ? raw.photos.map((p: any) => normalizePhotoToUrl(p)).filter((u: any) => typeof u === "string")
        : [];
      const photosFromListingData: string[] = Array.isArray(ld?.photos?.urls)
        ? ld.photos.urls
            .filter((u: any) => typeof u === "string")
            .map((u: string) => resolveAssetUrl(u))
        : Array.isArray(ld?.photos?.names)
          ? ld.photos.names
              .map((n: any) => (typeof n === "string" ? normalizePhotoToUrl(n) ?? null : null))
              .filter(Boolean)
          : Array.isArray(ld?.photos)
            ? ld.photos.filter((u: any) => typeof u === "string").map((u: string) => resolveAssetUrl(u))
            : [];
      // raw.photos is already CDN-resolved by the server; listingData sources are raw storage paths
      // that 404 in production when files live only in cloud storage. Use raw.photos as the sole
      // source; fall back to listingData only for legacy listings where the canonical array is empty.
      const allPhotos = Array.from(new Set(
        (photosFromObjects.length > 0 ? photosFromObjects : photosFromListingData).filter(Boolean)
      ));

      const canonicalPriceCents = parseOptionalNumber(raw?.priceCents);
      const mirroredPriceCents = parseOptionalNumber(ld?.priceCents);
      const mirroredPriceDollars = parseOptionalNumber(ld?.price ?? ld?.rate);
      const priceCents =
        canonicalPriceCents != null && canonicalPriceCents > 0
          ? Math.max(1, Math.round(canonicalPriceCents))
          : mirroredPriceCents != null && mirroredPriceCents > 0
            ? Math.max(1, Math.round(mirroredPriceCents))
            : mirroredPriceDollars != null
              ? Math.max(1, Math.round(mirroredPriceDollars * 100))
            : null;

      const tagsFromCanonical = toUniqueStringList(raw?.tags);
      const tagsFromLegacy: string[] = Array.isArray(ld?.tagsByPropType?.__listing__)
        ? ld.tagsByPropType.__listing__.map((t: any) => t?.label).filter(Boolean)
        : [];
      const included = Array.from(
        new Set([
          ...toUniqueStringList(raw?.whatsIncluded),
          ...(tagsFromCanonical.length > 0 ? tagsFromCanonical : tagsFromLegacy),
          ...toUniqueStringList(ld?.whatsIncluded),
        ]),
      );

      const deliveryIncluded = parseBooleanLike(
        raw?.deliveryOffered ?? ld?.deliveryOffered ?? ld?.deliveryIncluded
      );
      const pickupEnabled =
        parseBooleanMaybe(raw?.pickupOffered) ??
        parseBooleanMaybe(ld?.pickupOffered) ??
        !deliveryIncluded;
      const pricingUnitRaw =
        (typeof raw?.pricingUnit === "string" && raw.pricingUnit.trim()) ||
        (typeof ld?.pricingUnit === "string" && ld.pricingUnit.trim()) ||
        "per_day";
      const pricingUnit = pricingUnitRaw === "per_hour" ? "per_hour" : "per_day";
      const listingCategory =
        normalizeListingCategory(raw?.category) ??
        normalizeListingCategory(ld?.category) ??
        normalizeListingCategory(raw?.serviceType) ??
        "Services";
      const instantBookEnabled =
        parseBooleanMaybe(raw?.instantBookEnabled) ??
        parseBooleanMaybe(ld?.instantBookEnabled) ??
        (listingCategory === "Rentals");
      const availableQuantity =
        [
          raw?.quantity,
          ld?.quantity,
        ]
          .map((value) => parseOptionalNumber(value))
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ?? 1;
      const minimumHoursCandidates = [
        raw?.minimumHours,
        ld?.minimumHours,
      ];
      const minimumHours =
        minimumHoursCandidates
          .map((value) => parseOptionalNumber(value))
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ?? null;

      const travelOffered = parseBooleanLike(raw?.travelOffered ?? ld?.travelOffered);
      const travelFeeEnabled = parseBooleanLike(raw?.travelFeeEnabled ?? ld?.travelFeeEnabled);
      const travelFeeTypeRaw =
        (typeof raw?.travelFeeType === "string" && raw.travelFeeType.trim().toLowerCase()) ||
        (typeof ld?.travelFeeType === "string" && ld.travelFeeType.trim().toLowerCase()) ||
        "flat";
      const travelFeeType = travelFeeTypeRaw === "per_mile" || travelFeeTypeRaw === "per_hour" ? travelFeeTypeRaw : "flat";

      const travelFeeAmountCents =
        parseOptionalNumber(raw?.travelFeeAmountCents) ??
        parseOptionalNumber(ld?.travelFeeAmountCents) ??
        parseMoneyToCents(ld?.travelFeeAmount) ??
        null;
      const deliveryFeeAmountCents =
        parseOptionalNumber(raw?.deliveryFeeAmountCents) ??
        parseOptionalNumber(ld?.deliveryFeeAmountCents) ??
        parseMoneyToCents(ld?.deliveryFeeAmount) ??
        null;
      const setupFeeAmountCents =
        parseOptionalNumber(raw?.setupFeeAmountCents) ??
        parseOptionalNumber(ld?.setupFeeAmountCents) ??
        parseMoneyToCents(ld?.setupFeeAmount) ??
        null;
      const takedownFeeAmountCents =
        parseOptionalNumber(raw?.takedownFeeAmountCents) ??
        parseOptionalNumber(ld?.takedownFeeAmountCents) ??
        parseMoneyToCents(ld?.takedownFeeAmount) ??
        null;
      const deliveryFeeEnabled =
        parseBooleanLike(
          raw?.deliveryFeeEnabled ??
            ld?.deliveryFeeEnabled
        );
      const setupFeeEnabled =
        parseBooleanLike(
          raw?.setupFeeEnabled ??
            ld?.setupFeeEnabled
        );
      const takedownFeeEnabled =
        parseBooleanLike(
          raw?.takedownFeeEnabled ??
            ld?.takedownFeeEnabled
        );
      const setupIncluded = parseBooleanLike(
        raw?.setupOffered ?? ld?.setupOffered ?? ld?.setupIncluded
      );
      const takedownIncluded = parseBooleanLike(
        raw?.takedownOffered ?? ld?.takedownOffered ?? ld?.takedownIncluded
      );

      return {
        id: raw?.id ?? listingId,
        vendorId: raw?.vendorId ?? null,
        vendorName: raw?.vendorName ?? raw?.vendor?.businessName ?? "Vendor",
        title: raw?.title ?? ld?.listingTitle ?? "Listing",
        category: listingCategory,
        description: raw?.description ?? ld?.listingDescription ?? "",
        priceCents,
        included,
        photos: allPhotos,
        deliveryIncluded,
        pickupEnabled,
        setupIncluded,
        takedownIncluded,
        instantBookEnabled,
        pricingUnit,
        minimumHours,
        availableQuantity: Math.max(1, Math.floor(availableQuantity)),
        serviceAreaMode:
          (typeof raw?.serviceAreaMode === "string" && raw.serviceAreaMode.trim()) ||
          (typeof ld?.serviceAreaMode === "string" && ld.serviceAreaMode.trim()) ||
          "radius",
        serviceRadiusMiles:
          parseOptionalNumber(raw?.serviceRadiusMiles) ?? parseOptionalNumber(ld?.serviceRadiusMiles) ?? null,
        listingServiceCenterLabel:
          (typeof raw?.listingServiceCenterLabel === "string" && raw.listingServiceCenterLabel.trim()) ||
          (typeof ld?.listingServiceCenterLabel === "string" && ld.listingServiceCenterLabel.trim()) ||
          null,
        listingServiceCenterLat:
          parseOptionalNumber(raw?.listingServiceCenterLat) ?? parseOptionalNumber(ld?.listingServiceCenterLat),
        listingServiceCenterLng:
          parseOptionalNumber(raw?.listingServiceCenterLng) ?? parseOptionalNumber(ld?.listingServiceCenterLng),
        travelOffered,
        travelFeeEnabled,
        travelFeeType,
        travelFeeAmountCents,
        deliveryFeeEnabled,
        deliveryFeeAmountCents,
        setupFeeEnabled,
        setupFeeAmountCents,
        takedownFeeEnabled,
        takedownFeeAmountCents,
        securityDepositEnabled: parseBooleanLike(raw?.securityDepositEnabled ?? ld?.securityDepositEnabled),
        securityDepositCents: parseOptionalNumber(raw?.securityDepositCents ?? ld?.securityDepositCents) ?? null,
        // Package children — used to resolve selected package price in checkout
        packages: Array.isArray(raw?.packages)
          ? (raw.packages as Array<{ id: string; title: string | null; priceCents: number | null; pricingUnit: string | null; whatsIncluded: string[] }>)
          : [],
        attachedAddons: Array.isArray(raw?.attachedAddons)
          ? (raw.attachedAddons as Array<{ id: string; title: string | null; priceCents: number | null }>)
          : [],
      };
    },
  });

  const { data: customerMe } = useQuery<{ defaultLocation?: SavedCustomerLocation | null }>({
    queryKey: ["/api/customer/me", "checkout-default-location"],
    enabled: Boolean(isAuthenticated),
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      const res = await fetch("/api/customer/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to load customer profile");
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
  // Fetch planning boards — these are the "events" customers create when saving listings.
  // My Events groups bookings under boards by name-matching, so we use board names here.
  const { data: customerEvents = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/boards", "checkout-event-options"],
    enabled: Boolean(isAuthenticated),
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      const res = await fetch("/api/boards", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to load planning events");
      const boards: { id: string; name: string }[] = await res.json();
      return boards;
    },
    staleTime: 30_000,
    retry: false,
  });

  // Active sale for auto-applied discount
  const { data: activeSaleData } = useQuery<{ sale: { percentOff: number; endsAt: string } | null }>({
    queryKey: [`/api/listings/${listingId}/active-sale`],
    enabled: Boolean(listingId),
    staleTime: 60_000,
  });
  const activeSale = activeSaleData?.sale ?? null;

  async function handleApplyPromoCode() {
    const code = promoCodeInput.trim().toUpperCase();
    if (!code || !listingId) return;
    setPromoError(null);
    setPromoLoading(true);
    try {
      const res = await fetch("/api/discounts/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, listingId }),
      });
      const json = await res.json();
      if (json.valid) {
        setAppliedPromo({ code, percentOff: json.percentOff, discountId: json.discountId });
        setPromoError(null);
      } else {
        setAppliedPromo(null);
        const messages: Record<string, string> = {
          not_found: "Promo code not found or not valid for this listing.",
          not_active: "This promo code is no longer active.",
          expired: "This promo code has expired.",
          cap_reached: "This promo code has reached its usage limit.",
        };
        setPromoError(messages[json.reason] ?? "Invalid promo code.");
      }
    } catch {
      setPromoError("Could not validate promo code. Please try again.");
    } finally {
      setPromoLoading(false);
    }
  }

  useEffect(() => {
    if (!Array.isArray(customerEvents) || customerEvents.length === 0) {
      setEventMode("new");
      setSelectedCustomerEventId("");
      return;
    }
    if (eventMode === "new") return;
    const selectedStillExists = customerEvents.some((b) => b.id === selectedCustomerEventId);
    if (eventMode === "existing" && selectedStillExists) return;
    if (!selectedStillExists) {
      setEventMode("existing");
      setSelectedCustomerEventId(customerEvents[0].id);
    }
  }, [customerEvents, selectedCustomerEventId, eventMode]);

  useEffect(() => {
    if (eventMode !== "new") {
      setNewEventQueuedTitle("");
    }
  }, [eventMode]);

  useEffect(() => {
    if (!data?.deliveryIncluded) return;
    const saved = customerMe?.defaultLocation;
    if (!saved) return;
    if (deliveryAddress || deliveryCity || deliveryState || deliveryZip) return;

    setDeliveryAddress(saved.streetAddress || "");
    setDeliveryCity(saved.city || "");
    setDeliveryState(saved.state || "");
    setDeliveryZip(saved.zipCode || "");

    if (saved.label) {
      setDeliveryLocation({
        id: `saved-${saved.label}`,
        label: saved.label,
        lat: saved.lat,
        lng: saved.lng,
      } as unknown as LocationResult);
    }
  }, [
    customerMe?.defaultLocation,
    data?.deliveryIncluded,
    deliveryAddress,
    deliveryCity,
    deliveryState,
    deliveryZip,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hasAnyValue =
      Boolean(deliveryAddress) ||
      Boolean(deliveryCity) ||
      Boolean(deliveryState) ||
      Boolean(deliveryZip);

    if (!hasAnyValue) {
      window.localStorage.removeItem(CHECKOUT_DELIVERY_DRAFT_KEY);
      return;
    }

    const draft: CheckoutDeliveryDraft = {
      streetAddress: deliveryAddress,
      city: deliveryCity,
      state: deliveryState,
      zipCode: deliveryZip,
      label:
        (deliveryLocation as any)?.label ||
        [deliveryAddress, deliveryCity, `${deliveryState} ${deliveryZip}`.trim()]
          .filter(Boolean)
          .join(", "),
      lat: (deliveryLocation as any)?.lat,
      lng: (deliveryLocation as any)?.lng,
    };

    window.localStorage.setItem(CHECKOUT_DELIVERY_DRAFT_KEY, JSON.stringify(draft));
  }, [deliveryAddress, deliveryCity, deliveryState, deliveryZip, deliveryLocation]);

  // When a package is selected, use that package's price/unit instead of the container's.
  const selectedPackage = selectedPackageId && data?.packages
    ? (data.packages as Array<{ id: string; title: string | null; priceCents: number | null; pricingUnit: string | null }>).find((p) => p.id === selectedPackageId) ?? null
    : null;
  const effectivePriceCents = selectedPackage?.priceCents ?? data?.priceCents ?? 0;
  const effectivePricingUnit: "per_day" | "per_hour" =
    selectedPackage?.pricingUnit === "per_hour" ? "per_hour" : (data?.pricingUnit as "per_day" | "per_hour") ?? "per_day";

  const isHourlyBooking = effectivePricingUnit === "per_hour";
  const shouldShowPerDayLogistics = Boolean(data && !isHourlyBooking);
  const maxAvailableQuantity =
    typeof data?.availableQuantity === "number" && Number.isFinite(data.availableQuantity) && data.availableQuantity > 0
      ? Math.floor(data.availableQuantity)
      : 1;
  const normalizedQuantity = Math.max(1, Math.min(quantity, maxAvailableQuantity));
  useEffect(() => {
    if (quantity === normalizedQuantity) return;
    setQuantity(normalizedQuantity);
  }, [normalizedQuantity, quantity]);
  const hourlyDurationHours = useMemo(() => {
    if (!isHourlyBooking) return null;
    const startMinutes = parseTimeToMinutes(eventStartTime);
    const endMinutes = parseTimeToMinutes(eventEndTime);
    if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
    return (endMinutes - startMinutes) / 60;
  }, [isHourlyBooking, eventStartTime, eventEndTime]);
  const hourlyMinimumHours =
    typeof data?.minimumHours === "number" && Number.isFinite(data.minimumHours) && data.minimumHours > 0
      ? data.minimumHours
      : null;
  const hourlyTimeRangeError = useMemo(() => {
    if (!isHourlyBooking) return null;
    if (!eventStartTime || !eventEndTime) {
      return t("checkout.errorSelectTimes");
    }
    const startMinutes = parseTimeToMinutes(eventStartTime);
    const endMinutes = parseTimeToMinutes(eventEndTime);
    if (startMinutes == null || endMinutes == null) {
      return t("checkout.errorTimeRangeInvalid");
    }
    if (endMinutes <= startMinutes) {
      return t("checkout.errorEndBeforeStart");
    }
    if (hourlyMinimumHours != null && (endMinutes - startMinutes) / 60 < hourlyMinimumHours) {
      return t("checkout.errorMinimumHours", { count: hourlyMinimumHours, hours: hourlyMinimumHours });
    }
    return null;
  }, [isHourlyBooking, eventStartTime, eventEndTime, hourlyMinimumHours, t]);
  const perDayTimeError = useMemo(() => {
    if (isHourlyBooking || !shouldShowPerDayLogistics) return null;
    if (!eventStartTime || !eventEndTime) return t("checkout.errorSelectTimes");
    const startMinutes = parseTimeToMinutes(eventStartTime);
    const endMinutes = parseTimeToMinutes(eventEndTime);
    if (startMinutes == null || endMinutes == null) return t("checkout.errorSelectTimes");
    if (endMinutes <= startMinutes) return t("checkout.errorEndBeforeStart");
    return null;
  }, [isHourlyBooking, shouldShowPerDayLogistics, eventStartTime, eventEndTime, t]);
  const hourlyWindowGuidance = useMemo(() => {
    if (!data?.title) return "";
    return buildHourlyWindowGuidance({
      listingTitle: data.title,
      deliveryIncluded: Boolean(data.deliveryIncluded),
      pickupEnabled: Boolean(data.pickupEnabled),
      setupIncluded: Boolean(data.setupIncluded),
      takedownIncluded: Boolean((data as any)?.takedownIncluded),
    });
  }, [data?.deliveryIncluded, data?.pickupEnabled, data?.setupIncluded, (data as any)?.takedownIncluded, data?.title]);

  const hasPendingPaymentToResume =
    Boolean(pendingPaymentDraft?.bookingId) &&
    pendingPaymentDraft?.listingId === data?.id;

  const isVenueListing = data?.category === "Venues";

  const canSubmit =
    (hasPendingPaymentToResume
      ? true
      : Boolean(listingId) &&
        Boolean(effectivePriceCents) &&
        Boolean(eventDate) &&
        normalizedQuantity >= 1 &&
        normalizedQuantity <= maxAvailableQuantity &&
        Boolean(contactEmail) &&
        Boolean(
          eventMode === "existing"
            ? selectedCustomerEventId
            : newEventTitle.trim().length > 0
        ) &&
        (!isHourlyBooking || !hourlyTimeRangeError) &&
        (!shouldShowPerDayLogistics || !perDayTimeError) &&
        (isVenueListing || (
          Boolean(deliveryLocation) &&
          (useMapPicker || Boolean(deliveryAddress)) &&
          (!data?.deliveryIncluded || (deliveryCity && deliveryState && deliveryZip))
        ))) &&
    stripeConfigured &&
    !stripeConfigError &&
    Boolean(stripe) &&
    Boolean(elements) &&
    cardComplete &&
    !isSubmitting;
  const baseSubtotal = isHourlyBooking && hourlyDurationHours != null
    ? Math.round(effectivePriceCents * hourlyDurationHours)
    : effectivePriceCents * normalizedQuantity;
  const addonSubtotalCents = selectedAddons.reduce((sum, { id, quantity }) => {
    const unitPrice = data?.attachedAddons?.find((a: { id: string; priceCents: number | null }) => String(a.id) === id)?.priceCents ?? 0;
    return sum + unitPrice * quantity;
  }, 0);
  const deliveryFeeCents =
    data?.deliveryIncluded && data?.deliveryFeeEnabled
      ? Math.max(0, Math.round(data?.deliveryFeeAmountCents || 0))
      : 0;
  const setupFeeCents =
    data?.setupIncluded && data?.setupFeeEnabled
      ? Math.max(0, Math.round(data?.setupFeeAmountCents || 0))
      : 0;
  const takedownFeeCents =
    (data as any)?.takedownIncluded && (data as any)?.takedownFeeEnabled
      ? Math.max(0, Math.round((data as any)?.takedownFeeAmountCents || 0))
      : 0;
  const travelFlatFeeCents =
    data?.travelOffered && data?.travelFeeEnabled && data?.travelFeeType === "flat"
      ? Math.max(0, Math.round(data?.travelFeeAmountCents || 0))
      : 0;
  const variableTravelFeePending =
    data?.travelOffered &&
    data?.travelFeeEnabled &&
    (data?.travelFeeType === "per_mile" || data?.travelFeeType === "per_hour");
  const logisticsSubtotal = deliveryFeeCents + setupFeeCents + takedownFeeCents + travelFlatFeeCents;
  const securityDepositCents =
    data?.securityDepositEnabled && (data?.securityDepositCents ?? 0) > 0
      ? Math.max(0, Math.round(data?.securityDepositCents || 0))
      : 0;
  const combinedLogisticsCents = deliveryFeeCents + setupFeeCents + takedownFeeCents;
  const logisticsLineLabels = [
    deliveryFeeCents > 0 ? "delivery" : null,
    setupFeeCents > 0 ? "setup" : null,
    takedownFeeCents > 0 ? "takedown" : null,
  ].filter(Boolean) as string[];

  // Resolve which discount applies (promo wins over sale)
  const activeDiscountPercent = appliedPromo
    ? appliedPromo.percentOff
    : activeSale
      ? activeSale.percentOff
      : 0;
  const activeDiscountLabel = appliedPromo
    ? `Promo code "${appliedPromo.code}"`
    : activeSale
      ? "Sale discount"
      : null;
  const discountAmountCents =
    activeDiscountPercent > 0
      ? Math.round((baseSubtotal + addonSubtotalCents + logisticsSubtotal) * activeDiscountPercent / 100)
      : 0;
  const discountedSubtotal = Math.max(0, baseSubtotal + addonSubtotalCents + logisticsSubtotal - discountAmountCents);
  const customerFeeAmount = Math.round(discountedSubtotal * customerFeeRate);
  const customerTotal = discountedSubtotal + customerFeeAmount;

  async function handleSubmitOrder() {
    setSubmitError(null);

    if (!listingId || (!data && !isAlaCarte)) return;

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    if (!canSubmit && !isSubmitting) {
      setHasAttemptedSubmit(true);
      toast({
        title: "Please fill in required fields",
        description: "Complete all highlighted fields before placing your order.",
        variant: "destructive",
      });
      return;
    }

    if (!stripeConfigured || stripeConfigError) {
      setSubmitError(stripeConfigError || "Stripe frontend key is missing. Add VITE_STRIPE_PUBLISHABLE_KEY.");
      return;
    }
    if (!stripe || !elements) {
      setSubmitError("Payment form is still loading. Please try again.");
      return;
    }
    if (!hasPendingPaymentToResume && !isAlaCarte && (!effectivePriceCents || effectivePriceCents <= 0)) {
      setSubmitError("This listing does not have a valid price.");
      return;
    }
    if (!hasPendingPaymentToResume && isHourlyBooking && hourlyTimeRangeError) {
      setSubmitError(hourlyTimeRangeError);
      return;
    }
    if (!hasPendingPaymentToResume && perDayTimeError) {
      setSubmitError(perDayTimeError);
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setSubmitError("Card field is not available.");
      return;
    }

    setIsSubmitting(true);
    setSubmitStage("creating-booking");
    try {
      // For delivery bookings use the structured address fields; for all others
      // use the label from the LocationPicker (which the customer is always
      // asked to fill in so we have an event timezone).
      const eventLocation = data.deliveryIncluded && deliveryAddress
        ? `${deliveryAddress}, ${deliveryCity}, ${deliveryState} ${deliveryZip}`.trim()
        : (deliveryLocation as any)?.label || undefined;
      const eventLocationLat = (deliveryLocation as any)?.lat as number | undefined;
      const eventLocationLng = (deliveryLocation as any)?.lng as number | undefined;

      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });
      const activeIdempotencyKey =
        checkoutIdempotencyKey.trim().length > 0
          ? checkoutIdempotencyKey.trim()
          : createCheckoutIdempotencyKey();
      if (typeof window !== "undefined" && listingId) {
        window.localStorage.setItem(
          getCheckoutIdempotencyStorageKey(listingId),
          activeIdempotencyKey
        );
      }

      if (data.deliveryIncluded && deliveryAddress && deliveryCity && deliveryState && deliveryZip) {
        const defaultLocation: SavedCustomerLocation = {
          label: [deliveryAddress, deliveryCity, `${deliveryState} ${deliveryZip}`].filter(Boolean).join(", "),
          streetAddress: deliveryAddress,
          city: deliveryCity,
          state: deliveryState,
          zipCode: deliveryZip,
          lat: (deliveryLocation as any)?.lat,
          lng: (deliveryLocation as any)?.lng,
        };

        await fetch("/api/customer/me", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ defaultLocation }),
        }).catch(() => undefined);
      }

      let bookingId = pendingPaymentDraft?.bookingId || "";

      if (!bookingId) {
        const bookingRes = await fetch("/api/bookings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            listingId: isAlaCarte ? null : (data?.id ?? null),
            vendorId: data?.vendorId ?? searchParams.get("vendorId") ?? null,
            quantity: normalizedQuantity,
            eventDate,
            eventStartTime: eventStartTime || undefined,
            eventEndTime: eventEndTime || undefined,
            eventLocation,
            eventLocationLat,
            eventLocationLng,
            // Always send customerEventTitle — we use board name for existing boards so My Events
            // can group the booking under the right board by name-matching.
            customerEventId: undefined,
            customerEventTitle: eventMode === "existing"
              ? (customerEvents.find((b) => b.id === selectedCustomerEventId)?.name ?? undefined)
              : (newEventTitle.trim() || undefined),
            specialRequests: customerNotes?.trim() || undefined,
            customerNotes: customerNotes?.trim() || undefined,
            customerQuestions: customerQuestions?.trim() || undefined,
            idempotencyKey: activeIdempotencyKey,
            finalPaymentStrategy: "immediately",
            promoCode: appliedPromo ? appliedPromo.code : undefined,
            packageId: selectedPackageId || undefined,
            addOns: selectedAddons.length > 0 ? selectedAddons : undefined,
          }),
        });

        const bookingJson = await bookingRes.json().catch(() => ({}));
        if (!bookingRes.ok) {
          const detail = typeof bookingJson?.detail === "string" ? ` (${bookingJson.detail})` : "";
          throw new Error((bookingJson?.error || "Checkout failed") + detail);
        }

        bookingId = typeof bookingJson?.id === "string" ? bookingJson.id : "";
        if (!bookingId) {
          throw new Error("Booking was created, but booking ID is missing. Please try again.");
        }
        if (typeof bookingJson?.pendingReason === "string") {
          setBookingPendingReason(bookingJson.pendingReason);
        }
      }

      const pendingDraft: CheckoutPendingPaymentDraft = {
        listingId: data?.id ?? listingId ?? "",
        bookingId,
        idempotencyKey: activeIdempotencyKey,
        createdAt: new Date().toISOString(),
      };
      persistPendingPaymentDraft(pendingDraft);

      setSubmitStage("initializing-payment");
      const initPaymentRes = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}/initialize-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        }
      );
      const initPaymentJson = await initPaymentRes.json().catch(() => ({}));
      if (!initPaymentRes.ok) {
        throw new Error(initPaymentJson?.error || "Unable to initialize payment");
      }

      const clientSecret =
        typeof initPaymentJson?.clientSecret === "string" ? initPaymentJson.clientSecret : "";
      if (!clientSecret) {
        throw new Error("Payment initialization response is missing a client secret");
      }

      setSubmitStage("confirming-payment");
      const confirmResult = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: contactName || undefined,
            email: contactEmail || undefined,
            address:
              data.deliveryIncluded && deliveryAddress
                ? {
                    line1: deliveryAddress,
                    city: deliveryCity || undefined,
                    state: deliveryState || undefined,
                    postal_code: deliveryZip || undefined,
                    country: "US",
                  }
                : undefined,
          },
        },
        // Save the card off-session so the server can charge the security deposit
        // automatically after booking confirmation without another card entry.
        setup_future_usage: securityDepositCents > 0 ? "off_session" : undefined,
      });

      if (confirmResult.error) {
        throw new Error(confirmResult.error.message || "Payment confirmation failed");
      }

      const paymentIntentStatus = confirmResult.paymentIntent?.status || "";
      if (paymentIntentStatus === "succeeded" || paymentIntentStatus === "processing") {
        persistPendingPaymentDraft(null);
        const pendingReasonParam = bookingPendingReason ? `&pendingReason=${encodeURIComponent(bookingPendingReason)}` : "";
        setLocation(`/dashboard/events?bookingId=${encodeURIComponent(bookingId)}${pendingReasonParam}`);
        return;
      }

      throw new Error(
        `Payment requires additional action (${paymentIntentStatus || "unknown"}). Please try again.`
      );
    } catch (e: any) {
      const message = e?.message || "Checkout failed";
      if (typeof message === "string" && message.includes("Booking not found")) {
        persistPendingPaymentDraft(null);
      }
      if (typeof message === "string" && message.toLowerCase().includes("email address must be verified")) {
        setSubmitError("Please verify your email address before booking. Check your inbox for a verification email and try again.");
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitStage("idle");
      setIsSubmitting(false);
    }
  }

  if (!listingId) return <div className="p-6">{t("checkout.missingListingId")}</div>;
  if (isLoading) return <div className="p-6">{t("checkout.loading")}</div>;
  if (error) return <div className="p-6">{t("checkout.errorLoading")}</div>;
  if (!data && !isAlaCarte) return <div className="p-6">{t("checkout.listingNotFound")}</div>;

  // Synthetic data for a-la-carte bundle checkout (no single parent listing)
  const effectiveData = data ?? {
    id: null,
    vendorId: searchParams.get("vendorId") || null,
    title: "A-la-carte Bundle",
    priceCents: 0,
    deliveryIncluded: false,
    instantBookEnabled: false,
    cancellationPolicy: "cancel_anytime",
    cancellationPolicyHours: 48,
    photos: [],
    pricingUnit: "per_day",
    availableQuantity: 999,
    shopActive: true,
    vacationBlocks: [],
    category: null,
    serviceCenter: null,
  };

  const cover = effectiveData.photos?.[0];

  return (
    <>
    <div className="w-full min-h-screen">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col px-4 py-4 sm:px-6">
      <button
        onClick={() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            setLocation(`/listing/${listingId}`);
          }
        }}
        className="mb-3 flex items-center text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        {t("checkout.backToListing")}
      </button>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_520px]">
      {/* LEFT: Billing + Payment */}
      <div className="space-y-4">
        {/* Billing Details */}
        <section>
          <h2 className="mb-2 text-xl font-semibold">{t("checkout.billingDetails")}</h2>

          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">{t("checkout.fullName")}</Label>
              <Input
                id="contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={t("checkout.fullNamePlaceholder")}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">{t("checkout.email")} <span className="text-red-500">*</span></Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder={t("checkout.emailPlaceholder")}
                className={`h-10 ${hasAttemptedSubmit && !contactEmail ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              />
              {hasAttemptedSubmit && !contactEmail && (
                <p className="text-xs text-red-600">Email is required.</p>
              )}
            </div>

            {/* Event / delivery address — hidden for venue listings since the event takes place at the venue. */}
            {!isVenueListing && <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="delivery-line1">
                  {effectiveData.deliveryIncluded
                    ? `Where would you like ${effectiveData.title || "this"} delivered?`
                    : "Where will the event be taking place?"}
                  {" "}<span className="text-red-500">*</span>
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    setUseMapPicker((v) => !v);
                    setDeliveryLocation(null);
                    setDeliveryAddress("");
                    setDeliveryCity("");
                    setDeliveryState("");
                    setDeliveryZip("");
                  }}
                  className="text-xs text-[#4a6a7d] hover:underline shrink-0"
                >
                  {useMapPicker ? "Search by address" : "No address? Pick on map"}
                </button>
              </div>

              {useMapPicker ? (
                <MapLocationPicker
                  value={deliveryLocation ? { lat: deliveryLocation.lat, lng: deliveryLocation.lng } : null}
                  onChange={({ lat, lng }) => {
                    setDeliveryLocation({
                      id: `map-pin-${lat}-${lng}`,
                      label: `Pin dropped at ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                      lat,
                      lng,
                    });
                  }}
                  onGeocode={({ city, state, zip, label }) => {
                    if (city) setDeliveryCity(city);
                    if (state) setDeliveryState(state);
                    if (zip) setDeliveryZip(zip);
                    setDeliveryLocation((prev) =>
                      prev ? { ...prev, label } : prev
                    );
                  }}
                />
              ) : (
                <LocationPicker
                  value={deliveryLocation}
                  onChange={(loc) => {
                    setDeliveryLocation(loc);
                    if (!loc) {
                      setDeliveryAddress("");
                      setDeliveryCity("");
                      setDeliveryState("");
                      setDeliveryZip("");
                      return;
                    }
                    setDeliveryAddress(loc.street || "");
                    setDeliveryCity(loc.city || "");
                    setDeliveryState(loc.state || "");
                    setDeliveryZip(loc.postalCode || "");
                  }}
                  placeholder={
                    effectiveData.deliveryIncluded
                      ? t("checkout.deliveryAddressPlaceholder")
                      : "Search for the event location..."
                  }
                />
              )}

              {hasAttemptedSubmit && !deliveryLocation && (
                <p className="text-xs text-red-600">Please enter the event location.</p>
              )}
            </div>

            {/* Street / City / ZIP / State — always shown */}
            <div className="space-y-2">
              <Label htmlFor="delivery-street">
                Street Address
                {!useMapPicker && <span className="text-red-500"> *</span>}
              </Label>
              <Input
                id="delivery-street"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder={useMapPicker ? "Optional — no street address needed for pin locations" : "123 Main St"}
                className={`h-10 ${hasAttemptedSubmit && !useMapPicker && !deliveryAddress ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              />
              {hasAttemptedSubmit && !useMapPicker && !deliveryAddress && (
                <p className="text-xs text-red-600">Street address is required.</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="delivery-city">
                  {t("checkout.deliveryCity")}
                  {effectiveData.deliveryIncluded && <span className="text-red-500"> *</span>}
                </Label>
                <Input
                  id="delivery-city"
                  value={deliveryCity}
                  onChange={(e) => setDeliveryCity(e.target.value)}
                  placeholder={t("checkout.deliveryCity")}
                  className={`h-10 ${hasAttemptedSubmit && effectiveData.deliveryIncluded && !deliveryCity ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                {hasAttemptedSubmit && effectiveData.deliveryIncluded && !deliveryCity && (
                  <p className="text-xs text-red-600">City is required.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="delivery-zip">
                  {t("checkout.deliveryZip")}
                  {effectiveData.deliveryIncluded && <span className="text-red-500"> *</span>}
                </Label>
                <Input
                  id="delivery-zip"
                  value={deliveryZip}
                  onChange={(e) => setDeliveryZip(e.target.value)}
                  placeholder="ZIP"
                  className={`h-10 ${hasAttemptedSubmit && effectiveData.deliveryIncluded && !deliveryZip ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                {hasAttemptedSubmit && effectiveData.deliveryIncluded && !deliveryZip && (
                  <p className="text-xs text-red-600">ZIP code is required.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delivery-state">
                {t("checkout.deliveryState")}
                {effectiveData.deliveryIncluded && <span className="text-red-500"> *</span>}
              </Label>
              <Input
                id="delivery-state"
                value={deliveryState}
                onChange={(e) => setDeliveryState(e.target.value)}
                placeholder={t("checkout.deliveryState")}
                className={`h-10 ${hasAttemptedSubmit && effectiveData.deliveryIncluded && !deliveryState ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              />
              {hasAttemptedSubmit && effectiveData.deliveryIncluded && !deliveryState && (
                <p className="text-xs text-red-600">State is required.</p>
              )}
            </div>
            </>}
          </div>
        </section>

        <div className="h-px w-full bg-[rgba(74,106,125,0.22)]" aria-hidden />

        {/* Booking Notes */}
        <section>
          <h2 className="mb-2 text-xl font-semibold">{t("checkout.event")}</h2>

          <div className="mb-4 space-y-3 p-4">
            {customerEvents.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="existing-event">{t("checkout.eventAddToExisting")}</Label>
                <Select
                  value={selectedCustomerEventId || undefined}
                  onValueChange={(value) => {
                    setEventMode("existing");
                    setSelectedCustomerEventId(value);
                    setNewEventQueuedTitle("");
                  }}
                >
                  <SelectTrigger id="existing-event" className="h-10 w-full text-sm">
                    <SelectValue placeholder={t("checkout.eventSelectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {customerEvents.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{t("checkout.eventCreateFirst")}</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-event-title">{t("checkout.eventName")}</Label>
              <Input
                id="new-event-title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder={t("checkout.eventNamePlaceholder")}
                className="h-10"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant={newEventTitle.trim().length > 0 ? "default" : "outline"}
                className={
                  newEventTitle.trim().length > 0
                    ? "bg-primary text-primary-foreground border border-primary-border hover:bg-primary/90"
                    : undefined
                }
                disabled={newEventTitle.trim().length === 0}
                onClick={async () => {
                  const nextTitle = newEventTitle.trim();
                  if (!nextTitle) return;
                  setEventMode("new");
                  setSelectedCustomerEventId("");
                  setNewEventQueuedTitle(nextTitle);
                  // Create a planning board so the booking appears grouped under it in My Events
                  try {
                    const token = await getAccessTokenSilently({
                      authorizationParams: { audience: "https://eventhub-api", scope: "openid profile email" },
                    });
                    await fetch("/api/boards", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ name: nextTitle }),
                    });
                  } catch {
                    // Non-blocking — booking still gets the event title even if board creation fails
                  }
                }}
              >
                {t("checkout.eventCreateButton")}
              </Button>
              {eventMode === "new" && newEventQueuedTitle ? (
                <span className="text-sm text-primary">
                  {t("checkout.listingWillBeAdded", { title: effectiveData.title, event: newEventQueuedTitle })}
                </span>
              ) : null}
            </div>
            {hasAttemptedSubmit && !(eventMode === "existing" ? selectedCustomerEventId : newEventTitle.trim().length > 0) && (
              <p className="text-xs text-red-600">Please select an existing event or create a new one.</p>
            )}

            {maxAvailableQuantity > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="booking-quantity">{t("checkout.quantity")}</Label>
                <Select
                  value={String(normalizedQuantity)}
                  onValueChange={(value) => {
                    const parsed = Number(value);
                    if (!Number.isFinite(parsed)) return;
                    setQuantity(parsed);
                  }}
                >
                  <SelectTrigger id="booking-quantity" className="h-10 w-full text-sm md:w-[220px]">
                    <SelectValue placeholder={t("checkout.quantitySelectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: maxAvailableQuantity }, (_, index) => index + 1).map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {t("checkout.unitsAvailable", { count: maxAvailableQuantity })}
                </p>
              </div>
            ) : null}

            {isHourlyBooking ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="event-start-time">{t("checkout.hourlySetupByLabel")}</Label>
                  <TimeInput
                    id="event-start-time"
                    value={eventStartTime}
                    onChange={(nextStartTime) => {
                      setEventStartTime(nextStartTime);

                      const nextSuggestedEndTime = getSuggestedEndTime(nextStartTime, hourlyMinimumHours);
                      const currentStartMinutes = parseTimeToMinutes(nextStartTime);
                      const currentEndMinutes = parseTimeToMinutes(eventEndTime);
                      const minimumMinutes =
                        typeof hourlyMinimumHours === "number" && Number.isFinite(hourlyMinimumHours)
                          ? hourlyMinimumHours * 60
                          : 60;

                      if (
                        !eventEndTime ||
                        currentStartMinutes == null ||
                        currentEndMinutes == null ||
                        currentEndMinutes <= currentStartMinutes ||
                        currentEndMinutes - currentStartMinutes < minimumMinutes
                      ) {
                        setEventEndTime(nextSuggestedEndTime);
                      }
                    }}
                    className="h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="event-end-time">{t("checkout.hourlyTakedownLabel")}</Label>
                  <TimeInput
                    id="event-end-time"
                    value={eventEndTime}
                    onChange={setEventEndTime}
                    className="h-10"
                  />
                </div>

                <div className="md:col-span-2 text-sm text-muted-foreground">
                  {hourlyMinimumHours != null
                    ? t("checkout.hourlyCalendarNoteMin", { count: hourlyMinimumHours })
                    : t("checkout.hourlyCalendarNote")}
                </div>
                {hourlyTimeRangeError ? (
                  <div className="md:col-span-2 text-sm text-red-600">{hourlyTimeRangeError}</div>
                ) : hourlyDurationHours != null ? (
                  <div className="md:col-span-2 text-sm text-muted-foreground">
                    {t("checkout.hourlyReservedWindow", { count: hourlyDurationHours, start: eventStartTime, end: eventEndTime })}
                  </div>
                ) : null}
              </div>
            ) : shouldShowPerDayLogistics ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-medium">{t("checkout.logisticsHeading")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("checkout.logisticsTip", { title: effectiveData.title })}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="event-start-time">{t("checkout.eventStartLabel")}</Label>
                    <TimeInput
                      id="event-start-time"
                      value={eventStartTime}
                      onChange={setEventStartTime}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="event-end-time">{t("checkout.eventEndLabel")}</Label>
                    <TimeInput
                      id="event-end-time"
                      value={eventEndTime}
                      onChange={setEventEndTime}
                      className="h-10"
                    />
                  </div>

                </div>
                {perDayTimeError && (eventStartTime || eventEndTime) ? (
                  <div className="text-sm text-red-600">{perDayTimeError}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <div className="h-px w-full bg-[rgba(74,106,125,0.22)]" aria-hidden />

        <section>
          <h2 className="mb-2 text-xl font-semibold">{t("checkout.notesAndQuestions")}</h2>

          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="customer-notes">{t("checkout.notesForVendor")}</Label>
              <Textarea
                id="customer-notes"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder={t("checkout.notesForVendorPlaceholder")}
                className="min-h-[72px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-questions">{t("checkout.questionsForVendor")}</Label>
              <Textarea
                id="customer-questions"
                value={customerQuestions}
                onChange={(e) => setCustomerQuestions(e.target.value)}
                placeholder={t("checkout.questionsForVendorPlaceholder")}
                className="min-h-[72px]"
              />
            </div>
          </div>
        </section>

      </div>

      {/* RIGHT: Order Summary */}
      <aside className="space-y-4">
        <div className="p-4">
          <h2 className="mb-2 text-xl font-semibold">{t("checkout.orderSummary")}</h2>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {cover ? <img src={cover} alt={effectiveData.title} className="w-full h-full object-cover" /> : null}
                </div>
                <div>
                  <div className="font-medium leading-tight">
                    {effectiveData.title}
                    {selectedPackage?.title ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">— {selectedPackage.title}</span>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground">{effectiveData.vendorName}</div>
                  <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{eventDate}</span>
                  </div>
                  {normalizedQuantity > 1 ? (
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("checkout.quantityDisplay", { count: normalizedQuantity })}
                    </div>
                  ) : null}
                  {eventStartTime && eventEndTime ? (
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("checkout.rentalWindow", { start: eventStartTime, end: eventEndTime })}
                    </div>
                  ) : null}
                  {effectiveData.deliveryIncluded ? (
                    <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{t("checkout.deliveryIncluded")}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="text-right">
                <div className="font-medium">{formatUsdFromCents(baseSubtotal)}</div>
              </div>
            </div>

            <div className="border-t border-[rgba(74,106,125,0.22)]" />

            {/* Promo code input */}
            {!appliedPromo && (
              <div className="flex gap-2">
                <Input
                  value={promoCodeInput}
                  onChange={(e) => {
                    setPromoCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                    setPromoError(null);
                  }}
                  placeholder={t("checkout.promoCode")}
                  className="font-mono tracking-widest uppercase h-9 text-sm"
                  maxLength={32}
                  onKeyDown={(e) => { if (e.key === "Enter") handleApplyPromoCode(); }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-[rgba(74,106,125,0.22)] text-[#4a6a7d]"
                  onClick={handleApplyPromoCode}
                  disabled={!promoCodeInput.trim() || promoLoading}
                >
                  {promoLoading ? t("checkout.promoCodeApplying") : t("checkout.promoCodeApply")}
                </Button>
              </div>
            )}
            {appliedPromo && (
              <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                <span>{t("checkout.promoApplied", { code: appliedPromo.code, percent: appliedPromo.percentOff })}</span>
                <button
                  type="button"
                  onClick={() => { setAppliedPromo(null); setPromoCodeInput(""); }}
                  className="ml-2 text-green-600 hover:text-green-800 font-medium underline text-xs"
                >
                  {t("checkout.promoCodeRemove")}
                </button>
              </div>
            )}
            {promoError && (
              <p className="text-sm text-red-600">{promoError}</p>
            )}
            {!appliedPromo && activeSale && (
              <div className="flex items-center gap-2 rounded-lg bg-[#e07a6a]/10 border border-[#e07a6a]/30 px-3 py-2 text-sm text-[#c9695a]">
                {t("checkout.saleApplied", { percent: activeSale.percentOff })}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t("checkout.orderSummarySubtotal")}
                  {isHourlyBooking && hourlyDurationHours != null
                    ? ` (${hourlyDurationHours % 1 === 0 ? hourlyDurationHours : hourlyDurationHours.toFixed(1)} hrs × ${formatUsdFromCents(effectivePriceCents)})`
                    : normalizedQuantity > 1
                      ? ` (${normalizedQuantity} x ${formatUsdFromCents(effectivePriceCents)})`
                      : ""}
                </span>
                <span className="font-medium">{formatUsdFromCents(baseSubtotal)}</span>
              </div>

              {selectedAddons.map(({ id, quantity: addonQty }) => {
                const addon = data?.attachedAddons?.find((a: { id: string; title: string | null; priceCents: number | null }) => String(a.id) === id);
                if (!addon?.priceCents) return null;
                return (
                  <div key={id} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {addon.title ?? "Add-on"}{addonQty > 1 ? ` ×${addonQty}` : ""}
                    </span>
                    <span className="font-medium">{formatUsdFromCents(addon.priceCents * addonQty)}</span>
                  </div>
                );
              })}

              {combinedLogisticsCents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {`Logistics (${logisticsLineLabels.join(", ")})`}
                  </span>
                  <span className="font-medium">{formatUsdFromCents(combinedLogisticsCents)}</span>
                </div>
              ) : null}

              {travelFlatFeeCents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("checkout.orderSummaryTravelFee")}</span>
                  <span className="font-medium">{formatUsdFromCents(travelFlatFeeCents)}</span>
                </div>
              ) : null}

              {variableTravelFeePending ? (
                <div className="text-sm text-muted-foreground">
                  {data?.travelFeeType === "per_mile"
                    ? t("checkout.travelFeePerMileNote")
                    : t("checkout.travelFeePerHourNote")}
                </div>
              ) : null}

              {discountAmountCents > 0 && activeDiscountLabel ? (
                <div className="flex items-center justify-between text-[#e07a6a]">
                  <span className="text-sm font-medium">{activeDiscountLabel}</span>
                  <span className="font-medium">−{formatUsdFromCents(discountAmountCents)}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("checkout.orderSummaryServiceFee")}</span>
                <span className="font-medium">{formatUsdFromCents(customerFeeAmount)}</span>
              </div>

              {securityDepositCents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Security deposit <span className="text-xs">(refundable)</span>
                  </span>
                  <span className="font-medium">{formatUsdFromCents(securityDepositCents)}</span>
                </div>
              ) : null}

              <div className="border-t border-[rgba(74,106,125,0.22)] pt-4 flex items-center justify-between">
                <div className="text-xl font-semibold">{t("checkout.orderSummaryTotal")}</div>
                <div className="text-3xl font-bold">{formatUsdFromCents(customerTotal)}</div>
              </div>

              {securityDepositCents > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Security deposit of {formatUsdFromCents(securityDepositCents)} is charged separately after booking confirmation and refunded after your event.
                </p>
              ) : null}

              <div className="space-y-2">
                <Label>{t("checkout.cardNumber")}</Label>
                <div className={`rounded-md border p-3 ${hasAttemptedSubmit && !cardComplete ? "border-red-500" : "border-border"}`}>
                  <CardElement
                    options={{ hidePostalCode: true, disableLink: true }}
                    onChange={(event) => {
                      setCardComplete(Boolean(event.complete));
                      if (event.error?.message) setSubmitError(event.error.message);
                      else if (submitError && submitError.toLowerCase().includes("card")) setSubmitError(null);
                    }}
                  />
                </div>
              </div>

              {import.meta.env.DEV && (
                <p className="text-sm text-muted-foreground">Dev only — Stripe test card: 4242 4242 4242 4242</p>
              )}

              {hasAttemptedSubmit && !cardComplete && !submitError && (
                <p className="text-xs text-red-600">Please enter your card details.</p>
              )}

              {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

              {pendingPaymentDraft && !submitError ? (
                <p className="text-sm text-amber-700">
                  {t("checkout.pendingPaymentNote")}
                </p>
              ) : null}

              {!stripeConfigured || stripeConfigError ? (
                <p className="text-sm text-red-600">
                  {stripeConfigError || "Stripe is not configured for checkout. Add `VITE_STRIPE_PUBLISHABLE_KEY`."}
                </p>
              ) : null}

              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("checkout.termsDisclaimer").split("Terms of Service")[0]}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  {t("terms.title") || "Terms of Service"}
                </a>
                {t("checkout.termsDisclaimer").split("Terms of Service")[1]}{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  Privacy Policy
                </a>
                {" "}applies.
              </p>

              <Button
                className="w-full h-12 text-base"
                disabled={isSubmitting}
                onClick={handleSubmitOrder}
                data-testid="button-place-order"
              >
                {isSubmitting
                  ? submitStage === "creating-booking"
                    ? t("checkout.placeOrderLoading.creatingBooking")
                    : submitStage === "initializing-payment"
                      ? t("checkout.placeOrderLoading.preparingPayment")
                      : t("checkout.placeOrderLoading.confirmingPayment")
                  : pendingPaymentDraft
                    ? t("checkout.placeOrderResume", { total: formatUsdFromCents(customerTotal) })
                    : t("checkout.placeOrder", { total: formatUsdFromCents(customerTotal) })}
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
    </div>
    </div>

    <AuthModal
      open={authModalOpen}
      onOpenChange={setAuthModalOpen}
      defaultTab="login"
      returnTo={`${window.location.pathname}${window.location.search}${window.location.hash}`}
    />
    </>
  );
}
