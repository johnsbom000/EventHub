import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Copy, Eye, ImagePlus, Trash2 } from "lucide-react";

import VendorShell from "@/components/VendorShell";
import ListingCard from "@/components/ListingCard";
import MasonryListingGrid from "@/components/MasonryListingGrid";
import { apiRequest } from "@/lib/queryClient";
import { getFreshAccessToken } from "@/lib/authToken";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import HobbyPillInput from "@/components/HobbyPillInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ListingPublic } from "@/types/listing";
import { serializeHobbyList } from "@shared/hobby-tags";

const ACCEPTED_SHOP_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_SHOP_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_SHOP_PHOTO_SOURCE_BYTES = 20 * 1024 * 1024;
const SHOP_PHOTO_MAX_DIMENSION = 1024;
const SHOP_PHOTO_TARGET_BYTES = 450 * 1024;
const SHOP_PHOTO_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58];
const SHOP_PHOTO_OUTPUT_SIZE = 512;
const SHOP_PHOTO_EDITOR_PREVIEW_SIZE = 64;
const SHOP_PHOTO_MODAL_PREVIEW_SIZE = 224;
const VENDOR_HUB_COVER_MIN_HEIGHT = 280;
const VENDOR_HUB_COVER_MAX_HEIGHT = 520;
const VENDOR_HUB_COVER_VW_MULTIPLIER = 0.42;
const COVER_PHOTO_MODAL_PREVIEW_WIDTH = 500;

type ShopPhotoPosition = {
  x: number;
  y: number;
};

type ShopPhotoSource = {
  src: string;
  width: number;
  height: number;
};

type PhotoBounds = {
  renderWidth: number;
  renderHeight: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

type VendorMe = {
  id: string;
  businessName?: string | null;
  hasVendorAccount?: boolean | null;
};

type VendorProfile = {
  profileName?: string | null;
  serviceDescription?: string | null;
  city?: string | null;
  serviceRadius?: number | null;
  onlineProfiles?: Record<string, unknown> | null;
};

type VendorListing = {
  id: string;
  title?: string | null;
  listingData?: unknown;
  city?: string | null;
  serviceType?: string | null;
  accountId?: string | null;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProfileNameInput(value: string) {
  const cleaned = (value || "")
    .replace(/[’]/g, "'")
    .replace(/[^a-zA-Z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function getInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "S";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function normalizeSpecialtiesInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 24)
    )
  );
}

function toNonNegativeIntString(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0";
  return String(Math.max(0, Math.floor(parsed)));
}

function normalizeOptionalNonNegativeIntString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return toNonNegativeIntString(trimmed);
}

function getVendorHubCoverHeightForViewport(viewportWidth: number): number {
  const width = Math.max(1, viewportWidth);
  const preferred = width * VENDOR_HUB_COVER_VW_MULTIPLIER;
  return clamp(preferred, VENDOR_HUB_COVER_MIN_HEIGHT, VENDOR_HUB_COVER_MAX_HEIGHT);
}

function getVendorHubCoverAspectRatioForViewport(viewportWidth: number): number {
  const width = Math.max(1, viewportWidth);
  const height = getVendorHubCoverHeightForViewport(width);
  return width / Math.max(1, height);
}

function parsePhotoPosition(value: unknown): ShopPhotoPosition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { x: 0, y: 0 };
  }

  const rawX = Number((value as { x?: unknown }).x);
  const rawY = Number((value as { y?: unknown }).y);
  return {
    x: Number.isFinite(rawX) ? clamp(rawX, -1, 1) : 0,
    y: Number.isFinite(rawY) ? clamp(rawY, -1, 1) : 0,
  };
}

function toObjectPositionValue(position: ShopPhotoPosition): string {
  const x = 50 - clamp(position.x, -1, 1) * 50;
  const y = 50 - clamp(position.y, -1, 1) * 50;
  return `${x}% ${y}%`;
}

function getPhotoBoundsForFrame(
  source: ShopPhotoSource,
  frameWidth: number,
  frameHeight: number,
  scaleMultiplier = 1,
): PhotoBounds {
  const width = Math.max(1, frameWidth);
  const height = Math.max(1, frameHeight);
  const scale = Math.max(width / source.width, height / source.height);
  const renderWidth = source.width * scale * Math.max(1, scaleMultiplier);
  const renderHeight = source.height * scale * Math.max(1, scaleMultiplier);

  return {
    renderWidth,
    renderHeight,
    maxOffsetX: Math.max(0, (renderWidth - width) / 2),
    maxOffsetY: Math.max(0, (renderHeight - height) / 2),
  };
}

function getPhotoBounds(source: ShopPhotoSource, frameSize: number, scaleMultiplier = 1): PhotoBounds {
  return getPhotoBoundsForFrame(source, frameSize, frameSize, scaleMultiplier);
}

function getPhotoOffsets(bounds: PhotoBounds, position: ShopPhotoPosition) {
  return {
    x: bounds.maxOffsetX === 0 ? 0 : clamp(position.x, -1, 1) * bounds.maxOffsetX,
    y: bounds.maxOffsetY === 0 ? 0 : clamp(position.y, -1, 1) * bounds.maxOffsetY,
  };
}

function normalizePositionFromOffsets(bounds: PhotoBounds, offsetX: number, offsetY: number): ShopPhotoPosition {
  return {
    x: bounds.maxOffsetX === 0 ? 0 : clamp(offsetX / bounds.maxOffsetX, -1, 1),
    y: bounds.maxOffsetY === 0 ? 0 : clamp(offsetY / bounds.maxOffsetY, -1, 1),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = src;
  });
}

function buildResizedCanvas(image: HTMLImageElement) {
  const maxDimension = Math.max(image.width, image.height);
  const scale = maxDimension > SHOP_PHOTO_MAX_DIMENSION ? SHOP_PHOTO_MAX_DIMENSION / maxDimension : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas;
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

  if (maxX < minX || maxY < minY) {
    return canvas;
  }

  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
    return canvas;
  }

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

function pickSmallestEncodedDataUrl(canvas: HTMLCanvasElement, quality: number) {
  const jpeg = canvas.toDataURL("image/jpeg", quality);
  const webp = canvas.toDataURL("image/webp", quality);
  if (!webp.startsWith("data:image/webp")) {
    return jpeg;
  }
  return estimateDataUrlBytes(webp) <= estimateDataUrlBytes(jpeg) ? webp : jpeg;
}

function encodeCanvasForTarget(canvas: HTMLCanvasElement, targetBytes: number) {
  let bestDataUrl = pickSmallestEncodedDataUrl(canvas, SHOP_PHOTO_QUALITIES[0]);
  let bestBytes = estimateDataUrlBytes(bestDataUrl);
  if (bestBytes <= targetBytes) return bestDataUrl;

  for (const quality of SHOP_PHOTO_QUALITIES.slice(1)) {
    const candidate = pickSmallestEncodedDataUrl(canvas, quality);
    const candidateBytes = estimateDataUrlBytes(candidate);
    if (candidateBytes < bestBytes) {
      bestDataUrl = candidate;
      bestBytes = candidateBytes;
    }
    if (candidateBytes <= targetBytes) {
      return candidate;
    }
  }

  return bestDataUrl;
}

async function optimizeShopPhoto(file: File): Promise<ShopPhotoSource> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const canvas = trimTransparentCanvas(buildResizedCanvas(image));
  const dataUrl = encodeCanvasForTarget(canvas, SHOP_PHOTO_TARGET_BYTES);
  return {
    src: dataUrl,
    width: canvas.width,
    height: canvas.height,
  };
}

async function createShopPhotoSourceFromSrc(src: string): Promise<ShopPhotoSource> {
  const image = await loadImage(src);
  const canvas = trimTransparentCanvas(buildResizedCanvas(image));
  const normalizedSrc = encodeCanvasForTarget(canvas, SHOP_PHOTO_TARGET_BYTES);
  return {
    src: normalizedSrc,
    width: canvas.width,
    height: canvas.height,
  };
}

async function buildCroppedShopPhotoDataUrl(
  source: ShopPhotoSource,
  position: ShopPhotoPosition,
  scaleMultiplier: number,
): Promise<string> {
  const image = await loadImage(source.src);
  const canvas = document.createElement("canvas");
  canvas.width = SHOP_PHOTO_OUTPUT_SIZE;
  canvas.height = SHOP_PHOTO_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image");
  }

  const bounds = getPhotoBounds(source, SHOP_PHOTO_OUTPUT_SIZE, scaleMultiplier);
  const offsets = getPhotoOffsets(bounds, position);
  const drawX = (SHOP_PHOTO_OUTPUT_SIZE - bounds.renderWidth) / 2 + offsets.x;
  const drawY = (SHOP_PHOTO_OUTPUT_SIZE - bounds.renderHeight) / 2 + offsets.y;
  context.drawImage(image, drawX, drawY, bounds.renderWidth, bounds.renderHeight);

  return encodeCanvasForTarget(canvas, SHOP_PHOTO_TARGET_BYTES);
}

async function uploadShopPhotoDataUrl(dataUrl: string): Promise<string> {
  const token = await getFreshAccessToken();
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const extension = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  const file = new File([blob], `shop-photo-${Date.now()}.${extension}`, { type: blob.type || "image/jpeg" });
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch("/api/uploads/vendor-shop-photo", {
    method: "POST",
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Upload failed (${response.status})`);
  }

  const nextUrl = asTrimmedString(payload?.url);
  if (!nextUrl) {
    throw new Error("Upload response did not include a valid image URL.");
  }

  return nextUrl;
}

export default function MyHub() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const shopPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const shopPhotoDragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosition: ShopPhotoPosition;
    startScale: number;
    frameSize: number;
  } | null>(null);
  const coverPhotoDragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosition: ShopPhotoPosition;
    frameWidth: number;
    frameHeight: number;
  } | null>(null);

  const { data: vendorMe, isLoading: isVendorLoading } = useQuery<VendorMe | null>({
    queryKey: ["/api/vendor/me", "vendor-shop-page"],
    retry: 1,
    queryFn: async () => {
      const token = await getFreshAccessToken();
      const res = await fetch("/api/vendor/me", {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load vendor account (${res.status})`);
      return res.json();
    },
  });

  const { data: vendorProfile, isLoading: isProfileLoading } = useQuery<VendorProfile | null>({
    queryKey: ["/api/vendor/profile", "vendor-shop"],
    retry: false,
    queryFn: async () => {
      const token = await getFreshAccessToken();
      const res = await fetch("/api/vendor/profile", {
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load vendor profile (${res.status})`);
      return res.json();
    },
  });

  const { data: activeListings = [], isLoading: isListingsLoading } = useQuery<VendorListing[]>({
    queryKey: ["/api/vendor/listings", "active", "vendor-shop"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/listings?status=active");
      return res.json();
    },
  });

  const [businessNameDraft, setBusinessNameDraft] = useState("");
  const [aboutBusinessDraft, setAboutBusinessDraft] = useState("");
  const [aboutOwnerDraft, setAboutOwnerDraft] = useState("");
  const [taglineDraft, setTaglineDraft] = useState("");
  const [serviceAreaDraft, setServiceAreaDraft] = useState("");
  const [serviceRadiusMilesDraft, setServiceRadiusMilesDraft] = useState("");
  const [inBusinessSinceYearDraft, setInBusinessSinceYearDraft] = useState("");
  const [specialtiesDraft, setSpecialtiesDraft] = useState("");
  const [eventsServedBaselineDraft, setEventsServedBaselineDraft] = useState("0");
  const [hobbiesDraft, setHobbiesDraft] = useState("");
  const [likesDislikesDraft, setLikesDislikesDraft] = useState("");
  const [homeStateDraft, setHomeStateDraft] = useState("");
  const [funFactsDraft, setFunFactsDraft] = useState("");
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));

  const [coverPhotoSource, setCoverPhotoSource] = useState<ShopPhotoSource | null>(null);
  const [coverPhotoPosition, setCoverPhotoPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [editorCoverPhotoSource, setEditorCoverPhotoSource] = useState<ShopPhotoSource | null>(null);
  const [editorCoverPhotoPosition, setEditorCoverPhotoPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [coverEditorRequiresUpload, setCoverEditorRequiresUpload] = useState(false);
  const [coverPhotoNeedsUpload, setCoverPhotoNeedsUpload] = useState(false);
  const [isCoverPhotoEditorOpen, setIsCoverPhotoEditorOpen] = useState(false);
  const [isPreparingCoverPhoto, setIsPreparingCoverPhoto] = useState(false);
  const [coverPhotoDirty, setCoverPhotoDirty] = useState(false);

  const [shopPhotoSource, setShopPhotoSource] = useState<ShopPhotoSource | null>(null);
  const [shopPhotoPosition, setShopPhotoPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [shopPhotoScale, setShopPhotoScale] = useState(1);
  const [editorPhotoPosition, setEditorPhotoPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [editorPhotoScale, setEditorPhotoScale] = useState(1);
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [shopPhotoDirty, setShopPhotoDirty] = useState(false);
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const vendorHubCoverAspectRatio = useMemo(
    () => getVendorHubCoverAspectRatioForViewport(viewportWidth),
    [viewportWidth],
  );
  const coverPhotoModalPreviewHeight = useMemo(
    () => Math.round(COVER_PHOTO_MODAL_PREVIEW_WIDTH / vendorHubCoverAspectRatio),
    [vendorHubCoverAspectRatio],
  );

  const onlineProfiles = useMemo(() => {
    const raw = vendorProfile?.onlineProfiles;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {} as Record<string, unknown>;
  }, [vendorProfile?.onlineProfiles]);

  const persistedAboutBusiness = useMemo(() => {
    const fromOnline = asTrimmedString(onlineProfiles.aboutBusiness);
    if (fromOnline) return fromOnline;
    return asTrimmedString(vendorProfile?.serviceDescription);
  }, [onlineProfiles, vendorProfile?.serviceDescription]);
  const persistedProfileBusinessName = useMemo(() => {
    const fromOnline = asTrimmedString(onlineProfiles.profileBusinessName);
    if (fromOnline) return fromOnline;
    const fromProfile = asTrimmedString(vendorProfile?.profileName);
    if (fromProfile) return fromProfile;
    return asTrimmedString(vendorMe?.businessName);
  }, [onlineProfiles, vendorProfile?.profileName, vendorMe?.businessName]);

  const persistedAboutOwner = asTrimmedString(onlineProfiles.aboutOwner);
  const persistedTagline = asTrimmedString(onlineProfiles.shopTagline);
  const persistedServiceArea = asTrimmedString(onlineProfiles.serviceAreaLabel);
  const serviceAreaCityFallback =
    asTrimmedString(onlineProfiles.city) || asTrimmedString(vendorProfile?.city);
  const serviceAreaStateFallback =
    asTrimmedString(onlineProfiles.state) || asTrimmedString(onlineProfiles.homeState);
  const defaultServiceAreaFromOnboarding = useMemo(() => {
    if (serviceAreaCityFallback && serviceAreaStateFallback) {
      return `${serviceAreaCityFallback}, ${serviceAreaStateFallback}`;
    }
    return serviceAreaCityFallback || serviceAreaStateFallback;
  }, [serviceAreaCityFallback, serviceAreaStateFallback]);
  const effectivePersistedServiceArea = persistedServiceArea || defaultServiceAreaFromOnboarding;
  const persistedServiceRadiusMiles = useMemo(() => {
    const raw = Number(vendorProfile?.serviceRadius);
    if (!Number.isFinite(raw) || raw <= 0) return "";
    return String(Math.floor(raw));
  }, [vendorProfile?.serviceRadius]);
  const persistedInBusinessSinceYear = asTrimmedString(onlineProfiles.inBusinessSinceYear);
  const persistedSpecialties = Array.isArray(onlineProfiles.specialties)
    ? (onlineProfiles.specialties as unknown[])
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
    : normalizeSpecialtiesInput(asTrimmedString(onlineProfiles.specialties));
  const persistedEventsServedBaseline = (() => {
    const parsed = Number(onlineProfiles.eventsServedBaseline);
    if (!Number.isFinite(parsed)) return "0";
    return String(Math.max(0, Math.floor(parsed)));
  })();
  const persistedHobbies = serializeHobbyList(onlineProfiles.hobbies);
  const persistedLikesDislikes = asTrimmedString(onlineProfiles.likesDislikes);
  const persistedHomeState = asTrimmedString(onlineProfiles.homeState);
  const persistedFunFacts = asTrimmedString(onlineProfiles.funFacts);
  const persistedProfileImageUrl = asTrimmedString(onlineProfiles.shopProfileImageUrl);
  const persistedCoverImageUrl = asTrimmedString(onlineProfiles.shopCoverImageUrl);
  const persistedCoverPhotoPosition = parsePhotoPosition(onlineProfiles.shopCoverImagePosition);

  useEffect(() => {
    setBusinessNameDraft(persistedProfileBusinessName);
  }, [persistedProfileBusinessName]);

  useEffect(() => {
    setAboutBusinessDraft(persistedAboutBusiness);
  }, [persistedAboutBusiness]);

  useEffect(() => {
    setAboutOwnerDraft(persistedAboutOwner);
  }, [persistedAboutOwner]);

  useEffect(() => {
    setTaglineDraft(persistedTagline);
  }, [persistedTagline]);

  useEffect(() => {
    setServiceAreaDraft(effectivePersistedServiceArea);
  }, [effectivePersistedServiceArea]);

  useEffect(() => {
    setServiceRadiusMilesDraft(persistedServiceRadiusMiles);
  }, [persistedServiceRadiusMiles]);

  useEffect(() => {
    setInBusinessSinceYearDraft(persistedInBusinessSinceYear);
  }, [persistedInBusinessSinceYear]);

  useEffect(() => {
    setSpecialtiesDraft(persistedSpecialties.join(", "));
  }, [persistedSpecialties]);

  useEffect(() => {
    setEventsServedBaselineDraft(persistedEventsServedBaseline);
  }, [persistedEventsServedBaseline]);

  useEffect(() => {
    setHobbiesDraft(persistedHobbies);
  }, [persistedHobbies]);

  useEffect(() => {
    setLikesDislikesDraft(persistedLikesDislikes);
  }, [persistedLikesDislikes]);

  useEffect(() => {
    setHomeStateDraft(persistedHomeState);
  }, [persistedHomeState]);

  useEffect(() => {
    setFunFactsDraft(persistedFunFacts);
  }, [persistedFunFacts]);

  useEffect(() => {
    let cancelled = false;
    if (!persistedProfileImageUrl) {
      setShopPhotoSource(null);
      setShopPhotoPosition({ x: 0, y: 0 });
      setShopPhotoScale(1);
      setShopPhotoDirty(false);
      return () => {
        cancelled = true;
      };
    }

    createShopPhotoSourceFromSrc(persistedProfileImageUrl)
      .then((source) => {
        if (cancelled) return;
        setShopPhotoSource(source);
        setShopPhotoPosition({ x: 0, y: 0 });
        setShopPhotoScale(1);
        setShopPhotoDirty(false);
      })
      .catch(() => {
        if (cancelled) return;
        setShopPhotoSource(null);
        setShopPhotoPosition({ x: 0, y: 0 });
        setShopPhotoScale(1);
        setShopPhotoDirty(false);
      });

    return () => {
      cancelled = true;
    };
  }, [persistedProfileImageUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!persistedCoverImageUrl) {
      setCoverPhotoSource(null);
      setCoverPhotoPosition({ x: 0, y: 0 });
      setEditorCoverPhotoSource(null);
      setEditorCoverPhotoPosition({ x: 0, y: 0 });
      setCoverEditorRequiresUpload(false);
      setCoverPhotoNeedsUpload(false);
      setIsCoverPhotoEditorOpen(false);
      setCoverPhotoDirty(false);
      return () => {
        cancelled = true;
      };
    }

    createShopPhotoSourceFromSrc(persistedCoverImageUrl)
      .then((source) => {
        if (cancelled) return;
        setCoverPhotoSource(source);
        setCoverPhotoPosition(persistedCoverPhotoPosition);
        setCoverPhotoNeedsUpload(false);
        setCoverPhotoDirty(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCoverPhotoSource(null);
        setCoverPhotoPosition({ x: 0, y: 0 });
        setCoverPhotoNeedsUpload(false);
        setCoverPhotoDirty(false);
      });

    return () => {
      cancelled = true;
    };
  }, [persistedCoverImageUrl, persistedCoverPhotoPosition.x, persistedCoverPhotoPosition.y]);

  const vendorId = asTrimmedString(vendorMe?.id) || asTrimmedString((vendorProfile as any)?.accountId);
  const publicShopPath = vendorId ? `/shop/${vendorId}` : "";
  const publicShopUrl =
    typeof window !== "undefined" && publicShopPath ? `${window.location.origin}${publicShopPath}` : publicShopPath;

  const livePreviewShopImageUrl = shopPhotoSource?.src || "";

  const listingsForShop: ListingPublic[] = useMemo(() => {
    const fallbackVendorName = asTrimmedString(businessNameDraft) || persistedProfileBusinessName || "Vendor";

    return (Array.isArray(activeListings) ? activeListings : []).map((listing) => ({
      ...(listing as any),
      id: listing.id,
      vendorId: vendorId || String(listing.accountId || ""),
      vendorName: fallbackVendorName,
      vendorProfileImageUrl: livePreviewShopImageUrl || null,
      serviceType: String((listing as any)?.serviceType ?? (listing as any)?.listingData?.serviceType ?? ""),
      city: String((listing as any)?.city ?? ""),
      travelMode: "travel-to-guests",
      serviceRadius: 0,
      photos: [] as any,
      serviceDescription: "",
      offerings: [] as any,
      businessHours: [] as any,
      discounts: [] as any,
    }));
  }, [activeListings, businessNameDraft, vendorId, persistedProfileBusinessName, livePreviewShopImageUrl]);

  const hasChanges =
    asTrimmedString(businessNameDraft) !== persistedProfileBusinessName ||
    asTrimmedString(aboutBusinessDraft) !== persistedAboutBusiness ||
    asTrimmedString(aboutOwnerDraft) !== persistedAboutOwner ||
    asTrimmedString(taglineDraft) !== persistedTagline ||
    asTrimmedString(serviceAreaDraft) !== effectivePersistedServiceArea ||
    normalizeOptionalNonNegativeIntString(serviceRadiusMilesDraft) !== persistedServiceRadiusMiles ||
    asTrimmedString(inBusinessSinceYearDraft) !== persistedInBusinessSinceYear ||
    normalizeSpecialtiesInput(specialtiesDraft).join("|") !== persistedSpecialties.join("|") ||
    toNonNegativeIntString(eventsServedBaselineDraft) !== persistedEventsServedBaseline ||
    serializeHobbyList(hobbiesDraft) !== persistedHobbies ||
    asTrimmedString(likesDislikesDraft) !== persistedLikesDislikes ||
    asTrimmedString(homeStateDraft) !== persistedHomeState ||
    asTrimmedString(funFactsDraft) !== persistedFunFacts ||
    shopPhotoDirty ||
    coverPhotoDirty;

  const getValidationErrorMessage = () => {
    if (!asTrimmedString(businessNameDraft)) return "Business name is required.";
    if (!asTrimmedString(aboutBusinessDraft)) return "About the business is required.";
    if (!asTrimmedString(serviceAreaDraft)) return "Service area is required.";
    if (!asTrimmedString(inBusinessSinceYearDraft)) return "In business since year is required.";
    if (!asTrimmedString(eventsServedBaselineDraft)) return "Events served is required.";
    if (!shopPhotoSource) return "Profile photo is required.";
    return "";
  };

  useEffect(() => {
    if (!validationError) return;
    const nextValidation = getValidationErrorMessage();
    if (!nextValidation) {
      setValidationError("");
    }
  }, [
    validationError,
    businessNameDraft,
    aboutBusinessDraft,
    serviceAreaDraft,
    inBusinessSinceYearDraft,
    eventsServedBaselineDraft,
    shopPhotoSource,
  ]);

  const saveShopPhotoMutation = useMutation({
    mutationFn: async ({ nextShopProfileImageUrl }: { nextShopProfileImageUrl: string }) => {
      if (!vendorProfile) {
        throw new Error("Vendor profile not found. Please complete onboarding first.");
      }

      const existingOnlineProfiles =
        vendorProfile.onlineProfiles && typeof vendorProfile.onlineProfiles === "object"
          ? (vendorProfile.onlineProfiles as Record<string, unknown>)
          : {};

      const token = await getFreshAccessToken();
      const profileResponse = await fetch("/api/vendor/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          onlineProfiles: {
            ...existingOnlineProfiles,
            shopProfileImageUrl: nextShopProfileImageUrl,
          },
        }),
      });

      if (!profileResponse.ok) {
        const payload = await profileResponse.json().catch(() => ({} as Record<string, unknown>));
        const details = Array.isArray((payload as any)?.details) ? (payload as any).details : [];
        const firstDetail = details.find((detail: any) => typeof detail?.message === "string")?.message;
        throw new Error(firstDetail || String((payload as any)?.error || `Failed to update profile (${profileResponse.status})`));
      }

      return {
        nextShopProfileImageUrl,
      };
    },
    onSuccess: async ({ nextShopProfileImageUrl }) => {
      setShopPhotoDirty(false);
      if (!nextShopProfileImageUrl) {
        setShopPhotoSource(null);
        setShopPhotoPosition({ x: 0, y: 0 });
        setShopPhotoScale(1);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "active", "vendor-shop"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendors/public/shop", vendorId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/listings/public"] }),
      ]);
    },
    onError: (error: any) => {
      toast({
        title: "Could not update shop photo",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextBusinessName = asTrimmedString(businessNameDraft);
      const validationMessage = getValidationErrorMessage();
      if (validationMessage) {
        throw new Error(validationMessage);
      }

      if (!vendorProfile) {
        throw new Error("Vendor profile not found. Please complete onboarding first.");
      }

      let nextShopProfileImageUrl = persistedProfileImageUrl;
      let nextShopCoverImageUrl = persistedCoverImageUrl;
      let nextShopCoverImagePosition: ShopPhotoPosition | null = persistedCoverPhotoPosition;

      if (shopPhotoDirty) {
        if (shopPhotoSource) {
          const croppedDataUrl = await buildCroppedShopPhotoDataUrl(shopPhotoSource, shopPhotoPosition, shopPhotoScale);
          if (estimateDataUrlBytes(croppedDataUrl) > MAX_SHOP_PHOTO_BYTES) {
            throw new Error("Optimized shop photo must be 2MB or less.");
          }
          setIsUploadingPhoto(true);
          nextShopProfileImageUrl = await uploadShopPhotoDataUrl(croppedDataUrl);
          setIsUploadingPhoto(false);
        } else {
          nextShopProfileImageUrl = "";
        }
      }

      if (coverPhotoDirty) {
        if (coverPhotoSource) {
          if (coverPhotoNeedsUpload || !persistedCoverImageUrl) {
            if (estimateDataUrlBytes(coverPhotoSource.src) > MAX_SHOP_PHOTO_BYTES) {
              throw new Error("Optimized cover photo must be 2MB or less.");
            }
            setIsUploadingPhoto(true);
            nextShopCoverImageUrl = await uploadShopPhotoDataUrl(coverPhotoSource.src);
            setIsUploadingPhoto(false);
          }
          nextShopCoverImagePosition = {
            x: clamp(coverPhotoPosition.x, -1, 1),
            y: clamp(coverPhotoPosition.y, -1, 1),
          };
        } else {
          nextShopCoverImageUrl = "";
          nextShopCoverImagePosition = null;
        }
      }

      const existingOnlineProfiles =
        vendorProfile.onlineProfiles && typeof vendorProfile.onlineProfiles === "object"
          ? (vendorProfile.onlineProfiles as Record<string, unknown>)
          : {};
      const normalizedSpecialties = normalizeSpecialtiesInput(specialtiesDraft);
      const eventsServedBaseline = toNonNegativeIntString(eventsServedBaselineDraft);
      const normalizedServiceRadius = normalizeOptionalNonNegativeIntString(serviceRadiusMilesDraft);

      const token = await getFreshAccessToken();
      const profileResponse = await fetch("/api/vendor/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          profileName: nextBusinessName,
          serviceDescription: asTrimmedString(aboutBusinessDraft),
          serviceRadius: normalizedServiceRadius ? Number(normalizedServiceRadius) : null,
          onlineProfiles: {
            ...existingOnlineProfiles,
            profileBusinessName: nextBusinessName,
            aboutBusiness: asTrimmedString(aboutBusinessDraft),
            aboutOwner: asTrimmedString(aboutOwnerDraft),
            shopTagline: asTrimmedString(taglineDraft),
            serviceAreaLabel: asTrimmedString(serviceAreaDraft),
            inBusinessSinceYear: asTrimmedString(inBusinessSinceYearDraft),
            specialties: normalizedSpecialties,
            eventsServedBaseline: Number(eventsServedBaseline),
            hobbies: serializeHobbyList(hobbiesDraft),
            likesDislikes: asTrimmedString(likesDislikesDraft),
            homeState: asTrimmedString(homeStateDraft),
            funFacts: asTrimmedString(funFactsDraft),
            shopProfileImageUrl: nextShopProfileImageUrl,
            shopCoverImageUrl: nextShopCoverImageUrl,
            ...(coverPhotoDirty ? { shopCoverImagePosition: nextShopCoverImagePosition } : {}),
          },
        }),
      });

      if (!profileResponse.ok) {
        const payload = await profileResponse.json().catch(() => ({} as Record<string, unknown>));
        const details = Array.isArray((payload as any)?.details) ? (payload as any).details : [];
        const firstDetail = details.find((detail: any) => typeof detail?.message === "string")?.message;
        throw new Error(firstDetail || String((payload as any)?.error || `Failed to update profile (${profileResponse.status})`));
      }

      return {
        nextShopProfileImageUrl,
        nextShopCoverImageUrl,
      };
    },
    onSuccess: async ({ nextShopProfileImageUrl, nextShopCoverImageUrl }) => {
      setValidationError("");
      setShopPhotoDirty(false);
      setCoverPhotoDirty(false);
      setCoverPhotoNeedsUpload(false);
      setCoverEditorRequiresUpload(false);
      if (!nextShopProfileImageUrl) {
        setShopPhotoSource(null);
        setShopPhotoPosition({ x: 0, y: 0 });
        setShopPhotoScale(1);
      }
      if (!nextShopCoverImageUrl) {
        setCoverPhotoSource(null);
        setCoverPhotoPosition({ x: 0, y: 0 });
        setCoverPhotoNeedsUpload(false);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "active", "vendor-shop"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendors/public/shop", vendorId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/listings/public"] }),
      ]);

      toast({
        title: "My Hub updated",
        description: "Your shared shop details now match across Event Hub.",
        duration: 4000,
      });
    },
    onError: (error: any) => {
      setIsUploadingPhoto(false);
      setValidationError(error?.message || "Please review required fields.");
      toast({
        title: "Could not save My Hub",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCopyPublicLink = async () => {
    if (!publicShopUrl) return;

    try {
      await navigator.clipboard.writeText(publicShopUrl);
      toast({
        title: "Shop link copied",
        description: "You can share this link on social media.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the link from the browser address bar.",
        variant: "destructive",
      });
    }
  };

  const persistShopPhoto = async (
    nextSource: ShopPhotoSource | null,
    nextPosition: ShopPhotoPosition,
    nextScale: number,
  ) => {
    if (saveMutation.isPending || saveShopPhotoMutation.isPending || isUploadingPhoto || isPreparingPhoto) return;
    if (!vendorProfile) {
      toast({
        title: "Could not update shop photo",
        description: "Vendor profile not found. Please complete onboarding first.",
        variant: "destructive",
      });
      return;
    }

    const previousSource = shopPhotoSource;
    const previousPosition = shopPhotoPosition;
    const previousScale = shopPhotoScale;

    setShopPhotoSource(nextSource);
    setShopPhotoPosition(nextPosition);
    setShopPhotoScale(nextScale);
    setShopPhotoDirty(false);
    setIsPhotoEditorOpen(false);

    setIsUploadingPhoto(true);
    try {
      let nextShopProfileImageUrl = "";
      if (nextSource) {
        const croppedDataUrl = await buildCroppedShopPhotoDataUrl(nextSource, nextPosition, nextScale);
        if (estimateDataUrlBytes(croppedDataUrl) > MAX_SHOP_PHOTO_BYTES) {
          toast({
            title: "Image too large",
            description: "Optimized shop photo must be 2MB or less.",
            variant: "destructive",
          });
          throw new Error("Optimized shop photo must be 2MB or less.");
        }
        nextShopProfileImageUrl = await uploadShopPhotoDataUrl(croppedDataUrl);
      }

      await saveShopPhotoMutation.mutateAsync({
        nextShopProfileImageUrl,
      });
    } catch {
      setShopPhotoSource(previousSource);
      setShopPhotoPosition(previousPosition);
      setShopPhotoScale(previousScale);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleShopPhotoFile = async (file: File) => {
    if (!ACCEPTED_SHOP_PHOTO_TYPES.has(file.type)) {
      toast({
        title: "Unsupported image format",
        description: "Use PNG, JPG, WEBP, or GIF.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_SHOP_PHOTO_SOURCE_BYTES) {
      toast({
        title: "Image too large",
        description: "Please choose a photo under 20MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsPreparingPhoto(true);
      const optimized = await optimizeShopPhoto(file);
      if (estimateDataUrlBytes(optimized.src) > MAX_SHOP_PHOTO_BYTES) {
        toast({
          title: "Image too large",
          description: "Optimized shop photo must be 2MB or less.",
          variant: "destructive",
        });
        return;
      }

      setShopPhotoSource(optimized);
      setShopPhotoPosition({ x: 0, y: 0 });
      setShopPhotoScale(1);
      setEditorPhotoPosition({ x: 0, y: 0 });
      setEditorPhotoScale(1);
      setIsPhotoEditorOpen(true);
      setValidationError("");
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unable to process image.",
        variant: "destructive",
      });
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  const handleCoverPhotoFile = async (file: File) => {
    if (!ACCEPTED_SHOP_PHOTO_TYPES.has(file.type)) {
      toast({
        title: "Unsupported image format",
        description: "Use PNG, JPG, WEBP, or GIF.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_SHOP_PHOTO_SOURCE_BYTES) {
      toast({
        title: "Image too large",
        description: "Please choose a photo under 20MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsPreparingCoverPhoto(true);
      const optimized = await optimizeShopPhoto(file);
      if (estimateDataUrlBytes(optimized.src) > MAX_SHOP_PHOTO_BYTES) {
        toast({
          title: "Image too large",
          description: "Optimized cover photo must be 2MB or less.",
          variant: "destructive",
        });
        return;
      }

      setEditorCoverPhotoSource(optimized);
      setEditorCoverPhotoPosition({ x: 0, y: 0 });
      setCoverEditorRequiresUpload(true);
      setIsCoverPhotoEditorOpen(true);
      setValidationError("");
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unable to process image.",
        variant: "destructive",
      });
    } finally {
      setIsPreparingCoverPhoto(false);
    }
  };

  const dragPhotoTo = (
    source: ShopPhotoSource | null,
    deltaX: number,
    deltaY: number,
    startPosition: ShopPhotoPosition,
    frameWidth: number,
    frameHeight: number,
    scaleMultiplier: number,
  ) => {
    if (!source) return startPosition;
    const bounds = getPhotoBoundsForFrame(source, frameWidth, frameHeight, scaleMultiplier);
    const startOffsets = getPhotoOffsets(bounds, startPosition);
    const nextOffsetX = clamp(startOffsets.x + deltaX, -bounds.maxOffsetX, bounds.maxOffsetX);
    const nextOffsetY = clamp(startOffsets.y + deltaY, -bounds.maxOffsetY, bounds.maxOffsetY);
    return normalizePositionFromOffsets(bounds, nextOffsetX, nextOffsetY);
  };

  const handlePhotoEditorPointerDown = (event: React.PointerEvent<HTMLDivElement>, frameSize: number) => {
    if (!isPhotoEditorOpen || !shopPhotoSource) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    shopPhotoDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: editorPhotoPosition,
      startScale: editorPhotoScale,
      frameSize,
    };
  };

  const handlePhotoEditorPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = shopPhotoDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !shopPhotoSource) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    setEditorPhotoPosition(
      dragPhotoTo(
        shopPhotoSource,
        deltaX,
        deltaY,
        dragState.startPosition,
        dragState.frameSize,
        dragState.frameSize,
        dragState.startScale,
      ),
    );
  };

  const handlePhotoEditorPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = shopPhotoDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    shopPhotoDragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCoverPhotoEditorPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    frameWidth: number,
    frameHeight: number,
  ) => {
    if (!isCoverPhotoEditorOpen || !editorCoverPhotoSource) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    coverPhotoDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: editorCoverPhotoPosition,
      frameWidth,
      frameHeight,
    };
  };

  const handleCoverPhotoEditorPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = coverPhotoDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !editorCoverPhotoSource) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    setEditorCoverPhotoPosition(
      dragPhotoTo(
        editorCoverPhotoSource,
        deltaX,
        deltaY,
        dragState.startPosition,
        dragState.frameWidth,
        dragState.frameHeight,
        1,
      ),
    );
  };

  const handleCoverPhotoEditorPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = coverPhotoDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    coverPhotoDragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const openPhotoEditor = () => {
    if (!shopPhotoSource) return;
    setEditorPhotoPosition(shopPhotoPosition);
    setEditorPhotoScale(shopPhotoScale);
    setIsPhotoEditorOpen(true);
  };

  const openCoverPhotoEditor = () => {
    if (!coverPhotoSource) return;
    setEditorCoverPhotoSource(coverPhotoSource);
    setEditorCoverPhotoPosition(coverPhotoPosition);
    setCoverEditorRequiresUpload(false);
    setIsCoverPhotoEditorOpen(true);
  };

  const closeCoverPhotoEditor = (nextOpen: boolean) => {
    setIsCoverPhotoEditorOpen(nextOpen);
    if (!nextOpen) {
      setEditorCoverPhotoSource(null);
      setCoverEditorRequiresUpload(false);
      coverPhotoDragStateRef.current = null;
    }
  };

  const applyPhotoEditorChanges = () => {
    if (!shopPhotoSource) return;
    void persistShopPhoto(shopPhotoSource, editorPhotoPosition, editorPhotoScale);
  };

  const applyCoverPhotoEditorChanges = () => {
    if (!editorCoverPhotoSource) return;
    setCoverPhotoSource(editorCoverPhotoSource);
    setCoverPhotoPosition(editorCoverPhotoPosition);
    setCoverPhotoNeedsUpload((prev) => prev || coverEditorRequiresUpload);
    setCoverEditorRequiresUpload(false);
    setCoverPhotoDirty(true);
    closeCoverPhotoEditor(false);
  };

  const renderShopPhotoCircle = ({
    frameSize,
    className,
    source,
    position,
    scaleMultiplier,
    dataTestId,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }: {
    frameSize: number;
    className: string;
    source: ShopPhotoSource | null;
    position: ShopPhotoPosition;
    scaleMultiplier?: number;
    dataTestId?: string;
    onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
  }) => {
    const bounds = source ? getPhotoBounds(source, frameSize, scaleMultiplier ?? 1) : null;
    const offsets = bounds ? getPhotoOffsets(bounds, position) : null;
    const interactiveClass = onPointerDown && source ? "cursor-grab active:cursor-grabbing touch-none" : "";
    const initials = getInitials(asTrimmedString(businessNameDraft) || "Shop");

    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground select-none ${className} ${interactiveClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        data-testid={dataTestId}
      >
        {source && bounds && offsets ? (
          <>
            <img
              src={source.src}
              alt="Shop profile base"
              className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              draggable={false}
            />
            <img
              src={source.src}
              alt="Shop profile preview"
              className="absolute pointer-events-none max-w-none"
              draggable={false}
              style={{
                width: `${bounds.renderWidth}px`,
                height: `${bounds.renderHeight}px`,
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${offsets.x}px, ${offsets.y}px)`,
              }}
            />
          </>
        ) : null}
        <span className={source ? "opacity-0" : "opacity-100"}>{initials}</span>
      </div>
    );
  };

  const renderCoverPhotoFrame = ({
    frameWidth,
    frameHeight,
    className,
    source,
    position,
    dataTestId,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }: {
    frameWidth: number;
    frameHeight: number;
    className: string;
    source: ShopPhotoSource | null;
    position: ShopPhotoPosition;
    dataTestId?: string;
    onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
  }) => {
    const bounds = source ? getPhotoBoundsForFrame(source, frameWidth, frameHeight, 1) : null;
    const offsets = bounds ? getPhotoOffsets(bounds, position) : null;
    const interactiveClass = onPointerDown && source ? "cursor-grab active:cursor-grabbing touch-none" : "";

    return (
      <div
        className={`relative overflow-hidden rounded-xl border border-border bg-muted select-none ${className} ${interactiveClass}`}
        style={{
          width: `${frameWidth}px`,
          height: `${frameHeight}px`,
          maxWidth: "100%",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        data-testid={dataTestId}
      >
        {source && bounds && offsets ? (
          <>
            <img
              src={source.src}
              alt="Cover photo base"
              className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              draggable={false}
            />
            <img
              src={source.src}
              alt="Cover photo preview"
              className="absolute pointer-events-none max-w-none"
              draggable={false}
              style={{
                width: `${bounds.renderWidth}px`,
                height: `${bounds.renderHeight}px`,
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate(${offsets.x}px, ${offsets.y}px)`,
              }}
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            Upload a cover photo
          </div>
        )}
      </div>
    );
  };

  const hasVendorAccount = Boolean(vendorMe?.hasVendorAccount ?? vendorMe?.id);

  return (
    <VendorShell>
      <div className="w-full space-y-6">
        {!isVendorLoading && !hasVendorAccount ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Vendor account unavailable. Re-open onboarding to finish account setup.
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-3 lg:items-end">
          <div className="lg:col-span-2">
            <h1 className="text-3xl font-bold text-foreground">My Hub</h1>
            <p className="text-sm text-muted-foreground">
              This is your public storefront page. Private contact details are never shown.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-between">
            <Button
              variant="outline"
              onClick={handleCopyPublicLink}
              disabled={!publicShopUrl}
              data-testid="button-copy-vendor-shop-link"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Shop Link
            </Button>
            <Button
              onClick={() => {
                if (!publicShopPath) return;
                setLocation(publicShopPath);
              }}
              disabled={!publicShopPath}
              data-testid="button-enter-customer-mode"
            >
              <Eye className="mr-2 h-4 w-4" />
              Enter Customer Mode
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="space-y-4 lg:col-span-2">
            <h2 className="text-2xl font-semibold text-foreground lg:text-[2rem]">Active Listings</h2>
            {isListingsLoading ? (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">Loading listings...</CardContent>
              </Card>
            ) : listingsForShop.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  No active listings yet. Publish a listing to show it in your My Hub.
                </CardContent>
              </Card>
            ) : (
              <MasonryListingGrid
                listings={listingsForShop}
                maxColumns={5}
                desktopColumns={5}
                preserveInputOrder
                minCardWidthPx={240}
                cardMaxWidthPx={290}
                renderCard={(listing) => (
                  <ListingCard
                    listing={listing}
                    priceScale="double"
                    titleScale="oneAndHalf"
                    titleFont="heading"
                    showVendorShopButton={false}
                    cardNavigationPath={`/vendor/listings/${listing.id}`}
                    primaryActionLabel="Edit Listing"
                    primaryActionPath={`/vendor/listings/${listing.id}`}
                  />
                )}
              />
            )}
          </section>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Shop Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() => {
                    const validationMessage = getValidationErrorMessage();
                    if (validationMessage) {
                      setValidationError(validationMessage);
                      return;
                    }
                    setValidationError("");
                    saveMutation.mutate();
                  }}
                  disabled={
                    saveMutation.isPending ||
                    isPreparingPhoto ||
                    isPreparingCoverPhoto ||
                    isUploadingPhoto ||
                    !hasChanges
                  }
                  className="w-full"
                  data-testid="button-save-vendor-shop"
                >
                  {saveMutation.isPending || isUploadingPhoto ? "Saving..." : "Save Shop Details"}
                </Button>

                {validationError ? (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-name">Business Name</Label>
                  <Input
                    id="vendor-shop-name"
                    value={businessNameDraft}
                    onChange={(event) => setBusinessNameDraft(event.target.value)}
                    onBlur={(event) => setBusinessNameDraft(normalizeProfileNameInput(event.target.value))}
                    placeholder="Business name"
                    maxLength={120}
                    disabled={isVendorLoading || saveMutation.isPending}
                    data-testid="input-vendor-shop-business-name"
                  />
                </div>

                <div>
                  <Label htmlFor="vendor-shop-cover-photo">Cover Photo</Label>
                  <div className="mt-1.5 rounded-lg border border-dashed border-border p-4">
                    {coverPhotoSource ? (
                      <div
                        className="w-full overflow-hidden rounded-xl border border-border bg-muted"
                        style={{ aspectRatio: `${vendorHubCoverAspectRatio}` }}
                      >
                        <img
                          src={coverPhotoSource.src}
                          alt="My Hub cover preview"
                          className="h-full w-full object-cover"
                          style={{ objectPosition: toObjectPositionValue(coverPhotoPosition) }}
                        />
                      </div>
                    ) : null}
                    <div className={`${coverPhotoSource ? "mt-3" : ""} flex flex-wrap items-center gap-2`}>
                      <input
                        ref={coverPhotoInputRef}
                        id="vendor-shop-cover-photo"
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                        className="hidden"
                        disabled={saveMutation.isPending || isPreparingCoverPhoto || isUploadingPhoto}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void handleCoverPhotoFile(file);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => coverPhotoInputRef.current?.click()}
                        disabled={saveMutation.isPending || isPreparingCoverPhoto || isUploadingPhoto}
                        data-testid="button-upload-shop-cover-photo"
                      >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        {coverPhotoSource ? "Change cover photo" : "Upload cover photo"}
                      </Button>
                      {coverPhotoSource ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-[#4A6A7D] hover:text-[#4A6A7D]"
                          onClick={openCoverPhotoEditor}
                          disabled={saveMutation.isPending || isPreparingCoverPhoto || isUploadingPhoto}
                          data-testid="button-edit-shop-cover-photo-position"
                        >
                          Edit position
                        </Button>
                      ) : null}
                      {coverPhotoSource ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-[#4A6A7D] hover:text-[#4A6A7D]"
                          onClick={() => {
                            setCoverPhotoSource(null);
                            setCoverPhotoPosition({ x: 0, y: 0 });
                            setEditorCoverPhotoSource(null);
                            setEditorCoverPhotoPosition({ x: 0, y: 0 });
                            setCoverPhotoNeedsUpload(false);
                            setCoverEditorRequiresUpload(false);
                            setIsCoverPhotoEditorOpen(false);
                            setCoverPhotoDirty(true);
                          }}
                          disabled={saveMutation.isPending || isPreparingCoverPhoto || isUploadingPhoto}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove cover
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Recommended wide image for the top hero section. Drag to reposition after upload.
                    </p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="vendor-shop-photo">Shop Profile Image</Label>
                  <div className="mt-1.5 rounded-lg border border-dashed border-border p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {shopPhotoSource
                        ? renderShopPhotoCircle({
                            frameSize: SHOP_PHOTO_EDITOR_PREVIEW_SIZE,
                            className: "h-16 w-16 text-base ring-1 ring-border",
                            source: shopPhotoSource,
                            position: shopPhotoPosition,
                            scaleMultiplier: shopPhotoScale,
                            dataTestId: "avatar-shop-editor-preview",
                          })
                        : null}
                      <div className="flex flex-wrap items-center gap-3">
                        <input
                          ref={shopPhotoInputRef}
                          id="vendor-shop-photo"
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                          className="hidden"
                          disabled={saveMutation.isPending || isPreparingPhoto || isUploadingPhoto}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleShopPhotoFile(file);
                            }
                            event.currentTarget.value = "";
                          }}
                        />
                        <div className="flex flex-col items-start gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 px-4 py-2 text-sm"
                            onClick={() => {
                              if (shopPhotoSource) {
                                openPhotoEditor();
                              } else {
                                shopPhotoInputRef.current?.click();
                              }
                            }}
                            disabled={saveMutation.isPending || isPreparingPhoto || isUploadingPhoto}
                            data-testid="button-upload-shop-profile-image"
                          >
                            <ImagePlus className="mr-2 h-4 w-4" />
                            {shopPhotoSource ? "Edit photo" : "Upload photo"}
                          </Button>
                          {shopPhotoSource ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-auto px-0 py-0 text-sm font-medium text-[#4A6A7D] hover:text-[#4A6A7D]"
                              onClick={() => shopPhotoInputRef.current?.click()}
                              disabled={saveMutation.isPending || isPreparingPhoto || isUploadingPhoto}
                              data-testid="button-change-shop-photo"
                            >
                              Change Photo
                            </Button>
                          ) : null}
                        </div>
                        {shopPhotoSource ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-[#4A6A7D] hover:text-[#4A6A7D]"
                            onClick={() => {
                              void persistShopPhoto(null, { x: 0, y: 0 }, 1);
                            }}
                            disabled={saveMutation.isPending || isPreparingPhoto || isUploadingPhoto}
                            data-testid="button-remove-shop-profile-image"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove photo
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Upload one image and drag to reposition inside the circle. Saved image stays under 2MB.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-tagline">Tagline</Label>
                  <Input
                    id="vendor-shop-tagline"
                    value={taglineDraft}
                    onChange={(event) => setTaglineDraft(event.target.value)}
                    placeholder="Example: Making your events unforgettable, one detail at a time."
                    disabled={isProfileLoading || saveMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-service-area">Service Area</Label>
                  <Input
                    id="vendor-shop-service-area"
                    value={serviceAreaDraft}
                    onChange={(event) => setServiceAreaDraft(event.target.value)}
                    placeholder="Example: Salt Lake City, UT"
                    disabled={isProfileLoading || saveMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-service-radius">Service Radius (miles)</Label>
                  <Input
                    id="vendor-shop-service-radius"
                    type="number"
                    min={0}
                    step={1}
                    value={serviceRadiusMilesDraft}
                    onChange={(event) => setServiceRadiusMilesDraft(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Example: 100"
                    disabled={isProfileLoading || saveMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-in-business-since">In Business Since (Year)</Label>
                  <Input
                    id="vendor-shop-in-business-since"
                    value={inBusinessSinceYearDraft}
                    onChange={(event) => setInBusinessSinceYearDraft(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                    placeholder="Example: 2018"
                    disabled={isProfileLoading || saveMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-specialties">Specialties</Label>
                  <Input
                    id="vendor-shop-specialties"
                    value={specialtiesDraft}
                    onChange={(event) => setSpecialtiesDraft(event.target.value)}
                    placeholder="Comma separated (e.g. Weddings, Garden Parties, Baby Showers)"
                    disabled={isProfileLoading || saveMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-events-baseline">Events Served (Starting Count)</Label>
                  <Input
                    id="vendor-shop-events-baseline"
                    value={eventsServedBaselineDraft}
                    onChange={(event) => setEventsServedBaselineDraft(event.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    disabled={isProfileLoading || saveMutation.isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter how many events you have served so far and we will calculate from here.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-about-business">About the Business</Label>
                  <Textarea
                    id="vendor-shop-about-business"
                    value={aboutBusinessDraft}
                    onChange={(event) => setAboutBusinessDraft(event.target.value)}
                    placeholder="Tell customers about your business."
                    rows={4}
                    disabled={isProfileLoading || saveMutation.isPending}
                    data-testid="textarea-vendor-shop-about-business"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-about-owner">About the Owner</Label>
                  <Textarea
                    id="vendor-shop-about-owner"
                    value={aboutOwnerDraft}
                    onChange={(event) => setAboutOwnerDraft(event.target.value)}
                    placeholder="Share a short intro about the owner."
                    rows={4}
                    disabled={isProfileLoading || saveMutation.isPending}
                    data-testid="textarea-vendor-shop-about-owner"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-hobbies">Hobbies</Label>
                  <HobbyPillInput
                    id="vendor-shop-hobbies"
                    value={hobbiesDraft}
                    onChange={setHobbiesDraft}
                    placeholder="Type a hobby and press Enter"
                    disabled={isProfileLoading || saveMutation.isPending}
                    inputTestId="textarea-vendor-shop-hobbies"
                    pillClassName="border-[#E07A6A] bg-[#E07A6A] text-[#ffffff]"
                    pillRemoveButtonClassName="text-[#ffffff]/80 hover:text-[#ffffff]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-home-state">Home State</Label>
                  <Input
                    id="vendor-shop-home-state"
                    value={homeStateDraft}
                    onChange={(event) => setHomeStateDraft(event.target.value)}
                    placeholder="Example: Utah"
                    disabled={isProfileLoading || saveMutation.isPending}
                    data-testid="input-vendor-shop-home-state"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-fun-facts">Fun Facts</Label>
                  <Textarea
                    id="vendor-shop-fun-facts"
                    value={funFactsDraft}
                    onChange={(event) => setFunFactsDraft(event.target.value)}
                    placeholder="Optional fun facts customers can read."
                    rows={3}
                    disabled={isProfileLoading || saveMutation.isPending}
                    data-testid="textarea-vendor-shop-fun-facts"
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Customer-facing contact details like email and phone are hidden on this page.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

      <Dialog open={isCoverPhotoEditorOpen} onOpenChange={closeCoverPhotoEditor}>
        <DialogContent className="sm:max-w-2xl" data-testid="dialog-shop-cover-photo-editor">
          <DialogHeader>
            <DialogTitle>Edit cover photo</DialogTitle>
            <DialogDescription>Drag to position your photo inside the cover frame.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              {renderCoverPhotoFrame({
                frameWidth: COVER_PHOTO_MODAL_PREVIEW_WIDTH,
                frameHeight: coverPhotoModalPreviewHeight,
                className: "",
                source: editorCoverPhotoSource,
                position: editorCoverPhotoPosition,
                dataTestId: "cover-photo-editor-modal-preview",
                onPointerDown: (event) =>
                  handleCoverPhotoEditorPointerDown(event, COVER_PHOTO_MODAL_PREVIEW_WIDTH, coverPhotoModalPreviewHeight),
                onPointerMove: handleCoverPhotoEditorPointerMove,
                onPointerUp: handleCoverPhotoEditorPointerEnd,
                onPointerCancel: handleCoverPhotoEditorPointerEnd,
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeCoverPhotoEditor(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyCoverPhotoEditorChanges} disabled={!editorCoverPhotoSource}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPhotoEditorOpen} onOpenChange={setIsPhotoEditorOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-shop-photo-editor">
          <DialogHeader>
            <DialogTitle>Edit photo</DialogTitle>
            <DialogDescription>
              Drag to move your photo and use the slider to scale it inside the circle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              {renderShopPhotoCircle({
                frameSize: SHOP_PHOTO_MODAL_PREVIEW_SIZE,
                className: "h-56 w-56 text-4xl ring-1 ring-border",
                source: shopPhotoSource,
                position: editorPhotoPosition,
                scaleMultiplier: editorPhotoScale,
                dataTestId: "avatar-shop-photo-editor-modal",
                onPointerDown: (event) => handlePhotoEditorPointerDown(event, SHOP_PHOTO_MODAL_PREVIEW_SIZE),
                onPointerMove: handlePhotoEditorPointerMove,
                onPointerUp: handlePhotoEditorPointerEnd,
                onPointerCancel: handlePhotoEditorPointerEnd,
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="shop-photo-scale">Scale</Label>
              <input
                id="shop-photo-scale"
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={editorPhotoScale}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setEditorPhotoScale(Number.isFinite(next) ? clamp(next, 1, 3) : 1);
                }}
                className="w-full"
                data-testid="slider-shop-photo-scale"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsPhotoEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={applyPhotoEditorChanges}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VendorShell>
  );
}
