import React, { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import HeartBoardPopover from "@/components/HeartBoardPopover";
import ListingCard from "@/components/ListingCard";
import MasonryListingGrid from "@/components/MasonryListingGrid";
import { ChevronLeft, Heart, MapPin, Shield, Star, CheckCircle, XCircle, Truck, Wrench, Plus, Minus } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { format } from "date-fns";
import {
 coverRatioToAspectRatio,
 getCoverPhotoIndex,
 getCoverPhotoRatio,
 moveCoverToFront,
} from "@/lib/listingPhotos";
import { resolveAssetUrl } from "@/lib/runtimeUrls";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/context/LanguageContext";
import { TimeInput } from "@/components/ui/TimeInput";
import { trackEvent } from "@/lib/analytics";

type RouteParams = { id: string };
const LISTING_DETAIL_GALLERY_HEIGHT_CLASS = "h-[60vh] min-h-[320px] max-h-[520px]";

// --- Small helpers ---
function isNonEmptyString(v: unknown): v is string {
 return typeof v === "string" && v.trim().length > 0;
}

function normalizePhotoToUrl(photo: any): string | undefined {
 if (typeof photo === "string") {
 // allow absolute, relative, uploads path
 if (photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("/")) return resolveAssetUrl(photo);
 return undefined;
 }
 if (photo && typeof photo === "object") {
 const url = photo.url;
 if (isNonEmptyString(url) && (url.startsWith("http") || url.startsWith("/"))) return resolveAssetUrl(url);

 const name = photo.name || photo.filename;
 if (isNonEmptyString(name)) return resolveAssetUrl(`/uploads/listings/${name}`);
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

function fmtDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${m}/${d}/${y}`;
}

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
 const { t } = useTranslation();
 const { language } = useLanguage();
 const [, setLocation] = useLocation();
 const [, params] = useRoute<RouteParams>("/listing/:id");
 const listingId = params?.id;

 const [galleryOpen, setGalleryOpen] = useState(false);
 const [heartOpen, setHeartOpen] = useState(false);
 const [reportSent, setReportSent] = useState(false);
 const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
 const [selectedAddons, setSelectedAddons] = useState<{ id: string; quantity: number }[]>([]);
 const setAddonQty = (id: string, qty: number) =>
   setSelectedAddons((prev) =>
     qty <= 0
       ? prev.filter((a) => a.id !== id)
       : prev.some((a) => a.id === id)
         ? prev.map((a) => (a.id === id ? { ...a, quantity: qty } : a))
         : [...prev, { id, quantity: qty }]
   );

 const { isAuthenticated } = useAuth0();

 const reportMutation = useMutation({
   mutationFn: async (payload: { contentType: string; contentSnapshot: string; listingId: string; vendorAccountId?: string }) => {
     const res = await apiRequest("POST", "/api/circumvention/report", payload);
     if (!res.ok) throw new Error("Failed to send report");
   },
   onSuccess: () => setReportSent(true),
 });

 const { data: savedIdsData } = useQuery<{ listingIds: string[] }>({
 queryKey: ["/api/boards/saved-ids"],
 enabled: isAuthenticated,
 retry: false,
 staleTime: 30_000,
 });
 const isSaved = Boolean(listingId && savedIdsData?.listingIds.includes(listingId));

 const { data: activeSalePageData } = useQuery<{ sale: { percentOff: number; endsAt: string } | null }>({
 queryKey: [`/api/listings/${listingId}/active-sale`],
 enabled: !!listingId,
 staleTime: 60_000,
 });
 const activeSalePage = activeSalePageData?.sale ?? null;

 const { data, isLoading, error } = useQuery<any>({
 // Include language in the query key so the query re-runs when the user switches language.
 queryKey: ["/api/listings/public", listingId, language],
 enabled: !!listingId,
 queryFn: async () => {
 const langParam = language !== "en" ? `?lang=${language}` : "";
 const res = await fetch(`/api/listings/public/${listingId}${langParam}`, {
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
 ? ld.photos.urls
 .filter((u: any) => typeof u === "string")
 .map((u: string) => resolveAssetUrl(u))
 : Array.isArray(ld?.photos?.names)
 ? ld.photos.names
 .map((n: any) => (typeof n === "string" ? normalizePhotoToUrl(n) ?? null : null))
 .filter(Boolean)
 : Array.isArray(ld?.photos)
 ? ld.photos.filter((u: any) => typeof u === "string").map((u: string) => resolveAssetUrl(u))
 : [];
 // raw.photos is already CDN-resolved by the server; ld.photos.names is the raw storage path from
 // the JSONB column. In production the file lives only in cloud storage — the storage path 404s —
 // so merging both produces phantom blank tiles. Use raw.photos (CDN-ready) as the sole source;
 // fall back to listingData only for legacy listings where the canonical column is empty.
 const allPhotos = Array.from(new Set(
   (photosFromObjects.length > 0 ? photosFromObjects : photosFromListingData).filter(Boolean)
 ));
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

 const city = (() => {
   // Prefer the listing's own service center label over vendor profile city
   const label = (raw?.listingServiceCenterLabel as string | null | undefined) ?? "";
   if (label) {
     const parts = label.split(",").map((p: string) => p.trim());
     const firstLooksLikeStreet = /^\d/.test(parts[0] ?? "");
     const cityPart = firstLooksLikeStreet ? (parts[1] ?? "") : (parts[0] ?? "");
     const statePart = firstLooksLikeStreet ? (parts[2] ?? "") : (parts[1] ?? "");
     const stateOnly = statePart.replace(/\s+\d{5}(-\d{4})?$/, "").trim();
     if (cityPart) return stateOnly ? `${cityPart}, ${stateOnly}` : cityPart;
   }
   // Fallback to vendor profile for listings without a service center label
   const cityName = raw?.city || ld?.serviceLocation?.city || "";
   const state = raw?.businessState || "";
   if (!cityName) return "";
   return state ? `${cityName}, ${state}` : cityName;
 })();

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

 const notIncluded = Array.from(
 new Set([
 ...toUniqueStringList(raw?.whatsNotIncluded),
 ...toUniqueStringList(ld?.whatsNotIncluded),
 ]),
 );

 const deliveryIncludedValue =
 parseBooleanLike(raw?.deliveryOffered) ??
 parseBooleanLike(ld?.deliveryOffered ?? ld?.deliveryIncluded);
 const setupIncludedValue =
 parseBooleanLike(raw?.setupOffered) ??
 parseBooleanLike(ld?.setupOffered ?? ld?.setupIncluded);
 const takedownIncludedValue =
 parseBooleanLike(raw?.takedownOffered) ??
 parseBooleanLike(ld?.takedownOffered ?? ld?.takedownIncluded);
 const deliveryIncluded = deliveryIncludedValue === true;
 const setupIncluded = setupIncludedValue === true;
 const takedownIncluded = takedownIncludedValue === true;
 const deliveryFeeCents = toFiniteNumber(raw?.deliveryFeeAmountCents);
 const setupFeeCents = toFiniteNumber(raw?.setupFeeAmountCents);
 const takedownFeeCents = toFiniteNumber(raw?.takedownFeeAmountCents);
 const deliveryFeeEnabledValue =
 parseBooleanLike(raw?.deliveryFeeEnabled) ??
 parseBooleanLike(ld?.deliveryFeeEnabled);
 const setupFeeEnabledValue =
 parseBooleanLike(raw?.setupFeeEnabled) ??
 parseBooleanLike(ld?.setupFeeEnabled);
 const takedownFeeEnabledValue =
 parseBooleanLike(raw?.takedownFeeEnabled) ??
 parseBooleanLike(ld?.takedownFeeEnabled);
 const deliveryFeeEnabled = deliveryFeeEnabledValue === true;
 const setupFeeEnabled = setupFeeEnabledValue === true;
 const takedownFeeEnabled = takedownFeeEnabledValue === true;
 const deliveryFeeAmountRaw = ld?.deliveryFeeAmount;
 const setupFeeAmountRaw = ld?.setupFeeAmount;
 const takedownFeeAmountRaw = ld?.takedownFeeAmount;
 const deliveryFeeAmount = typeof deliveryFeeCents === "number" ? deliveryFeeCents / 100 : toFiniteNumber(deliveryFeeAmountRaw);
 const setupFeeAmount = typeof setupFeeCents === "number" ? setupFeeCents / 100 : toFiniteNumber(setupFeeAmountRaw);
 const takedownFeeAmount = typeof takedownFeeCents === "number" ? takedownFeeCents / 100 : toFiniteNumber(takedownFeeAmountRaw);
 const radiusMiles = Number(raw?.serviceRadiusMiles ?? ld?.serviceRadiusMiles ?? 0) || null;

 const deliveryLabel =
 deliveryFeeEnabled
 ? `Delivery fee: ${money(deliveryFeeAmount) ?? "Applies"}`
 : deliveryIncludedValue === true
 ? "Delivery included"
 : deliveryIncludedValue === false
 ? "Delivery not included"
 : "Not configured yet";

 const setupLabel =
 setupFeeEnabled
 ? `Setup fee: ${money(setupFeeAmount) ?? "Applies"}`
 : setupIncludedValue === true
 ? "Setup included"
 : setupIncludedValue === false
 ? "Setup not included"
 : "Not configured yet";
 const takedownLabel =
 takedownFeeEnabled
 ? `Takedown fee: ${money(takedownFeeAmount) ?? "Applies"}`
 : takedownIncludedValue === true
 ? "Takedown included"
 : takedownIncludedValue === false
 ? "Takedown not included"
 : "Not configured yet";

 const shopActive = raw?.shopActive !== false; // default true
 const vacationBlocks: Array<{ id: string; startDate: string; endDate: string }> =
 Array.isArray(raw?.vacationBlocks) ? raw.vacationBlocks : [];

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
 notIncluded,
 tags,
 logistics: {
 deliveryIncluded,
 setupIncluded,
 takedownIncluded,
 deliveryLabel,
 setupLabel,
 takedownLabel,
 radiusMiles,
 },
 shopActive,
 vacationBlocks,
 cancellationPolicy: (ld?.cancellationPolicy ?? raw?.cancellationPolicy ?? "cancel_anytime") as string,
 cancellationPolicyHours: Number(ld?.cancellationPolicyHours ?? raw?.cancellationPolicyHours ?? 48),
 securityDepositEnabled: parseBooleanLike(raw?.securityDepositEnabled ?? ld?.securityDepositEnabled) === true,
 securityDepositCents: toFiniteNumber(raw?.securityDepositCents ?? ld?.securityDepositCents),
 listingType: (raw?.listingType ?? "single") as string,
 packages: Array.isArray(raw?.packages)
 ? (raw.packages as Array<{
     id: string;
     title: string | null;
     description: string | null;
     priceCents: number | null;
     pricingUnit: string | null;
     whatsIncluded: string[];
     whatsNotIncluded: string[];
     sortOrder: number;
     deliveryOffered: boolean;
     deliveryFeeEnabled: boolean;
     deliveryFeeAmountCents: number | null;
     setupOffered: boolean;
     setupFeeEnabled: boolean;
     setupFeeAmountCents: number | null;
     takedownOffered: boolean;
     takedownFeeEnabled: boolean;
     takedownFeeAmountCents: number | null;
     travelOffered: boolean;
     travelFeeEnabled: boolean;
     travelFeeType: string | null;
     travelFeeAmountCents: number | null;
     cancellationPolicyOverride: { policy: string; hours?: number } | null;
   }>)
 : [],
 attachedAddons: Array.isArray(raw?.attachedAddons)
 ? (raw.attachedAddons as Array<{ id: string; title: string | null; priceCents: number | null; pricingUnit: string | null; quantity: number }>)
 : [],
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

 if (!listingId) return <div className="no-global-scale p-6">{t("listing.missingListingId")}</div>;
 if (isLoading) return <div className="no-global-scale p-6">Loading…</div>;
 if (error) return <div className="no-global-scale p-6">{t("listing.errorLoading")}</div>;
 if (!data) return <div className="no-global-scale p-6">{t("listing.notFound")}</div>;

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
 <div className="no-global-scale max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
 {/* Back + heart */}
 <div className="mb-6 flex items-center justify-between">
 <button
 onClick={() => {
   if (window.history.length > 1) {
     window.history.back();
   } else {
     setLocation("/browse");
   }
 }}
 className="flex items-center text-muted-foreground hover:text-foreground"
 >
 <ChevronLeft className="w-5 h-5 mr-1" />
 {t("listing.back")}
 </button>

 {isAuthenticated && listingId ? (
 <div className="relative">
 <button
 type="button"
 onMouseDown={() => setHeartOpen((v) => !v)}
 aria-label={isSaved ? t("listing.savedToEvent") : t("listing.saveToEvent")}
 >
 <Heart
 className={`h-5 w-5 transition-colors ${
 isSaved || heartOpen
 ? "fill-[#e07a6a] text-[#e07a6a]"
 : "text-[#4a6a7d]/60 hover:text-[#e07a6a]"
 }`}
 />
 </button>
 {heartOpen && (
 <HeartBoardPopover
 listingId={listingId}
 onClose={() => setHeartOpen(false)}
 />
 )}
 </div>
 ) : null}
 </div>

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
 title={t("listing.showAllPhotos")}
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
 title={t("listing.showAllPhotos")}
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
 title={t("listing.showAllPhotos")}
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
 title={t("listing.showAllPhotos")}
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
 title={t("listing.showAllPhotos")}
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
 title={t("listing.showAllPhotos")}
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
 {t("listing.showAllPhotos")}
 </button>
 </div>
 </div>
 ) : (
 <div className="rounded-2xl bg-muted h-[320px] md:h-[420px] flex items-center justify-center text-muted-foreground">
 {t("listing.noPhotosYet")}
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
 <h2 className="text-xl font-semibold">{t("listing.description")}</h2>
 {data.listingType === "package_container" ? (
   (() => {
     const selectedPkg = data.packages.find((p: { id: string }) => p.id === selectedPackageId);
     return selectedPkg
       ? isNonEmptyString(selectedPkg.description)
         ? <p className="text-muted-foreground leading-relaxed">{selectedPkg.description}</p>
         : <p className="text-muted-foreground italic">No description for this package.</p>
       : <p className="text-muted-foreground italic">Select a package below to see its description.</p>;
   })()
 ) : isNonEmptyString(data.description) ? (
   <p className="text-muted-foreground leading-relaxed">{data.description}</p>
 ) : (
   <p className="text-muted-foreground">{t("listing.descriptionNotConfigured")}</p>
 )}
 {isAuthenticated && data.listingType !== "package_container" && (
   <div className="pt-1">
     {reportSent ? (
       <p className="text-xs text-muted-foreground">{t("listing.reportSubmitted")}</p>
     ) : (
       <button
         type="button"
         onClick={() => {
           if (!listingId) return;
           reportMutation.mutate({
             contentType: "listing_description",
             contentSnapshot: (data.description || "").slice(0, 2000),
             listingId,
             vendorAccountId: data.vendorId ?? undefined,
           });
         }}
         disabled={reportMutation.isPending}
         className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
       >
         {t("listing.reportListing")}
       </button>
     )}
   </div>
 )}
 </section>

 <div className="border-t border-border" />

 {/* Package Cards — full-width, shown for package_container listings */}
 {data.listingType === "package_container" && data.packages.length > 0 && (
   <>
     <section className="space-y-6">
       <h2 className="text-xl font-semibold">Choose a Package</h2>
       <div className={[
         "grid gap-5",
         data.packages.length === 1 ? "grid-cols-1 max-w-sm" : "grid-cols-1 sm:grid-cols-2",
       ].join(" ")}>
         {[...data.packages]
           .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
           .map((pkg) => {
             const pkgPrice = pkg.priceCents != null ? pkg.priceCents / 100 : null;
             const isSelected = selectedPackageId === pkg.id;
             return (
               <button
                 key={pkg.id}
                 type="button"
                 onClick={() => setSelectedPackageId(isSelected ? null : pkg.id)}
                 className={[
                   "relative rounded-2xl border-2 p-6 flex flex-col gap-5 transition text-left w-full",
                   isSelected
                     ? "border-secondary bg-secondary/10 shadow-md"
                     : "border-border bg-white hover:border-secondary/60",
                 ].join(" ")}
               >
                 <div className="space-y-3 text-center">
                   <h3 className="text-lg font-bold tracking-tight">{pkg.title ?? "Package"}</h3>
                   {pkgPrice != null ? (
                     <div className="text-4xl font-bold text-foreground">{money(pkgPrice)}</div>
                   ) : (
                     <div className="text-2xl font-semibold text-muted-foreground">—</div>
                   )}
                 </div>

                 <div className="border-t border-border" />

                 {pkg.whatsIncluded?.length > 0 && (
                   <ul className="space-y-2 flex-1">
                     {pkg.whatsIncluded.map((item: string) => (
                       <li key={item} className="flex items-start gap-2 text-sm text-foreground/80">
                         <CheckCircle className={["mt-0.5 h-4 w-4 shrink-0", isSelected ? "text-secondary-foreground" : "text-secondary"].join(" ")} />
                         {item}
                       </li>
                     ))}
                   </ul>
                 )}

                 {pkg.whatsNotIncluded?.length > 0 && (
                   <ul className="space-y-2">
                     {pkg.whatsNotIncluded.map((item: string) => (
                       <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                         <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                         {item}
                       </li>
                     ))}
                   </ul>
                 )}
               </button>
             );
         })}
       </div>
     </section>
     <div className="border-t border-border" />
   </>
 )}

 {/* What’s Included / Not Included — single + addon only */}
 {data.listingType !== "package_container" && (
   <>
     <section className="space-y-3">
     <h2 className="text-xl font-semibold">{t("listing.whatsIncluded")}</h2>
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
     <p className="text-muted-foreground">{t("listing.whatsIncludedNotConfigured")}</p>
     )}
     </section>

     {Array.isArray(data.notIncluded) && data.notIncluded.length > 0 ? (
     <>
     <div className="border-t border-border" />
     <section className="space-y-3">
     <h2 className="text-xl font-semibold">{t("listing.whatsNotIncluded")}</h2>
     <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
     {data.notIncluded.slice(0, 10).map((item: string, i: number) => (
     <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
     <XCircle className="w-4 h-4 mt-0.5 text-muted-foreground" />
     <span>{item}</span>
     </li>
     ))}
     </ul>
     </section>
     </>
     ) : null}
   </>
 )}

 {/* Logistics — container-level for single/addon; package-level (reactive) for package_container */}
 {data.listingType === "package_container" ? (() => {
   const pkg = data.packages.find((p: { id: string }) => p.id === selectedPackageId);
   if (!pkg) return null;
   const items: Array<{ icon: typeof Truck; title: string; desc: string }> = [];
   if (pkg.deliveryFeeEnabled) {
     items.push({ icon: Truck, title: t("listing.deliveryLabel"), desc: `Delivery fee: ${money(pkg.deliveryFeeAmountCents != null ? pkg.deliveryFeeAmountCents / 100 : null) ?? "Applies"}` });
   } else if (pkg.deliveryOffered === true) {
     items.push({ icon: Truck, title: t("listing.deliveryLabel"), desc: "Delivery included" });
   } else if (pkg.deliveryOffered === false) {
     items.push({ icon: Truck, title: t("listing.deliveryLabel"), desc: "Delivery not included" });
   }
   if (pkg.setupFeeEnabled) {
     items.push({ icon: Wrench, title: t("listing.setupLabel"), desc: `Setup fee: ${money(pkg.setupFeeAmountCents != null ? pkg.setupFeeAmountCents / 100 : null) ?? "Applies"}` });
   } else if (pkg.setupOffered === true) {
     items.push({ icon: Wrench, title: t("listing.setupLabel"), desc: "Setup included" });
   } else if (pkg.setupOffered === false) {
     items.push({ icon: Wrench, title: t("listing.setupLabel"), desc: "Setup not included" });
   }
   if (pkg.takedownFeeEnabled) {
     items.push({ icon: Wrench, title: t("listing.takedownLabel"), desc: `Takedown fee: ${money(pkg.takedownFeeAmountCents != null ? pkg.takedownFeeAmountCents / 100 : null) ?? "Applies"}` });
   } else if (pkg.takedownOffered === true) {
     items.push({ icon: Wrench, title: t("listing.takedownLabel"), desc: "Takedown included" });
   } else if (pkg.takedownOffered === false) {
     items.push({ icon: Wrench, title: t("listing.takedownLabel"), desc: "Takedown not included" });
   }
   if (data.category === "Service") {
     if (pkg.travelFeeEnabled) {
       const feeType = pkg.travelFeeType === "per_mile" ? "per mile" : pkg.travelFeeType === "per_hour" ? "per hour" : "flat rate";
       items.push({ icon: Truck, title: "Travel", desc: `Travel fee: ${money(pkg.travelFeeAmountCents != null ? pkg.travelFeeAmountCents / 100 : null) ?? "Applies"} (${feeType})` });
     } else if (pkg.travelOffered === true) {
       items.push({ icon: Truck, title: "Travel", desc: "Travel included" });
     } else if (pkg.travelOffered === false) {
       items.push({ icon: Truck, title: "Travel", desc: "Travel not offered" });
     }
   }
   if (data.securityDepositEnabled && (data.securityDepositCents ?? 0) > 0) {
     items.push({ icon: Shield, title: "Security Deposit", desc: `${money((data.securityDepositCents ?? 0) / 100)} — Refundable after your event.` });
   }
   if (items.length === 0) return null;
   return (
     <>
       <div className="border-t border-border" />
       <section className="space-y-3">
         <h2 className="text-xl font-semibold">{t("listing.logistics")}</h2>
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           {items.map((item, i) => (
             <div key={i} className="rounded-xl border border-border p-4">
               <div className="flex items-center gap-2 font-medium">
                 <item.icon className="w-4 h-4" />
                 {item.title}
               </div>
               <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
             </div>
           ))}
         </div>
       </section>
     </>
   );
 })() : (() => {
   const deliveryLabel = data.logistics?.deliveryLabel;
   const setupLabel = data.logistics?.setupLabel;
   const takedownLabel = data.logistics?.takedownLabel;
   const showDelivery = deliveryLabel && deliveryLabel !== "Not configured yet";
   const showSetup = setupLabel && setupLabel !== "Not configured yet";
   const showTakedown = takedownLabel && takedownLabel !== "Not configured yet";
   const showRadius = Boolean(data.logistics?.radiusMiles);
   const showSecurityDeposit = Boolean(data.securityDepositEnabled) && (data.securityDepositCents ?? 0) > 0;
   if (!showDelivery && !showSetup && !showTakedown && !showRadius && !showSecurityDeposit) return null;
   return (
     <>
       <div className="border-t border-border" />
       <section className="space-y-3">
         <h2 className="text-xl font-semibold">{t("listing.logistics")}</h2>
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
           {showDelivery ? (
             <div className="rounded-xl border border-border p-4">
               <div className="flex items-center gap-2 font-medium"><Truck className="w-4 h-4" />{t("listing.deliveryLabel")}</div>
               <p className="mt-2 text-sm text-muted-foreground">{deliveryLabel}</p>
             </div>
           ) : null}
           {showSetup ? (
             <div className="rounded-xl border border-border p-4">
               <div className="flex items-center gap-2 font-medium"><Wrench className="w-4 h-4" />{t("listing.setupLabel")}</div>
               <p className="mt-2 text-sm text-muted-foreground">{setupLabel}</p>
             </div>
           ) : null}
           {showTakedown ? (
             <div className="rounded-xl border border-border p-4">
               <div className="flex items-center gap-2 font-medium"><Wrench className="w-4 h-4" />{t("listing.takedownLabel")}</div>
               <p className="mt-2 text-sm text-muted-foreground">{takedownLabel}</p>
             </div>
           ) : null}
           {showSecurityDeposit ? (
             <div className="rounded-xl border border-border p-4">
               <div className="flex items-center gap-2 font-medium"><Shield className="w-4 h-4" />Security Deposit</div>
               <p className="mt-2 text-sm text-muted-foreground">{money((data.securityDepositCents ?? 0) / 100)} — Refundable after your event.</p>
             </div>
           ) : null}
         </div>
         {showRadius ? (
           <p className="text-sm text-muted-foreground">{t("listing.serviceArea", { miles: data.logistics.radiusMiles })}</p>
         ) : null}
       </section>
     </>
   );
 })()}

 <div className="border-t border-border" />

 {/* Reviews */}
 <section className="space-y-3">
 <h2 className="text-xl font-semibold">{t("listing.reviews")}</h2>
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
 <div className="text-sm text-muted-foreground">
 {format(new Date(review.createdAt), "MMMM d, yyyy")}
 </div>
 ) : null}
 <p className="text-sm text-muted-foreground whitespace-pre-wrap">{review.body}</p>
 </article>
 ))}
 </div>
 ) : (
 <p className="text-muted-foreground">{t("listing.noReviewsYet")}</p>
 )}
 </section>

 <div className="border-t border-border" />

 {/* Vendor */}
 <section className="space-y-3">
 <h2 className="text-xl font-semibold">{t("listing.vendor")}</h2>
 <p className="text-muted-foreground">{t("listing.vendorHostedBy", { vendorName: data.vendorName })}</p>
 {data.vendorId ? (
 <button
 type="button"
 onClick={() => setLocation(`/shop/${data.vendorId}`)}
 className="inline-flex items-center rounded-full border border-[rgba(74,106,125,0.24)] bg-white/90 px-4 py-2 text-sm font-medium text-[#2a3a42] transition-colors hover:bg-white "
 >
 {t("listing.vendorVisit", { vendorName: data.vendorName })}
 </button>
 ) : null}
 </section>
 </div>

 {/* Right sticky reservation card */}
 <aside id="reservation-card" className="lg:sticky lg:top-8 space-y-4">
 {data.shopActive === false ? (
 <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center space-y-2">
 <div className="text-lg font-semibold text-muted-foreground">{t("listing.currentlyUnavailable")}</div>
 <p className="text-sm text-muted-foreground">
 {t("listing.shopClosedMessage")}
 </p>
 </div>
 ) : (
 <ReservationCard
 listingId={data.id}
 vendorId={data.vendorId}
 price={
 selectedPackageId
 ? ((data.packages.find((p: { id: string; priceCents: number | null }) => p.id === selectedPackageId)?.priceCents ?? null) != null
 ? (data.packages.find((p: { id: string; priceCents: number | null }) => p.id === selectedPackageId)!.priceCents! / 100)
 : data.price)
 : data.price
 }
 pricingUnit={data.pricingUnit}
 instantBookEnabled={Boolean(data.instantBookEnabled)}
 availableQuantity={Number(data.availableQuantity) || 1}
 vacationBlocks={data.vacationBlocks ?? []}
 cancellationPolicy={(() => {
   if (selectedPackageId) {
     const pkg = data.packages.find((p: { id: string }) => p.id === selectedPackageId);
     if (pkg?.cancellationPolicyOverride?.policy) return pkg.cancellationPolicyOverride.policy;
   }
   return data.cancellationPolicy ?? "cancel_anytime";
 })()}
 cancellationPolicyHours={(() => {
   if (selectedPackageId) {
     const pkg = data.packages.find((p: { id: string }) => p.id === selectedPackageId);
     if (pkg?.cancellationPolicyOverride?.policy === "cancel_within_hours") return pkg.cancellationPolicyOverride.hours ?? 48;
   }
   return data.cancellationPolicyHours ?? 48;
 })()}
 onStartCheckout={({ listingId, eventDate, quantity, startTime, endTime }) => {
 const params = new URLSearchParams({
 date: eventDate,
 quantity: String(quantity),
 });
 if (startTime) params.set("startTime", startTime);
 if (endTime) params.set("endTime", endTime);
 if (selectedPackageId) params.set("packageId", selectedPackageId);
 if (selectedAddons.length > 0) params.set("addons", selectedAddons.map((a) => `${a.id}:${a.quantity}`).join(","));
 setLocation(`/checkout/${listingId}?${params.toString()}`);
 }}
 />
 )}

 {/* Reactive price summary — shown when a package or add-on is selected */}
 {(selectedPackageId || selectedAddons.length > 0) && (() => {
 const selectedPkg = data.packages.find((p: { id: string; priceCents: number | null }) => p.id === selectedPackageId);
 const pkgPrice = selectedPkg?.priceCents != null ? selectedPkg.priceCents / 100 : (data.price ?? null);
 const baseAmountDollars = pkgPrice ?? data.price ?? 0;
 const addonTotalCents = selectedAddons.reduce((sum, { id, quantity }) => {
   const unitPrice = data.attachedAddons.find((a: { id: string; priceCents: number | null }) => String(a.id) === id)?.priceCents ?? 0;
   return sum + unitPrice * quantity;
 }, 0);
 const subtotalDollars = baseAmountDollars + addonTotalCents / 100;
 const serviceFeeEst = Math.round(subtotalDollars * 100 * 0.05) / 100;
 const depositDollars = data.securityDepositEnabled && (data.securityDepositCents ?? 0) > 0
   ? (data.securityDepositCents ?? 0) / 100
   : 0;
 const totalDollars = subtotalDollars + serviceFeeEst + depositDollars;
 return (
 <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-3">
 <h3 className="text-sm font-semibold text-foreground">Price breakdown</h3>
 <div className="space-y-1.5 text-sm">
 {selectedPkg && (
 <div className="flex justify-between gap-2">
 <span className="text-muted-foreground">{selectedPkg.title ?? "Package"}</span>
 <span className="font-medium">{money(pkgPrice)}</span>
 </div>
 )}
 {!selectedPkg && data.price != null && (
 <div className="flex justify-between gap-2">
 <span className="text-muted-foreground">Base price</span>
 <span className="font-medium">{money(data.price)}</span>
 </div>
 )}
 {selectedAddons.map(({ id, quantity }) => {
   const addon = data.attachedAddons.find((a: { id: string; title: string | null; priceCents: number | null }) => String(a.id) === id);
   if (!addon?.priceCents) return null;
   return (
     <div key={id} className="flex justify-between gap-2">
       <span className="text-muted-foreground">{addon.title ?? "Add-on"}{quantity > 1 ? ` ×${quantity}` : ""}</span>
       <span className="font-medium">{money(addon.priceCents * quantity / 100)}</span>
     </div>
   );
 })}
 <div className="flex justify-between gap-2">
   <span className="text-muted-foreground">Service fee (est.)</span>
   <span className="font-medium">{money(serviceFeeEst)}</span>
 </div>
 {depositDollars > 0 && (
   <div className="flex justify-between gap-2">
     <span className="text-muted-foreground">Security deposit <span className="text-xs">(refundable)</span></span>
     <span className="font-medium">{money(depositDollars)}</span>
   </div>
 )}
 </div>
 <div className="border-t border-border pt-2.5 flex justify-between gap-2">
 <span className="text-sm font-semibold">Total</span>
 <span className="text-sm font-bold text-primary">{money(totalDollars)}</span>
 </div>
 </div>
 );
 })()}
 </aside>
 </div>

 {/* Add-ons */}
 {data.attachedAddons.length > 0 && (
   <div className="mt-10 space-y-4">
     <h2 className="text-xl font-semibold">Add-ons</h2>
     <MasonryListingGrid
       listings={data.attachedAddons}
       maxColumns={5}
       desktopColumns={5}
       preserveInputOrder
       minCardWidthPx={240}
       cardMaxWidthPx={290}
       renderCard={(listing) => {
         const addonId = String((listing as any).id ?? "");
         const addonMaxQty: number = (listing as any).quantity ?? 99;
         const currentQty = selectedAddons.find((a) => a.id === addonId)?.quantity ?? 0;
         const isSelected = currentQty > 0;
         return (
           <div>
             <ListingCard
               listing={listing}
               titleSizeClassName="text-[1.518rem] md:text-[2rem]"
               priceSizeClassName="text-[1.5rem] leading-none md:text-[2.25rem] md:leading-none"
               titleFont="heading"
               primaryActionLabel={isSelected ? "Remove" : "+ Add"}
               onPrimaryAction={() => setAddonQty(addonId, isSelected ? 0 : 1)}
               primaryActionActive={isSelected}
             />
             {isSelected && (
               <div className="mt-2 flex items-center justify-center gap-3">
                 <button
                   type="button"
                   onClick={() => setAddonQty(addonId, currentQty - 1)}
                   className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-muted"
                   aria-label="Decrease quantity"
                 >
                   <Minus className="h-3 w-3" />
                 </button>
                 <span className="min-w-[1.5rem] text-center text-sm font-medium">{currentQty}</span>
                 <button
                   type="button"
                   onClick={() => setAddonQty(addonId, Math.min(currentQty + 1, addonMaxQty))}
                   disabled={currentQty >= addonMaxQty}
                   className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-foreground hover:bg-muted disabled:opacity-40"
                   aria-label="Increase quantity"
                 >
                   <Plus className="h-3 w-3" />
                 </button>
               </div>
             )}
           </div>
         );
       }}
     />
   </div>
 )}

 {/* Mobile sticky Book Now bar */}
 {data.price && data.shopActive !== false && (
 <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-border bg-background px-4 py-3 lg:hidden">
 <div>
 {activeSalePage ? (
 <>
   <div className="flex items-center gap-1.5">
   <span className="rounded-full bg-[#e07a6a] px-1.5 py-0.5 text-[10px] font-bold text-white">{activeSalePage.percentOff}% OFF</span>
   <span className="text-xs text-muted-foreground line-through">{money(data.price)}</span>
   </div>
   <span className="text-lg font-bold text-[#e07a6a]">
   {money(Math.round(data.price * (1 - activeSalePage.percentOff / 100)))}
   </span>
   <span className="text-sm text-muted-foreground"> {formatPricingUnit(data.pricingUnit)}</span>
 </>
 ) : (
 <>
   <span className="text-lg font-bold text-foreground">{money(data.price)}</span>
   <span className="text-sm text-muted-foreground"> {formatPricingUnit(data.pricingUnit)}</span>
 </>
 )}
 </div>
 <button
 onClick={() => document.getElementById("reservation-card")?.scrollIntoView({ behavior: "smooth" })}
 className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white"
 >
 Book Now
 </button>
 </div>
 )}

 {/* Full-screen gallery */}
 {galleryOpen && (
 <div className="fixed inset-0 z-50 bg-background">
 <header className="sticky top-0 z-10 bg-background/95 backdrop-blur">
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
 <div className="w-10" aria-hidden="true" />
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
 <div className="text-muted-foreground">{t("listing.noPhotosYet")}</div>
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
 vacationBlocks,
 cancellationPolicy,
 cancellationPolicyHours,
 onStartCheckout,
}: {
 listingId: string;
 vendorId: string | null;
 price: number | null;
 pricingUnit: string;
 instantBookEnabled: boolean;
 availableQuantity: number;
 vacationBlocks: Array<{ id: string; startDate: string; endDate: string }>;
 cancellationPolicy: string;
 cancellationPolicyHours: number;
 onStartCheckout: (params: { listingId: string; vendorId: string; eventDate: string; quantity: number; startTime?: string; endTime?: string }) => void;
}) {
 const { t } = useTranslation();
 const draftKey = `eventhub.listing.draft.v1:${listingId}`;

 function readDraft() {
   try {
     const raw = sessionStorage.getItem(draftKey);
     if (!raw) return null;
     return JSON.parse(raw) as { date?: string; startTime?: string; endTime?: string };
   } catch { return null; }
 }

 const [date, setDate] = useState(() => readDraft()?.date ?? "");
 const [quantity, setQuantity] = useState(1);
 const [startTime, setStartTime] = useState(() => readDraft()?.startTime ?? "");
 const [endTime, setEndTime] = useState(() => readDraft()?.endTime ?? "");
 const [isRouting, setIsRouting] = useState(false);
 const [bookingError, setBookingError] = useState<string | null>(null);

 useEffect(() => {
   try {
     sessionStorage.setItem(draftKey, JSON.stringify({ date, startTime, endTime }));
   } catch {}
 }, [draftKey, date, startTime, endTime]);

 const isHourly = pricingUnit === "per_hour";
 const hoursSelected = isHourly && startTime && endTime
   ? (() => {
       const [sh, sm] = startTime.split(":").map(Number);
       const [eh, em] = endTime.split(":").map(Number);
       const diff = (eh * 60 + em) - (sh * 60 + sm);
       return diff > 0 ? diff / 60 : null;
     })()
   : null;
 const timeRangeError = isHourly && startTime && endTime && hoursSelected === null
   ? "End time must be after start time."
   : null;

 const vacationConflict = date
 ? vacationBlocks.find((b) => date >= b.startDate && date <= b.endDate) ?? null
 : null;

 const { isAuthenticated, loginWithRedirect } = useAuth0();

 // Active sale for this listing
 const { data: activeSaleData } = useQuery<{ sale: { percentOff: number; endsAt: string } | null }>({
 queryKey: [`/api/listings/${listingId}/active-sale`],
 staleTime: 60_000,
 });
 const activeSale = activeSaleData?.sale ?? null;
 const salePrice =
 activeSale && typeof price === "number"
   ? Math.round(price * (1 - activeSale.percentOff / 100))
   : null;

 const priceText = salePrice !== null ? money(salePrice) : money(price);
 const unitText = formatPricingUnit(pricingUnit);
 const normalizedAvailableQuantity =
 Number.isFinite(availableQuantity) && availableQuantity > 0 ? Math.floor(availableQuantity) : 1;
 const effectivePricePerUnit = salePrice !== null ? salePrice : (typeof price === "number" ? price : null);
 const quantityTotalText =
 effectivePricePerUnit !== null
   ? isHourly
     ? hoursSelected != null ? money(effectivePricePerUnit * hoursSelected) : null
     : money(effectivePricePerUnit * quantity)
   : null;

 const canBook =
 Boolean(date) &&
 Boolean(priceText) &&
 Boolean(vendorId) &&
 (isHourly ? hoursSelected != null && hoursSelected > 0 : quantity >= 1 && quantity <= normalizedAvailableQuantity) &&
 !isRouting &&
 !vacationConflict;

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

 trackEvent("contact_form_opened", { vendor_id: vendorId, listing_id: listingId });
 setIsRouting(true);
 try {
 onStartCheckout({
 listingId,
 vendorId,
 eventDate: date,
 quantity,
 ...(isHourly && startTime && endTime ? { startTime, endTime } : {}),
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
 <div>
 {activeSale && salePrice !== null && typeof price === "number" ? (
   <div className="flex flex-col gap-0.5">
   <div className="flex items-center gap-2">
   <span className="rounded-full bg-[#e07a6a] px-2 py-0.5 text-xs font-bold text-white">
   {activeSale.percentOff}% OFF
   </span>
   <span className="text-sm text-muted-foreground line-through">{money(price)}</span>
   </div>
   <div className="text-2xl font-semibold text-[#e07a6a]">
   {priceText}
   <span className="text-sm font-normal text-muted-foreground"> {unitText}</span>
   </div>
   <p className="text-xs text-muted-foreground">
   Sale ends {new Date(activeSale.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
   </p>
   </div>
 ) : (
   <div className="text-2xl font-semibold">
   {priceText ?? t("listing.reservationCard.notConfigured")}
   {priceText ? <span className="text-sm font-normal text-muted-foreground"> {unitText}</span> : null}
   </div>
 )}
 </div>
 </div>

 <div className="mt-4 space-y-3">
 <div className="space-y-1">
 <div className="text-sm font-medium">{t("listing.reservationCard.eventDate")}</div>
 <input
 type="date"
 value={date}
 onChange={(e) => setDate(e.target.value)}
 min={new Date().toISOString().split("T")[0]}
 className={[
 "w-full rounded-md border bg-background px-3 py-2 text-sm",
 vacationConflict ? "border-destructive" : "border-border",
 ].join(" ")}
 />
 {vacationConflict && (
 <p className="mt-1 text-sm text-destructive">
 Vendor is unavailable {fmtDate(vacationConflict.startDate)} – {fmtDate(vacationConflict.endDate)}. Choose a different date.
 </p>
 )}
 </div>

 {isHourly && (
 <div className="space-y-1">
 <div className="text-sm font-medium">Time range</div>
 <div className="grid grid-cols-2 gap-2">
 <div className="space-y-1">
 <div className="text-xs text-muted-foreground">Start</div>
 <TimeInput
 value={startTime}
 onChange={setStartTime}
 className="w-full"
 />
 </div>
 <div className="space-y-1">
 <div className="text-xs text-muted-foreground">End</div>
 <TimeInput
 value={endTime}
 onChange={setEndTime}
 className="w-full"
 />
 </div>
 </div>
 {timeRangeError && (
 <p className="text-sm text-destructive">{timeRangeError}</p>
 )}
 {hoursSelected != null && (
 <p className="text-sm text-muted-foreground">{hoursSelected % 1 === 0 ? hoursSelected : hoursSelected.toFixed(1)} hr{hoursSelected !== 1 ? "s" : ""} selected</p>
 )}
 </div>
 )}

 {!isHourly && normalizedAvailableQuantity > 1 ? (
 <div className="space-y-1">
 <div className="text-sm font-medium">{t("listing.reservationCard.quantity")}</div>
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
 <div className="text-sm text-muted-foreground">
 {t("listing.reservationCard.availableQuantity", { count: normalizedAvailableQuantity })}
 </div>
 </div>
 ) : null}


 <div className="border-t border-border pt-3">
 <div className="flex items-center justify-between text-sm">
 <span className="text-muted-foreground">{t("listing.reservationCard.total")}</span>
 <span className="font-medium">{quantityTotalText ?? t("listing.reservationCard.notConfigured")}</span>
 </div>
 <div className="text-sm text-muted-foreground mt-1">{t("listing.reservationCard.serviceFee")}</div>
 </div>

 <div className="border-t border-border pt-3 text-sm text-muted-foreground">
 <span className="font-medium text-foreground">{t("listing.reservationCard.cancellationPolicy")}</span>
 {cancellationPolicy === "no_cancellations"
  ? t("listing.reservationCard.cancellationNone")
  : cancellationPolicy === "cancel_within_hours"
  ? t("listing.reservationCard.cancellationWithinHours", { hours: cancellationPolicyHours })
  : t("listing.reservationCard.cancellationAnytime")}
 </div>

 <button
 onClick={handleBookNow}
 disabled={!canBook}
 className={[
 "w-full rounded-md py-3 text-sm font-medium transition",
 !canBook ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-rose-600 hover:bg-rose-700 text-white",
 ].join(" ")}
 >
 {isRouting ? t("listing.reservationCard.loadingButton") : instantBookEnabled ? t("listing.reservationCard.bookButton") : t("listing.reservationCard.requestButton")}
 </button>

 {bookingError ? <p className="text-sm text-red-600 text-center">{bookingError}</p> : null}

 <p className="text-xs text-muted-foreground leading-relaxed">
  {t("listing.reservationCard.disclaimer")}{" "}
  <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
   Terms of Service
  </a>
 </p>
 </div>
 </div>
 );
}
