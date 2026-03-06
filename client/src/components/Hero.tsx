import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Calendar, Briefcase, Users } from "lucide-react";
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

const LANDING_CATEGORY_KEY = "rentals";
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
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedLocation) {
      setSearchLocation(selectedLocation);
    }
  }, [selectedLocation?.id]);

  const handleSearch = () => {
    const params = new URLSearchParams();

    // Lock landing page browsing to rental listings only
    params.set("category", LANDING_CATEGORY_KEY);

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
    <div className="no-global-scale bg-[#f0eee9] dark:bg-[#1a2530]">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-16 pb-24 sm:px-6 lg:px-4 lg:pt-[5.29rem] lg:pb-[7.935rem]">
        <div className="mx-auto max-w-5xl text-center">
          <h1
            className="text-[clamp(3.24rem,6.93vw,5.78rem)] font-heading font-light leading-[1.05] text-[#2a3a42] dark:text-[#f5f0e8] lg:text-[clamp(4.2895rem,9.1655vw,7.6475rem)]"
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

        <div className="mx-auto mt-12 w-full max-w-[1320px] rounded-[12px] border-[1.5px] border-[rgba(74,106,125,0.2)] bg-[#f5f0e8] p-3 dark:bg-[#22303c] lg:mt-[3.9675rem] lg:rounded-[15.87px] lg:p-[0.8rem]">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-[3.7fr_1.25fr_1.05fr_1.05fr_auto] lg:gap-[0.42rem]">
            <div className="hero-search-location px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[0.84rem] lg:py-[0.55rem]">
              <p className="mb-1 text-[0.81rem] font-sans uppercase tracking-[0.1em] text-[#9aacb4] lg:mb-[0.3306rem] lg:text-[1.1783rem]">Location</p>
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

            <div className="relative px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <p className="mb-1 text-[0.81rem] font-sans uppercase tracking-[0.1em] text-[#9aacb4] lg:mb-[0.3306rem] lg:text-[1.1783rem]">Event Type</p>
              <div className="relative">
                <Briefcase className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aacb4] lg:h-[1.3225rem] lg:w-[1.3225rem]" />
                <Select
                  value={eventType || undefined}
                  onValueChange={(value) =>
                    setEventType(value === "__any_event_type__" ? "" : value)
                  }
                >
                  <SelectTrigger
                    className="h-8 w-full border-0 bg-transparent pl-8 pr-3 text-[1.01rem] font-sans text-[#2a3a42] shadow-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 dark:text-[#f5f0e8] lg:h-[2.645rem] lg:pl-[2.645rem] lg:pr-[0.9919rem] lg:text-[1.3357rem]"
                    data-testid="select-event-type"
                  >
                    <SelectValue placeholder="Wedding, Party..." />
                  </SelectTrigger>
                  <SelectContent>
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

            <div className="relative px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <p className="mb-1 text-[0.81rem] font-sans uppercase tracking-[0.1em] text-[#9aacb4] lg:mb-[0.3306rem] lg:text-[1.1783rem]">Date</p>
              <div className="relative">
                <Calendar className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aacb4] lg:h-[1.3225rem] lg:w-[1.3225rem]" />
                <Input
                  ref={dateInputRef}
                  type="date"
                  value={eventDate}
                  onChange={(e) => {
                    setEventDate(e.target.value);
                    dateInputRef.current?.blur();
                  }}
                  className="h-8 border-0 bg-transparent pl-8 text-[1.01rem] font-sans text-[#2a3a42] shadow-none focus-visible:ring-0 dark:text-[#f5f0e8] lg:h-[2.645rem] lg:pl-[2.645rem] lg:text-[1.3357rem]"
                  data-testid="input-event-date"
                />
              </div>
            </div>

            <div className="px-4 py-2 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <p className="mb-1 text-[0.81rem] font-sans uppercase tracking-[0.1em] text-[#9aacb4] lg:mb-[0.3306rem] lg:text-[1.1783rem]">Category</p>
              <div className="flex h-8 items-center gap-2 lg:h-[2.645rem] lg:gap-[0.6613rem]">
                <Users className="h-4 w-4 shrink-0 text-[#9aacb4] lg:h-[1.3225rem] lg:w-[1.3225rem]" />
                <span className="truncate text-[1.01rem] font-sans text-[#2a3a42] dark:text-[#f5f0e8] lg:text-[1.3357rem]">Rentals</span>
              </div>
            </div>

            <div className="flex items-center justify-end px-3 py-2 lg:px-[0.9919rem] lg:py-[0.6613rem]">
              <Button
                className="h-[54px] w-full max-w-[210px] text-[1.15rem] editorial-search-btn lg:h-[71.415px] lg:max-w-[277.725px] lg:text-[1.5209rem]"
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
