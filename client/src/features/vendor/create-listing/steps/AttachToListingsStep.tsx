import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Package, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getFreshAccessToken } from "@/lib/authToken";

interface AttachableListing {
  id: string;
  title: string | null;
  listingType: "single" | "package_container";
  status: string;
  priceCents: number | null;
  pricingUnit: string | null;
  photos: string[] | null;
  attached: boolean;
}

interface AttachToListingsStepProps {
  /** The add-on listing being created/edited. Null until it has been saved once. */
  addonListingId: string | null;
}

function formatPrice(cents: number | null, unit: string | null): string {
  if (cents == null) return "Price TBD";
  const dollars = (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (unit === "per_hour") return `${dollars}/hr`;
  if (unit === "per_day") return `${dollars}/day`;
  return dollars;
}

export function AttachToListingsStep({ addonListingId }: AttachToListingsStepProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ["/api/vendor/addon-listings", addonListingId, "attachable"];

  const { data: listings = [], isLoading } = useQuery<AttachableListing[]>({
    queryKey,
    queryFn: async () => {
      if (!addonListingId) return [];
      const token = await getFreshAccessToken();
      const res = await fetch(`/api/vendor/addon-listings/${addonListingId}/attachable`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(addonListingId),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ parentId, attached }: { parentId: string; attached: boolean }) => {
      if (attached) {
        await apiRequest("DELETE", `/api/vendor/listings/${parentId}/addon-links/${addonListingId}`);
      } else {
        await apiRequest("POST", `/api/vendor/listings/${parentId}/addon-links`, {
          addonListingId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast({ title: "Couldn't update attachment", variant: "destructive" });
    },
  });

  if (!addonListingId) {
    return (
      <div className="mx-auto w-full max-w-[53rem] space-y-8">
        <header className="space-y-3">
          <h1 className="text-5xl font-semibold tracking-tight">Attach to Listings</h1>
          <p className="text-base text-muted-foreground">
            Save your add-on first to attach it to your listings.
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Attach to Listings</h1>
        <p className="text-base text-muted-foreground">
          Choose which of your listings offer this add-on as an optional upgrade. Inventory is a
          shared pool across every listing it's attached to. You can change this anytime.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : listings.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Package className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            You don't have any single or package listings yet. Create one to attach this add-on to it.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {listings.map((listing) => {
            const Icon = listing.listingType === "package_container" ? ShoppingBag : Package;
            return (
              <button
                key={listing.id}
                type="button"
                onClick={() =>
                  toggleMutation.mutate({ parentId: listing.id, attached: listing.attached })
                }
                disabled={toggleMutation.isPending}
                className={`flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-4 text-left transition ${
                  listing.attached
                    ? "border-green-600/50 bg-green-50/60"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{listing.title ?? "Untitled listing"}</p>
                    <p className="text-xs text-muted-foreground">
                      {listing.listingType === "package_container" ? "Package" : "Single"}
                      {listing.status === "draft" ? " · Draft" : ""}
                      {" · "}
                      {formatPrice(listing.priceCents, listing.pricingUnit)}
                    </p>
                  </div>
                </div>
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border ${
                    listing.attached
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-border text-transparent"
                  }`}
                >
                  <Check className="h-4 w-4" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
