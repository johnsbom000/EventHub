import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { useState } from "react";
import heroImage from "@assets/generated_images/Wedding_celebration_hero_image_1c92aede.png";

export default function Hero() {
  const [location, setLocation] = useState("");
  const [eventType, setEventType] = useState("");

  const handleSearch = () => {
    console.log("Search triggered:", { location, eventType });
  };

  return (
    <div className="relative h-[85vh] min-h-[600px] flex items-center justify-center overflow-hidden">
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
      
      <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
        <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6" data-testid="text-hero-title">
          Find Your Perfect Event Vendor
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-white/90 mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
          Connect with trusted professionals to make your celebration unforgettable
        </p>

        <div className="flex flex-col sm:flex-row gap-3 max-w-3xl mx-auto mb-8">
          <div className="flex-1 relative">
            <Input
              placeholder="Enter location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-12 bg-white/95 backdrop-blur-md border-white/20 pr-10"
              data-testid="input-location"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="h-12 sm:w-[200px] bg-white/95 backdrop-blur-md border-white/20" data-testid="select-event-type">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wedding">Wedding</SelectItem>
              <SelectItem value="corporate">Corporate Event</SelectItem>
              <SelectItem value="birthday">Birthday Party</SelectItem>
              <SelectItem value="anniversary">Anniversary</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Button size="lg" className="h-12 px-8" onClick={handleSearch} data-testid="button-search">
            Search
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button size="lg" variant="default" className="min-w-[200px]" data-testid="button-find-vendor">
            Find Your Vendor
          </Button>
          <Button size="lg" variant="outline" className="min-w-[200px] bg-white/10 backdrop-blur-md border-white/30 text-white hover:bg-white/20" data-testid="button-browse-category">
            Browse by Category
          </Button>
        </div>
      </div>
    </div>
  );
}
