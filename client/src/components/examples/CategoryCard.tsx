import CategoryCard from '../CategoryCard'
import { Building2 } from "lucide-react"
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png"

export default function CategoryCardExample() {
  return (
    <div className="w-64">
      <CategoryCard 
        title="Venues" 
        image={venueImage}
        icon={Building2}
        href="/browse?category=venues"
      />
    </div>
  )
}
