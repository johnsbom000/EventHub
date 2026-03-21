import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { LocationPicker } from "@/components/LocationPicker";
import { useLocationContext } from "../context/LocationContext";
import type { LocationResult } from "@/types/location";
import { EVENT_TYPE_OPTIONS } from "@/constants/eventTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LANDING_CATEGORY_KEY = "rentals" as const;
const LANDING_CATEGORY_OPTIONS = [
  { value: "rentals", label: "Rentals" },
  { value: "services", label: "Services" },
  { value: "venues", label: "Venues" },
  { value: "catering", label: "Catering" },
] as const;
type LandingCategoryKey = (typeof LANDING_CATEGORY_OPTIONS)[number]["value"];
const HERO_ROTATING_WORDS = ["Vendors,", "Rentals,", "Venues,", "Pros,"];

export default function Hero() {
  const [, setLocation] = useLocation();
  const { selectedLocation, setLocation: setGlobalLocation } =
    useLocationContext();

  const [searchLocation, setSearchLocation] = useState<LocationResult | null>(
    null
  );
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [category, setCategory] = useState<LandingCategoryKey>(LANDING_CATEGORY_KEY);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedLocation) {
      setSearchLocation(selectedLocation);
    }
  }, [selectedLocation?.id]);

  const handleSearch = () => {
    const params = new URLSearchParams();

    params.set("category", category);

    if (searchLocation) params.set("location", searchLocation.label);
    if (searchLocation?.lat != null && searchLocation?.lng != null) {
      params.set("lat", String(searchLocation.lat));
      params.set("lng", String(searchLocation.lng));
      params.set("sr", "15"); // default search radius miles
    }
    if (eventDate) params.set("date", eventDate);
    if (eventType) params.set("eventType", eventType);
    
    setLocation(`/browse?${params.toString()}`);
  };

  return (
    <div className="no-global-scale bg-[#ffffff] dark:bg-[#1a2530]">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-16 pb-24 sm:px-6 lg:px-4 lg:pt-[5.29rem] lg:pb-[7.935rem]">
        <div className="mx-auto max-w-5xl text-center">
          <h1
            className="text-[clamp(2.754rem,5.8905vw,4.913rem)] font-heading font-light leading-[1.05] text-[#2a3a42] dark:text-[#f5f0e8] lg:text-[clamp(3.6461rem,7.7907vw,6.5004rem)]"
            aria-label="Event Pros, All in One Place."
            data-testid="text-hero-title"
          >
            <span className="hero-rotating-lockup" aria-hidden="true">
              <span className="hero-rotating-label">Event</span>
              <span className="hero-rotating-word italic text-[#e07a6a]">
                <span className="hero-rotating-word-sizer">Vendors,</span>
                <span className="hero-rotating-word-overlay">
                  {HERO_ROTATING_WORDS.map((word, index) => (
                    <span
                      key={word}
                      className="hero-rotating-word-item"
                      style={{ animationDelay: `-${index * 3}s` }}
                    >
                      {word}
                    </span>
                  ))}
                </span>
              </span>
            </span>
            <br />
            All in One Place.
          </h1>

    
        </div>

        <div className="landing-hero-search-scale-down mx-auto mt-12 w-full max-w-[1320px] rounded-[12px] border-[1.5px] border-[rgba(74,106,125,0.2)] bg-[#ffffff] p-3 dark:bg-[#22303c] lg:mt-[3.9675rem] lg:rounded-[15.87px] lg:p-[0.8rem]">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[3fr_1.7fr_1.25fr_1.1fr_1.3fr] md:gap-[0.42rem] lg:grid-cols-[3.4fr_1.955fr_1.2fr_1fr_1.345fr]">
            <div className="hero-search-location flex items-center px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[0.84rem] lg:py-[0.55rem]">
              <LocationPicker
                value={searchLocation}
                onChange={(loc) => {
                  setSearchLocation(loc);
                  if (loc) setGlobalLocation(loc);
                }}
                placeholder="Any city"
                className="hero-location-field"
                showCurrentLocationButton={false}
              />
            </div>

            <div className="relative flex items-center px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <div className="relative w-full">
                <Select
                  value={eventType || undefined}
                  onValueChange={(value) =>
                    setEventType(value === "__any_event_type__" ? "" : value)
                  }
                >
                  <SelectTrigger
                    className="h-8 w-full border-0 bg-transparent pl-0 pr-3 !text-[16.75px] font-sans text-[#2a3a42] shadow-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 dark:text-[#f5f0e8] [&>span]:line-clamp-none [&>span]:whitespace-nowrap lg:h-[2.645rem] lg:pl-0 lg:pr-[0.9919rem] lg:!text-[26.04px]"
                    data-testid="select-event-type"
                  >
                    <SelectValue placeholder="Wedding, Party..." />
                  </SelectTrigger>
                  <SelectContent
                    disablePortal
                    position="popper"
                    side="bottom"
                    align="start"
                    sideOffset={2}
                    avoidCollisions={false}
                    className="z-[80] max-h-[320px] w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]"
                  >
                    <SelectItem value="__any_event_type__">
                      Any event type
                    </SelectItem>
                    {EVENT_TYPE_OPTIONS.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="relative flex items-center px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <div className="relative w-full">
                <Input
                  ref={dateInputRef}
                  type="date"
                  value={eventDate}
                  onChange={(e) => {
                    setEventDate(e.target.value);
                    dateInputRef.current?.blur();
                  }}
                  className="hero-date-field h-8 border-0 bg-transparent pl-0 !text-[16px] font-sans text-[#2a3a42] shadow-none focus-visible:ring-0 dark:text-[#f5f0e8] lg:h-[2.645rem] lg:pl-0 lg:!text-[25.29px]"
                  data-testid="input-event-date"
                />
              </div>
            </div>

            <div className="flex items-center px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <div className="relative w-full">
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as LandingCategoryKey)}
                >
                  <SelectTrigger
                    className="h-8 w-full border-0 bg-transparent pl-0 pr-3 !text-[16.75px] font-sans text-[#2a3a42] shadow-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 dark:text-[#f5f0e8] lg:h-[2.645rem] lg:pl-0 lg:pr-[0.9919rem] lg:!text-[26.04px]"
                    data-testid="select-category"
                  >
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent
                    disablePortal
                    position="popper"
                    side="bottom"
                    align="start"
                    sideOffset={0}
                    avoidCollisions={false}
                    className="z-[80] max-h-[280px] w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] data-[side=bottom]:translate-y-0"
                  >
                    {LANDING_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end px-3 py-2 lg:px-[0.9919rem] lg:py-[0.6613rem]">
              <Button
                className="h-[54px] w-full max-w-[210px] text-[22px] editorial-search-btn lg:h-[71.415px] lg:max-w-[277.725px] lg:text-[26px]"
                onClick={handleSearch}
                data-testid="button-search"
              >
                Search
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
