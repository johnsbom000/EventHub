import { useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { useAuth0 } from "@auth0/auth0-react";
import { getFreshAccessToken } from "@/lib/authToken";
import { SubcategoryPicker } from "@/components/listings/SubcategoryPicker";
import { Button } from "@/components/ui/button";
import type {
  AiListingDraftResponse,
  AiListingDraftResult,
} from "@shared/aiListingDraft";

import {
  DEFAULT_DRAFT,
  LISTING_TAG_KEY,
  type ListingCategory,
  type ListingDraft,
} from "./wizardTypes";

// v1 supports Rentals + Services only (see server/aiListingDraftService.ts).
const AI_CATEGORY_OPTIONS: Array<{ value: Extract<ListingCategory, "Rental" | "Service">; label: string }> = [
  { value: "Rental", label: "Rental" },
  { value: "Service", label: "Service" },
];

const MAX_PHOTOS = 6;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// The vision call reads photos + writes copy; give it generous headroom before
// falling back so a slow-but-succeeding request isn't cut off prematurely.
const GENERATE_TIMEOUT_MS = 90_000;

type UploadedPhoto = { url: string; filename: string; storagePath?: string; preview: string };

async function uploadPhoto(file: File): Promise<{ url: string; filename: string; storagePath?: string }> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error("Please sign in to upload photos.");

  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch("/api/uploads/listing-photo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("That photo couldn't be uploaded. Try a JPG, PNG, or WebP under 10MB.");
  }
  return (await response.json()) as { url: string; filename: string; storagePath?: string };
}

/** Map the AI result + the vendor's picks into the wizard's ListingDraft shape. */
function buildDraftFromAi(
  resp: AiListingDraftResponse,
  photos: UploadedPhoto[]
): ListingDraft {
  const ai: AiListingDraftResult = resp.draft;
  // The AI echoes the canonical plural ("Rentals"/"Services"); the wizard uses
  // the singular enum ("Rental"/"Service").
  const category: ListingCategory = resp.category === "Rentals" ? "Rental" : "Service";

  return {
    ...DEFAULT_DRAFT,
    category,
    subcategory: resp.subcategory,
    subcategoryDetail: resp.subcategoryDetail ?? "",
    listingTitle: ai.title,
    listingDescription: ai.description,
    whatsIncluded: ai.whatsIncluded,
    whatsNotIncluded: ai.whatsNotIncluded,
    popularFor: ai.popularFor,
    pricingUnit: ai.pricingUnit,
    // Suggested price is an ESTIMATE — the vendor confirms it in the wizard.
    rate: ai.suggestedPriceCents != null ? (ai.suggestedPriceCents / 100).toString() : "",
    tagsByPropType: {
      [LISTING_TAG_KEY]: ai.tags.map((label) => ({
        label,
        slug: label.toLowerCase().trim().replace(/\s+/g, "-"),
      })),
    },
    photoNames: photos.map((p) => p.storagePath ?? p.filename),
    photoPreviews: photos.map((p) => p.url),
  };
}

export type AiListingIntakeProps = {
  /** Called with a pre-populated draft once generation succeeds. */
  onDrafted: (draft: ListingDraft) => void;
  /** Called when the vendor backs out / chooses to start blank instead. */
  onCancel: () => void;
};

export function AiListingIntake({ onDrafted, onCancel }: AiListingIntakeProps) {
  const { isAuthenticated } = useAuth0();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [category, setCategory] = useState<"Rental" | "Service" | "">("");
  const [subcategory, setSubcategory] = useState("");
  const [subcategoryDetail, setSubcategoryDetail] = useState("");

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickPhotos(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    if (!isAuthenticated) {
      setError("Please sign in to upload photos.");
      return;
    }
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files)
      .filter((f) => ACCEPTED_TYPES.includes(f.type))
      .slice(0, Math.max(0, room));
    if (chosen.length === 0) return;

    setUploading(true);
    try {
      const uploaded = await Promise.all(
        chosen.map(async (file) => {
          const res = await uploadPhoto(file);
          return { ...res, preview: res.url };
        })
      );
      setPhotos((prev) => [...prev, ...uploaded].slice(0, MAX_PHOTOS));
    } catch (err: any) {
      setError(err?.message || "Some photos couldn't be uploaded.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    setError(null);
    if (photos.length === 0) {
      setError("Add at least one photo first.");
      return;
    }
    if (!category || !subcategory) {
      setError("Pick a category and subcategory so we know what we're describing.");
      return;
    }

    setGenerating(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error("Please sign in to continue.");

      const response = await fetch("/api/vendor/ai/draft-listing", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          category,
          subcategory,
          subcategoryDetail: subcategoryDetail || null,
          photoUrls: photos.map((p) => p.url),
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.message || "We couldn't generate a draft. You can fill it in yourself.");
      }
      onDrafted(buildDraftFromAi(json as AiListingDraftResponse, photos));
    } catch (err: any) {
      const aborted = err?.name === "AbortError";
      setError(
        aborted
          ? "That took too long. You can try again or fill in the listing yourself."
          : err?.message || "We couldn't generate a draft. You can fill it in yourself."
      );
    } finally {
      clearTimeout(timeout);
      setGenerating(false);
    }
  }

  const canGenerate = photos.length > 0 && !!category && !!subcategory && !uploading && !generating;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-start gap-3">
        <Sparkles className="mt-1 h-6 w-6 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fill with AI</h1>
          <p className="text-sm text-muted-foreground">
            Upload a few photos and tell us the category — we'll draft the title, description,
            what's included, tags, and a suggested price. You'll review and edit everything before
            publishing.
          </p>
        </div>
      </div>

      {/* Step 1 — photos */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-foreground">1. Add photos</h2>
        <div className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <div key={p.url} className="relative h-24 w-24 overflow-hidden rounded-xl border">
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground transition hover:bg-muted disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : "+ Photo"}
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handlePickPhotos(e.target.files)}
        />
        <p className="mt-2 text-xs text-muted-foreground">Up to {MAX_PHOTOS} photos. JPG, PNG, or WebP.</p>
      </section>

      {/* Step 2 — category */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-foreground">2. What is it?</h2>
        <div className="mb-3 grid grid-cols-2 gap-3">
          {AI_CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setCategory(opt.value);
                setSubcategory("");
                setSubcategoryDetail("");
              }}
              className={[
                "rounded-xl border px-4 py-3 text-sm font-medium transition",
                category === opt.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "hover:bg-muted",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {category ? (
          <SubcategoryPicker
            category={category}
            value={{ subcategory, subcategoryDetail }}
            onChange={(next) => {
              setSubcategory(next.subcategory);
              setSubcategoryDetail(next.subcategoryDetail);
            }}
          />
        ) : null}
      </section>

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button onClick={handleGenerate} disabled={!canGenerate} className="sm:min-w-44">
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Drafting…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Generate draft
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={generating}>
          Fill it in myself
        </Button>
      </div>
    </div>
  );
}
