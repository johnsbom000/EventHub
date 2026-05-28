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
  "Arcade Machines",
  "Arches",
  "Audio / Visual",
  "Backdrops",
  "Balloon Installations",
  "Bars & Beverage Stations",
  "Bounce Houses",
  "Carnival Rides",
  "Chairs & Seating",
  "Confetti Cannons",
  "Cooling Fans",
  "Dance Floors & Staging",
  "Fire Pits",
  "Flower Walls",
  "Generators & Power",
  "Heaters",
  "Kitchen & Cooking Equipment",
  "Lawn Games",
  "Lighting",
  "Linens & Textiles",
  "Photo Booths",
  "Props & Decor",
  "Restrooms & Sanitation",
  "Smoke Machines",
  "Snow Machines",
  "Tables",
  "Tableware & Dinnerware",
  "Tents & Structures",
  "Water Slides",
  "Other",
] as const;

export const SERVICE_SUBCATEGORIES = [
  "Barbers",
  "Cake & Dessert Artists",
  "Childcare",
  "Circus Acts",
  "Comedians",
  "Cultural Performers",
  "Dancers",
  "DJs",
  "Drone Videographers",
  "Event Operations",
  "Event Planning & Coordination",
  "Fire Performers",
  "Floral",
  "Hair Stylists",
  "Live Bands",
  "Magicians",
  "Makeup Artists",
  "MCs",
  "Medical Staff",
  "Nail Artists",
  "Officiants",
  "Pet Handlers",
  "Photographers",
  "Security",
  "Setup / Production",
  "Sign Language Interpreters",
  "Singers",
  "Solo Musicians",
  "Spray Tan Artists",
  "Translators",
  "Transportation",
  "Videographers",
  "Wardrobe Stylists",
  "Other",
] as const;

// ---------------------------------------------------------------------------
// Catering — 2 levels: Type (HOW) → Cuisine (WHAT)
// ---------------------------------------------------------------------------

export const CATERING_TYPES = [
  "Beverage Catering",
  "Dessert Catering",
  "Drop-Off / Casual Catering",
  "Food Truck / Mobile",
  "Full-Service Catering",
  "Stations & Interactive",
  "Other",
] as const;

export const CATERING_CUISINES = [
  "African",
  "American & Western",
  "Asian",
  "BBQ & Grill",
  "Caribbean",
  "Cultural / Religious",
  "European",
  "Farm-to-Table",
  "Gluten-Free",
  "Keto",
  "Latin",
  "Middle Eastern / Mediterranean",
  "Organic",
  "Seafood & Specialty",
  "South Asian",
  "Vegan",
  "Vegetarian",
  "Other",
] as const;

export type CateringType = (typeof CATERING_TYPES)[number];
export type CateringCuisine = (typeof CATERING_CUISINES)[number];

// ---------------------------------------------------------------------------
// Venues — 2 levels: Type → Subtype
// ---------------------------------------------------------------------------

export const VENUE_TYPES_WITH_SUBTYPES: Record<string, readonly string[]> = {
  "Event-Specific": [
    "Birthday Venues",
    "Conference Venues",
    "Corporate Retreat Venues",
    "Party Venues",
    "Quinceañera Venues",
    "Wedding Venues",
  ],
  "Flexible / Hybrid": [
    "Blank Canvas Venues",
    "Indoor-Outdoor Venues",
    "Industrial Venues",
    "Minimalist Modern Venues",
    "Modular Spaces",
    "Multi-Room Venues",
  ],
  Functional: [
    "Church Halls",
    "Co-Working Spaces",
    "Community Centers",
    "Meeting Rooms",
    "School Gyms",
  ],
  Indoor: [
    "Ballrooms",
    "Banquet Halls",
    "Bars / Lounges",
    "Conference Centers",
    "Galleries",
    "Hotels",
    "Lofts",
    "Museums",
    "Nightclubs",
    "Restaurants",
    "Studios",
    "Theaters",
    "Warehouses",
  ],
  Luxury: [
    "Country Clubs",
    "Golf Courses",
    "Penthouses",
    "Private Estates",
    "Resorts",
    "Villas",
  ],
  Outdoor: [
    "Beaches",
    "Courtyards",
    "Desert Venues",
    "Farms",
    "Gardens",
    "Lakeside Venues",
    "Mountains",
    "Parks",
    "Ranches",
    "Rooftops",
    "Vineyards",
  ],
  "Unique / Experiential": [
    "Barns",
    "Boats / Yachts",
    "Caves",
    "Greenhouses",
    "Historic Buildings",
    "Mansions",
    "National Parks",
    "Stadiums",
    "Theme Parks",
    "Zoos / Aquariums",
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
