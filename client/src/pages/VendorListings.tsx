import { apiRequest } from "@/lib/queryClient";
import React, { useMemo, useState } from "react";
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
import { getListingRentalTypes } from "@/lib/rentalTypes";
import { getPublishFailureToastContent } from "@/lib/publishFailureToast";
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
  const [editingListing, setEditingListing] = useState<any | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Draft listings
  const { data: draftListings = [], isLoading: loadingDrafts } = useQuery({
    queryKey: ["/api/vendor/listings", "draft"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings?status=draft");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load draft listings");
      }
      return json;
    },
  });

  // Active listings
  const { data: activeListings = [], isLoading: loadingActive } = useQuery({
    queryKey: ["/api/vendor/listings", "active"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings?status=active");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load active listings");
      }
      return json;
    },
  });

  // Inactive listings
  const { data: inactiveListings = [], isLoading: loadingInactive } = useQuery({
    queryKey: ["/api/vendor/listings", "inactive"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings?status=inactive");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load inactive listings");
      }
      return json;
    },
  });

  const draftListingRows: AnyListing[] = Array.isArray(draftListings) ? draftListings : [];
  const activeListingRows: AnyListing[] = Array.isArray(activeListings) ? activeListings : [];
  const inactiveListingRows: AnyListing[] = Array.isArray(inactiveListings) ? inactiveListings : [];

  // Hide empty shell drafts (default title + no meaningful data)
  const visibleDraftListings = useMemo(() => {
    return draftListingRows.filter((l: AnyListing) => {
      const title = String(l?.title || "").trim();
      const data = l?.listingData || {};

      const photosCount =
        data?.photos?.count ??
        (Array.isArray(data?.photos?.names) ? data.photos.names.length : 0) ??
        (Array.isArray(data?.photos) ? data.photos.length : 0);

      const rentalTypesCount = getListingRentalTypes(data).length;

      const rate = data?.pricing?.rate;
      const hasRate = rate !== null && rate !== undefined && `${rate}`.trim() !== "";

      const desc = String(data?.listingDescription || "").trim();
      const hasAnyContent = photosCount > 0 || rentalTypesCount > 0 || hasRate || desc.length > 0;

      const isDefaultDraftTitle = /^new\s+.+\s+listing$/i.test(title);
      const isEmptyShell = isDefaultDraftTitle && !hasAnyContent;
      return !isEmptyShell;
    });
  }, [draftListingRows]);

  const handleEditListing = (listingId: string) => {
    setLocation(`/vendor/listings/${listingId}`);
  };

  const handleCloseWizard = () => {
    setShowCreateWizard(false);
    setEditingListing(null);
  };

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const response = await apiRequest("PATCH", `/api/vendor/listings/${listingId}/publish`);
      if (!response.ok) throw new Error("Failed to publish listing");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "draft"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "inactive"] });

      toast({
        title: "Listing published!",
        description: "Your listing is now live and visible to customers.",
      });
    },
    onError: (error: unknown) => {
      const publishError = getPublishFailureToastContent(error);
      toast({
        title: publishError.title,
        description: publishError.description,
        variant: "destructive",
      });
    },
  });

  const handlePublishListing = (listingId: string) => {
    publishMutation.mutate(listingId);
  };

    // Unpublish mutation (active -> inactive)
  const unpublishMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const response = await apiRequest("PATCH", `/api/vendor/listings/${listingId}/unpublish`);
      if (!response.ok) throw new Error("Failed to unpublish listing");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "draft"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "inactive"] });

      toast({
        title: "Listing unpublished",
        description: "Your listing is now inactive and hidden from customers.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to unpublish",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleUnpublishListing = (listingId: string) => {
    unpublishMutation.mutate(listingId);
  };

  // Delete mutation (any listing)
  const deleteMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const response = await apiRequest("DELETE", `/api/vendor/listings/${listingId}`);
      if (!response.ok && response.status !== 204) throw new Error("Failed to delete listing");
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "draft"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "inactive"] });

      toast({
        title: "Listing deleted",
        description: "This listing was permanently removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete",
        description: error?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleDeleteListing = (listingId: string) => {
    const ok = window.confirm("Delete this listing? This cannot be undone.");
    if (!ok) return;
    deleteMutation.mutate(listingId);
  };

  const ListingCardRow = ({ listing, status }: { listing: AnyListing; status: string }) => {
    const isDraft = status === "draft";
    const isActive = status === "active";
    const isInactive = status === "inactive";

    const title =
      listing?.listingData?.listingTitle ??
      listing?.title ??
      listing?.listingData?.serviceType ??
      "Untitled Listing";

    const category = listing?.category || listing?.listingData?.serviceType || "";

    const sl =
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

    const price =
      listing?.price ||
      (listing?.listingData?.pricing?.rate ? `$${listing.listingData.pricing.rate}` : null) ||
      (listing?.listingData?.offerings?.[0]?.price ? `$${listing.listingData.offerings[0].price}` : "Price not set");

    const photoUrls = getListingPhotoUrls(listing);
    const coverIndex = getCoverPhotoIndex(listing, photoUrls);
    const orderedPhotos = moveCoverToFront(photoUrls, coverIndex);
    const image = orderedPhotos[0] ?? null;
    const coverAspectRatio = coverRatioToAspectRatio(getCoverPhotoRatio(listing));


    const statusLabel = isDraft ? "Draft" : isActive ? "Active" : "Inactive";

    return (
      <Card
        className="w-[320px] shrink-0 overflow-hidden border-0 hover-elevate cursor-pointer group"
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
            {isDraft || isActive ? (
              <Badge variant="secondary">
                {statusLabel}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-[hsl(var(--secondary-accent)/0.6)] bg-[hsl(var(--secondary-accent)/0.12)] text-[hsl(var(--secondary-accent))]"
              >
                <Edit className="w-3 h-3 mr-1" />
                <span>{statusLabel}</span>
              </Badge>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1 line-clamp-1" data-testid={`text-title-${listing.id}`}>
                {title}
              </h3>
              <p className="text-sm text-muted-foreground">{category}</p>
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

            {!isDraft && (
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
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t">
            {(isDraft || isInactive) && (
              <Button
                className="w-full min-w-0 border border-[hsl(var(--secondary-accent)/0.55)] bg-[hsl(var(--secondary-accent))] px-2 text-[hsl(var(--secondary-accent-foreground))] hover:bg-[hsl(var(--secondary-accent)/0.9)]"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePublishListing(listing.id);
                }}
                data-testid={`button-publish-${listing.id}`}
                disabled={publishMutation.isPending}
              >
                {publishMutation.isPending ? "Publishing..." : "Publish"}
              </Button>
            )}

            {isActive && (
              <Button
                variant="outline"
                className="w-full min-w-0 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnpublishListing(listing.id);
                }}
                data-testid={`button-unpublish-${listing.id}`}
                disabled={unpublishMutation.isPending}
              >
                Unpublish
              </Button>
            )}

            <Button
              variant="destructive"
              className="w-full min-w-0 px-2"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteListing(listing.id);
              }}
              data-testid={`button-delete-${listing.id}`}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
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
  }: {
    title: string;
    listings: AnyListing[];
    status: "active" | "inactive" | "draft";
    emptyMessage: string;
    isLoading?: boolean;
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
              <ListingCardRow key={listing.id} listing={listing} status={status} />
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </Card>
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
            emptyMessage="No active listings. Publish a draft to make it active."
            isLoading={loadingActive}
          />

          <ListingSection
            title="Inactive Listings"
            listings={inactiveListingRows}
            status="inactive"
            emptyMessage="No inactive listings."
            isLoading={loadingInactive}
          />

          <ListingSection
            title="Draft Listings"
            listings={visibleDraftListings}
            status="draft"
            emptyMessage="No draft listings. Start creating a new listing to save it as a draft."
            isLoading={loadingDrafts}
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
