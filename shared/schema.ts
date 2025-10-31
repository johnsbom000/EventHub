import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
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
