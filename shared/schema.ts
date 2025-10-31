import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const photographerDetailsSchema = z.object({
  preEventShoots: z.boolean(),
  preEventDates: z.array(z.string()).optional(),
  eventDayHours: z.number().optional(),
  eventDayStartTime: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  budgetSingle: z.number().optional(),
  notes: z.string().optional(),
  inspirationLinks: z.string().optional(),
});

export const videographerDetailsSchema = z.object({
  preEventShoots: z.boolean(),
  preEventDates: z.array(z.string()).optional(),
  eventDayHours: z.number().optional(),
  eventDayStartTime: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  budgetSingle: z.number().optional(),
  deliverableNotes: z.string().optional(),
  otherNotes: z.string().optional(),
});

export const floristDetailsSchema = z.object({
  arrangementsNeeded: z.array(z.string()),
  flowerPreferences: z.string().optional(),
  flowerAvoidances: z.string().optional(),
  beforeEventNeeds: z.boolean(),
  beforeEventDateTime: z.string().optional(),
  floristSetup: z.boolean().optional(),
  setupTime: z.string().optional(),
  touchUps: z.boolean(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  budgetSingle: z.number().optional(),
  notes: z.string().optional(),
});

export const cateringDetailsSchema = z.object({
  foodStyle: z.array(z.string()),
  serviceType: z.array(z.string()),
  allergyFriendly: z.boolean(),
  allergyList: z.array(z.string()).optional(),
  beforeEventCatering: z.boolean(),
  beforeEventDateTime: z.string().optional(),
  eventDayServingTime: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  budgetSingle: z.number().optional(),
  notes: z.string().optional(),
});

export const djDetailsSchema = z.object({
  servicesNeeded: z.array(z.string()),
  hasPlaylist: z.boolean(),
  musicGenres: z.string().optional(),
  doNotPlayList: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  budgetSingle: z.number().optional(),
  notes: z.string().optional(),
});

export const propDecorDetailsSchema = z.object({
  itemsNeeded: z.string(),
  pickupDate: z.string().optional(),
  returnDate: z.string().optional(),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  budgetSingle: z.number().optional(),
  notes: z.string().optional(),
});

export type PhotographerDetails = z.infer<typeof photographerDetailsSchema>;
export type VideographerDetails = z.infer<typeof videographerDetailsSchema>;
export type FloristDetails = z.infer<typeof floristDetailsSchema>;
export type CateringDetails = z.infer<typeof cateringDetailsSchema>;
export type DJDetails = z.infer<typeof djDetailsSchema>;
export type PropDecorDetails = z.infer<typeof propDecorDetailsSchema>;

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(),
  location: text("location").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  guestCount: integer("guest_count").notNull(),
  vendorsNeeded: text("vendors_needed").array().notNull(),
  path: text("path").notNull(),
  photographerDetails: jsonb("photographer_details").$type<PhotographerDetails | null>(),
  videographerDetails: jsonb("videographer_details").$type<VideographerDetails | null>(),
  floristDetails: jsonb("florist_details").$type<FloristDetails | null>(),
  cateringDetails: jsonb("catering_details").$type<CateringDetails | null>(),
  djDetails: jsonb("dj_details").$type<DJDetails | null>(),
  propDecorDetails: jsonb("prop_decor_details").$type<PropDecorDetails | null>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
}).extend({
  photographerDetails: photographerDetailsSchema.optional(),
  videographerDetails: videographerDetailsSchema.optional(),
  floristDetails: floristDetailsSchema.optional(),
  cateringDetails: cateringDetailsSchema.optional(),
  djDetails: djDetailsSchema.optional(),
  propDecorDetails: propDecorDetailsSchema.optional(),
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const vendorServiceOfferingsSchema = z.object({
  photographer: z.object({
    preEventShoots: z.boolean().optional(),
    eventDayCoverage: z.boolean().optional(),
    engagementShoots: z.boolean().optional(),
    bridalPortraits: z.boolean().optional(),
  }).optional(),
  videographer: z.object({
    preEventVideos: z.boolean().optional(),
    eventDayCoverage: z.boolean().optional(),
    highlightReel: z.boolean().optional(),
    fullCeremony: z.boolean().optional(),
  }).optional(),
  florist: z.object({
    bridalBouquet: z.boolean().optional(),
    bridesmaidBouquets: z.boolean().optional(),
    boutonnieres: z.boolean().optional(),
    centerpieces: z.boolean().optional(),
    archInstall: z.boolean().optional(),
    aisleFlorals: z.boolean().optional(),
    setup: z.boolean().optional(),
    touchUps: z.boolean().optional(),
  }).optional(),
  catering: z.object({
    buffet: z.boolean().optional(),
    plated: z.boolean().optional(),
    cocktail: z.boolean().optional(),
    dessertOnly: z.boolean().optional(),
    glutenFree: z.boolean().optional(),
    dairyFree: z.boolean().optional(),
    vegetarian: z.boolean().optional(),
    vegan: z.boolean().optional(),
  }).optional(),
  dj: z.object({
    ceremonyMusic: z.boolean().optional(),
    cocktailHour: z.boolean().optional(),
    reception: z.boolean().optional(),
    mcServices: z.boolean().optional(),
  }).optional(),
  propDecor: z.object({
    tables: z.boolean().optional(),
    chairs: z.boolean().optional(),
    linens: z.boolean().optional(),
    backdrops: z.boolean().optional(),
    lighting: z.boolean().optional(),
  }).optional(),
});

export type VendorServiceOfferings = z.infer<typeof vendorServiceOfferingsSchema>;

export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  metro: text("metro"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  basePrice: integer("base_price").notNull(),
  priceRangeMax: integer("price_range_max"),
  rating: numeric("rating").notNull(),
  reviewCount: integer("review_count").notNull().default(0),
  bookingCount: integer("booking_count").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  blockedDates: text("blocked_dates").array().default(sql`'{}'`),
  serviceOfferings: jsonb("service_offerings").$type<VendorServiceOfferings | null>(),
  serviceArea: text("service_area").array().default(sql`'{}'`),
  imageUrl: text("image_url"),
  description: text("description"),
  travelFeeRequired: boolean("travel_fee_required").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
}).extend({
  serviceOfferings: vendorServiceOfferingsSchema.optional(),
});

export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;
