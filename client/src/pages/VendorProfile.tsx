import { useState } from "react";
import { useRoute } from "wouter";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Star, Calendar as CalendarIcon, DollarSign, MessageCircle } from "lucide-react";
import venueImage from "@assets/generated_images/Elegant_venue_category_image_2de26e8e.png";

export default function VendorProfile() {
  const [, params] = useRoute("/vendor/:id");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const handleBooking = () => {
    console.log("Booking request for:", params?.id, selectedDate);
  };

  const handleMessage = () => {
    console.log("Message vendor:", params?.id);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 bg-background">
        <div className="relative h-[400px] overflow-hidden">
          <img 
            src={venueImage} 
            alt="Vendor cover"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10 pb-12">
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              <Card className="mb-8">
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <h1 className="text-3xl font-bold mb-2" data-testid="text-vendor-name">
                        Grand Ballroom Events
                      </h1>
                      <Badge variant="secondary" className="mb-3">Venues</Badge>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-primary text-primary" />
                          <span className="font-medium">4.9</span>
                          <span className="text-muted-foreground">(127 reviews)</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>New York, NY</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="prose max-w-none">
                    <h2 className="text-xl font-semibold mb-3">About</h2>
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-vendor-description">
                      Grand Ballroom Events offers elegant event spaces perfect for weddings, corporate gatherings, and special celebrations. Our stunning venues feature high ceilings, beautiful chandeliers, and customizable layouts to suit your vision. With over 15 years of experience, we've hosted thousands of successful events and pride ourselves on exceptional service and attention to detail.
                    </p>
                  </div>

                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <img src={venueImage} alt="Gallery 1" className="w-full aspect-video object-cover rounded-lg" />
                    <img src={venueImage} alt="Gallery 2" className="w-full aspect-video object-cover rounded-lg" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4">Reviews</h2>
                  <div className="space-y-4">
                    {[1, 2].map((review) => (
                      <div key={review} className="border-b last:border-0 pb-4 last:pb-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                            ))}
                          </div>
                          <span className="font-medium">Sarah M.</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Absolutely stunning venue! The staff was incredibly helpful and made our wedding day perfect.
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:w-96">
              <Card className="sticky top-4">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span>Starting at</span>
                    </div>
                    <p className="text-3xl font-bold" data-testid="text-vendor-price">$5,000</p>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 text-sm mb-2">
                      <CalendarIcon className="h-4 w-4" />
                      <span className="font-medium">Select a date</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Check availability for your event
                    </p>
                  </div>

                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={handleBooking}
                    data-testid="button-request-booking"
                  >
                    Request Booking
                  </Button>

                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleMessage}
                    data-testid="button-message-vendor"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Message Vendor
                  </Button>

                  <div className="border-t pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Response time</span>
                      <span className="font-medium">Within 24 hours</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deposit required</span>
                      <span className="font-medium">$1,500</span>
                    </div>
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
