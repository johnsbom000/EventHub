import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  ClipboardList,
  DollarSign,
  ImageIcon,
  MapPin,
  Sparkles,
  Truck,
  Upload,
} from "lucide-react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import Navigation from "@/components/Navigation";
import { LocationPicker } from "@/components/LocationPicker";
import { InlinePhotoEditor, type ListingPhotoCrop } from "@/components/listings/InlinePhotoEditor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getFreshAccessToken } from "@/lib/authToken";
import { DEFAULT_COVER_RATIO, type CoverRatio } from "@/lib/listingPhotos";
import { getPublishFailureToastContent } from "@/lib/publishFailureToast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { LocationResult } from "@/types/location";
import { POPULAR_FOR_OPTIONS } from "@/constants/eventTypes";

const MAPBOX_TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ??
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ??
  "";

const LISTING_TAG_KEY = "__listing__";
const MIN_PHOTOS_FOR_PUBLISH = 3;
const DESCRIPTION_MAX_CHARS = 1000;

const CATEGORY_OPTIONS = [
  { value: "Rental", label: "Rental" },
  { value: "Venue", label: "Venue" },
  { value: "Service", label: "Service" },
  { value: "Catering", label: "Caterer" },
] as const;

type ListingCategory = (typeof CATEGORY_OPTIONS)[number]["value"];
type ListingHelperCategory = "rental" | "venue" | "service" | "caterer";
type StepId = "basics" | "perfectFor" | "bookingPricing" | "serviceArea" | "logistics" | "media";
type PricingUnit = "per_day" | "per_hour";
type BookingType = "instant" | "request";
type TravelFeeType = "flat" | "per_mile" | "per_hour";

type ListingTag = { label: string; slug: string };

type ListingDraft = {
  category: ListingCategory | "";
  listingTitle: string;
  listingDescription: string;
  whatsIncluded: string[];
  tagsByPropType: Record<string, ListingTag[]>;
  popularFor: string[];

  bookingType: BookingType;
  pricingUnit: PricingUnit;
  rate: string;
  quantity: string;

  serviceAreaMode: "radius";
  serviceRadiusMiles: number;
  serviceLocation: LocationResult | null;
  serviceCenter: { lat: number; lng: number } | null;

  travelOffered: boolean;
  travelFeeEnabled: boolean;
  travelFeeType: TravelFeeType;
  travelFeeAmount: string;

  deliveryIncluded: boolean;
  deliveryFeeEnabled: boolean;
  deliveryFeeAmount: string;

  setupIncluded: boolean;
  setupFeeEnabled: boolean;
  setupFeeAmount: string;

  photoPreviews: string[];
  photoNames: string[];
  coverPhotoRatio: CoverRatio;
  photoCropsByName: Record<string, ListingPhotoCrop>;

  videoNames: string[];
};

const DEFAULT_DRAFT: ListingDraft = {
  category: "",
  listingTitle: "",
  listingDescription: "",
  whatsIncluded: [],
  tagsByPropType: {},
  popularFor: [],

  bookingType: "instant",
  pricingUnit: "per_day",
  rate: "",
  quantity: "1",

  serviceAreaMode: "radius",
  serviceRadiusMiles: 30,
  serviceLocation: null,
  serviceCenter: null,

  travelOffered: false,
  travelFeeEnabled: false,
  travelFeeType: "flat",
  travelFeeAmount: "",

  deliveryIncluded: false,
  deliveryFeeEnabled: false,
  deliveryFeeAmount: "",

  setupIncluded: false,
  setupFeeEnabled: false,
  setupFeeAmount: "",

  photoPreviews: [],
  photoNames: [],
  coverPhotoRatio: DEFAULT_COVER_RATIO,
  photoCropsByName: {},

  videoNames: [],
};

const STEPS: Array<{ id: StepId; title: string }> = [
  { id: "basics", title: "Listing Basics" },
  { id: "perfectFor", title: "Perfect For" },
  { id: "bookingPricing", title: "Booking & Pricing" },
  { id: "serviceArea", title: "Service Area" },
  { id: "logistics", title: "Logistics" },
  { id: "media", title: "Photos & Videos" },
];

const STEP_META: Record<
  StepId,
  {
    icon: typeof ClipboardList;
    description: string;
  }
> = {
  basics: {
    icon: ClipboardList,
    description: "Core listing info.",
  },
  perfectFor: {
    icon: Sparkles,
    description: "Optional event fit.",
  },
  bookingPricing: {
    icon: DollarSign,
    description: "Booking behavior and rates.",
  },
  serviceArea: {
    icon: MapPin,
    description: "Coverage center and radius.",
  },
  logistics: {
    icon: Truck,
    description: "Travel, delivery, setup.",
  },
  media: {
    icon: ImageIcon,
    description: "Publish-ready photos.",
  },
};

const PERFECT_FOR_EMOJI: Record<string, string> = {
  Weddings: "💍",
  Corporate: "🏢",
  "Baby Showers": "🍼",
  Photoshoots: "📸",
  Birthdays: "🎂",
  "Bridal Showers": "👰",
  Graduations: "🎓",
  "Holiday Parties": "🎉",
  Concert: "🎵",
  Proposal: "💐",
  "Bachelor Party": "🍻",
  "Bachelorette Party": "💃",
  Anniversary: "❤️",
  "Gender Reveal": "🎈",
  Quinceañera: "👑",
  Baptism: "🙏",
  Funeral: "🕊️",
  Reunion: "🤝",
  Conference: "🗂️",
  Sporting: "🏅",
  "School Dance": "🪩",
  Other: "✨",
};

const CATEGORY_HELPER_TEXT: Record<
  ListingHelperCategory,
  { description: string; included: string; tags: string }
> = {
  rental: {
    description:
      "Describe the style, condition, materials, dimensions, and how this rental is typically used.",
    included:
      "Clarify exactly what the customer gets: pieces, quantities, color/style notes, and exclusions.",
    tags: "Examples: material, color, decor style, event type.",
  },
  venue: {
    description:
      "Describe the space, atmosphere, capacity, layout, and types of events hosted.",
    included:
      "Clarify what comes with the venue: tables, chairs, prep areas, parking, and restrictions.",
    tags: "Examples: indoor, outdoor, capacity, wedding venue.",
  },
  service: {
    description:
      "Describe what you do, your experience, and what customers should expect.",
    included:
      "Clarify what is included: hours, setup time, travel radius, and equipment.",
    tags: "Examples: DJ, photography, coordination, lighting.",
  },
  caterer: {
    description:
      "Describe your food style, specialties, and service style (buffet, plated, drop-off).",
    included:
      "Clarify what is included: food quantity, staff, utensils, setup, cleanup.",
    tags: "Examples: cuisine type, buffet, desserts, dietary options.",
  },
};

function toHelperCategory(category: ListingCategory | ""): ListingHelperCategory {
  if (category === "Venue") return "venue";
  if (category === "Service") return "service";
  if (category === "Catering") return "caterer";
  return "rental";
}

function normalizeTag(raw: string): ListingTag | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const capped = cleaned.slice(0, 30);
  const label = capped
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");

  const slug = label.toLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-").trim();
  if (!slug) return null;
  return { label, slug };
}

function normalizeIncludedBullet(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/[^a-zA-Z0-9\s&/,'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/g, "")
    .trim()
    .slice(0, 100);

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function normalizeTitleInput(raw: string, maxLen: number): string {
  const cleaned = (raw ?? "")
    .replace(/\s+/g, " ")
    .slice(0, maxLen);

  // Force first letter of each word segment to uppercase.
  return cleaned.replace(/(^|[\s/-])([a-z])/g, (_, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

function toMoneyCents(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function parsePositiveInt(raw: string): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < 1) return 1;
  return value;
}

function makeCircleGeoJSON(
  center: { lat: number; lng: number },
  radiusMiles: number,
  points = 64,
) {
  const radiusKm = radiusMiles * 1.60934;
  const earthRadiusKm = 6371;

  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= points; i += 1) {
    const bearing = (2 * Math.PI * i) / points;
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(radiusKm / earthRadiusKm) +
        Math.cos(lat) * Math.sin(radiusKm / earthRadiusKm) * Math.cos(bearing),
    );
    const lng2 =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(radiusKm / earthRadiusKm) * Math.cos(lat),
        Math.cos(radiusKm / earthRadiusKm) - Math.sin(lat) * Math.sin(lat2),
      );

    coordinates.push([lng2 * (180 / Math.PI), lat2 * (180 / Math.PI)]);
  }

  return {
    type: "Feature" as const,
    properties: { radiusMiles },
    geometry: {
      type: "Polygon" as const,
      coordinates: [coordinates],
    },
  };
}

function boundsFromCircleFeature(feature: any) {
  const ring: [number, number][] | undefined =
    feature?.geometry?.type === "Polygon" ? feature.geometry.coordinates?.[0] : undefined;
  if (!ring || ring.length === 0) return null;

  let minLng = ring[0][0];
  let maxLng = ring[0][0];
  let minLat = ring[0][1];
  let maxLat = ring[0][1];

  ring.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });

  return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
}

function isCategory(value: string): value is ListingCategory {
  return CATEGORY_OPTIONS.some((option) => option.value === value);
}

function ToggleGroup({
  value,
  onChange,
  trueLabel,
  falseLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  trueLabel: string;
  falseLabel: string;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={[
          "px-4 py-2 text-sm font-medium transition",
          value
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-muted",
        ].join(" ")}
      >
        {trueLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={[
          "border-l border-border px-4 py-2 text-sm font-medium transition",
          !value
            ? "bg-primary text-primary-foreground"
            : "bg-background text-muted-foreground hover:bg-muted",
        ].join(" ")}
      >
        {falseLabel}
      </button>
    </div>
  );
}

type UploadedListingPhoto = { filename: string; url: string };

export type CreateListingWizardProps = {
  onClose: () => void;
  editMode?: boolean;
  initialData?: any;
};

export function CreateListingWizard({ onClose }: CreateListingWizardProps) {
  const { toast } = useToast();

  const { data: me } = useQuery({ queryKey: ["/api/vendor/me"] });
  const { data: vendorProfile } = useQuery({ queryKey: ["/api/vendor/profile"] });

  const vendorType = ((me as any)?.vendorType || "unspecified") as string;

  const [currentStep, setCurrentStep] = useState<StepId>("basics");
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [draft, setDraft] = useState<ListingDraft>(DEFAULT_DRAFT);
  const [listingId, setListingId] = useState<string | null>(null);

  const [tagInput, setTagInput] = useState("");
  const [includedInput, setIncludedInput] = useState("");

  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [attemptedStepAdvance, setAttemptedStepAdvance] = useState<Partial<Record<StepId, boolean>>>({});

  const createRequestedRef = useRef(false);
  const pendingPayloadRef = useRef<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const center = useMemo(() => {
    if (draft.serviceLocation) {
      return { lat: draft.serviceLocation.lat, lng: draft.serviceLocation.lng };
    }
    if (draft.serviceCenter) {
      return { lat: draft.serviceCenter.lat, lng: draft.serviceCenter.lng };
    }
    return null;
  }, [
    draft.serviceLocation?.lat,
    draft.serviceLocation?.lng,
    draft.serviceCenter?.lat,
    draft.serviceCenter?.lng,
  ]);

  const circleFeature = useMemo(() => {
    if (!center) return null;
    return makeCircleGeoJSON(center, draft.serviceRadiusMiles);
  }, [center, draft.serviceRadiusMiles]);

  const radiusFeatureCollection = useMemo(
    () => ({ type: "FeatureCollection" as const, features: circleFeature ? [circleFeature] : [] }),
    [circleFeature],
  );

  const centerFeatureCollection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: center
        ? [
            {
              type: "Feature" as const,
              properties: {},
              geometry: { type: "Point" as const, coordinates: [center.lng, center.lat] },
            },
          ]
        : [],
    }),
    [center],
  );

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vendor/listings", { listingData: {} });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create draft");
      return json;
    },
    onSuccess: (payload: any) => {
      const id = payload?.id || payload?.data?.id;
      if (!id) return;
      setListingId(id);

      if (pendingPayloadRef.current) {
        updateDraftMutation.mutate({ id, payload: pendingPayloadRef.current });
        pendingPayloadRef.current = null;
      }
    },
    onError: (error: any) => {
      createRequestedRef.current = false;
      toast({
        title: "Unable to create draft",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiRequest("PATCH", `/api/vendor/listings/${id}`, { listingData: payload });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to update listing");
      return json;
    },
  });

  const stepIndex = useMemo(() => STEPS.findIndex((step) => step.id === currentStep), [currentStep]);

  const showTravelSection = draft.category === "Service" || draft.category === "Catering";
  const showDeliverySection = draft.category === "Rental" || draft.category === "Catering";
  const showSetupSection = draft.category === "Rental" || draft.category === "Venue" || draft.category === "Catering";
  const bookingTypeRequired = draft.category === "Service" || draft.category === "Venue" || draft.category === "Catering";

  const listingTags = useMemo(() => draft.tagsByPropType[LISTING_TAG_KEY] ?? [], [draft.tagsByPropType]);
  const helperText = CATEGORY_HELPER_TEXT[toHelperCategory(draft.category)];

  const hasCategory = Boolean(draft.category);
  const hasTitle = draft.listingTitle.trim().length > 0;
  const hasDescription = draft.listingDescription.trim().length > 0;
  const hasPrice = Number(draft.rate) > 0;
  const hasLocation =
    Boolean(draft.serviceLocation?.label) &&
    Number.isFinite(Number(draft.serviceCenter?.lat)) &&
    Number.isFinite(Number(draft.serviceCenter?.lng)) &&
    Number(draft.serviceRadiusMiles) > 0;
  const hasMinPhotos = draft.photoNames.length >= MIN_PHOTOS_FOR_PUBLISH;
  const hasValidQuantity = draft.category !== "Rental" || parsePositiveInt(draft.quantity) > 0;

  const publishReady = hasCategory && hasTitle && hasDescription && hasPrice && hasLocation && hasMinPhotos;

  const canContinue = useMemo(() => {
    if (currentStep === "basics") return hasCategory && hasTitle && hasDescription;
    if (currentStep === "bookingPricing") return hasPrice && hasValidQuantity;
    if (currentStep === "serviceArea") return hasLocation;
    return true;
  }, [currentStep, hasCategory, hasTitle, hasDescription, hasPrice, hasValidQuantity, hasLocation]);

  const buildListingPayload = useMemo(() => {
    const quantity = parsePositiveInt(draft.quantity);
    const priceNumber = Number(draft.rate);
    const price = Number.isFinite(priceNumber) ? priceNumber : null;
    const instantBookEnabled = draft.category === "Rental" ? true : draft.bookingType === "instant";

    const centerLat = draft.serviceCenter?.lat ?? draft.serviceLocation?.lat ?? null;
    const centerLng = draft.serviceCenter?.lng ?? draft.serviceLocation?.lng ?? null;

    return {
      vendorType,
      category: draft.category || undefined,
      listingTitle: draft.listingTitle.trim(),
      title: draft.listingTitle.trim(),
      listingDescription: draft.listingDescription.trim(),
      description: draft.listingDescription.trim(),
      whatsIncluded: draft.whatsIncluded,
      tagsByPropType: {
        ...(draft.tagsByPropType || {}),
        [LISTING_TAG_KEY]: listingTags,
      },
      tags: listingTags.map((tag) => tag.label),
      popularFor: draft.popularFor,

      instantBookEnabled,
      bookingType: draft.category === "Rental" ? "instant" : draft.bookingType,
      pricingUnit: draft.pricingUnit,
      rate: price,
      price,
      priceCents: price != null ? Math.round(price * 100) : null,

      quantity: draft.category === "Rental" ? quantity : null,

      serviceAreaMode: "radius",
      serviceRadiusMiles: Number(draft.serviceRadiusMiles),
      listingServiceCenterLabel: draft.serviceLocation?.label ?? null,
      listingServiceCenterLat: centerLat,
      listingServiceCenterLng: centerLng,
      serviceCenter: centerLat != null && centerLng != null ? { lat: centerLat, lng: centerLng } : null,
      serviceLocation: draft.serviceLocation
        ? {
            ...draft.serviceLocation,
            country:
              typeof (draft.serviceLocation as any)?.country === "string" &&
              String((draft.serviceLocation as any).country).trim().length > 0
                ? (draft.serviceLocation as any).country
                : "United States",
          }
        : null,

      travelOffered: showTravelSection ? draft.travelOffered : false,
      travelFeeEnabled: showTravelSection ? draft.travelOffered && draft.travelFeeEnabled : false,
      travelFeeType: showTravelSection && draft.travelFeeEnabled ? draft.travelFeeType : null,
      travelFeeAmount: showTravelSection && draft.travelFeeEnabled ? Number(draft.travelFeeAmount || 0) : null,
      travelFeeAmountCents:
        showTravelSection && draft.travelFeeEnabled ? toMoneyCents(draft.travelFeeAmount) : null,

      deliveryIncluded: showDeliverySection ? draft.deliveryIncluded : false,
      deliveryOffered: showDeliverySection ? draft.deliveryIncluded : false,
      pickupOffered: showDeliverySection,
      deliveryFeeEnabled: showDeliverySection ? draft.deliveryIncluded && draft.deliveryFeeEnabled : false,
      deliveryFeeAmount:
        showDeliverySection && draft.deliveryIncluded && draft.deliveryFeeEnabled
          ? Number(draft.deliveryFeeAmount || 0)
          : null,
      deliveryFeeAmountCents:
        showDeliverySection && draft.deliveryIncluded && draft.deliveryFeeEnabled
          ? toMoneyCents(draft.deliveryFeeAmount)
          : null,

      setupIncluded: showSetupSection ? draft.setupIncluded : false,
      setupOffered: showSetupSection ? draft.setupIncluded : false,
      setupFeeEnabled: showSetupSection ? draft.setupIncluded && draft.setupFeeEnabled : false,
      setupFeeAmount:
        showSetupSection && draft.setupIncluded && draft.setupFeeEnabled ? Number(draft.setupFeeAmount || 0) : null,
      setupFeeAmountCents:
        showSetupSection && draft.setupIncluded && draft.setupFeeEnabled
          ? toMoneyCents(draft.setupFeeAmount)
          : null,

      photos: {
        count: draft.photoNames.length,
        names: draft.photoNames,
        coverPhotoName: draft.photoNames[0] ?? null,
        coverPhotoIndex: 0,
        coverPhotoRatio: draft.coverPhotoRatio,
        cropsByName: draft.photoCropsByName,
      },
      videos: {
        names: draft.videoNames,
        count: draft.videoNames.length,
      },
    };
  }, [draft, listingTags, showDeliverySection, showSetupSection, showTravelSection, vendorType]);

  useEffect(() => {
    if (!vendorProfile) return;
    if (draft.serviceCenter || draft.serviceLocation) return;

    const profile = vendorProfile as any;
    const city = profile?.businessCity || profile?.city || "";
    const state = profile?.businessState || profile?.state || "";
    const zip = profile?.businessZip || profile?.zipCode || profile?.postalCode || "";
    const address = profile?.businessStreet || profile?.streetAddress || profile?.address || "";
    const label =
      profile?.businessAddressLabel ||
      [address, city, state, zip].filter(Boolean).join(", ");

    const homeBaseLat = Number(profile?.homeBaseLat);
    const homeBaseLng = Number(profile?.homeBaseLng);

    if (Number.isFinite(homeBaseLat) && Number.isFinite(homeBaseLng)) {
      setDraft((prev) => ({
        ...prev,
        serviceCenter: { lat: homeBaseLat, lng: homeBaseLng },
        serviceLocation: {
          id: "vendor-home-base",
          label: label || "Vendor home base",
          lat: homeBaseLat,
          lng: homeBaseLng,
          city: city || undefined,
          state: state || undefined,
          zipCode: zip || undefined,
          country: "United States",
        },
      }));
      return;
    }

    const query = [address, city, state, zip].filter(Boolean).join(", ").trim();
    if (!query) return;

    void (async () => {
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const results: LocationResult[] = await res.json();
        const first = results?.[0];
        if (!first) return;

        setDraft((prev) => ({
          ...prev,
          serviceCenter: { lat: first.lat, lng: first.lng },
          serviceLocation: {
            ...first,
            id: first.id || `loc_${first.lat}_${first.lng}`,
            label: first.label || label || "Service center",
          },
        }));
      } catch {
        // no-op
      }
    })();
  }, [vendorProfile, draft.serviceCenter, draft.serviceLocation]);

  useEffect(() => {
    const hasMeaningfulData =
      Boolean(draft.category) ||
      draft.listingTitle.trim().length > 0 ||
      draft.listingDescription.trim().length > 0 ||
      draft.photoNames.length > 0 ||
      Number(draft.rate) > 0;

    if (!hasMeaningfulData) return;

    const payload = buildListingPayload;

    if (!listingId) {
      pendingPayloadRef.current = payload;
      if (!createRequestedRef.current) {
        createRequestedRef.current = true;
        createDraftMutation.mutate();
      }
      return;
    }

    const timer = setTimeout(() => {
      updateDraftMutation.mutate({ id: listingId, payload });
    }, 1200);

    return () => clearTimeout(timer);
  }, [
    buildListingPayload,
    createDraftMutation,
    draft,
    listingId,
    updateDraftMutation,
  ]);

  useEffect(() => {
    if (currentStep !== "serviceArea") return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    setMapError(null);

    if (!MAPBOX_TOKEN) {
      setMapError("Missing Mapbox token (VITE_MAPBOX_TOKEN).");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const initialCenter: [number, number] = center ? [center.lng, center.lat] : [-111.891, 40.7608];

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: 10,
    });
    let deferredResizeId: number | null = null;
    let loadTimeoutId: number | null = null;

    mapRef.current = map;

    map.on("error", (event) => {
      const detail =
        (event as any)?.error?.message ||
        (event as any)?.error?.statusText ||
        "Map failed to load.";
      setMapError(detail);
    });

    map.on("load", () => {
      setIsMapReady(true);
      map.addSource("radius", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: {
          "fill-color": "#9EDBC0",
          "fill-opacity": 0.28,
        },
      });
      map.addLayer({
        id: "radius-outline",
        type: "line",
        source: "radius",
        paint: {
          "line-color": "#2B7A67",
          "line-width": 2,
        },
      });
      map.addSource("center", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "center-point",
        type: "circle",
        source: "center",
        paint: {
          "circle-radius": 6,
          "circle-color": "#2B7A67",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          // no-op
        }
      });

      deferredResizeId = window.setTimeout(() => {
        try {
          map.resize();
        } catch {
          // no-op
        }
      }, 140);
    });

    loadTimeoutId = window.setTimeout(() => {
      if (map.isStyleLoaded()) {
        setIsMapReady(true);
        try {
          map.resize();
        } catch {
          // no-op
        }
        return;
      }
      setMapError((previous) => previous ?? "Map failed to load. Check your Mapbox token and allowed URL settings.");
    }, 5000);

    return () => {
      if (deferredResizeId !== null) {
        window.clearTimeout(deferredResizeId);
      }
      if (loadTimeoutId !== null) {
        window.clearTimeout(loadTimeoutId);
      }
      try {
        map.remove();
      } catch {
        // no-op
      }
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, [currentStep]);

  useEffect(() => {
    const map = mapRef.current;
    const mapContainer = mapContainerRef.current;
    if (!map || !mapContainer) return;

    const observer = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        // no-op
      }
    });

    observer.observe(mapContainer);

    requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {
        // no-op
      }
    });

    return () => observer.disconnect();
  }, [currentStep]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;
    if (!map.isStyleLoaded()) return;

    const radiusSource = map.getSource("radius") as mapboxgl.GeoJSONSource | undefined;
    if (radiusSource) radiusSource.setData(radiusFeatureCollection as any);

    const centerSource = map.getSource("center") as mapboxgl.GeoJSONSource | undefined;
    if (centerSource) centerSource.setData(centerFeatureCollection as any);

    if (!center) return;

    const circleBounds = circleFeature ? boundsFromCircleFeature(circleFeature) : null;
    if (circleBounds && draft.serviceRadiusMiles >= 15) {
      map.fitBounds(circleBounds, { padding: 20, duration: 500, maxZoom: 11 });
      return;
    }

    map.easeTo({ center: [center.lng, center.lat], zoom: 10, duration: 400 });
  }, [center, centerFeatureCollection, circleFeature, draft.serviceRadiusMiles, isMapReady, radiusFeatureCollection]);

  useEffect(() => {
    return () => {
      draft.photoPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [draft.photoPreviews]);

  const addTag = (raw: string) => {
    const normalized = normalizeTag(raw);
    if (!normalized) return;

    setDraft((prev) => {
      const existing = prev.tagsByPropType[LISTING_TAG_KEY] ?? [];
      if (existing.some((tag) => tag.slug === normalized.slug)) return prev;
      if (existing.length >= 15) return prev;

      return {
        ...prev,
        tagsByPropType: {
          ...prev.tagsByPropType,
          [LISTING_TAG_KEY]: [...existing, normalized],
        },
      };
    });

    setTagInput("");
  };

  const removeTag = (slug: string) => {
    setDraft((prev) => {
      const existing = prev.tagsByPropType[LISTING_TAG_KEY] ?? [];
      return {
        ...prev,
        tagsByPropType: {
          ...prev.tagsByPropType,
          [LISTING_TAG_KEY]: existing.filter((tag) => tag.slug !== slug),
        },
      };
    });
  };

  const addIncludedItem = (raw: string) => {
    const normalized = normalizeIncludedBullet(raw);
    if (!normalized) return;

    setDraft((prev) => {
      const existing = prev.whatsIncluded ?? [];
      if (existing.some((item) => item.toLowerCase() === normalized.toLowerCase())) return prev;
      if (existing.length >= 20) return prev;
      return { ...prev, whatsIncluded: [...existing, normalized] };
    });

    setIncludedInput("");
  };

  const removeIncludedItem = (item: string) => {
    setDraft((prev) => ({
      ...prev,
      whatsIncluded: prev.whatsIncluded.filter((value) => value !== item),
    }));
  };

  const togglePerfectFor = (option: string) => {
    setDraft((prev) => {
      const selected = prev.popularFor.includes(option);
      return {
        ...prev,
        popularFor: selected
          ? prev.popularFor.filter((value) => value !== option)
          : [...prev.popularFor, option],
      };
    });
  };

  const allPerfectForSelected = POPULAR_FOR_OPTIONS.every((option) => draft.popularFor.includes(option));

  const toggleSelectAllPerfectFor = () => {
    setDraft((prev) => ({
      ...prev,
      popularFor: allPerfectForSelected ? [] : [...POPULAR_FOR_OPTIONS],
    }));
  };

  async function uploadListingPhoto(file: File): Promise<UploadedListingPhoto> {
    const token = await getFreshAccessToken();
    const formData = new FormData();
    formData.append("photo", file);

    const response = await fetch("/api/uploads/listing-photo", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = (await response.text()) || response.statusText;
      throw new Error(`${response.status}: ${errorText}`);
    }

    return await response.json();
  }

  const onPickPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const selectedFiles = Array.from(files);

    const rejectedHeic = selectedFiles.filter(
      (file) =>
        file.type === "image/heic" ||
        file.type === "image/heif" ||
        file.name.toLowerCase().endsWith(".heic") ||
        file.name.toLowerCase().endsWith(".heif"),
    );

    if (rejectedHeic.length > 0) {
      toast({
        title: "Unsupported image format",
        description: "Please upload JPG, PNG, or WebP files.",
        variant: "destructive",
      });
    }

    const acceptedFiles = selectedFiles.filter((file) => {
      const lowerName = file.name.toLowerCase();
      return (
        allowedMimeTypes.has(file.type) ||
        lowerName.endsWith(".jpg") ||
        lowerName.endsWith(".jpeg") ||
        lowerName.endsWith(".png") ||
        lowerName.endsWith(".webp")
      );
    });

    if (acceptedFiles.length === 0) return;

    const tempEntries = acceptedFiles.map((file) => {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const tempName = `__uploading__-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      return {
        file,
        tempName,
        preview: URL.createObjectURL(file),
      };
    });

    setDraft((prev) => ({
      ...prev,
      photoPreviews: [...prev.photoPreviews, ...tempEntries.map((entry) => entry.preview)],
      photoNames: [...prev.photoNames, ...tempEntries.map((entry) => entry.tempName)],
    }));

    try {
      const uploaded = await Promise.all(tempEntries.map((entry) => uploadListingPhoto(entry.file)));

      setDraft((prev) => {
        let nextPhotoNames = prev.photoNames.slice();
        const nextCropsByName: Record<string, ListingPhotoCrop> = { ...(prev.photoCropsByName || {}) };

        uploaded.forEach((result, index) => {
          const tempName = tempEntries[index].tempName;
          nextPhotoNames = nextPhotoNames.map((name) => (name === tempName ? result.filename : name));

          if (nextCropsByName[tempName]) {
            nextCropsByName[result.filename] = nextCropsByName[tempName];
            delete nextCropsByName[tempName];
          }
        });

        return {
          ...prev,
          photoNames: nextPhotoNames,
          photoCropsByName: nextCropsByName,
        };
      });
    } catch (error: any) {
      tempEntries.forEach((entry) => URL.revokeObjectURL(entry.preview));

      setDraft((prev) => {
        const removeNames = new Set(tempEntries.map((entry) => entry.tempName));
        const nextPhotoNames: string[] = [];
        const nextPhotoPreviews: string[] = [];

        prev.photoNames.forEach((name, index) => {
          if (removeNames.has(name)) return;
          nextPhotoNames.push(name);
          nextPhotoPreviews.push(prev.photoPreviews[index]);
        });

        const nextCropsByName: Record<string, ListingPhotoCrop> = { ...(prev.photoCropsByName || {}) };
        tempEntries.forEach((entry) => {
          delete nextCropsByName[entry.tempName];
        });

        return {
          ...prev,
          photoNames: nextPhotoNames,
          photoPreviews: nextPhotoPreviews,
          photoCropsByName: nextCropsByName,
        };
      });

      toast({
        title: "Photo upload failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhotoAt = (index: number) => {
    setDraft((prev) => {
      const nextPhotoPreviews = prev.photoPreviews.slice();
      const nextPhotoNames = prev.photoNames.slice();

      const removedPreview = nextPhotoPreviews[index];
      if (removedPreview) URL.revokeObjectURL(removedPreview);

      nextPhotoPreviews.splice(index, 1);
      nextPhotoNames.splice(index, 1);

      const nextCropsByName: Record<string, ListingPhotoCrop> = { ...(prev.photoCropsByName || {}) };
      if (typeof prev.photoNames[index] === "string") {
        delete nextCropsByName[prev.photoNames[index]];
      }

      return {
        ...prev,
        photoPreviews: nextPhotoPreviews,
        photoNames: nextPhotoNames,
        photoCropsByName: nextCropsByName,
      };
    });
  };

  const removePhotoByName = (photoName: string) => {
    const index = draft.photoNames.findIndex((name) => name === photoName);
    if (index >= 0) removePhotoAt(index);
  };

  const reorderPhotos = (orderedPhotoNames: string[]) => {
    setDraft((prev) => {
      const previewByName = new Map<string, string>();
      prev.photoNames.forEach((name, index) => previewByName.set(name, prev.photoPreviews[index]));

      const nextNames = orderedPhotoNames.filter((name) => previewByName.has(name));
      if (nextNames.length !== prev.photoNames.length) return prev;

      const nextPreviews = nextNames.map((name) => previewByName.get(name) || "");
      const nextCropsByName: Record<string, ListingPhotoCrop> = {};
      nextNames.forEach((name) => {
        if (prev.photoCropsByName[name]) nextCropsByName[name] = prev.photoCropsByName[name];
      });

      return {
        ...prev,
        photoNames: nextNames,
        photoPreviews: nextPreviews,
        photoCropsByName: nextCropsByName,
      };
    });
  };

  const setPhotoCropByName = (photoName: string, crop: ListingPhotoCrop | null) => {
    setDraft((prev) => {
      const nextCropsByName = { ...(prev.photoCropsByName || {}) };
      if (crop) nextCropsByName[photoName] = crop;
      else delete nextCropsByName[photoName];
      return { ...prev, photoCropsByName: nextCropsByName };
    });
  };

  const goNext = () => {
    if (!canContinue) {
      setAttemptedStepAdvance((prev) => ({ ...prev, [currentStep]: true }));
      return;
    }
    const nextStep = STEPS[stepIndex + 1];
    if (!nextStep) return;
    setCurrentStep(nextStep.id);
    setMaxStepReached((value) => Math.max(value, stepIndex + 1));
  };

  const goBack = () => {
    const previousStep = STEPS[stepIndex - 1];
    if (!previousStep) return;
    setCurrentStep(previousStep.id);
  };

  const ensureListingSaved = async (): Promise<string | null> => {
    const hasMeaningfulData =
      Boolean(draft.category) ||
      draft.listingTitle.trim().length > 0 ||
      draft.listingDescription.trim().length > 0 ||
      Number(draft.rate) > 0 ||
      draft.photoNames.length > 0;

    if (!hasMeaningfulData) return null;

    const payload = buildListingPayload;

    let nextListingId = listingId;

    if (!nextListingId) {
      const created = await createDraftMutation.mutateAsync();
      nextListingId = created?.id || created?.data?.id;
      if (!nextListingId) throw new Error("Failed to create listing draft");
      setListingId(nextListingId);
    }

    await updateDraftMutation.mutateAsync({ id: nextListingId, payload });
    return nextListingId;
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const savedId = await ensureListingSaved();
      toast({
        title: savedId ? "Draft saved" : "Nothing to save yet",
        description: savedId
          ? "Your listing draft is saved. You can come back anytime."
          : "Add listing details, then save your draft.",
      });

      if (savedId) onClose();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error?.message || "Unable to save draft.",
        variant: "destructive",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    if (!publishReady) return;
    setIsPublishing(true);

    try {
      const payload = buildListingPayload;
      const id = await ensureListingSaved();
      if (!id) {
        throw new Error("Please complete the required fields before publishing.");
      }

      const response = await apiRequest("PATCH", `/api/vendor/listings/${id}/publish`, {
        listingData: payload,
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result === "string" ? result : JSON.stringify(result));
      }

      toast({
        title: "Listing published",
        description: "Your listing is now live.",
      });
      onClose();
    } catch (error) {
      const publishError = getPublishFailureToastContent(error);
      toast({
        title: publishError.title,
        description: publishError.description,
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const isLastStep = stepIndex === STEPS.length - 1;
  const showBasicsValidation = Boolean(attemptedStepAdvance.basics);
  const showBookingPricingValidation = Boolean(attemptedStepAdvance.bookingPricing);
  const showServiceAreaValidation = Boolean(attemptedStepAdvance.serviceArea);

  return (
    <div className="swap-dashboard-whites flex h-screen w-full flex-col bg-[#ffffff]">
      <Navigation vendorDashboardAligned />

      <div className="flex min-h-0 flex-1">
        <div className="w-24 shrink-0 border-r border-[rgba(74,106,125,0.22)] bg-[#ffffff] dark:bg-[#ffffff]">
          <div className="flex h-full flex-col items-center pt-6">
            <div className="flex flex-col items-center gap-3">
              {STEPS.map((step, index) => {
                const isActive = step.id === currentStep;
                const isComplete = index < maxStepReached;
                const isReachable = index <= maxStepReached;
                const meta = STEP_META[step.id];
                const Icon = meta.icon;

                return (
                  <button
                    key={step.id}
                    type="button"
                    aria-label={step.title}
                    aria-current={isActive ? "step" : undefined}
                    aria-disabled={!isReachable}
                    onClick={() => {
                      if (!isReachable) return;
                      if (index > stepIndex && !canContinue) {
                        setAttemptedStepAdvance((prev) => ({ ...prev, [currentStep]: true }));
                        return;
                      }
                      setCurrentStep(step.id);
                    }}
                    className={cn(
                      "group/step relative flex h-14 w-14 items-center justify-center rounded-2xl border border-transparent transition-colors",
                      isActive
                        ? "bg-[#4a6a7d] text-[#f5f0e8] hover:bg-[#4a6a7d]"
                        : isReachable
                          ? "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
                          : "cursor-not-allowed text-[#9aacb4]",
                    )}
                    data-testid={`create-listing-step-${step.id}`}
                  >
                    {isComplete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    <span className="sr-only">{step.title}</span>
                    <span
                      className={cn(
                        "pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 min-w-[210px] -translate-y-1/2 rounded-md border border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2.5 py-2 text-left text-[#2a3a42] opacity-0 shadow-sm transition-opacity duration-150",
                        "group-hover/step:opacity-100",
                      )}
                    >
                      <span className="block text-sm font-semibold">{step.title}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-[#4a6a7d]">{meta.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              "create-listing-wizard-typography listing-onboarding-parity vendor-onboarding-input-surface mx-auto w-full max-w-[1400px] px-8 pt-10 sm:px-14 lg:px-20",
              currentStep === "basics" ? "pb-24" : "pb-36",
            )}
          >

        {currentStep === "basics" && (
          <div className="mx-auto w-full max-w-[53rem] space-y-8">
            <header className="space-y-3">
              <h1 className="text-5xl font-semibold tracking-tight">Listing Basics</h1>
              <p className="text-base text-muted-foreground">
                Create one listing for one distinct rentable item, set, or style.
              </p>
            </header>

            <Card className="space-y-6 p-6">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Category</Label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {CATEGORY_OPTIONS.map((option) => {
                    const active = draft.category === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            category: option.value,
                            bookingType: option.value === "Rental" ? "instant" : prev.bookingType,
                          }))
                        }
                        className={[
                          "rounded-xl border px-3 py-3 text-sm font-medium transition",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {showBasicsValidation && !hasCategory ? <p className="text-sm text-destructive">Category is required.</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="listing-title" className="text-base font-semibold">
                  Title
                </Label>
                <Input
                  id="listing-title"
                  value={draft.listingTitle}
                  placeholder="e.g. Gold Vase Set of 5"
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      listingTitle: normalizeTitleInput(event.target.value, 80),
                    }))
                  }
                />
                {showBasicsValidation && !hasTitle ? <p className="text-sm text-destructive">Title is required.</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="listing-description" className="text-base font-semibold">
                  Description
                </Label>
                <Textarea
                  id="listing-description"
                  rows={5}
                  maxLength={DESCRIPTION_MAX_CHARS}
                  value={draft.listingDescription}
                  spellCheck={true}
                  autoCorrect="on"
                  placeholder={helperText.description}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      listingDescription: event.target.value.slice(0, DESCRIPTION_MAX_CHARS),
                    }))
                  }
                />
                <div className="text-xs text-muted-foreground">{draft.listingDescription.length}/{DESCRIPTION_MAX_CHARS}</div>
                {showBasicsValidation && !hasDescription ? <p className="text-sm text-destructive">Description is required.</p> : null}
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">What's Included</Label>
                <p className="text-sm text-muted-foreground">
                  {helperText.included}
                </p>

                {draft.whatsIncluded.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {draft.whatsIncluded.map((item) => (
                      <li
                        key={item}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <span className="flex items-start gap-2">
                          <span aria-hidden>•</span>
                          <span>{item}</span>
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => removeIncludedItem(item)}
                          aria-label={`Remove ${item}`}
                        >
                          x
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex gap-2">
                  <Input
                    value={includedInput}
                    spellCheck={true}
                    autoCorrect="on"
                    placeholder="What do you include?"
                    onChange={(event) => setIncludedInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addIncludedItem(includedInput);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={includedInput.trim().length === 0}
                    onClick={() => addIncludedItem(includedInput)}
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Search Tags</Label>
                <p className="text-sm text-muted-foreground">
                  {helperText.tags}
                </p>

                {listingTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {listingTags.map((tag) => (
                      <span
                        key={tag.slug}
                        className="inline-flex items-center gap-2 rounded-full border border-[#E07A6A] bg-[#E07A6A] px-3 py-1 text-sm text-white"
                      >
                        {tag.label}
                        <button
                          type="button"
                          className="text-white/80 hover:text-white"
                          onClick={() => removeTag(tag.slug)}
                          aria-label={`Remove ${tag.label}`}
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    placeholder="Add a search tag"
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addTag(tagInput);
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => addTag(tagInput)}>
                    Add
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {currentStep === "perfectFor" && (
          <div className="mx-auto w-full max-w-[53rem] space-y-8">
            <header className="space-y-3">
              <h1 className="text-5xl font-semibold tracking-tight">Perfect For</h1>
              <p className="text-base text-muted-foreground">Choose the events this listing is best for.</p>
            </header>

            <Card className="space-y-5 border-0 p-6 shadow-none">
              <div className="flex flex-wrap justify-center gap-3">
                {POPULAR_FOR_OPTIONS.map((option) => {
                  const selected = draft.popularFor.includes(option);
                  const emoji = PERFECT_FOR_EMOJI[option] ?? "✨";
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => togglePerfectFor(option)}
                      className={[
                        "inline-flex items-center gap-[0.78rem] rounded-full border px-[1.95rem] py-[1.18rem] text-[1.56rem] font-medium leading-none transition",
                        selected
                          ? "border-[#E07A6A] bg-[#E07A6A] text-white hover:bg-[#E07A6A]"
                          : "border-[#4a6a7d] bg-background text-[#2a3a42] hover:bg-muted",
                      ].join(" ")}
                    >
                      <span>{option}</span>
                      <span aria-hidden="true">{emoji}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-1">
                <Button type="button" variant="outline" onClick={toggleSelectAllPerfectFor}>
                  {allPerfectForSelected ? "Clear all" : "Select all"}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {currentStep === "bookingPricing" && (
          <div className="mx-auto w-full max-w-[53rem] space-y-8">
            <header className="space-y-3">
              <h1 className="text-5xl font-semibold tracking-tight">Booking & Pricing</h1>
              <p className="text-base text-muted-foreground">
                Set booking behavior, pricing model, and quantity for identical rental units.
              </p>
            </header>

            <Card className="space-y-6 p-6">
              {bookingTypeRequired ? (
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Booking Type</Label>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant={draft.bookingType === "instant" ? "default" : "outline"}
                      onClick={() => setDraft((prev) => ({ ...prev, bookingType: "instant" }))}
                    >
                      Instant Book
                    </Button>
                    <Button
                      type="button"
                      variant={draft.bookingType === "request" ? "default" : "outline"}
                      onClick={() => setDraft((prev) => ({ ...prev, bookingType: "request" }))}
                    >
                      Request to Book
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Request to Book means customers submit requested dates and you manually accept or decline.
                  </p>
                </div>
              ) : null}

              <div className="space-y-3">
                <Label className="text-base font-semibold">Pricing Model</Label>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant={draft.pricingUnit === "per_day" ? "default" : "outline"}
                    onClick={() => setDraft((prev) => ({ ...prev, pricingUnit: "per_day" }))}
                  >
                    Per day
                  </Button>
                  <Button
                    type="button"
                    variant={draft.pricingUnit === "per_hour" ? "default" : "outline"}
                    onClick={() => setDraft((prev) => ({ ...prev, pricingUnit: "per_hour" }))}
                  >
                    Per hour
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-base font-semibold">
                  {draft.pricingUnit === "per_day" ? "Rate per day" : "Rate per hour"}
                </Label>
                <div className="relative max-w-sm">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    className="pl-7"
                    value={draft.rate}
                    inputMode="decimal"
                    placeholder={draft.pricingUnit === "per_day" ? "e.g. 250" : "e.g. 75"}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        rate: event.target.value.replace(/[^\d.]/g, ""),
                      }))
                    }
                  />
                </div>
                {showBookingPricingValidation && !hasPrice ? <p className="text-sm text-destructive">A rate is required.</p> : null}
              </div>

              {draft.category === "Rental" ? (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
                  <Label className="text-base font-semibold">
                    How many identical units of this listing do you have available?
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Example: if this listing is for a set of 5 vases and you own 3 identical sets, enter 3.
                  </p>
                  <Input
                    value={draft.quantity}
                    inputMode="numeric"
                    className="max-w-[140px]"
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        quantity: event.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    *Quantity means identical rentable units only.*
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Use "What's Included" from Step 1 for piece counts or components.
                  </p>
                </div>
              ) : null}
            </Card>
          </div>
        )}

        {currentStep === "serviceArea" && (
          <div className="mx-auto w-full max-w-[53rem] space-y-8">
            <header className="space-y-3">
              <h1 className="text-5xl font-semibold tracking-tight">Service Area</h1>
              <p className="text-base text-muted-foreground">
                Set your coverage area for this listing. This controls where you operate, not global shipping.
              </p>
            </header>

            <Card className="space-y-6 p-6">
              <div className="space-y-2">
                <Label className="text-base font-semibold">Listing center address</Label>
                <LocationPicker
                  value={draft.serviceLocation}
                  placeholder="Search listing service center"
                  onChange={(location) => {
                    setMapError(null);
                    const normalizedLocation = location
                      ? {
                          ...location,
                          country:
                            typeof (location as any)?.country === "string" &&
                            String((location as any).country).trim().length > 0
                              ? (location as any).country
                              : "United States",
                        }
                      : null;
                    setDraft((prev) => ({
                      ...prev,
                      serviceLocation: normalizedLocation,
                      serviceCenter: normalizedLocation
                        ? { lat: normalizedLocation.lat, lng: normalizedLocation.lng }
                        : prev.serviceCenter,
                    }));
                  }}
                />
                {showServiceAreaValidation && !hasLocation ? (
                  <p className="text-sm text-destructive">
                    Service center and radius are required to continue.
                  </p>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Coverage radius</Label>
                  <span className="text-sm text-muted-foreground">{draft.serviceRadiusMiles} miles</span>
                </div>

                <Slider
                  value={[draft.serviceRadiusMiles]}
                  min={5}
                  max={300}
                  step={5}
                  disabled={!center}
                  onValueChange={(values) => {
                    const next = values?.[0] ?? 30;
                    setDraft((prev) => ({ ...prev, serviceRadiusMiles: next }));
                  }}
                />

                <p className="text-xs text-muted-foreground">
                  Use your listing center address as the middle point. You can override your onboarding default per listing.
                </p>
              </div>

              <div className="relative h-72 overflow-hidden rounded-xl border border-border">
                <div ref={mapContainerRef} className="h-full w-full" />

                {!center && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 text-sm text-muted-foreground">
                    Set a listing center to preview coverage.
                  </div>
                )}

                {mapError ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70 px-4 text-center text-sm text-destructive">
                    {mapError}
                  </div>
                ) : null}

                {!isMapReady && !mapError ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 text-sm text-muted-foreground">
                    Loading map...
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        )}

        {currentStep === "logistics" && (
          <div className="mx-auto w-full max-w-[53rem] space-y-8">
            <header className="space-y-3">
              <h1 className="text-5xl font-semibold tracking-tight">Logistics</h1>
              <p className="text-base text-muted-foreground">
                Configure travel, delivery, and setup behavior. Applicable fees are included in checkout totals.
              </p>
            </header>

            <div className="space-y-6">
              {showTravelSection ? (
                <Card className="space-y-5 p-6">
                  <div className="text-xl font-semibold">Travel</div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-base">Do you travel?</Label>
                    <ToggleGroup
                      value={draft.travelOffered}
                      onChange={(next) =>
                        setDraft((prev) => ({
                          ...prev,
                          travelOffered: next,
                          travelFeeEnabled: next ? prev.travelFeeEnabled : false,
                          travelFeeAmount: next ? prev.travelFeeAmount : "",
                        }))
                      }
                      trueLabel="Yes"
                      falseLabel="No"
                    />
                  </div>

                  {draft.travelOffered ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Label className="text-base">Is there a travel fee?</Label>
                        <ToggleGroup
                          value={draft.travelFeeEnabled}
                          onChange={(next) =>
                            setDraft((prev) => ({
                              ...prev,
                              travelFeeEnabled: next,
                              travelFeeAmount: next ? prev.travelFeeAmount : "",
                            }))
                          }
                          trueLabel="Yes"
                          falseLabel="No"
                        />
                      </div>

                      {draft.travelFeeEnabled ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>How do you charge?</Label>
                            <div className="flex flex-wrap gap-2">
                              {[
                                { value: "per_mile", label: "Per mile" },
                                { value: "per_hour", label: "Per hour" },
                                { value: "flat", label: "Flat rate" },
                              ].map((option) => (
                                <Button
                                  key={option.value}
                                  type="button"
                                  size="sm"
                                  variant={draft.travelFeeType === option.value ? "default" : "outline"}
                                  onClick={() =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      travelFeeType: option.value as TravelFeeType,
                                    }))
                                  }
                                >
                                  {option.label}
                                </Button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Travel fee</Label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input
                                className="pl-7"
                                value={draft.travelFeeAmount}
                                inputMode="decimal"
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    travelFeeAmount: event.target.value.replace(/[^\d.]/g, ""),
                                  }))
                                }
                                placeholder={
                                  draft.travelFeeType === "per_mile"
                                    ? "e.g. 2.50"
                                    : draft.travelFeeType === "per_hour"
                                    ? "e.g. 35"
                                    : "e.g. 75"
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </Card>
              ) : null}

              {showDeliverySection ? (
                <Card className="space-y-5 p-6">
                  <div className="text-xl font-semibold">Delivery</div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-base">Do you deliver?</Label>
                    <ToggleGroup
                      value={draft.deliveryIncluded}
                      onChange={(next) =>
                        setDraft((prev) => ({
                          ...prev,
                          deliveryIncluded: next,
                          deliveryFeeEnabled: next ? prev.deliveryFeeEnabled : false,
                          deliveryFeeAmount: next ? prev.deliveryFeeAmount : "",
                        }))
                      }
                      trueLabel="Yes"
                      falseLabel="No"
                    />
                  </div>

                  <p className="text-sm text-muted-foreground">
                    If no, this listing is pickup only.
                  </p>

                  {draft.deliveryIncluded ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Label className="text-base">Is there a delivery fee?</Label>
                        <ToggleGroup
                          value={draft.deliveryFeeEnabled}
                          onChange={(next) =>
                            setDraft((prev) => ({
                              ...prev,
                              deliveryFeeEnabled: next,
                              deliveryFeeAmount: next ? prev.deliveryFeeAmount : "",
                            }))
                          }
                          trueLabel="Yes"
                          falseLabel="No"
                        />
                      </div>

                      {draft.deliveryFeeEnabled ? (
                        <div className="max-w-sm space-y-2">
                          <Label>Delivery fee</Label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              className="pl-7"
                              value={draft.deliveryFeeAmount}
                              inputMode="decimal"
                              placeholder="e.g. 50"
                              onChange={(event) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  deliveryFeeAmount: event.target.value.replace(/[^\d.]/g, ""),
                                }))
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </Card>
              ) : null}

              {showSetupSection ? (
                <Card className="space-y-5 p-6">
                  <div className="text-xl font-semibold">Setup</div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-base">Do you set up?</Label>
                    <ToggleGroup
                      value={draft.setupIncluded}
                      onChange={(next) =>
                        setDraft((prev) => ({
                          ...prev,
                          setupIncluded: next,
                          setupFeeEnabled: next ? prev.setupFeeEnabled : false,
                          setupFeeAmount: next ? prev.setupFeeAmount : "",
                        }))
                      }
                      trueLabel="Yes"
                      falseLabel="No"
                    />
                  </div>

                  {draft.setupIncluded ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Label className="text-base">Is there a setup fee?</Label>
                        <ToggleGroup
                          value={draft.setupFeeEnabled}
                          onChange={(next) =>
                            setDraft((prev) => ({
                              ...prev,
                              setupFeeEnabled: next,
                              setupFeeAmount: next ? prev.setupFeeAmount : "",
                            }))
                          }
                          trueLabel="Yes"
                          falseLabel="No"
                        />
                      </div>

                      {draft.setupFeeEnabled ? (
                        <div className="max-w-sm space-y-2">
                          <Label>Setup fee</Label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                              className="pl-7"
                              value={draft.setupFeeAmount}
                              inputMode="decimal"
                              placeholder="e.g. 75"
                              onChange={(event) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  setupFeeAmount: event.target.value.replace(/[^\d.]/g, ""),
                                }))
                              }
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </Card>
              ) : null}

              {!showTravelSection && !showDeliverySection && !showSetupSection ? (
                <Card className="p-6 text-sm text-muted-foreground">
                  Select a category in Listing Basics to configure applicable logistics options.
                </Card>
              ) : null}
            </div>
          </div>
        )}

        {currentStep === "media" && (
          <div className="mx-auto w-full max-w-[53rem] space-y-8">
            <header className="space-y-3">
              <h1 className="text-5xl font-semibold tracking-tight">Photos & Videos</h1>
              <p className="text-base text-muted-foreground">
                Add at least 3 photos to publish. Drafts can be saved with fewer photos.
              </p>
            </header>

            <Card className="space-y-5 p-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(event) => void onPickPhotos(event.target.files)}
              />

              <div className="flex flex-wrap gap-3">
                <Button type="button" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Add photos
                </Button>
                <span className="text-sm text-muted-foreground">
                  {draft.photoNames.length} photo{draft.photoNames.length === 1 ? "" : "s"} uploaded
                </span>
              </div>

              <InlinePhotoEditor
                photos={draft.photoNames.map((name, index) => ({
                  id: name,
                  name,
                  src: draft.photoPreviews[index] || `/uploads/listings/${name}`,
                }))}
                coverRatio={draft.coverPhotoRatio}
                cropsByPhotoId={draft.photoCropsByName}
                onAddPhotos={() => fileInputRef.current?.click()}
                onRemovePhoto={removePhotoByName}
                onReorderPhotos={reorderPhotos}
                onCoverRatioChange={(ratio) => setDraft((prev) => ({ ...prev, coverPhotoRatio: ratio }))}
                onCropChange={setPhotoCropByName}
              />

              {!hasMinPhotos ? (
                <p className="text-sm text-muted-foreground">
                  Publish readiness requires at least {MIN_PHOTOS_FOR_PUBLISH} photos.
                </p>
              ) : null}

              <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Video uploads are deferred for launch safety in this pass. TODO: add dedicated MP4/MOV upload endpoint and
                duration/size validation before enabling vendor video uploads.
              </div>
            </Card>
          </div>
        )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-24 right-0 z-30 bg-[#ffffff]/96 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 pt-4 pb-8 sm:px-12 lg:px-16">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={stepIndex === 0}
              className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
            >
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isPublishing}
              className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
            >
              {isSavingDraft ? "Saving..." : "Save Draft"}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {isLastStep ? (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isPublishing}
                className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
              >
                Finish
              </Button>
            ) : (
              <Button
                type="button"
                onClick={goNext}
                disabled={isPublishing}
                className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
              >
                Continue
              </Button>
            )}

            {isLastStep && publishReady ? (
              <Button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
              >
                {isPublishing ? "Publishing..." : "Publish"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
