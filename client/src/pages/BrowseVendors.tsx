import { useState, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import VendorCard from "@/components/VendorCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, SlidersHorizontal } from "lucide-react";

type Vendor = {
  id: string;
  name: string;
  category: string;
  city: string;
  state: string;
  basePrice: number;
  rating: string;
  reviewCount: number;
  imageUrl: string | null;
};

const categories = ["Venues", "Catering", "Photography", "DJ", "Florist", "Decor", "Entertainment", "Planning"];

const categoryImages: Record<string, string> = {
  "Venues": "https://images.unsplash.com/photo-1519167758481-83f29da78c32?w=800",
  "Catering": "https://images.unsplash.com/photo-1555244162-803834f70033?w=800",
  "Photography": "https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800",
  "DJ": "https://images.unsplash.com/photo-1571266028243-d220c1ac6e14?w=800",
  "Florist": "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=800",
  "Decor": "https://images.unsplash.com/photo-1511578314322-379afb476865?w=800",
  "Entertainment": "https://images.unsplash.com/photo-1571266028243-d220c1ac6e14?w=800",
  "Planning": "https://images.unsplash.com/photo-1511578314322-379afb476865?w=800",
};

export default function BrowseVendors() {
  const searchString = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("rating");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch vendors from API
  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const location = params.get('location');
    const eventType = params.get('eventType');
    const date = params.get('date');
    const categoriesParam = params.get('categories');
    
    if (location) setSearchQuery(location);
    if (categoriesParam) {
      setSelectedCategories(categoriesParam.split(','));
    }
    
    console.log('Search filters:', { location, eventType, date, categories: categoriesParam });
  }, [searchString]);

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  // Filter and sort vendors
  const filteredVendors = useMemo(() => {
    let filtered = vendors;

    // Filter by category
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(v => selectedCategories.includes(v.category));
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v => 
        v.name.toLowerCase().includes(query) ||
        v.city.toLowerCase().includes(query) ||
        v.state.toLowerCase().includes(query)
      );
    }

    // Sort
    const sorted = [...filtered];
    switch (sortBy) {
      case "rating":
        sorted.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating));
        break;
      case "price-low":
        sorted.sort((a, b) => a.basePrice - b.basePrice);
        break;
      case "price-high":
        sorted.sort((a, b) => b.basePrice - a.basePrice);
        break;
      case "popular":
        sorted.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
    }

    return sorted;
  }, [vendors, selectedCategories, searchQuery, sortBy]);

  // Map vendors to VendorCard props
  const vendorCards = filteredVendors.map(vendor => ({
    id: vendor.id,
    name: vendor.name,
    category: vendor.category,
    rating: parseFloat(vendor.rating),
    reviewCount: vendor.reviewCount,
    location: `${vendor.city}, ${vendor.state}`,
    startingPrice: `$${vendor.basePrice.toLocaleString()}`,
    image: vendor.imageUrl || categoryImages[vendor.category] || categoryImages["Venues"],
  }));

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navigation />
      <main className="flex-1 bg-background">
        <div className="bg-white border-b py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4 text-foreground" data-testid="text-page-title">
              Browse Vendors
            </h1>
            <p className="text-muted-foreground mb-6">
              Discover and connect with trusted event professionals
            </p>
            
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Input
                  placeholder="Search vendors..."
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
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-8">
            <aside className={`${showFilters ? 'block' : 'hidden'} md:block w-full md:w-64 shrink-0`}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-3">Categories</h3>
                    <div className="space-y-2">
                      {categories.map((category) => (
                        <div key={category} className="flex items-center gap-2">
                          <Checkbox
                            id={category}
                            checked={selectedCategories.includes(category)}
                            onCheckedChange={() => toggleCategory(category)}
                            data-testid={`checkbox-category-${category.toLowerCase()}`}
                          />
                          <Label htmlFor={category} className="cursor-pointer">
                            {category}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </aside>

            <div className="flex-1">
              <div className="flex justify-between items-center mb-6">
                <p className="text-sm text-muted-foreground" data-testid="text-results-count">
                  {isLoading ? 'Loading...' : `${vendorCards.length} vendors found`}
                </p>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[180px]" data-testid="select-sort">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rating">Highest Rated</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="popular">Most Popular</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-muted-foreground">Loading vendors...</p>
                  </div>
                </div>
              ) : vendorCards.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No vendors found matching your criteria.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {vendorCards.map((vendor) => (
                    <VendorCard key={vendor.id} {...vendor} />
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
