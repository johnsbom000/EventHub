import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  jsonb,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for type safety
export const userRoleEnum = pgEnum("user_role", ["customer", "vendor", "admin"]);
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
  "payout_processed",
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("customer"),
  displayName: text("display_name"),
  lastLoginAt: timestamp("last_login_at"),
  defaultLocation: jsonb("default_location"),
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

export const insertEventSchema = createInsertSchema(events)
  .omit({
    id: true,
    createdAt: true,
  })
  .extend({
    photographerDetails: photographerDetailsSchema.optional(),
    videographerDetails: videographerDetailsSchema.optional(),
    floristDetails: floristDetailsSchema.optional(),
    cateringDetails: cateringDetailsSchema.optional(),
    djDetails: djDetailsSchema.optional(),
    propDecorDetails: propDecorDetailsSchema.optional(),
  });

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// Vendor Accounts (authentication only)
export const vendorAccounts = pgTable("vendor_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Links to customer account if upgraded
  email: text("email").notNull().unique(),
  auth0Sub: text("auth0_sub"),
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

export const updateVendorListingSchema = createInsertSchema(vendorListings)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    accountId: true,
  })
  .partial();

export type InsertVendorListing = z.infer<typeof insertVendorListingSchema>;
export type UpdateVendorListing = z.infer<typeof updateVendorListingSchema>;
export type VendorListing = typeof vendorListings.$inferSelect;

// Bookings
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => users.id),

  // ✅ migrated from legacy vendors -> vendor_accounts
  vendorAccountId: varchar("vendor_account_id").references(() => vendorAccounts.id),

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

  // ✅ migrated from legacy vendors -> vendor_accounts
  vendorAccountId: varchar("vendor_account_id").references(() => vendorAccounts.id),

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

  // ✅ migrated from legacy vendors -> vendor_accounts
  vendorAccountId: varchar("vendor_account_id").references(() => vendorAccounts.id),

  reviewIndex: integer("review_index").notNull(), // index in vendor.reviews array (legacy concept; ok for now)
  reply: text("reply").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReviewReplySchema = createInsertSchema(reviewReplies).omit({
  id: true,
  createdAt: true,
});

export type InsertReviewReply = z.infer<typeof insertReviewReplySchema>;
export type ReviewReply = typeof reviewReplies.$inferSelect;

// Web Traffic Tracking (for admin analytics)
export const webTraffic = pgTable("web_traffic", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // nullable - can track anonymous visits
  userType: text("user_type"), // 'customer', 'vendor', 'admin', or null
  path: text("path").notNull(),
  referrer: text("referrer"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertWebTrafficSchema = createInsertSchema(webTraffic).omit({
  id: true,
  timestamp: true,
});

// Listing-level traffic (replaces listing_views)
export const listingTraffic = pgTable("listing_traffic", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listingId: varchar("listing_id")
    .notNull()
    .references(() => vendorListings.id, { onDelete: "cascade" }),

  eventType: text("event_type").notNull(),
  sessionId: text("session_id"),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),

  referrer: text("referrer"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),

  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  meta: jsonb("meta").default({}).notNull(),
});

export const insertListingTrafficSchema = createInsertSchema(listingTraffic).omit({
  id: true,
  occurredAt: true,
});

export type InsertWebTraffic = z.infer<typeof insertWebTrafficSchema>;
export type WebTraffic = typeof webTraffic.$inferSelect;
export type InsertListingTraffic = z.infer<typeof insertListingTrafficSchema>;
export type ListingTraffic = typeof listingTraffic.$inferSelect;

export type RentalType = typeof rentalTypes.$inferSelect;

// Rental Types (DB-backed canonical prop/rental types)
export const rentalTypes = pgTable("rental_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
