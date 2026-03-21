import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ListingCard from "@/components/ListingCard";
import type { ListingPublic } from "@/types/listing";
import { getCoverPhotoRatio } from "@/lib/listingPhotos";

const GRID_GAP_PX = 16;

function getColumnCountForWidth(width: number, twoColumnMinWidthPx: number): number {
  if (width >= 1536) return 5;
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  if (width >= twoColumnMinWidthPx) return 2;
  return 1;
}

function getColumnCountForMinCardWidth(width: number, minCardWidthPx: number, maxColumns?: number): number {
  const safeWidth = Math.max(0, Math.floor(width));
  const safeMinCardWidth = Math.max(1, Math.floor(minCardWidthPx));
  const maxThatCanFit = Math.max(1, Math.floor((safeWidth + GRID_GAP_PX) / (safeMinCardWidth + GRID_GAP_PX)));
  const requestedMaxColumns =
    typeof maxColumns === "number" && Number.isFinite(maxColumns) && maxColumns >= 1
      ? Math.floor(maxColumns)
      : maxThatCanFit;
  const candidateMax = Math.max(1, Math.min(maxThatCanFit, requestedMaxColumns));

  for (let columns = candidateMax; columns >= 1; columns -= 1) {
    const requiredWidth = columns * safeMinCardWidth + (columns - 1) * GRID_GAP_PX;
    if (safeWidth >= requiredWidth || columns === 1) {
      return columns;
    }
  }

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
    listingAny.title ??
      listingAny.listingData?.listingTitle ??
      listingAny.serviceType ??
      "Listing"
  );
  const ratio = getCoverPhotoRatio(listingAny);
  const imageWeight = ratioToHeightFactor(ratio) * 100;
  const titleWeight = title.length > 24 ? 24 : 0;
  // Fixed content block under image (title + price row + spacing).
  return imageWeight + titleWeight + 72;
}

function buildSequentialColumns(listings: ListingPublic[], requestedColumns: number): ListingPublic[][] {
  const columnCount = Math.max(1, requestedColumns);
  const columns = Array.from({ length: columnCount }, () => [] as ListingPublic[]);

  listings.forEach((listing, index) => {
    columns[index % columnCount].push(listing);
  });

  return columns;
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

type MasonryListingGridProps = {
  listings: ListingPublic[];
  maxColumns?: number;
  desktopColumns?: number;
  preserveInputOrder?: boolean;
  cardMaxWidthPx?: number;
  twoColumnMinWidthPx?: number;
  minCardWidthPx?: number;
  renderCard?: (listing: ListingPublic) => ReactNode;
};

export default function MasonryListingGrid({
  listings,
  maxColumns,
  desktopColumns,
  preserveInputOrder,
  cardMaxWidthPx,
  twoColumnMinWidthPx,
  minCardWidthPx,
  renderCard,
}: MasonryListingGridProps) {
  const normalizedTwoColumnMinWidthPx =
    typeof twoColumnMinWidthPx === "number" && Number.isFinite(twoColumnMinWidthPx) && twoColumnMinWidthPx > 0
      ? Math.floor(twoColumnMinWidthPx)
      : 640;
  const normalizedMinCardWidthPx =
    typeof minCardWidthPx === "number" && Number.isFinite(minCardWidthPx) && minCardWidthPx > 0
      ? Math.floor(minCardWidthPx)
      : null;

  const resolveColumnCount = (viewportWidth: number, availableWidth: number | null) => {
    if (normalizedMinCardWidthPx != null) {
      return getColumnCountForMinCardWidth(
        availableWidth ?? viewportWidth,
        normalizedMinCardWidthPx,
        maxColumns
      );
    }

    const byWidth =
      typeof desktopColumns === "number" &&
      Number.isFinite(desktopColumns) &&
      desktopColumns >= 1 &&
      viewportWidth >= 1024
        ? Math.floor(desktopColumns)
        : getColumnCountForWidth(viewportWidth, normalizedTwoColumnMinWidthPx);

    if (typeof maxColumns !== "number" || !Number.isFinite(maxColumns) || maxColumns < 1) {
      return byWidth;
    }
    return Math.min(byWidth, Math.floor(maxColumns));
  };
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridWidthPx, setGridWidthPx] = useState<number | null>(null);

  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === "undefined") return 1;
    return resolveColumnCount(window.innerWidth, null);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const node = gridRef.current;
    if (!node) return;

    const updateWidth = () => {
      const next = Math.floor(node.getBoundingClientRect().width);
      setGridWidthPx(next > 0 ? next : null);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setColumnCount(resolveColumnCount(window.innerWidth, gridWidthPx));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [desktopColumns, maxColumns, normalizedTwoColumnMinWidthPx, normalizedMinCardWidthPx, gridWidthPx]);

  const effectiveColumnCount = Math.max(1, Math.min(columnCount, Math.max(1, listings.length)));
  const columns = useMemo(
    () =>
      preserveInputOrder
        ? buildSequentialColumns(listings, effectiveColumnCount)
        : buildMasonryColumns(listings, effectiveColumnCount),
    [listings, effectiveColumnCount, preserveInputOrder]
  );
  const normalizedCardMaxWidthPx =
    typeof cardMaxWidthPx === "number" && Number.isFinite(cardMaxWidthPx) && cardMaxWidthPx > 0
      ? Math.floor(cardMaxWidthPx)
      : null;
  const cardMaxWidthForCurrentLayout = normalizedCardMaxWidthPx;
  const useFixedWidthColumns = cardMaxWidthForCurrentLayout != null && columns.length > 1;
  const gridTemplateColumns = useFixedWidthColumns
    ? `repeat(${Math.max(1, columns.length)}, minmax(0, ${cardMaxWidthForCurrentLayout}px))`
    : `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`;

  return (
    <div
      ref={gridRef}
      className="grid items-start"
      style={{
        gridTemplateColumns,
        columnGap: `${GRID_GAP_PX}px`,
        rowGap: `${GRID_GAP_PX}px`,
        ...(useFixedWidthColumns ? { justifyContent: "start" as const } : {}),
      }}
    >
      {columns.map((columnListings, columnIndex) => (
        <div
          key={`masonry-column-${columnIndex}`}
          className="flex flex-col"
          style={{ rowGap: `${GRID_GAP_PX}px` }}
        >
          {columnListings.map((listing) => (
            <div
              key={listing.id}
              className={`w-full ${cardMaxWidthForCurrentLayout ? "mx-auto" : ""}`}
              style={
                cardMaxWidthForCurrentLayout
                  ? {
                      maxWidth: `${cardMaxWidthForCurrentLayout}px`,
                    }
                  : undefined
              }
            >
              {renderCard ? (
                renderCard(listing)
              ) : (
                <ListingCard listing={listing} priceScale="double" titleScale="oneAndHalf" titleFont="heading" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
