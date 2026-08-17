import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import React, { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Eye, Sparkles, Lock } from "lucide-react";
import type { VendorMeState } from "@/lib/vendorState";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import VendorShell from "@/components/VendorShell";
import { useUpgradeModal } from "@/components/UpgradeModal";
import { StripeSetupModal } from "@/components/StripeSetupModal";
import { getPublishErrorCode, getPublishFailureToastContent } from "@/lib/publishFailureToast";
import {
  coverRatioToAspectRatio,
  getCoverPhotoIndex,
  getCoverPhotoRatio,
  getListingPhotoUrls,
  moveCoverToFront,
} from "@/lib/listingPhotos";

type AnyListing = any;
const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const buildPublishPayloadFromListing = (listing: AnyListing) => {
  const listingDataSource =
    listing?.listingData && typeof listing.listingData === "object" && !Array.isArray(listing.listingData)
      ? listing.listingData
      : {};
  const listingDescription =
    asTrimmedString(listingDataSource?.listingDescription) ||
    asTrimmedString(listingDataSource?.description) ||
    asTrimmedString(listingDataSource?.serviceDescription) ||
    asTrimmedString(listing?.description);

  return {
    title: asTrimmedString(listing?.title) || asTrimmedString(listingDataSource?.listingTitle) || undefined,
    listingData: {
      ...listingDataSource,
      listingDescription: listingDescription || undefined,
      description: listingDescription || undefined,
      serviceDescription: listingDescription || undefined,
    },
  };
};

export default function VendorListings() {
  const { t } = useTranslation();
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const upgrade = useUpgradeModal();
  const [showStripeSetup, setShowStripeSetup] = useState(false);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();

  const { data: listings = [], isLoading: loadingListings } = useQuery({
    queryKey: ["/api/vendor/listings"],
    enabled: isAuthenticated && !isAuthLoading,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load listings");
      }
      return json;
    },
  });

  const { data: me } = useQuery<VendorMeState>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated && !isAuthLoading,
  });
  const hasProFeatures = Boolean(me?.hasProFeatures);

  const allListingRows: AnyListing[] = (Array.isArray(listings) ? listings : []).filter(
    (l) => l?.listingType !== "package_item"
  );
  const activeListingRows = allListingRows.filter(
    (listing) => String(listing?.status || "").toLowerCase() === "active"
  );
  // Free tier may keep only 1 active listing at a time. Pro subscribers and
  // commission-model vendors both get unlimited listings.
  const atFreeListingCap = !hasProFeatures && activeListingRows.length >= 1;
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

  const handleDeleteListing = (listingId: string, isDraft?: boolean) => {
    if (!isDraft) {
      const ok = window.confirm("Delete this listing? It will no longer appear in your dashboard or to customers.");
      if (!ok) return;
    }
    deleteMutation.mutate(listingId);
  };

  const publishMutation = useMutation({
    mutationFn: async (listing: AnyListing) => {
      const listingId = String(listing?.id || "").trim();
      if (!listingId) throw new Error("Missing listing id");
      // apiRequest throws an ApiRequestError on any non-2xx (it does NOT return a
      // non-ok Response), so the error code is parsed from that error in onError.
      const response = await apiRequest(
        "PATCH",
        `/api/vendor/listings/${listingId}/publish`,
        buildPublishPayloadFromListing(listing)
      );
      return response.json().catch(() => null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      toast({
        title: "Listing Published",
        description: "This listing is now live for customers.",
      });
    },
    onError: (error: any) => {
      const code = getPublishErrorCode(error);
      if (code === "onboarding_incomplete") {
        toast({
          title: "Finish your profile first",
          description: "Complete vendor onboarding before publishing a listing.",
          action: (
            <a
              href="/vendor/onboarding"
              className="underline font-semibold text-sm"
            >
              Complete profile
            </a>
          ),
        } as any);
        return;
      }
      if (code === "listing_limit_reached") {
        upgrade.open();
        return;
      }
      if (code === "stripe_not_configured") {
        setShowStripeSetup(true);
        return;
      }
      const publishError = getPublishFailureToastContent(error);
      toast({
        title: publishError.title,
        description: publishError.description,
        variant: "destructive",
      });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const response = await apiRequest("PATCH", `/api/vendor/listings/${listingId}/unpublish`, {});
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to unpublish listing");
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] });
      toast({
        title: "Listing Unpublished",
        description: "This listing is now hidden from customers.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unpublish failed",
        description: error?.message || "Unable to unpublish listing.",
        variant: "destructive",
      });
    },
  });

  const ListingCardRow = ({ listing }: { listing: AnyListing }) => {
    const title =
      listing?.title ??
      listing?.listingData?.listingTitle ??
      listing?.listingData?.serviceType ??
      "Untitled Listing";

    const isPackageContainer = listing?.listingType === "package_container";
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
    const rawPriceString =
      canonicalPriceCents != null && canonicalPriceCents > 0
        ? `$${(canonicalPriceCents / 100).toLocaleString()}`
        : typeof legacyPrice === "number" && Number.isFinite(legacyPrice)
          ? `$${Number(legacyPrice).toLocaleString()}`
          : t("vendorListings.priceNotSet");
    const price = isPackageContainer ? `From ${rawPriceString}` : rawPriceString;

    const photoUrls = getListingPhotoUrls(listing);
    const coverIndex = getCoverPhotoIndex(listing, photoUrls);
    const orderedPhotos = moveCoverToFront(photoUrls, coverIndex);
    const image = orderedPhotos[0] ?? null;
    const coverAspectRatio = coverRatioToAspectRatio(getCoverPhotoRatio(listing));
    const statusValue = String(listing?.status || "draft").trim();
    const statusLower = statusValue.toLowerCase();
    const isActive = statusLower === "active";
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
              {t("vendorListings.noPhotoYet")}
            </div>
          )}

          <div className="absolute top-3 left-3 z-10">
            <Badge variant="secondary">
              {statusLabel}
            </Badge>
          </div>

          <button
            type="button"
            className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/80 px-2.5 py-1 text-sm font-medium text-[#2a3a42] shadow-sm backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-white"
            onClick={(e) => {
              e.stopPropagation();
              handleEditListing(listing.id);
            }}
            data-testid={`button-edit-${listing.id}`}
            aria-label={`Edit ${title}`}
          >
            <Edit className="w-3.5 h-3.5" />
            {t("vendorListings.edit")}
          </button>
        </div>

        <div className="p-4">
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="font-semibold text-[1.8rem] leading-tight line-clamp-1 min-w-0 flex-1" data-testid={`text-title-${listing.id}`}>
              {title}
            </h3>
            <span className="text-[2.3rem] shrink-0 font-heading font-bold text-[#e07a6a]">{price}</span>
          </div>

          <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              <span>{listing?.views || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium">{listing?.bookings || 0}</span>
              <span>{t("vendorListings.bookings")}</span>
            </div>
          </div>

          <div className="mt-4 flex gap-2 border-t border-t-[var(--dashboard-divider-blue)] pt-4">
            <Button
              variant="outline"
              className="min-w-0 flex-1 px-2 hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteListing(listing.id, String(listing?.status || "").toLowerCase() === "draft");
              }}
              data-testid={`button-delete-${listing.id}`}
              disabled={deleteMutation.isPending || publishMutation.isPending || unpublishMutation.isPending}
            >
              {deleteMutation.isPending ? t("vendorListings.deleting") : t("vendorListings.delete")}
            </Button>

            {isActive ? (
              <Button
                variant="outline"
                className="min-w-0 flex-1 px-2 hover:border-transparent hover:bg-[hsl(var(--secondary-accent))] hover:text-[hsl(var(--secondary-accent-foreground))]"
                onClick={(e) => {
                  e.stopPropagation();
                  unpublishMutation.mutate(listing.id);
                }}
                data-testid={`button-unpublish-${listing.id}`}
                disabled={deleteMutation.isPending || publishMutation.isPending || unpublishMutation.isPending}
              >
                {unpublishMutation.isPending ? t("vendorListings.unpublishing") : t("vendorListings.unpublish")}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="min-w-0 flex-1 px-2 hover:bg-primary hover:text-primary-foreground hover:border-primary-border"
                onClick={(e) => {
                  e.stopPropagation();
                  publishMutation.mutate(listing);
                }}
                data-testid={`button-publish-${listing.id}`}
                disabled={deleteMutation.isPending || publishMutation.isPending || unpublishMutation.isPending}
              >
                {publishMutation.isPending ? t("vendorListings.publishing") : t("vendorListings.publish")}
              </Button>
            )}
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
          {listings.length} {listings.length === 1 ? t("vendorListings.listing") : t("vendorListings.listings")}
        </span>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{t("vendorListings.loading")}</p>
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
                {t("vendorListings.pageTitle")}
              </h1>
            </div>

            <Button
              onClick={() => setShowCreateWizard(true)}
              data-testid="button-create-listing"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("vendorListings.createListing")}
            </Button>
          </div>

          {atFreeListingCap ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#4a6a7d]/30 bg-[#4a6a7d]/8 px-4 py-3" data-testid="listing-cap-banner">
              <Lock className="h-4 w-4 shrink-0 text-[#4a6a7d]" />
              <p className="flex-1 text-sm text-[#2a3a42]">
                Your free plan includes 1 active listing. You can keep building drafts — upgrade to Pro to publish unlimited listings.
              </p>
              <Button onClick={() => upgrade.open()} size="sm" className="bg-[#4a6a7d] hover:bg-[#3f5c6d] text-[#f5f0e8]">
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Upgrade to Pro
              </Button>
            </div>
          ) : null}

          <ListingSection
            title={t("vendorListings.activeListings")}
            listings={activeListingRows}
            status="active"
            emptyMessage={t("vendorListings.noActiveListings")}
            isLoading={loadingListings}
            showSectionDivider={draftListingRows.length > 0 || inactiveListingRows.length > 0}
          />

          <ListingSection
            title={t("vendorListings.inactiveListings")}
            listings={inactiveListingRows}
            status="inactive"
            emptyMessage={t("vendorListings.noInactiveListings")}
            isLoading={loadingListings}
            showSectionDivider={draftListingRows.length > 0}
          />

          <ListingSection
            title={t("vendorListings.draftListings")}
            listings={draftListingRows}
            status="draft"
            emptyMessage={t("vendorListings.noDraftListings")}
            isLoading={loadingListings}
          />
        </div>

        {showCreateWizard && (
          <div className="fixed inset-0 z-50 bg-background">
            <CreateListingWizard onClose={() => setShowCreateWizard(false)} />
          </div>
        )}

        {/* Vendor clicked Publish on a draft without finishing Stripe setup. */}
        <StripeSetupModal open={showStripeSetup} onOpenChange={setShowStripeSetup} />
      </>
    </VendorShell>
  );

}
