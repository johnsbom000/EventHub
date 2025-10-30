import { useState, useEffect } from "react";
import { useSearch } from "wouter";
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
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png";
import cateringImage from "@assets/generated_images/Catering_service_category_image_cf900d0e.png";
import photographyImage from "@assets/generated_images/Photography_service_category_image_42830a2e.png";
import entertainmentImage from "@assets/generated_images/Entertainment_category_image_ab98e31b.png";
import planningImage from "@assets/generated_images/Event_planning_category_image_da1b013b.png";
import decorImage from "@assets/generated_images/Decor_services_category_image_3cd1cabb.png";

const mockVendors = [
  { id: "1", name: "Grand Ballroom Events", category: "Venues", rating: 4.9, reviewCount: 127, location: "New York, NY", startingPrice: "$5,000", image: venueImage },
  { id: "2", name: "Culinary Elegance Catering", category: "Catering", rating: 4.8, reviewCount: 93, location: "Los Angeles, CA", startingPrice: "$2,500", image: cateringImage },
  { id: "3", name: "Moments Photography Studio", category: "Photography", rating: 5.0, reviewCount: 156, location: "Chicago, IL", startingPrice: "$1,800", image: photographyImage },
  { id: "4", name: "Harmony Entertainment Group", category: "Entertainment", rating: 4.7, reviewCount: 84, location: "Miami, FL", startingPrice: "$1,200", image: entertainmentImage },
  { id: "5", name: "Perfect Day Planning", category: "Planning", rating: 4.9, reviewCount: 112, location: "Seattle, WA", startingPrice: "$3,000", image: planningImage },
  { id: "6", name: "Bloom & Decor Studio", category: "Decor", rating: 4.8, reviewCount: 98, location: "Austin, TX", startingPrice: "$1,500", image: decorImage },
];

const categories = ["Venues", "Catering", "Photography", "Entertainment", "Planning", "Decor"];

export default function BrowseVendors() {
  const searchString = useSearch();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("rating");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

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
                  {mockVendors.length} vendors found
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mockVendors.map((vendor) => (
                  <VendorCard key={vendor.id} {...vendor} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
