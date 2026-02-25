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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Search, SlidersHorizontal } from "lucide-react";
import { POPULAR_FOR_OPTIONS } from "@/constants/eventTypes";
import { getListingDisplayPrice } from "@/lib/listingPrice";

type SortBy = "recommended" | "price-asc" | "price-desc";

type ListingBusinessHour = {
  day?: string;
  enabled?: boolean;
  timeRanges?: Array<{ start?: string; end?: string }>;
};

const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

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

const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).sort((a, b) =>
    a.localeCompare(b)
  );

const toIdToken = (value: string) => normalizeText(value).replace(/[^a-z0-9]+/g, "-");

const getListingTitle = (listing: ListingPublic) => {
  const listingAny = listing as any;
  return (
    listingAny?.listingData?.listingTitle ??
    listingAny?.title ??
    listing.serviceType ??
    ""
  );
};

const getListingPrice = (listing: ListingPublic): number | null => getListingDisplayPrice(listing);

const getMinOfferingPrice = (listing: ListingPublic) => {
  const price = getListingPrice(listing);
  return price == null ? Number.POSITIVE_INFINITY : price;
};

const getListingLocation = (listing: ListingPublic) => {
  const listingAny = listing as any;
  return (
    listingAny?.listingData?.serviceLocation?.label ??
    listingAny?.listingData?.serviceAddress ??
    listing.city ??
    ""
  );
};

const getListingDeliveryIncluded = (listing: ListingPublic) => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};
  return Boolean(
    listingData?.deliverySetup?.deliveryIncluded ??
      listingData?.deliveryIncluded ??
      listingData?.logistics?.deliveryIncluded
  );
};

const getListingSetupIncluded = (listing: ListingPublic) => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};
  return Boolean(
    listingData?.deliverySetup?.setupIncluded ??
      listingData?.setupIncluded ??
      listingData?.logistics?.setupIncluded
  );
};

const getListingTags = (listing: ListingPublic): string[] => {
  const listingAny = listing as any;
  const listingData = listingAny?.listingData ?? {};
  const next: string[] = [];

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
  const source = Array.isArray(listingData?.popularFor)
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

  const [showFilters, setShowFilters] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
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
    () => uniqueSorted([...POPULAR_FOR_OPTIONS, ...publicListings.flatMap((listing) => getListingBestFor(listing))]),
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
    const bestForParam = parseCsvParam(params.get("bestFor"));
    const mergedBestFor = uniqueSorted(
      bestForParam.length > 0 ? bestForParam : eventTypeParam ? [eventTypeParam] : []
    );

    setSearchQuery((params.get("q") ?? "").trim());
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

  const filteredListings = useMemo(() => {
    let filtered = [...publicListings];
    const normalizedQuery = normalizeText(searchQuery);
    const normalizedLocation = normalizeText(locationQuery);
    const minPriceNumber = parseOptionalNumber(minPrice);
    const maxPriceNumber = parseOptionalNumber(maxPrice);
    const normalizedSelectedTags = selectedTags.map((tag) => normalizeText(tag));
    const normalizedSelectedBestFor = selectedBestFor.map((eventType) => normalizeText(eventType));

    filtered = filtered.filter((listing) => getListingPrice(listing) != null);

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
        const mode = listingData?.deliverySetup?.serviceAreaMode ?? listingData?.serviceAreaMode;

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
          const center = listingData?.deliverySetup?.serviceCenter ?? listingData?.serviceCenter;
          const listingRadius = Number(
            listingData?.deliverySetup?.serviceRadiusMiles ?? listingData?.serviceRadiusMiles ?? 0
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

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navigation />

      <main className="flex-1 bg-background">
        <div className="bg-white border-b py-8">
          <div className="w-full px-8 lg:px-12">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-foreground" data-testid="text-page-title">
              Rentals
            </h1>
            <p className="text-muted-foreground mb-6">
              Browse curated rentals. Delivery and setup options vary by vendor.
            </p>

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Input
                  placeholder="Search listings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                  data-testid="input-search"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              </div>

              <Button
                variant="outline"
                className="md:hidden"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-toggle-filters"
              >
                <SlidersHorizontal className="h-5 w-5" />
              </Button>

              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="w-full px-8 lg:px-12 py-8">
          <div className="flex gap-6 lg:gap-8">
            <aside className={`${showFilters ? "block" : "hidden"} md:block w-full md:w-80 shrink-0`}>
              <div className="sticky top-24 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sort</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                      <SelectTrigger className="w-full" data-testid="select-sort">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recommended">Recommended</SelectItem>
                        <SelectItem value="price-asc">Price: Low to High</SelectItem>
                        <SelectItem value="price-desc">Price: High to Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Filters</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="filter-location">Location</Label>
                      <Input
                        id="filter-location"
                        placeholder="City or address"
                        value={locationQuery}
                        onChange={(e) => {
                          setLocationQuery(e.target.value);
                          setSearchLocationLabel(e.target.value);
                        }}
                        data-testid="input-filter-location"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Price range</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min="0"
                          placeholder="Min"
                          className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          value={minPrice}
                          onChange={(e) => setMinPrice(e.target.value)}
                          data-testid="input-filter-price-min"
                        />
                        <Input
                          type="number"
                          min="0"
                          placeholder="Max"
                          className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          value={maxPrice}
                          onChange={(e) => setMaxPrice(e.target.value)}
                          data-testid="input-filter-price-max"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="filter-delivery">Delivery included</Label>
                        <Switch
                          id="filter-delivery"
                          checked={deliveryIncludedOnly}
                          onCheckedChange={setDeliveryIncludedOnly}
                          data-testid="switch-filter-delivery"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="filter-setup">Setup included</Label>
                        <Switch
                          id="filter-setup"
                          checked={setupIncludedOnly}
                          onCheckedChange={setSetupIncludedOnly}
                          data-testid="switch-filter-setup"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="filter-availability-date">Availability date</Label>
                      <Input
                        id="filter-availability-date"
                        type="date"
                        value={availabilityDate}
                        onChange={(e) => setAvailabilityDate(e.target.value)}
                        data-testid="input-filter-availability-date"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tags</Label>
                      {availableTags.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tags available yet.</p>
                      ) : (
                        <div className="max-h-36 overflow-auto space-y-2 pr-1">
                          {availableTags.map((tag) => {
                            const token = toIdToken(tag);
                            return (
                            <div key={tag} className="flex items-center gap-2">
                              <Checkbox
                                id={`filter-tag-${token}`}
                                checked={selectedTags.includes(tag)}
                                onCheckedChange={(checked) => {
                                  const isChecked = checked === true;
                                  setSelectedTags((prev) =>
                                    isChecked ? uniqueSorted([...prev, tag]) : prev.filter((value) => value !== tag)
                                  );
                                }}
                                data-testid={`checkbox-filter-tag-${token}`}
                              />
                              <Label htmlFor={`filter-tag-${token}`} className="text-sm font-normal">
                                {tag}
                              </Label>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Best for event types</Label>
                      <div className="max-h-44 overflow-auto space-y-2 pr-1">
                        {availableBestFor.map((eventType) => {
                          const token = toIdToken(eventType);
                          return (
                          <div key={eventType} className="flex items-center gap-2">
                            <Checkbox
                              id={`filter-bestfor-${token}`}
                              checked={selectedBestFor.includes(eventType)}
                              onCheckedChange={(checked) => {
                                const isChecked = checked === true;
                                setSelectedBestFor((prev) =>
                                  isChecked
                                    ? uniqueSorted([...prev, eventType])
                                    : prev.filter((value) => value !== eventType)
                                );
                              }}
                              data-testid={`checkbox-filter-bestfor-${token}`}
                            />
                            <Label htmlFor={`filter-bestfor-${token}`} className="text-sm font-normal">
                              {eventType}
                            </Label>
                          </div>
                          );
                        })}
                      </div>
                    </div>

                    {hasActiveFilters && (
                      <Button variant="outline" className="w-full" onClick={clearFilters} data-testid="button-clear-all-filters">
                        Clear all filters
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </aside>

            <div className="flex-1 min-w-0">
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
                <div className="w-full columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 [column-gap:1rem]">
                  {filteredListings.map((listing) => (
                    <div key={listing.id} className="mb-4 break-inside-avoid inline-block w-full">
                      <ListingCard listing={listing} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
