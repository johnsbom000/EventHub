import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ListingDraft, CancellationPolicy } from "../wizardTypes";

function ToggleGroup({
  value,
  onChange,
  trueLabel,
  falseLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  trueLabel: string;
  falseLabel: string;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={[
          "px-4 py-2 text-sm font-medium transition",
          value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
        ].join(" ")}
      >
        {trueLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={[
          "border-l border-border px-4 py-2 text-sm font-medium transition",
          !value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
        ].join(" ")}
      >
        {falseLabel}
      </button>
    </div>
  );
}

/**
 * The unified travel/delivery fee configuration, shared by the Travel (Service) and
 * Delivery (Rental/Catering) sections. `feeNoun` is the label ("travel fee" or
 * "delivery fee"). It writes to the shared draft fields servesOutsideRadius /
 * travelFeeEnabled / travelFeeType / travelFeeAmount — a listing is a single category,
 * so only one section renders at a time and there is no field collision.
 */
function UnifiedFeeConfig({
  draft,
  setDraft,
  feeNoun,
}: {
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
  feeNoun: "travel fee" | "delivery fee";
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label className="text-base">Serve events outside your service radius?</Label>
          <p className="text-sm text-muted-foreground">
            Your service radius (set on the Service Area step) is the area you're willing to serve.
            {" "}
            {draft.servesOutsideRadius
              ? "You'll be asked to propose a fee for out-of-area bookings after they're requested."
              : "Bookings outside it will be blocked."}
          </p>
        </div>
        <div className="shrink-0">
          <ToggleGroup
            value={draft.servesOutsideRadius}
            onChange={(next) => setDraft((prev) => ({ ...prev, servesOutsideRadius: next }))}
            trueLabel="Yes"
            falseLabel="No"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label className="text-base">Charge a {feeNoun} inside your radius?</Label>
        <ToggleGroup
          value={draft.travelFeeEnabled}
          onChange={(next) =>
            setDraft((prev) => ({
              ...prev,
              travelFeeEnabled: next,
              travelFeeAmount: next ? prev.travelFeeAmount : "",
            }))
          }
          trueLabel="Yes"
          falseLabel="No"
        />
      </div>

      {draft.travelFeeEnabled ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="text-base">Is the {feeNoun} a flat rate or does it vary by location?</Label>
            <ToggleGroup
              value={draft.travelFeeType === "flat"}
              onChange={(isFlat) =>
                setDraft((prev) => ({
                  ...prev,
                  travelFeeType: isFlat ? "flat" : "variable",
                  travelFeeAmount: isFlat ? prev.travelFeeAmount : "",
                }))
              }
              trueLabel="Flat rate"
              falseLabel="Varies by location"
            />
          </div>

          {draft.travelFeeType === "flat" ? (
            <div className="max-w-sm space-y-2">
              <Label>{feeNoun.charAt(0).toUpperCase() + feeNoun.slice(1)} (flat)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="pl-7"
                  value={draft.travelFeeAmount}
                  onChange={(e) => setDraft((prev) => ({ ...prev, travelFeeAmount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Added automatically at checkout for events inside your radius.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              You'll propose the {feeNoun} for each booking after it's requested — the customer
              accepts and pays it before the booking is finalized.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

interface LogisticsStepProps {
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
}

export function LogisticsStep({ draft, setDraft }: LogisticsStepProps) {
  const showTravelSection = draft.category === "Service";
  const showDeliverySection = draft.category === "Rental" || draft.category === "Catering";
  const showSetupSection =
    draft.category === "Rental" || draft.category === "Venue" || draft.category === "Catering";
  const showTakedownSection =
    draft.category === "Rental" || draft.category === "Venue" || draft.category === "Catering";

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Logistics</h1>
        <p className="text-base text-muted-foreground">
          Configure travel, delivery, setup, and takedown behavior. Applicable fees are included in checkout
          totals.
        </p>
      </header>

      <div className="space-y-6">
        {showTravelSection ? (
          <Card className="space-y-5 p-6">
            <div className="text-xl font-semibold">Travel</div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-base">Do you travel to the event?</Label>
              <ToggleGroup
                value={draft.travelOffered}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, travelOffered: next }))
                }
                trueLabel="Yes"
                falseLabel="No"
              />
            </div>

            {draft.travelOffered ? (
              <UnifiedFeeConfig draft={draft} setDraft={setDraft} feeNoun="travel fee" />
            ) : null}
          </Card>
        ) : null}

        {showDeliverySection ? (
          <Card className="space-y-5 p-6">
            <div className="text-xl font-semibold">Delivery</div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-base">Do you deliver?</Label>
              <ToggleGroup
                value={draft.deliveryIncluded}
                onChange={(next) =>
                  setDraft((prev) => ({ ...prev, deliveryIncluded: next }))
                }
                trueLabel="Yes"
                falseLabel="No"
              />
            </div>

            <p className="text-sm text-muted-foreground">If no, this listing is pickup only.</p>

            {draft.deliveryIncluded ? (
              <UnifiedFeeConfig draft={draft} setDraft={setDraft} feeNoun="delivery fee" />
            ) : null}
          </Card>
        ) : null}

        {showSetupSection ? (
          <Card className="space-y-5 p-6">
            <div className="text-xl font-semibold">Setup</div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-base">Do you set up?</Label>
              <ToggleGroup
                value={draft.setupIncluded}
                onChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    setupIncluded: next,
                    setupFeeEnabled: next ? prev.setupFeeEnabled : false,
                    setupFeeAmount: next ? prev.setupFeeAmount : "",
                  }))
                }
                trueLabel="Yes"
                falseLabel="No"
              />
            </div>

            {draft.setupIncluded ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label className="text-base">Is there a setup fee?</Label>
                  <ToggleGroup
                    value={draft.setupFeeEnabled}
                    onChange={(next) =>
                      setDraft((prev) => ({
                        ...prev,
                        setupFeeEnabled: next,
                        setupFeeAmount: next ? prev.setupFeeAmount : "",
                      }))
                    }
                    trueLabel="Yes"
                    falseLabel="No"
                  />
                </div>

                {draft.setupFeeEnabled ? (
                  <div className="max-w-sm space-y-2">
                    <Label>Setup fee</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        className="pl-7"
                        value={draft.setupFeeAmount}
                        inputMode="decimal"
                        placeholder="e.g. 75"
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            setupFeeAmount: event.target.value.replace(/[^\d.]/g, ""),
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}

        {showTakedownSection ? (
          <Card className="space-y-5 p-6">
            <div className="text-xl font-semibold">Takedown</div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-base">Do you offer takedown?</Label>
              <ToggleGroup
                value={draft.takedownIncluded}
                onChange={(next) =>
                  setDraft((prev) => ({
                    ...prev,
                    takedownIncluded: next,
                    takedownFeeEnabled: next ? prev.takedownFeeEnabled : false,
                    takedownFeeAmount: next ? prev.takedownFeeAmount : "",
                  }))
                }
                trueLabel="Yes"
                falseLabel="No"
              />
            </div>

            {draft.takedownIncluded ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label className="text-base">Is there a takedown fee?</Label>
                  <ToggleGroup
                    value={draft.takedownFeeEnabled}
                    onChange={(next) =>
                      setDraft((prev) => ({
                        ...prev,
                        takedownFeeEnabled: next,
                        takedownFeeAmount: next ? prev.takedownFeeAmount : "",
                      }))
                    }
                    trueLabel="Yes"
                    falseLabel="No"
                  />
                </div>

                {draft.takedownFeeEnabled ? (
                  <div className="max-w-sm space-y-2">
                    <Label>Takedown fee</Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        className="pl-7"
                        value={draft.takedownFeeAmount}
                        inputMode="decimal"
                        placeholder="e.g. 75"
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            takedownFeeAmount: event.target.value.replace(/[^\d.]/g, ""),
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}

        {/* Security deposit is collected on the Booking & Pricing step — not here. */}

        {/* Cancellation Policy — always shown */}
        <Card className="space-y-5 p-6">
          <div className="text-xl font-semibold">Cancellation Policy</div>

          <div className="space-y-3">
            {(
              [
                {
                  value: "cancel_anytime",
                  label: "Cancel anytime",
                  description: "Customers can cancel anytime more than 48 hours before the event date.",
                },
                {
                  value: "cancel_within_hours",
                  label: "Cancel within a window",
                  description: "Customers can cancel up until a set number of hours before the event.",
                },
                {
                  value: "no_cancellations",
                  label: "No cancellations",
                  description: "All sales are final. No refunds once booked.",
                },
              ] as Array<{ value: CancellationPolicy; label: string; description: string }>
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    cancellationPolicy: option.value,
                    cancellationPolicyHours:
                      option.value === "cancel_within_hours"
                        ? prev.cancellationPolicyHours || "48"
                        : prev.cancellationPolicyHours,
                  }))
                }
                className={[
                  "flex w-full flex-col gap-0.5 rounded-lg border p-4 text-left transition-colors",
                  draft.cancellationPolicy === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40",
                ].join(" ")}
              >
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-sm text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>

          {draft.cancellationPolicy === "cancel_within_hours" && (
            <div className="max-w-xs space-y-2">
              <Label>Hours before event</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={draft.cancellationPolicyHours}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    cancellationPolicyHours: e.target.value.replace(/[^\d]/g, ""),
                  }))
                }
                placeholder="e.g. 48"
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                Customers can cancel up until this many hours before the event starts.
              </p>
            </div>
          )}
        </Card>

        {!showTravelSection && !showDeliverySection && !showSetupSection && !showTakedownSection ? (
          <Card className="p-6 text-sm text-muted-foreground">
            Select a category in Listing Basics to configure applicable logistics options.
          </Card>
        ) : null}
      </div>
    </div>
  );
}
