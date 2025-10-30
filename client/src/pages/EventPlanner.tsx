import { useState } from "react";
import { useLocation } from "wouter";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronLeft } from "lucide-react";

const vendorTypes = [
  { id: "venue", label: "Venue" },
  { id: "photography", label: "Photography" },
  { id: "catering", label: "Catering" },
  { id: "florist", label: "Florist" },
  { id: "dj", label: "DJ/Entertainment" },
  { id: "decor", label: "Decor & Props" },
];

export default function EventPlanner() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [selectedVendorTypes, setSelectedVendorTypes] = useState<string[]>([]);
  const [guestCount, setGuestCount] = useState("");
  const [venueType, setVenueType] = useState("");

  const toggleVendorType = (id: string) => {
    setSelectedVendorTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    console.log("Event planner submitted:", {
      eventType,
      eventDate,
      eventLocation,
      budget,
      selectedVendorTypes,
      guestCount,
      venueType,
    });
    setLocation("/browse");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 bg-card/50 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-page-title">
              Event Planner
            </h1>
            <p className="text-muted-foreground">
              Answer a few questions to find your perfect vendors
            </p>
          </div>

          <div className="flex justify-between mb-8">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`flex-1 h-2 rounded-full mx-1 ${
                  s <= step ? 'bg-primary' : 'bg-muted'
                }`}
                data-testid={`progress-step-${s}`}
              />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {step === 1 && "Event Details"}
                {step === 2 && "Select Vendor Types"}
                {step === 3 && "Additional Information"}
              </CardTitle>
              <CardDescription>
                {step === 1 && "Tell us about your event"}
                {step === 2 && "What type of vendors do you need?"}
                {step === 3 && "Help us personalize your search"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="event-type">Event Type</Label>
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger id="event-type" data-testid="select-event-type">
                        <SelectValue placeholder="Select event type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wedding">Wedding</SelectItem>
                        <SelectItem value="corporate">Corporate Event</SelectItem>
                        <SelectItem value="birthday">Birthday Party</SelectItem>
                        <SelectItem value="anniversary">Anniversary</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="event-date">Event Date</Label>
                    <Input
                      id="event-date"
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      data-testid="input-event-date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="event-location">Location</Label>
                    <Input
                      id="event-location"
                      placeholder="City, State"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      data-testid="input-event-location"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="budget">Budget</Label>
                    <Select value={budget} onValueChange={setBudget}>
                      <SelectTrigger id="budget" data-testid="select-budget">
                        <SelectValue placeholder="Select budget range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="under-5k">Under $5,000</SelectItem>
                        <SelectItem value="5k-10k">$5,000 - $10,000</SelectItem>
                        <SelectItem value="10k-20k">$10,000 - $20,000</SelectItem>
                        <SelectItem value="20k-50k">$20,000 - $50,000</SelectItem>
                        <SelectItem value="over-50k">Over $50,000</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-4">
                    Select all that apply
                  </p>
                  {vendorTypes.map((type) => (
                    <div key={type.id} className="flex items-center gap-3 p-3 rounded-lg border hover-elevate">
                      <Checkbox
                        id={type.id}
                        checked={selectedVendorTypes.includes(type.id)}
                        onCheckedChange={() => toggleVendorType(type.id)}
                        data-testid={`checkbox-vendor-${type.id}`}
                      />
                      <Label htmlFor={type.id} className="cursor-pointer flex-1">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="guest-count">Expected Guest Count</Label>
                    <Input
                      id="guest-count"
                      type="number"
                      placeholder="e.g., 150"
                      value={guestCount}
                      onChange={(e) => setGuestCount(e.target.value)}
                      data-testid="input-guest-count"
                    />
                  </div>

                  {selectedVendorTypes.includes("venue") && (
                    <div className="space-y-2">
                      <Label htmlFor="venue-type">Venue Preference</Label>
                      <Select value={venueType} onValueChange={setVenueType}>
                        <SelectTrigger id="venue-type" data-testid="select-venue-type">
                          <SelectValue placeholder="Select preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="indoor">Indoor</SelectItem>
                          <SelectItem value="outdoor">Outdoor</SelectItem>
                          <SelectItem value="both">No Preference</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <p className="text-sm text-muted-foreground pt-4">
                    Great! We'll use this information to show you the most relevant vendors.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                {step > 1 && (
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    data-testid="button-back"
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                )}
                {step < 3 ? (
                  <Button
                    className="flex-1"
                    onClick={handleNext}
                    data-testid="button-next"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    data-testid="button-submit"
                  >
                    Find Vendors
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
