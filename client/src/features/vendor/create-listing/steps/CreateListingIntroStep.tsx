import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

interface CreateListingIntroStepProps {
  formData: ListingFormData;
  goNext: () => void;
  goBack: () => void;
}

export function CreateListingIntroStep({ formData, goNext, goBack }: CreateListingIntroStepProps) {
  return (
    <div className="max-w-2xl mx-auto p-8 flex flex-col items-center justify-center min-h-[600px]" data-testid="step-content-createIntro">
      <CheckCircle className="w-16 h-16 text-primary mb-6" />
      
      <h2 className="text-3xl font-bold mb-4 text-center">Great! Let's create your listing</h2>
      
      <Card className="p-6 mb-8 bg-muted">
        <div className="text-center">
          <p className="text-lg mb-2">
            <span className="font-semibold capitalize">{formData.serviceType.replace("-", " ")}</span>
          </p>
          <p className="text-muted-foreground">in {formData.city}</p>
        </div>
      </Card>

      <p className="text-muted-foreground mb-8 text-center max-w-md">
        We'll guide you through setting up your listing with all the details customers need to book you
      </p>

      <div className="flex gap-4">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={goNext} size="lg" className="editorial-cta-outline" data-testid="button-get-started">
          Get Started
        </Button>
      </div>
    </div>
  );
}
