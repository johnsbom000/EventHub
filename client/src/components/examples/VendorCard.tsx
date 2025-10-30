import VendorCard from '../VendorCard'
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png"

export default function VendorCardExample() {
  return (
    <div className="w-80">
      <VendorCard 
        id="1"
        name="Grand Ballroom Events"
        category="Venues"
        rating={4.9}
        reviewCount={127}
        location="New York, NY"
        startingPrice="$5,000"
        image={venueImage}
      />
    </div>
  )
}
