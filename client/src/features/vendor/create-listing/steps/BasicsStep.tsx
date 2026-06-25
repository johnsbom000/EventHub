import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubcategoryPicker } from "@/components/listings/SubcategoryPicker";
import type {
  ListingDraft,
  ListingCategory,
  DimensionUnit,
} from "../wizardTypes";
import {
  CATEGORY_OPTIONS,
  LISTING_TAG_KEY,
  DESCRIPTION_MAX_CHARS,
  DIMENSION_UNIT_OPTIONS,
} from "../wizardTypes";

type ListingHelperCategory = "rental" | "venue" | "service" | "caterer";
type ListingTag = { label: string; slug: string };

const CATEGORY_HELPER_TEXT: Record<
  ListingHelperCategory,
  { description: string; included: string; tags: string }
> = {
  rental: {
    description: "Describe the style, condition, materials, dimensions, and how this rental is typically used.",
    included: "Clarify exactly what the customer gets: pieces, quantities, color/style notes, and exclusions.",
    tags: "Examples: material, color, decor style, event type.",
  },
  venue: {
    description: "Describe the space, atmosphere, capacity, layout, and types of events hosted.",
    included: "Clarify what comes with the venue: tables, chairs, prep areas, parking, and restrictions.",
    tags: "Examples: indoor, outdoor, capacity, wedding venue.",
  },
  service: {
    description: "Describe what you do, your experience, and what customers should expect.",
    included: "Clarify what is included: hours, setup time, travel radius, and equipment.",
    tags: "Examples: DJ, photography, coordination, lighting.",
  },
  caterer: {
    description: "Describe your food style, specialties, and service style (buffet, plated, drop-off).",
    included: "Clarify what is included: food quantity, staff, utensils, setup, cleanup.",
    tags: "Examples: cuisine type, buffet, desserts, dietary options.",
  },
};

function toHelperCategory(category: ListingCategory | ""): ListingHelperCategory {
  if (category === "Venue") return "venue";
  if (category === "Service") return "service";
  if (category === "Catering") return "caterer";
  return "rental";
}

function normalizeTitleInput(value: string, max: number): string {
  return value.slice(0, max);
}

function normalizeDimensionInput(value: string): string {
  return value.replace(/[^\d.]/g, "").slice(0, 8);
}

interface BasicsStepProps {
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
  showValidation: boolean;
  /** When true (package_container), hides description, dimensions, and inclusions
   *  because those fields are collected per-package in the Define Packages step. */
  isPackageListing?: boolean;
}

export function BasicsStep({ draft, setDraft, showValidation, isPackageListing = false }: BasicsStepProps) {
  const [tagInput, setTagInput] = useState("");
  const [includedInput, setIncludedInput] = useState("");
  const [notIncludedInput, setNotIncludedInput] = useState("");

  const helperText = CATEGORY_HELPER_TEXT[toHelperCategory(draft.category)];
  // Dimensions, description, and inclusions are per-package for package_container listings.
  const showDimensionsSection = draft.category === "Rental" && !isPackageListing;

  const hasCategory = Boolean(draft.category);
  const hasTitle = draft.listingTitle.trim().length > 0;
  // For package listings description is per-package, so it's not required at the listing level.
  const hasDescription = isPackageListing || draft.listingDescription.trim().length > 0;

  const listingTags = useMemo(
    () => draft.tagsByPropType[LISTING_TAG_KEY] ?? [],
    [draft.tagsByPropType]
  );

  function addTag(value: string) {
    const label = value.trim();
    if (!label) return;
    const slug = label.toLowerCase().replace(/\s+/g, "-");
    if (listingTags.some((t) => t.slug === slug)) {
      setTagInput("");
      return;
    }
    setDraft((prev) => ({
      ...prev,
      tagsByPropType: {
        ...prev.tagsByPropType,
        [LISTING_TAG_KEY]: [...(prev.tagsByPropType[LISTING_TAG_KEY] ?? []), { label, slug }],
      },
    }));
    setTagInput("");
  }

  function removeTag(slug: string) {
    setDraft((prev) => ({
      ...prev,
      tagsByPropType: {
        ...prev.tagsByPropType,
        [LISTING_TAG_KEY]: (prev.tagsByPropType[LISTING_TAG_KEY] ?? []).filter((t) => t.slug !== slug),
      },
    }));
  }

  function addIncludedItem(value: string) {
    const item = value.trim();
    if (!item || draft.whatsIncluded.includes(item)) {
      setIncludedInput("");
      return;
    }
    setDraft((prev) => ({ ...prev, whatsIncluded: [...prev.whatsIncluded, item] }));
    setIncludedInput("");
  }

  function removeIncludedItem(item: string) {
    setDraft((prev) => ({ ...prev, whatsIncluded: prev.whatsIncluded.filter((i) => i !== item) }));
  }

  function addNotIncludedItem(value: string) {
    const item = value.trim();
    if (!item || draft.whatsNotIncluded.includes(item)) {
      setNotIncludedInput("");
      return;
    }
    setDraft((prev) => ({ ...prev, whatsNotIncluded: [...prev.whatsNotIncluded, item] }));
    setNotIncludedInput("");
  }

  function removeNotIncludedItem(item: string) {
    setDraft((prev) => ({ ...prev, whatsNotIncluded: prev.whatsNotIncluded.filter((i) => i !== item) }));
  }

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Listing Basics</h1>
        <p className="text-base text-muted-foreground">
          Create one listing for one distinct rentable item, set, or style.
        </p>
      </header>

      <Card className="space-y-6 p-6">
        <div className="space-y-2">
          <Label className="text-base font-semibold">Category</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORY_OPTIONS.map((option) => {
              const active = draft.category === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      category: option.value,
                      subcategory: "",
                      subcategoryDetail: "",
                      dimensionWidth: option.value === "Rental" ? prev.dimensionWidth : "",
                      dimensionLength: option.value === "Rental" ? prev.dimensionLength : "",
                      dimensionHeight: option.value === "Rental" ? prev.dimensionHeight : "",
                    }))
                  }
                  className={[
                    "rounded-xl border px-3 py-3 text-sm font-medium transition",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {showValidation && !hasCategory ? (
            <p className="text-sm text-destructive">Category is required.</p>
          ) : null}
        </div>

        {draft.category ? (
          <SubcategoryPicker
            category={draft.category}
            value={{ subcategory: draft.subcategory, subcategoryDetail: draft.subcategoryDetail }}
            onChange={(next) =>
              setDraft((prev) => ({
                ...prev,
                subcategory: next.subcategory,
                subcategoryDetail: next.subcategoryDetail,
              }))
            }
          />
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="listing-title" className="text-base font-semibold">
            Title
          </Label>
          <Input
            id="listing-title"
            value={draft.listingTitle}
            placeholder="e.g. Gold Vase Set of 5"
            onChange={(event) =>
              setDraft((prev) => ({
                ...prev,
                listingTitle: normalizeTitleInput(event.target.value, 80),
              }))
            }
          />
          {showValidation && !hasTitle ? (
            <p className="text-sm text-destructive">Title is required.</p>
          ) : null}
        </div>

        {!isPackageListing && (
          <div className="space-y-2">
            <Label htmlFor="listing-description" className="text-base font-semibold">
              Description
            </Label>
            <Textarea
              id="listing-description"
              rows={5}
              maxLength={DESCRIPTION_MAX_CHARS}
              value={draft.listingDescription}
              spellCheck={true}
              autoCorrect="on"
              placeholder={helperText.description}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  listingDescription: event.target.value.slice(0, DESCRIPTION_MAX_CHARS),
                }))
              }
            />
            <div className="text-sm text-muted-foreground">
              {draft.listingDescription.length}/{DESCRIPTION_MAX_CHARS}
            </div>
            {showValidation && !hasDescription ? (
              <p className="text-sm text-destructive">Description is required.</p>
            ) : null}
          </div>
        )}

        {showDimensionsSection ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-base font-semibold">Dimensions (optional)</Label>
              <p className="text-sm text-muted-foreground">
                Add item measurements to help customers understand scale.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {DIMENSION_UNIT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={draft.dimensionUnit === option.value ? "default" : "outline"}
                  onClick={() => setDraft((prev) => ({ ...prev, dimensionUnit: option.value }))}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(["Width", "Length", "Height"] as const).map((field) => {
                const key = `dimension${field}` as "dimensionWidth" | "dimensionLength" | "dimensionHeight";
                return (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={`dimension-${field.toLowerCase()}`}>{field}</Label>
                    <Input
                      id={`dimension-${field.toLowerCase()}`}
                      inputMode="decimal"
                      placeholder="e.g. 24"
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          [key]: normalizeDimensionInput(event.target.value),
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {!isPackageListing && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">What's Included</Label>
            <p className="text-sm text-muted-foreground">{helperText.included}</p>

            {draft.whatsIncluded.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {draft.whatsIncluded.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-start gap-2">
                      <span aria-hidden>•</span>
                      <span>{item}</span>
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => removeIncludedItem(item)}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={includedInput}
                spellCheck={true}
                autoCorrect="on"
                placeholder="What do you include?"
                onChange={(event) => setIncludedInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addIncludedItem(includedInput);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={includedInput.trim().length === 0}
                onClick={() => addIncludedItem(includedInput)}
              >
                Add
              </Button>
            </div>
          </div>
        )}

        {!isPackageListing && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">What's Not Included</Label>
            <p className="text-sm text-muted-foreground">
              Help customers understand what falls outside this listing — e.g. "Gratuity", "Travel outside 30 miles",
              "Additional staff".
            </p>

            {draft.whatsNotIncluded.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {draft.whatsNotIncluded.map((item) => (
                  <li
                    key={item}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="flex items-start gap-2">
                      <span aria-hidden>•</span>
                      <span>{item}</span>
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => removeNotIncludedItem(item)}
                      aria-label={`Remove ${item}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={notIncludedInput}
                spellCheck={true}
                autoCorrect="on"
                placeholder="What's not included?"
                onChange={(event) => setNotIncludedInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addNotIncludedItem(notIncludedInput);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={notIncludedInput.trim().length === 0}
                onClick={() => addNotIncludedItem(notIncludedInput)}
              >
                Add
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <Label className="text-base font-semibold">Search Tags</Label>
          <p className="text-sm text-muted-foreground">{helperText.tags}</p>

          {listingTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {listingTags.map((tag: ListingTag) => (
                <span
                  key={tag.slug}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E07A6A] bg-[#E07A6A] px-3 py-1 text-sm text-white"
                >
                  {tag.label}
                  <button
                    type="button"
                    className="text-white/80 hover:text-white"
                    onClick={() => removeTag(tag.slug)}
                    aria-label={`Remove ${tag.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Input
              value={tagInput}
              placeholder="Add a search tag"
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addTag(tagInput);
              }}
            />
            <Button type="button" variant="outline" onClick={() => addTag(tagInput)}>
              Add
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
