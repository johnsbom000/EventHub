import React, { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Star, CheckCircle, Truck, Wrench, X } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { format } from "date-fns";
import {
  coverRatioToAspectRatio,
  getCoverPhotoIndex,
  getCoverPhotoRatio,
  moveCoverToFront,
} from "@/lib/listingPhotos";

type RouteParams = { id: string };
const LISTING_DETAIL_GALLERY_HEIGHT_CLASS = "h-[60vh] min-h-[320px] max-h-[520px]";

// --- Small helpers ---
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizePhotoToUrl(photo: any): string | undefined {
  if (typeof photo === "string") {
    // allow absolute, relative, uploads path
    if (photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("/")) return photo;
    return undefined;
  }
  if (photo && typeof photo === "object") {
    const url = photo.url;
    if (isNonEmptyString(url) && (url.startsWith("http") || url.startsWith("/"))) return url;

    const name = photo.name || photo.filename;
    if (isNonEmptyString(name)) return `/uploads/listings/${name}`;
  }
  return undefined;
}

function formatPricingUnit(unit: string | undefined) {
  if (!unit) return "";
  if (unit === "per_day") return "/ per day";
  if (unit === "per_hour") return "/ per hour";
  return `/${unit}`;
}

function money(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeListingCategory(value: unknown): "Rentals" | "Services" | "Venues" | "Catering" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized) return null;
  if (normalized === "rentals" || normalized === "rental" || normalized === "prop-decor" || normalized === "prop-rental") {
    return "Rentals";
  }
  if (normalized === "venues" || normalized === "venue") return "Venues";
  if (normalized === "catering") return "Catering";
  if (normalized === "services" || normalized === "service") return "Services";
  return null;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return null;
}

function toUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0),
    ),
  );
}

type CropAreaLike = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

type CropLike = {
  aspect?: number;
  areaPercentages?: CropAreaLike;
};

type PhotoRenderMeta = {
  aspect?: number;
  objectPosition?: string;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function canonicalPhotoUrl(url: string): string {
  return String(url).split("#")[0].split("?")[0];
}

function getPhotoNameFromUrl(url: string): string | null {
  const cleaned = canonicalPhotoUrl(url).trim();
  if (!cleaned) return null;
  const last = cleaned.split("/").filter(Boolean).pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function getObjectPositionFromCrop(crop: CropLike | null | undefined): string | undefined {
  const area = crop?.areaPercentages;
  if (!area) return undefined;
  const x = Number(area.x);
  const y = Number(area.y);
  const width = Number(area.width);
  const height = Number(area.height);
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return undefined;
  const centerX = clamp(x + width / 2, 0, 100);
  const centerY = clamp(y + height / 2, 0, 100);
  return `${centerX}% ${centerY}%`;
}

function getPhotoRenderMetaByUrl(photoUrls: string[], cropsByName: Record<string, unknown>): Record<string, PhotoRenderMeta> {
  const byUrl: Record<string, PhotoRenderMeta> = {};

  photoUrls.forEach((src) => {
    const name = getPhotoNameFromUrl(src);
    const cropRaw = name ? (cropsByName?.[name] as CropLike | undefined) : undefined;
    if (!cropRaw || typeof cropRaw !== "object") return;

    const aspect = Number(cropRaw.aspect);
    const objectPosition = getObjectPositionFromCrop(cropRaw);
    const meta: PhotoRenderMeta = {};

    if (Number.isFinite(aspect) && aspect > 0) meta.aspect = aspect;
    if (objectPosition) meta.objectPosition = objectPosition;
    if (!meta.aspect && !meta.objectPosition) return;

    byUrl[src] = meta;
    byUrl[canonicalPhotoUrl(src)] = meta;
  });

  return byUrl;
}

export default function ListingDetailPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<RouteParams>("/listing/:id");
  const listingId = params?.id;

  const [galleryOpen, setGalleryOpen] = useState(false);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["/api/listings/public", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const res = await fetch(`/api/listings/public/${listingId}`, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) throw new Error(`Failed to load listing ${listingId}`);

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Expected JSON but got ${contentType}. First 120 chars: ${text.slice(0, 120)}`);
      }

      const raw = await res.json();
      const ld = (raw?.listingData ?? {}) as any;
      // Compatibility-only fallback object. Canonical contract comes from typed listing fields on `raw`.

      // Photos: support raw.photos objects and listingData photos names/urls
      const photosFromObjects: string[] = Array.isArray(raw?.photos)
        ? raw.photos.map((p: any) => normalizePhotoToUrl(p)).filter((u: any) => typeof u === "string")
        : [];

      const photosFromListingData: string[] = Array.isArray(ld?.photos?.urls)
        ? ld.photos.urls.filter((u: any) => typeof u === "string")
        : Array.isArray(ld?.photos?.names)
          ? ld.photos.names
              .map((n: any) => (typeof n === "string" ? `/uploads/listings/${n}` : null))
              .filter(Boolean)
          : Array.isArray(ld?.photos)
            ? ld.photos.filter((u: any) => typeof u === "string")
            : [];

      const allPhotos = [...photosFromObjects, ...photosFromListingData].filter(Boolean);
      const coverPhotoIndex = getCoverPhotoIndex(raw, allPhotos);
      const orderedPhotos = moveCoverToFront(allPhotos, coverPhotoIndex);
      const coverPhotoRatio = getCoverPhotoRatio(raw);
      const cropsByName =
        ld?.photos?.cropsByName && typeof ld.photos.cropsByName === "object" ? (ld.photos.cropsByName as Record<string, unknown>) : {};
      const photoRenderMetaByUrl = getPhotoRenderMetaByUrl(allPhotos, cropsByName);

      // Pricing: canonical typed fields first, compatibility fallback only to direct mirrored keys.
      const canonicalPriceCents = toFiniteNumber(raw?.priceCents);
      const mirroredPriceCents = toFiniteNumber(ld?.priceCents);
      const mirroredPriceDollars = toFiniteNumber(ld?.price ?? ld?.rate);
      const pricingRate =
        canonicalPriceCents != null && canonicalPriceCents > 0
          ? canonicalPriceCents / 100
          : mirroredPriceCents != null && mirroredPriceCents > 0
            ? mirroredPriceCents / 100
            : mirroredPriceDollars;

      const pricingUnitRaw = `${raw?.pricingUnit ?? ld?.pricingUnit ?? ""}`
        .trim()
        .toLowerCase();
      const pricingUnit = pricingUnitRaw === "per_hour" || pricingUnitRaw === "per_day" ? pricingUnitRaw : "per_day";
      const listingCategory =
        normalizeListingCategory(raw?.category) ??
        normalizeListingCategory(ld?.category) ??
        normalizeListingCategory(raw?.serviceType);
      const quantityCandidates = [raw?.quantity, ld?.quantity];
      const availableQuantity =
        quantityCandidates
          .map((value) => toFiniteNumber(value))
          .find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ?? 1;
      const instantBookEnabled =
        parseBooleanLike(raw?.instantBookEnabled) ??
        parseBooleanLike(ld?.instantBookEnabled) ??
        (listingCategory === "Rentals");

      const title = raw?.title ?? ld?.listingTitle ?? "Listing";
      const description = raw?.description ?? ld?.listingDescription ?? "";
      const vendorName = raw?.vendorName ?? raw?.vendor?.businessName ?? "Vendor";

      const city =
        raw?.city ??
        raw?.listingServiceCenterLabel ??
        ld?.serviceLocation?.city ??
        (typeof ld?.serviceLocation?.label === "string" ? ld.serviceLocation.label : "") ??
        "";

      const rating = Number(raw?.rating ?? 0);
      const reviewCount = Number(raw?.reviewCount ?? 0);
      const reviews = Array.isArray(raw?.reviews)
        ? raw.reviews
            .map((review: any) => ({
              id: String(review?.id || "").trim(),
              rating: Number(review?.rating || 0),
              body: typeof review?.body === "string" ? review.body : "",
              authorName: typeof review?.authorName === "string" ? review.authorName : "Customer",
              createdAt: review?.createdAt ?? null,
            }))
            .filter((review: any) => review.id.length > 0 && review.rating > 0)
        : [];

      const tagsFromCanonical = toUniqueStringList(raw?.tags);
      const tagsFromLegacy = Array.isArray(ld?.tagsByPropType?.__listing__)
        ? Array.from(
            new Set(
              ld.tagsByPropType.__listing__
                .map((t: any) => (typeof t?.label === "string" ? t.label.trim() : ""))
                .filter((label: string) => label.length > 0),
            ),
          )
        : [];
      const tags = tagsFromCanonical.length > 0 ? tagsFromCanonical : tagsFromLegacy;

      const included = Array.from(
        new Set([
          ...toUniqueStringList(raw?.whatsIncluded),
          ...toUniqueStringList(ld?.whatsIncluded),
          ...toUniqueStringList(ld?.included),
        ]),
      );

      const deliveryIncluded =
        parseBooleanLike(raw?.deliveryOffered) ??
        parseBooleanLike(ld?.deliveryOffered ?? ld?.deliveryIncluded) ??
        false;
      const setupIncluded =
        parseBooleanLike(raw?.setupOffered) ??
        parseBooleanLike(ld?.setupOffered ?? ld?.setupIncluded) ??
        false;
      const deliveryFeeCents = toFiniteNumber(raw?.deliveryFeeAmountCents);
      const setupFeeCents = toFiniteNumber(raw?.setupFeeAmountCents);
      const deliveryFeeEnabled =
        parseBooleanLike(raw?.deliveryFeeEnabled) ??
        parseBooleanLike(ld?.deliveryFeeEnabled) ??
        false;
      const setupFeeEnabled =
        parseBooleanLike(raw?.setupFeeEnabled) ??
        parseBooleanLike(ld?.setupFeeEnabled) ??
        false;
      const deliveryFeeAmountRaw = ld?.deliveryFeeAmount;
      const setupFeeAmountRaw = ld?.setupFeeAmount;
      const deliveryFeeAmount = typeof deliveryFeeCents === "number" ? deliveryFeeCents / 100 : toFiniteNumber(deliveryFeeAmountRaw);
      const setupFeeAmount = typeof setupFeeCents === "number" ? setupFeeCents / 100 : toFiniteNumber(setupFeeAmountRaw);
      const radiusMiles = Number(raw?.serviceRadiusMiles ?? ld?.serviceRadiusMiles ?? 0) || null;

      const deliveryLabel =
        deliveryFeeEnabled
          ? `Delivery fee: ${money(deliveryFeeAmount) ?? "Applies"}`
          : deliveryIncluded
            ? "Delivery included"
            : "Not configured yet";

      const setupLabel =
        setupFeeEnabled
          ? `Setup fee: ${money(setupFeeAmount) ?? "Applies"}`
          : setupIncluded
            ? "Setup included"
            : "Not configured yet";

      return {
        id: raw?.id ?? listingId,
        vendorId: raw?.vendorId ?? null,
        title,
        description,
        vendorName,
        city,
        rating,
        reviewCount,
        reviews,
        photos: orderedPhotos,
        photoRenderMetaByUrl,
        coverPhotoRatio,
        price: pricingRate,
        pricingUnit,
        instantBookEnabled,
        availableQuantity,
        included,
        tags,
        logistics: {
          deliveryIncluded,
          setupIncluded,
          deliveryLabel,
          setupLabel,
          radiusMiles,
        },
      };
    },
  });

  useEffect(() => {
    if (!galleryOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [galleryOpen]);

  if (!listingId) return <div className="no-global-scale p-6">Missing listing id</div>;
  if (isLoading) return <div className="no-global-scale p-6">Loading…</div>;
  if (error) return <div className="no-global-scale p-6">Error loading listing</div>;
  if (!data) return <div className="no-global-scale p-6">Listing not found</div>;

  const photos = Array.isArray(data.photos) ? data.photos : [];
  const hasPhotos = photos.length > 0;
  const previewPhotos = photos.slice(0, 5);
  const splitGalleryPhotos = photos.slice(1, Math.min(photos.length, 4));
  const marketplaceGridPhotos = previewPhotos.slice(1, 5);
  const coverAspectRatio = coverRatioToAspectRatio(data.coverPhotoRatio);
  const usesSavedCoverAspectRatio = photos.length === 1;
  const photoRenderMetaByUrl = (data.photoRenderMetaByUrl ?? {}) as Record<string, PhotoRenderMeta>;

  const getPhotoObjectPositionStyle = (src: string): React.CSSProperties | undefined => {
    const meta = photoRenderMetaByUrl[src] ?? photoRenderMetaByUrl[canonicalPhotoUrl(src)];
    if (!meta?.objectPosition) return undefined;
    return { objectPosition: meta.objectPosition };
  };

  const getPhotoSavedAspect = (src: string): number | undefined => {
    const meta = photoRenderMetaByUrl[src] ?? photoRenderMetaByUrl[canonicalPhotoUrl(src)];
    if (!meta?.aspect || !Number.isFinite(meta.aspect) || meta.aspect <= 0) return undefined;
    return meta.aspect;
  };

  return (
    <div className="no-global-scale max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back */}
      <button
        onClick={() => setLocation("/browse")}
        className="flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back to results
      </button>

      {/* Photo collage (Airbnb-style) */}
      <div className="relative">
        {hasPhotos ? (
          <div className={`relative overflow-hidden rounded-2xl ${LISTING_DETAIL_GALLERY_HEIGHT_CLASS}`}>
            {/* Mobile: stable hero-first preview */}
            <div className="md:hidden h-full">
              <button
                className="relative block h-full w-full overflow-hidden bg-transparent"
                style={usesSavedCoverAspectRatio ? { aspectRatio: coverAspectRatio } : undefined}
                onClick={() => setGalleryOpen(true)}
                title="Show all photos"
              >
                <img
                  src={photos[0]}
                  alt={data.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={getPhotoObjectPositionStyle(photos[0])}
                />
              </button>
            </div>

            {/* Desktop/tablet: adaptive layouts by photo count */}
            <div className="hidden h-full md:block">
              {/* 1 photo: full-width hero */}
              {photos.length === 1 && (
                <button
                  className="relative block h-full w-full overflow-hidden bg-transparent"
                  style={usesSavedCoverAspectRatio ? { aspectRatio: coverAspectRatio } : undefined}
                  onClick={() => setGalleryOpen(true)}
                  title="Show all photos"
                >
                  <img
                    src={photos[0]}
                    alt={data.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={getPhotoObjectPositionStyle(photos[0])}
                  />
                </button>
              )}

              {/* 2-4 photos: split hero + right stack */}
              {photos.length >= 2 && photos.length <= 4 && (
                <div className="grid h-full grid-cols-[2fr_1fr] gap-2">
                  <button
                    className="relative block h-full w-full overflow-hidden bg-transparent"
                    onClick={() => setGalleryOpen(true)}
                    title="Show all photos"
                  >
                    <img
                      src={photos[0]}
                      alt={data.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={getPhotoObjectPositionStyle(photos[0])}
                    />
                  </button>

                  <div className={`grid h-full gap-2 ${photos.length === 2 ? "grid-rows-1" : photos.length === 3 ? "grid-rows-2" : "grid-rows-3"}`}>
                    {splitGalleryPhotos.map((src: string, i: number) => (
                      <button
                        key={`${src}-${i}`}
                        className="relative block h-full w-full overflow-hidden bg-transparent"
                        onClick={() => setGalleryOpen(true)}
                        title="Show all photos"
                      >
                        <img
                          src={src}
                          alt={`${data.title} photo ${i + 2}`}
                          className="absolute inset-0 h-full w-full object-cover"
                          style={getPhotoObjectPositionStyle(src)}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 5+ photos: marketplace grid */}
              {photos.length >= 5 && (
                <div className="grid h-full grid-cols-4 grid-rows-2 gap-2">
                  <button
                    className="relative col-span-2 row-span-2 block h-full w-full overflow-hidden bg-transparent"
                    onClick={() => setGalleryOpen(true)}
                    title="Show all photos"
                  >
                    <img
                      src={photos[0]}
                      alt={data.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={getPhotoObjectPositionStyle(photos[0])}
                    />
                  </button>

                  {marketplaceGridPhotos.map((src: string, i: number) => (
                    <button
                      key={`${src}-${i}`}
                      className="relative block h-full w-full overflow-hidden bg-transparent"
                      onClick={() => setGalleryOpen(true)}
                      title="Show all photos"
                    >
                      <img
                        src={src}
                        alt={`${data.title} photo ${i + 2}`}
                        className="absolute inset-0 h-full w-full object-cover"
                        style={getPhotoObjectPositionStyle(src)}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Show all photos button */}
            <div className="absolute bottom-4 right-4">
              <button
                onClick={() => setGalleryOpen(true)}
                className="bg-white/95 hover:bg-white text-foreground border border-border rounded-lg px-3 py-2 text-sm font-medium shadow-sm"
              >
                Show all photos
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-muted h-[320px] md:h-[420px] flex items-center justify-center text-muted-foreground">
            No photos yet
          </div>
        )}
      </div>

      {/* Main layout: content + sticky reservation */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
        {/* Left content */}
        <div className="space-y-10">
          {/* Title block */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{data.title}</h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {isNonEmptyString(data.city) && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{data.city}</span>
                </div>
              )}

              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-foreground font-medium">
                  {Number.isFinite(data.rating) && data.rating > 0 ? data.rating.toFixed(2) : "New"}
                </span>
                <span className="text-muted-foreground">
                  {data.reviewCount > 0 ? `(${data.reviewCount} reviews)` : "(No reviews yet)"}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Description */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Description</h2>
            {isNonEmptyString(data.description) ? (
              <p className="text-muted-foreground leading-relaxed">{data.description}</p>
            ) : (
              <p className="text-muted-foreground">Not configured yet</p>
            )}
          </section>

          <div className="border-t border-border" />

          {/* What's Included */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">What’s Included</h2>
            {Array.isArray(data.included) && data.included.length > 0 ? (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.included.slice(0, 10).map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Not configured yet</p>
            )}
          </section>

          <div className="border-t border-border" />

          {/* Logistics */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Logistics</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Truck className="w-4 h-4" />
                  Delivery
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.logistics?.deliveryLabel ?? "Not configured yet"}
                </p>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Wrench className="w-4 h-4" />
                  Setup
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.logistics?.setupLabel ?? "Not configured yet"}
                </p>
              </div>
            </div>

            {data.logistics?.radiusMiles ? (
              <p className="text-sm text-muted-foreground">Service area: within {data.logistics.radiusMiles} miles</p>
            ) : null}
          </section>

          <div className="border-t border-border" />

          {/* Reviews */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Reviews</h2>
            {Array.isArray(data.reviews) && data.reviews.length > 0 ? (
              <div className="space-y-4">
                {data.reviews.map((review: any) => (
                  <article key={review.id} className="rounded-xl border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{review.authorName || "Customer"}</div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <Star
                            key={value}
                            className={`w-4 h-4 ${
                              value <= Math.round(Number(review.rating || 0))
                                ? "fill-current text-yellow-500"
                                : "text-muted-foreground"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {review.createdAt ? (
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(review.createdAt), "MMMM d, yyyy")}
                      </div>
                    ) : null}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{review.body}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No reviews yet</p>
            )}
          </section>

          <div className="border-t border-border" />

          {/* Tags */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Tags</h2>
            {Array.isArray(data.tags) && data.tags.length > 0 ? (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.tags.slice(0, 15).map((tag: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="w-4 h-4 mt-0.5" />
                    <span>{tag}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No tags yet</p>
            )}
          </section>

          <div className="border-t border-border" />

          {/* Vendor */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Vendor</h2>
            <p className="text-muted-foreground">Hosted by {data.vendorName}</p>
            {data.vendorId ? (
              <button
                type="button"
                onClick={() => setLocation(`/shop/${data.vendorId}`)}
                className="inline-flex items-center rounded-full border border-[rgba(74,106,125,0.24)] bg-white/90 px-4 py-2 text-sm font-medium text-[#2a3a42] transition-colors hover:bg-white dark:border-[hsl(var(--card-border))] dark:bg-[#22303c] dark:text-[#f5f0e8]"
              >
                Visit {data.vendorName}
              </button>
            ) : null}
          </section>
        </div>

        {/* Right sticky reservation card */}
        <aside className="lg:sticky lg:top-8">
          <ReservationCard
            listingId={data.id}
            vendorId={data.vendorId}
            price={data.price}
            pricingUnit={data.pricingUnit}
            instantBookEnabled={Boolean(data.instantBookEnabled)}
            availableQuantity={Number(data.availableQuantity) || 1}
            onStartCheckout={({ listingId, eventDate, quantity }) => {
              setLocation(
                `/checkout/${listingId}?date=${encodeURIComponent(eventDate)}&quantity=${encodeURIComponent(String(quantity))}`,
              );
            }}
          />
        </aside>
      </div>

      {/* Full-screen gallery */}
      {galleryOpen && (
        <div className="fixed inset-0 z-50 bg-background">
          <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
              <button
                onClick={() => setGalleryOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="text-sm text-muted-foreground">
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </div>
              <button
                onClick={() => setGalleryOpen(false)}
                className="rounded-md p-2 hover:bg-muted"
                aria-label="Close photos"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="h-[calc(100vh-73px)] overflow-y-auto">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
              {hasPhotos ? (
                <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 [column-fill:_balance]">
                  {photos.map((src: string, i: number) => {
                    const savedAspect = getPhotoSavedAspect(src);
                    return (
                      <figure
                        key={`${src}-${i}`}
                        className={`mb-3 break-inside-avoid overflow-hidden rounded-xl bg-background ${savedAspect ? "relative" : ""}`}
                        style={savedAspect ? { aspectRatio: String(savedAspect) } : undefined}
                      >
                        <img
                          src={src}
                          alt={`${data.title} photo ${i + 1}`}
                          className={savedAspect ? "absolute inset-0 block w-full h-full object-contain" : "block w-full h-auto object-contain"}
                          style={getPhotoObjectPositionStyle(src)}
                          loading="lazy"
                        />
                      </figure>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground">No photos yet</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReservationCard({
  listingId,
  vendorId,
  price,
  pricingUnit,
  instantBookEnabled,
  availableQuantity,
  onStartCheckout,
}: {
  listingId: string;
  vendorId: string | null;
  price: number | null;
  pricingUnit: string;
  instantBookEnabled: boolean;
  availableQuantity: number;
  onStartCheckout: (params: { listingId: string; vendorId: string; eventDate: string; quantity: number }) => void;
}) {
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [isRouting, setIsRouting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const { isAuthenticated, loginWithRedirect } = useAuth0();

  const priceText = money(price);
  const unitText = formatPricingUnit(pricingUnit);
  const normalizedAvailableQuantity =
    Number.isFinite(availableQuantity) && availableQuantity > 0 ? Math.floor(availableQuantity) : 1;
  const quantityTotalText =
    typeof price === "number" && Number.isFinite(price) ? money(price * quantity) : null;

  const canBook =
    Boolean(date) &&
    Boolean(priceText) &&
    Boolean(vendorId) &&
    quantity >= 1 &&
    quantity <= normalizedAvailableQuantity &&
    !isRouting;

  async function handleBookNow() {
    setBookingError(null);

    if (!isAuthenticated) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      try {
        await loginWithRedirect({
          appState: { returnTo },
          authorizationParams: {
            prompt: "login",
          },
        });
      } catch (error: any) {
        setBookingError(error?.message || "Unable to start login. Please try again.");
      }
      return;
    }

    if (!vendorId) {
      setBookingError("This listing is missing a vendor id (can’t book yet).");
      return;
    }
    if (!date) {
      setBookingError("Pick an event date first.");
      return;
    }
    if (!priceText || typeof price !== "number") {
      setBookingError("This listing is missing a price (can’t book yet).");
      return;
    }

    setIsRouting(true);
    try {
      onStartCheckout({
        listingId,
        vendorId,
        eventDate: date,
        quantity,
      });
    } catch (e: any) {
      setBookingError(e?.message || "Failed to continue to checkout");
    } finally {
      setIsRouting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background shadow-sm p-5">
      <div className="flex items-end justify-between">
        <div className="text-2xl font-semibold">
          {priceText ?? "Not configured"}
          {priceText ? <span className="text-sm font-normal text-muted-foreground"> {unitText}</span> : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">Event Date</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        {normalizedAvailableQuantity > 1 ? (
          <div className="space-y-1">
            <div className="text-sm font-medium">Quantity</div>
            <select
              value={String(quantity)}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: normalizedAvailableQuantity }, (_, index) => index + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">
              {normalizedAvailableQuantity} identical unit{normalizedAvailableQuantity === 1 ? "" : "s"} available
            </div>
          </div>
        ) : null}

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{quantityTotalText ?? "Not configured yet"}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Taxes/fees/deposit: Not configured yet</div>
        </div>

        <button
          onClick={handleBookNow}
          disabled={!canBook}
          className={[
            "w-full rounded-md py-3 text-sm font-medium transition",
            !canBook ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-rose-600 hover:bg-rose-700 text-white",
          ].join(" ")}
        >
          {isRouting ? "Loading..." : instantBookEnabled ? "Book Now" : "Request to Book"}
        </button>

        {bookingError ? <p className="text-xs text-red-600 text-center">{bookingError}</p> : null}

        <div className="border-t border-border pt-3">
          <div className="text-sm font-medium">Cancellation Policy</div>
          <div className="text-sm text-muted-foreground">Not configured yet</div>
        </div>
      </div>
    </div>
  );
}
