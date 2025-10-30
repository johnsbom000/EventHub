import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useLocation } from "wouter";
import { Calendar, MapPin, Briefcase, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const vendorTypes = [
  "Photographer",
  "Venue",
  "Florist",
  "DJ",
  "Catering",
  "Prop Rentals",
  "Event Planner",
  "Decor",
];

const eventTypes = [
  { value: "wedding", label: "Wedding" },
  { value: "corporate", label: "Corporate Event" },
  { value: "party", label: "Party" },
  { value: "other", label: "Other" },
];

export default function Hero() {
  const [, setLocation] = useLocation();
  const [searchLocation, setSearchLocation] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);

  const toggleVendor = (vendor: string) => {
    setSelectedVendors(prev =>
      prev.includes(vendor) ? prev.filter(v => v !== vendor) : [...prev, vendor]
    );
  };

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchLocation) params.set('location', searchLocation);
    if (eventType) params.set('eventType', eventType);
    if (eventDate) params.set('date', eventDate);
    if (selectedVendors.length > 0) params.set('categories', selectedVendors.join(','));
    
    setLocation(`/browse?${params.toString()}`);
  };

  return (
    <div className="bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center mb-12 text-foreground" data-testid="text-hero-title">
          Find event vendors for any occasion
        </h1>

        <div className="bg-white rounded-xl shadow-lg border border-border p-2">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {/* Location */}
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                placeholder="Location"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                className="h-14 pl-10 border-0 focus-visible:ring-0 hover:bg-muted/50 rounded-lg"
                data-testid="input-location"
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
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
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
                    {vendorTypes.map((vendor) => (
                      <div key={vendor} className="flex items-center gap-2">
                        <Checkbox
                          id={vendor}
                          checked={selectedVendors.includes(vendor)}
                          onCheckedChange={() => toggleVendor(vendor)}
                          data-testid={`checkbox-vendor-${vendor.toLowerCase()}`}
                        />
                        <Label htmlFor={vendor} className="cursor-pointer text-sm">
                          {vendor}
                        </Label>
                      </div>
                    ))}
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
