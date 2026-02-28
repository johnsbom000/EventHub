import { useEffect, useMemo, useState } from "react";
import ListingCard from "@/components/ListingCard";
import type { ListingPublic } from "@/types/listing";
import { getCoverPhotoRatio } from "@/lib/listingPhotos";

function getColumnCountForWidth(width: number): number {
  if (width >= 1536) return 5;
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  if (width >= 640) return 2;
  return 1;
}

function ratioToHeightFactor(ratio: string): number {
  const [wRaw, hRaw] = ratio.split(":");
  const w = Number(wRaw);
  const h = Number(hRaw);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 1.5;
  return h / w;
}

function estimateListingCardHeight(listing: ListingPublic): number {
  const listingAny = listing as any;
  const title = String(
    listingAny.listingData?.listingTitle ??
      listingAny.title ??
      listingAny.serviceType ??
      "Listing"
  );
  const ratio = getCoverPhotoRatio(listingAny);
  const imageWeight = ratioToHeightFactor(ratio) * 100;
  const titleWeight = title.length > 24 ? 24 : 0;
  // Fixed content block under image (title + price row + spacing).
  return imageWeight + titleWeight + 72;
}

function buildMasonryColumns(listings: ListingPublic[], requestedColumns: number): ListingPublic[][] {
  const columnCount = Math.max(1, requestedColumns);
  const baseCount = Math.floor(listings.length / columnCount);
  const remainder = listings.length % columnCount;

  const columns = Array.from({ length: columnCount }, (_, index) => ({
    height: 0,
    slotsRemaining: baseCount + (index < remainder ? 1 : 0),
    items: [] as ListingPublic[],
  }));

  const listingsByHeight = [...listings].sort(
    (a, b) => estimateListingCardHeight(b) - estimateListingCardHeight(a)
  );

  listingsByHeight.forEach((listing) => {
    const listingHeight = estimateListingCardHeight(listing) + 16;

    let chosenIndex = -1;
    for (let i = 0; i < columns.length; i += 1) {
      if (columns[i].slotsRemaining <= 0) continue;
      if (chosenIndex < 0) {
        chosenIndex = i;
        continue;
      }

      // Prioritize columns with fewer remaining slots so taller cards land in
      // shorter-capacity columns, which minimizes final deepest column height.
      if (columns[i].slotsRemaining < columns[chosenIndex].slotsRemaining) {
        chosenIndex = i;
        continue;
      }
      if (columns[i].slotsRemaining > columns[chosenIndex].slotsRemaining) {
        continue;
      }

      if (columns[i].height < columns[chosenIndex].height) {
        chosenIndex = i;
        continue;
      }
      if (columns[i].height > columns[chosenIndex].height) {
        continue;
      }

      if (i < chosenIndex) {
        chosenIndex = i;
      }
    }

    if (chosenIndex < 0) return;
    columns[chosenIndex].items.push(listing);
    columns[chosenIndex].slotsRemaining -= 1;
    columns[chosenIndex].height += listingHeight;
  });

  return columns.map((column) => column.items);
}

export default function MasonryListingGrid({ listings }: { listings: ListingPublic[] }) {
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === "undefined") return 1;
    return getColumnCountForWidth(window.innerWidth);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setColumnCount(getColumnCountForWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const columns = useMemo(
    () => buildMasonryColumns(listings, columnCount),
    [listings, columnCount]
  );

  return (
    <div
      className="grid items-start gap-4"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))` }}
    >
      {columns.map((columnListings, columnIndex) => (
        <div key={`masonry-column-${columnIndex}`} className="flex flex-col gap-4">
          {columnListings.map((listing) => (
            <div key={listing.id} className="w-full">
              <ListingCard listing={listing} priceScale="double" titleScale="oneAndHalf" titleFont="heading" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
