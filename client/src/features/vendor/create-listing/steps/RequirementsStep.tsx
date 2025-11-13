import { useState } from "react";
import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

interface RequirementsStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function RequirementsStep({ formData, updateFormData, goNext, goBack }: RequirementsStepProps) {
  const [agreeToTerms, setAgreeToTerms] = useState(formData.agreeToTerms || false);
  const [agreeToGuidelines, setAgreeToGuidelines] = useState(formData.agreeToGuidelines || false);

  const handleNext = () => {
    updateFormData({ agreeToTerms, agreeToGuidelines });
    goNext();
  };

  const canProceed = agreeToTerms && agreeToGuidelines;

  return (
    <div className="max-w-3xl mx-auto p-8" data-testid="step-content-requirements">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Terms and requirements</h2>
        <p className="text-muted-foreground">
          Please review and accept our terms
        </p>
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              checked={agreeToTerms}
              onCheckedChange={(checked) => setAgreeToTerms(checked as boolean)}
              data-testid="checkbox-terms"
            />
            <div className="flex-1">
              <Label htmlFor="terms" className="text-base font-medium cursor-pointer">
                I agree to the Terms of Service
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                By checking this box, you agree to comply with Event Hub's Terms of Service,
                including payment processing, cancellation policies, and vendor guidelines.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="guidelines"
              checked={agreeToGuidelines}
              onCheckedChange={(checked) => setAgreeToGuidelines(checked as boolean)}
              data-testid="checkbox-guidelines"
            />
            <div className="flex-1">
              <Label htmlFor="guidelines" className="text-base font-medium cursor-pointer">
                I agree to the Community Guidelines
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                You commit to providing professional service, responding to inquiries promptly,
                and maintaining accurate listing information.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={handleNext} disabled={!canProceed} data-testid="button-next">
          Continue to Review
        </Button>
      </div>
    </div>
  );
}
