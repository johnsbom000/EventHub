import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LocationPicker } from "@/components/LocationPicker";
import type { LocationResult } from "@/types/location";
import type { ListingDraft } from "../wizardTypes";

const MAPBOX_TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ??
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ??
  "";

function isServiceLocationExact(loc: LocationResult | null | undefined): boolean {
  if (!loc) return false;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return false;
  if (!loc.placeType) return true;
  return loc.placeType === "address" || loc.placeType === "poi" || loc.placeType === "pin";
}

function parseAddressFromLabel(label: string): {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
} {
  const parts = label.split(",").map((p) => p.trim());
  if (parts.length < 2) return { streetAddress: "", city: "", state: "", zipCode: "" };
  const streetAddress = parts[0] ?? "";
  const city = parts[1] ?? "";
  const stateZip = parts[2] ?? "";
  const stateZipMatch = stateZip.match(/^([A-Za-z ]+)\s+(\d{5}(?:-\d{4})?)?$/);
  const state = stateZipMatch?.[1]?.trim() ?? stateZip;
  const zipCode = stateZipMatch?.[2]?.trim() ?? "";
  return { streetAddress, city, state, zipCode };
}

// GeoJSON circle helper
function makeCircleGeoJSON(
  center: { lat: number; lng: number },
  radiusMiles: number,
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const R = 3958.8;
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
    (Boolean(draft.serviceStreetAddress?.trim()) || isServiceLocationExact(draft.serviceLocation)) &&
    Number.isFinite(Number(draft.serviceCenter?.lat)) &&
    Number.isFinite(Number(draft.serviceCenter?.lng)) &&
    Number(draft.serviceRadiusMiles) > 0;


  // Initialize/update mapbox map
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN || !center) return;
    if (mapRef.current) return;

    let loadTimeoutId: number | null = null;

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [center.lng, center.lat],
        zoom: 9,
      });
      mapRef.current = map;

      map.on("load", () => {
        if (loadTimeoutId !== null) window.clearTimeout(loadTimeoutId);
        setIsMapReady(true);
        requestAnimationFrame(() => { try { map.resize(); } catch { /* no-op */ } });
      });

      // Only show error if the map genuinely fails to load its style within 5s.
      // Individual tile errors are non-fatal and should not surface to the user.
      loadTimeoutId = window.setTimeout(() => {
        if (!map.isStyleLoaded()) setMapError("Map failed to load. Check your connection and try again.");
      }, 5000);
    } catch {
      setMapError("Map failed to initialize.");
    }

    return () => {
      if (loadTimeoutId !== null) window.clearTimeout(loadTimeoutId);
      try { mapRef.current?.remove(); } catch { /* no-op */ }
      mapRef.current = null;
      setIsMapReady(false);
    };
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

  const showAddressFields =
    Boolean(draft.serviceLocation) ||
    Boolean(draft.serviceStreetAddress) ||
    Boolean(draft.serviceCity) ||
    Boolean(draft.serviceState) ||
    Boolean(draft.serviceZip);

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Service Area</h1>
        <p className="text-base text-muted-foreground">
          Set the area you're willing to serve for this listing. This is what customers search within.
          Whether you take events beyond it — and any travel or delivery fee — is set on the Logistics step.
        </p>
      </header>

      <Card className="space-y-6 p-6">
        <div className="space-y-2">
          <Label className="text-base font-semibold">Listing center address</Label>
          <LocationPicker
            value={draft.serviceLocation}
            placeholder="Search listing service center"
            requirePrecise
            onChange={(location) => {
              setMapError(null);
              if (!location) {
                setDraft((prev) => ({
                  ...prev,
                  serviceLocation: null,
                  serviceStreetAddress: "",
                  serviceCity: "",
                  serviceState: "",
                  serviceZip: "",
                }));
                return;
              }
              const normalizedLocation: LocationResult = {
                ...location,
                country:
                  typeof (location as any)?.country === "string" &&
                  String((location as any).country).trim().length > 0
                    ? (location as any).country
                    : "United States",
              };
              const label = location.label || (location as any).place_name || "";
              const parsed = parseAddressFromLabel(label);
              const isExact = isServiceLocationExact(location);
              setDraft((prev) => ({
                ...prev,
                serviceLocation: normalizedLocation,
                serviceCenter: { lat: normalizedLocation.lat, lng: normalizedLocation.lng },
                serviceStreetAddress: isExact ? (parsed.streetAddress || "") : "",
                serviceCity: (location as any).city || parsed.city || "",
                serviceState: (location as any).state || parsed.state || "",
                serviceZip: (location as any).postalCode || parsed.zipCode || "",
              }));
            }}
          />

          {showAddressFields ? (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Street address <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={draft.serviceStreetAddress}
                  onChange={(e) => setDraft((prev) => ({ ...prev, serviceStreetAddress: e.target.value }))}
                  placeholder="e.g. 123 Main St"
                  className={`h-10 ${showValidation && !draft.serviceStreetAddress.trim() ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {showValidation && !draft.serviceStreetAddress.trim() ? (
                  <p className="text-sm text-destructive">Street address is required.</p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">City</Label>
                  <Input
                    value={draft.serviceCity}
                    onChange={(e) => setDraft((prev) => ({ ...prev, serviceCity: e.target.value }))}
                    placeholder="City"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">State</Label>
                  <Input
                    value={draft.serviceState}
                    onChange={(e) => setDraft((prev) => ({ ...prev, serviceState: e.target.value }))}
                    placeholder="State"
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">ZIP code</Label>
                <Input
                  value={draft.serviceZip}
                  onChange={(e) => setDraft((prev) => ({ ...prev, serviceZip: e.target.value }))}
                  placeholder="ZIP"
                  className="h-10"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select a specific address above to auto-fill, or drop a pin on the map for outdoor locations.
            </p>
          )}

          {showValidation && !hasLocation ? (
            <p className="text-sm text-destructive">
              A specific street address (or pinned location) and radius are required to continue.
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
