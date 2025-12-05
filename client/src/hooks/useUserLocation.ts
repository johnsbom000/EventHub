import { useState, useCallback, useEffect } from 'react';

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

type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'error' | 'unsupported';

interface UseUserLocationReturn {
  location: { lat: number; lng: number } | null;
  status: LocationStatus;
  error: GeolocationPositionError | null;
  requestLocation: () => Promise<void>;
  resetLocation: () => void;
}

export function useUserLocation(): UseUserLocationReturn {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [error, setError] = useState<GeolocationPositionError | null>(null);

  // Check for geolocation support
  const isGeolocationSupported = typeof window !== 'undefined' && 'geolocation' in navigator;
  const permissionKey = 'eventhub_location_permission';

  // Load saved permission state on mount
  useEffect(() => {
    if (!isGeolocationSupported) {
      setStatus('unsupported');
      return;
    }

    // Check if we already have a saved permission state
    const savedPermission = localStorage.getItem(permissionKey);
    
    if (savedPermission === 'granted') {
      // If previously granted, we can try to get the location silently
      setStatus('requesting');
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setStatus('granted');
        },
        (error) => {
          // If we can't get the location despite having permission,
          // treat as if permission was denied
          if (error.code === error.PERMISSION_DENIED) {
            setStatus('denied');
            localStorage.setItem(permissionKey, 'denied');
          } else {
            setStatus('error');
          }
          setError(error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 5 * 60 * 1000 } // 5 min cache
      );
    } else if (savedPermission === 'denied') {
      setStatus('denied');
    }
  }, [isGeolocationSupported]);

  const requestLocation = useCallback(async (): Promise<void> => {
    if (!isGeolocationSupported) {
      setStatus('unsupported');
      return;
    }

    // Don't do anything if we already have permission or it was denied
    if (status === 'granted' || status === 'denied') {
      return;
    }

    setStatus('requesting');

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setLocation(newLocation);
          setStatus('granted');
          localStorage.setItem(permissionKey, 'granted');
          resolve();
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setStatus('denied');
            localStorage.setItem(permissionKey, 'denied');
          } else {
            setStatus('error');
          }
          setError(error);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, [isGeolocationSupported, status]);

  const resetLocation = useCallback(() => {
    setLocation(null);
    setStatus('idle');
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
