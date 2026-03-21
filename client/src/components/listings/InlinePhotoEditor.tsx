import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COVER_RATIO_OPTIONS, type CoverRatio } from "@/lib/listingPhotos";

export type ListingPhotoCrop = {
  crop: Point;
  zoom: number;
  aspect: number;
  areaPercentages?: Area;
  areaPixels?: Area;
};

export type InlinePhotoItem = {
  id: string;
  name: string;
  src: string;
};

type InlinePhotoEditorProps = {
  photos: InlinePhotoItem[];
  coverRatio: CoverRatio;
  cropsByPhotoId: Record<string, ListingPhotoCrop>;
  onAddPhotos: () => void;
  showAddPhotosButton?: boolean;
  onRemovePhoto: (photoId: string) => void;
  onReorderPhotos: (orderedPhotoIds: string[]) => void;
  onCoverRatioChange: (next: CoverRatio) => void;
  onCropChange: (photoId: string, crop: ListingPhotoCrop | null) => void;
};

function approxEqual(a?: number, b?: number, epsilon = 0.01) {
  const av = typeof a === "number" ? a : 0;
  const bv = typeof b === "number" ? b : 0;
  return Math.abs(av - bv) <= epsilon;
}

function areaEqual(a?: Area, b?: Area) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    approxEqual(a.x, b.x) &&
    approxEqual(a.y, b.y) &&
    approxEqual(a.width, b.width) &&
    approxEqual(a.height, b.height)
  );
}

function cropEqual(a?: ListingPhotoCrop, b?: ListingPhotoCrop) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    approxEqual(a.crop?.x, b.crop?.x) &&
    approxEqual(a.crop?.y, b.crop?.y) &&
    approxEqual(a.zoom, b.zoom) &&
    approxEqual(a.aspect, b.aspect) &&
    areaEqual(a.areaPercentages, b.areaPercentages) &&
    areaEqual(a.areaPixels, b.areaPixels)
  );
}

function SortablePhotoTile({
  id,
  src,
  isCover,
  isSelected,
  aspect,
  onSelect,
  onRemove,
}: {
  id: string;
  src: string;
  isCover: boolean;
  isSelected: boolean;
  aspect: number;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <button
        type="button"
        className={[
          "relative w-full overflow-hidden rounded-lg border bg-muted text-left",
          isSelected ? "ring-2 ring-primary border-primary" : "",
        ].join(" ")}
        style={{ aspectRatio: String(aspect) }}
        onClick={onSelect}
        {...attributes}
        {...listeners}
        title={isCover ? "Cover photo" : "Gallery photo"}
      >
        <img src={src} alt={isCover ? "Cover photo" : "Gallery photo"} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">
          {isCover ? "Cover" : "Photo"}
        </div>
        <button
          type="button"
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </button>
    </div>
  );
}

export function InlinePhotoEditor({
  photos,
  coverRatio,
  cropsByPhotoId,
  onAddPhotos,
  showAddPhotosButton = true,
  onRemovePhoto,
  onReorderPhotos,
  onCoverRatioChange,
  onCropChange,
}: InlinePhotoEditorProps) {
  const photoIds = useMemo(() => photos.map((p) => p.id), [photos]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(photoIds[0] ?? null);

  useEffect(() => {
    if (!selectedPhotoId || !photoIds.includes(selectedPhotoId)) {
      setSelectedPhotoId(photoIds[0] ?? null);
    }
  }, [photoIds, selectedPhotoId]);

  const selectedIndex = selectedPhotoId ? photoIds.indexOf(selectedPhotoId) : -1;
  const selectedPhoto = selectedIndex >= 0 ? photos[selectedIndex] : null;
  const selectedIsCover = selectedIndex === 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [aspect, setAspect] = useState<number>(4 / 5);
  const [cropAreaPercentages, setCropAreaPercentages] = useState<Area | undefined>(undefined);
  const [cropAreaPixels, setCropAreaPixels] = useState<Area | undefined>(undefined);
  const orientationDragRef = useRef<{ x: number; y: number; aspect: number } | null>(null);
  const coverAspect = useMemo(() => {
    const [wRaw, hRaw] = String(coverRatio).split(":");
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 2 / 3;
    return w / h;
  }, [coverRatio]);

  const applyAspect = (nextAspect: number) => {
    if (!Number.isFinite(nextAspect) || nextAspect <= 0) return;
    setAspect(nextAspect);
  };

  useEffect(() => {
    if (!selectedPhoto) return;
    const saved = cropsByPhotoId[selectedPhoto.id];
    setCrop(saved?.crop ?? { x: 0, y: 0 });
    setZoom(saved?.zoom ?? 1);
    const nextAspect = selectedIsCover
      ? coverAspect
      : saved?.aspect && Number.isFinite(saved.aspect) && saved.aspect > 0
        ? saved.aspect
        : 4 / 5;
    setAspect(nextAspect);
    setCropAreaPercentages(saved?.areaPercentages);
    setCropAreaPixels(saved?.areaPixels);
  }, [coverAspect, cropsByPhotoId, selectedIsCover, selectedPhoto]);

  const startOrientationDrag = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!selectedPhoto || selectedIsCover) return;
    event.preventDefault();
    event.stopPropagation();

    orientationDragRef.current = {
      x: event.clientX,
      y: event.clientY,
      aspect,
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!orientationDragRef.current) return;
      const deltaX = moveEvent.clientX - orientationDragRef.current.x;
      const deltaY = moveEvent.clientY - orientationDragRef.current.y;
      const nextAspect = Math.max(0.45, Math.min(2.2, orientationDragRef.current.aspect + (deltaX - deltaY) * 0.0035));
      setAspect(nextAspect);
    };

    const onMouseUp = () => {
      orientationDragRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = photoIds.indexOf(String(active.id));
    const newIndex = photoIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorderPhotos(arrayMove(photoIds, oldIndex, newIndex));
  };

  useEffect(() => {
    if (!selectedPhoto) return;
    if (!cropAreaPercentages || !cropAreaPixels) return;

    const pendingCrop: ListingPhotoCrop = {
      crop,
      zoom,
      aspect,
      areaPercentages: cropAreaPercentages,
      areaPixels: cropAreaPixels,
    };
    const existingCrop = cropsByPhotoId[selectedPhoto.id];
    if (cropEqual(existingCrop, pendingCrop)) return;

    const timer = window.setTimeout(() => {
      onCropChange(selectedPhoto.id, pendingCrop);
    }, 140);

    return () => window.clearTimeout(timer);
  }, [
    selectedPhoto,
    selectedIsCover,
    crop,
    zoom,
    aspect,
    cropAreaPercentages,
    cropAreaPixels,
    cropsByPhotoId,
    onCropChange,
  ]);

  const resetCurrentCrop = () => {
    if (!selectedPhoto) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    applyAspect(selectedIsCover ? coverAspect : 4 / 5);
    setCropAreaPercentages(undefined);
    setCropAreaPixels(undefined);
    onCropChange(selectedPhoto.id, null);
  };

  if (photos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground space-y-3">
        <div>No photos added yet.</div>
        {showAddPhotosButton && (
          <Button type="button" variant="outline" onClick={onAddPhotos}>
            Add photos
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">Photo order and editing</div>
          <div className="text-sm text-muted-foreground">
            Drag photos to reorder. The first photo is always your cover photo.
          </div>
        </div>
        {showAddPhotosButton && (
          <Button type="button" variant="outline" onClick={onAddPhotos}>
            Add photos
          </Button>
        )}
      </div>

      {selectedPhoto && (
        <div className="space-y-5">
          <div className="space-y-3">
            {selectedIsCover ? (
              <>
                <div className="text-sm font-medium">Cover orientation</div>
                <div className="flex flex-wrap gap-2">
                  {COVER_RATIO_OPTIONS.map((ratio) => (
                    <Button
                      key={ratio}
                      type="button"
                      variant={coverRatio === ratio ? "default" : "outline"}
                      onClick={() => onCoverRatioChange(ratio)}
                    >
                      {ratio}
                    </Button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  Drag inside the cover box to position the image.
                </div>
                <div className="relative w-full max-w-[940px] h-[520px] md:h-[620px] overflow-hidden rounded-lg border bg-muted">
                  <Cropper
                    image={selectedPhoto.src}
                    crop={crop}
                    zoom={zoom}
                    aspect={coverAspect}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(area, areaPixels) => {
                      setCropAreaPercentages(area);
                      setCropAreaPixels(areaPixels);
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={resetCurrentCrop}>
                    Reset crop
                  </Button>
                  <div className="text-xs text-muted-foreground">Changes save automatically.</div>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium">Crop gallery photo</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Aspect presets:</span>
                  {[
                    { label: "1:1", value: 1 },
                    { label: "4:5", value: 4 / 5 },
                    { label: "2:3", value: 2 / 3 },
                    { label: "9:16", value: 9 / 16 },
                    { label: "16:9", value: 16 / 9 },
                  ].map((opt) => (
                    <Button
                      key={opt.label}
                      type="button"
                      size="sm"
                      variant={approxEqual(aspect, opt.value, 0.02) ? "default" : "outline"}
                      onClick={() => applyAspect(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  Use the bottom-right corner of the selected photo area to change orientation.
                </div>

                <div className="relative w-full max-w-[940px] h-[520px] md:h-[620px] overflow-hidden rounded-lg border bg-muted">
                  <Cropper
                    image={selectedPhoto.src}
                    crop={crop}
                    zoom={zoom}
                    aspect={aspect}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(area, areaPixels) => {
                      setCropAreaPercentages(area);
                      setCropAreaPixels(areaPixels);
                    }}
                  />
                  <button
                    type="button"
                    className="absolute bottom-2 right-2 h-7 w-7 rounded bg-black/55 text-white cursor-nwse-resize hover:bg-black/70"
                    onMouseDown={startOrientationDrag}
                    aria-label="Adjust non-cover orientation"
                    title="Drag to adjust orientation"
                  >
                    <span className="block text-xs leading-none">◢</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={resetCurrentCrop}>
                    Reset crop
                  </Button>
                  <div className="text-xs text-muted-foreground">Changes save automatically.</div>
                </div>
              </>
            )}
          </div>

          <div className="space-y-2 relative">
            <div className="text-sm font-medium">All photos</div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={photoIds} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {photos.map((photo, idx) => {
                    return (
                      <SortablePhotoTile
                        key={photo.id}
                        id={photo.id}
                        src={photo.src}
                        isCover={idx === 0}
                        isSelected={selectedPhotoId === photo.id}
                        aspect={4 / 5}
                        onSelect={() => setSelectedPhotoId(photo.id)}
                        onRemove={() => onRemovePhoto(photo.id)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}
    </div>
  );
}
