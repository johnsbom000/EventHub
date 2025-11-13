import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Package } from "lucide-react";

interface OfferingsStepProps {
  formData: ListingFormData;
  goNext: () => void;
  goBack: () => void;
}

export function OfferingsStep({ formData, goNext, goBack }: OfferingsStepProps) {
  return (
    <div className="max-w-3xl mx-auto p-8 flex flex-col items-center justify-center min-h-[600px]" data-testid="step-content-offerings">
      <Package className="w-16 h-16 text-primary mb-6" />
      
      <h2 className="text-3xl font-bold mb-4 text-center">Create your offerings</h2>
      
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        Offerings are the different packages or services you provide. You'll set up pricing, duration, and details for each one.
      </p>

      <Card className="p-6 mb-8 bg-muted max-w-md">
        <h3 className="font-semibold mb-2">Examples of offerings:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>Basic Package - $500</li>
          <li>Premium Package - $1,200</li>
          <li>Full Day Service - $2,000</li>
        </ul>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={goNext} data-testid="button-skip">
            Skip
          </Button>
          <Button onClick={goNext} size="lg" data-testid="button-add-offering">
            Add Offering
          </Button>
        </div>
      </div>
    </div>
  );
}
