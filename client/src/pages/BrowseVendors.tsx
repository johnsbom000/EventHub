import { useState, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
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
import { Search, SlidersHorizontal, X } from "lucide-react";

type VendorCategory = 'venues' | 'photographers' | 'videographers' | 'djs' | 'florists' | 'caterers' | 'planners';

const categoryDisplayNames: Record<VendorCategory, string> = {
  'venues': 'Venues',
  'photographers': 'Photographers',
  'videographers': 'Videographers',
  'djs': 'DJs',
  'florists': 'Florists',
  'caterers': 'Caterers',
  'planners': 'Planners'
};

type Vendor = {
  id: string;
  name: string;
  category: VendorCategory;
  location: string;
  price: string;
  rating: number;
  image: string;
  reviewCount?: number;
};

const categoryImages: Record<VendorCategory, string> = {
  'venues': "https://images.unsplash.com/photo-1519167758481-83f29da78c32?w=800",
  'photographers': "https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800",
  'videographers': "https://images.unsplash.com/photo-1571266028243-d220c1ac6e14?w=800",
  'djs': "https://images.unsplash.com/photo-1571266028243-d220c1ac6e14?w=800",
  'florists': "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=800",
  'caterers': "https://images.unsplash.com/photo-1555244162-803834f70033?w=800",
  'planners': "https://images.unsplash.com/photo-1511578314322-379afb476865?w=800"
};

export default function BrowseVendors() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "price-asc" | "price-desc">("rating");
  const [selectedCategories, setSelectedCategories] = useState<VendorCategory[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Mock data - in a real app, this would come from an API
  const mockVendors: Vendor[] = [
    // Venues
    { id: "venue-1", name: "Grand Ballroom Events", location: "New York, NY", price: "$5,000", rating: 4.9, image: "https://images.unsplash.com/photo-1519167758481-83f29da78c32?w=800", category: 'venues' },
    // Add more mock vendors...
  ];

  // Parse URL parameters on mount and when they change
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const categoryParam = params.get('category');
    
    if (categoryParam) {
      // Validate the category against our known categories
      const validCategories = Object.keys(categoryDisplayNames) as VendorCategory[];
      const category = validCategories.find(c => c === categoryParam.toLowerCase());
      
      if (category) {
        setSelectedCategories([category]);
      }
    }
    
    // Optional: Handle search query from URL
    const search = params.get('q');
    if (search) {
      setSearchQuery(search);
    }
  }, [searchString]);

  const toggleCategory = (category: VendorCategory) => {
    setSelectedCategories(prev => {
      const newCategories = prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category];
      
      // Update URL with selected categories
      const params = new URLSearchParams(searchString);
      if (newCategories.length > 0) {
        params.set('category', newCategories[0]); // For now, only support one category at a time
      } else {
        params.delete('category');
      }
      
      setLocation(`/browse?${params.toString()}`, { replace: true });
      
      return newCategories;
    });
  };
  
  const clearFilters = () => {
    setSelectedCategories([]);
    setSearchQuery("");
    setSortBy("rating");
    setLocation('/browse', { replace: true });
  };

  // Get all available categories from our display names
  const allCategories = useMemo(() => {
    return Object.keys(categoryDisplayNames) as VendorCategory[];
  }, []);

  // Filter and sort vendors
  const filteredVendors = useMemo(() => {
    let filtered = [...mockVendors]; // Create a copy to avoid mutating the original array

    // Filter by category
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(v => selectedCategories.includes(v.category));
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v => 
        v.name.toLowerCase().includes(query) ||
        v.location.toLowerCase().includes(query)
      );
    }

    // Sort vendors
    const sorted = [...filtered];
    switch (sortBy) {
      case "rating":
        sorted.sort((a, b) => b.rating - a.rating);
        break;
      case "price-asc":
        sorted.sort((a, b) => {
          const priceA = parseFloat(a.price.replace(/[^0-9.-]+/g, ''));
          const priceB = parseFloat(b.price.replace(/[^0-9.-]+/g, ''));
          return priceA - priceB;
        });
        break;
      case "price-desc":
        sorted.sort((a, b) => {
          const priceA = parseFloat(a.price.replace(/[^0-9.-]+/g, ''));
          const priceB = parseFloat(b.price.replace(/[^0-9.-]+/g, ''));
          return priceB - priceA;
        });
        break;
    }
    return sorted;
  }, [mockVendors, selectedCategories, searchQuery, sortBy]);

  // Group vendors by category for the category filter
  const vendorsByCategory = useMemo(() => {
    const groups: Partial<Record<VendorCategory, Vendor[]>> = {};
    mockVendors.forEach(vendor => {
      if (!groups[vendor.category]) {
        groups[vendor.category] = [];
      }
      groups[vendor.category]?.push(vendor);
    });
    return groups;
  }, [mockVendors]);

  // Map vendors to VendorCard props with proper types
  const vendorCards = filteredVendors.map(vendor => ({
    id: vendor.id,
    name: vendor.name,
    category: categoryDisplayNames[vendor.category] || vendor.category,
    rating: vendor.rating,
    reviewCount: vendor.reviewCount || 0, // Ensure reviewCount is always a number
    location: vendor.location,
    startingPrice: vendor.price,
    image: vendor.image || categoryImages[vendor.category] || categoryImages.venues,
  }));

  // Loading state (in case we switch to API later)
  const isLoading = false; // Using mock data for now

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
                      {allCategories.map((category) => (
                        <div key={category} className="flex items-center gap-2">
                          <Checkbox
                            id={category}
                            checked={selectedCategories.includes(category)}
                            onCheckedChange={() => toggleCategory(category)}
                            data-testid={`checkbox-category-${category.toLowerCase()}`}
                          />
                          <Label htmlFor={category} className="cursor-pointer">
                            {categoryDisplayNames[category]}
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
                <Select 
                  value={sortBy} 
                  onValueChange={(value) => setSortBy(value as "rating" | "price-asc" | "price-desc")}
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-sort">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rating">Highest Rated</SelectItem>
                    <SelectItem value="price-asc">Price: Low to High</SelectItem>
                    <SelectItem value="price-desc">Price: High to Low</SelectItem>
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
