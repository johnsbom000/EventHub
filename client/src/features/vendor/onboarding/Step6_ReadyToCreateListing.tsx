import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Lightbulb } from "lucide-react";

interface Props {
  onComplete: (createListing: boolean) => void;
  onBack: () => void;
}

export default function Step6_ReadyToCreateListing({ onComplete, onBack }: Props) {
  return (
    <Card className="rounded-xl shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Great! Your Profile is Complete
        </CardTitle>
        <CardDescription>
          You've successfully set up your vendor profile. Now you can create your first listing to start receiving bookings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="bg-accent rounded-lg p-6">
          <h3 className="font-semibold mb-4">What's Next?</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center mt-0.5">
                <Check className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h4 className="font-medium">Define Your Offerings</h4>
                <p className="text-sm text-muted-foreground">
                  Set up your service packages and pricing
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center mt-0.5">
                <Check className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h4 className="font-medium">Set Your Availability</h4>
                <p className="text-sm text-muted-foreground">
                  Let customers know when you're available to work
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center mt-0.5">
                <Check className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h4 className="font-medium">Add Special Offers</h4>
                <p className="text-sm text-muted-foreground">
                  Attract customers with introductory deals and promotions
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-4">
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <Lightbulb className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <span><strong>Tip:</strong> You can always update your profile and listings later from your vendor dashboard.</span>
          </p>
        </div>

        <div className="flex justify-between gap-4 pt-4">
          <Button
            variant="outline"
            onClick={onBack}
            data-testid="button-back"
          >
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onComplete(false)}
              data-testid="button-later"
            >
              I'll Do This Later
            </Button>
            <Button
              onClick={() => onComplete(true)}
              data-testid="button-create-listing"
            >
              Yes, Create Listing →
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
