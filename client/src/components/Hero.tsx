import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LocationPicker } from "@/components/LocationPicker";
import { useLocationContext } from "../context/LocationContext";
import type { LocationResult } from "@/types/location";
import { EVENT_TYPE_OPTIONS } from "@/constants/eventTypes";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HeroCategoryPopup,
  type HeroCategorySelection,
  type AvailableSubcategories,
} from "@/components/HeroCategoryPopup";
import { useTranslation } from "react-i18next";

export default function Hero() {
  const { t } = useTranslation();
  const heroRotatingWords = t("hero.rotatingWords", { returnObjects: true }) as string[];
  const [, setLocation] = useLocation();
  const { selectedLocation, setLocation: setGlobalLocation } =
    useLocationContext();

  const [searchLocation, setSearchLocation] = useState<LocationResult | null>(
    null
  );
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [categorySelection, setCategorySelection] =
    useState<HeroCategorySelection | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Fetch available subcategories (only those in active listings)
  const { data: availableSubcategories = {} } = useQuery<AvailableSubcategories>({
    queryKey: ["/api/listings/available-subcategories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/listings/available-subcategories");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (selectedLocation) {
      setSearchLocation(selectedLocation);
    }
  }, [selectedLocation?.id]);

  const handleSearch = () => {
    const params = new URLSearchParams();

    if (categorySelection?.categoryKey) {
      params.set("category", categorySelection.categoryKey);
      if (categorySelection.subcategory)
        params.set("subcategory", categorySelection.subcategory);
      if (categorySelection.subcategoryDetail)
        params.set("subcategoryDetail", categorySelection.subcategoryDetail);
    }

    if (searchLocation) params.set("location", searchLocation.label);
    if (searchLocation?.lat != null && searchLocation?.lng != null) {
      params.set("lat", String(searchLocation.lat));
      params.set("lng", String(searchLocation.lng));
      params.set("sr", "15");
    }
    if (eventDate) params.set("date", eventDate);
    if (eventType) params.set("eventType", eventType);

    setLocation(`/browse?${params.toString()}`);
  };

  // Label shown in the trigger button
  const categoryTriggerLabel = (() => {
    if (!categorySelection) return null;
    if (categorySelection.subcategoryDetail) return categorySelection.subcategoryDetail;
    if (categorySelection.subcategory) return categorySelection.subcategory;
    return categorySelection.categoryLabel;
  })();

  return (
    <div className="hero-section-scale-down bg-[#ffffff] ">
      <div className="mx-auto w-full max-w-[1320px] px-4 pt-16 pb-24 sm:px-6 lg:px-4 lg:pt-[5.29rem] lg:pb-[7.935rem]">
        <div className="mx-auto max-w-5xl text-center">
          <h1
            className="text-[clamp(2.754rem,5.8905vw,4.913rem)] font-heading font-light leading-[1.05] text-[#2a3a42] lg:text-[clamp(3.6461rem,7.7907vw,6.5004rem)]"
            aria-label={t("hero.allInOnePlace")}
            data-testid="text-hero-title"
          >
            <span className="hero-rotating-lockup" aria-hidden="true">
              <span className="hero-rotating-label">Event</span>
              <span className="hero-rotating-word italic text-[#e07a6a]">
                <span className="hero-rotating-word-sizer">{heroRotatingWords[0]}</span>
                <span className="hero-rotating-word-overlay">
                  {heroRotatingWords.map((word, index) => (
                    <span
                      key={index}
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
            {t("hero.allInOnePlace")}
          </h1>


        </div>

        <div className="landing-hero-search-scale-down mx-auto mt-12 w-full max-w-[1320px] rounded-[12px] border-[1.5px] border-[rgba(74,106,125,0.2)] bg-[#ffffff] p-3 lg:mt-[3.9675rem] lg:rounded-[15.87px] lg:p-[0.8rem]">
          <div className="grid grid-cols-1 gap-0 md:grid-cols-[4fr_1.7fr_1.25fr_1.1fr_1.3fr] md:gap-[0.42rem] lg:grid-cols-[4.5fr_1.955fr_1.2fr_1fr_1.345fr]">
            <div className="hero-search-location flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[0.84rem] lg:py-[0.55rem]">
              <LocationPicker
                value={searchLocation}
                onChange={(loc) => {
                  setSearchLocation(loc);
                  if (loc) setGlobalLocation(loc);
                }}
                placeholder={t("hero.search.locationPlaceholder")}
                className="hero-location-field"
                showCurrentLocationButton={false}
              />
            </div>

            <div className="relative flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <div className="relative w-full">
                <Select
                  value={eventType || undefined}
                  onValueChange={(value) =>
                    setEventType(value === "__any_event_type__" ? "" : value)
                  }
                >
                  <SelectTrigger
                    className="h-8 w-full border-0 bg-transparent pl-0 pr-3 !text-[16.75px] font-sans text-[#2a3a42] shadow-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 [&>span]:line-clamp-none [&>span]:whitespace-nowrap lg:h-[2.645rem] lg:pl-0 lg:pr-[0.9919rem] lg:!text-[26.04px]"
                    data-testid="select-event-type"
                  >
                    <SelectValue placeholder={t("hero.search.eventTypePlaceholder")} />
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
                      {t("hero.search.anyEventType")}
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

            <div className="relative flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <div className="relative w-full">
                {!eventDate ? (
                  <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 font-sans text-[16px] text-[#9aacb4] md:hidden">
                    {t("hero.search.datePlaceholder")}
                  </span>
                ) : null}
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aacb4] md:hidden"
                  aria-hidden="true"
                />
                <Input
                  ref={dateInputRef}
                  id="hero-event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => {
                    setEventDate(e.target.value);
                    dateInputRef.current?.blur();
                  }}
                  className="hero-date-field h-8 border-0 bg-transparent pl-0 pr-8 md:pr-0 !text-[16px] font-sans text-[#2a3a42] shadow-none focus-visible:ring-0 lg:h-[2.645rem] lg:pl-0 lg:!text-[25.29px]"
                  aria-label="Event date"
                  data-testid="input-event-date"
                />
              </div>
            </div>

            {/* Category + subcategory cascading popup */}
            <div className="flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] lg:py-[0.6613rem]">
              <HeroCategoryPopup
                value={categorySelection}
                onChange={setCategorySelection}
                available={availableSubcategories}
                placeholder={t("hero.search.categoryPlaceholder")}
                triggerClassName="h-8 w-full text-left truncate !text-[16.75px] font-sans shadow-none lg:h-[2.645rem] lg:!text-[26.04px]"
              />
            </div>

            <div className="flex items-center justify-center px-3 pt-3 pb-2 md:justify-end md:pt-2 lg:px-[0.9919rem] lg:py-[0.6613rem]">
              <Button
                className="h-[54px] w-full max-w-[210px] text-[22px] editorial-search-btn lg:h-[71.415px] lg:max-w-[277.725px] lg:text-[26px]"
                onClick={handleSearch}
                data-testid="button-search"
              >
                {t("hero.search.button")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
