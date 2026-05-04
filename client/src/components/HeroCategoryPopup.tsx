/**
 * HeroCategoryPopup — cascading single-select popup for the hero search bar.
 *
 * Levels:
 *   1. Category (Rentals / Services / Venues / Catering)
 *   2. Subcategory / Type  (flat list for Rentals & Services; type list for Venues & Catering)
 *   3. Detail (Venues subtype / Catering cuisine) — only for 2-level categories
 *
 * Behaviour:
 *   - Clicking the trigger opens the popup at whatever depth was last selected.
 *   - A "← Back" row lets the user navigate to the shallower level.
 *   - Selecting the deepest option closes the popup.
 *   - "Other" at the deepest level closes immediately.
 *   - Available subcategories/details are filtered to only those that exist in
 *     active listings (passed in via `available` prop from the API).
 */

import { useRef, useEffect, useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import {
  toCategoryKey,
  getSubcategories,
  getTypes,
  getDetailOptions,
  isTwoLevel,
  CATEGORY_TO_KEY,
  type CategoryKey,
} from "@/constants/subcategories";

export type HeroCategorySelection = {
  /** Lowercase browse key: "rentals" | "services" | "venues" | "catering" */
  categoryKey: string;
  /** Human-readable category label, e.g. "Rentals" */
  categoryLabel: string;
  /** Selected subcategory / type, or "" */
  subcategory: string;
  /** Selected detail (cuisine / subtype), or "" */
  subcategoryDetail: string;
};

/** Shape returned by /api/listings/available-subcategories */
export type AvailableSubcategories = Record<
  string,
  { subcategories: string[]; details: Record<string, string[]> }
>;

const CATEGORY_OPTIONS: { key: string; label: string; canonicalKey: CategoryKey }[] = [
  { key: "rentals", label: "Rentals", canonicalKey: "Rentals" },
  { key: "services", label: "Services", canonicalKey: "Services" },
  { key: "venues", label: "Venues", canonicalKey: "Venues" },
  { key: "catering", label: "Catering", canonicalKey: "Catering" },
];

type PopupDepth = "category" | "subcategory" | "detail";

type Props = {
  value: HeroCategorySelection | null;
  onChange: (next: HeroCategorySelection) => void;
  available: AvailableSubcategories;
  /** Extra CSS on the trigger button */
  triggerClassName?: string;
  /** Placeholder shown when nothing is selected */
  placeholder?: string;
};

export function HeroCategoryPopup({
  value,
  onChange,
  available,
  triggerClassName = "",
  placeholder = "Category",
}: Props) {
  const [open, setOpen] = useState(false);
  const [depth, setDepth] = useState<PopupDepth>("category");
  // Tracks the category / subcategory being drilled into (may differ from committed value)
  const [pendingCategory, setPendingCategory] = useState<{ key: string; label: string; canonicalKey: CategoryKey } | null>(null);
  const [pendingSubcategory, setPendingSubcategory] = useState<string>("");

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleTriggerClick = () => {
    if (open) {
      setOpen(false);
      return;
    }
    // Restore depth to where user left off
    if (value?.categoryKey) {
      const cat = CATEGORY_OPTIONS.find((c) => c.key === value.categoryKey);
      if (cat) {
        setPendingCategory(cat);
        if (value.subcategory) {
          setPendingSubcategory(value.subcategory);
          setDepth(value.subcategoryDetail ? "detail" : "subcategory");
        } else {
          setDepth("subcategory");
        }
      } else {
        setDepth("category");
      }
    } else {
      setDepth("category");
    }
    setOpen(true);
  };

  // ── Level 1: Select category ─────────────────────────────────────────────
  const handleSelectCategory = (cat: typeof CATEGORY_OPTIONS[0]) => {
    setPendingCategory(cat);
    setPendingSubcategory("");
    // Always commit the category immediately so Search works even if the
    // user doesn't drill into subcategories.
    onChange({
      categoryKey: cat.key,
      categoryLabel: cat.label,
      subcategory: "",
      subcategoryDetail: "",
    });
    const hasSubs = (available[cat.key]?.subcategories ?? []).length > 0;
    if (!hasSubs) {
      setOpen(false);
      return;
    }
    setDepth("subcategory");
  };

  // ── Level 2: Select subcategory / type ───────────────────────────────────
  const handleSelectSubcategory = (sub: string) => {
    if (!pendingCategory) return;
    const needsDetail =
      isTwoLevel(pendingCategory.canonicalKey) &&
      (available[pendingCategory.key]?.details?.[sub] ?? []).length > 0;

    if (needsDetail) {
      setPendingSubcategory(sub);
      setDepth("detail");
    } else {
      // Commit
      onChange({
        categoryKey: pendingCategory.key,
        categoryLabel: pendingCategory.label,
        subcategory: sub,
        subcategoryDetail: "",
      });
      setOpen(false);
    }
  };

  // ── Level 3: Select detail ───────────────────────────────────────────────
  const handleSelectDetail = (detail: string) => {
    if (!pendingCategory || !pendingSubcategory) return;
    onChange({
      categoryKey: pendingCategory.key,
      categoryLabel: pendingCategory.label,
      subcategory: pendingSubcategory,
      subcategoryDetail: detail,
    });
    setOpen(false);
  };

  // ── Back navigation ──────────────────────────────────────────────────────
  const handleBack = () => {
    if (depth === "detail") setDepth("subcategory");
    else if (depth === "subcategory") setDepth("category");
  };

  // ── Trigger label ────────────────────────────────────────────────────────
  const triggerLabel = (() => {
    if (!value?.categoryKey) return null;
    if (value.subcategoryDetail) return value.subcategoryDetail;
    if (value.subcategory) return value.subcategory;
    return value.categoryLabel;
  })();

  // ── Available options at each level ─────────────────────────────────────
  const subcategoryOptions: string[] = pendingCategory
    ? available[pendingCategory.key]?.subcategories ?? []
    : [];

  const detailOptions: string[] =
    pendingCategory && pendingSubcategory
      ? available[pendingCategory.key]?.details?.[pendingSubcategory] ?? []
      : [];

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleTriggerClick}
        className={triggerClassName}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={triggerLabel ? "text-[#2a3a42]" : "text-[#9aacb4]"}>
          {triggerLabel ?? placeholder}
        </span>
      </button>

      {/* Popup */}
      {open && (
        <div
          className="absolute left-0 top-full z-[90] mt-1 w-64 overflow-hidden rounded-xl border border-[rgba(74,106,125,0.18)] bg-white shadow-lg"
          role="listbox"
        >
          {/* Header */}
          {depth !== "category" && (
            <button
              type="button"
              onClick={handleBack}
              className="flex w-full items-center gap-2 border-b border-[rgba(74,106,125,0.1)] px-4 py-2.5 text-sm font-medium text-[#4a6a7d] hover:bg-[#f5f0e8] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              {depth === "subcategory" ? "All Categories" : pendingCategory?.label}
            </button>
          )}

          {/* Level 1 — categories */}
          {depth === "category" && (
            <ul className="py-1">
              {CATEGORY_OPTIONS.map((cat) => (
                <li key={cat.key}>
                  <button
                    type="button"
                    onClick={() => handleSelectCategory(cat)}
                    className={[
                      "flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-[#f5f0e8]",
                      value?.categoryKey === cat.key ? "font-semibold text-[#e07a6a]" : "text-[#2a3a42]",
                    ].join(" ")}
                  >
                    <span>{cat.label}</span>
                    {(available[cat.key]?.subcategories ?? []).length > 0 && (
                      <ChevronRight className="h-4 w-4 text-[#9aacb4]" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Level 2 — subcategories / types */}
          {depth === "subcategory" && pendingCategory && (
            <ul className="max-h-64 overflow-y-auto py-1">
              {subcategoryOptions.map((sub) => {
                const hasDetails =
                  isTwoLevel(pendingCategory.canonicalKey) &&
                  (available[pendingCategory.key]?.details?.[sub] ?? []).length > 0;
                const isSelected =
                  value?.categoryKey === pendingCategory.key && value.subcategory === sub;
                return (
                  <li key={sub}>
                    <button
                      type="button"
                      onClick={() => handleSelectSubcategory(sub)}
                      className={[
                        "flex w-full items-center justify-between px-4 py-2.5 text-sm transition-colors hover:bg-[#f5f0e8]",
                        isSelected ? "font-semibold text-[#e07a6a]" : "text-[#2a3a42]",
                      ].join(" ")}
                    >
                      <span>{sub}</span>
                      {hasDetails && <ChevronRight className="h-4 w-4 text-[#9aacb4]" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Level 3 — details (cuisine / subtype) */}
          {depth === "detail" && pendingCategory && pendingSubcategory && (
            <ul className="max-h-64 overflow-y-auto py-1">
              {detailOptions.map((detail) => {
                const isSelected =
                  value?.categoryKey === pendingCategory.key &&
                  value.subcategory === pendingSubcategory &&
                  value.subcategoryDetail === detail;
                return (
                  <li key={detail}>
                    <button
                      type="button"
                      onClick={() => handleSelectDetail(detail)}
                      className={[
                        "flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-[#f5f0e8]",
                        isSelected ? "font-semibold text-[#e07a6a]" : "text-[#2a3a42]",
                      ].join(" ")}
                    >
                      {detail}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
