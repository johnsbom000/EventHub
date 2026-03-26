import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import HobbyPillInput from "@/components/HobbyPillInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import OnboardingStepHeader from "@/features/vendor/onboarding/OnboardingStepHeader";
import { useToast } from "@/hooks/use-toast";

const ACCEPTED_SHOP_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_SHOP_PHOTO_SOURCE_BYTES = 20 * 1024 * 1024;
const SHOP_PHOTO_MAX_DIMENSION = 1024;
const SHOP_PHOTO_TARGET_BYTES = 450 * 1024;
const SHOP_PHOTO_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58];
const SHOP_PHOTO_OUTPUT_SIZE = 512;
const PHOTO_EDITOR_MIN_SCALE = 1;
const PHOTO_EDITOR_MAX_SCALE = 3;
const PROFILE_EDITOR_PREVIEW_SIZE = 224;
const VENDOR_HUB_COVER_MIN_HEIGHT = 280;
const VENDOR_HUB_COVER_MAX_HEIGHT = 520;
const VENDOR_HUB_COVER_VW_MULTIPLIER = 0.42;
const COVER_EDITOR_PREVIEW_MAX_WIDTH = 560;
const COVER_EDITOR_PREVIEW_MIN_WIDTH = 280;
const COVER_EDITOR_PREVIEW_VIEWPORT_GUTTER = 96;
const COVER_PHOTO_OUTPUT_WIDTH = 1600;

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

function getCoverEditorPreviewWidthForViewport(viewportWidth: number): number {
  const width = Math.max(1, viewportWidth);
  const available = width - COVER_EDITOR_PREVIEW_VIEWPORT_GUTTER;
  return Math.round(clamp(available, COVER_EDITOR_PREVIEW_MIN_WIDTH, COVER_EDITOR_PREVIEW_MAX_WIDTH));
}

type ShopPhotoSource = {
  src: string;
  width: number;
  height: number;
};

type ShopPhotoPosition = {
  x: number;
  y: number;
};

type PhotoBounds = {
  renderWidth: number;
  renderHeight: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
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
  return {
    src,
    width: image.width,
    height: image.height,
  };
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
  const renderWidth = source.width * scale * Math.max(PHOTO_EDITOR_MIN_SCALE, scaleMultiplier);
  const renderHeight = source.height * scale * Math.max(PHOTO_EDITOR_MIN_SCALE, scaleMultiplier);

  return {
    renderWidth,
    renderHeight,
    maxOffsetX: Math.max(0, (renderWidth - width) / 2),
    maxOffsetY: Math.max(0, (renderHeight - height) / 2),
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

function dragPhotoTo(
  source: ShopPhotoSource | null,
  deltaX: number,
  deltaY: number,
  startPosition: ShopPhotoPosition,
  frameWidth: number,
  frameHeight: number,
  scaleMultiplier: number,
): ShopPhotoPosition {
  if (!source) return startPosition;
  const bounds = getPhotoBoundsForFrame(source, frameWidth, frameHeight, scaleMultiplier);
  const startOffsets = getPhotoOffsets(bounds, startPosition);
  const nextOffsetX = clamp(startOffsets.x + deltaX, -bounds.maxOffsetX, bounds.maxOffsetX);
  const nextOffsetY = clamp(startOffsets.y + deltaY, -bounds.maxOffsetY, bounds.maxOffsetY);
  return normalizePositionFromOffsets(bounds, nextOffsetX, nextOffsetY);
}

async function buildCroppedShopPhotoDataUrl(
  source: ShopPhotoSource,
  position: ShopPhotoPosition,
  scaleMultiplier: number,
  outputWidth: number,
  outputHeight: number,
): Promise<string> {
  const image = await loadImage(source.src);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image");
  }

  const bounds = getPhotoBoundsForFrame(source, outputWidth, outputHeight, scaleMultiplier);
  const offsets = getPhotoOffsets(bounds, position);
  const drawX = (outputWidth - bounds.renderWidth) / 2 + offsets.x;
  const drawY = (outputHeight - bounds.renderHeight) / 2 + offsets.y;
  context.drawImage(image, drawX, drawY, bounds.renderWidth, bounds.renderHeight);

  return encodeCanvasForTarget(canvas, SHOP_PHOTO_TARGET_BYTES);
}

interface Step3AboutOwnerProps {
  formData: {
    aboutVendor: string;
    shopTagline: string;
    inBusinessSinceYear: string;
    specialties: string;
    eventsServedBaseline: string;
    hobbies: string;
    homeState: string;
    funFacts: string;
    shopProfilePhotoDataUrl: string;
    shopCoverPhotoDataUrl: string;
  };
  updateFormData: (updates: Partial<Step3AboutOwnerProps["formData"]>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step3_AboutOwner({
  formData,
  updateFormData,
  onNext,
  onBack,
}: Step3AboutOwnerProps) {
  const { toast } = useToast();
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const profileEditorDragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosition: ShopPhotoPosition;
    startScale: number;
    frameSize: number;
  } | null>(null);
  const coverEditorDragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosition: ShopPhotoPosition;
    startScale: number;
    frameWidth: number;
    frameHeight: number;
  } | null>(null);

  const [profilePhotoSource, setProfilePhotoSource] = useState<ShopPhotoSource | null>(null);
  const [coverPhotoSource, setCoverPhotoSource] = useState<ShopPhotoSource | null>(null);
  const [isPreparingProfilePhoto, setIsPreparingProfilePhoto] = useState(false);
  const [isPreparingCoverPhoto, setIsPreparingCoverPhoto] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [isCoverEditorOpen, setIsCoverEditorOpen] = useState(false);
  const [profileEditorSource, setProfileEditorSource] = useState<ShopPhotoSource | null>(null);
  const [coverEditorSource, setCoverEditorSource] = useState<ShopPhotoSource | null>(null);
  const [profileEditorPosition, setProfileEditorPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [coverEditorPosition, setCoverEditorPosition] = useState<ShopPhotoPosition>({ x: 0, y: 0 });
  const [profileEditorScale, setProfileEditorScale] = useState(PHOTO_EDITOR_MIN_SCALE);
  const [coverEditorScale, setCoverEditorScale] = useState(PHOTO_EDITOR_MIN_SCALE);
  const [isApplyingProfileEdits, setIsApplyingProfileEdits] = useState(false);
  const [isApplyingCoverEdits, setIsApplyingCoverEdits] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const vendorHubCoverAspectRatio = useMemo(
    () => getVendorHubCoverAspectRatioForViewport(viewportWidth),
    [viewportWidth],
  );
  const coverEditorPreviewWidth = useMemo(
    () => getCoverEditorPreviewWidthForViewport(viewportWidth),
    [viewportWidth],
  );
  const coverEditorPreviewHeight = useMemo(
    () => Math.round(coverEditorPreviewWidth / vendorHubCoverAspectRatio),
    [coverEditorPreviewWidth, vendorHubCoverAspectRatio],
  );
  const coverPhotoOutputHeight = useMemo(
    () => Math.round(COVER_PHOTO_OUTPUT_WIDTH / vendorHubCoverAspectRatio),
    [vendorHubCoverAspectRatio],
  );

  useEffect(() => {
    let cancelled = false;
    const src = (formData.shopProfilePhotoDataUrl || "").trim();
    if (!src) {
      setProfilePhotoSource(null);
      return () => {
        cancelled = true;
      };
    }
    createShopPhotoSourceFromSrc(src)
      .then((result) => {
        if (!cancelled) setProfilePhotoSource(result);
      })
      .catch(() => {
        if (!cancelled) setProfilePhotoSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.shopProfilePhotoDataUrl]);

  useEffect(() => {
    let cancelled = false;
    const src = (formData.shopCoverPhotoDataUrl || "").trim();
    if (!src) {
      setCoverPhotoSource(null);
      return () => {
        cancelled = true;
      };
    }
    createShopPhotoSourceFromSrc(src)
      .then((result) => {
        if (!cancelled) setCoverPhotoSource(result);
      })
      .catch(() => {
        if (!cancelled) setCoverPhotoSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [formData.shopCoverPhotoDataUrl]);

  const validateFile = (file: File) => {
    if (!ACCEPTED_SHOP_PHOTO_TYPES.has(file.type)) {
      toast({
        title: "Unsupported image format",
        description: "Use PNG, JPG, WEBP, or GIF.",
        variant: "destructive",
      });
      return false;
    }
    if (file.size > MAX_SHOP_PHOTO_SOURCE_BYTES) {
      toast({
        title: "Image too large",
        description: "Please choose a photo under 20MB.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleProfilePhotoFile = async (file: File) => {
    if (!validateFile(file)) return;
    try {
      setIsPreparingProfilePhoto(true);
      const optimized = await optimizeShopPhoto(file);
      setProfileEditorSource(optimized);
      setProfileEditorPosition({ x: 0, y: 0 });
      setProfileEditorScale(PHOTO_EDITOR_MIN_SCALE);
      setIsProfileEditorOpen(true);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unable to process image.",
        variant: "destructive",
      });
    } finally {
      setIsPreparingProfilePhoto(false);
    }
  };

  const handleCoverPhotoFile = async (file: File) => {
    if (!validateFile(file)) return;
    try {
      setIsPreparingCoverPhoto(true);
      const optimized = await optimizeShopPhoto(file);
      setCoverEditorSource(optimized);
      setCoverEditorPosition({ x: 0, y: 0 });
      setCoverEditorScale(PHOTO_EDITOR_MIN_SCALE);
      setIsCoverEditorOpen(true);
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

  const openProfileEditor = () => {
    if (!profilePhotoSource) return;
    setProfileEditorSource(profilePhotoSource);
    setProfileEditorPosition({ x: 0, y: 0 });
    setProfileEditorScale(PHOTO_EDITOR_MIN_SCALE);
    setIsProfileEditorOpen(true);
  };

  const openCoverEditor = () => {
    if (!coverPhotoSource) return;
    setCoverEditorSource(coverPhotoSource);
    setCoverEditorPosition({ x: 0, y: 0 });
    setCoverEditorScale(PHOTO_EDITOR_MIN_SCALE);
    setIsCoverEditorOpen(true);
  };

  const handleProfileEditorPointerDown = (event: PointerEvent<HTMLDivElement>, frameSize: number) => {
    if (!isProfileEditorOpen || !profileEditorSource) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    profileEditorDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: profileEditorPosition,
      startScale: profileEditorScale,
      frameSize,
    };
  };

  const handleProfileEditorPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = profileEditorDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !profileEditorSource) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    setProfileEditorPosition(
      dragPhotoTo(
        profileEditorSource,
        deltaX,
        deltaY,
        dragState.startPosition,
        dragState.frameSize,
        dragState.frameSize,
        dragState.startScale,
      ),
    );
  };

  const handleProfileEditorPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = profileEditorDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    profileEditorDragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCoverEditorPointerDown = (
    event: PointerEvent<HTMLDivElement>,
    frameWidth: number,
    frameHeight: number,
  ) => {
    if (!isCoverEditorOpen || !coverEditorSource) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    coverEditorDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: coverEditorPosition,
      startScale: coverEditorScale,
      frameWidth,
      frameHeight,
    };
  };

  const handleCoverEditorPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = coverEditorDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !coverEditorSource) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    setCoverEditorPosition(
      dragPhotoTo(
        coverEditorSource,
        deltaX,
        deltaY,
        dragState.startPosition,
        dragState.frameWidth,
        dragState.frameHeight,
        dragState.startScale,
      ),
    );
  };

  const handleCoverEditorPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = coverEditorDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    coverEditorDragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const renderPhotoFrame = ({
    source,
    position,
    scale,
    frameWidth,
    frameHeight,
    roundedClass,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    emptyLabel,
  }: {
    source: ShopPhotoSource | null;
    position: ShopPhotoPosition;
    scale: number;
    frameWidth: number;
    frameHeight: number;
    roundedClass: string;
    emptyLabel: string;
    onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void;
  }) => {
    const bounds = source ? getPhotoBoundsForFrame(source, frameWidth, frameHeight, scale) : null;
    const offsets = bounds ? getPhotoOffsets(bounds, position) : null;
    const interactiveClass = onPointerDown && source ? "cursor-grab active:cursor-grabbing touch-none" : "";
    return (
      <div
        className={`relative overflow-hidden border border-[rgba(74,106,125,0.22)] bg-muted select-none ${roundedClass} ${interactiveClass}`}
        style={{
          width: `${frameWidth}px`,
          height: `${frameHeight}px`,
          maxWidth: "100%",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {source && bounds && offsets ? (
          <>
            <img
              src={source.src}
              alt="Photo base"
              className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              draggable={false}
            />
            <img
              src={source.src}
              alt="Photo preview"
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
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{emptyLabel}</div>
        )}
      </div>
    );
  };

  const applyProfileEdits = async () => {
    if (!profileEditorSource) return;
    try {
      setIsApplyingProfileEdits(true);
      const croppedDataUrl = await buildCroppedShopPhotoDataUrl(
        profileEditorSource,
        profileEditorPosition,
        profileEditorScale,
        SHOP_PHOTO_OUTPUT_SIZE,
        SHOP_PHOTO_OUTPUT_SIZE,
      );
      const nextSource = await createShopPhotoSourceFromSrc(croppedDataUrl);
      setProfilePhotoSource(nextSource);
      updateFormData({ shopProfilePhotoDataUrl: croppedDataUrl });
      setIsProfileEditorOpen(false);
      profileEditorDragStateRef.current = null;
    } catch (error) {
      toast({
        title: "Could not apply photo edits",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsApplyingProfileEdits(false);
    }
  };

  const applyCoverEdits = async () => {
    if (!coverEditorSource) return;
    try {
      setIsApplyingCoverEdits(true);
      const croppedDataUrl = await buildCroppedShopPhotoDataUrl(
        coverEditorSource,
        coverEditorPosition,
        coverEditorScale,
        COVER_PHOTO_OUTPUT_WIDTH,
        coverPhotoOutputHeight,
      );
      const nextSource = await createShopPhotoSourceFromSrc(croppedDataUrl);
      setCoverPhotoSource(nextSource);
      updateFormData({ shopCoverPhotoDataUrl: croppedDataUrl });
      setIsCoverEditorOpen(false);
      coverEditorDragStateRef.current = null;
    } catch (error) {
      toast({
        title: "Could not apply cover edits",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsApplyingCoverEdits(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      <div className="space-y-2">
        <OnboardingStepHeader currentStep={2} />
        <h1 className="text-[3rem] font-semibold">About the Owner</h1>
        <p className="text-[14px] text-muted-foreground">Optional but highly recommended!</p>
      </div>

      <div className="vendor-onboarding-step-content">
        <div className="grid gap-y-6 lg:grid-cols-[minmax(0,1.5fr)_3rem_minmax(430px,520px)] xl:grid-cols-[minmax(0,1.5fr)_4rem_minmax(430px,520px)] lg:items-start">
          <div className="space-y-4 rounded-2xl border border-[rgba(154,172,180,0.55)] bg-[#ffffff] p-6 lg:col-[1/2]">
          <div className="space-y-2">
            <Label htmlFor="onboarding-about-owner">Tell your customers about yourself!</Label>
            <Textarea
              id="onboarding-about-owner"
              spellCheck
              value={formData.aboutVendor}
              onChange={(event) => updateFormData({ aboutVendor: event.target.value })}
              placeholder="Share a short intro about the owner."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-shop-hobbies">What are your hobbies?</Label>
            <HobbyPillInput
              id="onboarding-shop-hobbies"
              value={formData.hobbies}
              onChange={(nextHobbies) => updateFormData({ hobbies: nextHobbies })}
              placeholder="Type a hobby and press Enter"
              spellCheck
              pillClassName="border-[#E07A6A] bg-[#E07A6A] text-[#ffffff]"
              pillRemoveButtonClassName="text-[#ffffff]/80 hover:text-[#ffffff]"
              addButtonClassName="editorial-search-btn editorial-search-btn-white-text"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-shop-home-state">Where are you from?</Label>
            <Input
              id="onboarding-shop-home-state"
              spellCheck
              value={formData.homeState}
              onChange={(event) => updateFormData({ homeState: event.target.value })}
              placeholder="Example: Utah"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="onboarding-shop-fun-facts">Fun Facts</Label>
            <Textarea
              id="onboarding-shop-fun-facts"
              spellCheck
              value={formData.funFacts}
              onChange={(event) => updateFormData({ funFacts: event.target.value })}
              placeholder="Optional fun facts customers can read."
              rows={3}
            />
          </div>
        </div>

          <div className="space-y-6 rounded-2xl border border-[rgba(154,172,180,0.55)] bg-[#ffffff] p-6 lg:col-[3/4]">
          <div className="space-y-2">
            <Label>Customize your hub with some photos!</Label>
          </div>

          <div className="space-y-2">
            <Label>Profile photo</Label>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-[rgba(74,106,125,0.22)] bg-muted">
                {profilePhotoSource ? (
                  <img
                    src={profilePhotoSource.src}
                    alt="Owner profile preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">No photo</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={profilePhotoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void handleProfilePhotoFile(file);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="editorial-search-btn editorial-search-btn-white-text"
                  onClick={() => profilePhotoInputRef.current?.click()}
                  disabled={isPreparingProfilePhoto || isApplyingProfileEdits}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {profilePhotoSource ? "Change photo" : "Upload photo"}
                </Button>
                {profilePhotoSource ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[#4A6A7D] hover:text-[#4A6A7D]"
                    onClick={openProfileEditor}
                    disabled={isPreparingProfilePhoto || isApplyingProfileEdits}
                  >
                    Edit photo
                  </Button>
                ) : null}
                {profilePhotoSource ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[#4A6A7D] hover:text-[#4A6A7D]"
                    onClick={() => {
                      setProfilePhotoSource(null);
                      setProfileEditorSource(null);
                      setIsProfileEditorOpen(false);
                      updateFormData({ shopProfilePhotoDataUrl: "" });
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove photo
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This photo appears in My Hub and Vendor Hub as your profile image.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Cover photo</Label>
            <div className="mt-3 space-y-3">
              <div
                className="relative w-full overflow-hidden rounded-xl border border-[rgba(74,106,125,0.22)] bg-muted"
                style={{ aspectRatio: `${vendorHubCoverAspectRatio}` }}
              >
                {coverPhotoSource ? (
                  <img
                    src={coverPhotoSource.src}
                    alt="Owner cover preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                    No cover photo selected
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={coverPhotoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void handleCoverPhotoFile(file);
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="editorial-search-btn editorial-search-btn-white-text"
                  onClick={() => coverPhotoInputRef.current?.click()}
                  disabled={isPreparingCoverPhoto || isApplyingCoverEdits}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {coverPhotoSource ? "Change cover" : "Upload cover"}
                </Button>
                {coverPhotoSource ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[#4A6A7D] hover:text-[#4A6A7D]"
                    onClick={openCoverEditor}
                    disabled={isPreparingCoverPhoto || isApplyingCoverEdits}
                  >
                    Edit cover
                  </Button>
                ) : null}
                {coverPhotoSource ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[#4A6A7D] hover:text-[#4A6A7D]"
                    onClick={() => {
                      setCoverPhotoSource(null);
                      setCoverEditorSource(null);
                      setIsCoverEditorOpen(false);
                      updateFormData({ shopCoverPhotoDataUrl: "" });
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove cover
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This image appears as the hero cover on your Vendor Hub.
            </p>
          </div>
          </div>
        </div>

        <Dialog
          open={isProfileEditorOpen}
          onOpenChange={(open) => {
            setIsProfileEditorOpen(open);
            if (!open) profileEditorDragStateRef.current = null;
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit profile photo</DialogTitle>
              <DialogDescription>Drag to reposition and use the slider to zoom.</DialogDescription>
            </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              {renderPhotoFrame({
                source: profileEditorSource,
                position: profileEditorPosition,
                scale: profileEditorScale,
                frameWidth: PROFILE_EDITOR_PREVIEW_SIZE,
                frameHeight: PROFILE_EDITOR_PREVIEW_SIZE,
                roundedClass: "rounded-full",
                emptyLabel: "No photo selected",
                onPointerDown: (event) => handleProfileEditorPointerDown(event, PROFILE_EDITOR_PREVIEW_SIZE),
                onPointerMove: handleProfileEditorPointerMove,
                onPointerUp: handleProfileEditorPointerEnd,
                onPointerCancel: handleProfileEditorPointerEnd,
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboarding-profile-photo-scale">Zoom</Label>
              <input
                id="onboarding-profile-photo-scale"
                type="range"
                min={PHOTO_EDITOR_MIN_SCALE}
                max={PHOTO_EDITOR_MAX_SCALE}
                step={0.01}
                value={profileEditorScale}
                onChange={(event) => {
                  const nextScale = Number(event.target.value);
                  setProfileEditorScale(
                    Number.isFinite(nextScale)
                      ? clamp(nextScale, PHOTO_EDITOR_MIN_SCALE, PHOTO_EDITOR_MAX_SCALE)
                      : PHOTO_EDITOR_MIN_SCALE,
                  );
                }}
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsProfileEditorOpen(false);
                profileEditorDragStateRef.current = null;
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void applyProfileEdits()} disabled={!profileEditorSource || isApplyingProfileEdits}>
              {isApplyingProfileEdits ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isCoverEditorOpen}
          onOpenChange={(open) => {
            setIsCoverEditorOpen(open);
            if (!open) coverEditorDragStateRef.current = null;
          }}
        >
          <DialogContent className="w-[min(92vw,760px)] sm:max-w-[760px]">
            <DialogHeader>
              <DialogTitle>Edit cover photo</DialogTitle>
              <DialogDescription>Drag to reposition and use the slider to zoom.</DialogDescription>
            </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              {renderPhotoFrame({
                source: coverEditorSource,
                position: coverEditorPosition,
                scale: coverEditorScale,
                frameWidth: coverEditorPreviewWidth,
                frameHeight: coverEditorPreviewHeight,
                roundedClass: "rounded-xl",
                emptyLabel: "No cover selected",
                onPointerDown: (event) =>
                  handleCoverEditorPointerDown(event, coverEditorPreviewWidth, coverEditorPreviewHeight),
                onPointerMove: handleCoverEditorPointerMove,
                onPointerUp: handleCoverEditorPointerEnd,
                onPointerCancel: handleCoverEditorPointerEnd,
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboarding-cover-photo-scale">Zoom</Label>
              <input
                id="onboarding-cover-photo-scale"
                type="range"
                min={PHOTO_EDITOR_MIN_SCALE}
                max={PHOTO_EDITOR_MAX_SCALE}
                step={0.01}
                value={coverEditorScale}
                onChange={(event) => {
                  const nextScale = Number(event.target.value);
                  setCoverEditorScale(
                    Number.isFinite(nextScale)
                      ? clamp(nextScale, PHOTO_EDITOR_MIN_SCALE, PHOTO_EDITOR_MAX_SCALE)
                      : PHOTO_EDITOR_MIN_SCALE,
                  );
                }}
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCoverEditorOpen(false);
                coverEditorDragStateRef.current = null;
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void applyCoverEdits()} disabled={!coverEditorSource || isApplyingCoverEdits}>
              {isApplyingCoverEdits ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="fixed bottom-0 left-24 right-0 z-30 bg-[#ffffff]/96 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 pt-4 pb-8 sm:px-12 lg:px-16">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={onNext}
              className="min-h-[2.7rem] px-6 font-sans text-[1.2rem] font-medium"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
