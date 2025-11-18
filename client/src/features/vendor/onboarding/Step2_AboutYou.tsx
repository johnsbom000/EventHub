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

export default function Step2_AboutYou({ formData, updateFormData, onNext, onBack }: Props) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.businessName && formData.contactName && formData.bio) {
      onNext();
    }
  };

  return (
    <Card className="rounded-xl shadow-lg">
      <CardHeader>
        <CardTitle>Tell us about you and your business</CardTitle>
        <CardDescription>Help customers get to know you better</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name *</Label>
            <Input
              id="businessName"
              value={formData.businessName}
              onChange={(e) => updateFormData({ businessName: e.target.value })}
              placeholder="Your Company LLC"
              required
              data-testid="input-business-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactName">Contact Name *</Label>
            <Input
              id="contactName"
              value={formData.contactName}
              onChange={(e) => updateFormData({ contactName: e.target.value })}
              placeholder="John Doe"
              required
              data-testid="input-contact-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">About Your Business *</Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => updateFormData({ bio: e.target.value })}
              placeholder="Tell customers about your experience, style, and what makes you special..."
              rows={4}
              required
              data-testid="textarea-bio"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="introVideo">Attach a personalized video (optional)</Label>
            <Input
              id="introVideo"
              value={formData.introVideoUrl}
              onChange={(e) => updateFormData({ introVideoUrl: e.target.value })}
              placeholder="Paste a link to your video (YouTube, Vimeo, etc.)"
              data-testid="input-intro-video"
            />
            <p className="text-sm text-muted-foreground">
              Add a personal video introduction to help customers connect with you
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website (optional)</Label>
            <Input
              id="website"
              value={formData.website}
              onChange={(e) => updateFormData({ website: e.target.value })}
              placeholder="https://yourwebsite.com"
              data-testid="input-website"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram (optional)</Label>
              <Input
                id="instagram"
                value={formData.instagram}
                onChange={(e) => updateFormData({ instagram: e.target.value })}
                placeholder="@yourbusiness"
                data-testid="input-instagram"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tiktok">TikTok (optional)</Label>
              <Input
                id="tiktok"
                value={formData.tiktok}
                onChange={(e) => updateFormData({ tiktok: e.target.value })}
                placeholder="@yourbusiness"
                data-testid="input-tiktok"
              />
            </div>
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
              disabled={!formData.businessName || !formData.contactName || !formData.bio}
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
