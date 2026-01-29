import ListingCard from "@/components/ListingCard";
import type { ListingPublic } from "@/types/listing";
import { useState, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, SlidersHorizontal } from "lucide-react";

const ENABLED_VENDOR_CATEGORIES = ["prop-rentals"] as const;
type VendorCategory = (typeof ENABLED_VENDOR_CATEGORIES)[number];

const listingMatchesCategory = (listing: ListingPublic, category: VendorCategory) => {
  if (category !== "prop-rentals") return false;
  const haystack = `${listing.serviceType} ${listing.vendorName}`.toLowerCase();
  return haystack.includes("prop") || haystack.includes("decor") || haystack.includes("rental");
};

const getMinOfferingPrice = (listing: ListingPublic) => {
  if (!listing.offerings || listing.offerings.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...listing.offerings.map((o) => o.price ?? Number.POSITIVE_INFINITY));
};

const milesBetween = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) => {
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

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recommended" | "price-asc" | "price-desc">("recommended");
  const [selectedCategories, setSelectedCategories] = useState<VendorCategory[]>(["prop-rentals"]);
  const [showFilters, setShowFilters] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [eventTypeQuery, setEventTypeQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
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
  });

  // Temporary Effect for debugging
  useEffect(() => {
    if (!publicListings || publicListings.length === 0) return;
    console.log("[publicListings sample]", publicListings[0]);
  }, [publicListings]);


  useEffect(() => {
    const params = new URLSearchParams(searchString);

    const search = params.get("q");
    const location = params.get("location");
    const eventType = params.get("eventType");
    const date = params.get("date");
    const searchLat = params.get("lat");
    const searchLng = params.get("lng");
    const searchRadiusMiles = params.get("sr");

    if (search !== null) setSearchQuery(search);
    if (location !== null) {
      const raw = location.trim();
      setSearchLocationLabel(raw);

      // If it's "City, ST" use City. If it's "City State" also use City.
      const cityOnly = raw.includes(",") ? raw.split(",")[0].trim() : raw.split(" ")[0].trim();
      setLocationQuery(cityOnly);
    }
    if (searchLat !== null) setSearchLat(Number(searchLat));
    if (searchLng !== null) setSearchLng(Number(searchLng));
    if (searchRadiusMiles !== null) setSearchRadiusMiles(Number(searchRadiusMiles));
    if (eventType !== null) setEventTypeQuery(eventType);
    if (date !== null) setDateQuery(date);
  }, [searchString]);

  const clearFilters = () => {
    setSearchQuery("");
    setSortBy("recommended");
    setLocation("/browse", { replace: true });
  };

const filteredListings = useMemo(() => {
  let filtered = [...publicListings];

  if (selectedCategories.length > 0) {
    filtered = filtered.filter((l) =>
      selectedCategories.some((cat) => listingMatchesCategory(l, cat))
    );
  }

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter((l) => {
      const haystack = `${l.vendorName} ${l.serviceType} ${l.city}`.toLowerCase();
      return haystack.includes(q);
    });
  }

    // Hero filters
    if (locationQuery.trim()) {
      const loc = locationQuery.trim().toLowerCase();

      filtered = filtered.filter((l) => {
        const listingLocLabel = String((l as any)?.listingData?.serviceLocation?.label || "").toLowerCase();
        const listingCityOnly = listingLocLabel.split(",")[0].trim();

        // Prefer listing-specific location; fall back to vendor city if listing location missing
        const haystack = (listingCityOnly || String(l.city || "")).toLowerCase();

        return haystack.includes(loc);
      });
    }

    if (eventTypeQuery.trim()) {
      const et = eventTypeQuery.trim().toLowerCase();
      filtered = filtered.filter((l) =>
        `${l.serviceType || ""}`.toLowerCase().includes(et)
      );
    }

    // dateQuery captured for future availability logic
        // Radius / service area filtering (listing-specific)
    if (searchLat != null && searchLng != null) {
      filtered = filtered.filter((l) => {
        const ld: any = (l as any).listingData || {};
        const mode = ld.serviceAreaMode;

        // Global listings always visible
        if (mode === "nationwide") {
          const searchLabel = searchLocationLabel.toLowerCase();
          const searchCountry = searchLabel.split(",").pop()?.trim();

          // Prefer listing-specific location
          let listingCountry = ld?.serviceLocation?.label
            ? ld.serviceLocation.label.toLowerCase().split(",").pop()?.trim()
            : null;

          // Fallback: vendor-based listings are assumed US
          if (!listingCountry && l.city) {
            listingCountry = "united states";
          }

          return Boolean(
            listingCountry &&
            searchCountry &&
            listingCountry === searchCountry
          );
        }

        // Radius-based listings
        if (mode === "radius") {
          const center = ld.serviceCenter;
          const listingRadius = Number(ld.serviceRadiusMiles ?? 0);

          if (center?.lat == null || center?.lng == null) return false;

          const distance = milesBetween(
            searchLat,
            searchLng,
            Number(center.lat),
            Number(center.lng)
          );

          return distance <= listingRadius + searchRadiusMiles;
        }

        // Unknown mode: hide
        return false;
      });
    }

    const sorted = [...filtered];
    if (sortBy === "price-asc")
      sorted.sort((a, b) => getMinOfferingPrice(a) - getMinOfferingPrice(b));
    else if (sortBy === "price-desc")
      sorted.sort((a, b) => getMinOfferingPrice(b) - getMinOfferingPrice(a));

    return sorted;
  }, [
    publicListings,
    selectedCategories,
    searchQuery,
    locationQuery,
    eventTypeQuery,
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
        {/* Header */}
        <div className="bg-white border-b py-8">
          {/* ✅ spacing clarified: smaller, consistent left/right padding */}
          <div className="w-full px-8 lg:px-12">
            <h1
              className="text-3xl md:text-4xl font-bold mb-4 text-foreground"
              data-testid="text-page-title"
            >
              Prop & Decor Rentals
            </h1>
            <p className="text-muted-foreground mb-6">
              Browse curated decor + prop rentals. Delivery and setup options vary by vendor.
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

              {searchQuery.trim() && (
                <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        {/* ✅ spacing clarified: match “gap between cards” vibe — not huge margins */}
        <div className="w-full px-8 lg:px-12 py-8">
          <div className="flex gap-6 lg:gap-8">
            {/* Left rail */}
            <aside className={`${showFilters ? "block" : "hidden"} md:block w-full md:w-80 shrink-0`}>
              <div className="sticky top-24 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Sort</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select
                      value={sortBy}
                      onValueChange={(value) =>
                        setSortBy(value as "recommended" | "price-asc" | "price-desc")
                      }
                    >
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
                    {/* placeholder - keep for future */}
                  </CardContent>
                </Card>
              </div>
            </aside>

            {/* Results */}
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
                // Masonry with fixed column width (cards keep size; columns drop as screen shrinks)
                <div className="w-full columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 [column-gap:1rem]">
                  {filteredListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="mb-4 break-inside-avoid inline-block w-full relative hover:z-10"
                    >
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