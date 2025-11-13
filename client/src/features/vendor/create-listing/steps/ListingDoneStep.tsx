import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Clock } from "lucide-react";

interface ListingDoneStepProps {
  onClose: () => void;
  formData: ListingFormData;
}

export function ListingDoneStep({ onClose, formData }: ListingDoneStepProps) {
  const handleReturn = () => {
    localStorage.removeItem("createListingDraft");
    onClose();
  };

  return (
    <div className="max-w-2xl mx-auto p-8 flex flex-col items-center justify-center min-h-[600px]" data-testid="step-content-done">
      <CheckCircle className="w-20 h-20 text-primary mb-6" />
      
      <h2 className="text-3xl font-bold mb-4 text-center">Your listing has been submitted!</h2>
      
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        We're reviewing your listing to ensure it meets our quality standards.
        You'll receive a notification once it's approved.
      </p>

      <Card className="p-6 mb-8 w-full max-w-md">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
          </div>
          <div>
            <h3 className="font-semibold">Under Review</h3>
            <p className="text-sm text-muted-foreground">
              Typically takes 1-2 business days
            </p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Service:</span>
            <span className="font-medium capitalize">{formData.serviceType.replace("-", " ")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Location:</span>
            <span className="font-medium">{formData.city}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Offerings:</span>
            <span className="font-medium">{formData.offerings.length} packages</span>
          </div>
        </div>
      </Card>

      <Button onClick={handleReturn} size="lg" data-testid="button-return-listings">
        Return to Listings
      </Button>
    </div>
  );
}
