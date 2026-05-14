import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ListingDraft } from "../wizardTypes";

interface BookingPricingStepProps {
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
  showValidation: boolean;
}

export function BookingPricingStep({ draft, setDraft, showValidation }: BookingPricingStepProps) {
  const bookingTypeRequired =
    draft.category === "Service" || draft.category === "Venue" || draft.category === "Catering";
  const hasPrice = Number(draft.rate) > 0;

  function parsePositiveInt(val: string): number {
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  const hasValidQuantity = draft.category !== "Rental" || parsePositiveInt(draft.quantity) > 0;

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Booking & Pricing</h1>
        <p className="text-base text-muted-foreground">
          Set booking behavior, pricing model, and quantity for identical rental units.
        </p>
      </header>

      <Card className="space-y-6 p-6">
        {bookingTypeRequired ? (
          <div className="space-y-3">
            <Label className="text-base font-semibold">Booking Type</Label>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant={draft.bookingType === "instant" ? "default" : "outline"}
                onClick={() => setDraft((prev) => ({ ...prev, bookingType: "instant" }))}
              >
                Instant Book
              </Button>
              <Button
                type="button"
                variant={draft.bookingType === "request" ? "default" : "outline"}
                onClick={() => setDraft((prev) => ({ ...prev, bookingType: "request" }))}
              >
                Request to Book
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Request to Book means customers submit requested dates and you manually accept or decline.
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          <Label className="text-base font-semibold">Pricing Model</Label>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant={draft.pricingUnit === "per_day" ? "default" : "outline"}
              onClick={() => setDraft((prev) => ({ ...prev, pricingUnit: "per_day" }))}
            >
              Per day
            </Button>
            <Button
              type="button"
              variant={draft.pricingUnit === "per_hour" ? "default" : "outline"}
              onClick={() => setDraft((prev) => ({ ...prev, pricingUnit: "per_hour" }))}
            >
              Per hour
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            {draft.pricingUnit === "per_day" ? "Rate per day" : "Rate per hour"}
          </Label>
          <div className="relative max-w-sm">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              className="pl-7"
              value={draft.rate}
              inputMode="decimal"
              placeholder={draft.pricingUnit === "per_day" ? "e.g. 250" : "e.g. 75"}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  rate: event.target.value.replace(/[^\d.]/g, ""),
                }))
              }
            />
          </div>
          {showValidation && !hasPrice ? (
            <p className="text-sm text-destructive">A rate is required.</p>
          ) : null}
        </div>

        {draft.category === "Rental" ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
            <Label className="text-base font-semibold">
              How many identical units of this listing do you have available?
            </Label>
            <p className="text-sm text-muted-foreground">
              Example: if this listing is for a set of 5 vases and you own 3 identical sets, enter 3.
            </p>
            <Input
              value={draft.quantity}
              inputMode="numeric"
              className="max-w-[140px]"
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  quantity: event.target.value.replace(/[^\d]/g, ""),
                }))
              }
            />
            <p className="text-sm text-muted-foreground">*Quantity means identical rentable units only.*</p>
            <p className="text-sm text-muted-foreground">
              Use "What's Included" from Step 1 for piece counts or components.
            </p>
          </div>
        ) : null}

        <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base font-semibold">Require a security deposit?</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Customers will be charged this amount on top of the booking total. It is refunded to them after the event if no damage claim is filed.
              </p>
            </div>
            <Switch
              checked={draft.securityDepositEnabled}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  securityDepositEnabled: checked,
                  securityDepositAmount: checked ? prev.securityDepositAmount : "",
                }))
              }
            />
          </div>

          {draft.securityDepositEnabled && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Deposit Amount</Label>
              <div className="relative max-w-sm">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  className="pl-7"
                  value={draft.securityDepositAmount}
                  inputMode="decimal"
                  placeholder="e.g. 200"
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      securityDepositAmount: event.target.value.replace(/[^\d.]/g, ""),
                    }))
                  }
                />
              </div>
              {showValidation && draft.securityDepositEnabled && !Number(draft.securityDepositAmount) && (
                <p className="text-sm text-destructive">Enter a deposit amount.</p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
