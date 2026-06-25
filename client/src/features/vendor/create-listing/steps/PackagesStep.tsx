import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ListingCategory, ListingDraft } from "../wizardTypes";
import { DIMENSION_UNIT_OPTIONS } from "../wizardTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

type TravelFeeType = "flat" | "per_mile" | "per_hour";
type CancellationPolicy = "cancel_anytime" | "cancel_within_hours" | "no_cancellations";

interface PackageItem {
  id: string;
  title: string | null;
  description: string | null;
  whatsIncluded: string[];
  whatsNotIncluded: string[];
  priceCents: number | null;
  pricingUnit: string | null;
  sortOrder: number;
  dimensionUnit: string | null;
  dimensionWidth: number | null;
  dimensionLength: number | null;
  dimensionHeight: number | null;
  travelOffered: boolean;
  travelFeeEnabled: boolean;
  travelFeeType: string | null;
  travelFeeAmountCents: number | null;
  deliveryOffered: boolean;
  deliveryFeeEnabled: boolean;
  deliveryFeeAmountCents: number | null;
  setupOffered: boolean;
  setupFeeEnabled: boolean;
  setupFeeAmountCents: number | null;
  takedownOffered: boolean;
  takedownFeeEnabled: boolean;
  takedownFeeAmountCents: number | null;
  cancellationPolicyOverride: { policy: CancellationPolicy; hours?: number } | null;
}

interface PackageFormState {
  title: string;
  description: string;
  whatsIncluded: string[];
  whatsNotIncluded: string[];
  priceDollars: string;
  pricingUnit: "per_day" | "per_hour";
  // Dimensions (Rental only)
  dimensionUnit: string;
  dimensionWidth: string;
  dimensionLength: string;
  dimensionHeight: string;
  // Travel (Service + Catering only)
  travelOffered: boolean;
  travelFeeEnabled: boolean;
  travelFeeType: TravelFeeType;
  travelFeeAmount: string;
  // Delivery (Rental + Catering only)
  deliveryOffered: boolean;
  deliveryFeeEnabled: boolean;
  deliveryFeeAmount: string;
  // Setup (Rental + Venue + Catering)
  setupOffered: boolean;
  setupFeeEnabled: boolean;
  setupFeeAmount: string;
  // Takedown (Rental + Venue + Catering)
  takedownOffered: boolean;
  takedownFeeEnabled: boolean;
  takedownFeeAmount: string;
  // Cancellation
  cancellationPolicy: CancellationPolicy;
  cancellationPolicyHours: string;
}

const EMPTY_FORM: PackageFormState = {
  title: "",
  description: "",
  whatsIncluded: [],
  whatsNotIncluded: [],
  priceDollars: "",
  pricingUnit: "per_day",
  dimensionUnit: "inches",
  dimensionWidth: "",
  dimensionLength: "",
  dimensionHeight: "",
  travelOffered: false,
  travelFeeEnabled: false,
  travelFeeType: "flat",
  travelFeeAmount: "",
  deliveryOffered: false,
  deliveryFeeEnabled: false,
  deliveryFeeAmount: "",
  setupOffered: false,
  setupFeeEnabled: false,
  setupFeeAmount: "",
  takedownOffered: false,
  takedownFeeEnabled: false,
  takedownFeeAmount: "",
  cancellationPolicy: "cancel_anytime",
  cancellationPolicyHours: "48",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(cents: number | null, unit: string | null): string {
  if (cents == null) return "Price TBD";
  const dollars = (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return unit === "per_hour" ? `${dollars}/hr` : `${dollars}/day`;
}

function centsToDisplay(cents: number | null): string {
  if (cents == null || cents === 0) return "";
  return String(cents / 100);
}

function parseDollars(raw: string): number | null {
  const v = parseFloat(raw);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
}

function parseDimension(raw: string): number | null {
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : null;
}

// ── ToggleGroup ───────────────────────────────────────────────────────────────

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface PackagesStepProps {
  listingId: string | null;
  /** Category of the container listing — drives which logistics sections appear. */
  category: ListingCategory | "";
  /** Container-level draft — holds listing-wide booking settings shared by all packages. */
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
  onPackageCountChange?: (count: number) => void;
  showValidation?: boolean;
}

export interface PackagesStepHandle {
  /** If a package is currently being edited, submit it — otherwise a no-op. */
  submitIfEditing: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const PackagesStep = forwardRef<PackagesStepHandle, PackagesStepProps>(
function PackagesStep({ listingId, category, draft, setDraft, onPackageCountChange, showValidation }, ref) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<PackageFormState>(EMPTY_FORM);

  // Chip input state for included/not-included — separate from form to avoid
  // the pending text being accidentally submitted when the user clicks "Add Package"
  const [includedInput, setIncludedInput] = useState("");
  const [notIncludedInput, setNotIncludedInput] = useState("");

  // Logistics visibility — mirrors LogisticsStep rules, travel/delivery skip Venue
  const showTravel    = category === "Service";
  const showDelivery  = category === "Rental"  || category === "Catering";
  const showSetup     = category === "Rental"  || category === "Venue" || category === "Catering";
  const showTakedown  = category === "Rental"  || category === "Venue" || category === "Catering";
  const showDimensions = category === "Rental";

  const { data: packages = [], isLoading } = useQuery<PackageItem[]>({
    queryKey: ["/api/vendor/listings", listingId, "packages"],
    queryFn: async () => {
      if (!listingId) return [];
      const res = await apiRequest("GET", `/api/vendor/listings/${listingId}/packages`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(listingId),
  });

  useEffect(() => {
    onPackageCountChange?.(packages.length);
  }, [packages.length, onPackageCountChange]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId, "packages"] });

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await apiRequest("POST", `/api/vendor/listings/${listingId}/packages`, body);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create package");
      return json;
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(EMPTY_FORM);
      setIncludedInput("");
      setNotIncludedInput("");
      toast({ title: "Package added" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ pkgId, body }: { pkgId: string; body: object }) => {
      const res = await apiRequest("PATCH", `/api/vendor/listings/${listingId}/packages/${pkgId}`, body);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to update package");
      return json;
    },
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(EMPTY_FORM);
      setIncludedInput("");
      setNotIncludedInput("");
      toast({ title: "Package saved" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (pkgId: string) => {
      const res = await apiRequest("DELETE", `/api/vendor/listings/${listingId}/packages/${pkgId}`);
      if (!res.ok) throw new Error("Failed to delete package");
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Package removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove package", variant: "destructive" });
    },
  });

  function openNew() {
    setForm(EMPTY_FORM);
    setIncludedInput("");
    setNotIncludedInput("");
    setEditingId("new");
  }

  function openEdit(pkg: PackageItem) {
    setForm({
      title: pkg.title ?? "",
      description: pkg.description ?? "",
      whatsIncluded: pkg.whatsIncluded ?? [],
      whatsNotIncluded: pkg.whatsNotIncluded ?? [],
      priceDollars: pkg.priceCents != null ? String(pkg.priceCents / 100) : "",
      pricingUnit: pkg.pricingUnit === "per_hour" ? "per_hour" : "per_day",
      dimensionUnit: pkg.dimensionUnit ?? "inches",
      dimensionWidth: pkg.dimensionWidth != null ? String(pkg.dimensionWidth) : "",
      dimensionLength: pkg.dimensionLength != null ? String(pkg.dimensionLength) : "",
      dimensionHeight: pkg.dimensionHeight != null ? String(pkg.dimensionHeight) : "",
      travelOffered: pkg.travelOffered,
      travelFeeEnabled: pkg.travelFeeEnabled,
      travelFeeType: (pkg.travelFeeType as TravelFeeType) ?? "flat",
      travelFeeAmount: centsToDisplay(pkg.travelFeeAmountCents),
      deliveryOffered: pkg.deliveryOffered,
      deliveryFeeEnabled: pkg.deliveryFeeEnabled,
      deliveryFeeAmount: centsToDisplay(pkg.deliveryFeeAmountCents),
      setupOffered: pkg.setupOffered,
      setupFeeEnabled: pkg.setupFeeEnabled,
      setupFeeAmount: centsToDisplay(pkg.setupFeeAmountCents),
      takedownOffered: pkg.takedownOffered,
      takedownFeeEnabled: pkg.takedownFeeEnabled,
      takedownFeeAmount: centsToDisplay(pkg.takedownFeeAmountCents),
      cancellationPolicy: pkg.cancellationPolicyOverride?.policy ?? "cancel_anytime",
      cancellationPolicyHours: String(pkg.cancellationPolicyOverride?.hours ?? 48),
    });
    setIncludedInput("");
    setNotIncludedInput("");
    setEditingId(pkg.id);
  }

  function capitalizeFirst(s: string): string {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function addIncludedItem(value: string) {
    const item = capitalizeFirst(value.trim());
    if (!item || form.whatsIncluded.includes(item)) {
      setIncludedInput("");
      return;
    }
    setForm((f) => ({ ...f, whatsIncluded: [...f.whatsIncluded, item] }));
    setIncludedInput("");
  }

  function removeIncludedItem(item: string) {
    setForm((f) => ({ ...f, whatsIncluded: f.whatsIncluded.filter((i) => i !== item) }));
  }

  function addNotIncludedItem(value: string) {
    const item = capitalizeFirst(value.trim());
    if (!item || form.whatsNotIncluded.includes(item)) {
      setNotIncludedInput("");
      return;
    }
    setForm((f) => ({ ...f, whatsNotIncluded: [...f.whatsNotIncluded, item] }));
    setNotIncludedInput("");
  }

  function removeNotIncludedItem(item: string) {
    setForm((f) => ({ ...f, whatsNotIncluded: f.whatsNotIncluded.filter((i) => i !== item) }));
  }

  function buildBody(sortOrder: number) {
    const priceCents = parseDollars(form.priceDollars);
    const cancellationPolicyOverride =
      form.cancellationPolicy === "cancel_anytime"
        ? { policy: "cancel_anytime" as const }
        : form.cancellationPolicy === "no_cancellations"
          ? { policy: "no_cancellations" as const }
          : { policy: "cancel_within_hours" as const, hours: parseInt(form.cancellationPolicyHours, 10) || 48 };

    return {
      title: form.title.trim() || "New Package",
      description: form.description.trim(),
      whatsIncluded: form.whatsIncluded,
      whatsNotIncluded: form.whatsNotIncluded,
      priceCents,
      pricingUnit: form.pricingUnit,
      sortOrder,
      // Dimensions
      dimensionUnit: showDimensions ? form.dimensionUnit : null,
      dimensionWidth: showDimensions ? parseDimension(form.dimensionWidth) : null,
      dimensionLength: showDimensions ? parseDimension(form.dimensionLength) : null,
      dimensionHeight: showDimensions ? parseDimension(form.dimensionHeight) : null,
      // Travel
      travelOffered: showTravel ? form.travelOffered : false,
      travelFeeEnabled: showTravel ? form.travelOffered && form.travelFeeEnabled : false,
      travelFeeType: showTravel && form.travelOffered && form.travelFeeEnabled ? form.travelFeeType : null,
      travelFeeAmountCents: showTravel && form.travelOffered && form.travelFeeEnabled ? parseDollars(form.travelFeeAmount) : null,
      // Delivery
      deliveryOffered: showDelivery ? form.deliveryOffered : false,
      deliveryFeeEnabled: showDelivery ? form.deliveryOffered && form.deliveryFeeEnabled : false,
      deliveryFeeAmountCents: showDelivery && form.deliveryOffered && form.deliveryFeeEnabled ? parseDollars(form.deliveryFeeAmount) : null,
      // Setup
      setupOffered: showSetup ? form.setupOffered : false,
      setupFeeEnabled: showSetup ? form.setupOffered && form.setupFeeEnabled : false,
      setupFeeAmountCents: showSetup && form.setupOffered && form.setupFeeEnabled ? parseDollars(form.setupFeeAmount) : null,
      // Takedown
      takedownOffered: showTakedown ? form.takedownOffered : false,
      takedownFeeEnabled: showTakedown ? form.takedownOffered && form.takedownFeeEnabled : false,
      takedownFeeAmountCents: showTakedown && form.takedownOffered && form.takedownFeeEnabled ? parseDollars(form.takedownFeeAmount) : null,
      // Cancellation
      cancellationPolicyOverride,
    };
  }

  useImperativeHandle(ref, () => ({
    submitIfEditing() {
      if (editingId !== null) handleSave();
    },
  }));

  function handleSave() {
    if (editingId === "new") {
      createMutation.mutate(buildBody(packages.length));
    } else if (editingId) {
      const existing = packages.find((p) => p.id === editingId);
      updateMutation.mutate({ pkgId: editingId, body: buildBody(existing?.sortOrder ?? 0) });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canAddMore = packages.length < 5;

  if (!listingId) {
    return (
      <div className="mx-auto w-full max-w-[53rem] space-y-8">
        <header className="space-y-3">
          <h1 className="text-5xl font-semibold tracking-tight">Define Packages</h1>
          <p className="text-base text-muted-foreground">Save your listing basics first to add packages.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Define Packages</h1>
        <p className="text-base text-muted-foreground">
          Add up to 5 packages — each with its own name, price, inclusions, and logistics. Customers pick one when booking.
        </p>
      </header>

      {/* Listing-level booking settings — apply to the whole package listing (all packages share them) */}
      <Card className="space-y-6 p-6">
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
            Applies to every package in this listing. Request to Book means customers submit requested dates and you manually accept or decline.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base font-semibold">Allow customers to contact you before booking?</Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                Shows a "Message Vendor" button on your listing page so customers can ask questions before committing to a booking.
              </p>
            </div>
            <Switch
              checked={draft.allowPreBookingContact}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({ ...prev, allowPreBookingContact: checked }))
              }
            />
          </div>
        </div>
      </Card>

      {/* Existing packages list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : packages.length > 0 ? (
        <div className="space-y-3">
          {packages.map((pkg, index) => (
            <Card key={pkg.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{pkg.title ?? "Unnamed Package"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(pkg.priceCents, pkg.pricingUnit)}
                    {(pkg.whatsIncluded ?? []).length > 0
                      ? ` · ${(pkg.whatsIncluded ?? []).length} inclusion${(pkg.whatsIncluded ?? []).length === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(pkg)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(pkg.id)}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className={`flex flex-col items-center gap-3 p-8 text-center ${showValidation ? "border-destructive" : ""}`}>
          <Package className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No packages yet. Add your first one below.</p>
          {showValidation && (
            <p className="text-sm font-medium text-destructive">
              Add at least one package before continuing.
            </p>
          )}
        </Card>
      )}

      {/* Add button */}
      {canAddMore && editingId === null && (
        <Button type="button" variant="outline" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Package {packages.length > 0 ? `(${packages.length}/5)` : ""}
        </Button>
      )}

      {/* ── Inline package editor ───────────────────────────────────────────── */}
      {editingId !== null && (
        <Card className="space-y-6 p-6">
          <h2 className="text-base font-semibold">
            {editingId === "new" ? "New Package" : "Edit Package"}
          </h2>

          {/* Name + Price + Unit */}
          <div className="space-y-2">
            <Label htmlFor="pkg-title">Package name</Label>
            <Input
              id="pkg-title"
              placeholder="e.g. Silver, Gold, Platinum"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pkg-price">Price</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  id="pkg-price"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  className="pl-6"
                  value={form.priceDollars}
                  onChange={(e) => setForm((f) => ({ ...f, priceDollars: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-unit">Pricing unit</Label>
              <select
                id="pkg-unit"
                value={form.pricingUnit}
                onChange={(e) => setForm((f) => ({ ...f, pricingUnit: e.target.value as "per_day" | "per_hour" }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="per_day">Per day</option>
                <option value="per_hour">Per hour</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="pkg-description">Description <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="pkg-description"
              placeholder="What's special about this tier?"
              rows={3}
              spellCheck={true}
              autoCorrect="on"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* What's Included */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">What's Included</Label>

            {form.whatsIncluded.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {form.whatsIncluded.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-start gap-2">
                      <span aria-hidden>•</span>
                      <span>{item}</span>
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => removeIncludedItem(item)}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Input
                value={includedInput}
                spellCheck={true}
                autoCorrect="on"
                autoCapitalize="sentences"
                placeholder="What do you include?"
                onChange={(e) => setIncludedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addIncludedItem(includedInput);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={includedInput.trim().length === 0}
                onClick={() => addIncludedItem(includedInput)}
              >
                Add
              </Button>
            </div>
          </div>

          {/* What's Not Included */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">What's Not Included</Label>
            <p className="text-sm text-muted-foreground">
              Help customers understand what falls outside this package — e.g. "Gratuity", "Travel outside 30 miles".
            </p>

            {form.whatsNotIncluded.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {form.whatsNotIncluded.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-start gap-2">
                      <span aria-hidden>•</span>
                      <span>{item}</span>
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => removeNotIncludedItem(item)}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Input
                value={notIncludedInput}
                spellCheck={true}
                autoCorrect="on"
                autoCapitalize="sentences"
                placeholder="What's not included?"
                onChange={(e) => setNotIncludedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  addNotIncludedItem(notIncludedInput);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={notIncludedInput.trim().length === 0}
                onClick={() => addNotIncludedItem(notIncludedInput)}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Dimensions — Rental only */}
          {showDimensions && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-base font-semibold">Dimensions <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                <p className="text-sm text-muted-foreground">Add measurements to help customers understand scale.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {DIMENSION_UNIT_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={form.dimensionUnit === opt.value ? "default" : "outline"}
                    onClick={() => setForm((f) => ({ ...f, dimensionUnit: opt.value }))}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["Width", "Length", "Height"] as const).map((field) => {
                  const key = `dimension${field}` as "dimensionWidth" | "dimensionLength" | "dimensionHeight";
                  return (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={`pkg-dim-${field.toLowerCase()}`}>{field}</Label>
                      <Input
                        id={`pkg-dim-${field.toLowerCase()}`}
                        inputMode="decimal"
                        placeholder="e.g. 24"
                        value={form[key]}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.value.replace(/[^\d.]/g, "").slice(0, 9) }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Logistics ──────────────────────────────────────────────────── */}

          {/* Travel — Service only */}
          {showTravel && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Travel</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-sm">Do you travel?</Label>
                <ToggleGroup
                  value={form.travelOffered}
                  onChange={(next) => setForm((f) => ({ ...f, travelOffered: next, travelFeeEnabled: next ? f.travelFeeEnabled : false, travelFeeAmount: next ? f.travelFeeAmount : "" }))}
                  trueLabel="Yes"
                  falseLabel="No"
                />
              </div>
              {form.travelOffered && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-sm">Is there a travel fee?</Label>
                    <ToggleGroup
                      value={form.travelFeeEnabled}
                      onChange={(next) => setForm((f) => ({ ...f, travelFeeEnabled: next, travelFeeAmount: next ? f.travelFeeAmount : "" }))}
                      trueLabel="Yes"
                      falseLabel="No"
                    />
                  </div>
                  {form.travelFeeEnabled && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>How do you charge?</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: "per_mile", label: "Per mile" },
                            { value: "per_hour", label: "Per hour" },
                            { value: "flat", label: "Flat rate" },
                          ].map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              size="sm"
                              variant={form.travelFeeType === opt.value ? "default" : "outline"}
                              onClick={() => setForm((f) => ({ ...f, travelFeeType: opt.value as TravelFeeType }))}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Travel fee</Label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input
                            className="pl-7"
                            value={form.travelFeeAmount}
                            inputMode="decimal"
                            placeholder={form.travelFeeType === "per_mile" ? "e.g. 2.50" : form.travelFeeType === "per_hour" ? "e.g. 35" : "e.g. 75"}
                            onChange={(e) => setForm((f) => ({ ...f, travelFeeAmount: e.target.value.replace(/[^\d.]/g, "") }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Delivery — Rental + Catering only */}
          {showDelivery && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Delivery</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-sm">Do you deliver?</Label>
                <ToggleGroup
                  value={form.deliveryOffered}
                  onChange={(next) => setForm((f) => ({ ...f, deliveryOffered: next, deliveryFeeEnabled: next ? f.deliveryFeeEnabled : false, deliveryFeeAmount: next ? f.deliveryFeeAmount : "" }))}
                  trueLabel="Yes"
                  falseLabel="No"
                />
              </div>
              <p className="text-xs text-muted-foreground">If no, this package is pickup only.</p>
              {form.deliveryOffered && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-sm">Is there a delivery fee?</Label>
                    <ToggleGroup
                      value={form.deliveryFeeEnabled}
                      onChange={(next) => setForm((f) => ({ ...f, deliveryFeeEnabled: next, deliveryFeeAmount: next ? f.deliveryFeeAmount : "" }))}
                      trueLabel="Yes"
                      falseLabel="No"
                    />
                  </div>
                  {form.deliveryFeeEnabled && (
                    <div className="max-w-sm space-y-2">
                      <Label>Delivery fee</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          className="pl-7"
                          value={form.deliveryFeeAmount}
                          inputMode="decimal"
                          placeholder="e.g. 50"
                          onChange={(e) => setForm((f) => ({ ...f, deliveryFeeAmount: e.target.value.replace(/[^\d.]/g, "") }))}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Setup — Rental + Venue + Catering */}
          {showSetup && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Setup</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-sm">Do you set up?</Label>
                <ToggleGroup
                  value={form.setupOffered}
                  onChange={(next) => setForm((f) => ({ ...f, setupOffered: next, setupFeeEnabled: next ? f.setupFeeEnabled : false, setupFeeAmount: next ? f.setupFeeAmount : "" }))}
                  trueLabel="Yes"
                  falseLabel="No"
                />
              </div>
              {form.setupOffered && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-sm">Is there a setup fee?</Label>
                    <ToggleGroup
                      value={form.setupFeeEnabled}
                      onChange={(next) => setForm((f) => ({ ...f, setupFeeEnabled: next, setupFeeAmount: next ? f.setupFeeAmount : "" }))}
                      trueLabel="Yes"
                      falseLabel="No"
                    />
                  </div>
                  {form.setupFeeEnabled && (
                    <div className="max-w-sm space-y-2">
                      <Label>Setup fee</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          className="pl-7"
                          value={form.setupFeeAmount}
                          inputMode="decimal"
                          placeholder="e.g. 75"
                          onChange={(e) => setForm((f) => ({ ...f, setupFeeAmount: e.target.value.replace(/[^\d.]/g, "") }))}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Takedown — Rental + Venue + Catering */}
          {showTakedown && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Takedown</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-sm">Do you offer takedown?</Label>
                <ToggleGroup
                  value={form.takedownOffered}
                  onChange={(next) => setForm((f) => ({ ...f, takedownOffered: next, takedownFeeEnabled: next ? f.takedownFeeEnabled : false, takedownFeeAmount: next ? f.takedownFeeAmount : "" }))}
                  trueLabel="Yes"
                  falseLabel="No"
                />
              </div>
              {form.takedownOffered && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Label className="text-sm">Is there a takedown fee?</Label>
                    <ToggleGroup
                      value={form.takedownFeeEnabled}
                      onChange={(next) => setForm((f) => ({ ...f, takedownFeeEnabled: next, takedownFeeAmount: next ? f.takedownFeeAmount : "" }))}
                      trueLabel="Yes"
                      falseLabel="No"
                    />
                  </div>
                  {form.takedownFeeEnabled && (
                    <div className="max-w-sm space-y-2">
                      <Label>Takedown fee</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          className="pl-7"
                          value={form.takedownFeeAmount}
                          inputMode="decimal"
                          placeholder="e.g. 75"
                          onChange={(e) => setForm((f) => ({ ...f, takedownFeeAmount: e.target.value.replace(/[^\d.]/g, "") }))}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Cancellation Policy */}
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-semibold">Cancellation Policy</p>
            <div className="space-y-2">
              {(
                [
                  { value: "cancel_anytime",      label: "Cancel anytime",           description: "Customers can cancel anytime more than 48 hours before the event." },
                  { value: "cancel_within_hours",  label: "Cancel within a window",   description: "Customers can cancel up until a set number of hours before the event." },
                  { value: "no_cancellations",     label: "No cancellations",          description: "All sales are final. No refunds once booked." },
                ] as Array<{ value: CancellationPolicy; label: string; description: string }>
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, cancellationPolicy: opt.value }))}
                  className={[
                    "flex w-full flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors",
                    form.cancellationPolicy === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40",
                  ].join(" ")}
                >
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </button>
              ))}
            </div>
            {form.cancellationPolicy === "cancel_within_hours" && (
              <div className="max-w-xs space-y-2 pt-1">
                <Label>Hours before event</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={form.cancellationPolicyHours}
                  onChange={(e) => setForm((f) => ({ ...f, cancellationPolicyHours: e.target.value.replace(/[^\d]/g, "") }))}
                  placeholder="e.g. 48"
                  className="h-10"
                />
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving
                ? "Saving..."
                : editingId === "new"
                  ? "Add Package"
                  : "Save Package"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setIncludedInput("");
                setNotIncludedInput("");
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
});
