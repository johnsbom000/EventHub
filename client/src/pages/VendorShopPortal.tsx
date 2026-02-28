import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, ImagePlus, Trash2 } from "lucide-react";

import VendorShell from "@/components/VendorShell";
import ListingCard from "@/components/ListingCard";
import { apiRequest } from "@/lib/queryClient";
import { getFreshAccessToken } from "@/lib/authToken";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const ACCEPTED_SHOP_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_SHOP_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_SHOP_PHOTO_SOURCE_BYTES = 20 * 1024 * 1024;
const SHOP_PHOTO_MAX_DIMENSION = 1024;
const SHOP_PHOTO_TARGET_BYTES = 450 * 1024;
const SHOP_PHOTO_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58];
const SHOP_PHOTO_OUTPUT_SIZE = 512;
const SHOP_PHOTO_EDITOR_PREVIEW_SIZE = 64;
const SHOP_PHOTO_MODAL_PREVIEW_SIZE = 224;

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
};

type VendorProfile = {
  serviceDescription?: string | null;
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

function getPhotoBounds(source: ShopPhotoSource, frameSize: number, scaleMultiplier = 1): PhotoBounds {
  const scale = Math.max(frameSize / source.width, frameSize / source.height);
  const renderWidth = source.width * scale * Math.max(1, scaleMultiplier);
  const renderHeight = source.height * scale * Math.max(1, scaleMultiplier);

  return {
    renderWidth,
    renderHeight,
    maxOffsetX: Math.max(0, (renderWidth - frameSize) / 2),
    maxOffsetY: Math.max(0, (renderHeight - frameSize) / 2),
  };
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
  const canvas = buildResizedCanvas(image);
  const dataUrl = encodeCanvasForTarget(canvas, SHOP_PHOTO_TARGET_BYTES);
  return {
    src: dataUrl,
    width: canvas.width,
    height: canvas.height,
  };
}

async function createShopPhotoSourceFromSrc(src: string): Promise<ShopPhotoSource> {
  const image = await loadImage(src);
  return {
    src,
    width: image.width,
    height: image.height,
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

export default function VendorShopPortal() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const shopPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosition: ShopPhotoPosition;
    startScale: number;
    frameSize: number;
  } | null>(null);

  const { data: vendorMe, isLoading: isVendorLoading } = useQuery<VendorMe>({
    queryKey: ["/api/vendor/me"],
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
  const [yearsInBusinessDraft, setYearsInBusinessDraft] = useState("");
  const [hobbiesDraft, setHobbiesDraft] = useState("");
  const [likesDislikesDraft, setLikesDislikesDraft] = useState("");
  const [homeStateDraft, setHomeStateDraft] = useState("");
  const [funFactsDraft, setFunFactsDraft] = useState("");

  const [shopPhotoSource, setShopPhotoSource] = useState<ShopPhotoSource | null>(null);
  const [shopPhotoPosition, setShopPhotoPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [shopPhotoScale, setShopPhotoScale] = useState(1);
  const [editorPhotoPosition, setEditorPhotoPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [editorPhotoScale, setEditorPhotoScale] = useState(1);
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [shopPhotoDirty, setShopPhotoDirty] = useState(false);

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

  const persistedAboutOwner = asTrimmedString(onlineProfiles.aboutOwner);
  const persistedYearsInBusiness = asTrimmedString(onlineProfiles.yearsInBusiness);
  const persistedHobbies = asTrimmedString(onlineProfiles.hobbies);
  const persistedLikesDislikes = asTrimmedString(onlineProfiles.likesDislikes);
  const persistedHomeState = asTrimmedString(onlineProfiles.homeState);
  const persistedFunFacts = asTrimmedString(onlineProfiles.funFacts);
  const persistedProfileImageUrl = asTrimmedString(onlineProfiles.shopProfileImageUrl);

  useEffect(() => {
    setBusinessNameDraft(asTrimmedString(vendorMe?.businessName));
  }, [vendorMe?.businessName]);

  useEffect(() => {
    setAboutBusinessDraft(persistedAboutBusiness);
  }, [persistedAboutBusiness]);

  useEffect(() => {
    setAboutOwnerDraft(persistedAboutOwner);
  }, [persistedAboutOwner]);

  useEffect(() => {
    setYearsInBusinessDraft(persistedYearsInBusiness);
  }, [persistedYearsInBusiness]);

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

  const vendorId = asTrimmedString(vendorMe?.id);
  const publicShopPath = vendorId ? `/shop/${vendorId}` : "";
  const publicShopUrl =
    typeof window !== "undefined" && publicShopPath ? `${window.location.origin}${publicShopPath}` : publicShopPath;

  const livePreviewShopImageUrl = shopPhotoSource?.src || "";

  const listingsForShop: ListingPublic[] = useMemo(() => {
    const fallbackVendorName = asTrimmedString(businessNameDraft) || asTrimmedString(vendorMe?.businessName) || "Vendor";

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
  }, [activeListings, businessNameDraft, vendorId, vendorMe?.businessName, livePreviewShopImageUrl]);

  const hasChanges =
    asTrimmedString(businessNameDraft) !== asTrimmedString(vendorMe?.businessName) ||
    asTrimmedString(aboutBusinessDraft) !== persistedAboutBusiness ||
    asTrimmedString(aboutOwnerDraft) !== persistedAboutOwner ||
    asTrimmedString(yearsInBusinessDraft) !== persistedYearsInBusiness ||
    asTrimmedString(hobbiesDraft) !== persistedHobbies ||
    asTrimmedString(likesDislikesDraft) !== persistedLikesDislikes ||
    asTrimmedString(homeStateDraft) !== persistedHomeState ||
    asTrimmedString(funFactsDraft) !== persistedFunFacts ||
    shopPhotoDirty;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextBusinessName = asTrimmedString(businessNameDraft);
      if (!nextBusinessName) {
        throw new Error("Business name is required.");
      }

      await apiRequest("PATCH", "/api/vendor/me", {
        businessName: nextBusinessName,
      });

      if (!vendorProfile) {
        throw new Error("Vendor profile not found. Please complete onboarding first.");
      }

      let nextShopProfileImageUrl = persistedProfileImageUrl;

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
          serviceDescription: asTrimmedString(aboutBusinessDraft),
          onlineProfiles: {
            ...existingOnlineProfiles,
            aboutBusiness: asTrimmedString(aboutBusinessDraft),
            aboutOwner: asTrimmedString(aboutOwnerDraft),
            yearsInBusiness: asTrimmedString(yearsInBusinessDraft),
            hobbies: asTrimmedString(hobbiesDraft),
            likesDislikes: asTrimmedString(likesDislikesDraft),
            homeState: asTrimmedString(homeStateDraft),
            funFacts: asTrimmedString(funFactsDraft),
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
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings", "active", "vendor-shop"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/vendors/public/shop", vendorId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/listings/public"] }),
      ]);

      toast({
        title: "Vendor shop updated",
        description: "Your shared shop details now match across Event Hub.",
      });
    },
    onError: (error: any) => {
      setIsUploadingPhoto(false);
      toast({
        title: "Could not save vendor shop",
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
      setShopPhotoDirty(true);
      setEditorPhotoPosition({ x: 0, y: 0 });
      setEditorPhotoScale(1);
      setIsPhotoEditorOpen(true);
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

  const dragPhotoTo = (
    deltaX: number,
    deltaY: number,
    startPosition: ShopPhotoPosition,
    frameSize: number,
    scaleMultiplier: number,
  ) => {
    if (!shopPhotoSource) return startPosition;
    const bounds = getPhotoBounds(shopPhotoSource, frameSize, scaleMultiplier);
    const startOffsets = getPhotoOffsets(bounds, startPosition);
    const nextOffsetX = clamp(startOffsets.x + deltaX, -bounds.maxOffsetX, bounds.maxOffsetX);
    const nextOffsetY = clamp(startOffsets.y + deltaY, -bounds.maxOffsetY, bounds.maxOffsetY);
    return normalizePositionFromOffsets(bounds, nextOffsetX, nextOffsetY);
  };

  const handlePhotoEditorPointerDown = (event: React.PointerEvent<HTMLDivElement>, frameSize: number) => {
    if (!isPhotoEditorOpen || !shopPhotoSource) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: editorPhotoPosition,
      startScale: editorPhotoScale,
      frameSize,
    };
  };

  const handlePhotoEditorPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !shopPhotoSource) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    setEditorPhotoPosition(dragPhotoTo(deltaX, deltaY, dragState.startPosition, dragState.frameSize, dragState.startScale));
  };

  const handlePhotoEditorPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
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

  const applyPhotoEditorChanges = () => {
    setShopPhotoPosition(editorPhotoPosition);
    setShopPhotoScale(editorPhotoScale);
    setShopPhotoDirty(true);
    setIsPhotoEditorOpen(false);
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
        ) : null}
        <span className={source ? "opacity-0" : "opacity-100"}>{initials}</span>
      </div>
    );
  };

  return (
    <VendorShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Vendor Shop</h1>
            <p className="text-sm text-muted-foreground">
              This is your public storefront page. Private contact details are never shown.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                  No active listings yet. Publish a listing to show it in your Vendor Shop.
                </CardContent>
              </Card>
            ) : (
              <div className="w-full columns-1 gap-5 [column-fill:_balance] sm:columns-2 xl:columns-3">
                {listingsForShop.map((listing) => (
                  <div key={listing.id} className="mb-2 inline-block w-full break-inside-avoid align-top">
                    <ListingCard
                      listing={listing}
                      priceScale="double"
                      titleScale="oneAndHalf"
                      titleFont="heading"
                      showVendorShopButton={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Shop Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-name">Business Name</Label>
                  <Input
                    id="vendor-shop-name"
                    value={businessNameDraft}
                    onChange={(event) => setBusinessNameDraft(event.target.value)}
                    placeholder="Business name"
                    disabled={isVendorLoading || saveMutation.isPending}
                    data-testid="input-vendor-shop-business-name"
                  />
                </div>

                <div>
                  <Label htmlFor="vendor-shop-photo">Shop Profile Image</Label>
                  <div className="mt-1.5 rounded-lg border border-dashed border-border p-4">
                    <div className="flex flex-wrap items-center gap-4">
                      {renderShopPhotoCircle({
                        frameSize: SHOP_PHOTO_EDITOR_PREVIEW_SIZE,
                        className: "h-16 w-16 text-base ring-1 ring-border",
                        source: shopPhotoSource,
                        position: shopPhotoPosition,
                        scaleMultiplier: shopPhotoScale,
                        dataTestId: "avatar-shop-editor-preview",
                      })}
                      <div className="flex flex-wrap items-center gap-2">
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
                        <Button
                          type="button"
                          variant="outline"
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
                            onClick={() => {
                              setShopPhotoSource(null);
                              setShopPhotoPosition({ x: 0, y: 0 });
                              setShopPhotoScale(1);
                              setShopPhotoDirty(true);
                              setIsPhotoEditorOpen(false);
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
                  <Label htmlFor="vendor-shop-years">Years in Business</Label>
                  <Input
                    id="vendor-shop-years"
                    value={yearsInBusinessDraft}
                    onChange={(event) => setYearsInBusinessDraft(event.target.value)}
                    placeholder="Example: 12"
                    disabled={isProfileLoading || saveMutation.isPending}
                    data-testid="input-vendor-shop-years-in-business"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-hobbies">Hobbies</Label>
                  <Textarea
                    id="vendor-shop-hobbies"
                    value={hobbiesDraft}
                    onChange={(event) => setHobbiesDraft(event.target.value)}
                    placeholder="What the owner enjoys outside of work."
                    rows={3}
                    disabled={isProfileLoading || saveMutation.isPending}
                    data-testid="textarea-vendor-shop-hobbies"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vendor-shop-likes-dislikes">Likes & Dislikes</Label>
                  <Textarea
                    id="vendor-shop-likes-dislikes"
                    value={likesDislikesDraft}
                    onChange={(event) => setLikesDislikesDraft(event.target.value)}
                    placeholder="Optional preferences customers can know."
                    rows={3}
                    disabled={isProfileLoading || saveMutation.isPending}
                    data-testid="textarea-vendor-shop-likes-dislikes"
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

                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={
                    saveMutation.isPending ||
                    isPreparingPhoto ||
                    isUploadingPhoto ||
                    !hasChanges
                  }
                  className="w-full"
                  data-testid="button-save-vendor-shop"
                >
                  {saveMutation.isPending || isUploadingPhoto ? "Saving..." : "Save Shop Details"}
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>

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
