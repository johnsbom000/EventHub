import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import type { ListingPublic } from "@/types/listing";
import { Link } from "wouter";

interface ListingCardProps {
  listing: ListingPublic;

  // Temporary: we’ll wire real events later
  onAddToEvent?: (listingId: string) => void;
}

export default function ListingCard({ listing, onAddToEvent }: ListingCardProps) {
  const cover =
    listing.coverPhoto ??
    (Array.isArray(listing.photos) && listing.photos.length > 0
      ? typeof listing.photos[0] === "string"
        ? listing.photos[0]
        : undefined
      : undefined);

  const startingPrice =
    listing.startingPrice ??
    (listing.offerings?.length ? Math.min(...listing.offerings.map((o) => o.price)) : undefined);

  return (
    <Card className="overflow-hidden hover-elevate group" data-testid={`card-listing-${listing.id}`}>
      <div className="aspect-square overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={listing.serviceType || "Listing"}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            No photo yet
          </div>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-lg leading-tight truncate">
              {listing.serviceType || "Service"}
            </h3>
            {listing.vendorName && (
              <p className="text-sm text-muted-foreground truncate">
                {listing.vendorName}
              </p>
            )}
          </div>
          <Badge variant="secondary" className="shrink-0">
            Listing
          </Badge>
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span className="truncate">{listing.city || "—"}</span>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <span className="text-xs text-muted-foreground">Starting at</span>
            <p className="font-semibold text-lg">
              {typeof startingPrice === "number" ? `$${startingPrice.toLocaleString()}` : "—"}
            </p>
          </div>

          <div className="flex gap-2">
            <Link href={`/vendor/${listing.vendorId}`}>
              <Button variant="outline" size="sm" data-testid={`button-about-vendor-${listing.id}`}>
                Get to know
              </Button>
            </Link>

            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white"
              onClick={() => onAddToEvent?.(listing.id)}
              data-testid={`button-add-to-event-${listing.id}`}
            >
              Add to event
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
