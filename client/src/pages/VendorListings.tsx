import { apiRequest } from "@/lib/queryClient";
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, MapPin, Eye } from "lucide-react";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import VendorShell from "@/components/VendorShell";
import {
  coverRatioToAspectRatio,
  getCoverPhotoIndex,
  getCoverPhotoRatio,
  getListingPhotoUrls,
  moveCoverToFront,
} from "@/lib/listingPhotos";

type AnyListing = any;

export default function VendorListings() {
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: listings = [], isLoading: loadingListings } = useQuery({
    queryKey: ["/api/vendor/listings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load listings");
      }
      return json;
    },
  });

  const allListingRows: AnyListing[] = Array.isArray(listings) ? listings : [];
  const activeListingRows = allListingRows.filter(
    (listing) => String(listing?.status || "").toLowerCase() === "active"
  );
  const draftListingRows = allListingRows.filter(
    (listing) => String(listing?.status || "").toLowerCase() === "draft"
  );
  const inactiveListingRows = allListingRows.filter(
    (listing) => {
      const status = String(listing?.status || "").toLowerCase();
      return status === "inactive" || (status !== "active" && status !== "draft");
    }
  );

  const handleEditListing = (listingId: string) => {
    setLocation(`/vendor/listings/${listingId}`);
  };

  // Delete listing from vendor UX (soft-delete internally via deleted status).
  const deleteMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const response = await apiRequest("DELETE", `/api/vendor/listings/${listingId}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Failed to deactivate listing");
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      toast({
        title: "Listing Deleted",
        description: "This listing was removed from your dashboard and customer discovery.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to deactivate",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleDeleteListing = (listingId: string) => {
    const ok = window.confirm("Delete this listing? It will no longer appear in your dashboard or to customers.");
    if (!ok) return;
    deleteMutation.mutate(listingId);
  };

  const ListingCardRow = ({ listing }: { listing: AnyListing }) => {
    const title =
      listing?.title ??
      listing?.listingData?.listingTitle ??
      listing?.listingData?.serviceType ??
      "Untitled Listing";

    const category = String(listing?.category || listing?.listingData?.category || "").trim();
    const hasCategory = category.length > 0;

    const sl =
      (listing?.listingServiceCenterLabel
        ? { label: listing.listingServiceCenterLabel }
        : null) ??
      listing?.listingData?.serviceLocation ??
      listing?.listingData?.location ??
      listing?.serviceLocation ??
      listing?.location ??
      null;

    const location = (() => {
      const city = sl?.city;
      const region = sl?.region || sl?.state;

      // Best case: structured city/region exists
      if (typeof city === "string" && city.trim()) {
        const c = city.trim();
        const r = typeof region === "string" && region.trim() ? region.trim() : "";
        return r ? `${c}, ${r}` : c;
      }

      // Fallback: derive from label like "Provo, UT, United States"
      const label = typeof sl?.label === "string" ? sl.label.trim() : "";
      if (label) {
        const parts = label.split(",").map((p: string) => p.trim()).filter(Boolean);
        if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
        return parts[0] || "Location not set";
      }

      return "Location not set";
    })();

    const canonicalPriceCents =
      typeof listing?.priceCents === "number" && Number.isFinite(listing.priceCents) ? Math.round(listing.priceCents) : null;
    const legacyPrice =
      typeof listing?.price === "number" && Number.isFinite(listing.price)
        ? listing.price
        : listing?.listingData?.pricing?.rate
          ? Number(listing.listingData.pricing.rate)
          : listing?.listingData?.offerings?.[0]?.price
            ? Number(listing.listingData.offerings[0].price)
            : null;
    const price =
      canonicalPriceCents != null && canonicalPriceCents > 0
        ? `$${(canonicalPriceCents / 100).toLocaleString()}`
        : typeof legacyPrice === "number" && Number.isFinite(legacyPrice)
          ? `$${Number(legacyPrice).toLocaleString()}`
          : "Price not set";

    const photoUrls = getListingPhotoUrls(listing);
    const coverIndex = getCoverPhotoIndex(listing, photoUrls);
    const orderedPhotos = moveCoverToFront(photoUrls, coverIndex);
    const image = orderedPhotos[0] ?? null;
    const coverAspectRatio = coverRatioToAspectRatio(getCoverPhotoRatio(listing));
    const statusValue = String(listing?.status || "draft").trim();
    const statusLabel = statusValue.length > 0
      ? `${statusValue.charAt(0).toUpperCase()}${statusValue.slice(1)}`
      : "Draft";

    return (
      <Card
        className="listing-card-scale-down w-[320px] shrink-0 overflow-hidden border-0 hover-elevate cursor-pointer group"
        onClick={() => handleEditListing(listing.id)}
        data-testid={`card-listing-${listing.id}`}
      >
        <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: coverAspectRatio }}>
          {image ? (
            <img
              src={image}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm bg-muted">
              No photo yet
            </div>
          )}

          <div className="absolute top-3 left-3 z-10">
            <Badge variant="secondary">
              {statusLabel}
            </Badge>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="font-semibold text-[1.8rem] leading-tight mb-1 line-clamp-1" data-testid={`text-title-${listing.id}`}>
                {title}
              </h3>
              <p className="text-sm text-muted-foreground">{hasCategory ? category : "Category not set"}</p>
            </div>
            <button
              type="button"
              className="ml-3 shrink-0 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                handleEditListing(listing.id);
              }}
              data-testid={`button-edit-${listing.id}`}
              aria-label={`Edit ${title}`}
            >
              <Edit className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4" />
            <span>{location}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-[hsl(var(--secondary-accent))]">
                {price}
              </span>
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                <span>{listing?.views || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium">{listing?.bookings || 0}</span>
                <span>bookings</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-t-[var(--dashboard-divider-blue)]">
            <div />

            <Button
              variant="outline"
              className="w-full min-w-0 px-2"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteListing(listing.id);
              }}
              data-testid={`button-delete-${listing.id}`}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete listing"}
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const ListingSection = ({
    title,
    listings,
    status,
    emptyMessage,
    isLoading,
    showSectionDivider = false,
  }: {
    title: string;
    listings: AnyListing[];
      status: string;
    emptyMessage: string;
    isLoading?: boolean;
    showSectionDivider?: boolean;
  }) => (
    <div className="mb-10" data-testid={`section-${status}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        <span className="text-sm text-muted-foreground">
          {listings.length} {listings.length === 1 ? "listing" : "listings"}
        </span>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </Card>
      ) : listings.length > 0 ? (
        <div className="overflow-x-auto -mx-6 px-6">
          <div className="flex items-start gap-4 pb-4 pr-4">
            {listings.map((listing: AnyListing) => (
              <ListingCardRow key={listing.id} listing={listing} />
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </Card>
      )}

      {showSectionDivider && listings.length > 0 && !isLoading && (
        <div className="-mx-6 px-6 pt-1" aria-hidden>
          <div className="h-px w-full bg-[var(--dashboard-divider-blue)]" />
        </div>
      )}
    </div>
  );

  return (
    <VendorShell>
      <>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
                Listings Management
              </h1>
              <p className="text-muted-foreground">
                Create and manage your service listings, packages, and pricing
              </p>
            </div>

            <Button
              onClick={() => setShowCreateWizard(true)}
              data-testid="button-create-listing"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Listing
            </Button>
          </div>

          <ListingSection
            title="Active Listings"
            listings={activeListingRows}
            status="active"
            emptyMessage="No active listings. Create a listing to get started."
            isLoading={loadingListings}
            showSectionDivider={draftListingRows.length > 0 || inactiveListingRows.length > 0}
          />

          <ListingSection
            title="Inactive Listings"
            listings={inactiveListingRows}
            status="inactive"
            emptyMessage="No inactive listings."
            isLoading={loadingListings}
            showSectionDivider={draftListingRows.length > 0}
          />

          <ListingSection
            title="Draft Listings"
            listings={draftListingRows}
            status="draft"
            emptyMessage="No draft listings."
            isLoading={loadingListings}
          />
        </div>

        {showCreateWizard && (
          <div className="fixed inset-0 z-50 bg-background">
            <CreateListingWizard onClose={() => setShowCreateWizard(false)} />
          </div>
        )}
      </>
    </VendorShell>
  );

}
