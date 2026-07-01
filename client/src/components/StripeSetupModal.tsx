import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { redirectVendorToStripeSetup } from "@/lib/vendorStripe";
import { CreditCard, Loader2, Check } from "lucide-react";

/**
 * Shown when a vendor tries to publish but hasn't completed Stripe Connect setup
 * (server responds `stripe_not_configured`). Used by both the create-listing
 * wizard and the listings page. "Set up payments" sends them to Stripe
 * onboarding; dismissing just closes the modal (any draft stays put).
 */
export function StripeSetupModal({
  open,
  onOpenChange,
  onBeforeRedirect,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  /** Called right before redirecting to Stripe — lets a host suppress navigation
   *  guards (e.g. the create-listing wizard's beforeunload prompt). */
  onBeforeRedirect?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      onBeforeRedirect?.();
      await redirectVendorToStripeSetup();
    } catch (err: any) {
      setError(err?.message || "Couldn't start payment setup. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="stripe-setup-modal">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Set up your Stripe account to publish
          </DialogTitle>
          <DialogDescription>
            Connect a Stripe account so you can accept bookings and get paid. Your
            listing stays saved as a draft — it'll be ready to publish the moment
            setup is complete.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 text-sm">
          <li className="flex items-center gap-2">
            <span className="text-[#4a6a7d]"><Check className="h-4 w-4" /></span>
            Secure payouts handled by Stripe
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
            onClick={startSetup}
            disabled={busy}
            data-testid="stripe-setup-start"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CreditCard className="mr-1.5 h-4 w-4" /> Set up payments
              </>
            )}
          </Button>
          {error ? (
            <p className="mt-3 text-center text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
