import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlinePhotoEditor, type ListingPhotoCrop } from "@/components/listings/InlinePhotoEditor";
import { normalizePhotoToUrl, type CoverRatio } from "@/lib/listingPhotos";
import { resolveAssetUrl } from "@/lib/runtimeUrls";
import type { ListingDraft } from "../wizardTypes";
import { MIN_PHOTOS_FOR_PUBLISH, TEMP_UPLOADING_PHOTO_PREFIX } from "../wizardTypes";

function isPersistedPhotoName(name: string): boolean {
  return !name.startsWith(TEMP_UPLOADING_PHOTO_PREFIX) && !name.startsWith("blob:");
}

interface MediaStepProps {
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
  listingId: string | null;
  onPickPhotos: (files: FileList | null) => Promise<void>;
}

export function MediaStep({ draft, setDraft, listingId, onPickPhotos }: MediaStepProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const persistedPhotoNames = draft.photoNames.filter((n) => isPersistedPhotoName(n));
  const hasMinPhotos = persistedPhotoNames.length >= MIN_PHOTOS_FOR_PUBLISH;

  function removePhotoByName(name: string) {
    setDraft((prev) => {
      const idx = prev.photoNames.indexOf(name);
      const newPreviews = [...prev.photoPreviews];
      const newNames = [...prev.photoNames];
      if (idx !== -1) {
        newPreviews.splice(idx, 1);
        newNames.splice(idx, 1);
      }
      const newCrops = { ...prev.photoCropsByName };
      delete newCrops[name];
      return { ...prev, photoPreviews: newPreviews, photoNames: newNames, photoCropsByName: newCrops };
    });
  }

  function reorderPhotos(newOrder: string[]) {
    setDraft((prev) => {
      const newPreviews = newOrder.map((name) => {
        const idx = prev.photoNames.indexOf(name);
        return prev.photoPreviews[idx] ?? "";
      });
      return { ...prev, photoNames: newOrder, photoPreviews: newPreviews };
    });
  }

  function setPhotoCropByName(name: string, crop: ListingPhotoCrop | null) {
    setDraft((prev) => {
      const newCrops = { ...prev.photoCropsByName };
      if (crop === null) {
        delete newCrops[name];
      } else {
        newCrops[name] = crop;
      }
      return { ...prev, photoCropsByName: newCrops };
    });
  }

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Photos</h1>
        <p className="text-base text-muted-foreground">
          Add at least 3 photos to publish. Drafts can be saved with fewer photos.
        </p>
      </header>

      <Card className="space-y-5 p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => void onPickPhotos(event.target.files)}
        />

        <div className="flex flex-wrap gap-3">
          <Button type="button" className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Add photos
          </Button>
          <span className="text-sm text-muted-foreground">
            {draft.photoNames.length} photo{draft.photoNames.length === 1 ? "" : "s"} uploaded
          </span>
        </div>

        <InlinePhotoEditor
          photos={draft.photoNames.map((name, index) => ({
            id: name,
            name,
            src:
              draft.photoPreviews[index] ||
              normalizePhotoToUrl(name) ||
              resolveAssetUrl(`/uploads/listings/${name}`),
          }))}
          coverRatio={draft.coverPhotoRatio}
          cropsByPhotoId={draft.photoCropsByName}
          onAddPhotos={() => fileInputRef.current?.click()}
          onRemovePhoto={removePhotoByName}
          onReorderPhotos={reorderPhotos}
          onCoverRatioChange={(ratio: CoverRatio) => setDraft((prev) => ({ ...prev, coverPhotoRatio: ratio }))}
          onCropChange={setPhotoCropByName}
        />

        {!hasMinPhotos ? (
          <p className="text-sm text-muted-foreground">
            Publish readiness requires at least {MIN_PHOTOS_FOR_PUBLISH} photos.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
