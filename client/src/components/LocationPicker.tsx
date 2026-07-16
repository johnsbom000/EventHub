import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2, X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LocationButton } from "@/components/ui/LocationButton";
import type { LocationResult } from "@/types/location";

interface LocationPickerProps {
  value?: LocationResult | null;
  onChange: (value: LocationResult | null) => void;
  placeholder?: string;
  className?: string;
  showCurrentLocationButton?: boolean;
  requirePrecise?: boolean;
}

// Display-only: strips county-level segments and trailing country from Nominatim labels.
// The underlying LocationResult.label is never modified — this only affects rendered text.
function formatDisplayLabel(label: string): string {
  const parts = label.split(", ");
  const filtered = parts.filter((part, index) => {
    if (/\b(county|parish|borough|township|district)\b/i.test(part)) return false;
    if (
      index === parts.length - 1 &&
      /^(united states|canada|united kingdom|australia|mexico|france|germany|spain|italy|japan|china|brazil|india)$/i.test(part)
    ) return false;
    return true;
  });
  return filtered.length > 0 ? filtered.join(", ") : label;
}

export function LocationPicker({
  value,
  onChange,
  placeholder = "Search for a location...",
  className,
  showCurrentLocationButton = true,
}: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const biasRef = useRef<{ lat: number; lng: number } | null>(null);

  // Silently read already-granted geolocation to bias search results.
  // Uses navigator.permissions so we never trigger a permission prompt.
  useEffect(() => {
    if (!navigator?.permissions || !navigator?.geolocation) return;
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state !== "granted") return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          biasRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        },
        () => {},
        { maximumAge: 600_000, timeout: 5_000 }
      );
    });
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep input text in sync with selected value
  useEffect(() => {
    if (value) {
      setQuery(formatDisplayLabel(value.label));
    } else {
      setQuery("");
    }
  }, [value?.id]);

  // Debounce user input
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  // Fetch suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      // The input syncs to the selected value's label; searching for it again
      // would just reopen the dropdown over a completed selection.
      if (value && debouncedQuery === formatDisplayLabel(value.label)) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      try {
        setIsLoading(true);
        const bias = biasRef.current;
        const biasParams = bias ? `&bias_lat=${bias.lat}&bias_lng=${bias.lng}` : "";
        const res = await fetch(
          `/api/locations/search?q=${encodeURIComponent(debouncedQuery)}${biasParams}`
        );

        if (!res.ok) throw new Error("Failed to fetch locations");

        const data = await res.json();
        setSuggestions(data || []);
        setIsOpen(hasInteracted);
      } catch (error) {
        console.error("Error fetching locations:", error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchSuggestions();
  }, [debouncedQuery, value?.id]);

  const handleSelect = (location: LocationResult) => {
    onChange(location);
    setQuery(formatDisplayLabel(location.label));
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery("");
    onChange(null);
    inputRef.current?.focus();
  };

  const handleUseMyLocation = async ({
    lat,
    lng,
  }: {
    lat: number;
    lng: number;
  }) => {
    setQuery("Finding your location...");
    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/locations/search?q=${encodeURIComponent(`${lat},${lng}`)}`
      );

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          handleSelect(data[0]);
          return;
        }
      }

      const currentLocation: LocationResult = {
        id: `current-${Date.now()}`,
        label: "Current location",
        lat,
        lng,
      };
      onChange(currentLocation);
      setQuery("Current location");
    } catch (error) {
      console.error("Error getting location:", error);
      setQuery("Unable to get your location");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div className="relative flex items-center">
        <MapPin className="absolute left-3 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setHasInteracted(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value === "") {
              onChange(null);
            }
          }}
          placeholder={placeholder}
          className={cn(
            "h-12 w-full pl-10 text-base",
            showCurrentLocationButton ? "pr-20" : "pr-10"
          )}
          autoComplete="off"
          spellCheck={false}
        />

        {query && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "absolute text-muted-foreground hover:text-foreground",
              showCurrentLocationButton ? "right-12" : "right-3"
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {isLoading ? (
          <Loader2
            className={cn(
              "absolute h-4 w-4 animate-spin text-muted-foreground",
              showCurrentLocationButton ? "right-12" : "right-3"
            )}
          />
        ) : !query ? (
          <ChevronDown
            className={cn(
              "absolute h-4 w-4 text-muted-foreground",
              showCurrentLocationButton ? "right-12" : "right-3"
            )}
          />
        ) : null}

        {showCurrentLocationButton ? (
          <div className="absolute right-2">
            <LocationButton
              onLocationFound={handleUseMyLocation}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
            />
          </div>
        ) : null}
      </div>

      {/* ✅ Suggestions Dropdown */}
      {isOpen && (suggestions.length > 0 || !isLoading) && (
        <div className="absolute z-50 mt-1 w-full rounded-[12px] border border-border bg-popover text-popover-foreground shadow-lg">
          {suggestions.length > 0 ? (
            <ul className="max-h-60 overflow-auto py-1">
              {suggestions.map((item) => (
                <li
                  key={item.id}
                  className="cursor-pointer rounded-[10px] px-4 py-2 text-sm font-sans transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleSelect(item)}
                >
                  {formatDisplayLabel(item.label)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm font-sans text-muted-foreground">
              No matches found. Try just the street address and city, or check
              for typos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
