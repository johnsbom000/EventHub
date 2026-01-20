
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Save, Upload } from "lucide-react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Slider } from "@/components/ui/slider";
import { LocationPicker } from "@/components/LocationPicker";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? "";

function boundsFromCircleFeature(feature: any) {
  const ring: [number, number][] | undefined =
    feature?.geometry?.type === "Polygon"
      ? feature.geometry.coordinates?.[0]
      : undefined;

  if (!ring || ring.length === 0) return null;

  let minLng = ring[0][0],
    maxLng = ring[0][0];
  let minLat = ring[0][1],
    maxLat = ring[0][1];

  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
}

// Provider-agnostic circle polygon generator (GeoJSON)
function makeCircleGeoJSON(
  center: { lat: number; lng: number },
  radiusMiles: number,
  points = 64
) {
  const radiusKm = radiusMiles * 1.60934;
  const earthRadiusKm = 6371;

  const coords: [number, number][] = [];
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const bearing = (2 * Math.PI * i) / points;
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(radiusKm / earthRadiusKm) +
        Math.cos(lat) *
          Math.sin(radiusKm / earthRadiusKm) *
          Math.cos(bearing)
    );
    const lng2 =
      lng +
      Math.atan2(
        Math.sin(bearing) *
          Math.sin(radiusKm / earthRadiusKm) *
          Math.cos(lat),
        Math.cos(radiusKm / earthRadiusKm) - Math.sin(lat) * Math.sin(lat2)
      );

    coords.push([lng2 * (180 / Math.PI), lat2 * (180 / Math.PI)]);
  }

  return {
    type: "Feature" as const,
    properties: { radiusMiles },
    geometry: {
      type: "Polygon" as const,
      coordinates: [coords],
    },
  };
}

function YesNoButtons({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={[
          "px-3 py-1.5 text-sm font-medium transition",
          value ? "bg-emerald-100 text-emerald-900" : "bg-white text-muted-foreground hover:bg-muted",
        ].join(" ")}
        aria-pressed={value}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={[
          "px-3 py-1.5 text-sm font-medium transition border-l",
          !value ? "bg-emerald-100 text-emerald-900" : "bg-white text-muted-foreground hover:bg-muted",
        ].join(" ")}
        aria-pressed={!value}
      >
        No
      </button>
    </div>
  );
}

type PricingMode = "single_service" | "package" | "a_la_carte";

type StepId =
  | "listingType"
  | "propTypes"
  | "tags" // Title & Description
  | "popularFor"
  | "pricing"
  | "photos"
  | "deliverySetup";

const STEPS: { id: StepId; title: string }[] = [
  { id: "listingType", title: "Listing Type" },
  { id: "propTypes", title: "Prop Types" },
  { id: "tags", title: "Title & Description" },
  { id: "popularFor", title: "Popular For" },
  { id: "pricing", title: "Pricing" },
  { id: "photos", title: "Photos" },
  { id: "deliverySetup", title: "Delivery / Setup" },
];

type PricingUnit = "per_day" | "per_hour";

type PerPropPricing = {
  rate: string;
  minimumHours: string; // only used for per_hour
};

type ListingDraft = {
  pricingMode: PricingMode | null;

  // Prop/Decor-specific
  propTypes: string[];

  // Quantities (only meaningful for a_la_carte)
  quantitiesByPropType: Record<string, string>; // numeric string

  // Title/Description rules:
  // - single_service/package: one title+description (shared)
  // - a_la_carte: title+description per prop type
  listingTitle: string;
  listingDescription: string;
  perPropDetails: Record<string, { title: string; description: string }>;

  // Tags:
  // - single_service/package: stored under LISTING_TAG_KEY
  // - a_la_carte: stored per prop type key
  tagsByPropType: Record<string, { label: string; slug: string }[]>;

  popularFor: string[];

  // Pricing rules:
  // - single_service/package: one price (listing-level)
  // - a_la_carte: price per prop type
  pricingUnit: PricingUnit;
  rate: string; // listing-level
  minimumHours: string; // listing-level, only used for per_hour
  pricingByPropType: Record<string, PerPropPricing>;

  // Delivery / Setup
  serviceAreaMode: "radius" | "nationwide" | "global";
  serviceRadiusMiles: number;

  serviceCenter?: { lat: number; lng: number };
  serviceLocation?: LocationResult | null;

  // Delivery
  deliveryIncluded: boolean;
  deliveryFeeEnabled: boolean;
  deliveryPerMile: string; // (used as amount input in UI)
  
  // Setup
  setupIncluded: boolean;
  setupFeeEnabled: boolean;
  setupFlatFee: string;

  // Photos (listing-level)
  photoPreviews: string[];
  photoNames: string[];

  // Photos (a_la_carte per prop type)
  photosByPropType: Record<string, { previews: string[]; names: string[] }>;
};

const DEFAULT_DRAFT: ListingDraft = {
  pricingMode: null,

  propTypes: [],
  quantitiesByPropType: {},

  listingTitle: "",
  listingDescription: "",
  perPropDetails: {},

  tagsByPropType: {},

  popularFor: [],

  pricingUnit: "per_day",
  rate: "",
  minimumHours: "",
  pricingByPropType: {},

  serviceAreaMode: "radius",
  serviceRadiusMiles: 30,

  deliveryIncluded: false,
  deliveryFeeEnabled: false,
  deliveryPerMile: "",

  setupIncluded: false,
  setupFeeEnabled: false,
  setupFlatFee: "",

  photoPreviews: [],
  photoNames: [],
  photosByPropType: {},
};

const PROP_TYPES = [
  "Arches",
  "Backdrops",
  "Signage",
  "Tabletop Decor",
  "Linens",
  "Lighting",
  "Photo Booths",
  "Furniture & Lounges",
  "Floral & Greenery",
  "Food Displays",
  "Carts & Stations",
  "Games & Activities",
  "Staging & Structures",
  "Apparel & Accessories",
  "Other",
] as const;

const LISTING_TAG_KEY = "__listing__";

// Popular tags suggestions per prop type
const TAG_SUGGESTIONS: Record<string, string[]> = {
  Arches: ["Hex Arch", "Round Arch", "Boho", "Gold", "White", "Modern"],
  Backdrops: ["Draped", "Neutral", "Black", "White", "Vintage", "Modern"],
  Signage: ["Welcome", "Seating Chart", "Bar Menu", "Neon", "Acrylic", "Wood"],
  "Tabletop Decor": ["Candles", "Neutral", "Modern", "Gold", "Silver", "Vintage"],
  Linens: ["Ivory", "White", "Black", "Sage", "Dusty Rose", "Velvet"],
  Lighting: ["Bistro Lights", "Uplighting", "Neon", "Warm", "Cool", "LED"],
  "Photo Booths": ["Vintage Booth", "Backdrop", "Props", "Modern", "Neon", "Prints"],
  "Furniture & Lounges": ["Lounge", "Rattan", "Modern", "Vintage", "Neutral", "White"],
  "Floral & Greenery": ["Neutral", "Modern", "Boho", "Green", "White", "Garden"],
  "Food Displays": ["Donut Wall", "Champagne Wall", "Dessert", "Modern", "Rustic"],
  "Carts & Stations": ["Coffee Cart", "Bar Cart", "Modern", "Vintage", "White"],
  "Games & Activities": ["Lawn Games", "Cornhole", "Giant Jenga", "Kids", "Outdoor"],
  "Staging & Structures": ["Stage", "Platform", "Pipe & Drape", "Modern", "Black"],
  "Apparel & Accessories": ["Hats", "Robes", "Props", "Modern", "Neutral"],
  Other: ["Custom", "Handmade", "Modern", "Neutral"],
};

const POPULAR_FOR_OPTIONS = [
  "Weddings",
  "Corporate",
  "Baby Showers",
  "Photoshoots",
  "Birthdays",
  "Bridal Showers",
  "Graduations",
  "Holiday Parties",
] as const;

/** Normalize tags:
 * - strip special symbols
 * - collapse whitespace
 * - Title Case display label
 * - slug lowercase with hyphens
 * - max 30 chars (label)
 */
function normalizeTag(raw: string): { label: string; slug: string } | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  // allow letters/numbers/spaces/hyphens only
  const cleaned = trimmed.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const capped = cleaned.slice(0, 30);

  const label = capped
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  const slug = label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  if (!slug) return null;
  return { label, slug };
}

function titleCaseNoSymbols(raw: string, maxLen: number) {
  const cleaned = (raw ?? "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export type CreateListingWizardProps = {
  onClose: () => void;
  editMode?: boolean;
  initialData?: any;
};

export function CreateListingWizard({ onClose, editMode, initialData }: CreateListingWizardProps) {
  const { toast } = useToast();

// Vendor profile (Auth0 Bearer automatically attached by queryClient default queryFn)
const { data: me } = useQuery({
  queryKey: ["/api/vendor/me"],
});

const { data: vendorProfile } = useQuery({
  queryKey: ["/api/vendor/profile"],
});

// Wizard state
const vendorType = (me?.vendorType || "unspecified") as string;
const [currentStep, setCurrentStep] = useState<StepId>("listingType");
const [draft, setDraft] = useState<ListingDraft>(DEFAULT_DRAFT);

  // Default listing service center from vendor onboarding address (one-time per listing)
  useEffect(() => {
    if (!vendorProfile) return;

    // Don’t overwrite if listing already has a center/location
    if (draft.serviceCenter || draft.serviceLocation) return;

    const addr = (vendorProfile as any)?.address || "";
    const city = (vendorProfile as any)?.city || "";
    const state = (vendorProfile as any)?.state || "";
    const zip =
      (vendorProfile as any)?.zipCode || (vendorProfile as any)?.postalCode || "";

    const q = [addr, city, state, zip].filter(Boolean).join(", ").trim();
    if (!q) return;

    (async () => {
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;

        const results: LocationResult[] = await res.json();
        const top = results?.[0];
        if (!top) return;

        setDraft((d) => {
          if (d.serviceCenter || d.serviceLocation) return d; // async safety
          return {
            ...d,
            serviceLocation: top,                 // <- makes LocationPicker show text
            serviceCenter: { lat: top.lat, lng: top.lng },
          };
        });
      } catch {
        // ignore
      }
    })();
  }, [vendorProfile, draft.serviceCenter, draft.serviceLocation]);



  useEffect(() => {
    console.log("[CreateListingWizard] vendorProfile =", vendorProfile);
  }, [vendorProfile]);


  // Track the furthest step the user reached using Next (prevents “jumping forward” via sidebar)
  // -------- Step 7: Service area map state (listing-specific) --------
  const mode = draft.serviceAreaMode ?? "radius";
  const radius = draft.serviceRadiusMiles ?? 0;

  // Center derived from selected location first, then stored coords
  const center =
    draft.serviceLocation
      ? { lat: draft.serviceLocation.lat, lng: draft.serviceLocation.lng }
      : draft.serviceCenter
      ? draft.serviceCenter
      : null;

  const circleFeature = useMemo(() => {
    if (!center) return null;
    return makeCircleGeoJSON(center, radius);
  }, [center, radius]);

  const radiusFeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: circleFeature ? [circleFeature] : [],
    };
  }, [circleFeature]);

  const centerFeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: center
        ? [
            {
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "Point" as const,
                coordinates: [center.lng, center.lat],
              },
            },
          ]
        : [],
    };
  }, [center]);

  const [isMapReady, setIsMapReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Initialize the map once (Step 7)
  useEffect(() => {
    if (currentStep !== "deliverySetup") return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    if (!MAPBOX_TOKEN) {
      console.error("Missing VITE_MAPBOX_TOKEN");
      setErrorMsg("Missing Mapbox token. Please set VITE_MAPBOX_TOKEN.");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const initialCenter: [number, number] = center
      ? [center.lng, center.lat]
      : [-111.891, 40.7608]; // fallback (UT)

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: 10,
    });

    mapRef.current = map;

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
          "fill-opacity": 0.25,
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
        } catch {}
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // ResizeObserver: fixes “blank map” when container size changes
  useEffect(() => {
    const map = mapRef.current;
    const el = mapContainerRef.current;
    if (!map || !el) return;

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {}
    });

    ro.observe(el);

    requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {}
    });

    return () => ro.disconnect();
  }, [currentStep]);

  // Update sources + camera whenever center/radius changes (and after map is ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isMapReady) return;

    const radiusSrc = map.getSource("radius") as mapboxgl.GeoJSONSource | undefined;
    if (radiusSrc) radiusSrc.setData(radiusFeatureCollection as any);

    const centerSrc = map.getSource("center") as mapboxgl.GeoJSONSource | undefined;
    if (centerSrc) centerSrc.setData(centerFeatureCollection as any);

    if (center) {
      // If using radius mode, fit the viewport to show the whole circle
      if (mode === "radius" && circleFeature && radius >= 15) {
        const b = boundsFromCircleFeature(circleFeature);
        if (b) {
          map.fitBounds(b, {
            padding: 24,
            duration: 600,
            maxZoom: 11,
          });
          return;
        }
      }

      // Fallback
      map.easeTo({
        center: [center.lng, center.lat],
        zoom: 10,
        duration: 500,
      });
    }
  }, [
    isMapReady,
    center,
    radius,
    mode,
    circleFeature,
    radiusFeatureCollection,
    centerFeatureCollection,
  ]);


  const [maxStepReached, setMaxStepReached] = useState<number>(0);

  const [listingId, setListingId] = useState<string | null>(null);
  const hasCreatedDraftRef = useRef(false);

  const pendingSaveRef = useRef<any | null>(null);

  const createDraft = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vendor/listings", { listingData: {} });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create draft");
      return json;
    },
    onSuccess: (data: any) => {
      const id = data?.data?.id || data?.id;
      if (id) {
        setListingId(id);

        // Flush any autosave that fired before the draft existed
        if (pendingSaveRef.current) {
          updateDraft.mutate(pendingSaveRef.current);
          pendingSaveRef.current = null;
        }
      }
    },

    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message || "Could not create draft listing.",
        variant: "destructive",
      });
    },
  });

  const updateDraft = useMutation({
    mutationFn: async (payload: any) => {
      if (!listingId) return;
      const res = await apiRequest("PATCH", `/api/vendor/listings/${listingId}`, {
        listingData: payload,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to update draft");
      return json;
    },
  });

  // Autosave listingData (serializable only)
  useEffect(() => {
    // Only create a draft after the user has actually started entering data
    const hasMeaningfulData =
      (draft.listingTitle || "").trim().length > 0 ||
      (draft.listingDescription || "").trim().length > 0 ||
      (draft.propTypes?.length || 0) > 0 ||
      (draft.photoPreviews?.length || 0) > 0 ||
      (draft.rate && String(draft.rate).trim().length > 0);

    // If user hasn't done anything yet, do nothing (prevents empty shell drafts)
    if (!hasMeaningfulData) return;

    const payload = {
  vendorType,
  pricingMode: draft.pricingMode,

  propTypes: draft.propTypes,
  quantitiesByPropType: draft.quantitiesByPropType,

  listingTitle: draft.listingTitle,
  listingDescription: draft.listingDescription,
  perPropDetails: draft.perPropDetails,

  tagsByPropType: draft.tagsByPropType,
  popularFor: draft.popularFor,

  pricing: {
    unit: draft.pricingUnit,
    rate: draft.rate ? Number(draft.rate) : null,
    minimumHours: draft.minimumHours ? Number(draft.minimumHours) : null,
    pricingByPropType: Object.fromEntries(
      Object.entries(draft.pricingByPropType).map(([k, v]) => [
        k,
        {
          rate: v.rate ? Number(v.rate) : null,
          minimumHours: v.minimumHours ? Number(v.minimumHours) : null,
        },
      ])
    ),
  },

  photos: {
    count: draft.photoPreviews.length,
    names: draft.photoNames,
    byPropType: Object.fromEntries(
      Object.entries(draft.photosByPropType).map(([k, v]) => [
        k,
        { count: v.previews.length, names: v.names },
      ])
    ),
  },

  deliverySetup: {
    serviceAreaMode: draft.serviceAreaMode,
    serviceRadiusMiles: draft.serviceRadiusMiles ? Number(draft.serviceRadiusMiles) : null,
    deliveryIncluded: draft.deliveryIncluded,
    deliveryFeeEnabled: draft.deliveryFeeEnabled,
    deliveryFeeAmount: draft.deliveryPerMile ? Number(draft.deliveryPerMile) : null,
    setupIncluded: draft.setupIncluded,
    setupFeeEnabled: draft.setupFeeEnabled,
    setupFeeAmount: draft.setupFlatFee ? Number(draft.setupFlatFee) : null,
  },
};

    // If we don't have a listing yet, create ONE draft, then autosave will kick in on next change
    if (!listingId) {
      if (hasCreatedDraftRef.current) return;
      hasCreatedDraftRef.current = true;
      pendingSaveRef.current = payload;
      createDraft.mutate();
      return;
    }

  const t = setTimeout(() => {
    updateDraft.mutate(payload);
    }, 1200);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, listingId, vendorType]);

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.id === currentStep), [currentStep]);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (!next) return;

    const nextIndex = stepIndex + 1;
    setCurrentStep(next.id);
    setMaxStepReached((m) => Math.max(m, nextIndex));
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setCurrentStep(prev.id);
  };

  const canContinue = useMemo(() => {
    if (currentStep === "listingType") return !!draft.pricingMode;

    if (currentStep === "propTypes") {
      if (draft.propTypes.length === 0) return false;

      if (draft.pricingMode === "single_service") return draft.propTypes.length === 1;

      if (draft.pricingMode === "a_la_carte") {
        return draft.propTypes.every((pt) => {
          const q = draft.quantitiesByPropType[pt];
          const n = Number(q);
          return Number.isFinite(n) && n >= 1;
        });
      }

      return true;
    }

    // Title & Description
    if (currentStep === "tags") {
      if (draft.propTypes.length === 0) return false;

      if (draft.pricingMode === "a_la_carte") {
        return draft.propTypes.every((pt) => {
          const d = draft.perPropDetails[pt];
          return !!d?.title?.trim() && !!d?.description?.trim();
        });
      }

      return !!draft.listingTitle.trim() && !!draft.listingDescription.trim();
    }

    if (currentStep === "pricing") {
      if (draft.pricingMode === "a_la_carte") {
        if (draft.propTypes.length === 0) return false;
        return draft.propTypes.every((pt) => {
          const p = draft.pricingByPropType[pt];
          if (!p?.rate?.trim()) return false;
          if (draft.pricingUnit === "per_hour" && !p?.minimumHours?.trim()) return false;
          return true;
        });
      }

      if (!draft.rate.trim()) return false;
      if (draft.pricingUnit === "per_hour" && !draft.minimumHours.trim()) return false;
      return true;
    }

    // Photos: can skip (Add Later), enforced before publish later
    if (currentStep === "photos") return true;

    // Delivery / Setup: optional, always continue
    if (currentStep === "deliverySetup") return true;

    return true;
  }, [currentStep, draft]);

  const saveAndExit = () => {
    toast({
      title: "Saved",
      description: "Draft saved. You can come back anytime.",
    });
    onClose();
  };

  const pricingModeConfig = useMemo(() => {
    return {
      headline: "How will you list your services?",
      subhead: "Choose a simple structure. You can create more listings later.",
      cards: [
        { mode: "single_service" as PricingMode, title: "Single Item", desc: "Single service with simple pricing." },
        { mode: "package" as PricingMode, title: "Package", desc: "Bundled services into named packages." },
        { mode: "a_la_carte" as PricingMode, title: "A La Carte", desc: "Customers choose individual props with individual pricing." },
      ],
    };
  }, []);

  /**
   * IMPORTANT FIX:
   * When listing type changes, reset the entire draft so no old selections leak across flows.
   * (Going back without changing listing type keeps everything.)
   */
  const setPricingMode = (mode: PricingMode) => {
    setDraft((d) => {
      if (d.pricingMode === mode) return d;

      // Revoke any existing preview URLs before wiping state
      d.photoPreviews.forEach((u) => URL.revokeObjectURL(u));
      Object.values(d.photosByPropType).forEach((bucket) => bucket.previews.forEach((u) => URL.revokeObjectURL(u)));

      const next: ListingDraft = {
        ...DEFAULT_DRAFT,
        pricingMode: mode,
      };

      return next;
    });

    // Reset navigation progress when listing type changes
    setCurrentStep("listingType");
    setMaxStepReached(0);
  };

  // Title/Description helpers
  const updateSharedTitle = (raw: string) => {
    const val = titleCaseNoSymbols(raw, 60);
    setDraft((d) => ({ ...d, listingTitle: val }));
  };

  const updatePerPropTitle = (pt: string, raw: string) => {
    const val = titleCaseNoSymbols(raw, 60);
    setDraft((d) => ({
      ...d,
      perPropDetails: {
        ...d.perPropDetails,
        [pt]: { title: val, description: d.perPropDetails[pt]?.description ?? "" },
      },
    }));
  };

  // Tags UI helpers
  const [tagInputByProp, setTagInputByProp] = useState<Record<string, string>>({});

  const addTag = (key: string, raw: string) => {
    const norm = normalizeTag(raw);
    if (!norm) return;

    setDraft((d) => {
      const existing = d.tagsByPropType[key] ?? [];
      const already = existing.some((t) => t.slug === norm.slug);
      if (already) return d;
      if (existing.length >= 15) return d;

      return {
        ...d,
        tagsByPropType: {
          ...d.tagsByPropType,
          [key]: [...existing, norm],
        },
      };
    });

    setTagInputByProp((m) => ({ ...m, [key]: "" }));
  };

  const removeTag = (key: string, slug: string) => {
    setDraft((d) => {
      const existing = d.tagsByPropType[key] ?? [];
      return {
        ...d,
        tagsByPropType: {
          ...d.tagsByPropType,
          [key]: existing.filter((t) => t.slug !== slug),
        },
      };
    });
  };

  // Quantity helpers (a_la_carte)
  const setPropQuantity = (pt: string, raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setDraft((d) => ({
      ...d,
      quantitiesByPropType: {
        ...d.quantitiesByPropType,
        [pt]: cleaned,
      },
    }));
  };

  const togglePropType = (pt: string) => {
    setDraft((d) => {
      const mode = d.pricingMode;

      if (mode === "single_service") {
        const isSelected = d.propTypes[0] === pt;
        const nextPropTypes = isSelected ? [] : [pt];

        if (isSelected) {
          setTagInputByProp((m) => {
            const { [pt]: _i, ...rest } = m;
            return rest;
          });
        }

        return {
          ...d,
          propTypes: nextPropTypes,
          quantitiesByPropType: isSelected ? {} : { [pt]: "1" },
          perPropDetails: isSelected ? {} : { [pt]: d.perPropDetails[pt] ?? { title: "", description: "" } },
          pricingByPropType: isSelected ? {} : { [pt]: d.pricingByPropType[pt] ?? { rate: "", minimumHours: "" } },
        };
      }

      // package / a_la_carte: multi-select
      const has = d.propTypes.includes(pt);
      const nextPropTypes = has ? d.propTypes.filter((x) => x !== pt) : [...d.propTypes, pt];

      let nextPerPropDetails = d.perPropDetails;
      let nextPricingByPropType = d.pricingByPropType;
      let nextPhotosByProp = d.photosByPropType;
      let nextQty = d.quantitiesByPropType;

      if (has) {
        setTagInputByProp((m) => {
          const { [pt]: _i, ...restInputs } = m;
          return restInputs;
        });

        // remove quantity
        const { [pt]: _removedQty, ...restQty } = d.quantitiesByPropType;
        nextQty = restQty;

        if (d.pricingMode === "a_la_carte") {
          const { [pt]: _removedDetails, ...restDetails } = d.perPropDetails;
          nextPerPropDetails = restDetails;

          const { [pt]: _removedPricing, ...restPricing } = d.pricingByPropType;
          nextPricingByPropType = restPricing;

          // remove per-prop photos + revoke previews
          const existingPhotos = d.photosByPropType[pt];
          if (existingPhotos) {
            existingPhotos.previews.forEach((u) => URL.revokeObjectURL(u));
          }
          const { [pt]: _removedPhotos, ...restPhotos } = d.photosByPropType;
          nextPhotosByProp = restPhotos;
        }
      } else if (!has && d.pricingMode === "a_la_carte") {
        nextPerPropDetails = {
          ...d.perPropDetails,
          [pt]: d.perPropDetails[pt] ?? { title: "", description: "" },
        };
        nextPricingByPropType = {
          ...d.pricingByPropType,
          [pt]: d.pricingByPropType[pt] ?? { rate: "", minimumHours: "" },
        };
        nextPhotosByProp = {
          ...d.photosByPropType,
          [pt]: d.photosByPropType[pt] ?? { previews: [], names: [] },
        };
        nextQty = {
          ...d.quantitiesByPropType,
          [pt]: d.quantitiesByPropType[pt] ?? "1",
        };
      } else if (!has && d.pricingMode !== "a_la_carte") {
        // package: we still allow selecting propTypes, but quantity is irrelevant.
        // Keep it empty to avoid confusion.
        nextQty = d.quantitiesByPropType;
      }

      return {
        ...d,
        propTypes: nextPropTypes,
        quantitiesByPropType: nextQty,
        perPropDetails: nextPerPropDetails,
        pricingByPropType: nextPricingByPropType,
        photosByPropType: nextPhotosByProp,
      };
    });
  };

  // Photos (listing-level)
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // A La Carte photos (per prop)
  const [photoFilesByProp, setPhotoFilesByProp] = useState<Record<string, File[]>>({});
  const fileInputRefsByProp = useRef<Record<string, HTMLInputElement | null>>({});

    const onPickPhotosForProp = (propType: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const all = Array.from(files);
    console.log(
      "[photo pick]",
      all.map((f) => ({ name: f.name, type: f.type, size: f.size }))
    );


    const rejectedHeic = all.filter(
      (f) =>
        f.type === "image/heic" ||
        f.type === "image/heif" ||
        f.name.toLowerCase().endsWith(".heic") ||
        f.name.toLowerCase().endsWith(".heif")
    );

    if (rejectedHeic.length) {
      toast({
        title: "Unsupported image format",
        description: "Please upload JPG, PNG, or WebP (HEIC/HEIF not supported yet).",
        variant: "destructive",
      });
    }

    const picked = all.filter((f) => allowed.has(f.type));
    if (picked.length === 0) return;

    const previews = picked.map((f) => URL.createObjectURL(f));
    const names = picked.map((f) => f.name);

    setPhotoFilesByProp((prev) => ({
      ...prev,
      [propType]: [...(prev[propType] ?? []), ...picked],
    }));

    setDraft((d) => {
      const existing = d.photosByPropType[propType] ?? { previews: [], names: [] };
      return {
        ...d,
        photosByPropType: {
          ...d.photosByPropType,
          [propType]: {
            previews: [...existing.previews, ...previews],
            names: [...existing.names, ...names],
          },
        },
      };
    });

    const input = fileInputRefsByProp.current[propType];
    if (input) input.value = "";
  };


  const removePhotoForPropAt = (propType: string, idx: number) => {
    setDraft((d) => {
      const existing = d.photosByPropType[propType];
      if (!existing) return d;

      const nextPreviews = existing.previews.slice();
      const nextNames = existing.names.slice();

      const removedPreview = nextPreviews[idx];
      if (removedPreview) URL.revokeObjectURL(removedPreview);

      nextPreviews.splice(idx, 1);
      nextNames.splice(idx, 1);

      const nextPhotosByProp = { ...d.photosByPropType };
      nextPhotosByProp[propType] = { previews: nextPreviews, names: nextNames };

      return { ...d, photosByPropType: nextPhotosByProp };
    });

    setPhotoFilesByProp((prev) => {
      const arr = prev[propType] ?? [];
      const nextArr = arr.slice();
      nextArr.splice(idx, 1);
      return { ...prev, [propType]: nextArr };
    });
  };

    const onPickPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const all = Array.from(files);
    console.log(
      "[photo pick]",
      all.map((f) => ({ name: f.name, type: f.type, size: f.size }))
    );


    const rejectedHeic = all.filter(
      (f) =>
        f.type === "image/heic" ||
        f.type === "image/heif" ||
        f.name.toLowerCase().endsWith(".heic") ||
        f.name.toLowerCase().endsWith(".heif")
    );

    if (rejectedHeic.length) {
      toast({
        title: "Unsupported image format",
        description: "Please upload JPG, PNG, or WebP (HEIC/HEIF not supported yet).",
        variant: "destructive",
      });
    }

    const picked = all.filter((f) => allowed.has(f.type));
    if (picked.length === 0) return;

    const previews = picked.map((f) => URL.createObjectURL(f));
    const names = picked.map((f) => f.name);

    setPhotoFiles((prev) => [...prev, ...picked]);
    setDraft((d) => ({
      ...d,
      photoPreviews: [...d.photoPreviews, ...previews],
      photoNames: [...d.photoNames, ...names],
    }));

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhotoAt = (idx: number) => {
    setDraft((d) => {
      const nextPreviews = d.photoPreviews.slice();
      const nextNames = d.photoNames.slice();
      const removedPreview = nextPreviews[idx];
      if (removedPreview) URL.revokeObjectURL(removedPreview);

      nextPreviews.splice(idx, 1);
      nextNames.splice(idx, 1);

      return { ...d, photoPreviews: nextPreviews, photoNames: nextNames };
    });

    setPhotoFiles((prev) => {
      const next = prev.slice();
      next.splice(idx, 1);
      return next;
    });
  };

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      draft.photoPreviews.forEach((u) => URL.revokeObjectURL(u));
      Object.values(draft.photosByPropType).forEach((bucket) => {
        bucket.previews.forEach((u) => URL.revokeObjectURL(u));
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pricing helpers
  const setListingRate = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "");
    setDraft((d) => ({ ...d, rate: cleaned }));
  };

  const setListingMinHours = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setDraft((d) => ({ ...d, minimumHours: cleaned }));
  };

  const setPropRate = (pt: string, raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "");
    setDraft((d) => ({
      ...d,
      pricingByPropType: {
        ...d.pricingByPropType,
        [pt]: {
          rate: cleaned,
          minimumHours: d.pricingByPropType[pt]?.minimumHours ?? "",
        },
      },
    }));
  };

  const setPropMinHours = (pt: string, raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setDraft((d) => ({
      ...d,
      pricingByPropType: {
        ...d.pricingByPropType,
        [pt]: {
          rate: d.pricingByPropType[pt]?.rate ?? "",
          minimumHours: cleaned,
        },
      },
    }));
  };

  const isLastStep = stepIndex === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-0 flex">
        {/* Sidebar */}
        <div className="w-72 bg-card border-r border-border p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-semibold">Create Listing</h2>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={saveAndExit} title="Save and exit">
                <Save className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {STEPS.map((s) => {
              const idx = STEPS.findIndex((x) => x.id === s.id);
              const active = s.id === currentStep;

              // Hard rule: allow only back/current up to maxStepReached (never forward)
              const canNavigate = idx <= maxStepReached;

              return (
                <button
                  key={s.id}
                  disabled={!canNavigate}
                  aria-disabled={!canNavigate}
                  onClick={() => {
                    if (!canNavigate) return;
                    setCurrentStep(s.id);
                  }}
                  className={[
                    "w-full text-left rounded-lg px-3 py-2 border transition",
                    active ? "bg-primary text-white border-primary" : "bg-background hover:bg-muted border-border",
                    !canNavigate ? "opacity-50 cursor-not-allowed pointer-events-none" : "",
                  ].join(" ")}
                >
                  {s.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 bg-background p-10 overflow-y-auto">
          {/* Step 1: Listing Type */}
          {currentStep === "listingType" && (
            <div className="max-w-3xl space-y-6">
              <h1 className="text-4xl font-bold">{pricingModeConfig.headline}</h1>
              <p className="text-muted-foreground">{pricingModeConfig.subhead}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {pricingModeConfig.cards.map((c) => (
                  <Card
                    key={c.mode}
                    className={`p-5 cursor-pointer hover:border-primary ${draft.pricingMode === c.mode ? "border-primary" : ""}`}
                    onClick={() => setPricingMode(c.mode)}
                  >
                    <div className="font-semibold mb-1">{c.title}</div>
                    <div className="text-sm text-muted-foreground">{c.desc}</div>
                  </Card>
                ))}
              </div>

              {draft.pricingMode === "single_service" && (
                <div className="text-sm text-muted-foreground">
                  Single Item = select exactly <strong>1</strong> prop type next.
                </div>
              )}
              {draft.pricingMode === "package" && (
                <div className="text-sm text-muted-foreground">
                  Package = select <strong>1+</strong> prop types, then set one bundle price.
                </div>
              )}
              {draft.pricingMode === "a_la_carte" && (
                <div className="text-sm text-muted-foreground">
                  A La Carte = select <strong>1+</strong> prop types, set quantities, then set pricing per prop.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Prop Types */}
          {currentStep === "propTypes" && (
            <div className="max-w-3xl space-y-6">
              <h1 className="text-4xl font-bold">Prop Types</h1>
              <p className="text-muted-foreground">
                {draft.pricingMode === "single_service"
                  ? "Select exactly 1 prop type for this Single Item listing. (Required)"
                  : "Select all prop types included in this listing. (Required)"}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PROP_TYPES.map((pt) => {
                  const checked = draft.propTypes.includes(pt);
                  const showQty = checked && draft.pricingMode === "a_la_carte";
                  const qtyVal = draft.quantitiesByPropType[pt] ?? "1";

                  return (
                    <label
                      key={pt}
                      className={[
                        "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 cursor-pointer",
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={checked} onChange={() => togglePropType(pt)} />
                        <span className="font-medium">{pt}</span>
                      </div>

                      {showQty && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Qty</span>
                          <Input
                            className="w-20 h-9"
                            value={qtyVal}
                            inputMode="numeric"
                            onClick={(e) => e.preventDefault()}
                            onChange={(e) => setPropQuantity(pt, e.target.value)}
                            placeholder="1"
                          />
                        </div>
                      )}
                    </label>
                  );
                })}
              </div>

              {draft.propTypes.length === 0 && (
                <div className="text-sm text-destructive">Select at least 1 prop type to continue.</div>
              )}
              {draft.pricingMode === "single_service" && draft.propTypes.length !== 1 && (
                <div className="text-sm text-destructive">Single Item listings must have exactly 1 prop type selected.</div>
              )}
              {draft.pricingMode === "a_la_carte" &&
                draft.propTypes.length > 0 &&
                draft.propTypes.some((pt) => {
                  const q = Number(draft.quantitiesByPropType[pt]);
                  return !Number.isFinite(q) || q < 1;
                }) && <div className="text-sm text-destructive">Each selected prop must have a quantity of at least 1.</div>}
            </div>
          )}

          {/* Step 3: Title & Description */}
          {currentStep === "tags" && (
            <div className="max-w-3xl space-y-8">
              <div>
                <h1 className="text-4xl font-bold">Title &amp; Description</h1>
                <p className="text-muted-foreground">
                  {draft.pricingMode === "a_la_carte"
                    ? "Add a title, short description, and tags for each prop."
                    : "Add a title, short description, and tags for this listing."}
                </p>
              </div>

              {draft.propTypes.length === 0 ? (
                <div className="text-sm text-muted-foreground">No prop types selected yet. Go back and pick at least 1.</div>
              ) : draft.pricingMode === "a_la_carte" ? (
                <div className="space-y-6">
                  {draft.propTypes.map((pt) => {
                    const tags = draft.tagsByPropType[pt] ?? [];
                    const inputVal = tagInputByProp[pt] ?? "";
                    const suggestions = TAG_SUGGESTIONS[pt] ?? TAG_SUGGESTIONS.Other ?? [];

                    const titleValue = draft.perPropDetails[pt]?.title ?? "";
                    const descValue = draft.perPropDetails[pt]?.description ?? "";

                    return (
                      <Card key={pt} className="p-6 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-xl font-semibold">Item: {pt}</div>
                          <div className="text-sm text-muted-foreground">
                            Qty available: <span className="font-medium">{draft.quantitiesByPropType[pt] ?? "1"}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="font-medium">Title</div>
                          <Input
                            value={titleValue}
                            placeholder={`e.g. ${pt} Rental`}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDraft((d) => ({
                                ...d,
                                perPropDetails: {
                                  ...d.perPropDetails,
                                  [pt]: {
                                    title: raw,
                                    description: d.perPropDetails[pt]?.description ?? "",
                                  },
                                },
                              }));
                            }}
                            onBlur={() => updatePerPropTitle(pt, titleValue)}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="font-medium">Description</div>
                          <Textarea
                            value={descValue}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^a-zA-Z0-9\s-.,'"]/g, "");
                              setDraft((d) => ({
                                ...d,
                                perPropDetails: {
                                  ...d.perPropDetails,
                                  [pt]: {
                                    title: d.perPropDetails[pt]?.title ?? "",
                                    description: cleaned.slice(0, 300),
                                  },
                                },
                              }));
                            }}
                            placeholder="Keep it short—what’s included, style, and what couples should expect."
                            rows={4}
                          />
                          <div className="text-xs text-muted-foreground">Max 300 chars. Special symbols removed.</div>
                        </div>

                        <div className="space-y-3">
                          <div className="font-medium">Tags</div>

                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {tags.map((t) => (
                                <span key={t.slug} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                                  {t.label}
                                  <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => removeTag(pt, t.slug)}
                                    aria-label={`Remove ${t.label}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Input
                              value={inputVal}
                              onChange={(e) =>
                                setTagInputByProp((m) => ({
                                  ...m,
                                  [pt]: e.target.value.replace(/[^a-zA-Z0-9\s-]/g, ""),
                                }))
                              }
                              placeholder="Type a tag…"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addTag(pt, inputVal);
                                }
                              }}
                            />
                            <Button type="button" variant="outline" onClick={() => addTag(pt, inputVal)}>
                              Add
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground">Suggestions</div>
                            <div className="flex flex-wrap gap-2">
                              {suggestions.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  className="rounded-full border px-3 py-1 text-sm hover:bg-muted"
                                  onClick={() => addTag(pt, s)}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground">
                            Rules: Title Case display, slug storage, max 30 chars, max 15 tags, duplicates prevented.
                          </div>
                        </div>

                        {(!titleValue.trim() || !descValue.trim()) && (
                          <div className="text-sm text-destructive">Add a title and description for this item to continue.</div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="p-6 space-y-5">
                  <div className="text-xl font-semibold">Listing Details</div>

                  {draft.propTypes.length > 1 && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Included prop types</div>
                      <div className="flex flex-wrap gap-2">
                        {draft.propTypes.map((pt) => (
                          <span key={pt} className="rounded-full border px-3 py-1 text-sm">
                            {pt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="font-medium">Title</div>
                    <Input
                      value={draft.listingTitle}
                      placeholder={draft.pricingMode === "package" ? "e.g. Vintage Photo Booth Package" : "e.g. Vintage Photo Booth Rental"}
                      onChange={(e) => setDraft((d) => ({ ...d, listingTitle: e.target.value }))}
                      onBlur={() => updateSharedTitle(draft.listingTitle)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="font-medium">Description</div>
                    <Textarea
                      value={draft.listingDescription}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^a-zA-Z0-9\s-.,'"]/g, "");
                        setDraft((d) => ({
                          ...d,
                          listingDescription: cleaned.slice(0, 300),
                        }));
                      }}
                      placeholder="Keep it short—what’s included, style, and what couples should expect."
                      rows={4}
                    />
                    <div className="text-xs text-muted-foreground">Max 300 chars. Special symbols removed.</div>
                  </div>

                  <div className="space-y-3">
                    <div className="font-medium">Tags</div>

                    {(draft.tagsByPropType[LISTING_TAG_KEY] ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(draft.tagsByPropType[LISTING_TAG_KEY] ?? []).map((t) => (
                          <span key={t.slug} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                            {t.label}
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => removeTag(LISTING_TAG_KEY, t.slug)}
                              aria-label={`Remove ${t.label}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        value={tagInputByProp[LISTING_TAG_KEY] ?? ""}
                        onChange={(e) =>
                          setTagInputByProp((m) => ({
                            ...m,
                            [LISTING_TAG_KEY]: e.target.value.replace(/[^a-zA-Z0-9\s-]/g, ""),
                          }))
                        }
                        placeholder="Type a tag…"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag(LISTING_TAG_KEY, tagInputByProp[LISTING_TAG_KEY] ?? "");
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addTag(LISTING_TAG_KEY, tagInputByProp[LISTING_TAG_KEY] ?? "")}
                      >
                        Add
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Rules: Title Case display, slug storage, max 30 chars, max 15 tags, duplicates prevented.
                    </div>
                  </div>

                  {(!draft.listingTitle.trim() || !draft.listingDescription.trim()) && (
                    <div className="text-sm text-destructive">Add a title and description for this listing to continue.</div>
                  )}
                </Card>
              )}
            </div>
          )}

          {/* Step 4: Popular For */}
          {currentStep === "popularFor" && (
            <div className="max-w-3xl space-y-6">
              <h1 className="text-4xl font-bold">Popular For</h1>
              <p className="text-muted-foreground">Optional. Select all that apply.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {POPULAR_FOR_OPTIONS.map((opt) => {
                  const checked = draft.popularFor.includes(opt);
                  return (
                    <label
                      key={opt}
                      className={[
                        "flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer",
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDraft((d) => ({
                            ...d,
                            popularFor: checked ? d.popularFor.filter((x) => x !== opt) : [...d.popularFor, opt],
                          }))
                        }
                      />
                      <span className="font-medium">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5: Pricing */}
          {currentStep === "pricing" && (
            <div className="max-w-3xl space-y-8">
              <div>
                <h1 className="text-4xl font-bold">Pricing</h1>
                <p className="text-muted-foreground">
                  {draft.pricingMode === "a_la_carte"
                    ? "Set a price for each prop. Customers can choose what they want."
                    : "Set one price for this listing."}
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant={draft.pricingUnit === "per_day" ? "default" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, pricingUnit: "per_day" }))}
                >
                  Per day (flat)
                </Button>
                <Button
                  variant={draft.pricingUnit === "per_hour" ? "default" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, pricingUnit: "per_hour" }))}
                >
                  Per hour (+ minimum hours)
                </Button>
              </div>

              {draft.pricingMode === "a_la_carte" ? (
                draft.propTypes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No prop types selected yet. Go back and pick at least 1.</div>
                ) : (
                  <div className="space-y-6">
                    {draft.propTypes.map((pt) => {
                      const p = draft.pricingByPropType[pt] ?? { rate: "", minimumHours: "" };
                      return (
                        <Card key={pt} className="p-6 space-y-4">
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-xl font-semibold">Pricing for {pt}</div>
                            <div className="text-sm text-muted-foreground">
                              Qty available: <span className="font-medium">{draft.quantitiesByPropType[pt] ?? "1"}</span>
                            </div>
                          </div>

                          <div className="space-y-2 max-w-sm">
                            <div className="font-medium">{draft.pricingUnit === "per_day" ? "Rate per day" : "Rate per hour"}</div>
                            <div className="relative">
                              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                                $
                              </div>
                              <Input
                                className="pl-7"
                                value={p.rate}
                                onChange={(e) => setPropRate(pt, e.target.value)}
                                placeholder={draft.pricingUnit === "per_day" ? "e.g. 300" : "e.g. 75"}
                                inputMode="decimal"
                              />
                            </div>
                          </div>

                          {draft.pricingUnit === "per_hour" && (
                            <div className="space-y-2 max-w-sm">
                              <div className="font-medium">Minimum hours</div>
                              <Input
                                value={p.minimumHours}
                                onChange={(e) => setPropMinHours(pt, e.target.value)}
                                placeholder="e.g. 2"
                                inputMode="numeric"
                              />
                            </div>
                          )}

                          {!p.rate.trim() && <div className="text-sm text-destructive">Enter a rate for {pt} to continue.</div>}
                          {draft.pricingUnit === "per_hour" && !p.minimumHours.trim() && (
                            <div className="text-sm text-destructive">Enter minimum hours for {pt} to continue.</div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  <Card className="p-6 space-y-4">
                    <div className="text-xl font-semibold">{draft.pricingMode === "package" ? "Package Price" : "Listing Price"}</div>

                    <div className="space-y-2 max-w-sm">
                      <div className="font-medium">{draft.pricingUnit === "per_day" ? "Rate per day" : "Rate per hour"}</div>

                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                          $
                        </div>
                        <Input
                          className="pl-7"
                          value={draft.rate}
                          onChange={(e) => setListingRate(e.target.value)}
                          placeholder={draft.pricingUnit === "per_day" ? "e.g. 300" : "e.g. 75"}
                          inputMode="decimal"
                        />
                      </div>
                    </div>

                    {draft.pricingUnit === "per_hour" && (
                      <div className="space-y-2 max-w-sm">
                        <div className="font-medium">Minimum hours</div>
                        <Input
                          value={draft.minimumHours}
                          onChange={(e) => setListingMinHours(e.target.value)}
                          placeholder="e.g. 2"
                          inputMode="numeric"
                        />
                      </div>
                    )}

                    {!draft.rate.trim() && <div className="text-sm text-destructive">Enter a rate to continue.</div>}
                    {draft.pricingUnit === "per_hour" && !draft.minimumHours.trim() && (
                      <div className="text-sm text-destructive">Enter minimum hours to continue.</div>
                    )}
                  </Card>

                  {draft.pricingMode === "package" && draft.propTypes.length > 1 && (
                    <div className="text-sm text-muted-foreground">
                      This is one package price for all selected props inside the package.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 6: Photos */}
          {currentStep === "photos" && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h1 className="text-4xl font-bold">Photos</h1>
                <p className="text-muted-foreground">Add photos now, or you can add later. (Photos required before publishing.)</p>
              </div>

              {/* Listing-level photo input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => onPickPhotos(e.target.files)}
              />

              <div className="flex gap-3">
                <Button onClick={() => fileInputRef.current?.click()} className="gap-2" type="button">
                  <Upload className="h-4 w-4" />
                  Add photos
                </Button>

                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    toast({ title: "Okay", description: "You can add photos later. (Required before publishing.)" });
                    goNext();
                  }}
                >
                  Add later
                </Button>
              </div>

              {draft.photoPreviews.length === 0 ? (
                <div className="text-sm text-muted-foreground">No photos added yet.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {draft.photoPreviews.map((src, idx) => (
                    <div key={src} className="rounded-lg border overflow-hidden">
                      <div className="aspect-square bg-muted">
                        <img src={src} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2 flex items-center justify-between gap-2">
                        <div className="text-xs truncate text-muted-foreground">{draft.photoNames[idx] ?? `Photo ${idx + 1}`}</div>
                        <Button variant="ghost" size="sm" onClick={() => removePhotoAt(idx)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs text-muted-foreground">Count: {draft.photoPreviews.length}</div>
            </div>
          )}

          {/* Step 7: Delivery / Setup */}
          {currentStep === "deliverySetup" && (
            <div className="max-w-3xl space-y-10">
              <div>
                <h1 className="text-4xl font-bold">Delivery / Setup</h1>
                <p className="text-muted-foreground">Optional. Add delivery/setup details and fees.</p>
              </div>

              <Card className="p-6 space-y-5">
                <div className="text-xl font-semibold">Delivery</div>
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <Label>Service area center (listing-specific)</Label>
                      <LocationPicker
                        value={draft.serviceLocation ?? null}
                        onChange={(loc) => {
                          setErrorMsg(null);
                          setDraft((d) => ({
                            ...d,
                            serviceLocation: loc,
                            serviceCenter: loc ? { lat: loc.lat, lng: loc.lng } : d.serviceCenter,
                          }));
                        }}
                        placeholder="Search the center point for this listing..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Default comes from your vendor onboarding address, but you can override it per listing.
                      </p>
                    </div>

                    {/* Map preview */}
                    <div className="relative rounded-xl border overflow-hidden h-64">
                      <div ref={mapContainerRef} className="w-full h-full" />

                      {!center && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none bg-background/40">
                          Choose a location to preview your service radius.
                        </div>
                      )}

                      {!isMapReady && (
                        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-background/50">
                          Loading map…
                        </div>
                      )}
                    </div>

                    <Label>Where do you provide these services?</Label>
                    <Select
                      value={draft.serviceAreaMode}
                      onValueChange={(v) => {
                        const next = v as "radius" | "nationwide" | "global";
                        setDraft((d) => ({
                          ...d,
                          serviceAreaMode: next,
                          ...(next === "radius" ? {} : { serviceRadiusMiles: 500 }),
                        }));
                      }}

                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select service area" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="radius">Set Radius</SelectItem>
                        <SelectItem value="nationwide">Nationally</SelectItem>
                        <SelectItem value="global">Globally</SelectItem>
                      </SelectContent>
                    </Select>

                    {draft.serviceAreaMode === "radius" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Service radius</Label>
                        <span className="text-sm text-muted-foreground">
                          {draft.serviceRadiusMiles} miles
                        </span>
                      </div>

                      <Slider
                        value={[draft.serviceRadiusMiles]}
                        min={0}
                        max={500}
                        step={15}
                        onValueChange={(vals) => {
                          const value = vals?.[0] ?? 0;
                          setDraft((d) => ({ ...d, serviceRadiusMiles: value }));
                        }}
                        disabled={!center}
                      />

                      <p className="text-xs text-muted-foreground">
                        Adjust in 15-mile increments. (Max 500 miles)
                      </p>
                    </div>
                  )}
                  </div>
                <div className="flex items-center justify-between gap-6">
                  <Label>Do you deliver?</Label>
                  <YesNoButtons
                    value={draft.deliveryIncluded}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        deliveryIncluded: v,
                        deliveryFeeEnabled: v ? d.deliveryFeeEnabled : false,
                        deliveryPerMile: v ? d.deliveryPerMile : "",
                      }))
                    }
                  />
                </div>

                {draft.deliveryIncluded && (
                  <div className="flex items-center justify-between gap-6">
                    <Label>Is there a delivery fee?</Label>
                    <YesNoButtons
                      value={draft.deliveryFeeEnabled}
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          deliveryFeeEnabled: v,
                          deliveryPerMile: v ? d.deliveryPerMile : "",
                        }))
                      }
                    />
                  </div>
                )}

                {draft.deliveryIncluded && draft.deliveryFeeEnabled && (
                  <div className="space-y-2 max-w-sm">
                    <Label>Delivery fee amount</Label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        $
                      </div>
                      <Input
                        className="pl-7"
                        value={draft.deliveryPerMile}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            deliveryPerMile: e.target.value.replace(/[^\d.]/g, ""),
                          }))
                        }
                        placeholder="e.g. 50"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-6 space-y-5">
                <div className="text-xl font-semibold">Setup</div>

                <div className="flex items-center justify-between gap-6">
                  <Label>Do you set up?</Label>
                  <YesNoButtons
                    value={draft.setupIncluded}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        setupIncluded: v,
                        setupFeeEnabled: v ? d.setupFeeEnabled : false,
                        setupFlatFee: v ? d.setupFlatFee : "",
                      }))
                    }
                  />
                </div>

                {draft.setupIncluded && (
                  <div className="flex items-center justify-between gap-6">
                    <Label>Is there a setup fee?</Label>
                    <YesNoButtons
                      value={draft.setupFeeEnabled}
                      onChange={(v) =>
                        setDraft((d) => ({
                          ...d,
                          setupFeeEnabled: v,
                          setupFlatFee: v ? d.setupFlatFee : "",
                        }))
                      }
                    />
                  </div>
                )}

                {draft.setupIncluded && draft.setupFeeEnabled && (
                  <div className="space-y-2 max-w-sm">
                    <Label>Setup fee amount</Label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                        $
                      </div>
                      <Input
                        className="pl-7"
                        value={draft.setupFlatFee}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            setupFlatFee: e.target.value.replace(/[^\d.]/g, ""),
                          }))
                        }
                        placeholder="e.g. 75"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                )}
              </Card>

              {draft.photoPreviews.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  Reminder: photos are required before publishing (we'll enforce on the publish endpoint/UI next).
                </div>
              )}
            </div>
          )}

          {/* Footer nav */}
          <div className="max-w-3xl mt-10 flex items-center justify-between">
            <Button variant="outline" onClick={goBack} disabled={stepIndex === 0}>
              Back
            </Button>

            {isLastStep ? (
              <Button onClick={saveAndExit} disabled={!canContinue}>
                Finish
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canContinue}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
