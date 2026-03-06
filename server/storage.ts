import {
  type User,
  type InsertUser,
  type Event,
  type InsertEvent,
  type VendorAccount,
  type InsertVendorAccount,
  type VendorProfile,
  type InsertVendorProfile,
  type VendorListing,
  type InsertVendorListing,
  type Booking,
  type InsertBooking,
  type Message,
  type InsertMessage,
  type Payment,
  type InsertPayment,
  type PaymentSchedule,
  type InsertPaymentSchedule,
  type Notification,
  type InsertNotification,
  type ReviewReply,
  type InsertReviewReply,
  vendorAccounts,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { notifications } from "@shared/schema";
import { and, desc, eq, sql as drizzleSql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getVendorAccount(id: string): Promise<VendorAccount | undefined>;
  getVendorAccountById(id: string): Promise<VendorAccount | undefined>;
  getVendorAccountByEmail(email: string): Promise<VendorAccount | undefined>;
  createVendorAccount(account: InsertVendorAccount): Promise<VendorAccount>;
  updateVendorAccount(
    id: string,
    updates: Partial<VendorAccount>
  ): Promise<VendorAccount | undefined>;

  createVendorProfile(profile: InsertVendorProfile): Promise<VendorProfile>;
  getVendorProfile(id: string): Promise<VendorProfile | undefined>;
  getVendorProfileByAccountId(accountId: string): Promise<VendorProfile | undefined>;
  updateVendorProfile(
    id: string,
    updates: Partial<VendorProfile>
  ): Promise<VendorProfile | undefined>;

  createVendorListing(listing: InsertVendorListing): Promise<VendorListing>;
  getVendorListing(id: string): Promise<VendorListing | undefined>;
  getVendorListingsByProfile(profileId: string): Promise<VendorListing[]>;
  getVendorListingsByAccount(accountId: string): Promise<VendorListing[]>;
  updateVendorListing(
    id: string,
    updates: Partial<VendorListing>
  ): Promise<VendorListing | undefined>;

  createEvent(event: InsertEvent): Promise<Event>;
  getEvent(id: string): Promise<Event | undefined>;
  getAllEvents(): Promise<Event[]>;

  createBooking(booking: InsertBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingsByVendor(vendorId: string): Promise<Booking[]>;
  getBookingsByCustomer(customerId: string): Promise<Booking[]>;
  updateBooking(
    id: string,
    updates: Partial<Booking>
  ): Promise<Booking | undefined>;

  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByBooking(bookingId: string): Promise<Message[]>;
  markMessageAsRead(id: string): Promise<void>;

  createPaymentSchedule(schedule: InsertPaymentSchedule): Promise<PaymentSchedule>;
  getPaymentSchedulesByBooking(bookingId: string): Promise<PaymentSchedule[]>;
  updatePaymentSchedule(
    id: string,
    updates: Partial<PaymentSchedule>
  ): Promise<PaymentSchedule | undefined>;

  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentsByBooking(bookingId: string): Promise<Payment[]>;
  getPaymentsByVendor(vendorId: string): Promise<Payment[]>;
  updatePayment(
    id: string,
    updates: Partial<Payment>
  ): Promise<Payment | undefined>;

  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByRecipient(recipientId: string, recipientType: string): Promise<Notification[]>;
  markNotificationAsRead(
    id: string,
    recipientId: string,
    recipientType: string
  ): Promise<boolean>;

}

export class MemStorage implements IStorage {
  private users = new Map<string, User>();
  private events = new Map<string, Event>();
  private vendorAccounts = new Map<string, VendorAccount>();
  private vendorProfiles = new Map<string, VendorProfile>();
  private vendorListings = new Map<string, VendorListing>();
  private bookings = new Map<string, Booking>();
  private messages = new Map<string, Message>();
  private payments = new Map<string, Payment>();
  private paymentSchedules = new Map<string, PaymentSchedule>();
  private notifications = new Map<string, Notification>();
  private reviewReplies = new Map<string, ReviewReply>();

  /* ---------------- Users ---------------- */

  async getUser(id: string) {
    return this.users.get(id);
  }

  async getUserByUsername(username: string) {
    return Array.from(this.users.values()).find(
      (u) => u.email === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();

    const user: User = {
      id,
      name: insertUser.name,
      email: insertUser.email,
      password: insertUser.password,

      role: "customer",
      displayName: null,
      lastLoginAt: null,
      defaultLocation: null,

      createdAt: now,
      updatedAt: now,
    };

    this.users.set(id, user);
    return user;
  }

  /* ---------------- Vendor Accounts ---------------- */

  async getVendorAccount(id: string): Promise<VendorAccount | undefined> {
    const rows = await db
      .select()
      .from(vendorAccounts)
      .where(eq(vendorAccounts.id, id))
      .limit(1);
    return rows[0] as VendorAccount | undefined;
  }

  async getVendorAccountByEmail(email: string): Promise<VendorAccount | undefined> {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return undefined;

    const rows = await db
      .select()
      .from(vendorAccounts)
      .where(drizzleSql`lower(${vendorAccounts.email}) = ${normalizedEmail}`)
      .limit(1);

    return rows[0] as VendorAccount | undefined;
  }

  async getVendorAccountById(id: string): Promise<VendorAccount | undefined> {
    return this.getVendorAccount(id);
  }

  async createVendorAccount(insert: InsertVendorAccount): Promise<VendorAccount> {
    const [account] = await db
      .insert(vendorAccounts)
      .values({
        email: insert.email,
        password: insert.password,
        businessName: insert.businessName,
        userId: insert.userId ?? null,
        auth0Sub: insert.auth0Sub ?? null,
        stripeConnectId: insert.stripeConnectId ?? null,
        stripeAccountType: insert.stripeAccountType ?? null,
        stripeOnboardingComplete: insert.stripeOnboardingComplete ?? false,
        profileComplete: insert.profileComplete ?? false,
        active: insert.active ?? true,
      })
      .returning();

    return account as VendorAccount;
  }

  async updateVendorAccount(
    id: string,
    updates: Partial<VendorAccount>
  ): Promise<VendorAccount | undefined> {
    const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...mutableUpdates } = updates;

    if (Object.keys(mutableUpdates).length === 0) {
      return this.getVendorAccount(id);
    }

    const rows = await db
      .update(vendorAccounts)
      .set(mutableUpdates as any)
      .where(eq(vendorAccounts.id, id))
      .returning();

    return rows[0] as VendorAccount | undefined;
  }

  /* ---------------- Vendor Profiles ---------------- */

  async createVendorProfile(insert: InsertVendorProfile): Promise<VendorProfile> {
    const id = randomUUID();
    const now = new Date();

    const profile: VendorProfile = {
      id,
      photos: [],
      qualifications: [],
      ...insert,
      onlineProfiles: insert.onlineProfiles ?? null,
      serviceRadius: insert.serviceRadius ?? null,
      serviceAddress: insert.serviceAddress ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.vendorProfiles.set(id, profile);
    return profile;
  }

  async getVendorProfile(id: string) {
    return this.vendorProfiles.get(id);
  }

  async getVendorProfileByAccountId(accountId: string) {
    return Array.from(this.vendorProfiles.values()).find(
      (p) => p.accountId === accountId
    );
  }

  async updateVendorProfile(
    id: string,
    updates: Partial<VendorProfile>
  ): Promise<VendorProfile | undefined> {
    const profile = this.vendorProfiles.get(id);
    if (!profile) return undefined;

    const updated = { ...profile, ...updates };
    this.vendorProfiles.set(id, updated);
    return updated;
  }

  /* ---------------- Events ---------------- */
  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = randomUUID();
    const now = new Date();

    const event: Event = {
      id,
      ...insertEvent,
      photographerDetails: insertEvent.photographerDetails ?? null,
      videographerDetails: insertEvent.videographerDetails ?? null,
      floristDetails: insertEvent.floristDetails ?? null,
      cateringDetails: insertEvent.cateringDetails ?? null,
      djDetails: insertEvent.djDetails ?? null,
      propDecorDetails: insertEvent.propDecorDetails ?? null,
      createdAt: now,
    };

    this.events.set(id, event);
    return event;
  }

  async getEvent(id: string): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async getAllEvents(): Promise<Event[]> {
    return Array.from(this.events.values());
  }

  /* ---------------- Vendor Listings ---------------- */

  async createVendorListing(insert: InsertVendorListing): Promise<VendorListing> {
    const id = randomUUID();
    const now = new Date();

    const listing: VendorListing = {
      id,
      status: insert.status ?? "draft",
      createdAt: now,
      updatedAt: now,

      accountId: insert.accountId,
      profileId: insert.profileId ?? null,
      title: insert.title ?? null,

      // required; must not be undefined
      listingData: insert.listingData ?? {},
    };

    this.vendorListings.set(id, listing);
    return listing;
  }

  async getVendorListing(id: string) {
    return this.vendorListings.get(id);
  }

  async getVendorListingsByProfile(profileId: string) {
    return Array.from(this.vendorListings.values()).filter(
      (l) => l.profileId === profileId
    );
  }

  async getVendorListingsByAccount(accountId: string) {
    const profile = await this.getVendorProfileByAccountId(accountId);
    if (!profile) return [];
    return this.getVendorListingsByProfile(profile.id);
  }

  async updateVendorListing(
    id: string,
    updates: Partial<VendorListing>
  ): Promise<VendorListing | undefined> {
    const listing = this.vendorListings.get(id);
    if (!listing) return undefined;

    const updated = { ...listing, ...updates };
    this.vendorListings.set(id, updated);
    return updated;
  }

  /* ---------------- Bookings ---------------- */

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const id = randomUUID();
    const now = new Date();

    const booking: Booking = {
      id,

      customerId: insertBooking.customerId ?? null,
      vendorAccountId: insertBooking.vendorAccountId ?? null,
      eventId: insertBooking.eventId ?? null,
      packageId: insertBooking.packageId ?? null,
      addOnIds: insertBooking.addOnIds ?? [],
      eventDate: insertBooking.eventDate,
      eventStartTime: insertBooking.eventStartTime ?? null,
      eventLocation: insertBooking.eventLocation ?? null,
      guestCount: insertBooking.guestCount ?? null,
      specialRequests: insertBooking.specialRequests ?? null,
      totalAmount: insertBooking.totalAmount,
      platformFee: insertBooking.platformFee,
      vendorPayout: insertBooking.vendorPayout,
      depositAmount: insertBooking.depositAmount,
      depositPaidAt: insertBooking.depositPaidAt ?? null,
      finalPaymentStrategy: insertBooking.finalPaymentStrategy ?? null,
      status: insertBooking.status ?? "pending",
      paymentStatus: insertBooking.paymentStatus ?? "pending",
      cancellationReason: insertBooking.cancellationReason ?? null,
      cancelledAt: insertBooking.cancelledAt ?? null,
      confirmedAt: insertBooking.confirmedAt ?? null,
      completedAt: insertBooking.completedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.bookings.set(id, booking);
    return booking;
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async updateBooking(
    id: string,
    updates: Partial<Booking>
  ): Promise<Booking | undefined> {
    const existing = this.bookings.get(id);
    if (!existing) return undefined;

    const updated: Booking = {
      ...existing,
      ...updates,
    };

    this.bookings.set(id, updated);
    return updated;
  }

  async getBookingsByVendor(vendorAccountId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(
      (b) => b.vendorAccountId === vendorAccountId
    );
  }

  async getBookingsByCustomer(customerId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(
      (b) => b.customerId === customerId
    );
  }

  /* ---------------- Messages (implemented, can remain unused) ---------------- */

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const now = new Date();

    const message: Message = {
      id,
      ...insertMessage,
      attachments: insertMessage.attachments ?? [],
      read: insertMessage.read ?? false,
      createdAt: now,
    };

    this.messages.set(id, message);
    return message;
  }

  async getMessagesByBooking(bookingId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (m) => m.bookingId === bookingId
    );
  }

  async markMessageAsRead(id: string): Promise<void> {
    const existing = this.messages.get(id);
    if (!existing) return;

    this.messages.set(id, { ...existing, read: true });
  }

  /* ---------------- Payment Schedules ---------------- */

  async createPaymentSchedule(insertSchedule: InsertPaymentSchedule): Promise<PaymentSchedule> {
    const id = randomUUID();
    const now = new Date();

    const schedule: PaymentSchedule = {
      id,
      ...insertSchedule,
      status: insertSchedule.status ?? "pending",
      stripePaymentIntentId: insertSchedule.stripePaymentIntentId ?? null,
      paidAt: insertSchedule.paidAt ?? null,
      createdAt: now,
    };

    this.paymentSchedules.set(id, schedule);
    return schedule;
  }

  async updatePaymentSchedule(
    id: string,
    updates: Partial<PaymentSchedule>
  ): Promise<PaymentSchedule | undefined> {
    const existing = this.paymentSchedules.get(id);
    if (!existing) return undefined;

    const updated: PaymentSchedule = {
      ...existing,
      ...updates,
    };

    this.paymentSchedules.set(id, updated);
    return updated;
  }

  async getPaymentSchedulesByBooking(bookingId: string): Promise<PaymentSchedule[]> {
    return Array.from(this.paymentSchedules.values()).filter(
      (s) => s.bookingId === bookingId
    );
  }

  /* ---------------- Payments ---------------- */

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const now = new Date();

    const payment: Payment = {
      id,
      ...insertPayment,
      status: insertPayment.status ?? "pending",
      customerId: insertPayment.customerId ?? null,
      vendorAccountId: insertPayment.vendorAccountId ?? null,
      scheduleId: insertPayment.scheduleId ?? null,
      stripeTransferId: insertPayment.stripeTransferId ?? null,
      stripePaymentIntentId: insertPayment.stripePaymentIntentId ?? null,
      refundAmount: insertPayment.refundAmount ?? null,
      refundReason: insertPayment.refundReason ?? null,
      paidAt: insertPayment.paidAt ?? null,
      refundedAt: insertPayment.refundedAt ?? null,
      createdAt: now,
    };

    this.payments.set(id, payment);
    return payment;
  }

  async getPaymentsByBooking(bookingId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(
      (p) => p.bookingId === bookingId
    );
  }

  async updatePayment(
    id: string,
    updates: Partial<Payment>
  ): Promise<Payment | undefined> {
    const existing = this.payments.get(id);
    if (!existing) return undefined;

    const updated: Payment = {
      ...existing,
      ...updates,
    };

    this.payments.set(id, updated);
    return updated;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPaymentsByVendor(vendorAccountId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(
      (p) => p.vendorAccountId === vendorAccountId
    );
  }

  /* ---------------- Notifications ---------------- */

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();

    const [row] = await db
      .insert(notifications)
      .values({
        id,
        recipientId: insertNotification.recipientId,
        recipientType: insertNotification.recipientType,
        type: insertNotification.type,
        title: insertNotification.title,
        message: insertNotification.message,
        link: insertNotification.link ?? null,
        read: insertNotification.read ?? false,
        createdAt: new Date(),
      })
      .returning();

    return row as Notification;
  }

  async getNotificationsByRecipient(
    recipientId: string,
    recipientType: string
  ): Promise<Notification[]> {
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, recipientId),
          eq(notifications.recipientType, recipientType)
        )
      )
      .orderBy(desc(notifications.createdAt));

    return rows as Notification[];
  }

  async markNotificationAsRead(
    id: string,
    recipientId: string,
    recipientType: string
  ): Promise<boolean> {
    const rows = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.recipientId, recipientId),
          eq(notifications.recipientType, recipientType)
        )
      )
      .returning({ id: notifications.id });

    return rows.length > 0;
  }

  /* ---------------- Review Replies ---------------- */

  async createReviewReply(insertReply: InsertReviewReply): Promise<ReviewReply> {
    const id = randomUUID();
    const now = new Date();

    const reply: ReviewReply = {
      id,
      ...insertReply,
      vendorAccountId: insertReply.vendorAccountId ?? null,
      createdAt: now,
    };

    this.reviewReplies.set(id, reply);
    return reply;
  }

  async getReviewRepliesByVendor(vendorAccountId: string): Promise<ReviewReply[]> {
    return Array.from(this.reviewReplies.values()).filter(
      (r) => r.vendorAccountId === vendorAccountId
    );
  }

  /* ---------------- Remaining sections unchanged ---------------- */
}

export const storage = new MemStorage();
