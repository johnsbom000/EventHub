import { useState } from "react";

import { CreateListingWizard, type CreateListingWizardProps } from "./CreateListingWizard";
import { AiListingIntake } from "./AiListingIntake";
import type { ListingDraft } from "./wizardTypes";

/**
 * Wraps the two-phase create-listing flow: the optional "Fill with AI" intake
 * (photos → category → generated draft) and the CreateListingWizard it hands off
 * to. Both entry points (the /vendor/listings/new route and the modal on the
 * vendor listings page) render this so the AI entry is wired in one place.
 */
export type CreateListingFlowProps = Pick<
  CreateListingWizardProps,
  "onClose" | "onComplete" | "onStripeRequired"
>;

export function CreateListingFlow({ onClose, onComplete, onStripeRequired }: CreateListingFlowProps) {
  const [phase, setPhase] = useState<"wizard" | "intake">("wizard");
  const [aiDraft, setAiDraft] = useState<ListingDraft | null>(null);

  if (phase === "intake") {
    return (
      <AiListingIntake
        onDrafted={(draft) => {
          setAiDraft(draft);
          setPhase("wizard");
        }}
        onCancel={() => setPhase("wizard")}
      />
    );
  }

  return (
    <CreateListingWizard
      onClose={onClose}
      onComplete={onComplete}
      onStripeRequired={onStripeRequired}
      // When the AI produced a draft, open pre-filled on the first step as a
      // single listing; otherwise offer the "Fill with AI" entry.
      initialDraft={aiDraft ?? undefined}
      initialStep={aiDraft ? "basics" : undefined}
      initialListingType={aiDraft ? "single" : undefined}
      onFillWithAI={aiDraft ? undefined : () => setPhase("intake")}
    />
  );
}
