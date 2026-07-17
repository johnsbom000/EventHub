import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";
import { AiListingIntake } from "@/features/vendor/create-listing/AiListingIntake";
import type { ListingDraft } from "@/features/vendor/create-listing/wizardTypes";

export default function VendorCreateListing() {
  const [, setLocation] = useLocation();
  const didPublishRef = useRef(false);

  // "wizard" = normal flow (blank, or pre-filled once aiDraft is set).
  // "intake" = the AI photo-upload + category screen.
  const [phase, setPhase] = useState<"wizard" | "intake">("wizard");
  const [aiDraft, setAiDraft] = useState<ListingDraft | null>(null);

  const handleClose = () => {
    setLocation(didPublishRef.current ? "/vendor/my-hub" : "/vendor/listings");
  };

  const handleComplete = () => {
    didPublishRef.current = true;
  };

  const handleStripeRequired = () => {
    setLocation("/vendor/shop");
  };

  if (phase === "intake") {
    return (
      <div data-testid="page-vendor-create-listing-ai">
        <AiListingIntake
          onDrafted={(draft) => {
            setAiDraft(draft);
            setPhase("wizard");
          }}
          onCancel={() => setPhase("wizard")}
        />
      </div>
    );
  }

  return (
    <div data-testid="page-vendor-create-listing">
      <CreateListingWizard
        onClose={handleClose}
        onComplete={handleComplete}
        onStripeRequired={handleStripeRequired}
        // When the AI produced a draft, open pre-filled on the first step (review)
        // as a single listing; otherwise offer the "Fill with AI" entry.
        initialDraft={aiDraft ?? undefined}
        initialStep={aiDraft ? "basics" : undefined}
        initialListingType={aiDraft ? "single" : undefined}
        onFillWithAI={aiDraft ? undefined : () => setPhase("intake")}
      />
    </div>
  );
}
