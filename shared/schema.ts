import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for type safety
export const bookingStatusEnum = pgEnum("booking_status", ["pending", "confirmed", "completed", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "partial", "paid", "refunded"]);
export const paymentTypeEnum = pgEnum("payment_type", ["deposit", "final", "installment"]);
export const listingStatusEnum = pgEnum("listing_status", ["draft", "pending", "active", "inactive"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "new_booking",
  "booking_confirmed",
  "booking_cancelled", 
  "booking_rescheduled",
  "new_message",
  "payment_received",
  "review_received",
  "payout_processed"
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  name: true,
  email: true,
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

export const vendorPackageSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.number(),
  inclusions: z.array(z.string()),
  popular: z.boolean().optional(),
});

export const vendorAddOnSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z.number(),
});

export const vendorReviewSchema = z.object({
  reviewerName: z.string(),
  rating: z.number(),
  date: z.string(),
  comment: z.string(),
  eventType: z.string().optional(),
});

export type VendorPackage = z.infer<typeof vendorPackageSchema>;
export type VendorAddOn = z.infer<typeof vendorAddOnSchema>;
export type VendorReview = z.infer<typeof vendorReviewSchema>;

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
  packages: jsonb("packages").$type<VendorPackage[] | null>(),
  addOns: jsonb("add_ons").$type<VendorAddOn[] | null>(),
  reviews: jsonb("reviews").$type<VendorReview[] | null>(),
  aboutSection: text("about_section"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
}).extend({
  serviceOfferings: vendorServiceOfferingsSchema.optional(),
  packages: z.array(vendorPackageSchema).optional(),
  addOns: z.array(vendorAddOnSchema).optional(),
  reviews: z.array(vendorReviewSchema).optional(),
});

export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

// Vendor Accounts (authentication only)
export const vendorAccounts = pgTable("vendor_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Links to customer account if upgraded
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  businessName: text("business_name").notNull(),
  stripeConnectId: text("stripe_connect_id"),
  stripeAccountType: text("stripe_account_type"), // 'express' or 'standard'
  stripeOnboardingComplete: boolean("stripe_onboarding_complete").default(false),
  profileComplete: boolean("profile_complete").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVendorAccountSchema = createInsertSchema(vendorAccounts).omit({
  id: true,
  createdAt: true,
});

export type InsertVendorAccount = z.infer<typeof insertVendorAccountSchema>;
export type VendorAccount = typeof vendorAccounts.$inferSelect;

// Vendor Profiles (1:1 with vendor_accounts, stores wizard steps 1-6)
export const vendorProfiles = pgTable("vendor_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").references(() => vendorAccounts.id).notNull().unique(),
  serviceType: text("service_type").notNull(),
  experience: integer("experience").notNull(),
  qualifications: text("qualifications").array().default(sql`'{}'`),
  onlineProfiles: jsonb("online_profiles"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  travelMode: text("travel_mode").notNull(), // 'travel-to-guests' or 'guests-come-to-me'
  serviceRadius: integer("service_radius"), // in miles (for travel-to-guests)
  serviceAddress: text("service_address"), // (for guests-come-to-me)
  photos: text("photos").array().default(sql`'{}'`),
  serviceDescription: text("service_description").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVendorProfileSchema = createInsertSchema(vendorProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVendorProfile = z.infer<typeof insertVendorProfileSchema>;
export type VendorProfile = typeof vendorProfiles.$inferSelect;

// Vendor Listings (1:n with vendor_profiles, stores listing wizard data)
export const vendorListings = pgTable("vendor_listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").references(() => vendorProfiles.id),
  accountId: varchar("account_id").references(() => vendorAccounts.id).notNull(),
  status: text("status").notNull().default("draft"), // draft, pending, active, inactive
  title: text("title"),
  listingData: jsonb("listing_data"), // Complete listing wizard form data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertVendorListingSchema = createInsertSchema(vendorListings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateVendorListingSchema = createInsertSchema(vendorListings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  accountId: true,
}).partial();

export type InsertVendorListing = z.infer<typeof insertVendorListingSchema>;
export type UpdateVendorListing = z.infer<typeof updateVendorListingSchema>;
export type VendorListing = typeof vendorListings.$inferSelect;

// Bookings
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => users.id),
  vendorId: varchar("vendor_id").references(() => vendors.id).notNull(),
  eventId: varchar("event_id").references(() => events.id),
  packageId: text("package_id"), // reference to selected package
  addOnIds: text("add_on_ids").array().default(sql`'{}'`),
  eventDate: text("event_date").notNull(),
  eventStartTime: text("event_start_time"),
  eventLocation: text("event_location"),
  guestCount: integer("guest_count"),
  specialRequests: text("special_requests"),
  totalAmount: integer("total_amount").notNull(), // in cents
  platformFee: integer("platform_fee").notNull(), // 15% of total
  vendorPayout: integer("vendor_payout").notNull(), // totalAmount - platformFee
  depositAmount: integer("deposit_amount").notNull(), // down payment
  depositPaidAt: timestamp("deposit_paid_at"), // track when deposit was paid for 48hr refund policy
  finalPaymentStrategy: text("final_payment_strategy"), // 'immediately', '2_weeks_prior', 'day_of_event'
  status: bookingStatusEnum("status").notNull().default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at"),
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// Messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  senderId: varchar("sender_id").notNull(), // can be customer or vendor
  senderType: text("sender_type").notNull(), // 'customer' or 'vendor'
  content: text("content").notNull(),
  attachments: text("attachments").array().default(sql`'{}'`), // URLs to uploaded files
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Payment Schedule (tracks multiple installments per booking)
export const paymentSchedules = pgTable("payment_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  installmentNumber: integer("installment_number").notNull(), // 1 for deposit, 2+ for subsequent payments
  amount: integer("amount").notNull(), // in cents
  dueDate: text("due_date").notNull(),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentScheduleSchema = createInsertSchema(paymentSchedules).omit({
  id: true,
  createdAt: true,
});

export type InsertPaymentSchedule = z.infer<typeof insertPaymentScheduleSchema>;
export type PaymentSchedule = typeof paymentSchedules.$inferSelect;

// Payments (records of actual transactions)
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  scheduleId: varchar("schedule_id").references(() => paymentSchedules.id),
  customerId: varchar("customer_id").references(() => users.id),
  vendorId: varchar("vendor_id").references(() => vendors.id).notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
  stripeTransferId: text("stripe_transfer_id"), // transfer to vendor via Stripe Connect
  amount: integer("amount").notNull(), // in cents
  platformFee: integer("platform_fee").notNull(),
  vendorPayout: integer("vendor_payout").notNull(),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  refundAmount: integer("refund_amount"),
  refundReason: text("refund_reason"),
  refundedAt: timestamp("refunded_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientId: varchar("recipient_id").notNull(), // vendor or customer ID
  recipientType: text("recipient_type").notNull(), // 'vendor' or 'customer'
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"), // URL to relevant page
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Review Replies (vendors can reply to reviews)
export const reviewReplies = pgTable("review_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id").references(() => vendors.id).notNull(),
  reviewIndex: integer("review_index").notNull(), // index in vendor.reviews array
  reply: text("reply").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReviewReplySchema = createInsertSchema(reviewReplies).omit({
  id: true,
  createdAt: true,
});

export type InsertReviewReply = z.infer<typeof insertReviewReplySchema>;
export type ReviewReply = typeof reviewReplies.$inferSelect;
