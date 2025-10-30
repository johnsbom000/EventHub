import CategoryCard from "./CategoryCard";
import { Building2, Utensils, Camera, Music, Clipboard, Flower2 } from "lucide-react";
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png";
import cateringImage from "@assets/generated_images/Catering_service_category_image_cf900d0e.png";
import photographyImage from "@assets/generated_images/Photography_service_category_image_42830a2e.png";
import entertainmentImage from "@assets/generated_images/Entertainment_category_image_ab98e31b.png";
import planningImage from "@assets/generated_images/Event_planning_category_image_da1b013b.png";
import decorImage from "@assets/generated_images/Decor_services_category_image_3cd1cabb.png";

const categories = [
  { title: "Venues", image: venueImage, icon: Building2, href: "/browse?category=venues" },
  { title: "Catering", image: cateringImage, icon: Utensils, href: "/browse?category=catering" },
  { title: "Photography", image: photographyImage, icon: Camera, href: "/browse?category=photography" },
  { title: "Entertainment", image: entertainmentImage, icon: Music, href: "/browse?category=entertainment" },
  { title: "Planning", image: planningImage, icon: Clipboard, href: "/browse?category=planning" },
  { title: "Decor", image: decorImage, icon: Flower2, href: "/browse?category=decor" },
];

export default function CategoriesSection() {
  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-categories-title">
            Browse by Category
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-categories-description">
            Find the perfect vendors for every aspect of your event
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
            <CategoryCard key={category.title} {...category} />
          ))}
        </div>
      </div>
    </section>
  );
}
