/**
 * SubcategoryPicker — vendor-side (listing creation & edit)
 *
 * Single-select cascading picker used inside the listing wizard and edit form.
 * Shows subcategory options for Rentals/Services (1 level), or type → detail
 * for Catering/Venues (2 levels).
 *
 * Does NOT query the DB — shows all predefined options regardless of existing
 * listings. The dynamic filtering (only show used subcategories) is only for
 * the customer-facing hero + browse page.
 */

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  toCategoryKey,
  getSubcategories,
  getTypes,
  getDetailOptions,
  isTwoLevel,
  type CategoryKey,
} from "@/constants/subcategories";

export type SubcategoryPickerValue = {
  subcategory: string;
  subcategoryDetail: string;
};

type Props = {
  /** The raw category value from the listing draft ("Rental", "Service", "Venue", "Catering") */
  category: string;
  value: SubcategoryPickerValue;
  onChange: (next: SubcategoryPickerValue) => void;
  /** Optional CSS class applied to the outer wrapper */
  className?: string;
};

export function SubcategoryPicker({ category, value, onChange, className }: Props) {
  const categoryKey = toCategoryKey(category);

  if (!categoryKey) return null;

  if (isTwoLevel(categoryKey)) {
    return (
      <TwoLevelPicker
        categoryKey={categoryKey}
        value={value}
        onChange={onChange}
        className={className}
      />
    );
  }

  return (
    <OneLevelPicker
      categoryKey={categoryKey}
      value={value}
      onChange={onChange}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// One-level picker (Rentals / Services)
// ---------------------------------------------------------------------------

function OneLevelPicker({
  categoryKey,
  value,
  onChange,
  className,
}: {
  categoryKey: CategoryKey;
  value: SubcategoryPickerValue;
  onChange: (next: SubcategoryPickerValue) => void;
  className?: string;
}) {
  const options = getSubcategories(categoryKey);

  return (
    <div className={className}>
      <Label className="text-sm font-medium">Subcategory</Label>
      <Select
        value={value.subcategory || undefined}
        onValueChange={(v) => onChange({ subcategory: v, subcategoryDetail: "" })}
      >
        <SelectTrigger className="mt-1.5">
          <SelectValue placeholder="Select subcategory (optional)" />
        </SelectTrigger>
        <SelectContent className="max-h-[280px]">
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Two-level picker (Catering / Venues)
// ---------------------------------------------------------------------------

function TwoLevelPicker({
  categoryKey,
  value,
  onChange,
  className,
}: {
  categoryKey: CategoryKey;
  value: SubcategoryPickerValue;
  onChange: (next: SubcategoryPickerValue) => void;
  className?: string;
}) {
  const typeOptions = getTypes(categoryKey);
  const detailLabel = categoryKey === "Catering" ? "Cuisine" : "Sub-type";
  const typeLabel = categoryKey === "Catering" ? "Catering Type" : "Venue Type";

  const detailOptions =
    value.subcategory ? getDetailOptions(categoryKey, value.subcategory) : [];

  const handleTypeChange = (type: string) => {
    // Changing the type clears the detail
    onChange({ subcategory: type, subcategoryDetail: "" });
  };

  const handleDetailChange = (detail: string) => {
    onChange({ ...value, subcategoryDetail: detail });
  };

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Level 1 — Type */}
      <div>
        <Label className="text-sm font-medium">{typeLabel}</Label>
        <Select value={value.subcategory || undefined} onValueChange={handleTypeChange}>
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder={`Select ${typeLabel.toLowerCase()} (optional)`} />
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            {typeOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Level 2 — Detail (only shown when a type is selected AND has sub-options) */}
      {value.subcategory && detailOptions.length > 0 && (
        <div>
          <Label className="text-sm font-medium">{detailLabel}</Label>
          <Select
            value={value.subcategoryDetail || undefined}
            onValueChange={handleDetailChange}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder={`Select ${detailLabel.toLowerCase()} (optional)`} />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {detailOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact display label (for showing selection summary)
// ---------------------------------------------------------------------------

export function subcategoryDisplayLabel(
  value: SubcategoryPickerValue,
  category: string,
): string {
  if (!value.subcategory) return "";
  if (value.subcategoryDetail) return `${value.subcategory} · ${value.subcategoryDetail}`;
  return value.subcategory;
}
