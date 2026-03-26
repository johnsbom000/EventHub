import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Star, MapPin, CheckCircle2, Calendar } from "lucide-react";
import type { Event } from "@shared/schema";
import { resolveAssetUrl } from "@/lib/runtimeUrls";

// Local type (because @shared/schema no longer exports Vendor)
type Vendor = {
  id: string;
  name: string;
  description?: string | null;

  imageUrl?: string | null;
  verified?: boolean | null;

  city?: string | null;
  state?: string | null;

  rating?: number | null;
  reviewCount?: number | null;

  travelFeeRequired?: boolean | null;
  blockedDates?: string[] | null;

  // optional: if your scoring uses price/budget, keep it here
  startingPrice?: number | null;
};

interface ScoredVendor {
  vendor: Vendor;
  scores: {
    availability: number;
    location: number;
    budget: number;
    serviceMatch: number;
    final: number;
  };
  labels: string[];
}

type VendorRecommendations = Record<string, ScoredVendor[]>;

export default function CuratedRecommendations() {
  const params = useParams();
  const eventId = params.eventId;

  const { data: event, isLoading: eventLoading } = useQuery<Event>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
  });

  const { data: recommendations, isLoading: recsLoading } = useQuery<VendorRecommendations>({
    queryKey: ["/api/events", eventId, "recommendations"],
    enabled: !!eventId,
  });

  const isLoading = eventLoading || recsLoading;

  const categoryDisplayNames: Record<string, string> = {
    photographer: "Photographers",
    videographer: "Videographers",
    florist: "Florists",
    catering: "Catering Services",
    dj: "DJs & Entertainment",
    "prop-decor": "Rentals",
  };

  const getAvailabilityStatus = (vendor: Vendor, eventDate: string) => {
    const blocked = vendor.blockedDates ?? [];
    if (blocked.includes(eventDate)) {
      return { text: "Not available", color: "destructive" as const };
    }
    return { text: "Available", color: "default" as const };
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />

      <main className="flex-1 bg-background">
        {isLoading ? (
          <div className="container mx-auto px-4 py-12 space-y-12">
            <div className="space-y-4">
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
            </div>
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="flex gap-6 overflow-hidden">
                  {[1, 2, 3, 4].map((j) => (
                    <Skeleton key={j} className="h-[400px] w-[320px] flex-shrink-0" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : event && recommendations ? (
          <div className="container mx-auto px-4 py-12 space-y-12">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold text-foreground" data-testid="text-recommendations-title">
                Your Curated Vendor Recommendations
              </h1>
              <p className="text-lg text-muted-foreground" data-testid="text-event-details">
                For your {event.eventType} on{" "}
                {new Date(event.date).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                in {event.location}
              </p>
            </div>

            {Object.entries(recommendations).map(([category, scoredVendors]) => (
              <div key={category} className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-semibold text-foreground" data-testid={`text-category-${category}`}>
                    {categoryDisplayNames[category] || category}
                  </h2>
                  <Button variant="outline" asChild data-testid={`button-view-all-${category}`}>
                    <Link href={`/browse?category=${category}`}>View all</Link>
                  </Button>
                </div>

                {scoredVendors.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <p className="text-muted-foreground">
                        No vendors found for this category. Try adjusting your requirements.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex gap-6 pb-4">
                      {scoredVendors.map((scoredVendor) => {
                        const { vendor, labels } = scoredVendor;
                        const availability = getAvailabilityStatus(vendor, event.date);

                        const vendorName = vendor.name ?? "Vendor";
                        const vendorRating = vendor.rating ?? 0;
                        const vendorReviews = vendor.reviewCount ?? 0;

                        return (
                          <Card
                            key={vendor.id}
                            className="w-[320px] flex-shrink-0 hover-elevate overflow-hidden"
                            data-testid={`card-vendor-${vendor.id}`}
                          >
                            <div className="relative h-[200px] bg-muted">
                              {vendor.imageUrl ? (
                                <img
                                  src={resolveAssetUrl(vendor.imageUrl)}
                                  alt={vendorName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  No image
                                </div>
                              )}

                              {labels.length > 0 && (
                                <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                                  {labels.map((label, idx) => (
                                    <Badge
                                      key={idx}
                                      variant="default"
                                      className="bg-primary text-primary-foreground"
                                      data-testid={`badge-${label.toLowerCase().replace(" ", "-")}-${vendor.id}`}
                                    >
                                      {label}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                              {vendor.verified && (
                                <div className="absolute top-3 right-3">
                                  <Badge variant="secondary" className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Verified
                                  </Badge>
                                </div>
                              )}
                            </div>

                            <CardContent className="p-6 space-y-4">
                              <div className="space-y-2">
                                <h3 className="text-xl font-semibold text-foreground" data-testid={`text-vendor-name-${vendor.id}`}>
                                  {vendorName}
                                </h3>

                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <MapPin className="w-4 h-4" />
                                  <span>
                                    {vendor.city ?? "—"}
                                    {vendor.state ? `, ${vendor.state}` : ""}
                                  </span>
                                  {vendor.travelFeeRequired && (
                                    <Badge variant="outline" className="text-xs">
                                      Travel fee
                                    </Badge>
                                  )}
                                </div>

                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1">
                                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                    <span className="font-medium text-foreground">{vendorRating}</span>
                                  </div>
                                  <span className="text-sm text-muted-foreground">({vendorReviews} reviews)</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-muted-foreground" />
                                  <Badge variant={availability.color} data-testid={`badge-availability-${vendor.id}`}>
                                    {availability.text}
                                  </Badge>
                                </div>
                              </div>

                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {vendor.description ?? ""}
                              </p>

                              <Button asChild className="w-full" data-testid={`button-view-vendor-${vendor.id}`}>
                                <Link href={`/vendor/${vendor.id}`}>View profile</Link>
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="container mx-auto px-4 py-12">
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">We couldn’t load recommendations for this event.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
