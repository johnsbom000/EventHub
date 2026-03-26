import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import MasonryListingGrid from "@/components/MasonryListingGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ListingPublic } from "@/types/listing";
import { getFreshAccessToken } from "@/lib/authToken";
import { normalizeHobbyList } from "@shared/hobby-tags";

type VendorReview = {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  authorName?: string | null;
  eventLabel?: string | null;
  createdAt?: string | null;
};

type PhotoPosition = {
  x: number;
  y: number;
};

type VendorShopResponse = {
  vendor: {
    id: string;
    businessName: string;
    aboutBusiness?: string | null;
    aboutOwner?: string | null;
    profileImageUrl?: string | null;
    coverImageUrl?: string | null;
    coverImagePosition?: PhotoPosition | null;
    tagline?: string | null;
    serviceArea?: string | null;
    serviceRadius?: number | null;
    inBusinessSinceYear?: string | null;
    specialties?: string[] | null;
    yearsInBusiness?: string | null;
    hobbies?: string | null;
    likesDislikes?: string | null;
    homeState?: string | null;
    funFacts?: string | null;
    city?: string | null;
    serviceType?: string | null;
    activeListingsCount?: number | null;
    eventsServedTotal?: number | null;
    avgResponseMinutes?: number | null;
    rating?: number | null;
    reviewCount?: number | null;
    reviewBreakdown?: Record<string, number> | null;
    reviews?: VendorReview[] | null;
  };
  listings: ListingPublic[];
};

type VendorMe = {
  id: string;
};

const SHOP_PUBLIC_IMAGE_MAX_DIMENSION = 1024;
const SHOP_PUBLIC_IMAGE_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58];

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatServiceAreaLabel(
  serviceAreaValue: unknown,
  cityValue: unknown,
  serviceRadiusValue: unknown
): string {
  const base = asTrimmedString(serviceAreaValue) || asTrimmedString(cityValue) || "Not set";
  const parsedRadius = Number(serviceRadiusValue);
  if (!Number.isFinite(parsedRadius) || parsedRadius <= 0 || base === "Not set") {
    return base;
  }
  return `${base} +${Math.floor(parsedRadius)} miles`;
}

function normalizePhotoPosition(value: unknown): PhotoPosition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { x: 0, y: 0 };
  }
  const rawX = Number((value as { x?: unknown }).x);
  const rawY = Number((value as { y?: unknown }).y);
  return {
    x: Number.isFinite(rawX) ? Math.max(-1, Math.min(1, rawX)) : 0,
    y: Number.isFinite(rawY) ? Math.max(-1, Math.min(1, rawY)) : 0,
  };
}

function toObjectPositionValue(position: PhotoPosition): string {
  return `${50 - position.x * 50}% ${50 - position.y * 50}%`;
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function pickSmallestEncodedDataUrl(canvas: HTMLCanvasElement, quality: number) {
  const jpeg = canvas.toDataURL("image/jpeg", quality);
  const webp = canvas.toDataURL("image/webp", quality);
  if (!webp.startsWith("data:image/webp")) return jpeg;
  return estimateDataUrlBytes(webp) <= estimateDataUrlBytes(jpeg) ? webp : jpeg;
}

function encodeCanvas(canvas: HTMLCanvasElement) {
  let bestDataUrl = pickSmallestEncodedDataUrl(canvas, SHOP_PUBLIC_IMAGE_QUALITIES[0]);
  let bestBytes = estimateDataUrlBytes(bestDataUrl);

  for (const quality of SHOP_PUBLIC_IMAGE_QUALITIES.slice(1)) {
    const candidate = pickSmallestEncodedDataUrl(canvas, quality);
    const candidateBytes = estimateDataUrlBytes(candidate);
    if (candidateBytes < bestBytes) {
      bestDataUrl = candidate;
      bestBytes = candidateBytes;
    }
  }

  return bestDataUrl;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = src;
  });
}

function trimTransparentCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const { width, height } = canvas;
  if (width <= 0 || height <= 0) return canvas;

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return canvas;
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) return canvas;

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = trimmedWidth;
  trimmedCanvas.height = trimmedHeight;
  const trimmedContext = trimmedCanvas.getContext("2d");
  if (!trimmedContext) return canvas;
  trimmedContext.drawImage(canvas, minX, minY, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
  return trimmedCanvas;
}

async function normalizePublicImage(src: string): Promise<string> {
  const image = await loadImage(src);
  const maxDimension = Math.max(image.width, image.height);
  const scale = maxDimension > SHOP_PUBLIC_IMAGE_MAX_DIMENSION
    ? SHOP_PUBLIC_IMAGE_MAX_DIMENSION / maxDimension
    : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return src;
  context.drawImage(image, 0, 0, width, height);
  return encodeCanvas(trimTransparentCanvas(canvas));
}

function formatResponseTimeLabel(minutes: number | null | undefined) {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return "Unavailable";
  const value = Number(minutes);
  if (value < 60) return `Under ${Math.max(1, Math.round(value))} mins`;
  if (value < 24 * 60) {
    const hours = Math.max(1, Math.round(value / 60));
    return `Under ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.max(1, Math.round(value / (24 * 60)));
  return `Under ${days} day${days === 1 ? "" : "s"}`;
}

function formatInBusinessLabel(yearValue: string | null | undefined) {
  const year = Number(yearValue);
  if (!Number.isInteger(year) || year < 1900) return "Not set";
  const nowYear = new Date().getFullYear();
  const years = Math.max(0, nowYear - year);
  return `${year} · ${years} year${years === 1 ? "" : "s"}`;
}

function renderStars(rating: number, sizeClass = "h-4 w-4") {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`${sizeClass} ${index < rounded ? "fill-[#d26f41] text-[#d26f41]" : "text-[#c9b8a8]"}`}
        />
      ))}
    </div>
  );
}

function formatReviewDate(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function VendorHub() {
  const [, setLocation] = useLocation();
  const [, shopParams] = useRoute("/shop/:vendorId");
  const [, legacyParams] = useRoute("/vendor/hub/:vendorId");
  const vendorId = shopParams?.vendorId || legacyParams?.vendorId;
  const [normalizedProfileImageUrl, setNormalizedProfileImageUrl] = useState("");
  const [normalizedCoverImageUrl, setNormalizedCoverImageUrl] = useState("");
  const [coverImageLoadFailed, setCoverImageLoadFailed] = useState(false);
  const [isReviewsDialogOpen, setIsReviewsDialogOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<VendorShopResponse>({
    queryKey: ["/api/vendors/public/shop", vendorId],
    enabled: Boolean(vendorId),
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch(`/api/vendors/public/${vendorId}/shop`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to load vendor hub (${res.status})`);
      return res.json();
    },
  });

  const { data: vendorMe } = useQuery<VendorMe | null>({
    queryKey: ["/api/vendor/me", "customer-mode-exit"],
    retry: false,
    queryFn: async () => {
      const token = await getFreshAccessToken();
      if (!token) return null;
      const res = await fetch("/api/vendor/me", {
        credentials: "include",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const listings = useMemo(() => {
    if (!Array.isArray(data?.listings)) return [];
    return data.listings;
  }, [data?.listings]);

  const vendor = data?.vendor;
  const canExitCustomerMode = Boolean(vendorMe?.id && vendor?.id && vendorMe.id === vendor.id);
  const profileImageUrl = asTrimmedString(vendor?.profileImageUrl);
  const coverImageUrl = asTrimmedString(vendor?.coverImageUrl);
  const coverImagePosition = normalizePhotoPosition(vendor?.coverImagePosition);
  const resolvedProfileImageUrl = asTrimmedString(normalizedProfileImageUrl || profileImageUrl);
  const resolvedCoverImageUrl = asTrimmedString(normalizedCoverImageUrl || coverImageUrl);
  const hasVisibleProfileImage = Boolean(resolvedProfileImageUrl);
  const hasVisibleCoverImage = Boolean(resolvedCoverImageUrl && !coverImageLoadFailed);
  const showHeroAvatar = hasVisibleCoverImage && hasVisibleProfileImage;
  const showInlineAvatar = !hasVisibleCoverImage && hasVisibleProfileImage;
  const specialties = Array.isArray(vendor?.specialties) ? vendor!.specialties!.filter(Boolean) : [];
  const reviews = Array.isArray(vendor?.reviews) ? vendor!.reviews! : [];
  const reviewCount = Number(vendor?.reviewCount || reviews.length || 0);
  const averageRating = Number(vendor?.rating || 0);
  const activeListingsCount = Number(vendor?.activeListingsCount || listings.length || 0);
  const eventsServedTotal = Number(vendor?.eventsServedTotal || 0);
  const hobbies = normalizeHobbyList(vendor?.hobbies);
  const likesDislikes = asTrimmedString(vendor?.likesDislikes);
  const homeState = asTrimmedString(vendor?.homeState);
  const funFacts = asTrimmedString(vendor?.funFacts);
  const hasOwnerOptionalDetails = hobbies.length > 0 || Boolean(likesDislikes || homeState || funFacts);
  const hasAvgResponseTime = Number.isFinite(Number(vendor?.avgResponseMinutes)) && Number(vendor?.avgResponseMinutes) > 0;
  const reviewBreakdownRaw = vendor?.reviewBreakdown || {};
  const reviewBreakdown = {
    5: Number((reviewBreakdownRaw as any)?.["5"] || (reviewBreakdownRaw as any)?.[5] || 0),
    4: Number((reviewBreakdownRaw as any)?.["4"] || (reviewBreakdownRaw as any)?.[4] || 0),
    3: Number((reviewBreakdownRaw as any)?.["3"] || (reviewBreakdownRaw as any)?.[3] || 0),
    2: Number((reviewBreakdownRaw as any)?.["2"] || (reviewBreakdownRaw as any)?.[2] || 0),
    1: Number((reviewBreakdownRaw as any)?.["1"] || (reviewBreakdownRaw as any)?.[1] || 0),
  };

  useEffect(() => {
    let cancelled = false;
    if (!profileImageUrl) {
      setNormalizedProfileImageUrl("");
      return () => {
        cancelled = true;
      };
    }
    normalizePublicImage(profileImageUrl)
      .then((src) => {
        if (!cancelled) setNormalizedProfileImageUrl(src || profileImageUrl);
      })
      .catch(() => {
        if (!cancelled) setNormalizedProfileImageUrl(profileImageUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [profileImageUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!coverImageUrl) {
      setNormalizedCoverImageUrl("");
      return () => {
        cancelled = true;
      };
    }
    normalizePublicImage(coverImageUrl)
      .then((src) => {
        if (!cancelled) setNormalizedCoverImageUrl(src || coverImageUrl);
      })
      .catch(() => {
        if (!cancelled) setNormalizedCoverImageUrl(coverImageUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [coverImageUrl]);

  useEffect(() => {
    setCoverImageLoadFailed(false);
  }, [resolvedCoverImageUrl]);

  if (!vendorId) {
    return <div className="p-6">Missing vendor id.</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] dark:bg-background">
      <Navigation />

      <main className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : isError || !vendor ? (
          <Card className="mx-auto mt-10 max-w-2xl">
            <CardHeader>
              <CardTitle>Vendor hub not found</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This vendor hub is unavailable right now.
            </CardContent>
          </Card>
        ) : (
          <>
            <section className="vendor-hub-hero">
              {hasVisibleCoverImage ? (
                <div className="relative w-full overflow-visible bg-[#ffffff]" style={{ height: "clamp(280px, 42vw, 520px)" }}>
                  <img
                    src={resolvedCoverImageUrl}
                    alt={`${vendor.businessName} cover`}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: toObjectPositionValue(coverImagePosition) }}
                    onError={() => setCoverImageLoadFailed(true)}
                  />
                  {canExitCustomerMode ? (
                    <Button
                      variant="ghost"
                      className="absolute left-auto right-2 top-2 z-20 h-auto w-auto max-w-[calc(100%-1rem)] overflow-hidden rounded-md bg-[#f5f0e8]/70 px-2.5 py-1 text-sm font-medium text-[#2a3a42] shadow-none backdrop-blur-sm hover:bg-[#f5f0e8]/85 sm:right-4 sm:top-4 sm:max-w-[calc(100%-2rem)] no-default-hover-elevate no-default-active-elevate"
                      data-testid="button-exit-customer-mode"
                      onClick={() => setLocation("/vendor/shop")}
                    >
                      <ArrowLeft className="mr-1 h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Exit Customer Mode</span>
                    </Button>
                  ) : null}

                  {showHeroAvatar ? (
                    <div className="absolute inset-x-0 bottom-0 z-10">
                      <div className="w-full px-8 sm:px-12 lg:px-8">
                        <div className="vendor-hub-avatar translate-y-1/2 overflow-hidden rounded-full border-4 border-[#ffffff] bg-muted shadow-sm">
                          <img
                            src={resolvedProfileImageUrl}
                            alt={`${vendor.businessName} profile`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                className={`${showHeroAvatar ? "vendor-hub-hero-content" : "pt-8 sm:pt-10"} w-full px-8 pb-2 sm:px-12 lg:px-8`}
              >
                {!hasVisibleCoverImage && canExitCustomerMode ? (
                  <div className="mb-4 flex justify-end">
                    <Button
                      variant="ghost"
                      className="h-auto w-auto max-w-full overflow-hidden rounded-md bg-[#f5f0e8]/70 px-2.5 py-1 text-sm font-medium text-[#2a3a42] shadow-none backdrop-blur-sm hover:bg-[#f5f0e8]/85 no-default-hover-elevate no-default-active-elevate"
                      data-testid="button-exit-customer-mode"
                      onClick={() => setLocation("/vendor/shop")}
                    >
                      <ArrowLeft className="mr-1 h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Exit Customer Mode</span>
                    </Button>
                  </div>
                ) : null}

                {showInlineAvatar ? (
                  <div className="mb-6">
                    <div className="vendor-hub-avatar overflow-hidden rounded-full border-4 border-[#ffffff] bg-muted shadow-sm">
                      <img
                        src={resolvedProfileImageUrl}
                        alt={`${vendor.businessName} profile`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                ) : null}

                <div>
                  <h1
                    className="text-[4rem] leading-tight font-semibold text-[#2a3a42] dark:text-[#f5f0e8]"
                    data-testid="text-vendor-hub-name"
                  >
                    {vendor.businessName}
                  </h1>
                  {asTrimmedString(vendor.tagline) ? (
                    <p className="mt-1 font-heading text-[1.1rem] italic text-muted-foreground">{vendor.tagline}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3">
                    {renderStars(averageRating)}
                    <span className="text-lg font-medium text-[#2a3a42] dark:text-[#f5f0e8]">
                      {averageRating > 0 ? averageRating.toFixed(1) : "New"}
                    </span>
                    <span className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">
                      ({reviewCount} review{reviewCount === 1 ? "" : "s"})
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="w-full px-8 py-8 sm:px-12 lg:px-8">
              <div className="mx-auto grid w-full gap-6 lg:grid-cols-[minmax(420px,1.3fr)_minmax(0,3.7fr)]">
              <div className="space-y-8 lg:order-2">
                <section id="vendor-hub-listings" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">Available Rentals</h2>
                    <p className="text-lg text-[#d26f41]">
                      View all {activeListingsCount} <ArrowRight className="ml-1 inline h-4 w-4" />
                    </p>
                  </div>
                  {listings.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-sm text-muted-foreground">
                        No active listings yet.
                      </CardContent>
                    </Card>
                  ) : (
                    <MasonryListingGrid
                      listings={listings}
                      maxColumns={5}
                      desktopColumns={5}
                      preserveInputOrder
                      minCardWidthPx={240}
                      cardMaxWidthPx={290}
                    />
                  )}
                </section>

              </div>

              <div className="space-y-0 lg:order-1">
                <section className="pb-6">
                  <div className="space-y-6">
                    {asTrimmedString(vendor.aboutBusiness) ? (
                      <div className="space-y-2">
                        <h3 className="text-3xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">About the Business</h3>
                        <p className="text-[1.25rem] text-[#2a3a42] dark:text-[#f5f0e8]">{vendor.aboutBusiness}</p>
                      </div>
                    ) : null}
                    {asTrimmedString(vendor.aboutOwner) || hasOwnerOptionalDetails ? (
                      <div className="space-y-2">
                        <h3 className="text-3xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">About the Owner</h3>
                        {asTrimmedString(vendor.aboutOwner) ? (
                          <p className="text-[1.25rem] text-[#2a3a42] dark:text-[#f5f0e8]">{vendor.aboutOwner}</p>
                        ) : null}

                        {hasOwnerOptionalDetails ? (
                          <div className="mt-4 space-y-3">
                            {hobbies.length > 0 ? (
                              <div className="space-y-1">
                                <h4 className="text-2xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">Hobbies</h4>
                                <div className="flex flex-wrap gap-2">
                                  {hobbies.map((hobby) => (
                                    <span
                                      key={hobby}
                                      className="rounded-full border border-[rgba(74,106,125,0.25)] px-3 py-1 text-sm text-[#2a3a42] dark:text-[#f5f0e8]"
                                    >
                                      {hobby}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {likesDislikes ? (
                              <div className="space-y-1">
                                <h4 className="text-2xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">Likes &amp; Dislikes</h4>
                                <p className="text-[1.25rem] text-[#2a3a42] dark:text-[#f5f0e8]">{likesDislikes}</p>
                              </div>
                            ) : null}
                            {homeState ? (
                              <div className="space-y-1">
                                <h4 className="text-2xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">Home State</h4>
                                <p className="text-[1.25rem] text-[#2a3a42] dark:text-[#f5f0e8]">{homeState}</p>
                              </div>
                            ) : null}
                            {funFacts ? (
                              <div className="space-y-1">
                                <h4 className="text-2xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">Fun Facts</h4>
                                <p className="text-[1.25rem] text-[#2a3a42] dark:text-[#f5f0e8]">{funFacts}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="border-t border-[rgba(74,106,125,0.24)] py-6">
                  <h3 className="text-3xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">Quick Info</h3>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">Service Area</p>
                      <p className="text-[1.25rem] font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
                        {formatServiceAreaLabel(vendor.serviceArea, vendor.city, vendor.serviceRadius)}
                      </p>
                    </div>
                    <div>
                      <p className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">In Business Since</p>
                      <p className="text-[1.25rem] font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">{formatInBusinessLabel(vendor.inBusinessSinceYear)}</p>
                    </div>
                    {specialties.length > 0 ? (
                      <div>
                        <p className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">Specialties</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {specialties.map((item) => (
                            <span
                              key={item}
                              className="rounded-full border border-[rgba(74,106,125,0.25)] px-3 py-1 text-sm text-[#2a3a42] dark:text-[#f5f0e8]"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {hasAvgResponseTime ? (
                      <div>
                        <p className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">Avg. Response Time</p>
                        <p className="text-[1.25rem] font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">{formatResponseTimeLabel(vendor.avgResponseMinutes)}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">Active Listings</p>
                      <p className="text-[1.25rem] font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
                        {activeListingsCount} item{activeListingsCount === 1 ? "" : "s"} available
                      </p>
                    </div>
                    {eventsServedTotal > 0 ? (
                      <div>
                        <p className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">Events Served</p>
                        <p className="text-[1.25rem] font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">{eventsServedTotal}+ events</p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="space-y-4 border-t border-[rgba(74,106,125,0.24)] pt-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">What Clients Say</h2>
                    <button
                      type="button"
                      className="text-lg text-[#2a3a42] hover:underline dark:text-[#f5f0e8]"
                      onClick={() => setIsReviewsDialogOpen(true)}
                      data-testid="button-view-all-reviews"
                    >
                      All {reviewCount} reviews <ArrowRight className="ml-1 inline h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-6 p-5 md:grid-cols-[180px,1fr] md:items-center">
                    <div className="space-y-2 text-center md:text-left">
                      <p className="text-[4rem] font-heading leading-none text-[#2a3a42] dark:text-[#f5f0e8]">
                        {averageRating > 0 ? averageRating.toFixed(1) : "0.0"}
                      </p>
                      <div className="md:justify-start">{renderStars(averageRating, "h-5 w-5")}</div>
                      <p className="text-lg text-[#2a3a42] dark:text-[#f5f0e8]">{reviewCount} reviews</p>
                    </div>
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = reviewBreakdown[star as 1 | 2 | 3 | 4 | 5] || 0;
                        const pct = reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0;
                        return (
                          <div key={star} className="flex items-center gap-3 text-lg">
                            <span className="w-8 text-right text-[#2a3a42] dark:text-[#f5f0e8]">{star}★</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgba(74,106,125,0.18)]">
                              <div className="h-full rounded-full bg-[#d26f41]" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-10 text-right text-[#2a3a42] dark:text-[#f5f0e8]">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              </div>
              </div>
            </section>

            <Dialog open={isReviewsDialogOpen} onOpenChange={setIsReviewsDialogOpen}>
              <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>All Reviews</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {reviews.length > 0 ? (
                    reviews.map((review) => (
                      <Card key={review.id}>
                        <CardContent className="space-y-3 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
                                {asTrimmedString(review.authorName) || "Customer"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {asTrimmedString(review.eventLabel) || "Event"}
                                {formatReviewDate(review.createdAt) ? ` · ${formatReviewDate(review.createdAt)}` : ""}
                              </p>
                            </div>
                            <div className="text-right">
                              {renderStars(Number(review.rating || 0))}
                            </div>
                          </div>
                          {asTrimmedString(review.body) ? (
                            <p className="text-[1.01rem] leading-relaxed text-foreground">{review.body}</p>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-sm text-muted-foreground">
                        No reviews yet.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
