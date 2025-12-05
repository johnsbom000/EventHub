import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Star } from "lucide-react";
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png";
import cateringImage from "@assets/generated_images/Catering_service_category_image_cf900d0e.png";
import photographyImage from "@assets/generated_images/Photography_service_category_image_42830a2e.png";
import entertainmentImage from "@assets/generated_images/Entertainment_category_image_ab98e31b.png";
import planningImage from "@assets/generated_images/Event_planning_category_image_da1b013b.png";
import decorImage from "@assets/generated_images/Decor_services_category_image_3cd1cabb.png";

// TODO: Replace with actual data from API
const mockVendorsByCategory = {
  venues: [
    { id: "venue-1", name: "Grand Ballroom Events", location: "New York, NY", price: "$5,000", rating: 4.9, image: venueImage, category: "venues" },
    { id: "venue-2", name: "Garden Estate", location: "New York, NY", price: "$4,500", rating: 4.8, image: venueImage, category: "venues" },
    { id: "venue-3", name: "Metropolitan Hall", location: "New York, NY", price: "$6,200", rating: 5.0, image: venueImage, category: "venues" },
    { id: "venue-4", name: "Riverside Manor", location: "New York, NY", price: "$5,500", rating: 4.9, image: venueImage, category: "venues" },
    { id: "venue-5", name: "The Plaza Pavilion", location: "New York, NY", price: "$7,000", rating: 4.8, image: venueImage, category: "venues" },
    { id: "venue-6", name: "Skyline Terrace", location: "New York, NY", price: "$6,800", rating: 4.7, image: venueImage, category: "venues" },
    { id: "venue-7", name: "Historic Mansion Estate", location: "New York, NY", price: "$8,500", rating: 5.0, image: venueImage, category: "venues" },
    { id: "venue-8", name: "Lakeside Venue", location: "New York, NY", price: "$5,200", rating: 4.6, image: venueImage, category: "venues" },
  ],
  photographers: [
    { id: "photo-1", name: "Moments Photography Studio", location: "New York, NY", price: "$1,800", rating: 5.0, image: photographyImage, category: "photographers" },
    { id: "photo-2", name: "Artisan Lens", location: "New York, NY", price: "$2,200", rating: 4.9, image: photographyImage, category: "photographers" },
    { id: "photo-3", name: "Classic Captures", location: "New York, NY", price: "$1,500", rating: 4.7, image: photographyImage, category: "photographers" },
    { id: "photo-4", name: "Golden Hour Studios", location: "New York, NY", price: "$2,000", rating: 4.8, image: photographyImage, category: "photographers" },
    { id: "photo-5", name: "Perfect Frame Photography", location: "New York, NY", price: "$1,600", rating: 4.9, image: photographyImage, category: "photographers" },
    { id: "photo-6", name: "Timeless Memories", location: "New York, NY", price: "$2,400", rating: 5.0, image: photographyImage, category: "photographers" },
    { id: "photo-7", name: "Natural Light Studio", location: "New York, NY", price: "$1,900", rating: 4.7, image: photographyImage, category: "photographers" },
    { id: "photo-8", name: "Elite Wedding Photography", location: "New York, NY", price: "$2,800", rating: 4.8, image: photographyImage, category: "photographers" },
  ],
  videographers: [
    { id: "video-1", name: "Cinematic Moments", location: "New York, NY", price: "$2,200", rating: 4.9, image: photographyImage, category: "videographers" },
    { id: "video-2", name: "Frame by Frame Films", location: "New York, NY", price: "$2,500", rating: 5.0, image: photographyImage, category: "videographers" },
    { id: "video-3", name: "Love Story Videography", location: "New York, NY", price: "$1,800", rating: 4.8, image: photographyImage, category: "videographers" },
    { id: "video-4", name: "Premiere Wedding Films", location: "New York, NY", price: "$3,000", rating: 4.7, image: photographyImage, category: "videographers" },
    { id: "video-5", name: "Artisan Video Productions", location: "New York, NY", price: "$2,400", rating: 4.9, image: photographyImage, category: "videographers" },
    { id: "video-6", name: "Epic Events Videography", location: "New York, NY", price: "$2,800", rating: 4.8, image: photographyImage, category: "videographers" },
    { id: "video-7", name: "Golden Reel Studios", location: "New York, NY", price: "$3,200", rating: 5.0, image: photographyImage, category: "videographers" },
    { id: "video-8", name: "Motion Capture Films", location: "New York, NY", price: "$2,100", rating: 4.7, image: photographyImage, category: "videographers" },
  ],
  djs: [
    { id: "dj-1", name: "Harmony Group", location: "New York, NY", price: "$1,200", rating: 4.7, image: entertainmentImage, category: "djs" },
    { id: "dj-2", name: "Live Music Co", location: "New York, NY", price: "$1,500", rating: 4.8, image: entertainmentImage, category: "djs" },
    { id: "dj-3", name: "Event DJs Pro", location: "New York, NY", price: "$900", rating: 4.6, image: entertainmentImage, category: "djs" },
    { id: "dj-4", name: "Rhythm & Beats Entertainment", location: "New York, NY", price: "$1,100", rating: 4.9, image: entertainmentImage, category: "djs" },
    { id: "dj-5", name: "The Party Makers", location: "New York, NY", price: "$1,400", rating: 4.8, image: entertainmentImage, category: "djs" },
    { id: "e6", name: "Premier DJ Services", location: "New York, NY", price: "$1,600", rating: 5.0, image: entertainmentImage },
    { id: "e7", name: "Soundwave DJs", location: "New York, NY", price: "$1,300", rating: 4.7, image: entertainmentImage },
    { id: "e8", name: "Spin Masters Entertainment", location: "New York, NY", price: "$1,700", rating: 4.9, image: entertainmentImage },
  ],
  florists: [
    { id: "florist-1", name: "Bloom & Decor Studio", location: "New York, NY", price: "$1,500", rating: 4.8, image: decorImage, category: "florists" },
    { id: "florist-2", name: "Elegant Touches", location: "New York, NY", price: "$1,800", rating: 4.9, image: decorImage, category: "florists" },
    { id: "florist-3", name: "Floral Dreams", location: "New York, NY", price: "$1,300", rating: 4.7, image: decorImage, category: "florists" },
    { id: "florist-4", name: "Petals & Stems", location: "New York, NY", price: "$1,600", rating: 4.8, image: decorImage, category: "florists" },
    { id: "d5", name: "Artistic Florals", location: "New York, NY", price: "$2,000", rating: 4.9, image: decorImage },
    { id: "d6", name: "Garden of Eden Florist", location: "New York, NY", price: "$1,700", rating: 5.0, image: decorImage },
    { id: "d7", name: "Modern Botanicals", location: "New York, NY", price: "$1,900", rating: 4.7, image: decorImage },
    { id: "d8", name: "Luxury Floral Designs", location: "New York, NY", price: "$2,400", rating: 4.8, image: decorImage },
  ],
  "Prop Rentals": [
    { id: "pr1", name: "Event Essentials Rentals", location: "New York, NY", price: "$800", rating: 4.7, image: planningImage },
    { id: "pr2", name: "Party Props Plus", location: "New York, NY", price: "$950", rating: 4.8, image: planningImage },
    { id: "pr3", name: "Décor & More Rentals", location: "New York, NY", price: "$750", rating: 4.6, image: planningImage },
    { id: "pr4", name: "Premium Event Rentals", location: "New York, NY", price: "$1,200", rating: 4.9, image: planningImage },
    { id: "pr5", name: "Complete Setup Solutions", location: "New York, NY", price: "$1,100", rating: 4.8, image: planningImage },
    { id: "pr6", name: "Classic Props & Furniture", location: "New York, NY", price: "$900", rating: 4.7, image: planningImage },
    { id: "pr7", name: "Luxury Event Rentals", location: "New York, NY", price: "$1,500", rating: 5.0, image: planningImage },
    { id: "pr8", name: "All Occasions Rentals", location: "New York, NY", price: "$850", rating: 4.6, image: planningImage },
  ],
  planners: [
    { id: "planner-1", name: "Perfectly Planned", location: "New York, NY", price: "$3,000", rating: 4.9, image: planningImage, category: "planners" },
    { id: "planner-2", name: "Dream Day Events", location: "New York, NY", price: "$3,500", rating: 5.0, image: planningImage, category: "planners" },
    { id: "planner-3", name: "Momentous Occasions", location: "New York, NY", price: "$2,800", rating: 4.8, image: planningImage, category: "planners" },
    { id: "planner-4", name: "The Wedding Planners", location: "New York, NY", price: "$4,000", rating: 5.0, image: planningImage, category: "planners" },
    { id: "planner-5", name: "Elegant Affairs", location: "New York, NY", price: "$3,200", rating: 4.9, image: planningImage, category: "planners" },
    { id: "planner-6", name: "Simply Perfect Events", location: "New York, NY", price: "$2,500", rating: 4.7, image: planningImage, category: "planners" },
    { id: "planner-7", name: "Aisle Perfect", location: "New York, NY", price: "$3,800", rating: 4.9, image: planningImage, category: "planners" },
    { id: "planner-8", name: "Once Upon a Time Events", location: "New York, NY", price: "$4,200", rating: 5.0, image: planningImage, category: "planners" },
  ],
  caterers: [
    { id: "caterer-1", name: "Gourmet Delights", location: "New York, NY", price: "$2,500", rating: 4.9, image: cateringImage, category: "caterers" },
    { id: "caterer-2", name: "Feast & Fete", location: "New York, NY", price: "$3,200", rating: 4.8, image: cateringImage, category: "caterers" },
    { id: "caterer-3", name: "Culinary Creations", location: "New York, NY", price: "$2,100", rating: 4.7, image: cateringImage, category: "caterers" },
    { id: "caterer-4", name: "The Culinary Experience", location: "New York, NY", price: "$2,800", rating: 4.8, image: cateringImage, category: "caterers" },
    { id: "caterer-5", name: "Taste of Excellence", location: "New York, NY", price: "$3,500", rating: 5.0, image: cateringImage, category: "caterers" },
    { id: "caterer-6", name: "Artisan Cuisine Co.", location: "New York, NY", price: "$2,600", rating: 4.7, image: cateringImage, category: "caterers" },
    { id: "caterer-7", name: "Premium Palate Catering", location: "New York, NY", price: "$4,000", rating: 4.8, image: cateringImage, category: "caterers" },
  ],
};

// Map of category display names to their slugs
const categoryDisplayNames: Record<string, string> = {
  'Venues': 'venues',
  'Photographers': 'photographers',
  'Videographers': 'videographers',
  'DJs': 'djs',
  'Florists': 'florists',
  'Caterers': 'caterers',
  'Planners': 'planners'
};

export default function SmartRecommendations() {
  const [userLocation, setUserLocation] = useState<string>("New York");

  useEffect(() => {
    // TODO: Implement geolocation detection
    // For now, using mock location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("Location detected:", position.coords);
          // In production, reverse geocode to get city name
        },
        (error) => {
          console.log("Geolocation denied, using default location");
        }
      );
    }
  }, []);

  return (
    <div className="bg-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {Object.entries(mockVendorsByCategory).map(([category, vendors]) => (
          <div key={category} className="mb-12" data-testid={`category-${category.toLowerCase()}`}>
            <h2 className="text-2xl font-semibold mb-6 text-foreground">
              {category} near {userLocation}
            </h2>
            
            <div className="overflow-x-auto -mx-4 px-4">
              <div className="flex gap-4 pb-4">
                {vendors.map((vendor) => (
                  <Link key={vendor.id} href={`/vendor/${vendor.id}`}>
                    <Card className="w-[280px] shrink-0 overflow-hidden hover-elevate cursor-pointer group" data-testid={`card-vendor-${vendor.id}`}>
                      <div className="aspect-square overflow-hidden">
                        <img
                          src={vendor.image}
                          alt={vendor.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-base leading-tight">{vendor.name}</h3>
                          <div className="flex items-center gap-1 shrink-0">
                            <Star className="h-3 w-3 fill-foreground text-foreground" />
                            <span className="text-sm font-medium">{vendor.rating}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{vendor.location}</span>
                        </div>
                        
                        <p className="text-sm">
                          <span className="font-semibold text-foreground">{vendor.price}</span>
                          <span className="text-muted-foreground"> starting price</span>
                        </p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
            
            <div className="mt-4">
              <Link href={`/browse?category=${categoryDisplayNames[category] || category.toLowerCase()}`}>
                <Button 
                  variant="outline" 
                  className="bg-[#9edbc0] text-[white] hover:bg-[#8ec9b0]" 
                  data-testid={`button-view-all-${categoryDisplayNames[category] || category.toLowerCase()}`}
                >
                  View all {category}
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
