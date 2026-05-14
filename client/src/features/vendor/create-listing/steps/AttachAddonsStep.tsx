import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getFreshAccessToken } from "@/lib/authToken";

interface AddonLink {
  id: string;
  addonListingId: string;
  title: string | null;
  priceCents: number | null;
  pricingUnit: string | null;
  quantity: number;
  status: string;
}

interface VendorAddon {
  id: string;
  title: string | null;
  priceCents: number | null;
  pricingUnit: string | null;
  quantity: number;
  status: string;
}

interface AttachAddonsStepProps {
  listingId: string | null;
  /** Opens the full add-on creation wizard as an overlay. */
  onCreateNewAddon: () => void;
}

function formatPrice(cents: number | null, unit: string | null): string {
  if (cents == null) return "Price TBD";
  const dollars = (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (unit === "per_hour") return `${dollars}/hr`;
  if (unit === "per_day") return `${dollars}/day`;
  return dollars;
}

export function AttachAddonsStep({ listingId, onCreateNewAddon }: AttachAddonsStepProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [catalogOpen, setCatalogOpen] = useState(false);

  const { data: linkedAddons = [], isLoading: linksLoading } = useQuery<AddonLink[]>({
    queryKey: ["/api/vendor/listings", listingId, "addon-links"],
    queryFn: async () => {
      if (!listingId) return [];
      const token = await getFreshAccessToken();
      const res = await fetch(`/api/vendor/listings/${listingId}/addon-links`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(listingId),
  });

  const { data: allAddons = [] } = useQuery<VendorAddon[]>({
    queryKey: ["/api/vendor/addon-listings"],
    queryFn: async () => {
      const token = await getFreshAccessToken();
      const res = await fetch("/api/vendor/addon-listings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const linkedIds = new Set(linkedAddons.map((l) => l.addonListingId));
  const unattachedAddons = allAddons.filter((a) => !linkedIds.has(a.id));

  const unlinkMutation = useMutation({
    mutationFn: async (addonId: string) => {
      await apiRequest("DELETE", `/api/vendor/listings/${listingId}/addon-links/${addonId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId, "addon-links"] });
    },
    onError: () => {
      toast({ title: "Failed to remove add-on", variant: "destructive" });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (addonListingId: string) => {
      await apiRequest("POST", `/api/vendor/listings/${listingId}/addon-links`, { addonListingId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", listingId, "addon-links"] });
      toast({ title: "Add-on attached" });
    },
    onError: () => {
      toast({ title: "Failed to attach add-on", variant: "destructive" });
    },
  });

  if (!listingId) {
    return (
      <div className="mx-auto w-full max-w-[53rem] space-y-8">
        <header className="space-y-3">
          <h1 className="text-5xl font-semibold tracking-tight">Attach Add-ons</h1>
          <p className="text-base text-muted-foreground">Save your listing first to manage add-ons.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Attach Add-ons</h1>
        <p className="text-base text-muted-foreground">
          Add-ons appear on your listing as optional upgrades customers can select. Each add-on has its own
          inventory — a shared pool across every listing it's attached to.
        </p>
      </header>

      {linksLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : linkedAddons.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Attached add-ons</p>
          <div className="space-y-2">
            {linkedAddons.map((link) => (
              <Card key={link.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{link.title ?? "Untitled add-on"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(link.priceCents, link.pricingUnit)} · Qty: {link.quantity}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => unlinkMutation.mutate(link.addonListingId)}
                  disabled={unlinkMutation.isPending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Package className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No add-ons attached yet.</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {unattachedAddons.length > 0 && (
          <Button type="button" variant="outline" onClick={() => setCatalogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Attach existing add-on
          </Button>
        )}
        <Button type="button" onClick={onCreateNewAddon}>
          <Plus className="mr-2 h-4 w-4" />
          Create new add-on
        </Button>
      </div>

      {catalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your Add-ons</h2>
              <button
                type="button"
                onClick={() => setCatalogOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto">
              {unattachedAddons.map((addon) => (
                <button
                  key={addon.id}
                  type="button"
                  onClick={() => {
                    linkMutation.mutate(addon.id);
                    setCatalogOpen(false);
                  }}
                  disabled={linkMutation.isPending}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left transition hover:bg-muted"
                >
                  <div>
                    <p className="text-sm font-medium">{addon.title ?? "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(addon.priceCents, addon.pricingUnit)} · Qty: {addon.quantity}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              {unattachedAddons.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  All your add-ons are already attached.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
