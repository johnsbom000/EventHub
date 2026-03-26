import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { ChevronLeft, Calendar, CheckCircle2, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LocationPicker } from "@/components/LocationPicker";
import type { LocationResult } from "@/types/location";

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
  depositScheduleId: string;
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
    if (photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("/")) return photo;
    return undefined;
  }
  if (photo && typeof photo === "object") {
    const url = photo.url;
    if (isNonEmptyString(url) && (url.startsWith("http") || url.startsWith("/"))) return url;
    const name = photo.name || photo.filename;
    if (isNonEmptyString(name)) return `/uploads/listings/${name}`;
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
const CUSTOMER_FEE_RATE = 0.05;
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

  const [eventDate, setEventDate] = useState(initialDate);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [itemNeededByTime, setItemNeededByTime] = useState("");
  const [itemDoneByTime, setItemDoneByTime] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState<LocationResult | null>(null);
  const [eventMode, setEventMode] = useState<"existing" | "new">("existing");
  const [selectedCustomerEventId, setSelectedCustomerEventId] = useState("");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventQueuedTitle, setNewEventQueuedTitle] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerQuestions, setCustomerQuestions] = useState("");

  const [cardComplete, setCardComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "creating-booking" | "initializing-payment" | "confirming-payment">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPaymentDraft, setPendingPaymentDraft] = useState<CheckoutPendingPaymentDraft | null>(null);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState("");

  const stripe = useStripe();
  const elements = useElements();
  const { isAuthenticated, loginWithRedirect, getAccessTokenSilently, user } = useAuth0();

  useEffect(() => {
    if (user?.email && !contactEmail) {
      setContactEmail(user.email);
    }
    if (user?.name && !contactName) {
      setContactName(user.name);
    }
  }, [user, contactEmail, contactName]);

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
        typeof parsed.depositScheduleId === "string" &&
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

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/listings/public", listingId],
    enabled: Boolean(listingId),
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
        ? ld.photos.urls.filter((u: any) => typeof u === "string")
        : Array.isArray(ld?.photos?.names)
          ? ld.photos.names
              .map((n: any) => (typeof n === "string" ? `/uploads/listings/${n}` : null))
              .filter(Boolean)
          : Array.isArray(ld?.photos)
            ? ld.photos.filter((u: any) => typeof u === "string")
            : [];
      const allPhotos = [...photosFromObjects, ...photosFromListingData].filter(Boolean);

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
  const { data: customerEvents = [] } = useQuery<CustomerEventOption[]>({
    queryKey: ["/api/customer/events", "checkout-event-options"],
    enabled: Boolean(isAuthenticated),
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      const res = await fetch("/api/customer/events", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to load customer events");
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!Array.isArray(customerEvents) || customerEvents.length === 0) {
      setEventMode("new");
      setSelectedCustomerEventId("");
      return;
    }
    if (eventMode === "new") return;
    const selectedStillExists = customerEvents.some((evt) => evt.id === selectedCustomerEventId);
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

  const isHourlyBooking = data?.pricingUnit === "per_hour";
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
      return "Select a start time and end time.";
    }
    const startMinutes = parseTimeToMinutes(eventStartTime);
    const endMinutes = parseTimeToMinutes(eventEndTime);
    if (startMinutes == null || endMinutes == null) {
      return "Hourly booking time range is invalid.";
    }
    if (endMinutes <= startMinutes) {
      return "End time must be after start time.";
    }
    if (hourlyMinimumHours != null && (endMinutes - startMinutes) / 60 < hourlyMinimumHours) {
      return `This listing requires at least ${hourlyMinimumHours} hour${hourlyMinimumHours === 1 ? "" : "s"}.`;
    }
    return null;
  }, [isHourlyBooking, eventStartTime, eventEndTime, hourlyMinimumHours]);
  const perDayLogisticsError = useMemo(() => {
    if (!shouldShowPerDayLogistics) return null;
    if (!eventStartTime || !eventEndTime || !itemNeededByTime || !itemDoneByTime) {
      return "Add the event times and the rental possession window.";
    }

    const actualEventStartMinutes = parseTimeToMinutes(eventStartTime);
    const actualEventEndMinutes = parseTimeToMinutes(eventEndTime);
    const neededByMinutes = parseTimeToMinutes(itemNeededByTime);
    const doneByMinutes = parseTimeToMinutes(itemDoneByTime);

    if (
      actualEventStartMinutes == null ||
      actualEventEndMinutes == null ||
      neededByMinutes == null ||
      doneByMinutes == null
    ) {
      return "One or more logistics times are invalid.";
    }
    if (actualEventEndMinutes <= actualEventStartMinutes) {
      return "Event end time must be after the event start time.";
    }
    if (doneByMinutes <= neededByMinutes) {
      return "Done-with time must be after the needed-by time.";
    }
    return null;
  }, [shouldShowPerDayLogistics, eventStartTime, eventEndTime, itemNeededByTime, itemDoneByTime]);
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
    Boolean(pendingPaymentDraft?.depositScheduleId) &&
    pendingPaymentDraft?.listingId === data?.id;

  const canSubmit =
    (hasPendingPaymentToResume
      ? true
      : Boolean(listingId) &&
        Boolean(data?.priceCents) &&
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
        (!shouldShowPerDayLogistics || !perDayLogisticsError) &&
        (!data?.deliveryIncluded || (deliveryAddress && deliveryCity && deliveryState && deliveryZip))) &&
    stripeConfigured &&
    !stripeConfigError &&
    Boolean(stripe) &&
    Boolean(elements) &&
    cardComplete &&
    !isSubmitting;
  const baseSubtotal = (data?.priceCents || 0) * normalizedQuantity;
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
  const customerFeeAmount = Math.round((baseSubtotal + logisticsSubtotal) * CUSTOMER_FEE_RATE);
  const customerTotal = baseSubtotal + logisticsSubtotal + customerFeeAmount;

  async function handleSubmitOrder() {
    setSubmitError(null);

    if (!listingId || !data) return;

    if (!isAuthenticated) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      try {
        await loginWithRedirect({
          appState: { returnTo },
          authorizationParams: {
            prompt: "login",
          },
        });
      } catch (error: any) {
        setSubmitError(error?.message || "Unable to start login. Please try again.");
      }
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
    if (!hasPendingPaymentToResume && (!data.priceCents || data.priceCents <= 0)) {
      setSubmitError("This listing does not have a valid price.");
      return;
    }
    if (!hasPendingPaymentToResume && isHourlyBooking && hourlyTimeRangeError) {
      setSubmitError(hourlyTimeRangeError);
      return;
    }
    if (!hasPendingPaymentToResume && shouldShowPerDayLogistics && perDayLogisticsError) {
      setSubmitError(perDayLogisticsError);
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
      const eventLocation =
        data.deliveryIncluded && deliveryAddress
          ? `${deliveryAddress}, ${deliveryCity}, ${deliveryState} ${deliveryZip}`.trim()
          : undefined;

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
      let depositScheduleId = pendingPaymentDraft?.depositScheduleId || "";

      if (!bookingId || !depositScheduleId) {
        const bookingRes = await fetch("/api/bookings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            listingId: data.id,
            vendorId: data.vendorId,
            quantity: normalizedQuantity,
            eventDate,
            eventStartTime: eventStartTime || undefined,
            eventEndTime: eventEndTime || undefined,
            itemNeededByTime:
              shouldShowPerDayLogistics
                ? itemNeededByTime || undefined
                : eventStartTime || undefined,
            itemDoneByTime:
              shouldShowPerDayLogistics
                ? itemDoneByTime || undefined
                : eventEndTime || undefined,
            eventLocation,
            customerEventId: eventMode === "existing" ? selectedCustomerEventId : undefined,
            customerEventTitle: eventMode === "new" ? newEventTitle.trim() : undefined,
            specialRequests: customerNotes?.trim() || undefined,
            customerNotes: customerNotes?.trim() || undefined,
            customerQuestions: customerQuestions?.trim() || undefined,
            idempotencyKey: activeIdempotencyKey,
            finalPaymentStrategy: "immediately",
          }),
        });

        const bookingJson = await bookingRes.json().catch(() => ({}));
        if (!bookingRes.ok) {
          throw new Error(bookingJson?.error || "Checkout failed");
        }

        bookingId = typeof bookingJson?.id === "string" ? bookingJson.id : "";
        depositScheduleId =
          typeof bookingJson?.payment?.depositScheduleId === "string"
            ? bookingJson.payment.depositScheduleId
            : "";
        if (!bookingId || !depositScheduleId) {
          throw new Error("Booking was created, but payment setup is incomplete. Please try again.");
        }
      }

      const pendingDraft: CheckoutPendingPaymentDraft = {
        listingId: data.id,
        bookingId,
        depositScheduleId,
        idempotencyKey: activeIdempotencyKey,
        createdAt: new Date().toISOString(),
      };
      persistPendingPaymentDraft(pendingDraft);

      setSubmitStage("initializing-payment");
      const initPaymentRes = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}/payments/${encodeURIComponent(depositScheduleId)}`,
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
      });

      if (confirmResult.error) {
        throw new Error(confirmResult.error.message || "Payment confirmation failed");
      }

      const paymentIntentStatus = confirmResult.paymentIntent?.status || "";
      if (paymentIntentStatus === "succeeded" || paymentIntentStatus === "processing") {
        persistPendingPaymentDraft(null);
        setLocation(`/dashboard/events?bookingId=${encodeURIComponent(bookingId)}`);
        return;
      }

      throw new Error(
        `Payment requires additional action (${paymentIntentStatus || "unknown"}). Please try again.`
      );
    } catch (e: any) {
      const message = e?.message || "Checkout failed";
      if (
        typeof message === "string" &&
        (message.includes("Booking not found") || message.includes("schedule not found"))
      ) {
        persistPendingPaymentDraft(null);
      }
      setSubmitError(e?.message || "Checkout failed");
    } finally {
      setSubmitStage("idle");
      setIsSubmitting(false);
    }
  }

  if (!listingId) return <div className="p-6">Missing listing id</div>;
  if (isLoading) return <div className="p-6">Loading checkout…</div>;
  if (error) return <div className="p-6">Error loading checkout</div>;
  if (!data) return <div className="p-6">Listing not found</div>;

  const cover = data.photos?.[0];

  return (
    <div className="w-full h-[calc(100vh-64px)] overflow-hidden">
      <div className="mx-auto flex h-full w-[75vw] max-w-[1600px] min-w-[980px] flex-col px-6 py-4">
      <button
        onClick={() => setLocation(`/listing/${listingId}`)}
        className="mb-3 flex items-center text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back to listing
      </button>

    <div className="grid flex-1 min-h-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_520px]">
      {/* LEFT: Billing + Payment */}
      <div className="space-y-4">
        {/* Billing Details */}
        <section>
          <h2 className="mb-2 text-xl font-semibold">Billing Details</h2>

          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Full name</Label>
              <Input
                id="contact-name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Doe"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="jane@email.com"
                className="h-10"
              />
            </div>

            {data.deliveryIncluded ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="delivery-line1">Delivery address</Label>
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

                      const label = (loc as any).label || (loc as any).place_name || "";
                      const parsed = parseAddressFromLabel(label);

                      setDeliveryAddress(parsed.streetAddress || label);
                      setDeliveryCity((loc as any).city || parsed.city || "");
                      setDeliveryState((loc as any).state || parsed.state || "");
                      setDeliveryZip((loc as any).zipCode || parsed.zipCode || "");
                    }}
                    placeholder="Start typing your delivery address"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="delivery-city">City</Label>
                    <Input
                      id="delivery-city"
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder="City"
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="delivery-zip">Zip/Postal Code</Label>
                    <Input
                      id="delivery-zip"
                      value={deliveryZip}
                      onChange={(e) => setDeliveryZip(e.target.value)}
                      placeholder="ZIP"
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delivery-state">State</Label>
                  <Input
                    id="delivery-state"
                    value={deliveryState}
                    onChange={(e) => setDeliveryState(e.target.value)}
                    placeholder="State"
                    className="h-10"
                  />
                </div>
              </>
            ) : null}
          </div>
        </section>

        <div className="h-px w-full bg-[rgba(74,106,125,0.22)]" aria-hidden />

        {/* Booking Notes */}
        <section>
          <h2 className="mb-2 text-xl font-semibold">Event</h2>

          <div className="mb-4 space-y-3 p-4">
            {customerEvents.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="existing-event">Add to existing event</Label>
                <Select
                  value={selectedCustomerEventId || undefined}
                  onValueChange={(value) => {
                    setEventMode("existing");
                    setSelectedCustomerEventId(value);
                    setNewEventQueuedTitle("");
                  }}
                >
                  <SelectTrigger id="existing-event" className="h-10 w-full text-sm">
                    <SelectValue placeholder="Select an event" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerEvents.map((evt) => (
                      <SelectItem key={evt.id} value={evt.id}>
                        {evt.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Create your first event</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-event-title">Event name</Label>
              <Input
                id="new-event-title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="Ex: Maddie and Joshes Wedding"
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
                onClick={() => {
                  const nextTitle = newEventTitle.trim();
                  if (!nextTitle) return;
                  setEventMode("new");
                  setSelectedCustomerEventId("");
                  setNewEventQueuedTitle(nextTitle);
                }}
              >
                Create New Event
              </Button>
              {eventMode === "new" && newEventQueuedTitle ? (
                <span className="text-sm text-primary">
                  {data.title} will be added to {newEventQueuedTitle}.
                </span>
              ) : null}
            </div>

            {maxAvailableQuantity > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="booking-quantity">Quantity</Label>
                <Select
                  value={String(normalizedQuantity)}
                  onValueChange={(value) => {
                    const parsed = Number(value);
                    if (!Number.isFinite(parsed)) return;
                    setQuantity(parsed);
                  }}
                >
                  <SelectTrigger id="booking-quantity" className="h-10 w-full text-sm md:w-[220px]">
                    <SelectValue placeholder="Select quantity" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: maxAvailableQuantity }, (_, index) => index + 1).map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {maxAvailableQuantity} identical unit{maxAvailableQuantity === 1 ? "" : "s"} available.
                </p>
              </div>
            ) : null}

            {isHourlyBooking ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="event-start-time">When do you need this setup by?</Label>
                  <Input
                    id="event-start-time"
                    type="time"
                    value={eventStartTime}
                    onChange={(e) => {
                      const nextStartTime = e.target.value;
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
                    <Label htmlFor="event-end-time">When can it be taken down?</Label>
                  <Input
                    id="event-end-time"
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div className="md:col-span-2 text-sm text-muted-foreground">
                  {hourlyMinimumHours != null
                    ? `${hourlyWindowGuidance} These two times are used as booking start/end for calendar sync. Minimum ${hourlyMinimumHours} hour${hourlyMinimumHours === 1 ? "" : "s"}.`
                    : `${hourlyWindowGuidance} These two times are used as booking start/end for calendar sync.`}
                </div>
                {hourlyTimeRangeError ? (
                  <div className="md:col-span-2 text-sm text-red-600">{hourlyTimeRangeError}</div>
                ) : hourlyDurationHours != null ? (
                  <div className="md:col-span-2 text-sm text-muted-foreground">
                    Reserved window: {hourlyDurationHours} hour{hourlyDurationHours === 1 ? "" : "s"}
                  </div>
                ) : null}
              </div>
            ) : shouldShowPerDayLogistics ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-medium">Logistics</h3>
                  <p className="text-sm text-muted-foreground">
                    Tell the vendor when your event happens and when you need {data.title} in your possession.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="event-start-time">When does your event start?</Label>
                    <Input
                      id="event-start-time"
                      type="time"
                      value={eventStartTime}
                      onChange={(e) => setEventStartTime(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="event-end-time">When does your event end?</Label>
                    <Input
                      id="event-end-time"
                      type="time"
                      value={eventEndTime}
                      onChange={(e) => setEventEndTime(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="item-needed-by-time">When do you need this setup by?</Label>
                    <Input
                      id="item-needed-by-time"
                      type="time"
                      value={itemNeededByTime}
                      onChange={(e) => setItemNeededByTime(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="item-done-by-time">When can it be taken down?</Label>
                    <Input
                      id="item-done-by-time"
                      type="time"
                      value={itemDoneByTime}
                      onChange={(e) => setItemDoneByTime(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="md:col-span-2 text-sm text-muted-foreground">
                    Use the needed-by and done-with window for the actual rental possession period. Include buffer for{" "}
                    {data.deliveryIncluded ? "delivery" : data.pickupEnabled ? "pickup" : "service access"}
                    {data.setupIncluded && (data as any)?.takedownIncluded
                      ? ", setup, and takedown"
                      : data.setupIncluded
                        ? ", setup"
                        : (data as any)?.takedownIncluded
                          ? ", takedown"
                          : ""}{" "}
                    so the vendor has enough time on both sides.
                  </div>
                  {perDayLogisticsError ? (
                    <div className="md:col-span-2 text-sm text-red-600">{perDayLogisticsError}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="h-px w-full bg-[rgba(74,106,125,0.22)]" aria-hidden />

        <section>
          <h2 className="mb-2 text-xl font-semibold">Notes and Questions</h2>

          <div className="space-y-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="customer-notes">Notes for vendor</Label>
              <Textarea
                id="customer-notes"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Add setup notes, preferences, venue rules, etc."
                className="min-h-[72px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-questions">Questions for vendor</Label>
              <Textarea
                id="customer-questions"
                value={customerQuestions}
                onChange={(e) => setCustomerQuestions(e.target.value)}
                placeholder="Ask any questions you want the vendor to answer."
                className="min-h-[72px]"
              />
            </div>
          </div>
        </section>

      </div>

      {/* RIGHT: Order Summary */}
      <aside className="space-y-4">
        <div className="p-4">
          <h2 className="mb-2 text-xl font-semibold">Order Summary</h2>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {cover ? <img src={cover} alt={data.title} className="w-full h-full object-cover" /> : null}
                </div>
                <div>
                  <div className="font-medium leading-tight">{data.title}</div>
                  <div className="text-sm text-muted-foreground">{data.vendorName}</div>
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{eventDate}</span>
                  </div>
                  {normalizedQuantity > 1 ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Quantity: {normalizedQuantity}
                    </div>
                  ) : null}
                  {isHourlyBooking && eventStartTime && eventEndTime ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Rental window: {eventStartTime} - {eventEndTime}
                    </div>
                  ) : null}
                  {shouldShowPerDayLogistics && itemNeededByTime && itemDoneByTime ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Rental window: {itemNeededByTime} - {itemDoneByTime}
                    </div>
                  ) : null}
                  {shouldShowPerDayLogistics && eventStartTime && eventEndTime ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Event time: {eventStartTime} - {eventEndTime}
                    </div>
                  ) : null}
                  {data.deliveryIncluded ? (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>Delivery Included</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="text-right">
                <div className="font-medium">{formatUsdFromCents(baseSubtotal)}</div>
              </div>
            </div>

            <div className="border-t border-[rgba(74,106,125,0.22)]" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Sub total{normalizedQuantity > 1 ? ` (${normalizedQuantity} x ${formatUsdFromCents(data.priceCents || 0)})` : ""}
                </span>
                <span className="font-medium">{formatUsdFromCents(baseSubtotal)}</span>
              </div>

              {deliveryFeeCents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Delivery fee</span>
                  <span className="font-medium">{formatUsdFromCents(deliveryFeeCents)}</span>
                </div>
              ) : null}

              {setupFeeCents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Setup fee</span>
                  <span className="font-medium">{formatUsdFromCents(setupFeeCents)}</span>
                </div>
              ) : null}

              {takedownFeeCents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Takedown fee</span>
                  <span className="font-medium">{formatUsdFromCents(takedownFeeCents)}</span>
                </div>
              ) : null}

              {travelFlatFeeCents > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Travel fee</span>
                  <span className="font-medium">{formatUsdFromCents(travelFlatFeeCents)}</span>
                </div>
              ) : null}

              {variableTravelFeePending ? (
                <div className="text-xs text-muted-foreground">
                  Travel fee is configured as {data?.travelFeeType === "per_mile" ? "per mile" : "per hour"} and will
                  be finalized by the vendor.
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Service fee (5%)</span>
                <span className="font-medium">{formatUsdFromCents(customerFeeAmount)}</span>
              </div>

              <div className="border-t border-[rgba(74,106,125,0.22)] pt-4 flex items-end justify-between">
                <div>
                  <div className="text-xl font-semibold">Total</div>
                  <div className="text-xs text-muted-foreground">Taxes calculated later</div>
                </div>
                <div className="text-3xl font-bold">{formatUsdFromCents(customerTotal)}</div>
              </div>

              <div className="space-y-2">
                <Label>Card Number</Label>
                <div className="rounded-md border border-border p-3">
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

              <p className="text-xs text-muted-foreground">Use Stripe test card `4242 4242 4242 4242`.</p>

              {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
              {pendingPaymentDraft && !submitError ? (
                <p className="text-xs text-amber-700">
                  A previous payment attempt is pending. Submitting again will safely resume it.
                </p>
              ) : null}

              {!stripeConfigured || stripeConfigError ? (
                <p className="text-sm text-red-600">
                  {stripeConfigError || "Stripe is not configured for checkout. Add `VITE_STRIPE_PUBLISHABLE_KEY`."}
                </p>
              ) : null}

              <Button
                className="w-full h-12 text-base"
                disabled={!canSubmit}
                onClick={handleSubmitOrder}
                data-testid="button-place-order"
              >
                {isSubmitting
                  ? submitStage === "creating-booking"
                    ? "Creating booking..."
                    : submitStage === "initializing-payment"
                      ? "Preparing payment..."
                      : "Confirming payment..."
                  : pendingPaymentDraft
                    ? `Resume payment ${formatUsdFromCents(customerTotal)}`
                    : `Pay ${formatUsdFromCents(customerTotal)}`}
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
    </div>
    </div>
  );
}
