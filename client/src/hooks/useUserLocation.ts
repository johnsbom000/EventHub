import { useState, useCallback, useEffect } from "react";

interface Position {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number | null;
    altitudeAccuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
  };
  timestamp: number;
}

type LocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "error"
  | "unsupported";

interface UseUserLocationReturn {
  location: { lat: number; lng: number } | null;
  status: LocationStatus;
  error: GeolocationPositionError | null;
  requestLocation: () => Promise<void>;
  resetLocation: () => void;
}

export function useUserLocation(): UseUserLocationReturn {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [error, setError] = useState<GeolocationPositionError | null>(null);

  const isGeolocationSupported =
    typeof window !== "undefined" && "geolocation" in navigator;
  const permissionKey = "eventhub_location_permission";

  // On mount, just detect support + remembered "denied" state.
  // Do NOT call navigator.geolocation here → no popup on refresh.
  useEffect(() => {
    if (!isGeolocationSupported) {
      setStatus("unsupported");
      return;
    }

    const savedPermission = localStorage.getItem(permissionKey);

    if (savedPermission === "denied") {
      setStatus("denied");
    } else {
      // either "granted" or nothing; we stay idle until user clicks
      setStatus("idle");
    }
  }, [isGeolocationSupported]);

  const requestLocation = useCallback(async (): Promise<void> => {
    if (!isGeolocationSupported) {
      setStatus("unsupported");
      return;
    }

    // Avoid overlapping requests
    if (status === "requesting") return;

    setStatus("requesting");
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setLocation(newLocation);
          setStatus("granted");
          localStorage.setItem(permissionKey, "granted");
          resolve();
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus("denied");
            localStorage.setItem(permissionKey, "denied");
          } else {
            setStatus("error");
          }
          setError(err);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, [isGeolocationSupported, status]);

  const resetLocation = useCallback(() => {
    setLocation(null);
    setStatus("idle");
    setError(null);
    localStorage.removeItem(permissionKey);
  }, []);

  return {
    location,
    status,
    error,
    requestLocation,
    resetLocation,
  };
}
