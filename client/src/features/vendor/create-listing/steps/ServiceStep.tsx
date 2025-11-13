import { useState } from "react";
import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ServiceStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function ServiceStep({ formData, updateFormData, goNext, goBack }: ServiceStepProps) {
  const [description, setDescription] = useState(formData.serviceDescription || "");

  const handleNext = () => {
    updateFormData({ serviceDescription: description });
    goNext();
  };

  return (
    <div className="max-w-3xl mx-auto p-8" data-testid="step-content-service">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Describe your service</h2>
        <p className="text-muted-foreground">
          Tell customers what makes your service special
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Service Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you offer, your style, and what makes your service unique..."
            rows={10}
            data-testid="textarea-description"
          />
          <p className="text-sm text-muted-foreground mt-1">
            {description.length} characters
          </p>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!description} data-testid="button-next">
          Next
        </Button>
      </div>
    </div>
  );
}
