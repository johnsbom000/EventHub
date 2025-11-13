import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface ReviewSubmitStepProps {
  formData: ListingFormData;
  goNext: () => void;
  goBack: () => void;
  saveDraft?: () => void;
  listingId: string | null;
  updateDraft: any; // UseMutationResult type
}

export function ReviewSubmitStep({ formData, goNext, goBack, saveDraft, listingId, updateDraft }: ReviewSubmitStepProps) {
  const { toast } = useToast();
  const [lastSavedData, setLastSavedData] = useState<string>("");
  
  const isValid = 
    formData.serviceType &&
    formData.city &&
    formData.photos.length >= 15 &&
    formData.serviceDescription &&
    formData.offerings.length > 0 &&
    formData.businessHours.some((h) => h.enabled && h.timeRanges.length > 0) &&
    formData.agreeToTerms &&
    formData.agreeToGuidelines;

  const validationErrors = [];
  if (!formData.serviceType) validationErrors.push("Service type is required");
  if (!formData.city) validationErrors.push("City is required");
  if (formData.photos.length < 15) validationErrors.push(`Need ${15 - formData.photos.length} more photos (minimum 15)`);
  if (!formData.serviceDescription) validationErrors.push("Service description is required");
  if (formData.offerings.length === 0) validationErrors.push("At least one package is required");
  if (!formData.businessHours.some((h) => h.enabled && h.timeRanges.length > 0)) validationErrors.push("Business hours are required");
  if (!formData.agreeToTerms || !formData.agreeToGuidelines) validationErrors.push("Terms and guidelines must be accepted");

  const handleSubmit = () => {
    if (!isValid) return;
    console.log("Submitting listing:", formData);
    goNext();
  };

  const handleSaveDraft = () => {
    if (!listingId) {
      toast({
        title: "Error",
        description: "Listing ID not found. Please try again.",
        variant: "destructive",
      });
      return;
    }

    const currentDataString = JSON.stringify(formData);
    
    // Check if there are any changes since last save
    if (lastSavedData === currentDataString && lastSavedData !== "") {
      toast({
        title: "Listing Already Saved",
        description: "No changes detected since last save.",
      });
      return;
    }
    
    // Save to database via API
    updateDraft.mutate(
      { id: listingId, listingData: formData },
      {
        onSuccess: () => {
          setLastSavedData(currentDataString);
          toast({
            title: "Changes Saved",
            description: "Your listing draft has been saved successfully.",
          });
        },
        onError: (error: any) => {
          toast({
            title: "Save Failed",
            description: error.message || "Failed to save listing. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-8" data-testid="step-content-reviewSubmit">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Review your listing</h2>
        <p className="text-muted-foreground">
          Check everything before submitting
        </p>
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2">Service Type</h3>
            <p className="text-muted-foreground capitalize">{formData.serviceType.replace("-", " ")}</p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Location</h3>
            <p className="text-muted-foreground">{formData.city}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {formData.travelMode === "travel-to-guests"
                ? `Travels up to ${formData.serviceRadius} miles`
                : `Studio at ${formData.serviceAddress}`}
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Experience</h3>
            <p className="text-muted-foreground">{formData.experience} years</p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Photos</h3>
            <p className="text-muted-foreground">{formData.photos.length} photos uploaded</p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Offerings</h3>
            <p className="text-muted-foreground">{formData.offerings.length} packages created</p>
            <div className="mt-2 space-y-1">
              {formData.offerings.map((offering) => (
                <div key={offering.id} className="text-sm">
                  <span className="font-medium">{offering.title}</span> - ${offering.price}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Business Hours</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              {formData.businessHours
                .filter((h) => h.enabled)
                .map((h) => (
                  <div key={h.day}>
                    {h.day}: {h.timeRanges.map(r => `${r.start}-${r.end}`).join(", ")}
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div>
          <Card className="p-6">
            <div className="aspect-square bg-muted rounded-lg mb-4 flex items-center justify-center">
              {formData.photos[0] ? (
                <img
                  src={formData.photos[0] as string}
                  alt="Listing preview"
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <p className="text-muted-foreground">No photo</p>
              )}
            </div>
            <h3 className="text-xl font-bold mb-2 capitalize">
              {formData.serviceType.replace("-", " ")}
            </h3>
            <p className="text-muted-foreground mb-4">{formData.city}</p>
            <p className="text-sm line-clamp-3">{formData.serviceDescription}</p>
          </Card>
        </div>
      </div>
      {!isValid && validationErrors.length > 0 && (
        <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg p-4 mt-6">
          <p className="font-semibold mb-2">Please complete the following:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleSaveDraft} 
            size="lg"
            data-testid="button-save-draft"
          >Activate</Button>
          <Button 
            onClick={handleSubmit} 
            size="lg" 
            disabled={!isValid}
            data-testid="button-submit"
            className="bg-red-600 text-white hover:bg-red-700"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Submit for Review
          </Button>
        </div>
      </div>
    </div>
  );
}
