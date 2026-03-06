import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import type { LocationResult } from "@/types/location";
import { getFreshAccessToken } from "@/lib/authToken";

interface LocationContextValue {
  selectedLocation: LocationResult | null;
  setLocation: (location: LocationResult | null, options?: { persist?: boolean }) => void;
  isLoading: boolean;
  error: string | null;
  refreshFromServer: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

const LOCAL_STORAGE_KEY = "eventhub.selectedLocation";

async function fetchUserLocation(): Promise<LocationResult | null> {
  try {
    const token = await getFreshAccessToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/users/me/location", {
      credentials: "include",
      headers,
    });

    if (res.status === 401) return null;
    if (!res.ok) return null;

    const data = await res.json();
    return data?.location ?? null;
  } catch {
    return null;
  }
}

async function saveUserLocation(location: LocationResult | null): Promise<void> {
  try {
    const token = await getFreshAccessToken();
    if (!token) return;

    await fetch("/api/users/me/location", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ location }),
    });
  } catch {
    // Swallow errors; local storage still keeps last choice
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);

        if (typeof window === "undefined") return;

        const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localRaw) {
          try {
            const parsed = JSON.parse(localRaw) as LocationResult;
            if (!cancelled) {
              setSelectedLocation(parsed);
              setIsLoading(false);
              return;
            }
          } catch {
            // Ignore bad data and fall through to server
          }
        }

        const serverLocation = await fetchUserLocation();
        if (!cancelled) {
          if (serverLocation) {
            setSelectedLocation(serverLocation);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverLocation));
          }
          setIsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError("Failed to load saved location");
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocation = useCallback((location: LocationResult | null, options?: { persist?: boolean }) => {
    setSelectedLocation(location);

    if (typeof window === "undefined") return;

    const persist = options?.persist !== false;
    if (persist) {
      if (location) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(location));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
      void saveUserLocation(location);
    }
  }, []);

  const refreshFromServer = useCallback(async () => {
    const serverLocation = await fetchUserLocation();
    if (serverLocation) {
      setSelectedLocation(serverLocation);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverLocation));
      }
    }
  }, []);

  const value: LocationContextValue = {
    selectedLocation,
    setLocation,
    isLoading,
    error,
    refreshFromServer,
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error("useLocationContext must be used within a LocationProvider");
  }
  return ctx;
}
