import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { VendorOnboardingData } from "@/pages/VendorOnboarding";

interface Props {
  formData: VendorOnboardingData;
  updateFormData: (updates: Partial<VendorOnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step5_ServiceDescription({ formData, updateFormData, onNext, onBack }: Props) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.serviceHeadline && formData.serviceDescription) {
      onNext();
    }
  };

  return (
    <Card className="rounded-xl shadow-lg">
      <CardHeader>
        <CardTitle>Describe what you offer</CardTitle>
        <CardDescription>Help customers understand your services and what makes you special</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="serviceHeadline">Service Headline *</Label>
            <Input
              id="serviceHeadline"
              value={formData.serviceHeadline}
              onChange={(e) => updateFormData({ serviceHeadline: e.target.value })}
              placeholder="e.g., Luxury bridal makeup & hair styling"
              required
              data-testid="input-service-headline"
            />
            <p className="text-sm text-muted-foreground">
              A catchy one-liner that describes your main service
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceDescription">Detailed Description *</Label>
            <Textarea
              id="serviceDescription"
              value={formData.serviceDescription}
              onChange={(e) => updateFormData({ serviceDescription: e.target.value })}
              placeholder="Describe your services in detail. What do you offer? What's your style? What makes you unique? Include any specialties, techniques, or packages you provide..."
              rows={8}
              required
              data-testid="textarea-service-description"
            />
            <p className="text-sm text-muted-foreground">
              Be specific about what you offer, your experience, and what sets you apart
            </p>
          </div>

          <div className="bg-accent rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">Tips for a great description:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Highlight your unique style or approach</li>
              <li>• Mention any certifications or awards</li>
              <li>• Describe your typical packages or starting prices</li>
              <li>• Share what clients love about working with you</li>
            </ul>
          </div>

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
              disabled={!formData.serviceHeadline || !formData.serviceDescription}
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
