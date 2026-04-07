import MasonryListingGrid from "@/components/MasonryListingGrid";
import ListingCard from "@/components/ListingCard";
import type { ListingPublic } from "@/types/listing";
import { useState, useEffect, useMemo, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Search, SlidersHorizontal } from "lucide-react";
import { POPULAR_FOR_OPTIONS } from "@/constants/eventTypes";
import { getListingDisplayPrice } from "@/lib/listingPrice";

type SortBy = "recommended" | "price-asc" | "price-desc";
type BrowseCategoryKey = "rentals" | "services" | "venues" | "catering";

type ListingBusinessHour = {
  day?: string;
  enabled?: boolean;
  timeRanges?: Array<{ start?: string; end?: string }>;
};

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const TAG_PILL_GRADIENT_THEMES = [
  "border-[rgba(74,106,125,0.24)] bg-gradient-to-r from-[#f5f0e8] to-[#e8f2ef] text-[#2a3a42]",
  "border-[rgba(74,106,125,0.24)] bg-gradient-to-r from-[#f2eee6] to-[#e4edf2] text-[#2a3a42]",
  "border-[rgba(74,106,125,0.24)] bg-gradient-to-r from-[#f5eee3] to-[#eadbc4] text-[#2a3a42]",
  "border-[rgba(74,106,125,0.24)] bg-gradient-to-r from-[#ece5da] to-[#f5f0e8] text-[#2a3a42]",
] as const;

const TAG_PILL_ACTIVE_GRADIENT_THEMES = [
  "border-[#c98872] bg-gradient-to-r from-[#e07a6a] to-[#c9a06a] text-[#f5f0e8]",
  "border-[#4a6a7d] bg-gradient-to-r from-[#4a6a7d] to-[#88bdb4] text-[#f5f0e8]",
  "border-[#5d8999] bg-gradient-to-r from-[#9dd4cc] to-[#4a6a7d] text-[#f5f0e8]",
  "border-[#b98956] bg-gradient-to-r from-[#c9a06a] to-[#e07a6a] text-[#f5f0e8]",
] as const;

const parseCategoryParam = (value: string | null): BrowseCategoryKey | "" => {
  const normalized = normalizeText(value).replace(/[^a-z]/g, "");
  if (normalized.includes("rental")) return "rentals";
  if (normalized.includes("service")) return "services";
  if (normalized.includes("venue")) return "venues";
  if (normalized.includes("cater")) return "catering";
  return "";
};

const parseCsvParam = (value: string | null): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const parseOptionalNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBooleanParam = (value: string | null) => {
  const raw = normalizeText(value);
  return raw === "1" || raw === "true" || raw === "yes";
};

const parseBooleanLike = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return null;
};

const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((a, b) =>
    a.localeCompare(b)
  );

const toIdToken = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, "-");

const getListingTitle = (listing: ListingPublic) => {
  const listingAny = listing as any;
  return (
    listingAny?.title ??
    listingAny?.listingData?.listingTitle ??
    listing.serviceType ??
    ""
  );
};

const getListingCategoryKey = (listing: ListingPublic): BrowseCategoryKey | "" => {
  const listingAny = listing as any;
  const rawCategory =
    listingAny?.category ??
    listingAny?.listingData?.category ??
    listingAny?.listingData?.serviceType ??
    listing.serviceType ??
    "";

  return parseCategoryParam(String(rawCategory));
};

const getListingPrice = (listing: ListingPublic): number | null => getListingDisplayPrice(listing);

const getMinOfferingPrice = (listing: ListingPublic) => {
  const price = getListingPrice(listing);
  return price == null ? Number.POSITIVE_INFINITY : price;
};

const getListingLocation = (listing: ListingPublic) => {
  const listingAny = listing as any;
  return (
    listingAny?.listingServiceCenterLabel ??
    listingAny?.listingData?.serviceLocation?.label ??
    listingAny?.listingData?.serviceAddress ??
    listing.city ??
    ""
  );
};

const getListingDeliveryIncluded = (listing: ListingPublic) => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};
  return (
    parseBooleanLike(listingAny?.deliveryOffered) ??
    parseBooleanLike(
      listingData?.deliverySetup?.deliveryIncluded ??
      listingData?.deliveryIncluded ??
      listingData?.logistics?.deliveryIncluded
    ) ??
    false
  );
};

const getListingSetupIncluded = (listing: ListingPublic) => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};
  return (
    parseBooleanLike(listingAny?.setupOffered) ??
    parseBooleanLike(
      listingData?.deliverySetup?.setupIncluded ??
      listingData?.setupIncluded ??
      listingData?.logistics?.setupIncluded
    ) ??
    false
  );
};

const getListingTags = (listing: ListingPublic): string[] => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};
  const next: string[] = [];

  if (Array.isArray(listingAny?.tags)) {
    for (const tag of listingAny.tags) {
      if (typeof tag === "string" && tag.trim().length > 0) next.push(tag.trim());
    }
  }

  if (Array.isArray(listingData?.tags)) {
    for (const tag of listingData.tags) {
      if (typeof tag === "string" && tag.trim().length > 0) next.push(tag.trim());
    }
  }

  if (listingData?.tagsByPropType && typeof listingData.tagsByPropType === "object") {
    for (const value of Object.values(listingData.tagsByPropType)) {
      if (!Array.isArray(value)) continue;
      for (const rawTag of value) {
        if (typeof rawTag === "string" && rawTag.trim().length > 0) {
          next.push(rawTag.trim());
          continue;
        }
        if (rawTag && typeof rawTag === "object" && typeof (rawTag as any).label === "string") {
          const label = (rawTag as any).label.trim();
          if (label.length > 0) next.push(label);
        }
      }
    }
  }

  return uniqueSorted(next);
};

const getListingBestFor = (listing: ListingPublic): string[] => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};
  const source = Array.isArray(listingAny?.popularFor)
    ? listingAny.popularFor
    : Array.isArray(listingData?.popularFor)
      ? listingData.popularFor
    : Array.isArray(listingData?.bestFor)
      ? listingData.bestFor
      : [];

  return uniqueSorted(
    source
      .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
      .filter((value: string) => value.length > 0)
  );
};

const getListingBusinessHours = (listing: ListingPublic): ListingBusinessHour[] => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};

  const hours = Array.isArray(listingData?.businessHours)
    ? listingData.businessHours
    : Array.isArray(listingAny?.businessHours)
      ? listingAny.businessHours
      : [];

  return hours as ListingBusinessHour[];
};

const isListingAvailableOnDate = (listing: ListingPublic, dateValue: string) => {
  if (!dateValue) return true;
  const asDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(asDate.getTime())) return true;

  const hours = getListingBusinessHours(listing);
  if (hours.length === 0) {
    // If no hours data exists, do not hard-filter out the listing for MVP.
    return true;
  }

  const dayName = asDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const matchingDay = hours.find((hour) => normalizeText(hour.day) === dayName);
  if (!matchingDay) return false;
  if (matchingDay.enabled === false) return false;
  return true;
};

const milesBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default function BrowseVendors() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const hydratedFromUrlRef = useRef(false);
  const browseSurfaceClass = "bg-[#ffffff] dark:bg-background";
  const browseInputClass =
    "bg-[#efefef] text-[#2a3a42] placeholder:text-[#8fa2ad] border-[rgba(74,106,125,0.24)] dark:bg-[hsl(var(--card))] dark:text-[#f5f0e8] dark:placeholder:text-[#9aacb4] dark:border-[hsl(var(--card-border))]";
  const browseFilterLabelClass = "!text-[11.5px]";

  const [showFilters, setShowFilters] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<BrowseCategoryKey | "">("");
  const [sortBy, setSortBy] = useState<SortBy>("recommended");
  const [locationQuery, setLocationQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [deliveryIncludedOnly, setDeliveryIncludedOnly] = useState(false);
  const [setupIncludedOnly, setSetupIncludedOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [selectedBestFor, setSelectedBestFor] = useState<string[]>([]);

  const [searchLat, setSearchLat] = useState<number | null>(null);
  const [searchLng, setSearchLng] = useState<number | null>(null);
  const [searchRadiusMiles, setSearchRadiusMiles] = useState<number>(15);
  const [searchLocationLabel, setSearchLocationLabel] = useState<string>("");

  const { data: publicListings = [], isLoading } = useQuery<ListingPublic[]>({
    queryKey: ["/api/listings/public"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/listings/public");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const availableTags = useMemo(
    () => uniqueSorted(publicListings.flatMap((listing) => getListingTags(listing))),
    [publicListings]
  );

  const availableBestFor = useMemo(
    () => {
      const ordered = uniqueSorted([
        ...POPULAR_FOR_OPTIONS,
        ...publicListings.flatMap((listing) => getListingBestFor(listing)),
      ]);
      return ordered
        .filter((eventType) => normalizeText(eventType) !== "other")
        .concat(ordered.filter((eventType) => normalizeText(eventType) === "other"));
    },
    [publicListings]
  );

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const sortParam = params.get("sort");
    const parsedSort: SortBy =
      sortParam === "price-asc" || sortParam === "price-desc" || sortParam === "recommended"
        ? sortParam
        : "recommended";

    const locationParam = (params.get("location") ?? "").trim();
    const eventTypeParam = (params.get("eventType") ?? "").trim();
    const categoryParam = parseCategoryParam(params.get("category"));
    const bestForParam = parseCsvParam(params.get("bestFor"));
    const mergedBestFor = uniqueSorted(
      bestForParam.length > 0 ? bestForParam : eventTypeParam ? [eventTypeParam] : []
    );

    setSearchQuery((params.get("q") ?? "").trim());
    setSelectedCategory(categoryParam);
    setSortBy(parsedSort);
    setLocationQuery(locationParam);
    setMinPrice((params.get("minPrice") ?? "").trim());
    setMaxPrice((params.get("maxPrice") ?? "").trim());
    setDeliveryIncludedOnly(parseBooleanParam(params.get("delivery")));
    setSetupIncludedOnly(parseBooleanParam(params.get("setup")));
    setSelectedTags(uniqueSorted(parseCsvParam(params.get("tags"))));
    setAvailabilityDate((params.get("availabilityDate") ?? params.get("date") ?? "").trim());
    setSelectedBestFor(mergedBestFor);

    const nextLat = parseOptionalNumber(params.get("lat"));
    const nextLng = parseOptionalNumber(params.get("lng"));
    const nextRadius = parseOptionalNumber(params.get("sr"));
    setSearchLat(nextLat);
    setSearchLng(nextLng);
    setSearchRadiusMiles(nextRadius != null && nextRadius > 0 ? nextRadius : 15);
    setSearchLocationLabel(locationParam);

    hydratedFromUrlRef.current = true;
  }, [searchString]);

  useEffect(() => {
    if (!hydratedFromUrlRef.current) return;

    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (selectedCategory) params.set("category", selectedCategory);
    if (sortBy !== "recommended") params.set("sort", sortBy);
    if (locationQuery.trim()) params.set("location", locationQuery.trim());
    if (minPrice.trim()) params.set("minPrice", minPrice.trim());
    if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
    if (deliveryIncludedOnly) params.set("delivery", "1");
    if (setupIncludedOnly) params.set("setup", "1");
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    if (availabilityDate) params.set("availabilityDate", availabilityDate);
    if (selectedBestFor.length > 0) params.set("bestFor", selectedBestFor.join(","));
    if (searchLat != null && searchLng != null) {
      params.set("lat", String(searchLat));
      params.set("lng", String(searchLng));
      if (Number.isFinite(searchRadiusMiles) && searchRadiusMiles > 0) {
        params.set("sr", String(searchRadiusMiles));
      }
    }

    const nextQuery = params.toString();
    const currentQuery = searchString.startsWith("?") ? searchString.slice(1) : searchString;
    if (nextQuery === currentQuery) return;

    setLocation(nextQuery ? `/browse?${nextQuery}` : "/browse", { replace: true });
  }, [
    searchQuery,
    selectedCategory,
    sortBy,
    locationQuery,
    minPrice,
    maxPrice,
    deliveryIncludedOnly,
    setupIncludedOnly,
    selectedTags,
    availabilityDate,
    selectedBestFor,
    searchLat,
    searchLng,
    searchRadiusMiles,
    searchString,
    setLocation,
  ]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        searchQuery.trim() ||
          selectedCategory ||
          sortBy !== "recommended" ||
          locationQuery.trim() ||
          minPrice.trim() ||
          maxPrice.trim() ||
          deliveryIncludedOnly ||
          setupIncludedOnly ||
          selectedTags.length > 0 ||
          availabilityDate ||
          selectedBestFor.length > 0 ||
          searchLat != null ||
          searchLng != null
      ),
    [
      searchQuery,
      selectedCategory,
      sortBy,
      locationQuery,
      minPrice,
      maxPrice,
      deliveryIncludedOnly,
      setupIncludedOnly,
      selectedTags,
      availabilityDate,
      selectedBestFor,
      searchLat,
      searchLng,
    ]
  );

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("");
    setSortBy("recommended");
    setLocationQuery("");
    setMinPrice("");
    setMaxPrice("");
    setDeliveryIncludedOnly(false);
    setSetupIncludedOnly(false);
    setSelectedTags([]);
    setAvailabilityDate("");
    setSelectedBestFor([]);
    setSearchLat(null);
    setSearchLng(null);
    setSearchRadiusMiles(15);
    setSearchLocationLabel("");
    setLocation("/browse", { replace: true });
  };

  const toggleTagSelection = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((value) => value !== tag) : uniqueSorted([...prev, tag])
    );
  };

  const filteredListings = useMemo(() => {
    let filtered = [...publicListings];
    const normalizedQuery = normalizeText(searchQuery);
    const normalizedLocation = normalizeText(locationQuery);
    const minPriceNumber = parseOptionalNumber(minPrice);
    const maxPriceNumber = parseOptionalNumber(maxPrice);
    const normalizedSelectedTags = selectedTags.map((tag) => normalizeText(tag));
    const normalizedSelectedBestFor = selectedBestFor.map((eventType) => normalizeText(eventType));

    filtered = filtered.filter((listing) => getListingPrice(listing) != null);

    if (selectedCategory) {
      filtered = filtered.filter((listing) => getListingCategoryKey(listing) === selectedCategory);
    }

    if (normalizedQuery) {
      filtered = filtered.filter((listing) => normalizeText(getListingTitle(listing)).includes(normalizedQuery));
    }

    if (normalizedLocation) {
      filtered = filtered.filter((listing) =>
        normalizeText(`${getListingLocation(listing)} ${listing.city ?? ""}`).includes(normalizedLocation)
      );
    }

    if (minPriceNumber != null || maxPriceNumber != null) {
      filtered = filtered.filter((listing) => {
        const price = getListingPrice(listing);
        if (price == null) return false;
        if (minPriceNumber != null && price < minPriceNumber) return false;
        if (maxPriceNumber != null && price > maxPriceNumber) return false;
        return true;
      });
    }

    if (deliveryIncludedOnly) {
      filtered = filtered.filter((listing) => getListingDeliveryIncluded(listing));
    }

    if (setupIncludedOnly) {
      filtered = filtered.filter((listing) => getListingSetupIncluded(listing));
    }

    if (normalizedSelectedTags.length > 0) {
      filtered = filtered.filter((listing) => {
        const listingTags = getListingTags(listing).map((tag) => normalizeText(tag));
        return normalizedSelectedTags.some((tag) => listingTags.includes(tag));
      });
    }

    if (availabilityDate) {
      filtered = filtered.filter((listing) => isListingAvailableOnDate(listing, availabilityDate));
    }

    if (normalizedSelectedBestFor.length > 0) {
      filtered = filtered.filter((listing) => {
        const listingBestFor = getListingBestFor(listing).map((eventType) => normalizeText(eventType));
        return normalizedSelectedBestFor.some((eventType) => listingBestFor.includes(eventType));
      });
    }

    // Radius / service area filtering (listing-specific), if lat/lng was passed in query.
    if (searchLat != null && searchLng != null) {
      filtered = filtered.filter((listing) => {
        const listingAny = listing as any;
        const listingData = listingAny?.listingData || {};
        const mode =
          listingAny?.serviceAreaMode ??
          listingData?.deliverySetup?.serviceAreaMode ??
          listingData?.serviceAreaMode;

        // Global listings always visible if country matches.
        if (mode === "nationwide") {
          const searchLabel = searchLocationLabel.toLowerCase();
          const searchCountry = searchLabel.split(",").pop()?.trim();

          let listingCountry = listingData?.serviceLocation?.label
            ? String(listingData.serviceLocation.label).toLowerCase().split(",").pop()?.trim()
            : null;

          if (!listingCountry && listing.city) {
            listingCountry = "united states";
          }

          return Boolean(listingCountry && searchCountry && listingCountry === searchCountry);
        }

        if (mode === "radius") {
          const center = {
            lat:
              listingAny?.listingServiceCenterLat ??
              listingData?.deliverySetup?.serviceCenter?.lat ??
              listingData?.serviceCenter?.lat,
            lng:
              listingAny?.listingServiceCenterLng ??
              listingData?.deliverySetup?.serviceCenter?.lng ??
              listingData?.serviceCenter?.lng,
          };
          const listingRadius = Number(
            listingAny?.serviceRadiusMiles ??
            listingData?.deliverySetup?.serviceRadiusMiles ??
            listingData?.serviceRadiusMiles ??
            0
          );
          if (center?.lat == null || center?.lng == null || !Number.isFinite(listingRadius)) return false;

          const distance = milesBetween(searchLat, searchLng, Number(center.lat), Number(center.lng));
          return distance <= listingRadius + searchRadiusMiles;
        }

        // Unknown mode: keep listing visible so MVP filtering remains forgiving.
        return true;
      });
    }

    const sorted = [...filtered];
    if (sortBy === "price-asc") {
      sorted.sort((a, b) => getMinOfferingPrice(a) - getMinOfferingPrice(b));
    } else if (sortBy === "price-desc") {
      sorted.sort((a, b) => getMinOfferingPrice(b) - getMinOfferingPrice(a));
    }

    return sorted;
  }, [
    publicListings,
    searchQuery,
    selectedCategory,
    locationQuery,
    minPrice,
    maxPrice,
    deliveryIncludedOnly,
    setupIncludedOnly,
    selectedTags,
    availabilityDate,
    selectedBestFor,
    searchLat,
    searchLng,
    searchRadiusMiles,
    searchLocationLabel,
    sortBy,
  ]);

  const browseSearchBarContent = (
    <div className="relative">
      <Input
        placeholder="Search listings..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={`${browseInputClass} h-[56px] pr-12 text-[1.725rem] leading-none placeholder:text-[1.725rem]`}
        data-testid="input-search"
      />
      <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
    </div>
  );

  const browseHeaderContent = (
    <div className={`${browseSurfaceClass} pt-4 pb-8`}>
      <div className="w-full px-4 sm:px-6 lg:px-12">
        <div className="md:hidden mb-4">
          {browseSearchBarContent}
        </div>

        {availableTags.length > 0 && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={[
                "flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border transition-colors",
                showFilters
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-[rgba(74,106,125,0.24)] bg-[#f5f0e8] text-[#2a3a42] hover:bg-white dark:border-[hsl(var(--card-border))] dark:bg-[hsl(var(--card))] dark:text-[#f5f0e8] dark:hover:bg-[hsl(var(--card)/0.9)]",
              ].join(" ")}
              data-testid="pill-filter-toggle"
              aria-label="Toggle filters panel"
              aria-pressed={showFilters}
            >
              <SlidersHorizontal className="h-8 w-8" />
            </button>

            <div className="scrollbar-hidden flex-1 overflow-x-auto">
              <div className="flex gap-2.5">
                {availableTags.map((tag, index) => {
                  const selected = selectedTags.includes(tag);
                  const gradientClass = selected
                    ? TAG_PILL_ACTIVE_GRADIENT_THEMES[index % TAG_PILL_ACTIVE_GRADIENT_THEMES.length]
                    : TAG_PILL_GRADIENT_THEMES[index % TAG_PILL_GRADIENT_THEMES.length];
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTagSelection(tag)}
                      className={[
                        "inline-flex h-[58px] shrink-0 items-center rounded-full border px-9 text-[1.575rem] font-medium leading-none transition-colors",
                        gradientClass,
                        selected ? "shadow-[0_3px_10px_rgba(74,106,125,0.18)]" : "hover:brightness-[1.02]",
                      ].join(" ")}
                      data-testid={`pill-tag-${toIdToken(tag)}`}
                      aria-pressed={selected}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col ${browseSurfaceClass}`}>
      <Navigation
        showBottomBorder={false}
        middleContent={<div className="hidden md:block">{browseSearchBarContent}</div>}
        headerContent={browseHeaderContent}
        surfaceClassName={browseSurfaceClass}
      />

      <main className={`flex-1 ${browseSurfaceClass}`}>
        <div className="w-full px-4 sm:px-6 lg:px-12 py-8">
          <div className={`flex flex-col gap-6 lg:flex-row ${showFilters ? "lg:gap-8" : "lg:gap-0"}`}>
            <aside
              className={[
                "overflow-hidden transition-all duration-300 ease-out",
                showFilters
                  ? "max-h-[2400px] opacity-100 lg:w-[320px] lg:shrink-0"
                  : "max-h-0 opacity-0 lg:w-0 lg:opacity-0",
              ].join(" ")}
            >
              <div className="space-y-8 lg:sticky lg:top-0 text-[#2a3a42] dark:text-[#f5f0e8]">
                {/* Mobile close button at top of filter panel */}
                <div className="flex items-center justify-between lg:hidden">
                  <span className="text-[18px] font-heading text-[#2a3a42] dark:text-[#f5f0e8]">Filters</span>
                  <button
                    type="button"
                    onClick={() => setShowFilters(false)}
                    className="rounded-full border border-[rgba(74,106,125,0.24)] px-4 py-1.5 text-sm font-medium text-[#2a3a42] dark:text-[#f5f0e8]"
                  >
                    Close
                  </button>
                </div>

                <section className="space-y-3">
                  <h2 className="text-[20px] font-heading">Sort</h2>
                  <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                    <SelectTrigger className={`w-full ${browseInputClass}`} data-testid="select-sort">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="price-asc">Price: Low to High</SelectItem>
                      <SelectItem value="price-desc">Price: High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                </section>

                <section className="space-y-6">
                  <h2 className="text-[20px] font-heading">Filters</h2>
                    <div className="space-y-2">
                      <Label htmlFor="filter-location" className={browseFilterLabelClass}>Location</Label>
                      <Input
                        id="filter-location"
                        placeholder="City or address"
                        value={locationQuery}
                        onChange={(e) => {
                          setLocationQuery(e.target.value);
                          setSearchLocationLabel(e.target.value);
                        }}
                        className={browseInputClass}
                        data-testid="input-filter-location"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className={browseFilterLabelClass}>Price range</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min="0"
                          placeholder="Min"
                          className={`${browseInputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          data-testid="input-filter-price-min"
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder="Max"
                          className={`${browseInputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          data-testid="input-filter-price-max"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="filter-delivery" className={browseFilterLabelClass}>Delivery included?</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{deliveryIncludedOnly ? "Yes" : "No"}</span>
                          <Switch
                            id="filter-delivery"
                            checked={deliveryIncludedOnly}
                            onCheckedChange={setDeliveryIncludedOnly}
                            data-testid="switch-filter-delivery"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="filter-setup" className={browseFilterLabelClass}>Setup included?</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{setupIncludedOnly ? "Yes" : "No"}</span>
                          <Switch
                            id="filter-setup"
                            checked={setupIncludedOnly}
                            onCheckedChange={setSetupIncludedOnly}
                            data-testid="switch-filter-setup"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="filter-availability-date" className={browseFilterLabelClass}>Availability date</Label>
                      <Input
                        id="filter-availability-date"
                        type="date"
                        value={availabilityDate}
                        onChange={(e) => setAvailabilityDate(e.target.value)}
                        className={browseInputClass}
                        data-testid="input-filter-availability-date"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className={browseFilterLabelClass}>Best for event types</Label>
                      <div className="flex flex-wrap gap-2">
                        {availableBestFor.map((eventType) => {
                          const token = toIdToken(eventType);
                          const selected = selectedBestFor.includes(eventType);
                          return (
                            <button
                              key={eventType}
                              id={`filter-bestfor-${token}`}
                              type="button"
                              onClick={() =>
                                setSelectedBestFor((prev) =>
                                  selected
                                    ? prev.filter((value) => value !== eventType)
                                    : uniqueSorted([...prev, eventType])
                                )
                              }
                              className={[
                                "rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[44px] flex items-center",
                                selected
                                  ? "border-[#4a6a7d] bg-[#4a6a7d] text-[#f5f0e8]"
                                  : "border-[rgba(74,106,125,0.24)] bg-[#f5f0e8] text-[#2a3a42] hover:bg-white",
                                "dark:border-[hsl(var(--card-border))] dark:bg-[hsl(var(--card))] dark:text-[#f5f0e8] dark:hover:bg-[hsl(var(--card)/0.9)]",
                              ].join(" ")}
                              data-testid={`pill-filter-bestfor-${token}`}
                              aria-pressed={selected}
                            >
                              {eventType}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={clearFilters}
                        data-testid="button-clear-all-filters"
                      >
                        Clear filters
                      </Button>
                      <Button
                        onClick={() => setShowFilters(false)}
                        data-testid="button-apply-filters"
                      >
                        Apply filters
                      </Button>
                    </div>
                </section>
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              <div className="flex items-center mb-4">
                <p className="text-sm text-muted-foreground" data-testid="text-results-count">
                  {isLoading ? "Loading..." : `${filteredListings.length} listings found`}
                </p>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-muted-foreground">Loading listings...</p>
                  </div>
                </div>
              ) : filteredListings.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No listings found matching your criteria.</p>
                </div>
              ) : (
                <MasonryListingGrid
                  listings={filteredListings}
                  maxColumns={showFilters ? 4 : 5}
                  minCardWidthPx={240}
                  cardMaxWidthPx={290}
                  renderCard={(listing) => (
                    <ListingCard
                      listing={listing}
                      priceScale="double"
                      titleScale="oneAndHalf"
                      titleSizeClassName="text-[1.518rem] md:text-[2.6875rem]"
                      priceSizeClassName="text-[1.932rem] leading-none md:text-[3.0625rem] md:leading-none"
                      titleFont="heading"
                      primaryActionScale="plus15"
                    />
                  )}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
