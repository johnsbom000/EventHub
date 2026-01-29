import { Card, CardContent } from "@/components/ui/card";
import type { ListingPublic } from "@/types/listing";
import { useLocation } from "wouter";

interface ListingCardProps {
  listing: ListingPublic;
}

function isLoadablePath(s: unknown): s is string {
  return (
    typeof s === "string" &&
    (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) &&
    !s.toLowerCase().endsWith(".heic")
  );
}

function normalizePhotoToUrl(photo: any): string | undefined {
  if (typeof photo === "string") {
    return isLoadablePath(photo) ? photo : undefined;
  }
  if (photo && typeof photo === "object") {
    const url = photo.url;
    if (isLoadablePath(url)) return url;

    const name = photo.name || photo.filename;
    if (typeof name === "string") return `/uploads/listings/${name}`;
  }
  return undefined;
}

export default function ListingCard({ listing }: ListingCardProps) {
  const [, setLocation] = useLocation();
  const listingAny = listing as any;

  // Title
  const title =
    listingAny.listingData?.listingTitle ??
    listingAny.title ??
    listing.serviceType ??
    "Service";

  // Price
  const priceValue =
    listingAny.startingPrice ??
    listingAny.listingData?.pricing?.rate ??
    (listingAny.offerings?.length
      ? Math.min(...listingAny.offerings.map((o: any) => o.price))
      : undefined);

  // Cover photo resolution
  const photosArr: any[] = Array.isArray(listingAny.photos) ? listingAny.photos : [];

  const coverCandidate =
    photosArr.find((p) => p && typeof p === "object" && (p as any).isCover === true) ??
    photosArr[0] ??
    listingAny.coverPhoto ??
    listingAny.listingData?.photos?.urls?.[0] ??
    (listingAny.listingData?.photos?.names?.[0]
      ? { name: listingAny.listingData.photos.names[0] }
      : undefined);

  const cover = normalizePhotoToUrl(coverCandidate);

    const handleClick = () => {
      const id =
        listingAny.id ??
        listingAny.listingId ??
        listingAny.listing?.id ??
        listingAny.vendorListingId;

      setLocation(`/listing/${id}`);
    };


  return (
    <Card
      className="overflow-hidden hover-elevate group cursor-pointer"
      data-testid={`card-listing-${listingAny.id ?? listingAny.listingId ?? listingAny.listing?.id ?? listingAny.vendorListingId ?? "unknown"}`}
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Image */}
      <div className="overflow-hidden bg-muted">
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            No photo yet
          </div>
        )}
      </div>

      {/* Title + Price */}
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-tight line-clamp-2 text-[clamp(1rem,2.2vw,1.9rem)]">
            {title}
          </h3>

          <p className="shrink-0 font-semibold text-foreground text-[clamp(1rem,2.2vw,1.9rem)]">
            {typeof priceValue === "number"
              ? `$${priceValue.toLocaleString()}`
              : "—"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
