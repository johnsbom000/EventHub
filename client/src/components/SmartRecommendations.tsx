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
  Venues: [
    { id: "1", name: "Grand Ballroom Events", location: "New York, NY", price: "$5,000", rating: 4.9, image: venueImage },
    { id: "2", name: "Garden Estate", location: "New York, NY", price: "$4,500", rating: 4.8, image: venueImage },
    { id: "3", name: "Metropolitan Hall", location: "New York, NY", price: "$6,200", rating: 5.0, image: venueImage },
    { id: "v4", name: "Riverside Manor", location: "New York, NY", price: "$5,500", rating: 4.9, image: venueImage },
    { id: "v5", name: "The Plaza Pavilion", location: "New York, NY", price: "$7,000", rating: 4.8, image: venueImage },
    { id: "v6", name: "Skyline Terrace", location: "New York, NY", price: "$6,800", rating: 4.7, image: venueImage },
    { id: "v7", name: "Historic Mansion Estate", location: "New York, NY", price: "$8,500", rating: 5.0, image: venueImage },
    { id: "v8", name: "Lakeside Venue", location: "New York, NY", price: "$5,200", rating: 4.6, image: venueImage },
  ],
  Photographer: [
    { id: "4", name: "Moments Photography Studio", location: "New York, NY", price: "$1,800", rating: 5.0, image: photographyImage },
    { id: "5", name: "Artisan Lens", location: "New York, NY", price: "$2,200", rating: 4.9, image: photographyImage },
    { id: "6", name: "Classic Captures", location: "New York, NY", price: "$1,500", rating: 4.7, image: photographyImage },
    { id: "p4", name: "Golden Hour Studios", location: "New York, NY", price: "$2,000", rating: 4.8, image: photographyImage },
    { id: "p5", name: "Perfect Frame Photography", location: "New York, NY", price: "$1,600", rating: 4.9, image: photographyImage },
    { id: "p6", name: "Timeless Memories", location: "New York, NY", price: "$2,400", rating: 5.0, image: photographyImage },
    { id: "p7", name: "Natural Light Studio", location: "New York, NY", price: "$1,900", rating: 4.7, image: photographyImage },
    { id: "p8", name: "Elite Wedding Photography", location: "New York, NY", price: "$2,800", rating: 4.8, image: photographyImage },
  ],
  Videographer: [
    { id: "vid1", name: "Cinematic Moments", location: "New York, NY", price: "$2,200", rating: 4.9, image: photographyImage },
    { id: "vid2", name: "Frame by Frame Films", location: "New York, NY", price: "$2,500", rating: 5.0, image: photographyImage },
    { id: "vid3", name: "Love Story Videography", location: "New York, NY", price: "$1,800", rating: 4.8, image: photographyImage },
    { id: "vid4", name: "Premiere Wedding Films", location: "New York, NY", price: "$3,000", rating: 4.7, image: photographyImage },
    { id: "vid5", name: "Artisan Video Productions", location: "New York, NY", price: "$2,400", rating: 4.9, image: photographyImage },
    { id: "vid6", name: "Epic Events Videography", location: "New York, NY", price: "$2,800", rating: 4.8, image: photographyImage },
    { id: "vid7", name: "Golden Reel Studios", location: "New York, NY", price: "$3,200", rating: 5.0, image: photographyImage },
    { id: "vid8", name: "Motion Capture Films", location: "New York, NY", price: "$2,100", rating: 4.7, image: photographyImage },
  ],
  DJs: [
    { id: "10", name: "Harmony Group", location: "New York, NY", price: "$1,200", rating: 4.7, image: entertainmentImage },
    { id: "11", name: "Live Music Co", location: "New York, NY", price: "$1,500", rating: 4.8, image: entertainmentImage },
    { id: "12", name: "Event DJs Pro", location: "New York, NY", price: "$900", rating: 4.6, image: entertainmentImage },
    { id: "e4", name: "Rhythm & Beats Entertainment", location: "New York, NY", price: "$1,100", rating: 4.9, image: entertainmentImage },
    { id: "e5", name: "The Party Makers", location: "New York, NY", price: "$1,400", rating: 4.8, image: entertainmentImage },
    { id: "e6", name: "Premier DJ Services", location: "New York, NY", price: "$1,600", rating: 5.0, image: entertainmentImage },
    { id: "e7", name: "Soundwave DJs", location: "New York, NY", price: "$1,300", rating: 4.7, image: entertainmentImage },
    { id: "e8", name: "Spin Masters Entertainment", location: "New York, NY", price: "$1,700", rating: 4.9, image: entertainmentImage },
  ],
  Florists: [
    { id: "16", name: "Bloom & Decor Studio", location: "New York, NY", price: "$1,500", rating: 4.8, image: decorImage },
    { id: "17", name: "Elegant Touches", location: "New York, NY", price: "$1,800", rating: 4.9, image: decorImage },
    { id: "18", name: "Floral Dreams", location: "New York, NY", price: "$1,300", rating: 4.7, image: decorImage },
    { id: "d4", name: "Petals & Stems", location: "New York, NY", price: "$1,600", rating: 4.8, image: decorImage },
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
  Catering: [
    { id: "7", name: "Culinary Elegance", location: "New York, NY", price: "$2,500", rating: 4.8, image: cateringImage },
    { id: "8", name: "Gourmet Events", location: "New York, NY", price: "$3,000", rating: 4.9, image: cateringImage },
    { id: "9", name: "Savory Selections", location: "New York, NY", price: "$2,200", rating: 4.7, image: cateringImage },
    { id: "c4", name: "Farm-to-Table Catering", location: "New York, NY", price: "$3,200", rating: 4.9, image: cateringImage },
    { id: "c5", name: "The Culinary Experience", location: "New York, NY", price: "$2,800", rating: 4.8, image: cateringImage },
    { id: "c6", name: "Taste of Excellence", location: "New York, NY", price: "$3,500", rating: 5.0, image: cateringImage },
    { id: "c7", name: "Artisan Cuisine Co.", location: "New York, NY", price: "$2,600", rating: 4.7, image: cateringImage },
    { id: "c8", name: "Premium Palate Catering", location: "New York, NY", price: "$4,000", rating: 4.8, image: cateringImage },
  ],
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
              <Link href={`/browse?category=${category.toLowerCase()}`}>
                <Button variant="outline" data-testid={`button-view-all-${category.toLowerCase()}`}>
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
