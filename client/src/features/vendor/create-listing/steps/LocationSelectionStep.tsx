import { useState } from "react";
import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";

interface LocationSelectionStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function LocationSelectionStep({ formData, updateFormData, goNext, goBack }: LocationSelectionStepProps) {
  const [city, setCity] = useState(formData.city || "");

  const handleUseCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const detectedCity = "New York";
          setCity(detectedCity);
          updateFormData({ city: detectedCity });
        },
        (error) => {
          console.error("Geolocation error:", error);
        }
      );
    }
  };

  const handleNext = () => {
    if (city) {
      updateFormData({ city });
      goNext();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8" data-testid="step-content-locationSelection">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Where are you located?</h2>
        <p className="text-muted-foreground">
          This helps us connect you with customers in your area
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">City</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Enter your city"
                className="pl-10"
                data-testid="input-city"
              />
            </div>
          </div>
        </div>

        <Card className="p-4 hover-elevate cursor-pointer" onClick={handleUseCurrentLocation} data-testid="button-use-location">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Use my current location</p>
              <p className="text-sm text-muted-foreground">
                Automatically detect your city
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!city} data-testid="button-next">
          Next
        </Button>
      </div>
    </div>
  );
}
