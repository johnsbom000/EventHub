// Central subcategory definitions for EventHub listings.
// Used in: listing creation wizard, vendor edit listing, hero search bar, browse filters.
//
// Structure:
//   Rentals & Services: category → subcategory (1 level deep)
//   Catering: category → type → cuisine (2 levels deep)
//   Venues: category → type → subtype (2 levels deep)

export type CategoryKey = "Rentals" | "Services" | "Catering" | "Venues";

// Maps the "singular" create/edit form values to canonical keys
export const CATEGORY_TO_KEY: Record<string, CategoryKey> = {
  Rental: "Rentals",
  Rentals: "Rentals",
  rentals: "Rentals",
  rental: "Rentals",
  Service: "Services",
  Services: "Services",
  services: "Services",
  service: "Services",
  Venue: "Venues",
  Venues: "Venues",
  venues: "Venues",
  venue: "Venues",
  Catering: "Catering",
  catering: "Catering",
};

// ---------------------------------------------------------------------------
// Flat subcategories (Rentals & Services — 1 level)
// ---------------------------------------------------------------------------

export const RENTAL_SUBCATEGORIES = [
  "Tents & Structures",
  "Tables",
  "Chairs & Seating",
  "Linens & Textiles",
  "Tableware & Dinnerware",
  "Bars & Beverage Stations",
  "Props & Decor",
  "Lighting",
  "Arches",
  "Backdrops",
  "Flower Walls",
  "Balloon Installations",
  "Dance Floors & Staging",
  "Audio / Visual",
  "Photo Booths",
  "Bounce Houses",
  "Water Slides",
  "Carnival Rides",
  "Arcade Machines",
  "Lawn Games",
  "Smoke Machines",
  "Confetti Cannons",
  "Fire Pits",
  "Heaters",
  "Cooling Fans",
  "Snow Machines",
  "Generators & Power",
  "Restrooms & Sanitation",
  "Kitchen & Cooking Equipment",
  "Other",
] as const;

export const SERVICE_SUBCATEGORIES = [
  "Event Planning & Coordination",
  "DJs",
  "Live Bands",
  "Solo Musicians",
  "Singers",
  "Comedians",
  "Magicians",
  "Dancers",
  "Cultural Performers",
  "Fire Performers",
  "Circus Acts",
  "MCs",
  "Photographers",
  "Videographers",
  "Drone Videographers",
  "Hair Stylists",
  "Makeup Artists",
  "Barbers",
  "Nail Artists",
  "Spray Tan Artists",
  "Wardrobe Stylists",
  "Event Operations",
  "Setup / Production",
  "Officiants",
  "Translators",
  "Sign Language Interpreters",
  "Pet Handlers",
  "Childcare",
  "Medical Staff",
  "Floral",
  "Transportation",
  "Security",
  "Cake & Dessert Artists",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Catering — 2 levels: Type (HOW) → Cuisine (WHAT)
// ---------------------------------------------------------------------------

export const CATERING_TYPES = [
  "Full-Service Catering",
  "Drop-Off / Casual Catering",
  "Food Truck / Mobile",
  "Stations & Interactive",
  "Dessert Catering",
  "Beverage Catering",
  "Other",
] as const;

export const CATERING_CUISINES = [
  "American & Western",
  "BBQ & Grill",
  "European",
  "Latin",
  "Asian",
  "Middle Eastern / Mediterranean",
  "South Asian",
  "African",
  "Caribbean",
  "Seafood & Specialty",
  "Cultural / Religious",
  "Vegan",
  "Vegetarian",
  "Gluten-Free",
  "Keto",
  "Organic",
  "Farm-to-Table",
  "Other",
] as const;

export type CateringType = (typeof CATERING_TYPES)[number];
export type CateringCuisine = (typeof CATERING_CUISINES)[number];

// ---------------------------------------------------------------------------
// Venues — 2 levels: Type → Subtype
// ---------------------------------------------------------------------------

export const VENUE_TYPES_WITH_SUBTYPES: Record<string, readonly string[]> = {
  Indoor: [
    "Ballrooms",
    "Banquet Halls",
    "Hotels",
    "Conference Centers",
    "Restaurants",
    "Bars / Lounges",
    "Nightclubs",
    "Theaters",
    "Museums",
    "Galleries",
    "Warehouses",
    "Studios",
    "Lofts",
  ],
  Outdoor: [
    "Gardens",
    "Parks",
    "Beaches",
    "Mountains",
    "Ranches",
    "Farms",
    "Vineyards",
    "Rooftops",
    "Courtyards",
    "Lakeside Venues",
    "Desert Venues",
  ],
  "Unique / Experiential": [
    "Historic Buildings",
    "Mansions",
    "Barns",
    "Greenhouses",
    "Boats / Yachts",
    "Stadiums",
    "Theme Parks",
    "Zoos / Aquariums",
    "Caves",
    "National Parks",
  ],
  Luxury: [
    "Private Estates",
    "Villas",
    "Penthouses",
    "Country Clubs",
    "Golf Courses",
    "Resorts",
  ],
  Functional: [
    "Community Centers",
    "Church Halls",
    "School Gyms",
    "Co-Working Spaces",
    "Meeting Rooms",
  ],
  "Flexible / Hybrid": [
    "Indoor-Outdoor Venues",
    "Modular Spaces",
    "Multi-Room Venues",
    "Blank Canvas Venues",
    "Industrial Venues",
    "Minimalist Modern Venues",
  ],
  "Event-Specific": [
    "Wedding Venues",
    "Corporate Retreat Venues",
    "Conference Venues",
    "Party Venues",
    "Birthday Venues",
    "Quinceañera Venues",
  ],
  Other: [],
} as const;

export const VENUE_TYPES = Object.keys(VENUE_TYPES_WITH_SUBTYPES) as string[];

// ---------------------------------------------------------------------------
// Unified lookup helpers
// ---------------------------------------------------------------------------

/** Returns subcategory options for a category (Rentals / Services only). */
export function getSubcategories(categoryKey: CategoryKey): readonly string[] {
  if (categoryKey === "Rentals") return RENTAL_SUBCATEGORIES;
  if (categoryKey === "Services") return SERVICE_SUBCATEGORIES;
  return [];
}

/** Returns the first-level type options for Catering or Venues. */
export function getTypes(categoryKey: CategoryKey): readonly string[] {
  if (categoryKey === "Catering") return CATERING_TYPES;
  if (categoryKey === "Venues") return VENUE_TYPES;
  return [];
}

/** Returns the second-level options (cuisines for Catering, subtypes for Venues). */
export function getDetailOptions(categoryKey: CategoryKey, type: string): readonly string[] {
  if (categoryKey === "Catering") return CATERING_CUISINES;
  if (categoryKey === "Venues") return VENUE_TYPES_WITH_SUBTYPES[type] ?? [];
  return [];
}

/** Whether a category has two levels (type + detail). */
export function isTwoLevel(categoryKey: CategoryKey): boolean {
  return categoryKey === "Catering" || categoryKey === "Venues";
}

/** Normalize a raw category string to a CategoryKey, or null. */
export function toCategoryKey(raw: unknown): CategoryKey | null {
  if (typeof raw !== "string") return null;
  return (CATEGORY_TO_KEY[raw.trim()] as CategoryKey) ?? null;
}
