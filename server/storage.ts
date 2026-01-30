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
  type InsertReviewReply
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Customer users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Vendor accounts (separate authentication)
  getVendorAccount(id: string): Promise<VendorAccount | undefined>;
  getVendorAccountByEmail(email: string): Promise<VendorAccount | undefined>;
  getVendorAccountByVendorId(vendorId: string): Promise<VendorAccount | undefined>;
  createVendorAccount(account: InsertVendorAccount): Promise<VendorAccount>;
  updateVendorAccount(id: string, updates: Partial<VendorAccount>): Promise<VendorAccount | undefined>;
  
  // Vendor profiles (1:1 with vendor accounts)
  createVendorProfile(profile: InsertVendorProfile): Promise<VendorProfile>;
  getVendorProfile(id: string): Promise<VendorProfile | undefined>;
  getVendorProfileByAccountId(accountId: string): Promise<VendorProfile | undefined>;
  updateVendorProfile(id: string, updates: Partial<VendorProfile>): Promise<VendorProfile | undefined>;
  
  // Vendor listings (1:n with vendor profiles)
  createVendorListing(listing: InsertVendorListing): Promise<VendorListing>;
  getVendorListing(id: string): Promise<VendorListing | undefined>;
  getVendorListingsByProfile(profileId: string): Promise<VendorListing[]>;
  getVendorListingsByAccount(accountId: string): Promise<VendorListing[]>;
  updateVendorListing(id: string, updates: Partial<VendorListing>): Promise<VendorListing | undefined>;
  
  // Events
  createEvent(event: InsertEvent): Promise<Event>;
  getEvent(id: string): Promise<Event | undefined>;
  getAllEvents(): Promise<Event[]>;
  
  // Bookings
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingsByVendor(vendorId: string): Promise<Booking[]>;
  getBookingsByCustomer(customerId: string): Promise<Booking[]>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined>;
  
  // Messages
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByBooking(bookingId: string): Promise<Message[]>;
  markMessageAsRead(id: string): Promise<void>;
  
  // Payment Schedules
  createPaymentSchedule(schedule: InsertPaymentSchedule): Promise<PaymentSchedule>;
  getPaymentSchedulesByBooking(bookingId: string): Promise<PaymentSchedule[]>;
  updatePaymentSchedule(id: string, updates: Partial<PaymentSchedule>): Promise<PaymentSchedule | undefined>;
  
  // Payments
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentsByBooking(bookingId: string): Promise<Payment[]>;
  getPaymentsByVendor(vendorId: string): Promise<Payment[]>;
  updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined>;
  
  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByRecipient(recipientId: string, recipientType: string): Promise<Notification[]>;
  markNotificationAsRead(id: string): Promise<void>;
  
  // Review Replies
  createReviewReply(reply: InsertReviewReply): Promise<ReviewReply>;
  getReviewRepliesByVendor(vendorId: string): Promise<ReviewReply[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private events: Map<string, Event>;
  private vendorAccounts: Map<string, VendorAccount>;
  private vendorProfiles: Map<string, VendorProfile>;
  private vendorListings: Map<string, VendorListing>;
  private bookings: Map<string, Booking>;
  private messages: Map<string, Message>;
  private payments: Map<string, Payment>;
  private paymentSchedules: Map<string, PaymentSchedule>;
  private notifications: Map<string, Notification>;
  private reviewReplies: Map<string, ReviewReply>;

  constructor() {
    this.users = new Map();
    this.events = new Map();
    this.vendorAccounts = new Map();
    this.vendorProfiles = new Map();
    this.vendorListings = new Map();
    this.bookings = new Map();
    this.messages = new Map();
    this.payments = new Map();
    this.paymentSchedules = new Map();
    this.notifications = new Map();
    this.reviewReplies = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = randomUUID();
    const event: Event = { 
      ...insertEvent,
      photographerDetails: insertEvent.photographerDetails ?? null,
      videographerDetails: insertEvent.videographerDetails ?? null,
      floristDetails: insertEvent.floristDetails ?? null,
      cateringDetails: insertEvent.cateringDetails ?? null,
      djDetails: insertEvent.djDetails ?? null,
      propDecorDetails: insertEvent.propDecorDetails ?? null,
      id,
      createdAt: new Date(),
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

  // Vendor Account Methods
  async getVendorAccount(id: string): Promise<VendorAccount | undefined> {
    return this.vendorAccounts.get(id);
  }

  async getVendorAccountByEmail(email: string): Promise<VendorAccount | undefined> {
    return Array.from(this.vendorAccounts.values()).find(
      (account) => account.email === email
    );
  }

  async getVendorAccountByVendorId(vendorId: string): Promise<VendorAccount | undefined> {
    return Array.from(this.vendorAccounts.values()).find(
      (account) => account.vendorId === vendorId
    );
  }

  async createVendorAccount(insertAccount: InsertVendorAccount): Promise<VendorAccount> {
    const id = randomUUID();
    const account: VendorAccount = {
      ...insertAccount,
      vendorId: insertAccount.vendorId ?? null,
      stripeConnectId: insertAccount.stripeConnectId ?? null,
      stripeAccountType: insertAccount.stripeAccountType ?? null,
      stripeOnboardingComplete: insertAccount.stripeOnboardingComplete ?? false,
      active: insertAccount.active ?? true,
      id,
      createdAt: new Date(),
    };
    this.vendorAccounts.set(id, account);
    return account;
  }

  // Vendor Profile Methods
  async createVendorProfile(insertProfile: InsertVendorProfile): Promise<VendorProfile> {
    const id = randomUUID();
    const profile: VendorProfile = {
      ...insertProfile,
      photos: insertProfile.photos ?? [],
      qualifications: insertProfile.qualifications ?? [],
      willTravel: insertProfile.willTravel ?? null,
      travelDistance: insertProfile.travelDistance ?? null,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.vendorProfiles.set(id, profile);
    return profile;
  }

  async getVendorProfile(id: string): Promise<VendorProfile | undefined> {
    return this.vendorProfiles.get(id);
  }

  async getVendorProfileByAccountId(accountId: string): Promise<VendorProfile | undefined> {
    return Array.from(this.vendorProfiles.values()).find(
      (profile) => profile.accountId === accountId
    );
  }

  async updateVendorProfile(id: string, updates: Partial<VendorProfile>): Promise<VendorProfile | undefined> {
    const profile = this.vendorProfiles.get(id);
    if (!profile) return undefined;
    
    const updated = { ...profile, ...updates, updatedAt: new Date() };
    this.vendorProfiles.set(id, updated);
    return updated;
  }

  // Vendor Listing Methods
  async createVendorListing(insertListing: InsertVendorListing): Promise<VendorListing> {
    const id = randomUUID();
    const listing: VendorListing = {
      ...insertListing,
      packages: insertListing.packages ?? [],
      addOns: insertListing.addOns ?? [],
      discounts: insertListing.discounts ?? [],
      availableDays: insertListing.availableDays ?? [],
      unavailableDates: insertListing.unavailableDates ?? [],
      minNotice: insertListing.minNotice ?? null,
      maxAdvanceBooking: insertListing.maxAdvanceBooking ?? null,
      active: insertListing.active ?? true,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.vendorListings.set(id, listing);
    return listing;
  }

  async getVendorListing(id: string): Promise<VendorListing | undefined> {
    return this.vendorListings.get(id);
  }

  async getVendorListingsByProfile(profileId: string): Promise<VendorListing[]> {
    return Array.from(this.vendorListings.values()).filter(
      (listing) => listing.profileId === profileId
    );
  }

  async getVendorListingsByAccount(accountId: string): Promise<VendorListing[]> {
    const profile = await this.getVendorProfileByAccountId(accountId);
    if (!profile) return [];
    return this.getVendorListingsByProfile(profile.id);
  }

  async updateVendorListing(id: string, updates: Partial<VendorListing>): Promise<VendorListing | undefined> {
    const listing = this.vendorListings.get(id);
    if (!listing) return undefined;
    
    const updated = { ...listing, ...updates, updatedAt: new Date() };
    this.vendorListings.set(id, updated);
    return updated;
  }

  // Booking Methods
  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const id = randomUUID();
    const booking: Booking = {
      ...insertBooking,
      customerId: insertBooking.customerId ?? null,
      eventId: insertBooking.eventId ?? null,
      packageId: insertBooking.packageId ?? null,
      eventStartTime: insertBooking.eventStartTime ?? null,
      eventLocation: insertBooking.eventLocation ?? null,
      guestCount: insertBooking.guestCount ?? null,
      specialRequests: insertBooking.specialRequests ?? null,
      depositPaidAt: insertBooking.depositPaidAt ?? null,
      finalPaymentStrategy: insertBooking.finalPaymentStrategy ?? null,
      status: insertBooking.status ?? "pending",
      paymentStatus: insertBooking.paymentStatus ?? "pending",
      cancellationReason: insertBooking.cancellationReason ?? null,
      cancelledAt: insertBooking.cancelledAt ?? null,
      confirmedAt: insertBooking.confirmedAt ?? null,
      completedAt: insertBooking.completedAt ?? null,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.bookings.set(id, booking);
    return booking;
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async getBookingsByVendor(vendorId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(b => b.vendorId === vendorId);
  }

  async getBookingsByCustomer(customerId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(b => b.customerId === customerId);
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined> {
    const booking = this.bookings.get(id);
    if (!booking) return undefined;
    
    const updated = { ...booking, ...updates, updatedAt: new Date() };
    this.bookings.set(id, updated);
    return updated;
  }

  // Message Methods
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      attachments: insertMessage.attachments ?? null,
      read: insertMessage.read ?? false,
      id,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesByBooking(bookingId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(m => m.bookingId === bookingId)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async markMessageAsRead(id: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      this.messages.set(id, { ...message, read: true });
    }
  }

  // Payment Schedule Methods
  async createPaymentSchedule(insertSchedule: InsertPaymentSchedule): Promise<PaymentSchedule> {
    const id = randomUUID();
    const schedule: PaymentSchedule = {
      ...insertSchedule,
      status: insertSchedule.status ?? "pending",
      stripePaymentIntentId: insertSchedule.stripePaymentIntentId ?? null,
      paidAt: insertSchedule.paidAt ?? null,
      id,
      createdAt: new Date(),
    };
    this.paymentSchedules.set(id, schedule);
    return schedule;
  }

  async getPaymentSchedulesByBooking(bookingId: string): Promise<PaymentSchedule[]> {
    return Array.from(this.paymentSchedules.values())
      .filter(s => s.bookingId === bookingId)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
  }

  async updatePaymentSchedule(id: string, updates: Partial<PaymentSchedule>): Promise<PaymentSchedule | undefined> {
    const schedule = this.paymentSchedules.get(id);
    if (!schedule) return undefined;
    
    const updated = { ...schedule, ...updates };
    this.paymentSchedules.set(id, updated);
    return updated;
  }

  // Payment Methods
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const id = randomUUID();
    const payment: Payment = {
      ...insertPayment,
      scheduleId: insertPayment.scheduleId ?? null,
      customerId: insertPayment.customerId ?? null,
      status: insertPayment.status ?? "pending",
      stripeTransferId: insertPayment.stripeTransferId ?? null,
      refundAmount: insertPayment.refundAmount ?? null,
      refundReason: insertPayment.refundReason ?? null,
      refundedAt: insertPayment.refundedAt ?? null,
      paidAt: insertPayment.paidAt ?? null,
      id,
      createdAt: new Date(),
    };
    this.payments.set(id, payment);
    return payment;
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    return this.payments.get(id);
  }

  async getPaymentsByBooking(bookingId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(p => p.bookingId === bookingId);
  }

  async getPaymentsByVendor(vendorId: string): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(p => p.vendorId === vendorId);
  }

  async updatePayment(id: string, updates: Partial<Payment>): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (!payment) return undefined;
    
    const updated = { ...payment, ...updates };
    this.payments.set(id, updated);
    return updated;
  }

  // Notification Methods
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification: Notification = {
      ...insertNotification,
      link: insertNotification.link ?? null,
      read: insertNotification.read ?? false,
      id,
      createdAt: new Date(),
    };
    this.notifications.set(id, notification);
    return notification;
  }

  async getNotificationsByRecipient(recipientId: string, recipientType: string): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter(n => n.recipientId === recipientId && n.recipientType === recipientType)
      .sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
  }

  async markNotificationAsRead(id: string): Promise<void> {
    const notification = this.notifications.get(id);
    if (notification) {
      this.notifications.set(id, { ...notification, read: true });
    }
  }

  // Review Reply Methods
  async createReviewReply(insertReply: InsertReviewReply): Promise<ReviewReply> {
    const id = randomUUID();
    const reply: ReviewReply = {
      ...insertReply,
      id,
      createdAt: new Date(),
    };
    this.reviewReplies.set(id, reply);
    return reply;
  }

  async getReviewRepliesByVendor(vendorId: string): Promise<ReviewReply[]> {
    return Array.from(this.reviewReplies.values()).filter(r => r.vendorId === vendorId);
  }
}

export const storage = new MemStorage();
