import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, ArrowRight, Calendar } from "lucide-react";
import { ProfileFormData } from "../types";

interface ReadyToListStepProps {
  formData: ProfileFormData;
  updateFormData: (updates: Partial<ProfileFormData>) => void;
  onYes: () => void;
  onNo: () => void;
}

export function ReadyToListStep({ formData, onYes, onNo }: ReadyToListStepProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold" data-testid="heading-ready">
            Great! Your Profile is Complete
          </h1>
          <p className="text-lg text-muted-foreground">
            You've successfully set up your vendor profile. Now you can create your first listing to start receiving bookings.
          </p>
        </div>

        <Card className="p-8 space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">What's Next?</h2>
            <p className="text-muted-foreground">
              Creating a listing allows you to showcase your services, set your pricing, and define your availability. This helps customers find and book you for their events.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Define Your Offerings</p>
                <p className="text-sm text-muted-foreground">Set packages, pricing, and service details</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Set Your Availability</p>
                <p className="text-sm text-muted-foreground">Configure business hours and blocked dates</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Add Special Offers</p>
                <p className="text-sm text-muted-foreground">Create discounts and promotional packages</p>
              </div>
            </div>
          </div>

          <div className="pt-6 space-y-3">
            <p className="text-center font-medium text-lg">
              Ready to create your first listing now?
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                size="lg"
                onClick={onNo}
                data-testid="button-later"
                className="w-full"
              >
                <Calendar className="w-4 h-4 mr-2" />
                I'll Do This Later
              </Button>
              <Button
                size="lg"
                onClick={onYes}
                data-testid="button-create-listing"
                className="w-full"
              >
                Yes, Create Listing
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          You can always create a listing later from your vendor dashboard
        </p>
      </div>
    </div>
  );
}
