import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Star } from "lucide-react";
import { Link } from "wouter";

interface VendorCardProps {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  location: string;
  startingPrice: string;
  image: string;
}

export default function VendorCard({ 
  id, 
  name, 
  category, 
  rating, 
  reviewCount, 
  location, 
  startingPrice, 
  image 
}: VendorCardProps) {
  return (
    <Card className="overflow-hidden hover-elevate group cursor-pointer" data-testid={`card-vendor-${id}`}>
      <div className="aspect-square overflow-hidden">
        <img 
          src={image} 
          alt={name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-lg leading-tight" data-testid={`text-vendor-name-${id}`}>{name}</h3>
          <Badge variant="secondary" className="shrink-0 editorial-category-pill">{category}</Badge>
        </div>
        
        <div className="flex items-center gap-1 text-sm">
          <Star className="h-4 w-4 fill-primary text-primary" />
          <span className="font-medium" data-testid={`text-rating-${id}`}>{rating}</span>
          <span className="text-muted-foreground">({reviewCount})</span>
        </div>
        
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span data-testid={`text-location-${id}`}>{location}</span>
        </div>
        
        <div className="flex items-center justify-between pt-2">
          <div>
            <span className="text-xs text-muted-foreground">Starting at</span>
            <p className="font-semibold text-lg editorial-price" data-testid={`text-price-${id}`}>{startingPrice}</p>
          </div>
          <Link href={`/vendor/${id}`}>
            <Button variant="outline" size="sm" data-testid={`button-view-profile-${id}`}>
              View Profile
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
