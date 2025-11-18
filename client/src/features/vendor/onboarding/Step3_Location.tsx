import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";
import { VendorOnboardingData } from "@/pages/VendorOnboarding";

interface Props {
  formData: VendorOnboardingData;
  updateFormData: (updates: Partial<VendorOnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step3_Location({ formData, updateFormData, onNext, onBack }: Props) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.city) {
      onNext();
    }
  };

  const useCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // In a real implementation, reverse geocode the coordinates to get city/state
          updateFormData({ city: "Current Location" });
        },
        (error) => {
          console.log("Geolocation error:", error);
        }
      );
    }
  };

  return (
    <Card className="rounded-xl shadow-lg">
      <CardHeader>
        <CardTitle>Where will you offer your service?</CardTitle>
        <CardDescription>Tell customers where you're located and where you serve</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => updateFormData({ city: e.target.value })}
              placeholder="Enter your city"
              required
              data-testid="input-city"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State / Region (optional)</Label>
            <Input
              id="state"
              value={formData.state}
              onChange={(e) => updateFormData({ state: e.target.value })}
              placeholder="Enter your state"
              data-testid="input-state"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceRadius">Service Radius (optional)</Label>
            <Input
              id="serviceRadius"
              value={formData.serviceRadius}
              onChange={(e) => updateFormData({ serviceRadius: e.target.value })}
              placeholder="e.g., 25 miles, County-wide, Statewide"
              data-testid="input-service-radius"
            />
            <p className="text-sm text-muted-foreground">
              How far are you willing to travel for events?
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={useCurrentLocation}
            className="w-full"
            data-testid="button-use-location"
          >
            <MapPin className="mr-2 h-4 w-4" />
            Use my current location
          </Button>

          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              data-testid="button-back"
            >
              Back
            </Button>
            <Button
              type="submit"
              disabled={!formData.city}
              data-testid="button-next"
            >
              Next
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
