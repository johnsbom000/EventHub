import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";

import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { Star, MapPin, Heart, Check, Calendar, DollarSign, Award, Users } from "lucide-react";
import { resolveAssetUrl } from "@/lib/runtimeUrls";

/**
 * Local types (because these are NOT exported from @shared/schema anymore).
 * Keep them aligned with whatever your /api/vendors/:id endpoint returns.
 */
type VendorPackage = {
  name: string;
  description?: string | null;
  price: number;
  popular?: boolean | null;
  inclusions: string[];
};

type VendorAddOn = {
  name: string;
  description?: string | null;
  price: number;
};

type VendorReview = {
  reviewerName: string;
  rating?: number | null;
  comment?: string | null;
  createdAt?: string | null;
  eventType?: string | null;
};

type Vendor = {
  id: string;
  name: string;
  category: string;
  city: string;
  state: string;

  basePrice: number;
  priceRangeMax: number | null;

  rating: number | string;
  reviewCount: number;
  bookingCount: number;

  verified: boolean;
  imageUrl: string | null;

  description: string | null;
  aboutSection: string | null;

  packages: VendorPackage[] | null;
  addOns: VendorAddOn[] | null;
  reviews: VendorReview[] | null;
};

function toNumber(value: number | string): number {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function StarRow({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < fullStars;
        // Simple half-star visual: we’ll just fill the next star if half exists.
        const halfFilled = !filled && hasHalf && i === fullStars;

        return (
          <Star
            key={i}
            className={`h-4 w-4 ${
              filled || halfFilled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function VendorProfile() {
  const [, params] = useRoute("/vendor/:id");
  const vendorId = params?.id;
  const [isFavorite, setIsFavorite] = useState(false);

  const { data: vendor, isLoading } = useQuery<Vendor>({
    queryKey: ["/api/vendors", vendorId],
    enabled: !!vendorId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading vendor details...</p>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Vendor not found</h1>
          <p className="text-muted-foreground">The vendor you're looking for doesn't exist.</p>
          <Button onClick={() => window.history.back()} data-testid="button-go-back">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const ratingNumber = toNumber(vendor.rating);
  const vendorImageUrl = resolveAssetUrl(vendor.imageUrl);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {/* Hero Section */}
      <div className="relative h-[400px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: vendorImageUrl
              ? `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${vendorImageUrl})`
              : "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%)",
          }}
        />
        <div className="absolute inset-0 flex items-end">
          <div className="container mx-auto px-6 pb-8">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-sm editorial-category-pill" data-testid="badge-category">
                    {vendor.category}
                  </Badge>
                  {vendor.verified && (
                    <Badge variant="default" className="text-sm gap-1" data-testid="badge-verified">
                      <Award className="h-3 w-3" />
                      Verified
                    </Badge>
                  )}
                </div>
                <h1 className="text-4xl font-bold text-white" data-testid="text-vendor-name">
                  {vendor.name}
                </h1>

                <div className="flex items-center gap-4 flex-wrap text-white/90">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span data-testid="text-location">
                      {vendor.city}, {vendor.state}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <StarRow rating={ratingNumber} />
                    <span className="font-medium" data-testid="text-rating">
                      {ratingNumber.toFixed(1)}
                    </span>
                    <span className="text-sm">({vendor.reviewCount} reviews)</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span className="text-sm" data-testid="text-bookings">
                      {vendor.bookingCount} bookings
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className={`bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 ${
                    isFavorite ? "bg-white/30" : ""
                  }`}
                  onClick={() => setIsFavorite((v) => !v)}
                  data-testid="button-favorite"
                >
                  <Heart className={`h-5 w-5 ${isFavorite ? "fill-white" : ""}`} />
                  {isFavorite ? "Saved" : "Save"}
                </Button>

                <Button
                  variant="default"
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  data-testid="button-book-now"
                >
                  <Calendar className="h-5 w-5 mr-2" />
                  Book Now
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* About */}
            {(vendor.description || vendor.aboutSection) && (
              <section>
                <h2 className="text-2xl font-bold mb-4">About</h2>
                <Card className="p-6">
                  <p className="text-muted-foreground leading-relaxed" data-testid="text-description">
                    {vendor.description || vendor.aboutSection}
                  </p>
                </Card>
              </section>
            )}

            {/* Packages */}
            {vendor.packages && vendor.packages.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Packages</h2>
                <div className="grid gap-4">
                  {vendor.packages.map((pkg: VendorPackage, index: number) => (
                    <Card
                      key={index}
                      className={`p-6 ${pkg.popular ? "border-primary border-2" : ""}`}
                      data-testid={`card-package-${index}`}
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-xl font-semibold" data-testid={`text-package-name-${index}`}>
                              {pkg.name}
                            </h3>
                            {pkg.popular && (
                              <Badge variant="default" className="text-xs" data-testid={`badge-popular-${index}`}>
                                Most Popular
                              </Badge>
                            )}
                          </div>
                          {pkg.description && (
                            <p className="text-sm text-muted-foreground" data-testid={`text-package-description-${index}`}>
                              {pkg.description}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <div
                            className="flex items-center gap-1 text-2xl font-bold text-primary"
                            data-testid={`text-package-price-${index}`}
                          >
                            <DollarSign className="h-5 w-5" />
                            {pkg.price.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <Separator className="my-4" />

                      <div className="space-y-2">
                        <h4 className="font-medium text-sm text-muted-foreground">Included:</h4>
                        <ul className="space-y-2">
                          {pkg.inclusions.map((inclusion: string, i: number) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm"
                              data-testid={`text-inclusion-${index}-${i}`}
                            >
                              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                              <span>{inclusion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <Button className="w-full mt-6" data-testid={`button-select-package-${index}`}>
                        Select Package
                      </Button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Add-Ons */}
            {vendor.addOns && vendor.addOns.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Add-Ons</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {vendor.addOns.map((addOn: VendorAddOn, index: number) => (
                    <Card key={index} className="p-4" data-testid={`card-addon-${index}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-semibold" data-testid={`text-addon-name-${index}`}>
                          {addOn.name}
                        </h3>
                        <span className="font-bold text-primary shrink-0" data-testid={`text-addon-price-${index}`}>
                          +${addOn.price}
                        </span>
                      </div>
                      {addOn.description && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-addon-description-${index}`}>
                          {addOn.description}
                        </p>
                      )}
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Reviews */}
            {vendor.reviews && vendor.reviews.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4">Reviews</h2>
                <div className="space-y-4">
                  {vendor.reviews.map((review: VendorReview, index: number) => {
                    const reviewRating = typeof review.rating === "number" ? review.rating : 0;
                    const initials =
                      review.reviewerName?.trim()?.substring(0, 2)?.toUpperCase() || "CU";

                    return (
                      <Card key={index} className="p-6" data-testid={`card-review-${index}`}>
                        <div className="flex items-start gap-4">
                          <Avatar>
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                              <div>
                                <h3 className="font-semibold" data-testid={`text-reviewer-name-${index}`}>
                                  {review.reviewerName}
                                </h3>
                                {review.eventType && (
                                  <p className="text-sm text-muted-foreground" data-testid={`text-event-type-${index}`}>
                                    {review.eventType}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <StarRow rating={reviewRating} />
                                <span className="text-sm font-medium">{reviewRating.toFixed(1)}</span>
                              </div>
                            </div>

                            {review.comment && (
                              <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-review-comment-${index}`}>
                                {review.comment}
                              </p>
                            )}

                            {review.createdAt && (
                              <p className="text-xs text-muted-foreground mt-3" data-testid={`text-review-date-${index}`}>
                                {new Date(review.createdAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Right Rail */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Starting price</h3>
              <div className="text-3xl font-bold text-primary editorial-price" data-testid="text-starting-price">
                ${vendor.basePrice.toLocaleString()}
              </div>
              {vendor.priceRangeMax && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-price-range">
                  Up to ${vendor.priceRangeMax.toLocaleString()}
                </p>
              )}
              <Button className="w-full mt-4" data-testid="button-request-booking">
                Request Booking
              </Button>
              <Button variant="outline" className="w-full mt-2" data-testid="button-contact-vendor">
                Contact (email)
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Messaging is temporarily disabled — we’ll connect you via email.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
