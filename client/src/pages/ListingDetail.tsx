import React, { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, MapPin, Star, CheckCircle, Truck, Wrench, X } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";

type RouteParams = { id: string };

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

      // Pricing: single-item rental only (listing-level)
      const pricingRateRaw =
        ld?.pricing?.rate ?? ld?.pricing?.pricingByPropType?.[ld?.propTypes?.[0]]?.rate ?? null;

      const pricingRate =
        typeof pricingRateRaw === "number"
          ? pricingRateRaw
          : typeof pricingRateRaw === "string"
            ? Number(pricingRateRaw)
            : null;

      const pricingUnit = ld?.pricing?.unit ?? ld?.pricingUnit ?? ld?.pricing?.pricingUnit ?? "per_day";

      // Title/category/location: prefer listingData fields first
      const title = ld?.listingTitle ?? raw?.title ?? "Listing";
      const description = ld?.listingDescription ?? "";
      const vendorName = raw?.vendorName ?? raw?.vendor?.businessName ?? "Vendor";

      const city =
        raw?.city ??
        ld?.serviceLocation?.city ??
        (typeof ld?.serviceLocation?.label === "string" ? ld.serviceLocation.label : "") ??
        "";

      const rating = Number(raw?.rating ?? 0);
      const reviewCount = Number(raw?.reviewCount ?? 0);

      // “What’s included” (best-effort from tags + propTypes)
      const tags: string[] = Array.isArray(ld?.tagsByPropType?.__listing__)
        ? ld.tagsByPropType.__listing__.map((t: any) => t?.label).filter(Boolean)
        : [];

      const propTypes: string[] = Array.isArray(ld?.propTypes)
        ? ld.propTypes
        : Array.isArray(ld?.propTypes?.selected)
          ? ld.propTypes.selected
          : [];

      const included = [...tags, ...propTypes].filter((x) => typeof x === "string");

      // Logistics (best-effort)
      const delivery = ld?.deliverySetup ?? {};
      const deliveryIncluded = Boolean(delivery?.deliveryIncluded ?? ld?.deliveryIncluded);
      const setupIncluded = Boolean(delivery?.setupIncluded ?? ld?.setupIncluded);
      const radiusMiles = Number(ld?.serviceRadiusMiles ?? ld?.deliverySetup?.serviceRadiusMiles ?? 0) || null;

      return {
        id: raw?.id ?? listingId,
        vendorId: raw?.vendorId ?? null,
        title,
        description,
        vendorName,
        city,
        rating,
        reviewCount,
        photos: allPhotos,
        price: pricingRate,
        pricingUnit,
        included,
        logistics: {
          deliveryIncluded,
          setupIncluded,
          radiusMiles,
        },
      };
    },
  });

  if (!listingId) return <div className="p-6">Missing listing id</div>;
  if (isLoading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6">Error loading listing</div>;
  if (!data) return <div className="p-6">Listing not found</div>;

  const photos = Array.isArray(data.photos) ? data.photos : [];
  const hasPhotos = photos.length > 0;
  const topPhotos = photos.slice(0, 5);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back */}
      <button
        onClick={() => setLocation("/browse")}
        className="flex items-center text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-5 h-5 mr-1" />
        Back to results
      </button>

      {/* Photo grid (Airbnb-ish) */}
      <div className="relative">
        {hasPhotos ? (
          <div className="relative rounded-2xl overflow-hidden bg-muted">
            {/* 1 photo: full-width hero */}
            {photos.length === 1 && (
              <button
                className="relative h-[320px] md:h-[520px] w-full overflow-hidden"
                onClick={() => setGalleryOpen(true)}
                title="Show all photos"
              >
                <img src={photos[0]} alt={data.title} className="absolute inset-0 w-full h-full object-cover" />
              </button>
            )}

            {/* 2–4 photos: simple filled grid */}
            {photos.length > 1 && photos.length < 5 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  className="relative h-[320px] md:h-[420px] w-full overflow-hidden"
                  onClick={() => setGalleryOpen(true)}
                  title="Show all photos"
                >
                  <img src={photos[0]} alt={data.title} className="absolute inset-0 w-full h-full object-cover" />
                </button>

                <div className="grid grid-rows-2 gap-2">
                  {photos.slice(1, 3).map((src: string, i: number) => (
                    <button
                      key={i}
                      className="relative h-[156px] md:h-[206px] overflow-hidden"
                      onClick={() => setGalleryOpen(true)}
                      title="Show all photos"
                    >
                      <img
                        src={src}
                        alt={`${data.title} photo ${i + 2}`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </button>
                  ))}

                  {/* If only 2 photos total, fill the last slot with a blurred version */}
                  {photos.length === 2 && (
                    <div className="relative h-[156px] md:h-[206px] overflow-hidden">
                      <img
                        src={photos[0]}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-60"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5+ photos: Airbnb-like 1 big + 4 small */}
            {photos.length >= 5 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  className="relative h-[320px] md:h-[420px] w-full overflow-hidden"
                  onClick={() => setGalleryOpen(true)}
                  title="Show all photos"
                >
                  <img src={topPhotos[0]} alt={data.title} className="absolute inset-0 w-full h-full object-cover" />
                </button>

                <div className="hidden md:grid grid-cols-2 grid-rows-2 gap-2">
                  {topPhotos.slice(1, 5).map((src: string, i: number) => (
                    <button
                      key={i}
                      className="relative h-[206px] overflow-hidden"
                      onClick={() => setGalleryOpen(true)}
                      title="Show all photos"
                    >
                      <img
                        src={src}
                        alt={`${data.title} photo ${i + 2}`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                  {data.logistics?.deliveryIncluded ? "Delivery included" : "Not configured yet"}
                </p>
              </div>

              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 font-medium">
                  <Wrench className="w-4 h-4" />
                  Setup
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.logistics?.setupIncluded ? "Setup included" : "Not configured yet"}
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
            <p className="text-muted-foreground">No reviews yet</p>
          </section>

          <div className="border-t border-border" />

          {/* Vendor */}
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Vendor</h2>
            <p className="text-muted-foreground">Hosted by {data.vendorName}</p>
          </section>
        </div>

        {/* Right sticky reservation card */}
        <aside className="lg:sticky lg:top-8">
          <ReservationCard
            listingId={data.id}
            vendorId={data.vendorId}
            price={data.price}
            pricingUnit={data.pricingUnit}
            onBooked={() => {}}
          />
        </aside>
      </div>

      {/* Gallery modal */}
      {galleryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70">
          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex items-start justify-center px-4 py-10">
              <div className="w-full max-w-5xl bg-background rounded-2xl shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="font-semibold">Photos</div>
                  <button
                    onClick={() => setGalleryOpen(false)}
                    className="rounded-md p-2 hover:bg-muted"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5">
                  {hasPhotos ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {photos.map((src: string, i: number) => (
                        <div key={i} className="rounded-xl overflow-hidden bg-muted">
                          <img
                            src={src}
                            alt={`${data.title} photo ${i + 1}`}
                            className="w-full h-64 object-cover"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No photos yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Click outside to close */}
          <button
            className="absolute inset-0 w-full h-full cursor-default"
            onClick={() => setGalleryOpen(false)}
            aria-label="Close gallery overlay"
            style={{ background: "transparent" }}
          />
        </div>
      )}
    </div>
  );
}

function ReservationCard({
  listingId, // kept for future (not sent to backend yet)
  vendorId,
  price,
  pricingUnit,
  onBooked,
}: {
  listingId: string;
  vendorId: string | null;
  price: number | null;
  pricingUnit: string;
  onBooked: (booking: any) => void;
}) {
  const [date, setDate] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  const { isAuthenticated, loginWithRedirect, getAccessTokenSilently } = useAuth0();

  const priceText = money(price);
  const unitText = formatPricingUnit(pricingUnit);

  const canBook = Boolean(date) && Boolean(priceText) && Boolean(vendorId) && !isBooking;

  async function handleBookNow() {
    if (!vendorId) {
      alert("This listing is missing a vendor id (can’t book yet).");
      return;
    }
    if (!date) {
      alert("Pick an event date first.");
      return;
    }
    if (!priceText || typeof price !== "number") {
      alert("This listing is missing a price (can’t book yet).");
      return;
    }

    // MVP assumptions:
    // - totalAmount is the listing price
    // - deposit is 25% (required by backend schema: must be positive int)
    // - final payment strategy: immediately
    const totalAmount = Math.round(price);
    const depositAmount = Math.max(1, Math.round(totalAmount * 0.25));

    setIsBooking(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          eventDate: date,
          totalAmount,
          depositAmount,
          finalPaymentStrategy: "immediately",
          // listingId not in schema yet, so we do NOT send it
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to create booking");
      }

      onBooked(json);
    } catch (e: any) {
      alert(e?.message || "Failed to create booking");
    } finally {
      setIsBooking(false);
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

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{priceText ?? "Not configured yet"}</span>
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
          {isBooking ? "Booking..." : "Book Now"}
        </button>

        <p className="text-xs text-center text-muted-foreground">You won’t be charged yet (payments not wired here)</p>

        <div className="border-t border-border pt-3">
          <div className="text-sm font-medium">Cancellation Policy</div>
          <div className="text-sm text-muted-foreground">Not configured yet</div>
        </div>
      </div>
    </div>
  );
}