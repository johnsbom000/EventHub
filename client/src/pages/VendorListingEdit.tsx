import { useTranslation } from "react-i18next";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

import { SidebarProvider } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getFreshAccessToken } from "@/lib/authToken";
import { POPULAR_FOR_OPTIONS } from "@/constants/eventTypes";
import {
  DEFAULT_COVER_RATIO,
  type CoverRatio,
  normalizeCoverRatio,
  normalizePhotoToUrl,
} from "@/lib/listingPhotos";
import { InlinePhotoEditor, type ListingPhotoCrop } from "@/components/listings/InlinePhotoEditor";
import { getPublishFailureToastContent } from "@/lib/publishFailureToast";
import { resolveAssetUrl } from "@/lib/runtimeUrls";
import { HardBlockModal, SoftFlagNotice } from "@/components/CircumventionWarningModal";
import { SubcategoryPicker } from "@/components/listings/SubcategoryPicker";
import { PackagesStep, type PackagesStepHandle } from "@/features/vendor/create-listing/steps/PackagesStep";
import { AttachAddonsStep } from "@/features/vendor/create-listing/steps/AttachAddonsStep";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";

import { LocationPicker } from "@/components/LocationPicker";
import mapboxgl from "mapbox-gl";

// ---- Types (keep loose on purpose) ----
type LocationResult = {
  id?: string;
  place_name?: string;
  name?: string;
  lat: number;
  lng: number;
  [k: string]: any;
};

type AnyListing = {
  id: string;
  status?: string | null;
  title?: string | null;
  listingData?: any;
};

type PricingMode = "single_service" | "package" | "a_la_carte";
type ServiceAreaMode = "radius" | "nationwide" | "global";
const MIN_LISTING_PHOTO_COUNT = 3;
const LISTING_DESCRIPTION_MAX_CHARS = 1000;
const LISTING_CATEGORY_OPTIONS = ["Rental", "Service", "Venue", "Catering"] as const;
type ListingCategory = (typeof LISTING_CATEGORY_OPTIONS)[number];
const SUBCATEGORY_MAX_CHARS = 120;
const TEMP_UPLOADING_PHOTO_PREFIX = "__uploading__-";

function isPersistedPhotoName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.startsWith(TEMP_UPLOADING_PHOTO_PREFIX)
  );
}

function normalizeCategoryForEdit(value: unknown): ListingCategory | "" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "rental" || normalized === "rentals") return "Rental";
  if (normalized === "service" || normalized === "services") return "Service";
  if (normalized === "venue" || normalized === "venues") return "Venue";
  if (normalized === "catering") return "Catering";
  return "";
}

// ---- Helpers ----
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLngLat(value: unknown): { lat: number; lng: number } | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) {
    const lng = toFiniteNumber(value[0]);
    const lat = toFiniteNumber(value[1]);
    if (lng === null || lat === null) return null;
    return { lat, lng };
  }
  if (typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const lat =
    toFiniteNumber(candidate.lat) ??
    toFiniteNumber(candidate.latitude) ??
    toFiniteNumber((candidate.center as unknown[] | undefined)?.[1]) ??
    toFiniteNumber((candidate.coordinates as unknown[] | undefined)?.[1]);
  const lng =
    toFiniteNumber(candidate.lng) ??
    toFiniteNumber(candidate.lon) ??
    toFiniteNumber(candidate.longitude) ??
    toFiniteNumber((candidate.center as unknown[] | undefined)?.[0]) ??
    toFiniteNumber((candidate.coordinates as unknown[] | undefined)?.[0]);
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng };
}

const toNumOrEmpty = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s;
};

function parseMoneyStringToOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[^\d.]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toUniqueTrimmedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function normalizeIncludedBullet(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/[^a-zA-Z0-9\s&/,'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]+$/g, "")
    .trim()
    .slice(0, 80);

  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeListingTitle(raw: string): string {
  const cleaned = (raw ?? "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeListingTitleInput(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^a-zA-Z0-9\s-]/g, "").slice(0, 60);
  return cleaned.replace(/\b([a-zA-Z0-9])([a-zA-Z0-9]*)/g, (_match, first: string, rest: string) => {
    return `${first.toUpperCase()}${rest.toLowerCase()}`;
  });
}

function normalizePhotoCoverRatio(raw: unknown): CoverRatio {
  return normalizeCoverRatio(raw);
}

function YesNoButtons({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const selectedButtonClass =
    "border-[#88bdb4] bg-[#9dd4cc] text-[#4a6a7d] hover:bg-[#8ec9c0]";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={value ? "default" : "outline"}
        className={value ? selectedButtonClass : undefined}
        onClick={() => onChange(true)}
      >
        Yes
      </Button>
      <Button
        type="button"
        variant={!value ? "default" : "outline"}
        className={!value ? selectedButtonClass : undefined}
        onClick={() => onChange(false)}
      >
        No
      </Button>
    </div>
  );
}

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? "";

function boundsFromCircleFeature(feature: any) {
  const coords = feature?.geometry?.coordinates?.[0] ?? [];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const c of coords) {
    const lng = c?.[0];
    const lat = c?.[1];
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
    // Fallback if geometry is missing
    return new mapboxgl.LngLatBounds([-180, -85], [180, 85]);
  }

  return new mapboxgl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
}

// VERY simple circle for preview (map is optional; LocationPicker is the real UX driver)
function makeCircleGeoJSON(
  center: { lat: number; lng: number },
  radiusMiles: number,
  steps = 80
) {
  // Convert miles to kilometers
  const radiusKm = radiusMiles * 1.60934;

  // Earth radius
  const earthRadiusKm = 6371;

  const coords: [number, number][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  const lngRad = (center.lng * Math.PI) / 180;
  const angularDistance = radiusKm / earthRadiusKm;

  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * Math.PI * 2;

    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const lng2 =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(lat2)
      );

    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [coords],
    },
  };
}


export default function VendorListingEdit() {
  const { t } = useTranslation();
  const params = useParams() as { id?: string };
  const listingId = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": "6rem",
        "--sidebar-width-icon": "6rem",
      }) as React.CSSProperties,
    []
  );
  const mintActionButtonClass = "border-[#88bdb4] bg-[#9dd4cc] text-[#4a6a7d] hover:bg-[#8ec9c0]";
  const activeFillButtonClass = "bg-primary text-primary-foreground hover:bg-primary/90";
  const creamSectionCardClass = "p-6 bg-[#ffffff]";
  const fieldSurfaceClass = "bg-[#ffffff] text-sm";

  // Listing fetch
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/vendor/listings", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendor/listings/${listingId}`);
      if (!res.ok) throw new Error("Failed to load listing");
      return res.json();
    },
  });

  // Vendor profile fetch (for location defaulting)
  const { data: vendorProfile } = useQuery({
    queryKey: ["/api/vendor/profile"],
  });

  const listing = (data as AnyListing | undefined) ?? undefined;
  const isPackageContainer = (data as any)?.listingType === "package_container";

  type EditTab = "info" | "packages" | "addons" | "media";
  const [activeTab, setActiveTab] = useState<EditTab>("info");
  const [creatingAddon, setCreatingAddon] = useState(false);
  const packagesStepRef = useRef<PackagesStepHandle>(null);

  // ---- Dirty tracking ----
  // snapshotRef holds the JSON of the draft at last save/publish/load.
  // isDirty is true whenever the current draft differs from that snapshot.
  const snapshotRef = useRef<string>("");
  const [isDirty, setIsDirty] = useState(false);

  // ---- Draft state (this is what we edit inline) ----
  const [draft, setDraft] = useState<any>(null);
  const [includedInput, setIncludedInput] = useState("");
  const [notIncludedInput, setNotIncludedInput] = useState("");
  const [blockModal, setBlockModal] = useState<{
    open: boolean;
    field: string;
    reason: string;
    warningNumber?: number | null;
    suspended?: boolean;
    suspensionEndsAt?: string | null;
  }>({ open: false, field: "", reason: "" });
  const [softFlagNotice, setSoftFlagNotice] = useState<{ open: boolean; field?: string }>({ open: false });

  // Init draft once listing is loaded
  useEffect(() => {
    if (!listing) return;

    const ld = listing.listingData || {};
    const canonicalListing = listing as AnyListing & {
      description?: unknown;
      whatsIncluded?: unknown;
      whatsNotIncluded?: unknown;
      priceCents?: unknown;
      pricingUnit?: unknown;
      minimumHours?: unknown;
      deliveryOffered?: unknown;
      deliveryFeeEnabled?: unknown;
      deliveryFeeAmountCents?: unknown;
      setupOffered?: unknown;
      setupFeeEnabled?: unknown;
      setupFeeAmountCents?: unknown;
      takedownOffered?: unknown;
      takedownFeeEnabled?: unknown;
      takedownFeeAmountCents?: unknown;
      photos?: unknown;
    };

    const listingDataIncluded =
      toUniqueTrimmedStringList(ld?.whatsIncluded).length > 0
        ? toUniqueTrimmedStringList(ld?.whatsIncluded)
        : toUniqueTrimmedStringList(ld?.includedItems).length > 0
          ? toUniqueTrimmedStringList(ld?.includedItems)
          : toUniqueTrimmedStringList(ld?.included);
    const canonicalIncluded = toUniqueTrimmedStringList(canonicalListing?.whatsIncluded);
    const hydratedIncluded = listingDataIncluded.length > 0 ? listingDataIncluded : canonicalIncluded;

    const listingDataNotIncluded = toUniqueTrimmedStringList(ld?.whatsNotIncluded);
    const canonicalNotIncluded = toUniqueTrimmedStringList(canonicalListing?.whatsNotIncluded);
    const hydratedNotIncluded = listingDataNotIncluded.length > 0 ? listingDataNotIncluded : canonicalNotIncluded;

    const canonicalPriceCents = toFiniteNumber(canonicalListing?.priceCents);
    const hydratedRate =
      toFiniteNumber(ld?.pricing?.rate) ??
      toFiniteNumber(ld?.rate) ??
      toFiniteNumber(ld?.price) ??
      (canonicalPriceCents != null ? canonicalPriceCents / 100 : null);
    const hydratedPricingUnit =
      (typeof ld?.pricingUnit === "string" && ld.pricingUnit.trim().length > 0
        ? ld.pricingUnit
        : typeof ld?.pricing?.unit === "string" && ld.pricing.unit.trim().length > 0
          ? ld.pricing.unit
          : typeof canonicalListing?.pricingUnit === "string" && canonicalListing.pricingUnit.trim().length > 0
            ? canonicalListing.pricingUnit
            : "per_day") as "per_day" | "per_hour";

    const listingDataPhotoNames = toUniqueTrimmedStringList(ld?.photos?.names);
    const listingDataPhotoUrls = toUniqueTrimmedStringList(ld?.photos?.urls);
    const listingDataPhotoFallback = Array.isArray(ld?.photos)
      ? ld.photos
          .map((item: unknown) => {
            if (typeof item === "string") return item.trim();
            if (item && typeof item === "object") {
              const objectItem = item as Record<string, unknown>;
              if (typeof objectItem.url === "string") return objectItem.url.trim();
              if (typeof objectItem.filename === "string") return objectItem.filename.trim();
              if (typeof objectItem.name === "string") return objectItem.name.trim();
            }
            return "";
          })
          .filter((value: string) => value.length > 0)
      : [];
    const canonicalPhotoNames = toUniqueTrimmedStringList(canonicalListing?.photos);
    const rawPhotoNames: string[] = Array.from(
      new Set([
        ...listingDataPhotoNames,
        ...listingDataPhotoUrls,
        ...listingDataPhotoFallback,
        ...canonicalPhotoNames,
      ]),
    );
    const storedCoverIndex = Number(ld?.photos?.coverPhotoIndex);
    const safeStoredCoverIndex =
      Number.isInteger(storedCoverIndex) && storedCoverIndex >= 0 && storedCoverIndex < rawPhotoNames.length
        ? storedCoverIndex
        : 0;
    const coverPhotoName = rawPhotoNames[safeStoredCoverIndex];
    const orderedPhotoNames = coverPhotoName
      ? [coverPhotoName, ...rawPhotoNames.filter((name) => name !== coverPhotoName)]
      : rawPhotoNames;
    const rawCropsByName =
      ld?.photos?.cropsByName && typeof ld.photos.cropsByName === "object" ? ld.photos.cropsByName : {};
    const orderedCropsByName: Record<string, ListingPhotoCrop> = {};
    orderedPhotoNames.forEach((name) => {
      const crop = rawCropsByName?.[name];
      if (crop && typeof crop === "object") orderedCropsByName[name] = crop as ListingPhotoCrop;
    });
    const initialCategory = normalizeCategoryForEdit(ld?.category ?? ld?.listingCategory);

    // Normalize shape into what we need on this screen
    const initial = {
      category: initialCategory,
      subcategory: String(ld?.subcategory ?? ld?.listingSubcategory ?? "").trim().slice(0, SUBCATEGORY_MAX_CHARS),
      subcategoryDetail: String(ld?.subcategoryDetail ?? "").trim().slice(0, SUBCATEGORY_MAX_CHARS),

      // Listing Type
      pricingMode: (ld.pricingMode || "single_service") as PricingMode,

      // Title / Description
      listingTitle: normalizeListingTitle(String(ld.listingTitle || listing.title || "")),
      listingDescription: String(
        ld.listingDescription ?? ld.description ?? ld.serviceDescription ?? canonicalListing?.description ?? ""
      ).slice(0, LISTING_DESCRIPTION_MAX_CHARS),
      whatsIncluded: hydratedIncluded,
      whatsNotIncluded: hydratedNotIncluded,

      // Rental Types (fallback to legacy propTypes)
      rentalTypes: Array.isArray(ld.rentalTypes)
        ? ld.rentalTypes
        : Array.isArray(ld.propTypes)
          ? ld.propTypes
          : [],
      quantitiesByPropType: ld.quantitiesByPropType || {},

      // Popular For
      popularFor: Array.isArray(ld.popularFor) ? ld.popularFor : [],

      // Pricing (simple baseline; you can expand later)
      pricing: {
        rate: hydratedRate != null ? String(hydratedRate) : "",
        unit: hydratedPricingUnit,
      },
      pricingUnit: hydratedPricingUnit,
      minimumHours: ld?.minimumHours ?? canonicalListing?.minimumHours ?? "",

      // Photos (persist in ld.photos.names for now; also keep previews locally)
      photos: {
        names: orderedPhotoNames,
        count: orderedPhotoNames.length,
        coverPhotoIndex: orderedPhotoNames.length > 0 ? 0 : 0,
        coverPhotoRatio: normalizePhotoCoverRatio(ld?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
        coverPhotoName: orderedPhotoNames[0] ?? null,
        cropsByName: orderedCropsByName,
      },

      _photoPreviewsByName: orderedPhotoNames.reduce(
        (acc: Record<string, string>, name: string) => {
          const isHeic = String(name).toLowerCase().endsWith(".heic") || String(name).toLowerCase().endsWith(".heif");
          if (!isHeic) {
            const url = normalizePhotoToUrl(name);
            if (url) acc[name] = url;
          }
          return acc;
        },
        {}
      ),


      // Delivery / Setup / Takedown
      deliverySetup: {
        deliveryIncluded:
          Boolean(
            ld?.deliverySetup?.deliveryIncluded ??
              ld?.deliveryIncluded ??
              ld?.deliveryOffered ??
              canonicalListing?.deliveryOffered
          ),
        deliveryFeeEnabled:
          Boolean(ld?.deliverySetup?.deliveryFeeEnabled ?? ld?.deliveryFeeEnabled ?? canonicalListing?.deliveryFeeEnabled),
        deliveryFeeAmount: toNumOrEmpty(
          ld?.deliverySetup?.deliveryFeeAmount ??
            ld?.deliveryFeeAmount ??
            (ld?.deliveryFeeAmountCents != null ? Number(ld.deliveryFeeAmountCents) / 100 : null) ??
            (canonicalListing?.deliveryFeeAmountCents != null ? Number(canonicalListing.deliveryFeeAmountCents) / 100 : null)
        ),
        setupIncluded:
          Boolean(
            ld?.deliverySetup?.setupIncluded ??
              ld?.setupIncluded ??
              ld?.setupOffered ??
              canonicalListing?.setupOffered
          ),
        setupFeeEnabled: Boolean(ld?.deliverySetup?.setupFeeEnabled ?? ld?.setupFeeEnabled ?? canonicalListing?.setupFeeEnabled),
        setupFeeAmount: toNumOrEmpty(
          ld?.deliverySetup?.setupFeeAmount ??
            ld?.setupFeeAmount ??
            (ld?.setupFeeAmountCents != null ? Number(ld.setupFeeAmountCents) / 100 : null) ??
            (canonicalListing?.setupFeeAmountCents != null ? Number(canonicalListing.setupFeeAmountCents) / 100 : null)
        ),
        takedownIncluded: Boolean(
          ld?.deliverySetup?.takedownIncluded ??
            ld?.takedownIncluded ??
            ld?.takedownOffered ??
            canonicalListing?.takedownOffered
        ),
        takedownFeeEnabled: Boolean(
          ld?.deliverySetup?.takedownFeeEnabled ?? ld?.takedownFeeEnabled ?? canonicalListing?.takedownFeeEnabled
        ),
        takedownFeeAmount: toNumOrEmpty(
          ld?.deliverySetup?.takedownFeeAmount ??
            ld?.takedownFeeAmount ??
            (ld?.takedownFeeAmountCents != null ? Number(ld.takedownFeeAmountCents) / 100 : null) ??
            (canonicalListing?.takedownFeeAmountCents != null ? Number(canonicalListing.takedownFeeAmountCents) / 100 : null)
        ),
      },
      serviceAreaMode: (ld?.serviceAreaMode || "radius") as ServiceAreaMode,
      serviceRadiusMiles: Number(ld?.serviceRadiusMiles ?? 30),
      serviceCenter: normalizeLngLat(ld?.serviceCenter) ?? undefined,
      serviceLocation: (() => {
        const raw = ld?.serviceLocation;
        if (!raw || typeof raw !== "object") return null;
        const normalized = normalizeLngLat(raw);
        if (!normalized) return null;
        return {
          ...(raw as Record<string, unknown>),
          lat: normalized.lat,
          lng: normalized.lng,
        };
      })(),

      // Cancellation policy
      cancellationPolicy: (ld?.cancellationPolicy ?? "cancel_anytime") as "cancel_anytime" | "cancel_within_hours" | "no_cancellations",
      cancellationPolicyHours: String(ld?.cancellationPolicyHours ?? 48),

      // Security deposit (canonical columns — read directly from listing row)
      securityDepositEnabled: Boolean((listing as any).securityDepositEnabled),
      securityDepositAmount:
        (listing as any).securityDepositCents != null && Number((listing as any).securityDepositCents) > 0
          ? String(Number((listing as any).securityDepositCents) / 100)
          : "",
    };

    setDraft(initial);
    snapshotRef.current = JSON.stringify(initial);
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id]);

  // Re-check dirty state whenever draft changes
  useEffect(() => {
    if (!draft || !snapshotRef.current) return;
    setIsDirty(JSON.stringify(draft) !== snapshotRef.current);
  }, [draft]);

  // ---- Default service center from vendor onboarding (same logic as CreateListingWizard) ----
  useEffect(() => {
    if (!vendorProfile) return;
    if (!draft) return;

    // don’t overwrite edits
    if (draft.serviceCenter || draft.serviceLocation) return;

    const addr = (vendorProfile as any)?.address || "";
    const city = (vendorProfile as any)?.city || "";
    const state = (vendorProfile as any)?.state || "";
    const zip = (vendorProfile as any)?.zipCode || (vendorProfile as any)?.postalCode || "";

    const q = [addr, city, state, zip].filter(Boolean).join(", ").trim();
    if (!q) return;

    (async () => {
      try {
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const results: LocationResult[] = await res.json();
        const top = results?.[0];
        if (!top) return;

        setDraft((d: any) => {
          if (!d) return d;
          if (d.serviceCenter || d.serviceLocation) return d; // async safety
          return {
            ...d,
            serviceLocation: top,
            serviceCenter: { lat: top.lat, lng: top.lng },
          };
        });
      } catch {
        // ignore
      }
    })();
  }, [vendorProfile, draft?.serviceCenter, draft?.serviceLocation, draft]);

  const addIncludedItem = (raw: string) => {
    const normalized = normalizeIncludedBullet(raw);
    if (!normalized) return;

    setDraft((d: any) => {
      if (!d) return d;
      const existing = Array.isArray(d.whatsIncluded) ? d.whatsIncluded : [];
      const hasDuplicate = existing.some((item: string) => item.toLowerCase() === normalized.toLowerCase());
      if (hasDuplicate || existing.length >= 20) return d;

      return {
        ...d,
        whatsIncluded: [...existing, normalized],
      };
    });

    setIncludedInput("");
  };

  const removeIncludedItem = (itemToRemove: string) => {
    setDraft((d: any) => {
      if (!d) return d;
      return {
        ...d,
        whatsIncluded: (Array.isArray(d.whatsIncluded) ? d.whatsIncluded : []).filter(
          (item: string) => item !== itemToRemove
        ),
      };
    });
  };

  const addNotIncludedItem = (raw: string) => {
    const normalized = normalizeIncludedBullet(raw);
    if (!normalized) return;

    setDraft((d: any) => {
      if (!d) return d;
      const existing = Array.isArray(d.whatsNotIncluded) ? d.whatsNotIncluded : [];
      const hasDuplicate = existing.some((item: string) => item.toLowerCase() === normalized.toLowerCase());
      if (hasDuplicate || existing.length >= 20) return d;

      return {
        ...d,
        whatsNotIncluded: [...existing, normalized],
      };
    });

    setNotIncludedInput("");
  };

  const removeNotIncludedItem = (itemToRemove: string) => {
    setDraft((d: any) => {
      if (!d) return d;
      return {
        ...d,
        whatsNotIncluded: (Array.isArray(d.whatsNotIncluded) ? d.whatsNotIncluded : []).filter(
          (item: string) => item !== itemToRemove
        ),
      };
    });
  };

  // ---- Photo upload (simple, persists file names; previews are local) ----
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  async function uploadListingPhoto(
    file: File
  ): Promise<{ url: string; filename: string; storagePath?: string }> {
    // IMPORTANT: For FormData uploads, do NOT use apiRequest() (it sets JSON headers)
    const token = await getFreshAccessToken();
    if (!token) throw new Error("Not authenticated");

    const fd = new FormData();
    fd.append("photo", file);

    const res = await fetch("/api/uploads/listing-photo", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // DO NOT set Content-Type; browser will set the multipart boundary
      },
      body: fd,
      credentials: "include",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }

    return await res.json();
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files || !draft) return;

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const fileArr = Array.from(files);

    // Reject obvious HEIC/HEIF and unsupported types up front
    const rejected = fileArr.filter((f) => {
      const n = (f.name || "").toLowerCase();
      const isHeic =
        f.type === "image/heic" ||
        f.type === "image/heif" ||
        n.endsWith(".heic") ||
        n.endsWith(".heif");
      const nameOk =
        n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp");
      const isAllowed = allowed.has(f.type) || nameOk;
      return isHeic || !isAllowed;
    });

    if (rejected.length) {
      toast({
        title: "Some files were skipped",
        description: "Only JPG, PNG, or WebP are supported right now. (HEIC/HEIF not supported.)",
        variant: "destructive",
      });
    }

    const picked = fileArr.filter((f) => {
      const name = (f.name || "").toLowerCase();
      const extOk = name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp");
      const typeOk = allowed.has(f.type);
      return typeOk || extOk; // allow Safari empty/odd MIME if extension looks valid
    });

    if (picked.length === 0) return;

    // Create temp “names” so the UI has something stable to render immediately
    const tempEntries = picked.map((f) => {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const tempName = `__uploading__-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const preview = URL.createObjectURL(f);
      return { file: f, tempName, preview };
    });

    // 1) Show immediately (tempName -> preview)
    setDraft((d: any) => {
      const existingNames: string[] = Array.isArray(d?.photos?.names) ? d.photos.names : [];
      const nextNames = [...existingNames, ...tempEntries.map((x) => x.tempName)];
      const nextMap = { ...(d._photoPreviewsByName || {}) };

      tempEntries.forEach((x) => {
        nextMap[x.tempName] = x.preview;
      });

      return {
        ...d,
        photos: {
          names: nextNames,
          count: nextNames.length,
          coverPhotoIndex: nextNames.length > 0 ? 0 : 0,
          coverPhotoRatio: normalizePhotoCoverRatio(d?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
          coverPhotoName: nextNames[0] ?? null,
          cropsByName:
            d?.photos?.cropsByName && typeof d.photos.cropsByName === "object"
              ? d.photos.cropsByName
              : {},
        },
        _photoPreviewsByName: nextMap,
      };
    });

    try {
      // 2) Upload; then replace tempName with real server filename (and keep preview)
      const uploaded = await Promise.all(tempEntries.map((x) => uploadListingPhoto(x.file)));

    let payloadForPatch: any = null;

    setDraft((d: any) => {
      const names: string[] = Array.isArray(d?.photos?.names) ? d.photos.names : [];
      const map = { ...(d._photoPreviewsByName || {}) };
      const nextCropsByName: Record<string, ListingPhotoCrop> =
        d?.photos?.cropsByName && typeof d.photos.cropsByName === "object" ? { ...d.photos.cropsByName } : {};

      let nextNames = [...names];

      uploaded.forEach((u, i) => {
        const tempName = tempEntries[i].tempName;
        const blobPreview = map[tempName];
        const persistedName = u.storagePath ?? u.filename;

        // swap temp -> canonical storage path
        nextNames = nextNames.map((n) => (n === tempName ? persistedName : n));

        // move preview mapping temp -> canonical storage path
        delete map[tempName];
        map[persistedName] = normalizePhotoToUrl(u.url || persistedName) ?? resolveAssetUrl(`/uploads/listings/${u.filename}`);
        if (nextCropsByName[tempName]) {
          nextCropsByName[persistedName] = nextCropsByName[tempName];
          delete nextCropsByName[tempName];
        }

        // revoke blob later (Safari-safe)
        if (blobPreview && blobPreview.startsWith("blob:")) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(blobPreview);
            } catch {}
          }, 30_000); // 30s delay
        }
      });

      const nextDraft = {
        ...d,
        photos: {
          names: nextNames,
          count: nextNames.length,
          coverPhotoIndex: nextNames.length > 0 ? 0 : 0,
          coverPhotoRatio: normalizePhotoCoverRatio(d?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
          coverPhotoName: nextNames[0] ?? null,
          cropsByName: nextCropsByName,
        },
        _photoPreviewsByName: map,
      };

      // capture a snapshot to PATCH (outside setDraft)
      payloadForPatch = nextDraft;

      return nextDraft;
    });

    // Persist to DB (must be OUTSIDE setDraft)
    await apiRequest("PATCH", `/api/vendor/listings/${listingId}`, {
      listingData: payloadForPatch,
    });

    } catch (err: any) {
      // Rollback anything we just added
      tempEntries.forEach((x) => {
        try {
          URL.revokeObjectURL(x.preview);
        } catch {}
      });

      setDraft((d: any) => {
        const names: string[] = Array.isArray(d?.photos?.names) ? d.photos.names : [];
        const map = { ...(d._photoPreviewsByName || {}) };
        const nextCropsByName: Record<string, ListingPhotoCrop> =
          d?.photos?.cropsByName && typeof d.photos.cropsByName === "object" ? { ...d.photos.cropsByName } : {};

        const tempNames = new Set(tempEntries.map((x) => x.tempName));
        const nextNames = names.filter((n) => !tempNames.has(n));

        tempEntries.forEach((x) => {
          delete map[x.tempName];
          delete nextCropsByName[x.tempName];
        });

        return {
          ...d,
          photos: {
            names: nextNames,
            count: nextNames.length,
            coverPhotoIndex: nextNames.length > 0 ? 0 : 0,
            coverPhotoRatio: normalizePhotoCoverRatio(d?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
            coverPhotoName: nextNames[0] ?? null,
            cropsByName: nextCropsByName,
          },
          _photoPreviewsByName: map,
        };
      });

      toast({
        title: "Photo upload failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };


  const removePhotoAt = (idx: number) => {
    setDraft((d: any) => {
      if (!d) return d;

      const names: string[] = Array.isArray(d?.photos?.names) ? d.photos.names : [];
      const map: Record<string, string> =
        d?._photoPreviewsByName && typeof d._photoPreviewsByName === "object" ? { ...d._photoPreviewsByName } : {};
      const nextCropsByName: Record<string, ListingPhotoCrop> =
        d?.photos?.cropsByName && typeof d.photos.cropsByName === "object" ? { ...d.photos.cropsByName } : {};

      const name = names[idx];
      const nextNames = names.filter((_: any, i: number) => i !== idx);

      const preview = name ? map[String(name)] : undefined;
      if (preview) {
        try {
          URL.revokeObjectURL(preview);
        } catch {}
        delete map[String(name)];
      }
      if (name) delete nextCropsByName[String(name)];

      return {
        ...d,
        photos: {
          names: nextNames,
          count: nextNames.length,
          coverPhotoIndex: nextNames.length > 0 ? 0 : 0,
          coverPhotoRatio: normalizePhotoCoverRatio(d?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
          coverPhotoName: nextNames[0] ?? null,
          cropsByName: nextCropsByName,
        },
        _photoPreviewsByName: map,
      };
    });
  };

  const removePhotoByName = (photoName: string) => {
    const names: string[] = Array.isArray(draft?.photos?.names) ? draft.photos.names : [];
    const idx = names.findIndex((name) => name === photoName);
    if (idx >= 0) removePhotoAt(idx);
  };

  const reorderPhotosByName = (orderedNames: string[]) => {
    setDraft((d: any) => {
      if (!d) return d;
      const currentNames: string[] = Array.isArray(d?.photos?.names) ? d.photos.names : [];
      if (orderedNames.length !== currentNames.length) return d;

      const previewMap: Record<string, string> =
        d?._photoPreviewsByName && typeof d._photoPreviewsByName === "object" ? { ...d._photoPreviewsByName } : {};
      const nextCropsByName: Record<string, ListingPhotoCrop> = {};
      const currentCropsByName: Record<string, ListingPhotoCrop> =
        d?.photos?.cropsByName && typeof d.photos.cropsByName === "object" ? d.photos.cropsByName : {};
      orderedNames.forEach((name) => {
        if (currentCropsByName[name]) nextCropsByName[name] = currentCropsByName[name];
      });

      return {
        ...d,
        photos: {
          ...(d.photos || {}),
          names: orderedNames,
          count: orderedNames.length,
          coverPhotoIndex: orderedNames.length > 0 ? 0 : 0,
          coverPhotoRatio: normalizePhotoCoverRatio(d?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
          coverPhotoName: orderedNames[0] ?? null,
          cropsByName: nextCropsByName,
        },
        _photoPreviewsByName: previewMap,
      };
    });
  };

  const setPhotoCropByName = (photoName: string, crop: ListingPhotoCrop | null) => {
    setDraft((d: any) => {
      if (!d) return d;
      const nextCropsByName: Record<string, ListingPhotoCrop> =
        d?.photos?.cropsByName && typeof d.photos.cropsByName === "object" ? { ...d.photos.cropsByName } : {};
      if (crop) nextCropsByName[photoName] = crop;
      else delete nextCropsByName[photoName];

      return {
        ...d,
        photos: {
          ...(d.photos || {}),
          names: Array.isArray(d?.photos?.names) ? d.photos.names : [],
          count: Array.isArray(d?.photos?.names) ? d.photos.names.length : 0,
          coverPhotoIndex: Array.isArray(d?.photos?.names) && d.photos.names.length > 0 ? 0 : 0,
          coverPhotoRatio: normalizePhotoCoverRatio(d?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
          coverPhotoName:
            Array.isArray(d?.photos?.names) && d.photos.names.length > 0 ? d.photos.names[0] : null,
          cropsByName: nextCropsByName,
        },
      };
    });
  };

  // ---- Derived summaries / publish gating ----
  const title = String(draft?.listingTitle ?? "");
  const description = String(draft?.listingDescription ?? "");
  const pricingRate = draft?.pricing?.rate;
  const hasCategory = LISTING_CATEGORY_OPTIONS.includes((draft?.category ?? "") as ListingCategory);
  const hasTitle = title.trim() !== "";
  const hasDescription = description.trim() !== "";

  const hasPricing =
    pricingRate !== null && pricingRate !== undefined && `${pricingRate}`.trim() !== "";
  const persistedPhotoNames = Array.isArray(draft?.photos?.names)
    ? draft.photos.names.filter((name: unknown): name is string => isPersistedPhotoName(name))
    : [];
  const photoCount = persistedPhotoNames.length;
  const hasMinimumPhotos = photoCount >= MIN_LISTING_PHOTO_COUNT;
  const canPublish = isPackageContainer
    ? hasCategory && hasTitle && hasMinimumPhotos
    : hasCategory && hasTitle && hasDescription && hasPricing && hasMinimumPhotos;

  const buildPersistPayload = () => {
    if (!draft) return null;
    const safePhotoNames = Array.isArray(draft?.photos?.names)
      ? draft.photos.names.filter((name: unknown): name is string => isPersistedPhotoName(name))
      : [];
    const rawPhotoCropsByName =
      draft?.photos?.cropsByName && typeof draft.photos.cropsByName === "object"
        ? (draft.photos.cropsByName as Record<string, ListingPhotoCrop>)
        : {};
    const safePhotoNameSet = new Set(safePhotoNames);
    const safePhotoCropsByName = Object.fromEntries(
      Object.entries(rawPhotoCropsByName).filter(([name]) => safePhotoNameSet.has(name)),
    ) as Record<string, ListingPhotoCrop>;

    const deliverySetupDraft =
      draft?.deliverySetup && typeof draft.deliverySetup === "object" ? draft.deliverySetup : {};
    const deliveryIncluded = Boolean(deliverySetupDraft?.deliveryIncluded);
    const deliveryFeeEnabled = deliveryIncluded && Boolean(deliverySetupDraft?.deliveryFeeEnabled);
    const deliveryFeeAmount = deliveryFeeEnabled
      ? parseMoneyStringToOptionalNumber(deliverySetupDraft?.deliveryFeeAmount)
      : null;

    const setupIncluded = Boolean(deliverySetupDraft?.setupIncluded);
    const setupFeeEnabled = setupIncluded && Boolean(deliverySetupDraft?.setupFeeEnabled);
    const setupFeeAmount = setupFeeEnabled ? parseMoneyStringToOptionalNumber(deliverySetupDraft?.setupFeeAmount) : null;

    const takedownSupportedCategory = draft.category === "Rental" || draft.category === "Venue" || draft.category === "Catering";
    const takedownIncluded = takedownSupportedCategory && Boolean(deliverySetupDraft?.takedownIncluded);
    const takedownFeeEnabled = takedownIncluded && Boolean(deliverySetupDraft?.takedownFeeEnabled);
    const takedownFeeAmount = takedownFeeEnabled
      ? parseMoneyStringToOptionalNumber(deliverySetupDraft?.takedownFeeAmount)
      : null;

    const nextListingData = {
      ...(listing?.listingData || {}),
      category: hasCategory ? draft.category : undefined,
      subcategory: typeof draft?.subcategory === "string"
        ? draft.subcategory.trim().slice(0, SUBCATEGORY_MAX_CHARS) || undefined
        : undefined,
      subcategoryDetail: typeof draft?.subcategoryDetail === "string"
        ? draft.subcategoryDetail.trim().slice(0, SUBCATEGORY_MAX_CHARS) || undefined
        : undefined,
      pricingMode: draft.pricingMode,
      listingTitle: normalizeListingTitle(String(draft.listingTitle ?? "")),
      listingDescription: draft.listingDescription,
      description: draft.listingDescription,
      serviceDescription: draft.listingDescription,
      whatsIncluded: Array.isArray(draft.whatsIncluded) ? draft.whatsIncluded : [],
      whatsNotIncluded: Array.isArray(draft.whatsNotIncluded) ? draft.whatsNotIncluded : [],
      rentalTypes: draft.rentalTypes,
      propTypes: draft.rentalTypes, // legacy compatibility for existing listing readers
      quantitiesByPropType: draft.quantitiesByPropType,
      popularFor: draft.popularFor,
      pricing: {
        ...(listing?.listingData?.pricing || {}),
        rate: draft.pricing?.rate,
        unit: draft.pricing?.unit ?? draft.pricingUnit ?? "per_day",
      },
      pricingUnit: draft.pricingUnit ?? draft.pricing?.unit ?? "per_day",
      minimumHours: draft.minimumHours,
      photos: {
        names: safePhotoNames,
        count: safePhotoNames.length,
        coverPhotoIndex: safePhotoNames.length > 0 ? 0 : 0,
        coverPhotoRatio: normalizePhotoCoverRatio(draft?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
        coverPhotoName: safePhotoNames.length > 0 ? safePhotoNames[0] ?? null : null,
        cropsByName: safePhotoCropsByName,
      },
      deliveryIncluded,
      deliveryOffered: deliveryIncluded,
      deliveryFeeEnabled,
      deliveryFeeAmount,
      deliveryFeeAmountCents: deliveryFeeAmount != null ? Math.round(deliveryFeeAmount * 100) : null,
      setupIncluded,
      setupOffered: setupIncluded,
      setupFeeEnabled,
      setupFeeAmount,
      setupFeeAmountCents: setupFeeAmount != null ? Math.round(setupFeeAmount * 100) : null,
      takedownIncluded,
      takedownOffered: takedownIncluded,
      takedownFeeEnabled,
      takedownFeeAmount,
      takedownFeeAmountCents: takedownFeeAmount != null ? Math.round(takedownFeeAmount * 100) : null,
      deliverySetup: {
        ...deliverySetupDraft,
        deliveryIncluded,
        deliveryFeeEnabled,
        deliveryFeeAmount: deliveryFeeAmount ?? "",
        setupIncluded,
        setupFeeEnabled,
        setupFeeAmount: setupFeeAmount ?? "",
        takedownIncluded,
        takedownFeeEnabled,
        takedownFeeAmount: takedownFeeAmount ?? "",
      },
      cancellationPolicy: draft.cancellationPolicy ?? "cancel_anytime",
      cancellationPolicyHours:
        draft.cancellationPolicy === "cancel_within_hours"
          ? Number(draft.cancellationPolicyHours) || 48
          : null,

      serviceAreaMode: draft.serviceAreaMode,
      serviceRadiusMiles: draft.serviceRadiusMiles,
      serviceCenter: draft.serviceCenter,
      serviceLocation: draft.serviceLocation
      ? {
          ...draft.serviceLocation,
          country:
            draft.serviceLocation.country ||
            // fallback from label if missing
            (draft.serviceLocation.label?.includes("United States")
              ? "United States"
              : null),
        }
      : null,
    };

    const normalizedDescription = String(draft.listingDescription ?? "").trim();

    const securityDepositEnabled = Boolean((draft as any).securityDepositEnabled);
    const securityDepositAmountStr = String((draft as any).securityDepositAmount ?? "");
    const securityDepositCents =
      securityDepositEnabled && Number(securityDepositAmountStr) > 0
        ? Math.round(Number(securityDepositAmountStr) * 100)
        : null;

    return {
      listingData: nextListingData,
      title: normalizeListingTitle(String(draft.listingTitle ?? "")) || listing?.title || "Untitled Listing",
      description: normalizedDescription || undefined,
      listingDescription: normalizedDescription || undefined,
      serviceDescription: normalizedDescription || undefined,
      securityDepositEnabled,
      securityDepositCents,
    };
  };

  // ---- Save mutation ----
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error("Missing listing id");
      if (!draft) throw new Error("Nothing to save");
      const payload = buildPersistPayload();
      if (!payload) throw new Error("Nothing to save");

      const res = await apiRequest("PATCH", `/api/vendor/listings/${listingId}`, payload);

      if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === "content_blocked") {
          throw Object.assign(new Error("content_blocked"), { blockData: body });
        }
      }

      if (!res.ok) throw new Error("Failed to save changes");
      return res.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/listings/public", listingId] });
      if (data?.softFlagged) {
        setSoftFlagNotice({ open: true, field: "listing content" });
      } else if (data?.pendingReview) {
        setSoftFlagNotice({ open: true, field: "listing" });
        toast({ title: "Submitted for re-review", description: "Your changes have been sent to the Event Hub team for approval before your listing goes live." });
      } else {
        toast({ title: "Saved", description: "Your changes were saved." });
        setLocation("/vendor/listings");
      }
    },
    onError: (err: any) => {
      if (err?.blockData?.error === "content_blocked") {
        setBlockModal({
          open: true,
          field: err.blockData.field || "Content",
          reason: err.blockData.reason || "Contact information is not allowed.",
          warningNumber: err.blockData.warningNumber ?? null,
          suspended: err.blockData.suspended ?? false,
          suspensionEndsAt: err.blockData.suspensionEndsAt ?? null,
        });
        return;
      }
      toast({
        title: "Save failed",
        description: err?.message || "Could not save changes",
        variant: "destructive",
      });
    },
  });

  // ---- Publish mutation (unchanged) ----
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error("Missing listing id");
      const payload = buildPersistPayload();
      if (!payload) throw new Error("Nothing to publish");

      const res = await apiRequest("PATCH", `/api/vendor/listings/${listingId}/publish`, payload);
      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(errorBody || "Failed to publish listing");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/listings/public", listingId] });
      toast({
        title: "Listing published!",
        description: "Your listing is now live and visible to customers.",
      });
    },
    onError: (err) => {
      const publishError = getPublishFailureToastContent(err);
      toast({
        title: publishError.title,
        description: publishError.description,
        variant: "destructive",
      });
    },
  });

  const status = String(listing?.status || "—");
  const normalizedStatus = status.trim().toLowerCase();
  const isActive = normalizedStatus === "active";
  const showPublishAction = normalizedStatus === "draft" || normalizedStatus === "inactive";
  const shouldShowRadiusMap = draft?.serviceAreaMode === "radius";

  // Publish handler — flushes any open package edit first, then publishes
  const handlePublishClick = () => {
    if (activeTab === "packages") packagesStepRef.current?.submitIfEditing();
    publishMutation.mutate();
  };

  // ---- Location derived center + circle (for future map preview) ----
  const center = useMemo(() => {
    const fromLocation = normalizeLngLat(draft?.serviceLocation);
    if (fromLocation) return fromLocation;
    return normalizeLngLat(draft?.serviceCenter);
  }, [draft?.serviceLocation, draft?.serviceCenter]);

  const circleFeature = useMemo(() => {
    if (!center) return null;
    return makeCircleGeoJSON(center, Number(draft?.serviceRadiusMiles ?? 0));
  }, [center, draft?.serviceRadiusMiles]);

  useEffect(() => {
    if (!draft) return;
    if (!shouldShowRadiusMap) return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;
    setErrorMsg(null);

    if (!MAPBOX_TOKEN) {
      console.error("Missing VITE_MAPBOX_TOKEN");
      setErrorMsg("Missing Mapbox token. Please set VITE_MAPBOX_TOKEN.");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const startCenter = center ? [center.lng, center.lat] : [-111.891, 40.7608]; // fallback
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: startCenter as [number, number],
      zoom: center ? 9 : 5,
    });
    let deferredResizeId: number | null = null;

    mapRef.current = map;

    map.on("error", (event) => {
      const detail =
        (event as any)?.error?.message ||
        (event as any)?.error?.statusText ||
        "";
      setErrorMsg(detail ? `Map failed to load: ${detail}` : "Map failed to load.");
    });

    map.on("load", () => {
      setIsMapReady(true);

      // radius source + layer
      map.addSource("radius", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: circleFeature ? [circleFeature] : [],
        },
      });

      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: {
          "fill-color": "#c9a06a",
          "fill-opacity": 0.25,
        },
      });

      map.addLayer({
        id: "radius-outline",
        type: "line",
        source: "radius",
        paint: {
          "line-color": "#c9a06a",
          "line-width": 2,
        },
      });

      // center source + layer
      map.addSource("center", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: center
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "Point",
                    coordinates: [center.lng, center.lat],
                  },
                },
              ]
            : [],
        },
      });

      map.addLayer({
        id: "center-point",
        type: "circle",
        source: "center",
        paint: {
          "circle-radius": 6,
          "circle-color": "#111827",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      if (circleFeature) {
        const b = boundsFromCircleFeature(circleFeature);
        map.fitBounds(b, { padding: 30, duration: 0 });
      }

      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {
          // ignore
        }
      });

      deferredResizeId = window.setTimeout(() => {
        try {
          map.resize();
        } catch {
          // ignore
        }
      }, 140);
    });

    return () => {
      if (deferredResizeId !== null) {
        window.clearTimeout(deferredResizeId);
      }
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      setIsMapReady(false);
    };
  }, [listingId, shouldShowRadiusMap]);

  // Keep the map canvas sized correctly if this section mounts after layout.
  useEffect(() => {
    const map = mapRef.current;
    const el = mapContainerRef.current;
    if (!map || !el) return;

    const ro = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        // ignore
      }
    });

    ro.observe(el);

    requestAnimationFrame(() => {
      try {
        map.resize();
      } catch {
        // ignore
      }
    });

    return () => ro.disconnect();
  }, [listingId, shouldShowRadiusMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isMapReady) return;

    // If map isn't loaded yet, do nothing.
    if (!map.isStyleLoaded()) return;

    const radiusSrc = map.getSource("radius") as mapboxgl.GeoJSONSource | undefined;
    const centerSrc = map.getSource("center") as mapboxgl.GeoJSONSource | undefined;

    if (radiusSrc) {
      radiusSrc.setData({
        type: "FeatureCollection",
        features: circleFeature ? [circleFeature] : [],
      } as any);
    }

    if (centerSrc) {
      centerSrc.setData({
        type: "FeatureCollection",
        features: center
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Point",
                  coordinates: [center.lng, center.lat],
                },
              },
            ]
          : [],
      } as any);
    }

    // Keep view snapped to circle when center exists
    if (circleFeature) {
      const b = boundsFromCircleFeature(circleFeature);
      map.fitBounds(b, { padding: 30, duration: 0 });
    }
  }, [circleFeature, center, isMapReady]);

  const selectedPopularFor = Array.isArray(draft?.popularFor) ? draft.popularFor : [];
  const allPopularForSelected = POPULAR_FOR_OPTIONS.every((option) => selectedPopularFor.includes(option));
  const photoNames: string[] = Array.isArray(draft?.photos?.names) ? draft.photos.names : [];
  const coverPhotoRatio = normalizePhotoCoverRatio(draft?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO);
  const getPhotoPreviewSrc = (name: string) =>
    draft?._photoPreviewsByName?.[name] ||
    normalizePhotoToUrl(name) ||
    resolveAssetUrl(`/uploads/listings/${name}`);
  const inlinePhotos = photoNames.map((name) => ({
    id: name,
    name,
    src: getPhotoPreviewSrc(name),
  }));

  const toggleSelectAllPopularFor = () => {
    setDraft((d: any) => {
      const current = Array.isArray(d?.popularFor) ? d.popularFor : [];
      const knownOptions = new Set<string>(POPULAR_FOR_OPTIONS);
      const hasAllSelected = POPULAR_FOR_OPTIONS.every((option) => current.includes(option));

      if (hasAllSelected) {
        return {
          ...d,
          popularFor: current.filter((value: string) => !knownOptions.has(value)),
        };
      }

      return {
        ...d,
        popularFor: Array.from(new Set([...current, ...POPULAR_FOR_OPTIONS])),
      };
    });
  };

  return (
    <>
    <HardBlockModal
      open={blockModal.open}
      onClose={() => setBlockModal((prev) => ({ ...prev, open: false }))}
      field={blockModal.field}
      reason={blockModal.reason}
      warningNumber={blockModal.warningNumber}
      suspended={blockModal.suspended}
      suspensionEndsAt={blockModal.suspensionEndsAt}
    />
    <SoftFlagNotice
      open={softFlagNotice.open}
      onClose={() => {
        setSoftFlagNotice({ open: false });
        setLocation("/vendor/listings");
      }}
      field={softFlagNotice.field}
    />
    <SidebarProvider style={sidebarStyle} className="bg-[#ffffff]">
      <div className="flex h-screen w-full bg-[#ffffff]">
        <VendorSidebar className="!bg-[#ffffff] [&_[data-slot=sidebar-header]]:bg-[#ffffff] [&_[data-slot=sidebar-content]]:bg-[#ffffff] [&_[data-slot=sidebar-footer]]:bg-[#ffffff]" />

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-end border-b border-[rgba(74,106,125,0.22)] bg-[#ffffff] p-4">
            <div className="flex items-center gap-2">
              <Button
                className={activeFillButtonClass}
                onClick={() => {
                  if (activeTab === "packages") {
                    packagesStepRef.current?.submitIfEditing();
                  } else {
                    saveMutation.mutate();
                  }
                }}
                disabled={saveMutation.isPending || !draft}
              >
                {saveMutation.isPending ? t("vendorListingEdit.saving") : t("vendorListingEdit.saveChanges")}
              </Button>

              {(showPublishAction || (isActive && isDirty)) && (
                <Button
                  disabled={!canPublish || publishMutation.isPending || !draft}
                  onClick={handlePublishClick}
                  className={mintActionButtonClass}
                >
                  {publishMutation.isPending ? t("vendorListingEdit.publishing") : isActive ? "Publish Changes" : t("vendorListingEdit.publish")}
                </Button>
              )}

              <Link href="/vendor/listings">
                <Button variant="outline">{t("vendorListingEdit.backToListings")}</Button>
              </Link>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-[#ffffff]">
            <div className="max-w-5xl mx-auto px-6 py-8">
              <div className="mb-6">
                <h1 className="text-3xl font-bold">{t("vendorListingEdit.editListing")}</h1>
              </div>

              {!listingId ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Missing listing id in the URL.</p>
                </Card>
              ) : isLoading ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">{t("vendorListingEdit.loading")}</p>
                </Card>
              ) : error ? (
                <Card className="p-6">
                  <p className="text-sm text-destructive">
                    {(error as Error)?.message || t("vendorListingEdit.errorLoading")}
                  </p>
                </Card>
              ) : !listing || !draft ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">{t("vendorListingEdit.errorLoading")}</p>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* ── Tab bar ─────────────────────────────────────────── */}
                  <div className="border-b border-border">
                    <div className="flex gap-0">
                      {(
                        [
                          { id: "info" as EditTab, label: "Listing Info" },
                          ...(isPackageContainer ? [{ id: "packages" as EditTab, label: "Packages" }] : []),
                          { id: "addons" as EditTab, label: "Add-ons" },
                          { id: "media" as EditTab, label: "Media" },
                        ] as Array<{ id: EditTab; label: string }>
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={[
                            "px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                            activeTab === tab.id
                              ? "border-primary text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground",
                          ].join(" ")}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Packages tab ─────────────────────────────────────── */}
                  {activeTab === "packages" && isPackageContainer && (
                    <PackagesStep
                      ref={packagesStepRef}
                      listingId={listingId ?? null}
                      category={draft?.category ?? ""}
                    />
                  )}

                  {/* ── Add-ons tab ───────────────────────────────────────── */}
                  {activeTab === "addons" && (
                    <AttachAddonsStep
                      listingId={listingId ?? null}
                      onCreateNewAddon={() => setCreatingAddon(true)}
                    />
                  )}

                  {/* ── Nested add-on wizard overlay ──────────────────────── */}
                  {creatingAddon && listingId && (
                    <div className="fixed inset-0 z-[200] bg-[#ffffff]">
                      <CreateListingWizard
                        initialListingType="addon"
                        parentListingId={listingId}
                        onClose={() => setCreatingAddon(false)}
                        onComplete={() => setCreatingAddon(false)}
                      />
                    </div>
                  )}

                  {/* ── Media tab ─────────────────────────────────────────── */}
                  {activeTab === "media" && (
                    <Card className={creamSectionCardClass}>
                      <div className="space-y-4">
                        <div>
                          <div className="text-xl font-semibold">{t("vendorListingEdit.photos")}</div>
                          <div className="text-sm text-muted-foreground">
                            Add at least {MIN_LISTING_PHOTO_COUNT} photos before publish.
                          </div>
                        </div>

                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => addPhotos(e.target.files)}
                        />

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            className={activeFillButtonClass}
                            onClick={() => photoInputRef.current?.click()}
                          >
                            {t("vendorListingEdit.photos")}
                          </Button>
                          <div className="text-sm text-muted-foreground">Count: {photoNames.length}</div>
                        </div>

                        <InlinePhotoEditor
                          photos={inlinePhotos}
                          coverRatio={coverPhotoRatio}
                          cropsByPhotoId={
                            draft?.photos?.cropsByName && typeof draft.photos.cropsByName === "object"
                              ? draft.photos.cropsByName
                              : {}
                          }
                          onAddPhotos={() => photoInputRef.current?.click()}
                          showAddPhotosButton={false}
                          onRemovePhoto={removePhotoByName}
                          onReorderPhotos={reorderPhotosByName}
                          onCoverRatioChange={(ratio) =>
                            setDraft((d: any) => ({
                              ...d,
                              photos: {
                                ...(d.photos || {}),
                                names: Array.isArray(d?.photos?.names) ? d.photos.names : [],
                                count: Array.isArray(d?.photos?.names) ? d.photos.names.length : 0,
                                coverPhotoIndex: Array.isArray(d?.photos?.names) && d.photos.names.length > 0 ? 0 : 0,
                                coverPhotoRatio: normalizePhotoCoverRatio(ratio),
                                coverPhotoName:
                                  Array.isArray(d?.photos?.names) && d.photos.names.length > 0 ? d.photos.names[0] : null,
                                cropsByName:
                                  d?.photos?.cropsByName && typeof d.photos.cropsByName === "object"
                                    ? d.photos.cropsByName
                                    : {},
                              },
                            }))
                          }
                          onCropChange={setPhotoCropByName}
                        />
                      </div>
                    </Card>
                  )}

                  {/* ── Listing Info tab ──────────────────────────────────── */}
                  {activeTab === "info" && <>

                  {/* 0) Listing Classification */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">{t("vendorListingEdit.listingClassification")}</div>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label>{t("vendorListingEdit.category")}</Label>
                          <Select
                            value={draft.category || undefined}
                            onValueChange={(value) =>
                              setDraft((d: any) => ({
                                ...d,
                                category: LISTING_CATEGORY_OPTIONS.includes(value as ListingCategory)
                                  ? (value as ListingCategory)
                                  : "",
                                subcategory: "",
                                subcategoryDetail: "",
                              }))
                            }
                          >
                            <SelectTrigger className={fieldSurfaceClass}>
                              <SelectValue placeholder={t("vendorListingEdit.selectCategoryPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {LISTING_CATEGORY_OPTIONS.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {category}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!hasCategory && (
                            <div className="text-sm text-destructive">Category is required.</div>
                          )}
                        </div>

                        {/* Subcategory — cascading picker, shown when category is selected */}
                        {draft.category ? (
                          <SubcategoryPicker
                            category={draft.category}
                            value={{
                              subcategory: draft.subcategory ?? "",
                              subcategoryDetail: draft.subcategoryDetail ?? "",
                            }}
                            onChange={(next) =>
                              setDraft((d: any) => ({
                                ...d,
                                subcategory: next.subcategory,
                                subcategoryDetail: next.subcategoryDetail,
                              }))
                            }
                          />
                        ) : null}
                      </div>
                    </div>
                  </Card>

                  {/* 1) Title & Description */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">{t("vendorListingEdit.titleAndDescription")}</div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t("vendorListingEdit.title")}</Label>
                        <Input
                          value={draft.listingTitle}
                          onChange={(e) =>
                            setDraft((d: any) => ({
                              ...d,
                              listingTitle: normalizeListingTitleInput(e.target.value),
                            }))
                          }
                          placeholder={t("vendorListingEdit.listingTitlePlaceholder")}
                          className={fieldSurfaceClass}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("vendorListingEdit.description")}</Label>
                        <Textarea
                          value={draft.listingDescription}
                          maxLength={LISTING_DESCRIPTION_MAX_CHARS}
                          onChange={(e) =>
                            setDraft((d: any) => ({
                              ...d,
                              listingDescription: e.target.value.slice(0, LISTING_DESCRIPTION_MAX_CHARS),
                            }))
                          }
                          rows={6}
                          placeholder={t("vendorListingEdit.descriptionPlaceholder")}
                          className={fieldSurfaceClass}
                        />
                        <div className="text-sm text-muted-foreground">Max 1000 chars.</div>
                      </div>

                      <div className="space-y-3">
                        <Label>{t("vendorListingEdit.whatsIncluded")}</Label>

                        {(Array.isArray(draft.whatsIncluded) ? draft.whatsIncluded : []).length > 0 && (
                          <ul className="space-y-1">
                            {(Array.isArray(draft.whatsIncluded) ? draft.whatsIncluded : []).map((item: string) => (
                              <li key={item} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
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
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="flex gap-2">
                          <Input
                            value={includedInput}
                            onChange={(e) => setIncludedInput(e.target.value)}
                            placeholder={t("vendorListingEdit.includedItemPlaceholder")}
                            className={fieldSurfaceClass}
                            spellCheck={true}
                            autoCorrect="on"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addIncludedItem(includedInput);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            disabled={includedInput.trim().length === 0}
                            onClick={() => addIncludedItem(includedInput)}
                            className={
                              includedInput.trim().length > 0
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {t("vendorListingEdit.addToListing")}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label>{t("vendorListingEdit.whatsNotIncluded")}</Label>

                        {(Array.isArray(draft.whatsNotIncluded) ? draft.whatsNotIncluded : []).length > 0 && (
                          <ul className="space-y-1">
                            {(Array.isArray(draft.whatsNotIncluded) ? draft.whatsNotIncluded : []).map((item: string) => (
                              <li key={item} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                <span className="flex items-start gap-2">
                                  <span aria-hidden>•</span>
                                  <span>{item}</span>
                                </span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => removeNotIncludedItem(item)}
                                  aria-label={`Remove ${item}`}
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="flex gap-2">
                          <Input
                            value={notIncludedInput}
                            onChange={(e) => setNotIncludedInput(e.target.value)}
                            placeholder={t("vendorListingEdit.notIncludedItemPlaceholder")}
                            className={fieldSurfaceClass}
                            spellCheck={true}
                            autoCorrect="on"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addNotIncludedItem(notIncludedInput);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            disabled={notIncludedInput.trim().length === 0}
                            onClick={() => addNotIncludedItem(notIncludedInput)}
                            className={
                              notIncludedInput.trim().length > 0
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {t("vendorListingEdit.addToListing")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* 2) Popular For */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">{t("vendorListingEdit.popularFor")}</div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <Button
                            type="button"
                            variant={allPopularForSelected ? "default" : "outline"}
                            className={allPopularForSelected ? activeFillButtonClass : undefined}
                            onClick={toggleSelectAllPopularFor}
                          >
                            {allPopularForSelected ? t("vendorListingEdit.deselectAll") : t("vendorListingEdit.selectAll")}
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {POPULAR_FOR_OPTIONS.map((opt) => {
                          const checked = selectedPopularFor.includes(opt);
                          return (
                            <label
                              key={opt}
                              className={[
                                "flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer",
                                checked ? "border-primary bg-[#ffffff]" : "border-border bg-[#ffffff] hover:bg-[#ffffff]",
                              ].join(" ")}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setDraft((d: any) => ({
                                    ...d,
                                    popularFor: checked
                                      ? (Array.isArray(d.popularFor) ? d.popularFor.filter((x: string) => x !== opt) : [])
                                      : Array.from(new Set([...(Array.isArray(d.popularFor) ? d.popularFor : []), opt])),
                                  }))
                                }
                              />
                              <span className="font-medium">{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </Card>

                  {/* 3) Pricing — single listings only; package_container pricing is per-package */}
                  {!isPackageContainer && <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">{t("vendorListingEdit.pricing")}</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t("vendorListingEdit.rate")}</Label>
                          <Input
                            value={toNumOrEmpty(draft.pricing?.rate)}
                            onChange={(e) =>
                              setDraft((d: any) => ({
                                ...d,
                                pricing: { ...(d.pricing || {}), rate: e.target.value.replace(/[^\d]/g, "") },
                              }))
                            }
                            inputMode="numeric"
                            placeholder="e.g. 250"
                            className={fieldSurfaceClass}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>{t("vendorListingEdit.unit")}</Label>
                          <Select
                            value={draft.pricing?.unit ?? "per_day"}
                            onValueChange={(v) =>
                              setDraft((d: any) => ({
                                ...d,
                                pricing: { ...(d.pricing || {}), unit: v },
                                pricingUnit: v,
                              }))
                            }
                          >
                            <SelectTrigger className={fieldSurfaceClass}>
                              <SelectValue placeholder={t("vendorListingEdit.selectUnitPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_day">{t("vendorListingEdit.perDayFlat")}</SelectItem>
                              <SelectItem value="per_hour">{t("vendorListingEdit.perHour")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {(draft.pricing?.unit === "per_hour" || draft.pricingUnit === "per_hour") && (
                        <div className="space-y-2">
                          <Label>{t("vendorListingEdit.minimumHours")}</Label>
                          <Input
                            value={toNumOrEmpty(draft.minimumHours)}
                            onChange={(e) =>
                              setDraft((d: any) => ({
                                ...d,
                                minimumHours: e.target.value.replace(/[^\d]/g, ""),
                              }))
                            }
                            inputMode="numeric"
                            placeholder="e.g. 2"
                            className={fieldSurfaceClass}
                          />
                        </div>
                      )}
                    </div>
                  </Card>}

                  {/* 3b) Security Deposit — single listings only */}
                  {!isPackageContainer && (
                    <Card className={creamSectionCardClass}>
                      <div className="space-y-4">
                        <div>
                          <div className="text-xl font-semibold">Security Deposit</div>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              Require a refundable security deposit on top of the booking total. It is held by EventHub and returned to the customer after the event if no damage claim is filed.
                            </p>
                          </div>
                          <Switch
                            checked={Boolean(draft.securityDepositEnabled)}
                            onCheckedChange={(checked) =>
                              setDraft((d: any) => ({
                                ...d,
                                securityDepositEnabled: checked,
                                securityDepositAmount: checked ? (d.securityDepositAmount ?? "") : "",
                              }))
                            }
                          />
                        </div>
                        {draft.securityDepositEnabled && (
                          <div className="space-y-2">
                            <Label>Deposit Amount</Label>
                            <div className="relative max-w-sm">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                                $
                              </span>
                              <Input
                                className={`pl-7 ${fieldSurfaceClass}`}
                                value={draft.securityDepositAmount ?? ""}
                                inputMode="decimal"
                                placeholder="e.g. 200"
                                onChange={(e) =>
                                  setDraft((d: any) => ({
                                    ...d,
                                    securityDepositAmount: e.target.value.replace(/[^\d.]/g, ""),
                                  }))
                                }
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}

                  {/* 7) Service Area — all listing types */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-6">
                      <div>
                        <div className="text-xl font-semibold">{t("vendorListingEdit.deliverySetup")}</div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t("vendorListingEdit.serviceAreaCenter")}</Label>
                        <LocationPicker
                          value={draft.serviceLocation ?? null}
                          onChange={(loc) => {
                            setErrorMsg(null);
                            setDraft((d: any) => ({
                              ...d,
                              serviceLocation: loc,
                              serviceCenter: loc ? { lat: loc.lat, lng: loc.lng } : d.serviceCenter,
                            }));
                          }}
                          placeholder="Search the center point for this listing..."
                          className="[&_input]:bg-[#ffffff]"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("vendorListingEdit.whereServicesLabel")}</Label>
                        <Select
                          value={draft.serviceAreaMode}
                          onValueChange={(v) => {
                            const next = v as ServiceAreaMode;
                            setDraft((d: any) => ({
                              ...d,
                              serviceAreaMode: next,
                              ...(next === "radius" ? {} : { serviceRadiusMiles: 500 }),
                            }));
                          }}
                        >
                          <SelectTrigger className={fieldSurfaceClass}>
                            <SelectValue placeholder={t("vendorListingEdit.selectServiceAreaPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="radius">{t("vendorListingEdit.serviceAreaRadius")}</SelectItem>
                            <SelectItem value="nationwide">{t("vendorListingEdit.serviceAreaNationwide")}</SelectItem>
                            <SelectItem value="global">{t("vendorListingEdit.serviceAreaGlobal")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {draft.serviceAreaMode === "radius" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>{t("vendorListingEdit.serviceRadius")}</Label>
                            <span className="text-sm text-muted-foreground">{draft.serviceRadiusMiles} miles</span>
                          </div>

                          <Slider
                            value={[draft.serviceRadiusMiles]}
                            min={0}
                            max={500}
                            step={15}
                            onValueChange={(vals) => {
                              const value = vals?.[0] ?? 0;
                              setDraft((d: any) => ({ ...d, serviceRadiusMiles: value }));
                            }}
                            disabled={!center}
                          />

                          <div className="relative rounded-xl border overflow-hidden h-64">
                            <div ref={mapContainerRef} className="relative z-10 w-full h-full" />

                            {!center && (
                              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none bg-background/40">
                                {t("vendorListingEdit.chooseLocation")}
                              </div>
                            )}

                            {!!errorMsg && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/70 px-6 text-center text-sm text-destructive">
                                {errorMsg}
                              </div>
                            )}

                            {!isMapReady && !errorMsg && (
                              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-background/50">
                                {t("vendorListingEdit.loadingMap")}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {!isPackageContainer && <div className="border-t pt-6 space-y-6">
                        <div className="flex items-center justify-between gap-6">
                          <Label>{t("vendorListingEdit.doYouDeliver")}</Label>
                          <YesNoButtons
                            value={!!draft.deliverySetup?.deliveryIncluded}
                            onChange={(v) =>
                              setDraft((d: any) => ({
                                ...d,
                                deliverySetup: {
                                  ...(d.deliverySetup || {}),
                                  deliveryIncluded: v,
                                  deliveryFeeEnabled: v ? !!d.deliverySetup?.deliveryFeeEnabled : false,
                                  deliveryFeeAmount: v ? d.deliverySetup?.deliveryFeeAmount ?? "" : "",
                                },
                              }))
                            }
                          />
                        </div>

                        {!!draft.deliverySetup?.deliveryIncluded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2 flex items-center justify-between gap-6">
                              <Label>{t("vendorListingEdit.isDeliveryFee")}</Label>
                              <YesNoButtons
                                value={!!draft.deliverySetup?.deliveryFeeEnabled}
                                onChange={(v) =>
                                  setDraft((d: any) => ({
                                    ...d,
                                    deliverySetup: {
                                      ...(d.deliverySetup || {}),
                                      deliveryFeeEnabled: v,
                                      deliveryFeeAmount: v ? d.deliverySetup?.deliveryFeeAmount ?? "" : "",
                                    },
                                  }))
                                }
                              />
                            </div>

                            {!!draft.deliverySetup?.deliveryFeeEnabled && (
                              <div className="md:col-start-2 space-y-2">
                                <Label>{t("vendorListingEdit.deliveryFeeAmount")}</Label>
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                  <Input
                                    value={toNumOrEmpty(draft.deliverySetup?.deliveryFeeAmount)}
                                    onChange={(e) =>
                                      setDraft((d: any) => ({
                                        ...d,
                                        deliverySetup: {
                                          ...(d.deliverySetup || {}),
                                          deliveryFeeAmount: e.target.value.replace(/[^\d.]/g, ""),
                                        },
                                      }))
                                    }
                                    inputMode="decimal"
                                    placeholder="e.g. 75"
                                    className={`${fieldSurfaceClass} pl-7`}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-6">
                          <Label>{t("vendorListingEdit.doYouSetup")}</Label>
                          <YesNoButtons
                            value={!!draft.deliverySetup?.setupIncluded}
                            onChange={(v) =>
                              setDraft((d: any) => ({
                                ...d,
                                deliverySetup: {
                                  ...(d.deliverySetup || {}),
                                  setupIncluded: v,
                                  setupFeeEnabled: v ? !!d.deliverySetup?.setupFeeEnabled : false,
                                  setupFeeAmount: v ? d.deliverySetup?.setupFeeAmount ?? "" : "",
                                },
                              }))
                            }
                          />
                        </div>

                        {!!draft.deliverySetup?.setupIncluded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2 flex items-center justify-between gap-6">
                              <Label>{t("vendorListingEdit.isSetupFee")}</Label>
                              <YesNoButtons
                                value={!!draft.deliverySetup?.setupFeeEnabled}
                                onChange={(v) =>
                                  setDraft((d: any) => ({
                                    ...d,
                                    deliverySetup: {
                                      ...(d.deliverySetup || {}),
                                      setupFeeEnabled: v,
                                      setupFeeAmount: v ? d.deliverySetup?.setupFeeAmount ?? "" : "",
                                    },
                                  }))
                                }
                              />
                            </div>

                            {!!draft.deliverySetup?.setupFeeEnabled && (
                              <div className="md:col-start-2 space-y-2">
                                <Label>{t("vendorListingEdit.setupFeeAmount")}</Label>
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                  <Input
                                    value={toNumOrEmpty(draft.deliverySetup?.setupFeeAmount)}
                                    onChange={(e) =>
                                      setDraft((d: any) => ({
                                        ...d,
                                        deliverySetup: {
                                          ...(d.deliverySetup || {}),
                                          setupFeeAmount: e.target.value.replace(/[^\d.]/g, ""),
                                        },
                                      }))
                                    }
                                    inputMode="decimal"
                                    placeholder="e.g. 50"
                                    className={`${fieldSurfaceClass} pl-7`}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {draft.category === "Rental" || draft.category === "Venue" || draft.category === "Catering" ? (
                          <>
                            <div className="flex items-center justify-between gap-6">
                              <Label>{t("vendorListingEdit.doYouTakedown")}</Label>
                              <YesNoButtons
                                value={!!draft.deliverySetup?.takedownIncluded}
                                onChange={(v) =>
                                  setDraft((d: any) => ({
                                    ...d,
                                    deliverySetup: {
                                      ...(d.deliverySetup || {}),
                                      takedownIncluded: v,
                                      takedownFeeEnabled: v ? !!d.deliverySetup?.takedownFeeEnabled : false,
                                      takedownFeeAmount: v ? d.deliverySetup?.takedownFeeAmount ?? "" : "",
                                    },
                                  }))
                                }
                              />
                            </div>

                            {!!draft.deliverySetup?.takedownIncluded && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2 flex items-center justify-between gap-6">
                                  <Label>{t("vendorListingEdit.isTakedownFee")}</Label>
                                  <YesNoButtons
                                    value={!!draft.deliverySetup?.takedownFeeEnabled}
                                    onChange={(v) =>
                                      setDraft((d: any) => ({
                                        ...d,
                                        deliverySetup: {
                                          ...(d.deliverySetup || {}),
                                          takedownFeeEnabled: v,
                                          takedownFeeAmount: v ? d.deliverySetup?.takedownFeeAmount ?? "" : "",
                                        },
                                      }))
                                    }
                                  />
                                </div>

                                {!!draft.deliverySetup?.takedownFeeEnabled && (
                                  <div className="md:col-start-2 space-y-2">
                                    <Label>{t("vendorListingEdit.takedownFeeAmount")}</Label>
                                    <div className="relative">
                                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                      <Input
                                        value={toNumOrEmpty(draft.deliverySetup?.takedownFeeAmount)}
                                        onChange={(e) =>
                                          setDraft((d: any) => ({
                                            ...d,
                                            deliverySetup: {
                                              ...(d.deliverySetup || {}),
                                              takedownFeeAmount: e.target.value.replace(/[^\d.]/g, ""),
                                            },
                                          }))
                                        }
                                        inputMode="decimal"
                                        placeholder="e.g. 50"
                                        className={`${fieldSurfaceClass} pl-7`}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>}
                    </div>
                  </Card>
                  {/* Cancellation Policy — single listings only */}
                  {!isPackageContainer &&
                  <Card className={creamSectionCardClass}>
                    <div className="text-xl font-semibold mb-4">{t("vendorListingEdit.cancellationPolicy")}</div>
                    <div className="flex flex-col gap-2">
                      {(["cancel_anytime", "cancel_within_hours", "no_cancellations"] as const).map((option) => {
                        const labels: Record<string, string> = {
                          cancel_anytime: t("vendorListingEdit.cancelAnytime"),
                          cancel_within_hours: t("vendorListingEdit.cancelWithinHours"),
                          no_cancellations: t("vendorListingEdit.noCancellations"),
                        };
                        const isSelected = (draft?.cancellationPolicy ?? "cancel_anytime") === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setDraft((d: any) => ({ ...d, cancellationPolicy: option }))}
                            className={`text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                              isSelected
                                ? "border-[#3a7c6e] bg-[#f0faf7] text-[#3a7c6e]"
                                : "border-border bg-background text-foreground hover:border-[#3a7c6e]/50"
                            }`}
                          >
                            {labels[option]}
                          </button>
                        );
                      })}
                    </div>
                    {(draft?.cancellationPolicy ?? "cancel_anytime") === "cancel_within_hours" && (
                      <div className="mt-4 space-y-2">
                        <Label>{t("vendorListingEdit.hoursBeforeEvent")}</Label>
                        <Input
                          type="number"
                          min={1}
                          value={draft?.cancellationPolicyHours ?? "48"}
                          onChange={(e) =>
                            setDraft((d: any) => ({ ...d, cancellationPolicyHours: e.target.value.replace(/[^\d]/g, "") }))
                          }
                          placeholder="e.g. 48"
                          className={fieldSurfaceClass}
                        />
                      </div>
                    )}
                  </Card>}

                  {/* close activeTab === "info" block */}
                  </>}

                  {/* Status + publish gate — always visible */}
                  <Card className={creamSectionCardClass}>
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <div className="text-xl font-semibold">{t("vendorListingEdit.status")}</div>
                        <div className="text-muted-foreground mt-1">
                          {t("vendorListingEdit.currentStatus")} <span className="font-medium">{status}</span>
                          <div className="text-sm mt-2">
                            {t("vendorListingEdit.publishBlocked")}
                          </div>
                        </div>
                      </div>

                      <Button
                        disabled={!canPublish || publishMutation.isPending || (isActive && !isDirty)}
                        onClick={handlePublishClick}
                        className={mintActionButtonClass}
                      >
                        {publishMutation.isPending
                          ? t("vendorListingEdit.publishing")
                          : isActive && !isDirty
                            ? "Published"
                            : isActive
                              ? "Publish Changes"
                              : t("vendorListingEdit.publish")}
                      </Button>
                    </div>

                    {!canPublish ? (
                      <div className="mt-4 text-sm text-muted-foreground">
                        Missing:
                        {!hasCategory ? " category," : ""}
                        {!hasTitle ? " title," : ""}
                        {!isPackageContainer && !hasDescription ? " description," : ""}
                        {!isPackageContainer && !hasPricing ? " pricing rate," : ""}
                        {!hasMinimumPhotos ? ` at least ${MIN_LISTING_PHOTO_COUNT} photos,` : ""}
                      </div>
                    ) : null}
                  </Card>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
    </>
  );
}
