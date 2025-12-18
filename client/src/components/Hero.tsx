import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Calendar, MapPin, Briefcase, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LocationPicker } from "@/components/LocationPicker";
import { useLocationContext } from "@/context/LocationContext";
import type { LocationResult } from "@/types/location";
import { VENDOR_CATEGORIES } from "../lib/vendorCategories";


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
  const { selectedLocation, setLocation: setGlobalLocation } = useLocationContext();
  const [searchLocation, setSearchLocation] = useState<LocationResult | null>(null);
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const { data: vendorCategories = [] } = useQuery<string[]>({
    queryKey: ["/api/vendors/meta/categories"],
  });

  const toggleVendor = (vendor: string) => {
    setSelectedVendors(prev =>
      prev.includes(vendor) ? prev.filter(v => v !== vendor) : [...prev, vendor]
    );
  };

  useEffect(() => {
    if (selectedLocation) {
      setSearchLocation(selectedLocation);
    }
  }, [selectedLocation?.id]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchLocation) params.set('location', searchLocation.label);
    if (eventType) params.set('eventType', eventType);
    if (eventDate) params.set('date', eventDate);
    if (selectedVendors.length > 0) params.set('categories', selectedVendors.join(','));
    
    setLocation(`/browse?${params.toString()}`);
  };

  return (
    <div className="bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
        <h1 className="sm:text-5xl md:text-6xl font-bold text-center mb-12 text-foreground text-[50px]" data-testid="text-hero-title">Event Pros, All in One Place</h1>

        <div className="bg-white rounded-xl shadow-lg border border-border p-2">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {/* Location */}
            <div className="relative group">
              <LocationPicker
                value={searchLocation}
                onChange={(loc) => {
                  setSearchLocation(loc);
                  if (loc) {
                    setGlobalLocation(loc);
                  }
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

            {/* Vendors Needed */}
            <div className="relative">
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    className="h-14 w-full px-3 flex items-center gap-2 text-left border-0 bg-transparent hover:bg-muted/50 rounded-lg"
                    data-testid="button-vendors-select"
                  >
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">
                      {selectedVendors.length === 0
                        ? "Vendors needed"
                        : `${selectedVendors.length} selected`}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="start">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Select vendor types</h4>

                    {VENDOR_CATEGORIES.map((vendor) => (
                      <div key={vendor} className="flex items-center gap-2">
                        <Checkbox
                          id={vendor}
                          checked={selectedVendors.includes(vendor)}
                          onCheckedChange={(checked) => {
                            if (checked) toggleVendor(vendor);
                            else toggleVendor(vendor);
                          }}
                          data-testid={`checkbox-vendor-${vendor.toLowerCase()}`}
                        />
                        <Label htmlFor={vendor} className="cursor-pointer text-sm">
                          {vendor}
                        </Label>
                      </div>
                    ))}

                    {/* Show unavailable toggle (hybrid pattern) */}
                    <div className="pt-2 border-t">
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showUnavailable}
                          onChange={(e) => setShowUnavailable(e.target.checked)}
                        />
                        Show unavailable
                      </label>
                    </div>
                  </div>

                </PopoverContent>
              </Popover>
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
