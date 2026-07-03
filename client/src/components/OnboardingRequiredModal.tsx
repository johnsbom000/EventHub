import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClipboardList, Check } from "lucide-react";

/**
 * Shown when a vendor tries to publish but hasn't completed vendor profile
 * onboarding (server responds `onboarding_incomplete`). "Finish my profile"
 * sends them to vendor onboarding; dismissing just closes the modal (any
 * draft stays put).
 */
export function OnboardingRequiredModal({
  open,
  onOpenChange,
  onBeforeRedirect,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  /** Called right before navigating to onboarding — lets a host suppress
   *  navigation guards (e.g. the create-listing wizard's beforeunload prompt). */
  onBeforeRedirect?: () => void;
}) {
  function goToOnboarding() {
    onBeforeRedirect?.();
    window.location.assign("/vendor/onboarding");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="onboarding-required-modal">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Finish your vendor profile to publish
          </DialogTitle>
          <DialogDescription>
            Complete your vendor profile so customers know who they're booking.
            Your listing stays saved as a draft — it'll be ready to publish the
            moment your profile is done.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="text-[#4a6a7d]"><Check className="h-4 w-4" /></span>
            Tell customers about your business
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[#4a6a7d]"><Check className="h-4 w-4" /></span>
            Takes a couple of minutes to complete
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[#4a6a7d]"><Check className="h-4 w-4" /></span>
            Your draft is saved while you finish
          </li>
        </ul>

        <div className="mt-2">
          <Button
            className="w-full bg-[#4a6a7d] hover:bg-[#3f5c6d] text-[#f5f0e8]"
            onClick={goToOnboarding}
            data-testid="onboarding-required-start"
          >
            <ClipboardList className="mr-1.5 h-4 w-4" /> Finish my profile
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
