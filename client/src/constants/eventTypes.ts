/**
 * Single source of truth for all event types.
 *
 * - `value`  URL-safe slug used in query params and Select values.
 * - `label`  Canonical display name — capitalized, plural where natural.
 *            This is also the value stored in listing `popularFor` fields,
 *            so the two must stay in sync.
 *
 * Consumers:
 *   EVENT_TYPE_OPTIONS   → hero search-bar dropdown
 *   POPULAR_FOR_OPTIONS  → listing creation / edit "Popular For" picker
 *   EVENT_TYPE_SLUG_TO_LABEL → URL param hydration in BrowseVendors
 */
const EVENT_TYPES = [
  { value: "weddings",           label: "Weddings" },
  { value: "corporate",          label: "Corporate" },
  { value: "baby-showers",       label: "Baby Showers" },
  { value: "photoshoots",        label: "Photoshoots" },
  { value: "birthdays",          label: "Birthdays" },
  { value: "bridal-showers",     label: "Bridal Showers" },
  { value: "graduations",        label: "Graduations" },
  { value: "holiday-parties",    label: "Holiday Parties" },
  { value: "concert",            label: "Concert" },
  { value: "proposal",           label: "Proposal" },
  { value: "bachelor-party",     label: "Bachelor Party" },
  { value: "bachelorette-party", label: "Bachelorette Party" },
  { value: "anniversary",        label: "Anniversary" },
  { value: "gender-reveal",      label: "Gender Reveal" },
  { value: "quinceanera",        label: "Quinceañera" },
  { value: "baptism",            label: "Baptism" },
  { value: "funeral",            label: "Funeral" },
  { value: "reunion",            label: "Reunion" },
  { value: "conference",         label: "Conference" },
  { value: "sporting",           label: "Sporting" },
  { value: "school-dance",       label: "School Dance" },
  { value: "other",              label: "Other" },
] as const;

/** Shown in the hero search-bar event-type dropdown. */
export const EVENT_TYPE_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> =
  EVENT_TYPES;

/**
 * Canonical event-type labels used in listing `popularFor` fields.
 * Derived from EVENT_TYPES so they always stay in sync.
 */
export const POPULAR_FOR_OPTIONS: ReadonlyArray<string> = EVENT_TYPES.map((t) => t.label);

/**
 * Maps a URL slug → its canonical `POPULAR_FOR_OPTIONS` label.
 *
 * Includes legacy slugs from the previous EVENT_TYPE_OPTIONS shape
 * (singular/hyphenated values like "birthday", "baby-shower") so that
 * old bookmarks and URLs continue to resolve correctly.
 */
export const EVENT_TYPE_SLUG_TO_LABEL: Readonly<Record<string, string>> = {
  // Current slugs (derived from EVENT_TYPES)
  ...Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t.label])),
  // Legacy slugs — pre-refactor backward compat
  "wedding":       "Weddings",
  "birthday":      "Birthdays",
  "baby-shower":   "Baby Showers",
  "photoshoot":    "Photoshoots",
  "bridal-shower": "Bridal Showers",
  "graduation":    "Graduations",
  "holiday-party": "Holiday Parties",
};
