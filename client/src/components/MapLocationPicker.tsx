import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";

const MAPBOX_TOKEN =
  (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ??
  (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined) ??
  "";

export interface GeocodedAddress {
  city: string;
  state: string;
  zip: string;
  label: string;
}

interface MapLocationPickerProps {
  value?: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
  onGeocode?: (address: GeocodedAddress) => void;
  className?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<GeocodedAddress | null> {
  if (!MAPBOX_TOKEN) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const feature = json.features?.[0];
    if (!feature) return null;

    const context: Array<{ id: string; text: string; short_code?: string }> = feature.context ?? [];
    const city = context.find((c) => c.id.startsWith("place."))?.text ?? "";
    const regionEntry = context.find((c) => c.id.startsWith("region."));
    const state = regionEntry?.short_code?.replace(/^US-/, "") ?? regionEntry?.text ?? "";
    const zip = context.find((c) => c.id.startsWith("postcode."))?.text ?? "";

    const labelParts = [city, state && zip ? `${state} ${zip}` : state || zip].filter(Boolean);
    const label = labelParts.join(", ") || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    return { city, state, zip, label };
  } catch {
    return null;
  }
}

export function MapLocationPicker({ value, onChange, onGeocode, className }: MapLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const onGeocodeRef = useRef(onGeocode);
  const [mapError, setMapError] = useState<string | null>(null);
  const [hint, setHint] = useState("Click anywhere on the map to drop a pin");

  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { onGeocodeRef.current = onGeocode; });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!MAPBOX_TOKEN) {
      setMapError("Map unavailable — Mapbox token not configured.");
      return;
    }

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: value ? [value.lng, value.lat] : [-98.35, 39.5],
        zoom: value ? 14 : 4,
      });

      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.on("error", () => setMapError("Map failed to load."));

      if (value) {
        markerRef.current = new mapboxgl.Marker({ color: "#e07a6a" })
          .setLngLat([value.lng, value.lat])
          .addTo(map);
        setHint("Drag the pin or click elsewhere to move it");
      }

      map.on("click", (e) => {
        const { lat, lng } = e.lngLat;
        if (markerRef.current) {
          markerRef.current.setLngLat([lng, lat]);
        } else {
          markerRef.current = new mapboxgl.Marker({ color: "#e07a6a" })
            .setLngLat([lng, lat])
            .addTo(map);
        }
        onChangeRef.current({ lat, lng });

        if (onGeocodeRef.current) {
          setHint("Looking up location...");
          reverseGeocode(lat, lng).then((address) => {
            if (address) {
              onGeocodeRef.current!(address);
              setHint(address.label || "Drag the pin or click elsewhere to move it");
            } else {
              setHint("Drag the pin or click elsewhere to move it");
            }
          });
        } else {
          setHint("Drag the pin or click elsewhere to move it");
        }
      });

      mapRef.current = map;
    } catch {
      setMapError("Map failed to initialize.");
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Sync marker when value changes externally
  useEffect(() => {
    if (!mapRef.current || !value) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([value.lng, value.lat]);
    } else {
      markerRef.current = new mapboxgl.Marker({ color: "#e07a6a" })
        .setLngLat([value.lng, value.lat])
        .addTo(mapRef.current);
    }
    mapRef.current.easeTo({ center: [value.lng, value.lat], zoom: Math.max(mapRef.current.getZoom(), 14) });
  }, [value?.lat, value?.lng]);

  if (mapError) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-[10px] border border-border bg-muted text-sm text-muted-foreground">
        {mapError}
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="h-64 w-full rounded-[10px] overflow-hidden border border-border" />
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        {hint}
      </p>
    </div>
  );
}
