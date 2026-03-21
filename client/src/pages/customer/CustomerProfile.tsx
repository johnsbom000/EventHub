import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Edit, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const ACCEPTED_PROFILE_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PROFILE_PHOTO_SOURCE_BYTES = 20 * 1024 * 1024;
const PROFILE_PHOTO_MAX_DIMENSION = 1024;
const PROFILE_PHOTO_TARGET_BYTES = 450 * 1024;
const PROFILE_PHOTO_QUALITIES = [0.9, 0.82, 0.74, 0.66, 0.58];
const PROFILE_PHOTO_OUTPUT_SIZE = 512;
const PROFILE_CARD_PREVIEW_SIZE = 80;
const PROFILE_EDITOR_PREVIEW_SIZE = 64;
const PROFILE_MODAL_PREVIEW_SIZE = 224;

type ProfilePhotoPosition = {
  x: number;
  y: number;
};

type ProfilePhotoSource = {
  dataUrl: string;
  width: number;
  height: number;
};

type PhotoBounds = {
  renderWidth: number;
  renderHeight: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

interface CustomerProfileProps {
  customer: {
    id: string;
    name: string;
    displayName?: string | null;
    profilePhotoDataUrl?: string | null;
    email: string;
  };
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
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getPhotoBounds(source: ProfilePhotoSource, frameSize: number, scaleMultiplier = 1): PhotoBounds {
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

function getPhotoOffsets(bounds: PhotoBounds, position: ProfilePhotoPosition) {
  return {
    x: bounds.maxOffsetX === 0 ? 0 : clamp(position.x, -1, 1) * bounds.maxOffsetX,
    y: bounds.maxOffsetY === 0 ? 0 : clamp(position.y, -1, 1) * bounds.maxOffsetY,
  };
}

function normalizePositionFromOffsets(
  bounds: PhotoBounds,
  offsetX: number,
  offsetY: number,
): ProfilePhotoPosition {
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

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image"));
    image.src = dataUrl;
  });
}

function buildResizedCanvas(image: HTMLImageElement) {
  const maxDimension = Math.max(image.width, image.height);
  const scale = maxDimension > PROFILE_PHOTO_MAX_DIMENSION ? PROFILE_PHOTO_MAX_DIMENSION / maxDimension : 1;
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
  let bestDataUrl = pickSmallestEncodedDataUrl(canvas, PROFILE_PHOTO_QUALITIES[0]);
  let bestBytes = estimateDataUrlBytes(bestDataUrl);
  if (bestBytes <= targetBytes) return bestDataUrl;

  for (const quality of PROFILE_PHOTO_QUALITIES.slice(1)) {
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

async function optimizeProfilePhoto(file: File): Promise<ProfilePhotoSource> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(originalDataUrl);
  const canvas = buildResizedCanvas(image);
  const dataUrl = encodeCanvasForTarget(canvas, PROFILE_PHOTO_TARGET_BYTES);
  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
  };
}

async function createPhotoSourceFromDataUrl(dataUrl: string): Promise<ProfilePhotoSource> {
  const image = await loadImageFromDataUrl(dataUrl);
  return {
    dataUrl,
    width: image.width,
    height: image.height,
  };
}

async function buildCroppedProfilePhotoDataUrl(
  source: ProfilePhotoSource,
  position: ProfilePhotoPosition,
  scaleMultiplier: number,
): Promise<string> {
  const image = await loadImageFromDataUrl(source.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = PROFILE_PHOTO_OUTPUT_SIZE;
  canvas.height = PROFILE_PHOTO_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image");
  }

  const bounds = getPhotoBounds(source, PROFILE_PHOTO_OUTPUT_SIZE, scaleMultiplier);
  const offsets = getPhotoOffsets(bounds, position);
  const drawX = (PROFILE_PHOTO_OUTPUT_SIZE - bounds.renderWidth) / 2 + offsets.x;
  const drawY = (PROFILE_PHOTO_OUTPUT_SIZE - bounds.renderHeight) / 2 + offsets.y;
  context.drawImage(image, drawX, drawY, bounds.renderWidth, bounds.renderHeight);

  return encodeCanvasForTarget(canvas, PROFILE_PHOTO_TARGET_BYTES);
}

export default function CustomerProfile({ customer }: CustomerProfileProps) {
  const resolvedDisplayName = customer.displayName?.trim() || customer.name;
  const resolvedProfilePhotoDataUrl =
    typeof customer.profilePhotoDataUrl === "string" && customer.profilePhotoDataUrl.trim().length > 0
      ? customer.profilePhotoDataUrl.trim()
      : null;

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(resolvedDisplayName);
  const [profilePhotoSource, setProfilePhotoSource] = useState<ProfilePhotoSource | null>(null);
  const [profilePhotoPosition, setProfilePhotoPosition] = useState<ProfilePhotoPosition>({ x: 0, y: 0 });
  const [profilePhotoScale, setProfilePhotoScale] = useState(1);
  const [isPhotoEditorOpen, setIsPhotoEditorOpen] = useState(false);
  const [editorPhotoPosition, setEditorPhotoPosition] = useState<ProfilePhotoPosition>({ x: 0, y: 0 });
  const [editorPhotoScale, setEditorPhotoScale] = useState(1);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPosition: ProfilePhotoPosition;
    startScale: number;
    frameSize: number;
  } | null>(null);

  const hydrateResolvedProfilePhoto = async (photoDataUrl: string | null) => {
    if (!photoDataUrl) {
      setProfilePhotoSource(null);
      setProfilePhotoPosition({ x: 0, y: 0 });
      setProfilePhotoScale(1);
      return;
    }

    try {
      const source = await createPhotoSourceFromDataUrl(photoDataUrl);
      setProfilePhotoSource(source);
      setProfilePhotoPosition({ x: 0, y: 0 });
      setProfilePhotoScale(1);
    } catch {
      setProfilePhotoSource(null);
      setProfilePhotoPosition({ x: 0, y: 0 });
      setProfilePhotoScale(1);
    }
  };

  useEffect(() => {
    setDisplayName(resolvedDisplayName);
  }, [resolvedDisplayName]);

  useEffect(() => {
    let cancelled = false;
    if (!resolvedProfilePhotoDataUrl) {
      setProfilePhotoSource(null);
      setProfilePhotoPosition({ x: 0, y: 0 });
      setProfilePhotoScale(1);
      return () => {
        cancelled = true;
      };
    }

    createPhotoSourceFromDataUrl(resolvedProfilePhotoDataUrl)
      .then((source) => {
        if (cancelled) return;
        setProfilePhotoSource(source);
        setProfilePhotoPosition({ x: 0, y: 0 });
        setProfilePhotoScale(1);
      })
      .catch(() => {
        if (cancelled) return;
        setProfilePhotoSource(null);
        setProfilePhotoPosition({ x: 0, y: 0 });
        setProfilePhotoScale(1);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedProfilePhotoDataUrl]);

  const saveProfileMutation = useMutation({
    mutationFn: async ({
      nextDisplayName,
      nextProfilePhotoDataUrl,
    }: {
      nextDisplayName: string;
      nextProfilePhotoDataUrl: string | null;
    }) => {
      const res = await apiRequest("PATCH", "/api/customer/me", {
        displayName: nextDisplayName,
        profilePhotoDataUrl: nextProfilePhotoDataUrl,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : "Unable to update profile.";
      toast({
        title: "Update failed",
        description,
        variant: "destructive",
      });
    },
  });

  const saveProfilePhotoMutation = useMutation({
    mutationFn: async ({ nextProfilePhotoDataUrl }: { nextProfilePhotoDataUrl: string | null }) => {
      const res = await apiRequest("PATCH", "/api/customer/me", {
        profilePhotoDataUrl: nextProfilePhotoDataUrl,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customer/me"] });
    },
    onError: (error: unknown) => {
      const description = error instanceof Error ? error.message : "Unable to update profile photo.";
      toast({
        title: "Photo update failed",
        description,
        variant: "destructive",
      });
    },
  });

  const persistProfilePhoto = async (
    nextSource: ProfilePhotoSource | null,
    nextPosition: ProfilePhotoPosition,
    nextScale: number,
  ) => {
    if (isPreparingPhoto || saveProfilePhotoMutation.isPending) return;

    const previousSource = profilePhotoSource;
    const previousPosition = profilePhotoPosition;
    const previousScale = profilePhotoScale;

    setProfilePhotoSource(nextSource);
    setProfilePhotoPosition(nextPosition);
    setProfilePhotoScale(nextScale);
    setIsPhotoEditorOpen(false);

    setIsPreparingPhoto(true);
    try {
      let nextProfilePhotoDataUrl: string | null = null;
      if (nextSource) {
        const croppedDataUrl = await buildCroppedProfilePhotoDataUrl(nextSource, nextPosition, nextScale);
        if (estimateDataUrlBytes(croppedDataUrl) > MAX_PROFILE_PHOTO_BYTES) {
          toast({
            title: "Image too large",
            description: "Optimized profile photo must be 2MB or less.",
            variant: "destructive",
          });
          throw new Error("Optimized profile photo must be 2MB or less.");
        }
        nextProfilePhotoDataUrl = croppedDataUrl;
      }

      await saveProfilePhotoMutation.mutateAsync({
        nextProfilePhotoDataUrl,
      });
    } catch {
      setProfilePhotoSource(previousSource);
      setProfilePhotoPosition(previousPosition);
      setProfilePhotoScale(previousScale);
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  const handleProfilePhotoFile = async (file: File) => {
    if (!ACCEPTED_PROFILE_PHOTO_TYPES.has(file.type)) {
      toast({
        title: "Unsupported image format",
        description: "Use PNG, JPG, WEBP, or GIF.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_SOURCE_BYTES) {
      toast({
        title: "Image too large",
        description: "Please choose a photo under 20MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      const optimized = await optimizeProfilePhoto(file);
      if (estimateDataUrlBytes(optimized.dataUrl) > MAX_PROFILE_PHOTO_BYTES) {
        toast({
          title: "Image too large",
          description: "Optimized profile photo must be 2MB or less.",
          variant: "destructive",
        });
        return;
      }

      await persistProfilePhoto(optimized, { x: 0, y: 0 }, 1);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unable to process image.",
        variant: "destructive",
      });
    }
  };

  const dragPhotoTo = (
    deltaX: number,
    deltaY: number,
    startPosition: ProfilePhotoPosition,
    frameSize: number,
    scaleMultiplier: number,
  ) => {
    if (!profilePhotoSource) return startPosition;
    const bounds = getPhotoBounds(profilePhotoSource, frameSize, scaleMultiplier);
    const startOffsets = getPhotoOffsets(bounds, startPosition);
    const nextOffsetX = clamp(startOffsets.x + deltaX, -bounds.maxOffsetX, bounds.maxOffsetX);
    const nextOffsetY = clamp(startOffsets.y + deltaY, -bounds.maxOffsetY, bounds.maxOffsetY);
    return normalizePositionFromOffsets(bounds, nextOffsetX, nextOffsetY);
  };

  const handlePhotoEditorPointerDown = (event: React.PointerEvent<HTMLDivElement>, frameSize: number) => {
    if (!isEditing || !isPhotoEditorOpen || !profilePhotoSource) return;
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
    if (!dragState || dragState.pointerId !== event.pointerId || !profilePhotoSource) return;
    event.preventDefault();
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    setEditorPhotoPosition(
      dragPhotoTo(deltaX, deltaY, dragState.startPosition, dragState.frameSize, dragState.startScale),
    );
  };

  const handlePhotoEditorPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSave = async () => {
    const nextDisplayName = displayName.trim();
    if (!nextDisplayName) {
      toast({
        title: "Display name required",
        description: "Please enter a display name.",
        variant: "destructive",
      });
      return;
    }

    if (isPreparingPhoto || saveProfileMutation.isPending) return;

    setIsPreparingPhoto(true);
    let nextProfilePhotoDataUrl: string | null = null;
    try {
      if (profilePhotoSource) {
        const croppedDataUrl = await buildCroppedProfilePhotoDataUrl(
          profilePhotoSource,
          profilePhotoPosition,
          profilePhotoScale,
        );
        if (estimateDataUrlBytes(croppedDataUrl) > MAX_PROFILE_PHOTO_BYTES) {
          toast({
            title: "Image too large",
            description: "Optimized profile photo must be 2MB or less.",
            variant: "destructive",
          });
          return;
        }
        nextProfilePhotoDataUrl = croppedDataUrl;
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unable to process image.",
        variant: "destructive",
      });
      return;
    } finally {
      setIsPreparingPhoto(false);
    }

    saveProfileMutation.mutate({
      nextDisplayName,
      nextProfilePhotoDataUrl,
    });
  };

  const activeNameForInitials = displayName.trim() || resolvedDisplayName;
  const activeInitials = getInitials(activeNameForInitials);
  const isSaving = saveProfileMutation.isPending || saveProfilePhotoMutation.isPending || isPreparingPhoto;

  const openPhotoEditor = () => {
    if (!profilePhotoSource) return;
    setEditorPhotoPosition(profilePhotoPosition);
    setEditorPhotoScale(profilePhotoScale);
    setIsPhotoEditorOpen(true);
  };

  const applyPhotoEditorChanges = () => {
    if (!profilePhotoSource) return;
    void persistProfilePhoto(profilePhotoSource, editorPhotoPosition, editorPhotoScale);
  };

  const renderProfilePhotoCircle = ({
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
    source: ProfilePhotoSource | null;
    position: ProfilePhotoPosition;
    scaleMultiplier?: number;
    dataTestId?: string;
    onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void;
  }) => {
    const bounds = source ? getPhotoBounds(source, frameSize, scaleMultiplier ?? 1) : null;
    const offsets = bounds ? getPhotoOffsets(bounds, position) : null;
    const isInteractive = Boolean(onPointerDown && source && isEditing);

    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-primary text-primary-foreground font-medium flex items-center justify-center select-none",
          className,
          isInteractive ? "cursor-grab active:cursor-grabbing touch-none" : "",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        data-testid={dataTestId}
      >
        {source && bounds && offsets && (
          <>
            <img
              src={source.dataUrl}
              alt="Profile photo base"
              className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              draggable={false}
            />
            <img
              src={source.dataUrl}
              alt="Profile photo preview"
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
        )}
        <span className={source ? "opacity-0" : "opacity-100"}>{activeInitials}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-profile-title">
          My profile
        </h1>
        <p className="text-muted-foreground mt-1">
          Complete your profile to help vendors understand your needs better
        </p>
      </div>

      <Card className="rounded-xl border-0 bg-transparent shadow-none">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            {renderProfilePhotoCircle({
              frameSize: PROFILE_CARD_PREVIEW_SIZE,
              className: "h-20 w-20 text-2xl",
              source: profilePhotoSource,
              position: profilePhotoPosition,
              scaleMultiplier: profilePhotoScale,
              dataTestId: "avatar-profile-card",
            })}
            <div>
              <h2 className="text-2xl font-bold" data-testid="text-customer-name">
                {resolvedDisplayName}
              </h2>
              <p className="text-muted-foreground">Guest</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />

      <Card className="rounded-xl border-0 bg-transparent shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Profile details</CardTitle>
            <CardDescription>
              This information will be visible to vendors you contact
            </CardDescription>
          </div>
          {!isEditing && (
            <Button
              variant="outline"
              onClick={() => setIsEditing(true)}
              data-testid="button-edit-profile"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={!isEditing}
              className="mt-1.5"
              data-testid="input-display-name"
            />
          </div>

          <div>
            <Label htmlFor="profilePhoto">Profile picture (optional)</Label>
            <div
              className="mt-1.5 rounded-lg border border-dashed border-border p-4"
              onDragOver={(event) => {
                if (!isEditing) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!isEditing) return;
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void handleProfilePhotoFile(file);
                }
              }}
            >
              <div className="flex flex-wrap items-center gap-4">
                {renderProfilePhotoCircle({
                  frameSize: PROFILE_EDITOR_PREVIEW_SIZE,
                  className: "h-16 w-16 text-base ring-1 ring-border",
                  source: profilePhotoSource,
                  position: profilePhotoPosition,
                  scaleMultiplier: profilePhotoScale,
                  dataTestId: "avatar-profile-editor",
                })}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={profilePhotoInputRef}
                    id="profilePhoto"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                    disabled={!isEditing}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleProfilePhotoFile(file);
                      }
                      event.currentTarget.value = "";
                    }}
                    data-testid="input-profile-photo"
                  />
                  <div className="flex flex-col items-start gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!isEditing}
                      className="h-9 px-4 py-2 text-sm"
                      onClick={() => {
                        if (profilePhotoSource) {
                          openPhotoEditor();
                        } else {
                          profilePhotoInputRef.current?.click();
                        }
                      }}
                      data-testid="button-upload-profile-photo"
                    >
                      {profilePhotoSource ? "Edit photo" : "Upload photo"}
                    </Button>
                    {profilePhotoSource && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!isEditing}
                        className="h-auto px-0 py-0 text-sm font-medium"
                        onClick={() => profilePhotoInputRef.current?.click()}
                        data-testid="button-change-profile-photo"
                      >
                        Change Photo
                      </Button>
                    )}
                  </div>
                  {profilePhotoSource && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!isEditing}
                      onClick={() => {
                        void persistProfilePhoto(null, { x: 0, y: 0 }, 1);
                      }}
                      data-testid="button-revert-profile-photo"
                    >
                      Use initials
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Drop one image here or upload one (PNG, JPG, WEBP, or GIF). Drag inside the circle to fit the photo. Saved photo stays under 2MB.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={customer.email}
              disabled
              className="mt-1.5"
              data-testid="input-email"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Email cannot be changed
            </p>
          </div>

          <div>
            <Label htmlFor="bio">About me</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              disabled={!isEditing}
              placeholder="Tell vendors a bit about yourself..."
              className="mt-1.5 min-h-24"
              data-testid="input-bio"
            />
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              disabled={!isEditing}
              placeholder="City, State"
              className="mt-1.5"
              data-testid="input-location"
            />
          </div>

          {isEditing && (
            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => void handleSave()}
                disabled={isSaving}
                data-testid="button-save-profile"
              >
                <Check className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDisplayName(resolvedDisplayName);
                  void hydrateResolvedProfilePhoto(resolvedProfilePhotoDataUrl);
                  setIsEditing(false);
                }}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isPhotoEditorOpen} onOpenChange={setIsPhotoEditorOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-photo-editor">
          <DialogHeader>
            <DialogTitle>Edit photo</DialogTitle>
            <DialogDescription>
              Drag to move your photo and use the slider to scale it inside the circle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              {renderProfilePhotoCircle({
                frameSize: PROFILE_MODAL_PREVIEW_SIZE,
                className: "h-56 w-56 text-4xl ring-1 ring-border",
                source: profilePhotoSource,
                position: editorPhotoPosition,
                scaleMultiplier: editorPhotoScale,
                dataTestId: "avatar-photo-editor-modal",
                onPointerDown: (event) => handlePhotoEditorPointerDown(event, PROFILE_MODAL_PREVIEW_SIZE),
                onPointerMove: handlePhotoEditorPointerMove,
                onPointerUp: handlePhotoEditorPointerEnd,
                onPointerCancel: handlePhotoEditorPointerEnd,
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="photo-scale">Scale</Label>
              <input
                id="photo-scale"
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
                data-testid="slider-photo-scale"
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
    </div>
  );
}
