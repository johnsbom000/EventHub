import VendorCard from "./VendorCard";
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png";
import cateringImage from "@assets/generated_images/Catering_service_category_image_cf900d0e.png";
import photographyImage from "@assets/generated_images/Photography_service_category_image_42830a2e.png";

const vendors = [
  {
    id: "1",
    name: "Grand Ballroom Events",
    category: "Venues",
    rating: 4.9,
    reviewCount: 127,
    location: "New York, NY",
    startingPrice: "$5,000",
    image: venueImage,
  },
  {
    id: "2",
    name: "Culinary Elegance Catering",
    category: "Catering",
    rating: 4.8,
    reviewCount: 93,
    location: "Los Angeles, CA",
    startingPrice: "$2,500",
    image: cateringImage,
  },
  {
    id: "3",
    name: "Moments Photography Studio",
    category: "Photography",
    rating: 5.0,
    reviewCount: 156,
    location: "Chicago, IL",
    startingPrice: "$1,800",
    image: photographyImage,
  },
];

export default function FeaturedVendors() {
  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-featured-title">
            Featured Vendors
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-featured-description">
            Top-rated professionals ready to make your event extraordinary
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map((vendor) => (
            <VendorCard key={vendor.id} {...vendor} />
          ))}
        </div>
      </div>
    </section>
  );
}
