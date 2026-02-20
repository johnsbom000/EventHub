import React, { useMemo, useState, useEffect, useRef } from "react";
import { Link, useParams } from "wouter";
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

type PricingMode = "single_service" | "package" | "a_la_carte";
type ServiceAreaMode = "radius" | "nationwide" | "global";

const pricingModeConfig = {
  headline: "How will you list your services?",
  subhead: "Choose a simple structure. You can create more listings later.",
  cards: [
    { mode: "single_service" as PricingMode, title: "Single Item", desc: "Single service with simple pricing." },
    { mode: "package" as PricingMode, title: "Package", desc: "Bundled services into named packages." },
    { mode: "a_la_carte" as PricingMode, title: "A La Carte", desc: "Customers choose individual props with individual pricing." },
  ],
};

// ---- Helpers ----
const toNumOrEmpty = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  return s;
};

function YesNoButtons({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant={value ? "default" : "outline"}
        onClick={() => onChange(true)}
        style={value ? { backgroundColor: "#9EDBC0", color: "white" } : undefined}
      >
        Yes
      </Button>
      <Button type="button" variant={!value ? "default" : "outline"} onClick={() => onChange(false)}>
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
  const { toast } = useToast();

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "3rem",
      }) as React.CSSProperties,
    []
  );

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

  const { data: rentalTypes = [] } = useQuery<{ slug: string; label: string }[]>({
    queryKey: ["/api/rental-types"],
  });

  // Rental types (for prop type selection UI)

  const listing = (data as AnyListing | undefined) ?? undefined;

  // ---- Draft state (this is what we edit inline) ----
  const [draft, setDraft] = useState<any>(null);

  // Init draft once listing is loaded
  useEffect(() => {
    if (!listing) return;

    const ld = listing.listingData || {};

    // Normalize shape into what we need on this screen
    const initial = {
      // Listing Type
      pricingMode: (ld.pricingMode || "single_service") as PricingMode,

      // Title / Description
      listingTitle: String(ld.listingTitle || listing.title || ""),
      listingDescription: String(ld.listingDescription || ""),

      // Prop Types
      propTypes: Array.isArray(ld.propTypes) ? ld.propTypes : [],
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
        names: Array.isArray(ld?.photos?.names) ? ld.photos.names : [],
        count: Array.isArray(ld?.photos?.names) ? ld.photos.names.length : 0,
      },

      _photoPreviewsByName: (Array.isArray(ld?.photos?.names) ? ld.photos.names : []).reduce(
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

  // ---- Prop type logic (copied behavior from wizard, simplified) ----
  const setPricingMode = (_mode: PricingMode) => {
    // MVP: listing types are locked to single_service
    return;
  };

  const setPropQuantity = (slug: string, raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, "");
    setDraft((d: any) => ({
      ...d,
      quantitiesByPropType: {
        ...(d.quantitiesByPropType || {}),
        [slug]: cleaned,
      },
    }));
  };

  const togglePropType = (slug: string) => {
    setDraft((d: any) => {
      if (!d) return d;
      const mode: PricingMode = d.pricingMode;

      if (mode === "single_service") {
        const isSelected = d.propTypes?.[0] === slug;
        return {
          ...d,
          propTypes: isSelected ? [] : [slug],
          quantitiesByPropType: isSelected ? {} : { [slug]: "1" },
        };
      }

      const has = (d.propTypes || []).includes(slug);
      const nextPropTypes = has ? d.propTypes.filter((x: string) => x !== slug) : [...d.propTypes, slug];

      let nextQty = d.quantitiesByPropType || {};
      if (has) {
        const { [slug]: _removed, ...rest } = nextQty;
        nextQty = rest;
      } else {
        nextQty = { ...nextQty, [slug]: nextQty[slug] ?? "1" };
      }

      return { ...d, propTypes: nextPropTypes, quantitiesByPropType: nextQty };
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
        photos: { names: nextNames, count: nextNames.length },
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

      let nextNames = [...names];

      uploaded.forEach((u, i) => {
        const tempName = tempEntries[i].tempName;
        const blobPreview = map[tempName];

        // swap temp -> real filename
        nextNames = nextNames.map((n) => (n === tempName ? u.filename : n));

        // move preview mapping temp -> real filename
        delete map[tempName];
        map[u.filename] = `/uploads/listings/${u.filename}`;

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
        photos: { names: nextNames, count: nextNames.length },
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

        const tempNames = new Set(tempEntries.map((x) => x.tempName));
        const nextNames = names.filter((n) => !tempNames.has(n));

        tempEntries.forEach((x) => delete map[x.tempName]);

        return {
          ...d,
          photos: { names: nextNames, count: nextNames.length },
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

      const name = names[idx];
      const nextNames = names.filter((_: any, i: number) => i !== idx);

      const preview = name ? map[String(name)] : undefined;
      if (preview) {
        try {
          URL.revokeObjectURL(preview);
        } catch {}
        delete map[String(name)];
      }

      return {
        ...d,
        photos: { names: nextNames, count: nextNames.length },
        _photoPreviewsByName: map,
      };
    });
  };

  // ---- Derived summaries / publish gating ----
  const title = String(draft?.listingTitle ?? "");
  const description = String(draft?.listingDescription ?? "");
  const propTypes: string[] = Array.isArray(draft?.propTypes) ? draft.propTypes : [];

  const pricingRate = draft?.pricing?.rate;
  const hasTitle = title.trim() !== "";
  const hasDescription = description.trim() !== "";
  const hasProps = propTypes.length > 0;

  const hasPricing =
    pricingRate !== null && pricingRate !== undefined && `${pricingRate}`.trim() !== "";

  const canPublish = hasTitle && hasDescription && hasProps && hasPricing;

  // ---- Save mutation ----
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!listingId) throw new Error("Missing listing id");
      if (!draft) throw new Error("Nothing to save");

      // Persist into listingData in a clean way
      const nextListingData = {
        ...(listing?.listingData || {}),
        pricingMode: draft.pricingMode,
        listingTitle: draft.listingTitle,
        listingDescription: draft.listingDescription,
        propTypes: draft.propTypes,
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

      const res = await apiRequest("PATCH", `/api/vendor/listings/${listingId}`, {
        listingData: nextListingData,
        title: draft.listingTitle?.trim() || listing?.title || "Untitled Listing",
      });

      if (!res.ok) throw new Error("Failed to save changes");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId] });
      toast({ title: "Saved", description: "Your changes were saved." });
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
      const res = await apiRequest("PATCH", `/api/vendor/listings/${listingId}/publish`);
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
      toast({
        title: "Failed to publish",
        description: (err as Error)?.message || "Publish failed",
        variant: "destructive",
      });
    },
  });

  const status = String(listing?.status || "—");

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
          "fill-color": "#9EDBC0",
          "fill-opacity": 0.25,
        },
      });

      map.addLayer({
        id: "radius-outline",
        type: "line",
        source: "radius",
        paint: {
          "line-color": "#9EDBC0",
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

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <VendorSidebar />

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !draft}
              >
                {saveMutation.isPending ? "Saving…" : "Save changes"}
              </Button>

              <Button
                disabled={!canPublish || publishMutation.isPending || !draft}
                onClick={() => publishMutation.mutate()}
                style={{ backgroundColor: "#9EDBC0", color: "white" }}
              >
                {publishMutation.isPending ? "Publishing…" : "Publish"}
              </Button>

              <Link href="/vendor/listings">
                <Button variant="outline">Back to listings</Button>
              </Link>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
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
                  <p className="text-sm text-red-600">
                    {(error as Error)?.message || "Error loading listing"}
                  </p>
                </Card>
              ) : !listing || !draft ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Listing not found.</p>
                </Card>
              ) : (
                <div className="space-y-6">
                  {/* 1) Listing Type */}
                  <Card className="p-6 bg-muted/30">
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">Listing Type</div>
                        <div className="text-sm text-muted-foreground">
                          {pricingModeConfig.subhead}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {pricingModeConfig.cards.map((c) => (
                          <Card
                            key={c.mode}
                            className={`p-5 cursor-pointer hover:border-primary ${
                              draft.pricingMode === c.mode ? "border-primary" : ""
                            }`}
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
                  </Card>

                  {/* 2) Prop Types */}
                  <Card className="p-6 bg-muted/30">
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">Prop Types</div>
                        <div className="text-sm text-muted-foreground">
                          {draft.pricingMode === "single_service"
                            ? "Select exactly 1 prop type for this Single Item listing. (Required)"
                            : "Select all prop types included in this listing. (Required)"}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(rentalTypes.length > 0 ? rentalTypes : []).map((r: { slug: string; label: string }) => {
                          const slug = r.slug as string;
                          const label = r.label as string;

                          const checked = draft.propTypes.includes(slug);
                          const showQty = checked && draft.pricingMode === "a_la_carte";
                          const qtyVal = draft.quantitiesByPropType?.[slug] ?? "1";

                          return (
                            <label
                              key={slug}
                              className={[
                                "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 cursor-pointer",
                                checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                              ].join(" ")}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePropType(slug)}
                                />
                                <span className="font-medium">{label}</span>
                              </div>

                              {showQty && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Qty</span>
                                  <Input
                                    className="w-20 h-9"
                                    value={qtyVal}
                                    inputMode="numeric"
                                    onClick={(e) => e.preventDefault()}
                                    onChange={(e) => setPropQuantity(slug, e.target.value)}
                                    placeholder="1"
                                  />
                                </div>
                              )}
                            </label>
                          );
                        })}
                      </div>

                      {draft.propTypes.length === 0 && (
                        <div className="text-sm text-destructive">Select at least 1 prop type.</div>
                      )}
                      {draft.pricingMode === "single_service" && draft.propTypes.length !== 1 && (
                        <div className="text-sm text-destructive">
                          Single Item listings must have exactly 1 prop type selected.
                        </div>
                      )}
                      {draft.pricingMode === "a_la_carte" &&
                        draft.propTypes.length > 0 &&
                        draft.propTypes.some((slug: string) => {
                          const q = Number(draft.quantitiesByPropType?.[slug]);
                          return !q || q < 1;
                        }) && (
                          <div className="text-sm text-destructive">
                            Each selected prop must have a quantity of at least 1.
                          </div>
                        )}
                    </div>
                  </Card>

                  {/* 3) Title & Description */}
                  <Card className="p-6 bg-muted/30">
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
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={draft.listingDescription}
                          onChange={(e) => setDraft((d: any) => ({ ...d, listingDescription: e.target.value }))}
                          rows={6}
                          placeholder="Describe this listing…"
                        />
                      </div>
                    </div>
                  </Card>

                  {/* 4) Popular For */}
                  <Card className="p-6 bg-muted/30">
                    <div className="space-y-4">
                      <div>
                        <div className="text-xl font-semibold">Popular For</div>
                        <div className="text-sm text-muted-foreground">Optional. Select all that apply.</div>
                      </div>

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
                                  setDraft((d: any) => ({
                                    ...d,
                                    popularFor: checked ? d.popularFor.filter((x: string) => x !== opt) : [...d.popularFor, opt],
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

                  {/* 5) Pricing (baseline – you can expand later) */}
                  <Card className="p-6 bg-muted/30">
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
                            <SelectTrigger>
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
                          />
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* 6) Photos */}
                  <Card className="p-6 bg-muted/30">
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
                          variant="outline"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          Add photos
                        </Button>
                        <div className="text-sm text-muted-foreground">
                          Count: {Array.isArray(draft?.photos?.names) ? draft.photos.names.length : 0}
                        </div>
                      </div>

                      {Array.isArray(draft?.photos?.names) && draft.photos.names.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {draft.photos.names.map((name: string, idx: number) => {
                            const preview = draft._photoPreviewsByName?.[name];
                            const isHeic = String(name).toLowerCase().endsWith(".heic");

                            return (
                              <div key={`${name}-${idx}`} className="rounded-lg border overflow-hidden bg-background">
                                <div className="aspect-square bg-muted flex items-center justify-center">
                                  {!isHeic ? (
                                    <img
                                      src={preview || `/uploads/listings/${name}`}
                                      alt={name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        // if neither preview nor server file works, show the fallback text
                                        const img = e.currentTarget;
                                        img.style.display = "none";
                                        const parent = img.parentElement;
                                        if (parent && !parent.querySelector("[data-fallback='1']")) {
                                          const div = document.createElement("div");
                                          div.setAttribute("data-fallback", "1");
                                          div.className = "text-xs text-muted-foreground px-3 text-center";
                                          div.innerHTML = `No preview<br/><span style="word-break:break-all">${String(name)}</span>`;
                                          parent.appendChild(div);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="text-xs text-muted-foreground px-3 text-center">
                                      HEIC preview not supported <br />
                                      <span className="break-all">{name}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="p-2 flex items-center justify-between gap-2">
                                  <div className="text-xs truncate text-muted-foreground">{name}</div>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => removePhotoAt(idx)}>
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No photos yet.</div>
                      )}
                    </div>
                  </Card>

                  {/* 7) Delivery / Setup */}
                  <Card className="p-6 bg-muted/30">
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
                          <SelectTrigger>
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
                              <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 bg-background/70 px-6 text-center">
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
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                  {/* Status + publish gate */}
                  <Card className="p-6">
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
                        style={{ backgroundColor: "#9EDBC0", color: "white" }}
                      >
                        {publishMutation.isPending ? "Publishing…" : "Publish"}
                      </Button>
                    </div>

                    {!canPublish ? (
                      <div className="mt-4 text-sm text-muted-foreground">
                        Missing:
                        {!hasTitle ? " title," : ""}
                        {!hasDescription ? " description," : ""}
                        {!hasProps ? " at least 1 prop type," : ""}
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
