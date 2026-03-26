import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  jsonb,
  boolean,
  doublePrecision,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums for type safety
export const userRoleEnum = pgEnum("user_role", ["customer", "vendor", "admin"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "failed",
  "expired",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "requires_action",
  "partial",
  "partially_refunded",
  "paid",
  "succeeded",
  "refunded",
  "failed",
  "disputed",
]);
export const paymentTypeEnum = pgEnum("payment_type", ["deposit", "final", "installment"]);
export const listingStatusEnum = pgEnum("listing_status", ["draft", "pending", "active", "inactive", "deleted"]);
export const payoutStatusEnum = pgEnum("payout_status", [
  "not_ready",
  "eligible",
  "scheduled",
  "paid",
  "blocked",
  "cancelled",
]);
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
export const bookingDisputeStatusEnum = pgEnum("booking_dispute_status", [
  "filed",
  "vendor_responded",
  "resolved_refund",
  "resolved_payout",
]);

export const users = pgTable(
  "users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    role: userRoleEnum("role").notNull().default("customer"),
    auth0Sub: text("auth0_sub"),
    displayName: text("display_name"),
    lastLoginAt: timestamp("last_login_at"),
    defaultLocation: jsonb("default_location"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    auth0SubUniqueIdx: uniqueIndex("users_auth0_sub_unique_idx")
      .on(table.auth0Sub)
      .where(sql`${table.auth0Sub} is not null and btrim(${table.auth0Sub}) <> ''`),
  })
);

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
export const vendorAccounts = pgTable(
  "vendor_accounts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar("user_id").references(() => users.id), // Canonical vendor ownership link
    activeProfileId: varchar("active_profile_id"),
    email: text("email").notNull().unique(),
    auth0Sub: text("auth0_sub"), // Migration-window fallback for identity linking
    password: text("password").notNull(),
    businessName: text("business_name").notNull(),
    stripeConnectId: text("stripe_connect_id"),
    stripeAccountType: text("stripe_account_type"), // 'express' or 'standard'
    stripeOnboardingComplete: boolean("stripe_onboarding_complete").default(false),
    profileComplete: boolean("profile_complete").default(false),
    active: boolean("active").default(true),
    googleAccessToken: text("google_access_token"),
    googleRefreshToken: text("google_refresh_token"),
    googleTokenExpiresAt: timestamp("google_token_expires_at"),
    googleCalendarId: text("google_calendar_id"),
    googleConnectionStatus: text("google_connection_status").notNull().default("disconnected"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userIdActiveUniqueIdx: uniqueIndex("vendor_accounts_user_id_active_unique_idx")
      .on(table.userId)
      .where(sql`${table.userId} is not null and ${table.deletedAt} is null`),
    auth0SubActiveUniqueIdx: uniqueIndex("vendor_accounts_auth0_sub_active_unique_idx")
      .on(table.auth0Sub)
      .where(
        sql`${table.auth0Sub} is not null and btrim(${table.auth0Sub}) <> '' and ${table.deletedAt} is null`
      ),
  })
);

export const insertVendorAccountSchema = createInsertSchema(vendorAccounts).omit({
  id: true,
  createdAt: true,
});

export type InsertVendorAccount = z.infer<typeof insertVendorAccountSchema>;
export type VendorAccount = typeof vendorAccounts.$inferSelect;

// Vendor Profiles (1:n with vendor_accounts, stores onboarding/profile details)
export const vendorProfiles = pgTable("vendor_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").references(() => vendorAccounts.id).notNull(),
  active: boolean("active").notNull().default(true),
  deactivatedAt: timestamp("deactivated_at"),
  profileName: text("profile_name").notNull().default("Vendor Profile"),
  businessPhone: text("business_phone"),
  businessEmail: text("business_email"),
  businessAddressLabel: text("business_address_label"),
  businessStreet: text("business_street"),
  businessCity: text("business_city"),
  businessState: text("business_state"),
  businessZip: text("business_zip"),
  homeBaseLat: doublePrecision("home_base_lat"),
  homeBaseLng: doublePrecision("home_base_lng"),
  operatingTimezone: text("operating_timezone").notNull().default("UTC"),
  showBusinessPhoneToCustomers: boolean("show_business_phone_to_customers").notNull().default(false),
  showBusinessEmailToCustomers: boolean("show_business_email_to_customers").notNull().default(false),
  showBusinessAddressToCustomers: boolean("show_business_address_to_customers").notNull().default(false),
  aboutVendor: text("about_vendor"),
  aboutBusiness: text("about_business"),
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
  category: text("category"),
  subcategory: text("subcategory"),
  title: text("title"),
  description: text("description"),
  whatsIncluded: text("whats_included").array().notNull().default(sql`'{}'`),
  tags: text("tags").array().notNull().default(sql`'{}'`),
  popularFor: text("popular_for").array().notNull().default(sql`'{}'`),
  instantBookEnabled: boolean("instant_book_enabled").notNull().default(false),
  pricingUnit: text("pricing_unit"),
  priceCents: integer("price_cents"),
  quantity: integer("quantity").notNull().default(1),
  minimumHours: integer("minimum_hours"),
  listingServiceCenterLabel: text("listing_service_center_label"),
  listingServiceCenterLat: doublePrecision("listing_service_center_lat"),
  listingServiceCenterLng: doublePrecision("listing_service_center_lng"),
  serviceRadiusMiles: integer("service_radius_miles"),
  serviceAreaMode: text("service_area_mode"),
  travelOffered: boolean("travel_offered").notNull().default(false),
  travelFeeEnabled: boolean("travel_fee_enabled").notNull().default(false),
  travelFeeType: text("travel_fee_type"),
  travelFeeAmountCents: integer("travel_fee_amount_cents"),
  pickupOffered: boolean("pickup_offered").notNull().default(false),
  deliveryOffered: boolean("delivery_offered").notNull().default(false),
  deliveryFeeEnabled: boolean("delivery_fee_enabled").notNull().default(false),
  deliveryFeeAmountCents: integer("delivery_fee_amount_cents"),
  setupOffered: boolean("setup_offered").notNull().default(false),
  setupFeeEnabled: boolean("setup_fee_enabled").notNull().default(false),
  setupFeeAmountCents: integer("setup_fee_amount_cents"),
  photos: text("photos").array().notNull().default(sql`'{}'`),
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
  vendorAccountId: varchar("vendor_account_id").references(() => vendorAccounts.id, { onDelete: "set null" }),
  vendorProfileId: varchar("vendor_profile_id").references(() => vendorProfiles.id, { onDelete: "set null" }),
  listingId: varchar("listing_id").references(() => vendorListings.id, { onDelete: "set null" }),

  eventId: varchar("event_id").references(() => events.id),
  packageId: text("package_id"), // reference to selected package
  addOnIds: text("add_on_ids").array().default(sql`'{}'`),
  eventDate: text("event_date").notNull(),
  eventStartTime: text("event_start_time"),
  eventEndTime: text("event_end_time"),
  itemNeededByTime: text("item_needed_by_time"),
  itemDoneByTime: text("item_done_by_time"),
  eventLocation: text("event_location"),
  guestCount: integer("guest_count"),
  specialRequests: text("special_requests"),
  bookingStartAt: timestamp("booking_start_at"),
  bookingEndAt: timestamp("booking_end_at"),
  vendorTimezoneSnapshot: text("vendor_timezone_snapshot").default("UTC"),
  listingTitleSnapshot: text("listing_title_snapshot"),
  pricingUnitSnapshot: text("pricing_unit_snapshot"),
  unitPriceCentsSnapshot: integer("unit_price_cents_snapshot"),
  bookedQuantity: integer("booked_quantity").notNull().default(1),
  deliveryFeeAmountCents: integer("delivery_fee_amount_cents"),
  setupFeeAmountCents: integer("setup_fee_amount_cents"),
  travelFeeAmountCents: integer("travel_fee_amount_cents"),
  logisticsTotalCents: integer("logistics_total_cents"),
  baseSubtotalCents: integer("base_subtotal_cents"),
  subtotalAmountCents: integer("subtotal_amount_cents"),
  customerFeeAmountCents: integer("customer_fee_amount_cents"),
  instantBookSnapshot: boolean("instant_book_snapshot"),
  totalAmount: integer("total_amount").notNull(), // in cents
  platformFee: integer("platform_fee").notNull(), // vendor fee portion in cents
  vendorPayout: integer("vendor_payout").notNull(), // totalAmount - platformFee
  depositAmount: integer("deposit_amount").notNull(), // down payment
  depositPaidAt: timestamp("deposit_paid_at"), // track when deposit was paid for 48hr refund policy
  finalPaymentStrategy: text("final_payment_strategy"), // 'immediately', '2_weeks_prior', 'day_of_event'
  status: bookingStatusEnum("status").notNull().default("pending"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  payoutStatus: payoutStatusEnum("payout_status").notNull().default("not_ready"),
  payoutEligibleAt: timestamp("payout_eligible_at"),
  paidOutAt: timestamp("paid_out_at"),
  payoutBlockedReason: text("payout_blocked_reason"),
  googleEventId: text("google_event_id"),
  googleCalendarId: text("google_calendar_id"),
  googleSyncStatus: text("google_sync_status").default("pending"),
  googleLastSyncedAt: timestamp("google_last_synced_at"),
  googleSyncError: text("google_sync_error"),
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

// Booking disputes (customer-filed after event completion)
export const bookingDisputes = pgTable(
  "booking_disputes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: varchar("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    customerId: varchar("customer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vendorAccountId: varchar("vendor_account_id")
      .references(() => vendorAccounts.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    details: text("details"),
    status: bookingDisputeStatusEnum("status").notNull().default("filed"),
    vendorResponse: text("vendor_response"),
    adminDecision: text("admin_decision"),
    adminNotes: text("admin_notes"),
    filedAt: timestamp("filed_at").defaultNow().notNull(),
    vendorRespondedAt: timestamp("vendor_responded_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    bookingIdUnique: uniqueIndex("booking_disputes_booking_id_idx").on(table.bookingId),
    statusIdx: index("booking_disputes_status_idx").on(table.status),
    filedAtIdx: index("booking_disputes_filed_at_idx").on(table.filedAt),
  })
);

export const insertBookingDisputeSchema = createInsertSchema(bookingDisputes).omit({
  id: true,
  filedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBookingDispute = z.infer<typeof insertBookingDisputeSchema>;
export type BookingDispute = typeof bookingDisputes.$inferSelect;

export const bookingItems = pgTable(
  "booking_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: varchar("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    listingId: varchar("listing_id").references(() => vendorListings.id, { onDelete: "set null" }),
    title: text("title"),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    totalPriceCents: integer("total_price_cents").notNull().default(0),
    itemData: jsonb("item_data").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    bookingIdIdx: index("idx_booking_items_booking_id").on(table.bookingId),
    listingIdIdx: index("idx_booking_items_listing_id").on(table.listingId),
  })
);

export const insertBookingItemSchema = createInsertSchema(bookingItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBookingItem = z.infer<typeof insertBookingItemSchema>;
export type BookingItem = typeof bookingItems.$inferSelect;

export const googleCalendarEventMappings = pgTable(
  "google_calendar_event_mappings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    vendorAccountId: varchar("vendor_account_id")
      .notNull()
      .references(() => vendorAccounts.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id").notNull(),
    googleCalendarId: text("google_calendar_id").notNull(),
    listingId: varchar("listing_id")
      .notNull()
      .references(() => vendorListings.id, { onDelete: "cascade" }),
    mappingSource: text("mapping_source").notNull().default("manual"),
    mappingStatus: text("mapping_status").notNull().default("reviewed"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    vendorCalendarEventUnique: uniqueIndex("google_calendar_event_mappings_vendor_calendar_event_idx").on(
      table.vendorAccountId,
      table.googleCalendarId,
      table.googleEventId
    ),
  })
);

export const insertGoogleCalendarEventMappingSchema = createInsertSchema(googleCalendarEventMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGoogleCalendarEventMapping = z.infer<typeof insertGoogleCalendarEventMappingSchema>;
export type GoogleCalendarEventMapping = typeof googleCalendarEventMappings.$inferSelect;

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
  stripeChargeId: text("stripe_charge_id"),
  stripeTransferId: text("stripe_transfer_id"), // transfer to vendor via Stripe Connect
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  amount: integer("amount").notNull(), // in cents
  platformFee: integer("platform_fee").notNull(),
  vendorPayout: integer("vendor_payout").notNull(),
  totalAmount: integer("total_amount"),
  platformFeeAmount: integer("platform_fee_amount"),
  vendorGrossAmount: integer("vendor_gross_amount"),
  vendorNetPayoutAmount: integer("vendor_net_payout_amount"),
  stripeProcessingFeeEstimate: integer("stripe_processing_fee_estimate"),
  actualStripeFeeAmount: integer("actual_stripe_fee_amount"),
  refundedAmount: integer("refunded_amount").default(0),
  disputeStatus: text("dispute_status"),
  payoutStatus: payoutStatusEnum("payout_status").notNull().default("not_ready"),
  payoutEligibleAt: timestamp("payout_eligible_at"),
  payoutScheduledAt: timestamp("payout_scheduled_at"),
  paidOutAt: timestamp("paid_out_at"),
  payoutBlockedReason: text("payout_blocked_reason"),
  payoutAdjustedAmount: integer("payout_adjusted_amount"),
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

// Stripe webhook replay protection / audit
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  livemode: boolean("livemode").notNull().default(false),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export const insertStripeWebhookEventSchema = createInsertSchema(stripeWebhookEvents).omit({
  id: true,
  processedAt: true,
});

export type InsertStripeWebhookEvent = z.infer<typeof insertStripeWebhookEventSchema>;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;

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
