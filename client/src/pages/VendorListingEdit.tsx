import React, { useMemo, useState, useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
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
} from "@/lib/listingPhotos";
import { InlinePhotoEditor, type ListingPhotoCrop } from "@/components/listings/InlinePhotoEditor";
import { getPublishFailureToastContent } from "@/lib/publishFailureToast";

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

// ---- Helpers ----
const toNumOrEmpty = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s;
};

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
function makeCircleGeoJSON(center: { lat: number; lng: number }, radiusMiles: number) {
  const steps = 80;

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
  const params = useParams() as { id?: string };
  const listingId = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "3rem",
      }) as React.CSSProperties,
    []
  );
  const mintActionButtonClass = "border-[#88bdb4] bg-[#9dd4cc] text-[#4a6a7d] hover:bg-[#8ec9c0]";
  const activeFillButtonClass = "bg-primary text-primary-foreground hover:bg-primary/90";
  const creamSectionCardClass = "p-6 bg-[#F0EEE9]";
  const fieldSurfaceClass = "bg-[#F0EEE9]";

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

  // ---- Draft state (this is what we edit inline) ----
  const [draft, setDraft] = useState<any>(null);
  const [includedInput, setIncludedInput] = useState("");

  // Init draft once listing is loaded
  useEffect(() => {
    if (!listing) return;

    const ld = listing.listingData || {};
    const rawPhotoNames: string[] = Array.isArray(ld?.photos?.names)
      ? ld.photos.names.filter((name: unknown): name is string => typeof name === "string")
      : [];
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

    // Normalize shape into what we need on this screen
    const initial = {
      // Listing Type
      pricingMode: (ld.pricingMode || "single_service") as PricingMode,

      // Title / Description
      listingTitle: String(ld.listingTitle || listing.title || ""),
      listingDescription: String(ld.listingDescription || ""),
      whatsIncluded: Array.isArray(ld.whatsIncluded)
        ? ld.whatsIncluded.filter((item: unknown): item is string => typeof item === "string")
        : [],

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
        rate: ld?.pricing?.rate ?? "",
        unit: ld?.pricing?.unit ?? "per_day",
      },
      pricingUnit: ld?.pricingUnit ?? ld?.pricing?.unit ?? "per_day",
      minimumHours: ld?.minimumHours ?? "",

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
          if (!isHeic) acc[name] = `/uploads/listings/${name}`;
          return acc;
        },
        {}
      ),


      // Delivery / Setup
      deliverySetup: ld?.deliverySetup || {},
      serviceAreaMode: (ld?.serviceAreaMode || "radius") as ServiceAreaMode,
      serviceRadiusMiles: Number(ld?.serviceRadiusMiles ?? 30),
      serviceCenter: ld?.serviceCenter ?? undefined,
      serviceLocation: ld?.serviceLocation ?? null,
    };

    setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.id]);

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

  // ---- Photo upload (simple, persists file names; previews are local) ----
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  async function uploadListingPhoto(file: File): Promise<{ url: string; filename: string }> {
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

    console.log(
      "[upload debug]",
      fileArr.map((f) => ({
        name: f.name,
        type: f.type,
        sizeMB: Math.round((f.size / 1024 / 1024) * 100) / 100,
      }))
    );

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

        // swap temp -> real filename
        nextNames = nextNames.map((n) => (n === tempName ? u.filename : n));

        // move preview mapping temp -> real filename
        delete map[tempName];
        map[u.filename] = `/uploads/listings/${u.filename}`;
        if (nextCropsByName[tempName]) {
          nextCropsByName[u.filename] = nextCropsByName[tempName];
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
  const hasTitle = title.trim() !== "";
  const hasDescription = description.trim() !== "";

  const hasPricing =
    pricingRate !== null && pricingRate !== undefined && `${pricingRate}`.trim() !== "";

  const canPublish = hasTitle && hasDescription && hasPricing;

  const buildPersistPayload = () => {
    if (!draft) return null;

    const nextListingData = {
      ...(listing?.listingData || {}),
      pricingMode: draft.pricingMode,
      listingTitle: draft.listingTitle,
      listingDescription: draft.listingDescription,
      whatsIncluded: Array.isArray(draft.whatsIncluded) ? draft.whatsIncluded : [],
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
        names: Array.isArray(draft?.photos?.names) ? draft.photos.names : [],
        count: Array.isArray(draft?.photos?.names) ? draft.photos.names.length : 0,
        coverPhotoIndex: Array.isArray(draft?.photos?.names) && draft.photos.names.length > 0 ? 0 : 0,
        coverPhotoRatio: normalizePhotoCoverRatio(draft?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO),
        coverPhotoName:
          Array.isArray(draft?.photos?.names) && draft.photos.names.length > 0
            ? draft.photos.names[0] ?? null
            : null,
        cropsByName:
          draft?.photos?.cropsByName && typeof draft.photos.cropsByName === "object"
            ? draft.photos.cropsByName
            : {},
      },
      deliverySetup: draft.deliverySetup,
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

    return {
      listingData: nextListingData,
      title: draft.listingTitle?.trim() || listing?.title || "Untitled Listing",
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

      if (!res.ok) throw new Error("Failed to save changes");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId] });
      toast({ title: "Saved", description: "Your changes were saved." });
      setLocation("/vendor/listings");
    },
    onError: (err) => {
      toast({
        title: "Save failed",
        description: (err as Error)?.message || "Could not save changes",
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
      if (!res.ok) throw new Error("Failed to publish listing");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
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
  const showPublishAction = normalizedStatus === "draft" || normalizedStatus === "inactive";

  // ---- Location derived center + circle (for future map preview) ----
  const center =
    draft?.serviceLocation
      ? { lat: draft.serviceLocation.lat, lng: draft.serviceLocation.lng }
      : draft?.serviceCenter
      ? draft.serviceCenter
      : null;

  const circleFeature = useMemo(() => {
    if (!center) return null;
    return makeCircleGeoJSON(center, Number(draft?.serviceRadiusMiles ?? 0));
  }, [center, draft?.serviceRadiusMiles]);

  useEffect(() => {
    // Only render map when Delivery / Setup exists in DOM
    // (This page always renders it, so we can init when draft is ready.)
    if (!draft) return;
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    if (!MAPBOX_TOKEN) {
      console.error("Missing VITE_MAPBOX_TOKEN");
      setErrorMsg("Missing Mapbox token. Please set VITE_MAPBOX_TOKEN.");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const startCenter = center ? [center.lng, center.lat] : [-111.891, 40.7608]; // fallback
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: startCenter as [number, number],
      zoom: center ? 9 : 5,
    });

    mapRef.current = map;

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
    });

    return () => {
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      setIsMapReady(false);
    };
    // IMPORTANT: we only want this to run once for mount/init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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
  }, [circleFeature, center]);

  const selectedPopularFor = Array.isArray(draft?.popularFor) ? draft.popularFor : [];
  const allPopularForSelected = POPULAR_FOR_OPTIONS.every((option) => selectedPopularFor.includes(option));
  const photoNames: string[] = Array.isArray(draft?.photos?.names) ? draft.photos.names : [];
  const coverPhotoRatio = normalizePhotoCoverRatio(draft?.photos?.coverPhotoRatio ?? DEFAULT_COVER_RATIO);
  const getPhotoPreviewSrc = (name: string) =>
    draft?._photoPreviewsByName?.[name] || `/uploads/listings/${name}`;
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
    <SidebarProvider style={sidebarStyle} className="bg-[#F0EEE9]">
      <div className="flex h-screen w-full bg-[#F0EEE9]">
        <VendorSidebar className="!bg-[#F0EEE9] [&_[data-slot=sidebar-header]]:bg-[#F0EEE9] [&_[data-slot=sidebar-content]]:bg-[#F0EEE9] [&_[data-slot=sidebar-footer]]:bg-[#F0EEE9]" />

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b bg-[#F0EEE9]">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Button
                className={activeFillButtonClass}
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !draft}
              >
                {saveMutation.isPending ? "Saving…" : "Save changes"}
              </Button>

              {showPublishAction && (
                <Button
                  disabled={!canPublish || publishMutation.isPending || !draft}
                  onClick={() => publishMutation.mutate()}
                  className={mintActionButtonClass}
                >
                  {publishMutation.isPending ? "Publishing…" : "Publish"}
                </Button>
              )}

              <Link href="/vendor/listings">
                <Button variant="outline">Back to listings</Button>
              </Link>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-[#F0EEE9]">
            <div className="max-w-5xl mx-auto px-6 py-8">
              <div className="mb-6">
                <h1 className="text-3xl font-bold">Edit listing</h1>
                <p className="text-muted-foreground">
                  Everything is editable here. This matches your Create Listing inputs, just in a clean 7-section layout.
                </p>
              </div>

              {!listingId ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Missing listing id in the URL.</p>
                </Card>
              ) : isLoading ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Loading…</p>
                </Card>
              ) : error ? (
                <Card className="p-6">
                  <p className="text-sm text-destructive">
                    {(error as Error)?.message || "Error loading listing"}
                  </p>
                </Card>
              ) : !listing || !draft ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Listing not found.</p>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* 1) Title & Description */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">Title &amp; Description</div>
                        <div className="text-sm text-muted-foreground">These fields are required to publish.</div>
                      </div>

                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={draft.listingTitle}
                          onChange={(e) => setDraft((d: any) => ({ ...d, listingTitle: e.target.value }))}
                          placeholder="Listing title"
                          className={fieldSurfaceClass}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={draft.listingDescription}
                          onChange={(e) => setDraft((d: any) => ({ ...d, listingDescription: e.target.value }))}
                          rows={6}
                          placeholder="Describe this listing…"
                          className={fieldSurfaceClass}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label>What&apos;s Included</Label>

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
                            placeholder="Type an included item…"
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
                            Add to listing
                          </Button>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Rules: Each bullet is capitalized, ends without a period, and duplicates are prevented.
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* 2) Popular For */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">Popular For</div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm text-muted-foreground">Optional. Select all that apply.</div>
                          <Button
                            type="button"
                            variant={allPopularForSelected ? "default" : "outline"}
                            className={allPopularForSelected ? activeFillButtonClass : undefined}
                            onClick={toggleSelectAllPopularFor}
                          >
                            {allPopularForSelected ? "Deselect all" : "Select all"}
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
                                checked ? "border-primary bg-[#F0EEE9]" : "border-border bg-[#F0EEE9] hover:bg-[#F0EEE9]",
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

                  {/* 3) Pricing (baseline – you can expand later) */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">Pricing</div>
                        <div className="text-sm text-muted-foreground">Rate is required to publish.</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Rate</Label>
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
                          <Label>Unit</Label>
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
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_day">Per day (flat)</SelectItem>
                              <SelectItem value="per_hour">Per hour (+ minimum hours)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {(draft.pricing?.unit === "per_hour" || draft.pricingUnit === "per_hour") && (
                        <div className="space-y-2">
                          <Label>Minimum hours</Label>
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
                  </Card>

                  {/* 6) Photos */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">Photos</div>
                        <div className="text-sm text-muted-foreground">
                          Add at least 1 photo before publish (we’ll enforce this rule in the publish gate once your photo system is finalized).
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
                          Add photos
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

                  {/* 7) Delivery / Setup */}
                  <Card className={creamSectionCardClass}>
                    <div className="space-y-6">
                      <div>
                        <div className="text-xl font-semibold">Delivery / Setup</div>
                        <div className="text-sm text-muted-foreground">
                          Optional. Default comes from your vendor onboarding address, but you can override it per listing.
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Service area center (listing-specific)</Label>
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
                          className="[&_input]:bg-[#F0EEE9]"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Where do you provide these services?</Label>
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
                            <SelectValue placeholder="Select service area" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="radius">Set Radius</SelectItem>
                            <SelectItem value="nationwide">Nationally</SelectItem>
                            <SelectItem value="global">Globally</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {draft.serviceAreaMode === "radius" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Service radius</Label>
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

                          <p className="text-xs text-muted-foreground">
                            Adjust in 15-mile increments. (Max 500 miles)
                          </p>

                          {/* Map preview placeholder for now; the real map wiring is already proven in Create Listing.
                              If you want the full Mapbox preview on this screen too, we’ll copy the map init block next. */}
                          {/* Map preview */}
                          <div className="relative rounded-xl border overflow-hidden h-64">
                            <div ref={mapContainerRef} className="w-full h-full" />

                            {!center && (
                              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none bg-background/40">
                                Choose a location to preview your service radius.
                              </div>
                            )}

                            {!!errorMsg && (
                              <div className="absolute inset-0 flex items-center justify-center bg-background/70 px-6 text-center text-sm text-destructive">
                                {errorMsg}
                              </div>
                            )}

                            {!isMapReady && !errorMsg && (
                              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-background/50">
                                Loading map…
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="border-t pt-6 space-y-6">
                        <div className="flex items-center justify-between gap-6">
                          <Label>Do you deliver?</Label>
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
                              <Label>Is there a delivery fee?</Label>
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
                                <Label>Delivery fee amount</Label>
                                <Input
                                  value={toNumOrEmpty(draft.deliverySetup?.deliveryFeeAmount)}
                                  onChange={(e) =>
                                    setDraft((d: any) => ({
                                      ...d,
                                      deliverySetup: {
                                        ...(d.deliverySetup || {}),
                                        deliveryFeeAmount: e.target.value.replace(/[^\d]/g, ""),
                                      },
                                    }))
                                  }
                                  inputMode="numeric"
                                  placeholder="e.g. 75"
                                  className={fieldSurfaceClass}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-6">
                          <Label>Do you offer setup?</Label>
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
                              <Label>Is there a setup fee?</Label>
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
                                <Label>Setup fee amount</Label>
                                <Input
                                  value={toNumOrEmpty(draft.deliverySetup?.setupFeeAmount)}
                                  onChange={(e) =>
                                    setDraft((d: any) => ({
                                      ...d,
                                      deliverySetup: {
                                        ...(d.deliverySetup || {}),
                                        setupFeeAmount: e.target.value.replace(/[^\d]/g, ""),
                                      },
                                    }))
                                  }
                                  inputMode="numeric"
                                  placeholder="e.g. 50"
                                  className={fieldSurfaceClass}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                  {/* Status + publish gate */}
                  <Card className={creamSectionCardClass}>
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <div className="text-xl font-semibold">Status</div>
                        <div className="text-muted-foreground mt-1">
                          Current status: <span className="font-medium">{status}</span>
                          <div className="text-xs mt-2">
                            Publish is blocked until required fields are complete.
                          </div>
                        </div>
                      </div>

                      <Button
                        disabled={!canPublish || publishMutation.isPending}
                        onClick={() => publishMutation.mutate()}
                        className={mintActionButtonClass}
                      >
                        {publishMutation.isPending ? "Publishing…" : "Publish"}
                      </Button>
                    </div>

                    {!canPublish ? (
                      <div className="mt-4 text-sm text-muted-foreground">
                        Missing:
                        {!hasTitle ? " title," : ""}
                        {!hasDescription ? " description," : ""}
                        {!hasPricing ? " pricing rate," : ""}{" "}
                        <span className="text-xs">(same gate everywhere)</span>
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
  );
}
