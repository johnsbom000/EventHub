import React, { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  CheckCircle,
  ChevronLeft,
  Clock,
  MapPin,
  MessageSquare,
  Package,
  Star,
  Users,
  XCircle,
  Truck,
  Wrench,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  coverRatioToAspectRatio,
  getCoverPhotoIndex,
  getCoverPhotoRatio,
  moveCoverToFront,
} from "@/lib/listingPhotos";
import { resolveAssetUrl } from "@/lib/runtimeUrls";

// ─── Types ────────────────────────────────────────────────────────────────────

type RouteParams = { bookingId: string };

interface BookingDetail {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  listingId: string | null;
  packageId: string | null;
  itemTitle: string | null;
  displayTitle: string | null;
  vendorName: string;
  customerEventTitle: string | null;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  eventLocation: string | null;
  guestCount: number | null;
  specialRequests: string | null;
  customerNotes: string | null;
  customerQuestions: string | null;
  bookedQuantity: number;
  pricingUnitSnapshot: string | null;
  unitPriceCentsSnapshot: number | null;
  deliveryFeeAmountCents: number | null;
  setupFeeAmountCents: number | null;
  travelFeeAmountCents: number | null;
  logisticsTotalCents: number | null;
  baseSubtotalCents: number | null;
  subtotalAmountCents: number | null;
  customerFeeAmountCents: number | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizePhotoToUrl(photo: any): string | undefined {
  if (typeof photo === "string") {
    if (photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("/"))
      return resolveAssetUrl(photo);
    return undefined;
  }
  if (photo && typeof photo === "object") {
    const url = photo.url;
    if (isNonEmptyString(url) && (url.startsWith("http") || url.startsWith("/")))
      return resolveAssetUrl(url);
    const name = photo.name || photo.filename;
    if (isNonEmptyString(name)) return resolveAssetUrl(`/uploads/listings/${name}`);
  }
  return undefined;
}

function money(cents: number | null | undefined): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function formatPricingUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  if (unit === "per_day") return "/ day";
  if (unit === "per_hour") return "/ hr";
  return `/${unit}`;
}

type CropAreaLike = { x?: number; y?: number; width?: number; height?: number };
type CropLike = { aspect?: number; areaPercentages?: CropAreaLike };
type PhotoRenderMeta = { aspect?: number; objectPosition?: string };

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

function getPhotoRenderMetaByUrl(
  photoUrls: string[],
  cropsByName: Record<string, unknown>
): Record<string, PhotoRenderMeta> {
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

const STATUS_PILL: Record<string, string> = {
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-zinc-200 bg-zinc-100 text-zinc-500",
  failed: "border-red-200 bg-red-50 text-red-600",
  expired: "border-zinc-200 bg-zinc-100 text-zinc-500",
  completed:
    "border-[rgba(74,106,125,0.2)] bg-[rgba(74,106,125,0.08)] text-[#4a6a7d]",
};

const GALLERY_HEIGHT_CLASS = "h-[60vh] min-h-[320px] max-h-[520px]";

// ─── BookingCard ──────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  bookedPackage,
}: {
  booking: BookingDetail;
  bookedPackage?: { title: string | null; priceCents: number | null } | null;
}) {
  const startFmt = formatTime(booking.eventStartTime);
  const endFmt = formatTime(booking.eventEndTime);
  const hasTime = startFmt || endFmt;

  const unitPriceDollars =
    booking.unitPriceCentsSnapshot != null ? booking.unitPriceCentsSnapshot : null;
  const deliveryFee = booking.deliveryFeeAmountCents;
  const setupFee = booking.setupFeeAmountCents;
  const travelFee = booking.travelFeeAmountCents;
  const subtotal = booking.subtotalAmountCents ?? booking.baseSubtotalCents;
  const customerFee = booking.customerFeeAmountCents;

  const rows: Array<{ label: string; value: string }> = [];

  if (unitPriceDollars != null) {
    const unit = formatPricingUnit(booking.pricingUnitSnapshot);
    const qty = booking.bookedQuantity;
    rows.push({
      label: qty > 1 ? `${bookedPackage?.title ?? "Base price"} × ${qty}` : (bookedPackage?.title ?? "Base price"),
      value: money(unitPriceDollars * qty) ?? "—",
    });
  }
  if (deliveryFee) rows.push({ label: "Delivery fee", value: money(deliveryFee) ?? "—" });
  if (setupFee) rows.push({ label: "Setup fee", value: money(setupFee) ?? "—" });
  if (travelFee) rows.push({ label: "Travel fee", value: money(travelFee) ?? "—" });
  if (customerFee) rows.push({ label: "Service fee", value: money(customerFee) ?? "—" });

  return (
    <div className="rounded-2xl border border-border bg-background shadow-sm p-5 space-y-5">
      {/* Status */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#2a3a42]">Booking Details</h2>
        <Badge
          variant="outline"
          className={`capitalize text-sm font-semibold px-3 py-1 ${STATUS_PILL[booking.status] ?? ""}`}
        >
          {booking.status}
        </Badge>
      </div>

      <div className="h-px bg-border" />

      {/* Core booking info */}
      <dl className="space-y-3 text-sm">
        {/* Date */}
        <div className="flex items-start gap-3">
          <Calendar className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
              Event Date
            </dt>
            <dd className="font-medium text-[#2a3a42]">
              {format(new Date(`${booking.eventDate}T00:00:00`), "EEEE, MMMM d, yyyy")}
            </dd>
          </div>
        </div>

        {/* Time */}
        {hasTime && (
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
                Time
              </dt>
              <dd className="font-medium text-[#2a3a42]">
                {startFmt && endFmt ? `${startFmt} – ${endFmt}` : startFmt ?? endFmt}
              </dd>
            </div>
          </div>
        )}

        {/* Location */}
        {booking.eventLocation && (
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
                Location
              </dt>
              <dd className="font-medium text-[#2a3a42]">{booking.eventLocation}</dd>
            </div>
          </div>
        )}

        {/* Guest count */}
        {booking.guestCount != null && booking.guestCount > 0 && (
          <div className="flex items-start gap-3">
            <Users className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
                Guest Count
              </dt>
              <dd className="font-medium text-[#2a3a42]">{booking.guestCount}</dd>
            </div>
          </div>
        )}

        {/* Booked package */}
        {bookedPackage && (
          <div className="flex items-start gap-3">
            <Package className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
                Package
              </dt>
              <dd className="font-medium text-[#2a3a42]">{bookedPackage.title ?? "Package"}</dd>
            </div>
          </div>
        )}

        {/* Quantity */}
        {booking.bookedQuantity > 1 && (
          <div className="flex items-start gap-3">
            <Package className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
                Quantity
              </dt>
              <dd className="font-medium text-[#2a3a42]">{booking.bookedQuantity}</dd>
            </div>
          </div>
        )}

        {/* Notes */}
        {booking.customerNotes && (
          <div className="flex items-start gap-3">
            <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
                Notes
              </dt>
              <dd className="text-[#2a3a42] whitespace-pre-wrap leading-relaxed">
                {booking.customerNotes}
              </dd>
            </div>
          </div>
        )}

        {/* Questions / special requests */}
        {booking.customerQuestions && (
          <div className="flex items-start gap-3">
            <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-[#4a6a7d]" />
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70 mb-0.5">
                Questions / Special Requests
              </dt>
              <dd className="text-[#2a3a42] whitespace-pre-wrap leading-relaxed">
                {booking.customerQuestions}
              </dd>
            </div>
          </div>
        )}
      </dl>

      {/* Price breakdown */}
      <div className="h-px bg-border" />
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#4a6a7d]/70">
          Price Breakdown
        </p>
        <div className="space-y-1.5 text-sm">
          {rows.length > 0 ? (
            rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium text-[#2a3a42]">{r.value}</span>
              </div>
            ))
          ) : (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total paid</span>
              <span className="font-medium text-[#2a3a42]">{money(booking.totalAmount) ?? "—"}</span>
            </div>
          )}
        </div>
        <div className="border-t border-border pt-2.5 flex justify-between gap-2">
          <span className="text-sm font-semibold text-[#2a3a42]">Total</span>
          <span className="text-sm font-bold text-[#2a3a42]">{money(booking.totalAmount) ?? "—"}</span>
        </div>
      </div>

      {/* Booked on */}
      <p className="text-xs text-[#4a6a7d]/60">
        Booked on {format(new Date(booking.createdAt), "MMM d, yyyy")}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CUSTOMER_CANCEL_REASONS = [
  "Found a different vendor",
  "Event was cancelled",
  "Change in budget",
  "No longer need this service",
  "Emergency / force majeure",
  "Other",
] as const;

export default function CustomerBookingDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute<RouteParams>("/booking/:bookingId");
  const bookingId = params?.bookingId;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReasonSelected, setCancelReasonSelected] = useState("");
  const [cancelReasonOther, setCancelReasonOther] = useState("");

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest("POST", `/api/bookings/${bookingId}/cancel`, { reason });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to cancel booking");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/customer/bookings/${bookingId}`] });
      qc.invalidateQueries({ queryKey: ["/api/customer/bookings"] });
      setCancelModalOpen(false);
      setCancelReasonSelected("");
      setCancelReasonOther("");
      toast({ title: "Booking cancelled", description: "The vendor has been notified." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: booking, isLoading: loadingBooking, error: bookingError } = useQuery<BookingDetail>({
    queryKey: [`/api/customer/bookings/${bookingId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customer/bookings/${bookingId}`);
      if (!res.ok) throw new Error("Failed to load booking");
      return res.json();
    },
    enabled: !!bookingId,
  });

  const listingId = booking?.listingId ?? null;

  const { data: listing, isLoading: loadingListing } = useQuery<any>({
    queryKey: ["/api/listings/public", listingId],
    queryFn: async () => {
      const res = await fetch(`/api/listings/public/${listingId}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Failed to load listing");
      return res.json();
    },
    enabled: !!listingId,
  });

  useEffect(() => {
    if (!galleryOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [galleryOpen]);

  if (!bookingId) return <div className="no-global-scale p-6">Invalid booking.</div>;
  if (loadingBooking) return <div className="no-global-scale p-6">Loading…</div>;
  if (bookingError || !booking) return <div className="no-global-scale p-6">Booking not found.</div>;

  // ── Build listing display data ─────────────────────────────────────────────
  const raw = listing ?? {};
  const ld = (raw?.listingData ?? {}) as any;

  const photosFromObjects: string[] = Array.isArray(raw?.photos)
    ? raw.photos.map((p: any) => normalizePhotoToUrl(p)).filter((u: any) => typeof u === "string")
    : [];
  const photosFromListingData: string[] = Array.isArray(ld?.photos?.urls)
    ? ld.photos.urls.filter((u: any) => typeof u === "string").map((u: string) => resolveAssetUrl(u))
    : Array.isArray(ld?.photos?.names)
    ? ld.photos.names
        .map((n: any) => (typeof n === "string" ? resolveAssetUrl(`/uploads/listings/${n}`) : null))
        .filter(Boolean)
    : [];
  const allPhotos = [...photosFromObjects, ...photosFromListingData].filter(Boolean);
  const coverPhotoIndex = getCoverPhotoIndex(raw, allPhotos);
  const orderedPhotos = moveCoverToFront(allPhotos, coverPhotoIndex);
  const coverPhotoRatio = getCoverPhotoRatio(raw);
  const cropsByName =
    ld?.photos?.cropsByName && typeof ld.photos.cropsByName === "object"
      ? (ld.photos.cropsByName as Record<string, unknown>)
      : {};
  const photoRenderMetaByUrl = getPhotoRenderMetaByUrl(allPhotos, cropsByName);

  const photos = orderedPhotos;
  const hasPhotos = photos.length > 0;
  const splitGalleryPhotos = photos.slice(1, Math.min(photos.length, 4));
  const marketplaceGridPhotos = photos.slice(1, 5);
  const coverAspectRatio = coverRatioToAspectRatio(coverPhotoRatio);
  const usesSavedCoverAspectRatio = photos.length === 1;

  const title = raw?.title ?? ld?.listingTitle ?? booking.itemTitle ?? "Listing";
  const vendorName = raw?.vendorName ?? raw?.vendor?.businessName ?? booking.vendorName ?? "Vendor";
  const city = raw?.city ?? raw?.listingServiceCenterLabel ?? ld?.serviceLocation?.city ?? "";
  const rating = Number(raw?.rating ?? 0);
  const reviewCount = Number(raw?.reviewCount ?? 0);
  const reviews = Array.isArray(raw?.reviews)
    ? raw.reviews
        .map((r: any) => ({
          id: String(r?.id || "").trim(),
          rating: Number(r?.rating || 0),
          body: typeof r?.body === "string" ? r.body : "",
          authorName: typeof r?.authorName === "string" ? r.authorName : "Customer",
          createdAt: r?.createdAt ?? null,
        }))
        .filter((r: any) => r.id.length > 0 && r.rating > 0)
    : [];
  const description = raw?.description ?? ld?.listingDescription ?? "";
  const included: string[] = Array.from(
    new Set([
      ...(Array.isArray(raw?.whatsIncluded) ? raw.whatsIncluded : []),
      ...(Array.isArray(ld?.whatsIncluded) ? ld.whatsIncluded : []),
    ]).values()
  ).filter((s) => typeof s === "string" && s.trim().length > 0) as string[];
  const notIncluded: string[] = Array.from(
    new Set([
      ...(Array.isArray(raw?.whatsNotIncluded) ? raw.whatsNotIncluded : []),
      ...(Array.isArray(ld?.whatsNotIncluded) ? ld.whatsNotIncluded : []),
    ]).values()
  ).filter((s) => typeof s === "string" && s.trim().length > 0) as string[];
  const listingType = (raw?.listingType ?? "single") as string;
  const packages: Array<{
    id: string;
    title: string | null;
    description: string | null;
    priceCents: number | null;
    whatsIncluded: string[];
    whatsNotIncluded: string[];
    sortOrder: number;
  }> = Array.isArray(raw?.packages) ? raw.packages : [];

  // Find the booked package (packageId is the package_item listing id)
  const bookedPackage = booking.packageId
    ? packages.find((p) => p.id === booking.packageId) ?? null
    : null;

  const getObjectPosition = (src: string): React.CSSProperties | undefined => {
    const meta = photoRenderMetaByUrl[src] ?? photoRenderMetaByUrl[canonicalPhotoUrl(src)];
    if (!meta?.objectPosition) return undefined;
    return { objectPosition: meta.objectPosition };
  };

  const getSavedAspect = (src: string): number | undefined => {
    const meta = photoRenderMetaByUrl[src] ?? photoRenderMetaByUrl[canonicalPhotoUrl(src)];
    if (!meta?.aspect || !Number.isFinite(meta.aspect) || meta.aspect <= 0) return undefined;
    return meta.aspect;
  };

  const isLoading = loadingBooking || (!!listingId && loadingListing);

  return (
    <div className="no-global-scale max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
      {/* Back */}
      <div className="mb-6">
        <button
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else setLocation("/dashboard/events");
          }}
          className="flex items-center text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to My Events
        </button>
      </div>

      {/* Photo gallery */}
      {isLoading ? (
        <div className="rounded-2xl bg-muted animate-pulse h-[320px] md:h-[420px]" />
      ) : (
        <div className="relative">
          {hasPhotos ? (
            <div className={`relative overflow-hidden rounded-2xl ${GALLERY_HEIGHT_CLASS}`}>
              {/* Mobile */}
              <div className="md:hidden h-full">
                <button
                  className="relative block h-full w-full overflow-hidden bg-transparent"
                  style={usesSavedCoverAspectRatio ? { aspectRatio: coverAspectRatio } : undefined}
                  onClick={() => setGalleryOpen(true)}
                >
                  <img
                    src={photos[0]}
                    alt={title}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={getObjectPosition(photos[0])}
                  />
                </button>
              </div>

              {/* Desktop */}
              <div className="hidden h-full md:block">
                {photos.length === 1 && (
                  <button
                    className="relative block h-full w-full overflow-hidden bg-transparent"
                    style={usesSavedCoverAspectRatio ? { aspectRatio: coverAspectRatio } : undefined}
                    onClick={() => setGalleryOpen(true)}
                  >
                    <img src={photos[0]} alt={title} className="absolute inset-0 h-full w-full object-cover" style={getObjectPosition(photos[0])} />
                  </button>
                )}
                {photos.length >= 2 && photos.length <= 4 && (
                  <div className="grid h-full grid-cols-[2fr_1fr] gap-2">
                    <button className="relative block h-full w-full overflow-hidden bg-transparent" onClick={() => setGalleryOpen(true)}>
                      <img src={photos[0]} alt={title} className="absolute inset-0 h-full w-full object-cover" style={getObjectPosition(photos[0])} />
                    </button>
                    <div className={`grid h-full gap-2 ${photos.length === 2 ? "grid-rows-1" : photos.length === 3 ? "grid-rows-2" : "grid-rows-3"}`}>
                      {splitGalleryPhotos.map((src: string, i: number) => (
                        <button key={`${src}-${i}`} className="relative block h-full w-full overflow-hidden bg-transparent" onClick={() => setGalleryOpen(true)}>
                          <img src={src} alt={`${title} photo ${i + 2}`} className="absolute inset-0 h-full w-full object-cover" style={getObjectPosition(src)} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {photos.length >= 5 && (
                  <div className="grid h-full grid-cols-4 grid-rows-2 gap-2">
                    <button className="relative col-span-2 row-span-2 block h-full w-full overflow-hidden bg-transparent" onClick={() => setGalleryOpen(true)}>
                      <img src={photos[0]} alt={title} className="absolute inset-0 h-full w-full object-cover" style={getObjectPosition(photos[0])} />
                    </button>
                    {marketplaceGridPhotos.map((src: string, i: number) => (
                      <button key={`${src}-${i}`} className="relative block h-full w-full overflow-hidden bg-transparent" onClick={() => setGalleryOpen(true)}>
                        <img src={src} alt={`${title} photo ${i + 2}`} className="absolute inset-0 h-full w-full object-cover" style={getObjectPosition(src)} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
      )}

      {/* Main layout */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
        {/* Left: listing content */}
        <div className="space-y-10">
          {/* Title block */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              {isNonEmptyString(city) && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{city}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-foreground font-medium">
                  {Number.isFinite(rating) && rating > 0 ? rating.toFixed(2) : "New"}
                </span>
                <span className="text-muted-foreground">
                  {reviewCount > 0 ? `(${reviewCount} reviews)` : "(No reviews yet)"}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Description */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Description</h2>
            {listingType === "package_container" && bookedPackage ? (
              isNonEmptyString(bookedPackage.description) ? (
                <p className="text-muted-foreground leading-relaxed">{bookedPackage.description}</p>
              ) : (
                <p className="text-muted-foreground italic">No description for this package.</p>
              )
            ) : isNonEmptyString(description) ? (
              <p className="text-muted-foreground leading-relaxed">{description}</p>
            ) : (
              <p className="text-muted-foreground italic">No description provided.</p>
            )}
          </section>

          <div className="border-t border-border" />

          {/* Package cards — highlight booked one */}
          {listingType === "package_container" && packages.length > 0 && (
            <>
              <section className="space-y-4">
                <h2 className="text-xl font-semibold">Packages</h2>
                <p className="text-sm text-muted-foreground -mt-2">
                  Your booked package is highlighted below.
                </p>
                <div
                  className={[
                    "grid gap-5",
                    packages.length === 1 ? "grid-cols-1 max-w-sm" : "grid-cols-1 sm:grid-cols-2",
                  ].join(" ")}
                >
                  {[...packages]
                    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                    .map((pkg) => {
                      const pkgPrice = pkg.priceCents != null ? pkg.priceCents : null;
                      const isBooked = pkg.id === booking.packageId;
                      return (
                        <div
                          key={pkg.id}
                          className={[
                            "relative rounded-2xl border-2 p-6 flex flex-col gap-5 text-left w-full",
                            isBooked
                              ? "border-secondary bg-secondary/10 shadow-md"
                              : "border-border bg-white opacity-60",
                          ].join(" ")}
                        >
                          {isBooked && (
                            <span className="absolute -top-3 left-4 rounded-full bg-secondary px-3 py-0.5 text-xs font-bold text-white shadow">
                              Your Package
                            </span>
                          )}
                          <div className="space-y-3 text-center">
                            <h3 className="text-lg font-bold tracking-tight">{pkg.title ?? "Package"}</h3>
                            {pkgPrice != null ? (
                              <div className="text-4xl font-bold text-foreground">
                                {money(pkgPrice) ?? "—"}
                              </div>
                            ) : (
                              <div className="text-2xl font-semibold text-muted-foreground">—</div>
                            )}
                          </div>

                          <div className="border-t border-border" />

                          {pkg.whatsIncluded?.length > 0 && (
                            <ul className="space-y-2 flex-1">
                              {pkg.whatsIncluded.map((item: string) => (
                                <li key={item} className="flex items-start gap-2 text-sm text-foreground/80">
                                  <CheckCircle
                                    className={[
                                      "mt-0.5 h-4 w-4 shrink-0",
                                      isBooked ? "text-secondary-foreground" : "text-secondary",
                                    ].join(" ")}
                                  />
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
                        </div>
                      );
                    })}
                </div>
              </section>
              <div className="border-t border-border" />
            </>
          )}

          {/* What's included — single listings */}
          {listingType !== "package_container" && (
            <>
              <section className="space-y-3">
                <h2 className="text-xl font-semibold">What's Included</h2>
                {included.length > 0 ? (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {included.slice(0, 10).map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 mt-0.5 text-secondary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground italic">Not configured.</p>
                )}
              </section>

              {notIncluded.length > 0 && (
                <>
                  <div className="border-t border-border" />
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">What's Not Included</h2>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {notIncluded.slice(0, 10).map((item: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <XCircle className="w-4 h-4 mt-0.5 text-muted-foreground" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </>
          )}

          {/* Logistics (single/addon) */}
          {listingType !== "package_container" && (() => {
            const deliveryLabel = (() => {
              const fe = raw?.deliveryFeeEnabled;
              const fo = raw?.deliveryOffered;
              if (fe) return `Delivery fee: ${money(raw?.deliveryFeeAmountCents) ?? "Applies"}`;
              if (fo === true) return "Delivery included";
              if (fo === false) return "Delivery not included";
              return null;
            })();
            const setupLabel = (() => {
              const fe = raw?.setupFeeEnabled;
              const fo = raw?.setupOffered;
              if (fe) return `Setup fee: ${money(raw?.setupFeeAmountCents) ?? "Applies"}`;
              if (fo === true) return "Setup included";
              if (fo === false) return "Setup not included";
              return null;
            })();
            const items = [
              deliveryLabel ? { icon: Truck, title: "Delivery", desc: deliveryLabel } : null,
              setupLabel ? { icon: Wrench, title: "Setup", desc: setupLabel } : null,
            ].filter(Boolean) as Array<{ icon: typeof Truck; title: string; desc: string }>;
            if (items.length === 0) return null;
            return (
              <>
                <div className="border-t border-border" />
                <section className="space-y-3">
                  <h2 className="text-xl font-semibold">Logistics</h2>
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
          })()}

          <div className="border-t border-border" />

          {/* Reviews */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Reviews</h2>
            {reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((review: any) => (
                  <article key={review.id} className="rounded-xl border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{review.authorName || "Customer"}</div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((v) => (
                          <Star
                            key={v}
                            className={`w-4 h-4 ${
                              v <= Math.round(Number(review.rating || 0))
                                ? "fill-current text-yellow-500"
                                : "text-muted-foreground"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    {review.createdAt && (
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(review.createdAt), "MMMM d, yyyy")}
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{review.body}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No reviews yet.</p>
            )}
          </section>

          <div className="border-t border-border" />

          {/* Vendor */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Vendor</h2>
            <p className="text-muted-foreground">Hosted by {vendorName}</p>
            {raw?.vendorId && (
              <button
                type="button"
                onClick={() => setLocation(`/shop/${raw.vendorId}`)}
                className="inline-flex items-center rounded-full border border-[rgba(74,106,125,0.24)] bg-white/90 px-4 py-2 text-sm font-medium text-[#2a3a42] transition-colors hover:bg-white"
              >
                Visit {vendorName}'s shop
              </button>
            )}
          </section>
        </div>

        {/* Right: booking details card */}
        <aside className="lg:sticky lg:top-8 space-y-3">
          <BookingCard
            booking={booking}
            bookedPackage={bookedPackage}
          />
          {(booking.status === "pending" || booking.status === "confirmed") && (
            <button
              type="button"
              onClick={() => setCancelModalOpen(true)}
              className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100"
            >
              Cancel Booking
            </button>
          )}
        </aside>
      </div>

      {/* Cancellation reason modal */}
      <Dialog
        open={cancelModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCancelModalOpen(false);
            setCancelReasonSelected("");
            setCancelReasonOther("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Why are you cancelling this booking?</DialogTitle>
          <DialogDescription>
            This reason will be shared with the vendor and saved for our records. Refunds are subject to the vendor's cancellation policy.
          </DialogDescription>
          <div className="mt-3 space-y-2">
            {CUSTOMER_CANCEL_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="customer-cancel-reason"
                  value={r}
                  checked={cancelReasonSelected === r}
                  onChange={() => setCancelReasonSelected(r)}
                  className="accent-[#e07a6a]"
                />
                {r}
              </label>
            ))}
            {cancelReasonSelected === "Other" && (
              <Textarea
                className="mt-2 text-sm"
                placeholder="Please describe your reason…"
                value={cancelReasonOther}
                onChange={(e) => setCancelReasonOther(e.target.value)}
                maxLength={500}
                rows={3}
              />
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCancelModalOpen(false);
                setCancelReasonSelected("");
                setCancelReasonOther("");
              }}
            >
              Go back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={
                !cancelReasonSelected ||
                (cancelReasonSelected === "Other" && !cancelReasonOther.trim()) ||
                cancelMutation.isPending
              }
              onClick={() => {
                if (!cancelReasonSelected) return;
                const reason =
                  cancelReasonSelected === "Other" ? cancelReasonOther.trim() : cancelReasonSelected;
                cancelMutation.mutate(reason);
              }}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                    const savedAspect = getSavedAspect(src);
                    return (
                      <figure
                        key={`${src}-${i}`}
                        className={`mb-3 break-inside-avoid overflow-hidden rounded-xl bg-background ${savedAspect ? "relative" : ""}`}
                        style={savedAspect ? { aspectRatio: String(savedAspect) } : undefined}
                      >
                        <img
                          src={src}
                          alt={`${title} photo ${i + 1}`}
                          className={
                            savedAspect
                              ? "absolute inset-0 block w-full h-full object-contain"
                              : "block w-full h-auto object-contain"
                          }
                          style={getObjectPosition(src)}
                          loading="lazy"
                        />
                      </figure>
                    );
                  })}
                </div>
              ) : (
                <div className="text-muted-foreground">No photos yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
