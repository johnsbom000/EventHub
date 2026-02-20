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
      return res.json();
    },
  });

  // Active listings
  const { data: activeListings = [], isLoading: loadingActive } = useQuery({
    queryKey: ["/api/vendor/listings", "active"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings?status=active");
      return res.json();
    },
  });

  // Inactive listings
  const { data: inactiveListings = [], isLoading: loadingInactive } = useQuery({
    queryKey: ["/api/vendor/listings", "inactive"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings?status=inactive");
      return res.json();
    },
  });

  // Hide empty shell drafts (default title + no meaningful data)
  const visibleDraftListings = useMemo(() => {
    return (draftListings || []).filter((l: AnyListing) => {
      const title = String(l?.title || "").trim();
      const data = l?.listingData || {};

      const photosCount =
        data?.photos?.count ??
        (Array.isArray(data?.photos?.names) ? data.photos.names.length : 0) ??
        (Array.isArray(data?.photos) ? data.photos.length : 0);

      const propTypesCount = Array.isArray(data?.propTypes) ? data.propTypes.length : 0;

      const rate = data?.pricing?.rate;
      const hasRate = rate !== null && rate !== undefined && `${rate}`.trim() !== "";

      const desc = String(data?.listingDescription || "").trim();
      const hasAnyContent = photosCount > 0 || propTypesCount > 0 || hasRate || desc.length > 0;

      const isEmptyShell = title === "New prop-decor listing" && !hasAnyContent;
      return !isEmptyShell;
    });
  }, [draftListings]);

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
    onError: (error: any) => {
      toast({
        title: "Failed to publish",
        description: error?.message || "Unknown error",
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

    const photosArr: any[] = Array.isArray(listing?.photos) ? listing.photos : [];

    const coverCandidate =
      photosArr.find((p) => p && typeof p === "object" && p.isCover === true) ??
      photosArr[0] ??
      listing?.image ??
      (Array.isArray(listing?.listingData?.photos?.names)
        ? { name: listing.listingData.photos.names[0] }
        : undefined);

    const rawImage =
      typeof coverCandidate === "string"
        ? coverCandidate
        : coverCandidate && typeof coverCandidate === "object"
        ? typeof coverCandidate.url === "string"
          ? coverCandidate.url
          : typeof coverCandidate.name === "string"
          ? `/uploads/listings/${coverCandidate.name}`
          : undefined
        : undefined;

    const image =
      typeof rawImage === "string" &&
      (rawImage.startsWith("http://") || rawImage.startsWith("https://") || rawImage.startsWith("/")) &&
      !rawImage.toLowerCase().endsWith(".heic")
        ? rawImage
        : null;


    const statusLabel = isDraft ? "Draft" : isActive ? "Active" : "Inactive";

    return (
      <Card
        className="w-[320px] shrink-0 overflow-hidden hover-elevate cursor-pointer group"
        onClick={() => handleEditListing(listing.id)}
        data-testid={`card-listing-${listing.id}`}
      >
        <div className="overflow-hidden relative">
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

          <div className="absolute top-3 left-3">
            {isDraft ? (
              <Badge style={{ backgroundColor: "#9EDBC0", color: "white", borderColor: "#8CCBB0" }}>
                {statusLabel}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-white/90 hover:bg-white" style={{ borderColor: "#9EDBC0" }}>
                <Edit className="w-3 h-3 mr-1" style={{ color: "#9EDBC0" }} />
                <span style={{ color: "#9EDBC0" }}>{statusLabel}</span>
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
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4" />
            <span>{location}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="font-semibold" style={{ color: "#9EDBC0" }}>
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

          <div className="flex gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                handleEditListing(listing.id);
              }}
              data-testid={`button-edit-${listing.id}`}
            >
              Edit
            </Button>

            {(isDraft || isInactive) && (
              <Button
                className="flex-1"
                style={{ backgroundColor: "#9EDBC0", color: "white" }}
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
                className="flex-1"
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
              className="flex-1"
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
          <div className="flex gap-4 pb-4">
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
            listings={activeListings}
            status="active"
            emptyMessage="No active listings. Publish a draft to make it active."
            isLoading={loadingActive}
          />

          <ListingSection
            title="Inactive Listings"
            listings={inactiveListings}
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
