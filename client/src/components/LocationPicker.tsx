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
}

export function LocationPicker({
  value,
  onChange,
  placeholder = "Search for a location...",
  className,
}: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
      setQuery(value.label);
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

      try {
        setIsLoading(true);
        const res = await fetch(
          `/api/locations/search?q=${encodeURIComponent(debouncedQuery)}`
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
  }, [debouncedQuery]);

  const handleSelect = (location: LocationResult) => {
    onChange(location);
    setQuery(location.label);
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
          className="h-12 pl-10 pr-20 w-full text-base"
          autoComplete="off"
          spellCheck={false}
        />

        {query && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-12 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {isLoading ? (
          <Loader2 className="absolute right-12 h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className="absolute right-12 h-4 w-4 text-muted-foreground" />
        )}

        <div className="absolute right-2">
          <LocationButton
            onLocationFound={handleUseMyLocation}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          />
        </div>
      </div>

      {/* ✅ Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          <ul className="max-h-60 overflow-auto py-1">
            {suggestions.map((item) => (
              <li
                key={item.id}
                className="cursor-pointer px-4 py-2 text-sm hover:bg-muted"
                onClick={() => handleSelect(item)}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
