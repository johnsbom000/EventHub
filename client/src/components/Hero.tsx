import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Calendar, Briefcase, Users } from "lucide-react";
import { LocationPicker } from "@/components/LocationPicker";
import { useLocationContext } from "../context/LocationContext";
import type { LocationResult } from "@/types/location";

const LANDING_CATEGORY_KEY = "prop-decor";

const eventTypes = [
  { value: "wedding", label: "Wedding" },
  { value: "corporate", label: "Corporate Event" },
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "baby-shower", label: "Baby Shower" },
  { value: "graduation", label: "Graduation" },
  { value: "conference", label: "Conference" },
  { value: "gala", label: "Gala" },
  { value: "other", label: "Other" },
];

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

    // Lock landing page browsing to Prop & Decor Rentals only
    params.set("category", LANDING_CATEGORY_KEY);

    if (searchLocation) params.set("location", searchLocation.label);
    if (eventDate) params.set("date", eventDate);
    if (eventType) params.set("eventType", eventType);
    
    setLocation(`/browse?${params.toString()}`);
  };

  return (
    <div className="bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
        <h1
          className="sm:text-5xl md:text-6xl font-bold text-center mb-12 text-foreground text-[50px]"
          data-testid="text-hero-title"
        >
          Event Pros, All in One Place
        </h1>

        <div className="bg-white rounded-xl shadow-lg border border-border p-2">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {/* Location */}
            <div className="relative group">
              <LocationPicker
                value={searchLocation}
                onChange={(loc) => {
                  setSearchLocation(loc);
                  if (loc) setGlobalLocation(loc);
                }}
                placeholder="Location"
              />
            </div>

            {/* Event Type */}
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </div>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="h-14 w-full pl-10 pr-3 border-0 bg-transparent hover:bg-muted/50 rounded-lg cursor-pointer focus:outline-none focus:ring-0 appearance-none"
                data-testid="select-event-type"
              >
                <option value="">Event type</option>
                {eventTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Event Date */}
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                ref={dateInputRef}
                type="date"
                value={eventDate}
                onChange={(e) => {
                  setEventDate(e.target.value);
                  dateInputRef.current?.blur();
                }}
                className="h-14 pl-10 border-0 focus-visible:ring-0 hover:bg-muted/50 rounded-lg"
                data-testid="input-event-date"
              />
            </div>

            {/* Category (locked for now) */}
            <div className="relative group">
              <div className="h-14 w-full px-3 flex items-center gap-2 text-left border-0 bg-transparent hover:bg-muted/50 rounded-lg">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground/80 truncate">
                  Prop &amp; Decor Rentals
                    </span>
                  </div>
            </div>
          </div>

          <div className="mt-2">
            <Button 
              className="w-full h-12 text-base"
              onClick={handleSearch}
              data-testid="button-search"
            >
              Search
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}