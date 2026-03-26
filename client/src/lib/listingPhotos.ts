import { resolveAssetUrl } from "@/lib/runtimeUrls";

export const COVER_RATIO_OPTIONS = ["1:1", "4:5", "2:3", "9:16", "10:21"] as const;
export type CoverRatio = (typeof COVER_RATIO_OPTIONS)[number];

export const DEFAULT_COVER_RATIO: CoverRatio = "2:3";

function isLoadablePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) &&
    !value.toLowerCase().endsWith(".heic")
  );
}

export function normalizeCoverRatio(value: unknown): CoverRatio {
  if (typeof value !== "string") return DEFAULT_COVER_RATIO;
  return (COVER_RATIO_OPTIONS as readonly string[]).includes(value) ? (value as CoverRatio) : DEFAULT_COVER_RATIO;
}

export function coverRatioToAspectRatio(value: unknown): string {
  const ratio = normalizeCoverRatio(value);
  const [w, h] = ratio.split(":").map((n) => Number(n));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "2 / 3";
  return `${w} / ${h}`;
}

export function normalizePhotoToUrl(photo: any): string | undefined {
  if (typeof photo === "string") {
    return isLoadablePath(photo) ? resolveAssetUrl(photo) : undefined;
  }
  if (photo && typeof photo === "object") {
    const url = photo.url;
    if (isLoadablePath(url)) return resolveAssetUrl(url);

    const name = photo.name || photo.filename;
    if (typeof name === "string" && name.trim()) return resolveAssetUrl(`/uploads/listings/${name}`);
  }
  return undefined;
}

export function getListingPhotoUrls(listingAny: any): string[] {
  const photosFromApi = Array.isArray(listingAny?.photos)
    ? listingAny.photos
        .map((photo: any) => normalizePhotoToUrl(photo))
        .filter((url: unknown): url is string => typeof url === "string")
    : [];

  const listingData = listingAny?.listingData ?? {};
  const photosFromListingDataUrls = Array.isArray(listingData?.photos?.urls)
    ? listingData.photos.urls
        .filter((url: unknown): url is string => typeof url === "string")
        .map((url: string) => resolveAssetUrl(url))
    : [];
  const photosFromListingDataNames = Array.isArray(listingData?.photos?.names)
    ? listingData.photos.names
        .map((name: unknown) => (typeof name === "string" ? resolveAssetUrl(`/uploads/listings/${name}`) : null))
        .filter((url: unknown): url is string => typeof url === "string")
    : [];

  const merged = [...photosFromApi, ...photosFromListingDataUrls, ...photosFromListingDataNames];
  return Array.from(new Set(merged));
}

export function getCoverPhotoIndex(listingAny: any, photoUrls: string[]): number {
  if (!photoUrls.length) return 0;

  const listingData = listingAny?.listingData ?? {};
  const explicit = Number(listingData?.photos?.coverPhotoIndex);
  if (Number.isInteger(explicit) && explicit >= 0 && explicit < photoUrls.length) return explicit;

  const coverName = typeof listingData?.photos?.coverPhotoName === "string" ? listingData.photos.coverPhotoName : "";
  if (coverName) {
    const idx = photoUrls.findIndex((url) => url.endsWith(`/${coverName}`));
    if (idx >= 0) return idx;
  }

  const apiPhotos = Array.isArray(listingAny?.photos) ? listingAny.photos : [];
  const apiCoverIndex = apiPhotos.findIndex((photo: any) => photo && typeof photo === "object" && photo.isCover === true);
  if (apiCoverIndex >= 0 && apiCoverIndex < photoUrls.length) return apiCoverIndex;

  return 0;
}

export function moveCoverToFront(photoUrls: string[], coverIndex: number): string[] {
  if (!photoUrls.length) return [];
  const safeIndex = Math.min(Math.max(coverIndex, 0), photoUrls.length - 1);
  const cover = photoUrls[safeIndex];
  const rest = photoUrls.filter((_, idx) => idx !== safeIndex);
  return [cover, ...rest];
}

export function getCoverPhotoRatio(listingAny: any): CoverRatio {
  const listingData = listingAny?.listingData ?? {};
  return normalizeCoverRatio(listingData?.photos?.coverPhotoRatio);
}
