import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/LocationPicker";
import type { LocationResult } from "@/types/location";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Provider-agnostic circle polygon generator (GeoJSON)
function makeCircleGeoJSON(
  center: { lat: number; lng: number },
  radiusMiles: number,
  points = 64
) {
  const radiusKm = radiusMiles * 1.60934;

  const coords: [number, number][] = [];
  const lat = center.lat * (Math.PI / 180);
  const lng = center.lng * (Math.PI / 180);

  const earthRadiusKm = 6371;

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


const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

type ServiceAreaMode = "radius" | "nationwide" | "global";

interface Step3MarketProps {
  formData: {
    // from onboarding
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;

    homeBaseLocation?: { lat: number; lng: number };
    serviceRadiusMiles: number;

    // new: service area mode
    serviceAreaMode?: ServiceAreaMode;

    // (optional) we’ll store a richer selected location for map later
    marketLocation?: LocationResult | null;
  };
  updateFormData: (updates: Partial<Step3MarketProps["formData"]>) => void;
  onNext: () => void;
  onBack: () => void;
}

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

export default function Step3_Market({
  formData,
  updateFormData,
  onNext,
  onBack,
}: Step3MarketProps) {
  const mode: ServiceAreaMode = formData.serviceAreaMode ?? "radius";
  const radius = formData.serviceRadiusMiles ?? 0;

  // --- Step 3 UX state ---
  const [isMapReady, setIsMapReady] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- Center derived from selection or stored coords ---
  const center =
    formData.marketLocation
      ? { lat: formData.marketLocation.lat, lng: formData.marketLocation.lng }
      : formData.homeBaseLocation
      ? formData.homeBaseLocation
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

  // --- Mapbox GL wiring ---
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const runAutofillGeocode = useCallback(async () => {
    if (formData.marketLocation) return;

    // Need at least city+state
    if (!formData.city || !formData.state) return;

    const parts = [
      formData.streetAddress,
      formData.city,
      formData.state,
      formData.zipCode,
    ].filter(Boolean);

    const q = parts.join(", ");
    if (!q.trim()) return;

    setIsGeocoding(true);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/locations/search?q=${encodeURIComponent(q)}`
      );
      if (!res.ok) {
        setErrorMsg(
          "We couldn’t find that address. Please select your location manually."
        );
        return;
      }

      const results: LocationResult[] = await res.json();
      const top = results?.[0];
      if (!top) {
        setErrorMsg(
          "We couldn’t find that address. Please select your location manually."
        );
        return;
      }

      updateFormData({
        marketLocation: top,
        homeBaseLocation: { lat: top.lat, lng: top.lng },
      });
    } catch {
      setErrorMsg(
        "Network error while finding your address. Please select your location manually."
      );
    } finally {
      setIsGeocoding(false);
    }
  }, [
    formData.marketLocation,
    formData.streetAddress,
    formData.city,
    formData.state,
    formData.zipCode,
    updateFormData,
  ]);

  // --- Autofill Market location from Step 2 address (best-effort) ---
  useEffect(() => {
    void runAutofillGeocode();
  }, [runAutofillGeocode]);

  // Ensure radius is visible once a center exists (for preview)
  useEffect(() => {
    if (!center) return;

    if ((formData.serviceRadiusMiles ?? 0) === 0) {
      updateFormData({ serviceRadiusMiles: 15 });
    }
  }, [center, formData.serviceRadiusMiles, updateFormData]);

  // Initialize the map once (when container exists)
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;
    setErrorMsg(null);

    if (!MAPBOX_TOKEN) {
      console.error("Missing VITE_MAPBOX_TOKEN");
      setErrorMsg("Missing Mapbox token. Please set VITE_MAPBOX_TOKEN.");
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const initialCenter: [number, number] = center
      ? [center.lng, center.lat]
      : [-111.891, 40.7608]; // fallback

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: 10,
    });

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
  }, []);

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
  }, []);

  // Update sources + camera whenever center/radius changes (and after map is ready)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isMapReady) return;

    const radiusSrc = map.getSource("radius") as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (radiusSrc) radiusSrc.setData(radiusFeatureCollection as any);

    const centerSrc = map.getSource("center") as
      | mapboxgl.GeoJSONSource
      | undefined;
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

  // --- UI handlers ---
  const handleRadiusChange = (vals: number[]) => {
    const value = vals?.[0] ?? 0;
    const snapped = Math.round(value / 15) * 15;
    updateFormData({ serviceRadiusMiles: snapped });
  };

  const canProceed = !!center && !isGeocoding;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Market</h1>
        <p className="text-sm text-muted-foreground">
          We’ll show you to couples near your business address. Travel pricing
          settings coming soon.
        </p>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-destructive">{errorMsg}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runAutofillGeocode()}
              disabled={isGeocoding}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Location selection */}
      <div className="space-y-2">
        <Label>Business location</Label>
        <LocationPicker
          value={formData.marketLocation ?? null}
          onChange={(loc) => {
            setErrorMsg(null);
            updateFormData({
              marketLocation: loc,
              homeBaseLocation: loc
                ? { lat: loc.lat, lng: loc.lng }
                : formData.homeBaseLocation,
              streetAddress: loc?.street ?? formData.streetAddress,
              city: loc?.city ?? formData.city,
              state: loc?.state ?? formData.state,
              zipCode: loc?.postalCode ?? formData.zipCode,
            });
          }}
          placeholder="Search your business location..."
        />
        <p className="text-xs text-muted-foreground">
          Tip: you can edit this later. We’ll use this point as the center of
          your service radius.
        </p>
      </div>

      {/* Map */}
      <div className="relative rounded-xl border overflow-hidden h-64">
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Empty-state overlay */}
        {!center && !isGeocoding && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none bg-background/40">
            Choose a market location to preview your service radius.
          </div>
        )}

        {/* Loading overlay */}
        {(isGeocoding || !isMapReady) && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-background/50">
            {isGeocoding ? "Finding your address…" : "Loading map…"}
          </div>
        )}
      </div>

      {/* Service area mode */}
      <div className="space-y-2">
        <Label>Service area</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as ServiceAreaMode;
            updateFormData({
              serviceAreaMode: next,
              ...(next === "radius" ? {} : { serviceRadiusMiles: 500 }),
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select service area" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="radius">Within a radius</SelectItem>
            <SelectItem value="nationwide">Nationwide (US)</SelectItem>
            <SelectItem value="global">Global</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose a radius for local travel, or select nationwide / global if you
          serve beyond distance limits.
        </p>
      </div>

      {/* Radius slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Service radius</Label>
          <span className="text-sm text-muted-foreground">
            {mode === "radius"
              ? `${radius} miles`
              : mode === "nationwide"
              ? "Nationwide"
              : "Globally"}
          </span>
        </div>
        <Slider
          value={[radius]}
          min={0}
          max={500}
          step={15}
          onValueChange={handleRadiusChange}
          disabled={!center || mode !== "radius"}
        />
        <p className="text-xs text-muted-foreground">
          Adjust in 15-mile increments. (Max 500 miles)
        </p>
      </div>

      {/* Travel fee flag */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-1">
          <p className="font-medium">Do you charge to travel?</p>
          <p className="text-sm text-muted-foreground">
            If yes, customers will be notified.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed}>
          Next
        </Button>
      </div>
    </div>
  );
}
