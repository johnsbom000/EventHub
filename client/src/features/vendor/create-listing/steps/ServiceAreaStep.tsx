import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LocationPicker } from "@/components/LocationPicker";
import type { ListingDraft } from "../wizardTypes";

const MAPBOX_TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ??
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ??
  "";

// GeoJSON circle helper (same as original wizard)
function makeCircleGeoJSON(
  center: { lat: number; lng: number },
  radiusMiles: number,
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const R = 3958.8; // Earth radius in miles
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const d = radiusMiles / R;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 2 * Math.PI) / steps;
    const latP = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing));
    const lngP =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(latP)
      );
    coords.push([(lngP * 180) / Math.PI, (latP * 180) / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

interface ServiceAreaStepProps {
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
  showValidation: boolean;
}

export function ServiceAreaStep({ draft, setDraft, showValidation }: ServiceAreaStepProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const center = useMemo(() => {
    const lat = draft.serviceCenter?.lat ?? draft.serviceLocation?.lat;
    const lng = draft.serviceCenter?.lng ?? draft.serviceLocation?.lng;
    if (lat == null || lng == null) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [draft.serviceCenter, draft.serviceLocation]);

  const hasLocation =
    Boolean(draft.serviceLocation?.label) &&
    Number.isFinite(Number(draft.serviceCenter?.lat)) &&
    Number.isFinite(Number(draft.serviceCenter?.lng)) &&
    Number(draft.serviceRadiusMiles) > 0;

  const staticMapPreviewUrl = useMemo(() => {
    if (!center || !MAPBOX_TOKEN) return null;
    const radiusMiles = Number(draft.serviceRadiusMiles);
    const features: any[] = [];
    if (Number.isFinite(radiusMiles) && radiusMiles > 0) {
      features.push({
        type: "Feature",
        properties: { fill: "#9EDBC0", "fill-opacity": 0.25, stroke: "#2B7A67", "stroke-width": 2 },
        geometry: makeCircleGeoJSON(center, radiusMiles, 36).geometry,
      });
    }
    features.push({
      type: "Feature",
      properties: { "marker-size": "small", "marker-color": "#2B7A67" },
      geometry: { type: "Point", coordinates: [center.lng, center.lat] },
    });
    const geoJson = encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }));
    return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/geojson(${geoJson})/${center.lng},${center.lat},9,0/640x288@2x?access_token=${MAPBOX_TOKEN}`;
  }, [center, draft.serviceRadiusMiles]);

  // Initialize/update mapbox map
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN || !center) return;
    if (!mapRef.current) {
      try {
        mapboxgl.accessToken = MAPBOX_TOKEN;
        mapRef.current = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: "mapbox://styles/mapbox/outdoors-v12",
          center: [center.lng, center.lat],
          zoom: 9,
        });
        mapRef.current.on("load", () => setIsMapReady(true));
        mapRef.current.on("error", () => setMapError("Map failed to load."));
      } catch {
        setMapError("Map failed to initialize.");
      }
      return;
    }
    // Center change is handled by the fitBounds effect below once the map is ready
  }, [center]);

  // Update circle layer and fit map to circle on radius or center change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady || !center) return;
    const circleData = makeCircleGeoJSON(center, Number(draft.serviceRadiusMiles), 64);
    try {
      if (map.getSource("coverage")) {
        (map.getSource("coverage") as mapboxgl.GeoJSONSource).setData(circleData);
      } else {
        map.addSource("coverage", { type: "geojson", data: circleData });
        map.addLayer({ id: "coverage-fill", type: "fill", source: "coverage", paint: { "fill-color": "#9EDBC0", "fill-opacity": 0.25 } });
        map.addLayer({ id: "coverage-line", type: "line", source: "coverage", paint: { "line-color": "#2B7A67", "line-width": 2 } });
      }

      // Fit the map viewport to the circle so the full radius is always visible
      const coords = circleData.geometry.coordinates[0];
      const bounds = coords.reduce(
        (b, [lng, lat]) => b.extend([lng, lat] as [number, number]),
        new mapboxgl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number])
      );
      map.fitBounds(bounds, { padding: 48, duration: 400, maxZoom: 14 });
    } catch {
      // non-blocking
    }
  }, [center, draft.serviceRadiusMiles, isMapReady]);

  return (
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
          {showValidation && !hasLocation ? (
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

          <p className="text-sm text-muted-foreground">
            Use your listing center address as the middle point. You can override your onboarding default per
            listing.
          </p>
        </div>

        <div className="relative h-72 overflow-hidden rounded-xl border border-border">
          {staticMapPreviewUrl && !isMapReady ? (
            <img
              src={staticMapPreviewUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
          ) : null}
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
  );
}
