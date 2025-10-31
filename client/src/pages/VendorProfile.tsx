import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Star, DollarSign, MessageCircle, Check, Shield, Calendar as CalendarIcon, Package2, Sparkles } from "lucide-react";
import { type Vendor } from "@shared/schema";
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png";

export default function VendorProfile() {
  const [, params] = useRoute("/vendor/:id");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);

  const { data: vendor, isLoading } = useQuery<Vendor>({
    queryKey: ["/api/vendors", params?.id],
    queryFn: async () => {
      const response = await fetch(`/api/vendors/${params?.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch vendor');
      }
      return response.json();
    },
    enabled: !!params?.id,
  });

  const handleBooking = () => {
    console.log("Booking request for:", vendor?.name, selectedDate);
    setBookingDialogOpen(true);
  };

  const handleMessage = () => {
    console.log("Message vendor:", vendor?.name);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <main className="flex-1 bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Loading vendor information...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navigation />
        <main className="flex-1 bg-background flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Vendor Not Found</h1>
            <p className="text-muted-foreground">The vendor you're looking for doesn't exist.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const blockedDates = vendor.blockedDates?.map(dateStr => new Date(dateStr)) || [];

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 bg-background">
        <div className="relative h-[400px] overflow-hidden">
          <img 
            src={vendor.imageUrl || venueImage} 
            alt={vendor.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10 pb-12">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main Content */}
            <div className="flex-1 space-y-6">
              {/* Header Card */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h1 className="text-3xl font-bold" data-testid="text-vendor-name">
                          {vendor.name}
                        </h1>
                        {vendor.verified && (
                          <Badge variant="secondary" className="gap-1">
                            <Shield className="h-3 w-3" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="mb-3 capitalize">{vendor.category}</Badge>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-primary text-primary" />
                          <span className="font-medium">{vendor.rating}</span>
                          <span className="text-muted-foreground">({vendor.reviewCount} reviews)</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{vendor.city}, {vendor.state}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {vendor.description && (
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-vendor-description">
                      {vendor.description}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* About Section */}
              {vendor.aboutSection && (
                <Card>
                  <CardHeader>
                    <CardTitle>About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-line" data-testid="text-vendor-about">
                      {vendor.aboutSection}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Packages */}
              {vendor.packages && vendor.packages.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package2 className="h-5 w-5" />
                      Packages
                    </CardTitle>
                    <CardDescription>
                      Choose the perfect package for your event
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {vendor.packages.map((pkg, index) => (
                      <Card key={index} className={pkg.popular ? "border-primary" : ""} data-testid={`card-package-${index}`}>
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold">{pkg.name}</h3>
                                {pkg.popular && (
                                  <Badge variant="default" className="gap-1">
                                    <Sparkles className="h-3 w-3" />
                                    Popular
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{pkg.description}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold">${pkg.price.toLocaleString()}</p>
                            </div>
                          </div>
                          <Separator className="my-4" />
                          <div className="space-y-2">
                            <p className="text-sm font-medium mb-2">Includes:</p>
                            {pkg.inclusions.map((item, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm">
                                <Check className="h-4 w-4 text-primary shrink-0" />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Add-ons */}
              {vendor.addOns && vendor.addOns.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Add-ons</CardTitle>
                    <CardDescription>
                      Customize your package with these extras
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {vendor.addOns.map((addOn, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 rounded-lg border hover-elevate"
                          data-testid={`addon-${index}`}
                        >
                          <div>
                            <p className="font-medium">{addOn.name}</p>
                            <p className="text-sm text-muted-foreground">{addOn.description}</p>
                          </div>
                          <p className="font-semibold">+${addOn.price}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Reviews */}
              <Card>
                <CardHeader>
                  <CardTitle>Reviews ({vendor.reviewCount})</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const rating = parseFloat(vendor.rating);
                        const isFilled = i < Math.floor(rating);
                        return (
                          <Star 
                            key={i} 
                            className={`h-5 w-5 ${isFilled ? 'fill-primary text-primary' : 'text-muted-foreground'}`}
                          />
                        );
                      })}
                    </div>
                    <span className="text-lg font-semibold">{vendor.rating}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {vendor.reviews && vendor.reviews.length > 0 ? (
                      vendor.reviews.map((review, index) => (
                        <div key={index} className="border-b last:border-0 pb-6 last:pb-0" data-testid={`review-${index}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-medium">{review.reviewerName}</p>
                              {review.eventType && (
                                <p className="text-sm text-muted-foreground">{review.eventType}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex gap-1">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <Star 
                                    key={i} 
                                    className={`h-4 w-4 ${i < review.rating ? 'fill-primary text-primary' : 'text-muted-foreground'}`}
                                  />
                                ))}
                              </div>
                              <span className="text-sm text-muted-foreground">{new Date(review.date).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <p className="text-muted-foreground">{review.comment}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No reviews yet. Be the first to review!</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="lg:w-96">
              <Card className="sticky top-4">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span>Starting at</span>
                    </div>
                    <p className="text-3xl font-bold" data-testid="text-vendor-price">
                      ${vendor.basePrice.toLocaleString()}
                    </p>
                    {vendor.priceRangeMax && (
                      <p className="text-sm text-muted-foreground">
                        Up to ${vendor.priceRangeMax.toLocaleString()}
                      </p>
                    )}
                  </div>

                  <Separator />

                  {/* Availability Calendar */}
                  <div>
                    <div className="flex items-center gap-2 text-sm mb-3">
                      <CalendarIcon className="h-4 w-4" />
                      <span className="font-medium">Check Availability</span>
                    </div>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date) => {
                        return blockedDates.some(blockedDate => 
                          blockedDate.toDateString() === date.toDateString()
                        ) || date < new Date();
                      }}
                      className="rounded-md border"
                      data-testid="calendar-availability"
                    />
                    {selectedDate && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Selected: {selectedDate.toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        className="w-full" 
                        size="lg"
                        onClick={handleBooking}
                        data-testid="button-book-now"
                      >
                        Book Now
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Request Booking</DialogTitle>
                        <DialogDescription>
                          Send a booking request to {vendor.name}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <p className="text-sm"><span className="font-medium">Vendor:</span> {vendor.name}</p>
                          <p className="text-sm"><span className="font-medium">Date:</span> {selectedDate?.toLocaleDateString() || 'Not selected'}</p>
                          <p className="text-sm"><span className="font-medium">Starting Price:</span> ${vendor.basePrice.toLocaleString()}</p>
                        </div>
                        <Separator />
                        <p className="text-sm text-muted-foreground">
                          A booking request will be sent to the vendor. They typically respond within 24 hours.
                        </p>
                        <Button className="w-full" onClick={() => {
                          console.log("Booking confirmed for", selectedDate);
                          setBookingDialogOpen(false);
                        }}>
                          Confirm Request
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleMessage}
                    data-testid="button-message-vendor"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Message Vendor
                  </Button>

                  <Separator />

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Response time</span>
                      <span className="font-medium">Within 24 hours</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Service area</span>
                      <span className="font-medium">{vendor.serviceArea?.[0] || vendor.city}</span>
                    </div>
                    {vendor.travelFeeRequired && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Travel fee</span>
                        <span className="font-medium">May apply</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
