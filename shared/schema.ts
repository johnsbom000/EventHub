import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  serial,
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
export const paymentTypeEnum = pgEnum("payment_type", [
  // Active values
  "booking",          // full booking total (base + add-ons + platform fee)
  "security_deposit", // fixed-amount hold; refunded 72h post-event if no damage claim
  "travel_fee",       // vendor-proposed travel/delivery fee for out-of-radius bookings
  // Legacy values — still in DB for existing rows; new rows use 'booking' instead of 'deposit'
  "deposit",
  "final",
  "installment",
]);
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
  "google_calendar_booking_updated",
  "google_calendar_booking_deleted",
  "google_calendar_sync_error",
  "travel_fee_proposed",
  "travel_fee_accepted",
  "travel_fee_declined",
]);
export const bookingDisputeStatusEnum = pgEnum("booking_dispute_status", [
  "filed",
  "vendor_responded",
  "resolved_refund",
  "resolved_payout",
]);
export const messageSenderTypeEnum = pgEnum("message_sender_type", ["customer", "vendor"]);
export const notificationRecipientTypeEnum = pgEnum("notification_recipient_type", ["customer", "vendor"]);

// Shared identity table for all principals — customers, vendors, and admins.
// Vendors have an additional vendor_accounts row linked via vendor_accounts.user_id.
// In routes and application code, non-vendor users are referred to as "customers",
// but the DB table is "users" because vendors also have a users row.
// Always JOIN users — never "customers".
export const users = pgTable(
  "users",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: userRoleEnum("role").notNull().default("customer"),
    auth0Sub: text("auth0_sub"),
    displayName: text("display_name"),
    lastLoginAt: timestamp("last_login_at"),
    defaultLocation: jsonb("default_location"),
    preferredLanguage: varchar("preferred_language", { length: 10 }).notNull().default("en"),
    stripeCustomerId: text("stripe_customer_id"),
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
  customerId: varchar("customer_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
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
    googleAccountEmail: varchar("google_account_email"),
    shopActive: boolean("shop_active").notNull().default(true),
    shopSlug: text("shop_slug").notNull().default(""),
    ownerFirstName: text("owner_first_name"),
    ownerLastName: text("owner_last_name"),
    ownerPhone: text("owner_phone"),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow(),
    isMarqueeVendor: boolean("is_marquee_vendor").notNull().default(false),
    marqueeVendorNumber: integer("marquee_vendor_number"),
    marqueeHolidayBookingsUsed: integer("marquee_holiday_bookings_used").notNull().default(0),
    marqueeHolidayBonusBookings: integer("marquee_holiday_bonus_bookings").notNull().default(0),
    marqueeActivatedAt: timestamp("marquee_activated_at"),
    marqueeHolidayEndsAt: timestamp("marquee_holiday_ends_at"),
    marqueeRateEndsAt: timestamp("marquee_rate_ends_at"),
    marqueeCustomerFeeEndsAt: timestamp("marquee_customer_fee_ends_at"),
    marqueeVisibilityEndsAt: timestamp("marquee_visibility_ends_at"),
    marqueeConsecutiveInactiveMonths: integer("marquee_consecutive_inactive_months").notNull().default(0),
    referralCode: varchar("referral_code", { length: 20 }),
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
    marqueeVendorNumberUniqueIdx: uniqueIndex("vendor_accounts_marquee_vendor_number_unique_idx")
      .on(table.marqueeVendorNumber)
      .where(sql`${table.marqueeVendorNumber} is not null`),
    referralCodeUniqueIdx: uniqueIndex("vendor_accounts_referral_code_unique_idx")
      .on(table.referralCode)
      .where(sql`${table.referralCode} is not null`),
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
  status: listingStatusEnum("status").notNull().default("draft"),
  violationRemoval: boolean("violation_removal").notNull().default(false),
  pendingAdminReview: boolean("pending_admin_review").notNull().default(false),
  category: text("category"),
  subcategory: text("subcategory"),
  subcategoryDetail: text("subcategory_detail"),
  title: text("title"),
  description: text("description"),
  whatsIncluded: text("whats_included").array().notNull().default(sql`'{}'`),
  whatsNotIncluded: text("whats_not_included").array().notNull().default(sql`'{}'`),
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
  takedownOffered: boolean("takedown_offered").notNull().default(false),
  takedownFeeEnabled: boolean("takedown_fee_enabled").notNull().default(false),
  takedownFeeAmountCents: integer("takedown_fee_amount_cents"),
  photos: text("photos").array().notNull().default(sql`'{}'`),
  listingData: jsonb("listing_data"), // Complete listing wizard form data
  cancellationPolicy: text("cancellation_policy"),
  cancellationPolicyDays: integer("cancellation_policy_days"),
  // ─── Dimensions (Rental listings and package_item rows) ───────────────────
  dimensionUnit: text("dimension_unit"),
  dimensionWidth: doublePrecision("dimension_width"),
  dimensionLength: doublePrecision("dimension_length"),
  dimensionHeight: doublePrecision("dimension_height"),
  // ─── Listing type architecture ─────────────────────────────────────────────
  // listing_type: 'single' (default) | 'package_container' | 'package_item' | 'addon'
  // Browse queries MUST filter: WHERE listing_type NOT IN ('package_item', 'addon')
  listingType: text("listing_type").notNull().default("single"),
  // parentListingId: set on package_item and addon child rows
  parentListingId: varchar("parent_listing_id"), // self-referential FK — added in migration 0063
  // package_availability_mode: 'dependent' | 'independent' — only on package_container
  packageAvailabilityMode: text("package_availability_mode"),
  // serviceAreaOverride: when true on a package_item, use its own service area fields
  serviceAreaOverride: boolean("service_area_override").notNull().default(false),
  // sortOrder: display ordering for package_item children
  sortOrder: integer("sort_order").notNull().default(0),
  // ─── Security deposit ──────────────────────────────────────────────────────
  securityDepositEnabled: boolean("security_deposit_enabled").notNull().default(false),
  securityDepositCents: integer("security_deposit_cents"),
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
  customerId: varchar("customer_id").references(() => users.id, { onDelete: "set null" }),

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
  eventLocation: text("event_location"),
  eventLocationLat: doublePrecision("event_location_lat"),
  eventLocationLng: doublePrecision("event_location_lng"),
  outsideServiceRadius: boolean("outside_service_radius").notNull().default(false),
  eventTimezone: text("event_timezone"),
  guestCount: integer("guest_count"),
  specialRequests: text("special_requests"),
  bookingStartAt: timestamp("booking_start_at", { withTimezone: true }),
  bookingEndAt: timestamp("booking_end_at", { withTimezone: true }),
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
  depositPaidAt: timestamp("deposit_paid_at"), // track when deposit was paid for 72hr refund policy
  finalPaymentStrategy: text("final_payment_strategy"), // 'immediately', '2_weeks_prior', 'day_of_event'
  securityDepositCents: integer("security_deposit_cents"), // refundable security deposit (snapshotted at booking time)
  securityDepositRefundedAt: timestamp("security_deposit_refunded_at", { withTimezone: true }), // when security deposit was refunded to customer
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
  reviewPromptSent: boolean("review_prompt_sent").notNull().default(false),
  pendingReminder6pmSent: boolean("pending_reminder_6pm_sent").notNull().default(false),
  pendingReminder9amSent: boolean("pending_reminder_9am_sent").notNull().default(false),
  pendingReminder24hSent: boolean("pending_reminder_24h_sent").notNull().default(false),
  eventDayReminderSent: boolean("event_day_reminder_sent").notNull().default(false),
  vendorMsgEmailLastSentAt: timestamp("vendor_msg_email_last_sent_at"),
  customerMsgEmailLastSentAt: timestamp("customer_msg_email_last_sent_at"),
  cancellationPolicySnapshot: jsonb("cancellation_policy_snapshot"),
  appliedDiscountId: varchar("applied_discount_id").references(() => vendorDiscounts.id, { onDelete: "set null" }),
  discountAmountCents: integer("discount_amount_cents"),
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
    // 'damage_claim' | 'travel_fee_cancellation' | 'not_as_advertised'
    disputeType: text("dispute_type").notNull().default("damage_claim"),
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

// Admin notes on disputes — one row per note, chronological log
export const disputeAdminNotes = pgTable(
  "dispute_admin_notes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    disputeId: varchar("dispute_id")
      .notNull()
      .references(() => bookingDisputes.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    disputeIdIdx: index("dispute_admin_notes_dispute_id_idx").on(table.disputeId, table.createdAt),
  })
);

export type DisputeAdminNote = typeof disputeAdminNotes.$inferSelect;

export const bookingItems = pgTable(
  "booking_items",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: varchar("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    listingId: varchar("listing_id").references(() => vendorListings.id, { onDelete: "set null" }),
    // item_type: 'base' (primary listing/package) | 'addon' (add-on line item)
    itemType: text("item_type").notNull().default("base"),
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

// ─── Listing Add-on Links ──────────────────────────────────────────────────────
// Many-to-many: parent listings ↔ add-on listings.
// A vendor attaches add-ons to a listing via the "Attach Add-ons" wizard step.
// The same add-on can be attached to multiple parent listings — its quantity
// pool is shared across all of them (checked via booking_items).
export const listingAddonLinks = pgTable(
  "listing_addon_links",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    parentListingId: varchar("parent_listing_id")
      .notNull()
      .references(() => vendorListings.id, { onDelete: "cascade" }),
    addonListingId: varchar("addon_listing_id")
      .notNull()
      .references(() => vendorListings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    parentAddonUnique: uniqueIndex("listing_addon_links_parent_addon_unique").on(
      table.parentListingId,
      table.addonListingId
    ),
    parentIdx: index("idx_addon_links_parent").on(table.parentListingId),
    addonIdx: index("idx_addon_links_addon").on(table.addonListingId),
  })
);

export type ListingAddonLink = typeof listingAddonLinks.$inferSelect;
export type InsertListingAddonLink = typeof listingAddonLinks.$inferInsert;

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
  senderType: messageSenderTypeEnum("sender_type").notNull(),
  content: text("content").notNull(),
  attachments: text("attachments").array().default(sql`'{}'`), // URLs to uploaded files
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Payments (records of actual transactions)
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").references(() => bookings.id).notNull(),
  customerId: varchar("customer_id").references(() => users.id, { onDelete: "set null" }),

  // ✅ migrated from legacy vendors -> vendor_accounts
  vendorAccountId: varchar("vendor_account_id").references(() => vendorAccounts.id),

  stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
  stripeChargeId: text("stripe_charge_id"),
  stripeTransferId: text("stripe_transfer_id"), // transfer to vendor via Stripe Connect
  stripeConnectedAccountId: text("stripe_connected_account_id"),
  // `amount` = per-transaction charge (e.g. deposit). NOT the same as totalAmount (booking total).
  amount: integer("amount").notNull(),
  totalAmount: integer("total_amount"),
  platformFeeAmount: integer("platform_fee_amount"),
  vendorGrossAmount: integer("vendor_gross_amount"),
  vendorNetPayoutAmount: integer("vendor_net_payout_amount"),
  stripeProcessingFeeEstimate: integer("stripe_processing_fee_estimate"),
  actualStripeFeeAmount: integer("actual_stripe_fee_amount"),
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
  payoutEmailSent: boolean("payout_email_sent").notNull().default(false),
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
  recipientType: notificationRecipientTypeEnum("recipient_type").notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"), // URL to relevant page
  read: boolean("read").default(false).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).default(sql`now() + interval '90 days'`),
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

  // DEPRECATED: use listingReviewId FK instead; kept until backfill is confirmed
  reviewIndex: integer("review_index").notNull(),
  listingReviewId: varchar("listing_review_id").references(() => listingReviews.id, { onDelete: "cascade" }),
  reply: text("reply").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReviewReplySchema = createInsertSchema(reviewReplies).omit({
  id: true,
  createdAt: true,
});

export type InsertReviewReply = z.infer<typeof insertReviewReplySchema>;
export type ReviewReply = typeof reviewReplies.$inferSelect;

// Listing Reviews
export const listingReviews = pgTable(
  "listing_reviews",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    listingId: varchar("listing_id")
      .notNull()
      .references(() => vendorListings.id, { onDelete: "cascade" }),
    bookingId: varchar("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    vendorAccountId: varchar("vendor_account_id").references(() => vendorAccounts.id, { onDelete: "set null" }),
    userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    listingIdIdx: index("idx_listing_reviews_listing_id").on(table.listingId, table.createdAt),
    vendorAccountIdIdx: index("idx_listing_reviews_vendor_account_id").on(table.vendorAccountId),
    bookingIdUniqueIdx: uniqueIndex("listing_reviews_booking_id_unique_idx")
      .on(table.bookingId)
      .where(sql`${table.bookingId} is not null`),
  })
);

export const insertListingReviewSchema = createInsertSchema(listingReviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertListingReview = z.infer<typeof insertListingReviewSchema>;
export type ListingReview = typeof listingReviews.$inferSelect;

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
  expiresAt: timestamp("expires_at").notNull().default(sql`now() + interval '90 days'`),
});

export const insertStripeWebhookEventSchema = createInsertSchema(stripeWebhookEvents).omit({
  id: true,
  processedAt: true,
});

export type InsertStripeWebhookEvent = z.infer<typeof insertStripeWebhookEventSchema>;
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;

export type RentalType = typeof rentalTypes.$inferSelect;

// Vendor Vacation Blocks (date ranges when vendor is away)
export const vendorVacationBlocks = pgTable("vendor_vacation_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorId: varchar("vendor_id")
    .notNull()
    .references(() => vendorAccounts.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date").notNull(),     // YYYY-MM-DD
  // Google Calendar sync linkage (added migration 0057)
  googleEventId: text("google_event_id"),
  googleCalendarId: text("google_calendar_id"),
  source: text("source").notNull().default("manual"), // 'manual' | 'google_calendar'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertVendorVacationBlockSchema = createInsertSchema(vendorVacationBlocks).omit({
  id: true,
  createdAt: true,
});

export type InsertVendorVacationBlock = z.infer<typeof insertVendorVacationBlockSchema>;
export type VendorVacationBlock = typeof vendorVacationBlocks.$inferSelect;

// Rental Types (DB-backed canonical prop/rental types)
export const rentalTypes = pgTable("rental_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Planning Boards — customer-created boards for saving vendor listings
export const planningBoards = pgTable("planning_boards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const boardSavedListings = pgTable(
  "board_saved_listings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    boardId: varchar("board_id")
      .notNull()
      .references(() => planningBoards.id, { onDelete: "cascade" }),
    listingId: varchar("listing_id")
      .notNull()
      .references(() => vendorListings.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueBoardListing: uniqueIndex("board_saved_listings_board_listing_unique").on(
      table.boardId,
      table.listingId,
    ),
  }),
);

export const insertPlanningBoardSchema = createInsertSchema(planningBoards).omit({
  id: true,
  createdAt: true,
});

export const insertBoardSavedListingSchema = createInsertSchema(boardSavedListings).omit({
  id: true,
  savedAt: true,
});

export type PlanningBoard = typeof planningBoards.$inferSelect;
export type BoardSavedListing = typeof boardSavedListings.$inferSelect;
export type InsertPlanningBoard = z.infer<typeof insertPlanningBoardSchema>;
export type InsertBoardSavedListing = z.infer<typeof insertBoardSavedListingSchema>;

// ─── Circumvention Prevention ─────────────────────────────────────────────────

// flag_type: what triggered the flag
//   hard_block_attempt  – matched a hard-block regex (email, phone, URL, social)
//   soft_flag           – matched a soft-flag keyword phrase
//   customer_report     – a customer manually reported the content
//
// content_type: which field the content appeared in
//   chat_message | listing_description | listing_title | vendor_description | tagline
//
// status: admin review state
//   pending | dismissed | actioned

export const circumventionFlags = pgTable("circumvention_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  flagType: varchar("flag_type").notNull(),
  contentType: varchar("content_type").notNull(),
  contentSnapshot: text("content_snapshot").notNull(),
  matches: text("matches").array().notNull().default(sql`'{}'`),
  vendorAccountId: varchar("vendor_account_id").references(() => vendorAccounts.id, { onDelete: "set null" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  reportedByUserId: varchar("reported_by_user_id").references(() => users.id, { onDelete: "set null" }),
  listingId: varchar("listing_id").references(() => vendorListings.id, { onDelete: "set null" }),
  bookingId: varchar("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  status: varchar("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const circumventionWarnings = pgTable("circumvention_warnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorAccountId: varchar("vendor_account_id").notNull().references(() => vendorAccounts.id),
  flagId: varchar("flag_id").references(() => circumventionFlags.id),
  reason: text("reason").notNull(),
  issuedBy: varchar("issued_by").notNull().default("system"),
  warningNumber: integer("warning_number").notNull(),
  notifiedEmail: boolean("notified_email").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vendorSuspensions = pgTable("vendor_suspensions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vendorAccountId: varchar("vendor_account_id").notNull().references(() => vendorAccounts.id),
  reason: text("reason").notNull(),
  warningSnapshot: integer("warning_snapshot").notNull(),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  createdBy: varchar("created_by").notNull().default("system"),
  notifiedEmail: boolean("notified_email").notNull().default(false),
  liftEmailSent: boolean("lift_email_sent").notNull().default(false),
  liftedAt: timestamp("lifted_at"),
  liftedBy: varchar("lifted_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CircumventionFlag = typeof circumventionFlags.$inferSelect;
export type CircumventionWarning = typeof circumventionWarnings.$inferSelect;
export type VendorSuspension = typeof vendorSuspensions.$inferSelect;

// ─── Feedback Submissions ──────────────────────────────────────────────────────

export const feedbackTypeEnum = pgEnum("feedback_type", ["feature_request", "bug_report"]);

export const feedbackSubmissions = pgTable(
  "feedback_submissions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    type: feedbackTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    attachmentUrl: text("attachment_url"),
    submittedByUserId: varchar("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    submittedByVendorAccountId: varchar("submitted_by_vendor_account_id").references(() => vendorAccounts.id, { onDelete: "set null" }),
    submitterRole: text("submitter_role").notNull(), // 'customer' | 'vendor'
    submitterName: text("submitter_name"),
    submitterEmail: text("submitter_email"),
    flagged: boolean("flagged").notNull().default(false),
    flaggedAt: timestamp("flagged_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index("feedback_submissions_type_idx").on(table.type, table.createdAt),
    flaggedIdx: index("feedback_submissions_flagged_idx").on(table.flagged, table.createdAt),
  })
);

export const insertFeedbackSubmissionSchema = createInsertSchema(feedbackSubmissions).omit({
  id: true,
  flagged: true,
  flaggedAt: true,
  createdAt: true,
});

export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type InsertFeedbackSubmission = z.infer<typeof insertFeedbackSubmissionSchema>;

// ─── Vendor Discount System ────────────────────────────────────────────────────

export const vendorDiscounts = pgTable(
  "vendor_discounts",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    vendorAccountId: varchar("vendor_account_id")
      .notNull()
      .references(() => vendorAccounts.id, { onDelete: "cascade" }),
    discountType: varchar("discount_type").notNull(), // 'promo_code' | 'public_sale'
    code: varchar("code"), // uppercase alphanumeric, promo codes only
    percentOff: integer("percent_off").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    maxUses: integer("max_uses"), // null = unlimited
    usedCount: integer("used_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    vendorActiveIdx: index("vendor_discounts_vendor_active_idx").on(
      table.vendorAccountId,
      table.active,
      table.startsAt,
    ),
  }),
);

export const discountListings = pgTable(
  "discount_listings",
  {
    discountId: varchar("discount_id")
      .notNull()
      .references(() => vendorDiscounts.id, { onDelete: "cascade" }),
    listingId: varchar("listing_id")
      .notNull()
      .references(() => vendorListings.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: uniqueIndex("discount_listings_pk").on(table.discountId, table.listingId),
    listingIdx: index("discount_listings_listing_idx").on(table.listingId),
  }),
);

export const discountRedemptions = pgTable(
  "discount_redemptions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    discountId: varchar("discount_id")
      .notNull()
      .references(() => vendorDiscounts.id, { onDelete: "cascade" }),
    bookingId: varchar("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
  },
  (table) => ({
    discountIdx: index("discount_redemptions_discount_idx").on(table.discountId, table.redeemedAt),
    bookingUniqueIdx: uniqueIndex("discount_redemptions_booking_unique_idx").on(table.bookingId),
  }),
);

export const insertVendorDiscountSchema = createInsertSchema(vendorDiscounts).omit({
  id: true,
  usedCount: true,
  createdAt: true,
  updatedAt: true,
});

export type VendorDiscount = typeof vendorDiscounts.$inferSelect;
export type InsertVendorDiscount = z.infer<typeof insertVendorDiscountSchema>;
export type DiscountListing = typeof discountListings.$inferSelect;
export type DiscountRedemption = typeof discountRedemptions.$inferSelect;

// ─── Listing Translations ──────────────────────────────────────────────────────
// One row per (listing_id, language). Written async after a vendor saves a
// listing. Read by listing GET endpoints when a non-English language is wanted.
// Supported language codes: 'es' (Spanish), 'pt' (Portuguese).

export const listingTranslations = pgTable(
  "listing_translations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    listingId: varchar("listing_id")
      .notNull()
      .references(() => vendorListings.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 10 }).notNull(),
    title: text("title"),
    description: text("description"),
    whatsIncluded: text("whats_included").array().notNull().default(sql`'{}'`),
    whatsNotIncluded: text("whats_not_included").array().notNull().default(sql`'{}'`),
    // 'pending' | 'completed' | 'failed'
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    translatedAt: timestamp("translated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    listingLangUnique: uniqueIndex("listing_translations_listing_lang_unique").on(
      table.listingId,
      table.language
    ),
    listingIdIdx: index("idx_listing_translations_listing_id").on(table.listingId, table.language),
  })
);

// ─── Google Calendar Watch Channels ────────────────────────────────────────────
// One active watch channel per vendor calendar connection.
// Google sends webhook notifications to /api/google/webhooks/calendar whenever
// anything changes in the watched calendar. We validate incoming notifications
// by looking up channelId + channelToken here.

export const googleCalendarWatchChannels = pgTable(
  "google_calendar_watch_channels",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    vendorAccountId: varchar("vendor_account_id")
      .notNull()
      .references(() => vendorAccounts.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    channelId: text("channel_id").notNull(),
    channelToken: text("channel_token").notNull(),
    resourceId: text("resource_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Incremental sync bookmark — store after every successful event fetch
    syncToken: text("sync_token"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    channelIdUnique: uniqueIndex("google_calendar_watch_channels_channel_id_unique").on(
      table.channelId
    ),
    vendorCalendarUnique: uniqueIndex("google_calendar_watch_channels_vendor_calendar_unique").on(
      table.vendorAccountId,
      table.calendarId
    ),
    expiresAtIdx: index("idx_google_watch_channels_expires_at").on(table.expiresAt),
    vendorAccountIdx: index("idx_google_watch_channels_vendor_account").on(table.vendorAccountId),
  })
);

export const insertGoogleCalendarWatchChannelSchema = createInsertSchema(googleCalendarWatchChannels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGoogleCalendarWatchChannel = z.infer<typeof insertGoogleCalendarWatchChannelSchema>;
export type GoogleCalendarWatchChannel = typeof googleCalendarWatchChannels.$inferSelect;

// ─── Google Webhook Notification Dedup Log ─────────────────────────────────────
// Google can deliver the same notification more than once. We insert each
// (channelId, messageNumber) with a unique constraint; duplicate inserts are
// silently ignored via onConflictDoNothing().

export const googleWebhookNotifications = pgTable(
  "google_webhook_notifications",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    vendorAccountId: varchar("vendor_account_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageNumber: text("message_number").notNull(), // bigint stored as text to avoid JS precision loss
    resourceId: text("resource_id").notNull(),
    resourceState: text("resource_state"),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    channelMessageUnique: uniqueIndex("google_webhook_notifications_channel_message_unique").on(
      table.channelId,
      table.messageNumber
    ),
    channelIdIdx: index("idx_google_webhook_notifications_channel_id").on(table.channelId),
  })
);

export type GoogleWebhookNotification = typeof googleWebhookNotifications.$inferSelect;

// ─── Google Calendar Vacation Mappings ─────────────────────────────────────────
// Links a Google Calendar event to a vendor vacation block.
// Kept separate from google_calendar_event_mappings (listing-scoped) intentionally.
// Used to find and delete the vacation block when the Google event is removed.

export const googleCalendarVacationMappings = pgTable(
  "google_calendar_vacation_mappings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    vendorAccountId: varchar("vendor_account_id")
      .notNull()
      .references(() => vendorAccounts.id, { onDelete: "cascade" }),
    googleEventId: text("google_event_id").notNull(),
    googleCalendarId: text("google_calendar_id").notNull(),
    vacationBlockId: varchar("vacation_block_id")
      .notNull()
      .references(() => vendorVacationBlocks.id, { onDelete: "cascade" }),
    mappingSource: text("mapping_source").notNull().default("google_calendar"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    vendorCalendarEventUnique: uniqueIndex("google_calendar_vacation_mappings_unique").on(
      table.vendorAccountId,
      table.googleCalendarId,
      table.googleEventId
    ),
    vendorCalendarIdx: index("idx_google_vacation_mappings_vendor_calendar").on(
      table.vendorAccountId,
      table.googleCalendarId
    ),
    vacationBlockIdx: index("idx_google_vacation_mappings_vacation_block").on(
      table.vacationBlockId
    ),
  })
);

export const insertGoogleCalendarVacationMappingSchema = createInsertSchema(googleCalendarVacationMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGoogleCalendarVacationMapping = z.infer<typeof insertGoogleCalendarVacationMappingSchema>;
export type GoogleCalendarVacationMapping = typeof googleCalendarVacationMappings.$inferSelect;

export type ListingTranslation = typeof listingTranslations.$inferSelect;

// ─── Travel Fee Proposals ──────────────────────────────────────────────────────
// Created by the vendor after a booking when the customer's event address falls
// outside the listing's service radius. The customer must accept before a
// payment schedule entry and Stripe payment intent are created.
//
// status lifecycle: 'pending' → 'accepted' | 'declined' | 'cancelled'
// Only one 'pending' row per booking is allowed (enforced by partial unique index).

export const travelFeeProposals = pgTable(
  "travel_fee_proposals",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: varchar("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    vendorAccountId: varchar("vendor_account_id")
      .notNull()
      .references(() => vendorAccounts.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason"),
    // 'pending' | 'accepted' | 'declined' | 'cancelled'
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bookingIdIdx: index("idx_travel_fee_proposals_booking_id").on(table.bookingId, table.createdAt),
    vendorAccountIdx: index("idx_travel_fee_proposals_vendor_account_id").on(table.vendorAccountId),
  })
);

export const insertTravelFeeProposalSchema = createInsertSchema(travelFeeProposals).omit({
  id: true,
  proposedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type TravelFeeProposal = typeof travelFeeProposals.$inferSelect;
export type InsertTravelFeeProposal = z.infer<typeof insertTravelFeeProposalSchema>;

// ── Dispute Cases (structured dispute resolution system) ───────────────────
// dispute_cases: one per booking, tracks the overall case status and resolution
// dispute_filings: individual filings within a case (customer, vendor, or admin notes)

export const disputeCaseStatusEnum = pgEnum("dispute_case_status", [
  "open",
  "pending_review",
  "resolved",
]);

export const disputeFilingFiledByEnum = pgEnum("dispute_filing_filed_by", [
  "customer",
  "vendor",
  "admin",
]);

export const disputeFilingDisputeTypeEnum = pgEnum("dispute_filing_dispute_type", [
  // Customer-filed types
  "service_not_as_described",
  "vendor_no_show",
  "safety_concern",
  // Vendor-filed types
  "travel_cost_recovery",
  "damage_claim",
  "customer_no_show",
  // Shared
  "other",
]);

export const disputeCases = pgTable(
  "dispute_cases",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    bookingId: varchar("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    status: disputeCaseStatusEnum("status").notNull().default("open"),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    withheldAmountCents: integer("withheld_amount_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bookingIdIdx: index("dispute_cases_booking_id_idx").on(table.bookingId),
    statusIdx: index("dispute_cases_status_idx").on(table.status),
  })
);

export const disputeFilings = pgTable(
  "dispute_filings",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    caseId: varchar("case_id")
      .notNull()
      .references(() => disputeCases.id, { onDelete: "cascade" }),
    bookingId: varchar("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    filedBy: disputeFilingFiledByEnum("filed_by").notNull(),
    filerCustomerId: varchar("filer_customer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    filerVendorAccountId: varchar("filer_vendor_account_id").references(
      () => vendorAccounts.id,
      { onDelete: "set null" }
    ),
    disputeType: disputeFilingDisputeTypeEnum("dispute_type").notNull().default("other"),
    description: text("description").notNull().default(""),
    attachmentUrls: text("attachment_urls").array().notNull().default(sql`'{}'`),
    claimAmountCents: integer("claim_amount_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    caseIdIdx: index("dispute_filings_case_id_idx").on(table.caseId, table.createdAt),
    bookingIdIdx: index("dispute_filings_booking_id_idx").on(table.bookingId),
  })
);

export type DisputeCase = typeof disputeCases.$inferSelect;
export type InsertDisputeCase = typeof disputeCases.$inferInsert;
export type DisputeFiling = typeof disputeFilings.$inferSelect;
export type InsertDisputeFiling = typeof disputeFilings.$inferInsert;

// Vendor Referrals — tracks when a founding vendor refers a new vendor to the platform
export const vendorReferralStatusEnum = pgEnum("vendor_referral_status", [
  "pending",
  "completed",
  "rewarded",
]);

export const vendorReferrals = pgTable(
  "vendor_referrals",
  {
    id: serial("id").primaryKey(),
    referrerVendorId: varchar("referrer_vendor_id")
      .notNull()
      .references(() => vendorAccounts.id),
    referredVendorId: varchar("referred_vendor_id")
      .notNull()
      .references(() => vendorAccounts.id),
    status: vendorReferralStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    referrerIdx: index("vendor_referrals_referrer_idx").on(table.referrerVendorId),
    referredIdx: index("vendor_referrals_referred_idx").on(table.referredVendorId),
  })
);

export type VendorReferral = typeof vendorReferrals.$inferSelect;
export type InsertVendorReferral = typeof vendorReferrals.$inferInsert;
