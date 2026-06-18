import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";

interface Listing {
  id: string;
  title?: string;
  status?: string;
  listingData?: { title?: string };
}

interface Discount {
  id: string;
  discountType: "promo_code" | "public_sale";
  code?: string | null;
  percentOff: number;
  startsAt: string;
  endsAt: string;
  maxUses?: number | null;
  listingIds: string[];
  active: boolean;
}

interface DiscountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDiscount?: Discount | null;
}

function toDateInputValue(iso: string): string {
  return iso ? iso.slice(0, 10) : "";
}

export function DiscountModal({ open, onOpenChange, editingDiscount }: DiscountModalProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();

  const [discountType, setDiscountType] = useState<"promo_code" | "public_sale">("public_sale");
  const [code, setCode] = useState("");
  const [percentOff, setPercentOff] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [overlapWarning, setOverlapWarning] = useState(false);

  const { data: listingsData } = useQuery<Listing[]>({
    queryKey: ["/api/vendor/listings"],
    enabled: isAuthenticated && open,
  });
  // Only active listings can take bookings, so only those are eligible for a
  // discount. Drafts/pending/inactive listings are excluded here. Keep any
  // listing already attached to the discount being edited so it isn't silently
  // dropped if its status later changed.
  const listings = (Array.isArray(listingsData) ? listingsData : []).filter(
    (l) =>
      (l.status ?? "").toLowerCase() === "active" ||
      selectedListingIds.includes(l.id),
  );

  // Populate form when editing
  useEffect(() => {
    if (editingDiscount) {
      setDiscountType(editingDiscount.discountType);
      setCode(editingDiscount.code ?? "");
      setPercentOff(String(editingDiscount.percentOff));
      setStartsAt(toDateInputValue(editingDiscount.startsAt));
      setEndsAt(toDateInputValue(editingDiscount.endsAt));
      setMaxUses(editingDiscount.maxUses != null ? String(editingDiscount.maxUses) : "");
      setSelectedListingIds(editingDiscount.listingIds ?? []);
    } else {
      setDiscountType("public_sale");
      setCode("");
      setPercentOff("");
      setStartsAt("");
      setEndsAt("");
      setMaxUses("");
      setSelectedListingIds([]);
    }
    setError(null);
    setOverlapWarning(false);
  }, [editingDiscount, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        discountType,
        percentOff: Number(percentOff),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt + "T23:59:59").toISOString(),
        listingIds: selectedListingIds,
      };
      if (discountType === "promo_code") {
        body.code = code.trim().toUpperCase();
        if (maxUses) body.maxUses = Number(maxUses);
      }

      const method = editingDiscount ? "PATCH" : "POST";
      const url = editingDiscount
        ? `/api/vendor/discounts/${editingDiscount.id}`
        : "/api/vendor/discounts";

      const res = await apiRequest(method, url, body);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to save discount");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/discounts"] });
      if (data.overlappingSale) {
        setOverlapWarning(true);
        setTimeout(() => {
          setOverlapWarning(false);
          onOpenChange(false);
        }, 3000);
      } else {
        onOpenChange(false);
      }
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function toggleListing(id: string) {
    setSelectedListingIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function getListingTitle(l: Listing): string {
    return l.title ?? l.listingData?.title ?? l.id;
  }

  function handleSave() {
    setError(null);
    if (!percentOff || Number(percentOff) < 1 || Number(percentOff) > 100) {
      setError("Percent off must be between 1 and 100");
      return;
    }
    if (!startsAt || !endsAt) {
      setError("Start and end dates are required");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("End date must be after start date");
      return;
    }
    if (discountType === "promo_code" && !code.trim()) {
      setError("Promo code is required");
      return;
    }
    if (discountType === "promo_code" && !/^[A-Z0-9]+$/i.test(code.trim())) {
      setError("Promo code must contain only letters and numbers");
      return;
    }
    if (selectedListingIds.length === 0) {
      setError("Select at least one listing");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-[#2a3a42]">
            {editingDiscount ? t("discountModal.editTitle") : t("discountModal.createTitle")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {editingDiscount
              ? t("discountModal.editDescription")
              : t("discountModal.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {/* Discount type */}
          {!editingDiscount && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-[#2a3a42]">{t("discountModal.discountTypeLabel")}</Label>
              <div className="flex gap-2">
                {(["public_sale", "promo_code"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDiscountType(type)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      discountType === type
                        ? "border-[#e07a6a] bg-[#e07a6a]/10 text-[#e07a6a]"
                        : "border-[rgba(74,106,125,0.22)] text-[#4a6a7d] hover:bg-[#f5f0e8]"
                    }`}
                  >
                    {type === "public_sale" ? t("discountModal.typePublicSale") : t("discountModal.typePromoCode")}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {discountType === "public_sale"
                  ? t("discountModal.publicSaleHelper")
                  : t("discountModal.promoCodeHelper")}
              </p>
            </div>
          )}

          {/* Code + max uses (promo code only) */}
          {discountType === "promo_code" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code" className="text-sm font-medium text-[#2a3a42]">
                  {t("discountModal.promoCodeLabel")}
                </Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  placeholder={t("discountModal.promoCodePlaceholder")}
                  className="font-mono tracking-widest uppercase"
                  maxLength={32}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxUses" className="text-sm font-medium text-[#2a3a42]">
                  {t("discountModal.usageLimitLabel")}{" "}
                  <span className="font-normal text-muted-foreground">{t("discountModal.usageLimitOptional")}</span>
                </Label>
                <Input
                  id="maxUses"
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder={t("discountModal.usageLimitPlaceholder")}
                />
              </div>
            </>
          )}

          {/* Percent off */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="percentOff" className="text-sm font-medium text-[#2a3a42]">
              {t("discountModal.percentOffLabel")}
            </Label>
            <div className="relative">
              <Input
                id="percentOff"
                type="number"
                min={1}
                max={100}
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
                placeholder={t("discountModal.percentOffPlaceholder")}
                className="pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                %
              </span>
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startsAt" className="text-sm font-medium text-[#2a3a42]">
                {t("discountModal.startDateLabel")}
              </Label>
              <Input
                id="startsAt"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endsAt" className="text-sm font-medium text-[#2a3a42]">
                {t("discountModal.endDateLabel")}
              </Label>
              <Input
                id="endsAt"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          {/* Listing multi-select */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-[#2a3a42]">
              {t("discountModal.applyToListings")}{" "}
              <span className="font-normal text-muted-foreground">{t("discountModal.applyToListingsHelper")}</span>
            </Label>
            {listings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("discountModal.noActiveListings")}</p>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-[rgba(74,106,125,0.22)] p-3">
                {listings.map((l) => (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2.5 text-sm text-[#2a3a42] hover:text-[#e07a6a] transition-colors"
                  >
                    <Checkbox
                      checked={selectedListingIds.includes(l.id)}
                      onCheckedChange={() => toggleListing(l.id)}
                      className="border-[rgba(74,106,125,0.4)] data-[state=checked]:bg-[#e07a6a] data-[state=checked]:border-[#e07a6a]"
                    />
                    {getListingTitle(l)}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Overlap warning */}
          {overlapWarning && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {t("discountModal.overlapWarning")}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 rounded-lg bg-red-50 border border-red-200 px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              {t("discountModal.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-[#e07a6a] text-white hover:bg-[#c9695a]"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingDiscount ? (
                t("discountModal.saveChanges")
              ) : (
                t("discountModal.createDiscount")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
