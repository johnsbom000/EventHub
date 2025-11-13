import { useState } from "react";
import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Car, Home as HomeIcon } from "lucide-react";

interface LocationStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function LocationStep({ formData, updateFormData, goNext, goBack }: LocationStepProps) {
  const [travelMode, setTravelMode] = useState<"travel-to-guests" | "guests-come-to-you">(
    formData.travelMode || "travel-to-guests"
  );
  const [serviceRadius, setServiceRadius] = useState(formData.serviceRadius || 25);
  const [serviceAddress, setServiceAddress] = useState(formData.serviceAddress || "");

  const handleNext = () => {
    updateFormData({ 
      travelMode, 
      serviceRadius: travelMode === "travel-to-guests" ? serviceRadius : undefined,
      serviceAddress: travelMode === "guests-come-to-you" ? serviceAddress : undefined
    });
    goNext();
  };

  return (
    <div className="max-w-3xl mx-auto p-8" data-testid="step-content-location">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">How do you serve customers?</h2>
        <p className="text-muted-foreground">
          Let customers know where they can expect your services
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card
          onClick={() => setTravelMode("travel-to-guests")}
          className={`p-6 cursor-pointer hover-elevate ${
            travelMode === "travel-to-guests" ? "ring-2 ring-primary" : ""
          }`}
          data-testid="option-travel-to-guests"
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              travelMode === "travel-to-guests" ? "bg-primary text-white" : "bg-muted"
            }`}>
              <Car className="w-8 h-8" />
            </div>
            <div>
              <p className="font-medium">I travel to guests</p>
              <p className="text-sm text-muted-foreground">Mobile service</p>
            </div>
          </div>
        </Card>

        <Card
          onClick={() => setTravelMode("guests-come-to-you")}
          className={`p-6 cursor-pointer hover-elevate ${
            travelMode === "guests-come-to-you" ? "ring-2 ring-primary" : ""
          }`}
          data-testid="option-guests-come-to-you"
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              travelMode === "guests-come-to-you" ? "bg-primary text-white" : "bg-muted"
            }`}>
              <HomeIcon className="w-8 h-8" />
            </div>
            <div>
              <p className="font-medium">Guests come to me</p>
              <p className="text-sm text-muted-foreground">Studio/venue service</p>
            </div>
          </div>
        </Card>
      </div>

      {travelMode === "travel-to-guests" && (
        <div className="space-y-4">
          <div>
            <Label>Service Radius (miles)</Label>
            <Input
              type="number"
              value={serviceRadius}
              onChange={(e) => setServiceRadius(parseInt(e.target.value) || 0)}
              min="0"
              data-testid="input-service-radius"
            />
            <p className="text-sm text-muted-foreground mt-1">
              How far are you willing to travel?
            </p>
          </div>
        </div>
      )}

      {travelMode === "guests-come-to-you" && (
        <div className="space-y-4">
          <div>
            <Label>Service Address</Label>
            <Input
              value={serviceAddress}
              onChange={(e) => setServiceAddress(e.target.value)}
              placeholder="123 Main St, City, State ZIP"
              data-testid="input-service-address"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Where should customers visit you?
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={handleNext} data-testid="button-next">
          Next
        </Button>
      </div>
    </div>
  );
}
