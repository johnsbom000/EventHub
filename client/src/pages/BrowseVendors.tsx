import ListingCard from "@/components/ListingCard";
import type { ListingPublic } from "@/types/listing";
import { useState, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, SlidersHorizontal } from "lucide-react";

const ENABLED_VENDOR_CATEGORIES = ["prop-rentals"] as const;
type VendorCategory = (typeof ENABLED_VENDOR_CATEGORIES)[number];

const categoryDisplayNames: Record<VendorCategory, string> = {
  "prop-rentals": "Props & Decor Rentals",
};

// very lightweight mapping so your existing category filter can work on listings
// (since ListingPublic doesn’t currently have a category field)
const listingMatchesCategory = (listing: ListingPublic, category: VendorCategory) => {
  if (category !== "prop-rentals") return false;

  const haystack = `${listing.serviceType} ${listing.vendorName}`.toLowerCase();
  return (
    haystack.includes("prop") ||
    haystack.includes("decor") ||
    haystack.includes("rental")
  );
};


const getMinOfferingPrice = (listing: ListingPublic) => {
  if (!listing.offerings || listing.offerings.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...listing.offerings.map((o) => o.price ?? Number.POSITIVE_INFINITY));
};

export default function BrowseVendors() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recommended" | "price-asc" | "price-desc">(
    "recommended"
  );
  const [selectedCategories, setSelectedCategories] = useState<VendorCategory[]>(["prop-rentals"]);
  const [showFilters, setShowFilters] = useState(false);

  // Mock listings (matches vendor listing creation data shape)
  const mockListings: ListingPublic[] = [
  {
    id: "listing-1",
    vendorId: "vendor-1",
    vendorName: "Peak Party Props",
    serviceType: "Props & Decor Rentals",
    city: "Salt Lake City, UT",
    travelMode: "travel-to-guests",
    serviceRadius: 50,
    photos: ["https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800"],
    serviceDescription:
      "Curated event decor + prop rentals. Delivery, setup, and pickup available.",
    offerings: [
      { id: "o1", title: "Backdrop Bundle", description: "", price: 250, duration: 60 },
      { id: "o2", title: "Full Decor Package", description: "", price: 850, duration: 180 },
    ],
    businessHours: [],
    discounts: [],
  },
];


  // Parse URL parameters on mount and when they change
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const search = params.get("q");
    if (search) setSearchQuery(search);
  }, [searchString]);



  const toggleCategory = (category: VendorCategory) => {
    setSelectedCategories((prev) => {
      const newCategories = prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category];

      const params = new URLSearchParams(searchString);
      if (newCategories.length > 0) params.set("category", newCategories[0]);
      else params.delete("category");

      setLocation(`/browse?${params.toString()}`, { replace: true });
      return newCategories;
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSortBy("recommended");
    setLocation("/browse", { replace: true });
  };


  const allCategories = useMemo(() => [...ENABLED_VENDOR_CATEGORIES], []);

  // Filter + sort listings
  const filteredListings = useMemo(() => {
    let filtered = [...mockListings];

    // category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((l) =>
        selectedCategories.some((cat) => listingMatchesCategory(l, cat))
      );
    }

    // search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((l) => {
        const haystack = `${l.vendorName} ${l.serviceType} ${l.city}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    // sorting
    const sorted = [...filtered];
    if (sortBy === "price-asc") {
      sorted.sort((a, b) => getMinOfferingPrice(a) - getMinOfferingPrice(b));
    } else if (sortBy === "price-desc") {
      sorted.sort((a, b) => getMinOfferingPrice(b) - getMinOfferingPrice(a));
    }

    return sorted;
  }, [mockListings, selectedCategories, searchQuery, sortBy]);

  // Loading state (switch to API later)
  const isLoading = false;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navigation />
      <main className="flex-1 bg-background">
        <div className="bg-white border-b py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-8">
            <aside
              className={`${showFilters ? "block" : "hidden"} md:block w-full md:w-64 shrink-0`}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                
                </CardContent>
              </Card>
            </aside>

            <div className="flex-1">
              <div className="flex justify-between items-center mb-6">
                <p className="text-sm text-muted-foreground" data-testid="text-results-count">
                  {isLoading ? "Loading..." : `${filteredListings.length} listings found`}
                </p>

                <Select
                  value={sortBy}
                  onValueChange={(value) =>
                    setSortBy(value as "recommended" | "price-asc" | "price-desc")
                  }
                >
                  <SelectTrigger className="w-[220px]" data-testid="select-sort">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recommended">Recommended</SelectItem>
                    <SelectItem value="price-asc">Price: Low to High</SelectItem>
                    <SelectItem value="price-desc">Price: High to Low</SelectItem>
                  </SelectContent>
                </Select>
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
                  <p className="text-muted-foreground">
                    No listings found matching your criteria.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      onAddToEvent={(listingId: string) => {
                        console.log("Add listing to event:", listingId);
                      }}
                    />
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
