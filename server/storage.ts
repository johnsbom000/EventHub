import { 
  type User, 
  type InsertUser, 
  type Event, 
  type InsertEvent, 
  type Vendor, 
  type InsertVendor,
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
  
  // Vendors
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  getVendor(id: string): Promise<Vendor | undefined>;
  getVendorsByCategory(category: string): Promise<Vendor[]>;
  getAllVendors(): Promise<Vendor[]>;
  updateVendor(id: string, updates: Partial<Vendor>): Promise<Vendor | undefined>;
  
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
  private vendors: Map<string, Vendor>;
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
    this.vendors = new Map();
    this.vendorAccounts = new Map();
    this.vendorProfiles = new Map();
    this.vendorListings = new Map();
    this.bookings = new Map();
    this.messages = new Map();
    this.payments = new Map();
    this.paymentSchedules = new Map();
    this.notifications = new Map();
    this.reviewReplies = new Map();
    this.seedVendors();
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

  async createVendor(insertVendor: InsertVendor): Promise<Vendor> {
    const id = randomUUID();
    const vendor: Vendor = {
      ...insertVendor,
      metro: insertVendor.metro ?? null,
      latitude: insertVendor.latitude ?? null,
      longitude: insertVendor.longitude ?? null,
      priceRangeMax: insertVendor.priceRangeMax ?? null,
      serviceOfferings: insertVendor.serviceOfferings ?? null,
      travelFeeRequired: insertVendor.travelFeeRequired ?? false,
      packages: insertVendor.packages ?? null,
      addOns: insertVendor.addOns ?? null,
      reviews: insertVendor.reviews ?? null,
      aboutSection: insertVendor.aboutSection ?? null,
      imageUrl: insertVendor.imageUrl ?? null,
      description: insertVendor.description ?? null,
      reviewCount: insertVendor.reviewCount ?? 0,
      bookingCount: insertVendor.bookingCount ?? 0,
      verified: insertVendor.verified ?? false,
      blockedDates: insertVendor.blockedDates ?? [],
      serviceArea: insertVendor.serviceArea ?? [],
      id,
      createdAt: new Date(),
    };
    this.vendors.set(id, vendor);
    return vendor;
  }

  async getVendor(id: string): Promise<Vendor | undefined> {
    return this.vendors.get(id);
  }

  async getVendorsByCategory(category: string): Promise<Vendor[]> {
    return Array.from(this.vendors.values()).filter(v => v.category === category);
  }

  async getAllVendors(): Promise<Vendor[]> {
    return Array.from(this.vendors.values());
  }

  async updateVendor(id: string, updates: Partial<Vendor>): Promise<Vendor | undefined> {
    const vendor = this.vendors.get(id);
    if (!vendor) return undefined;
    
    const updated = { ...vendor, ...updates };
    this.vendors.set(id, updated);
    return updated;
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

  async updateVendorAccount(id: string, updates: Partial<VendorAccount>): Promise<VendorAccount | undefined> {
    const account = this.vendorAccounts.get(id);
    if (!account) return undefined;
    
    const updated = { ...account, ...updates };
    this.vendorAccounts.set(id, updated);
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

  private seedVendors() {
    // Seed some sample vendors for testing
    const sampleVendors: InsertVendor[] = [
      {
        name: "Sarah Chen Photography",
        category: "Photographer",
        city: "San Francisco",
        state: "CA",
        metro: "San Francisco Bay Area",
        latitude: "37.7749",
        longitude: "-122.4194",
        basePrice: 2000,
        priceRangeMax: 4000,
        rating: "4.9",
        reviewCount: 156,
        bookingCount: 234,
        verified: true,
        blockedDates: ["2025-12-25", "2026-01-01"],
        serviceOfferings: {
          photographer: {
            preEventShoots: true,
            eventDayCoverage: true,
            engagementShoots: true,
            bridalPortraits: true,
          }
        },
        serviceArea: ["San Francisco", "Oakland", "San Jose", "Berkeley"],
        imageUrl: "/placeholder-photographer.jpg",
        description: "Award-winning wedding photographer specializing in natural light and candid moments",
        travelFeeRequired: false,
        packages: [
          {
            name: "Essential Package",
            description: "Perfect for intimate celebrations",
            price: 2000,
            inclusions: ["6 hours coverage", "300+ edited photos", "Online gallery", "Print release"],
            popular: false,
          },
          {
            name: "Premium Package",
            description: "Most popular choice for full-day events",
            price: 3000,
            inclusions: ["10 hours coverage", "500+ edited photos", "Engagement session", "Online gallery", "Print release", "Second shooter"],
            popular: true,
          },
          {
            name: "Luxury Package",
            description: "Complete coverage for your special day",
            price: 4000,
            inclusions: ["Unlimited hours", "800+ edited photos", "Engagement session", "Bridal portraits", "Online gallery", "Print release", "Two shooters", "Album design"],
            popular: false,
          },
        ],
        addOns: [
          { name: "Extra Hour", description: "Additional hour of coverage", price: 250 },
          { name: "Second Shooter", description: "Additional photographer", price: 500 },
          { name: "Photo Album", description: "12x12 premium album", price: 800 },
          { name: "Rehearsal Dinner Coverage", description: "2-hour coverage", price: 400 },
        ],
        reviews: [
          {
            reviewerName: "Emily Rodriguez",
            rating: 5,
            date: "2024-09-15",
            comment: "Sarah captured our wedding beautifully! The photos are absolutely stunning and she made us feel so comfortable throughout the day.",
            eventType: "Wedding",
          },
          {
            reviewerName: "Michael Chen",
            rating: 5,
            date: "2024-07-22",
            comment: "Professional, creative, and a joy to work with. The engagement photos turned out amazing!",
            eventType: "Engagement",
          },
          {
            reviewerName: "Jessica Park",
            rating: 5,
            date: "2024-05-10",
            comment: "Worth every penny! Sarah's attention to detail and artistic eye made our special day even more memorable.",
            eventType: "Wedding",
          },
        ],
        aboutSection: "Hi, I'm Sarah! I've been capturing love stories for over 8 years, and every wedding still gives me butterflies. My approach is all about natural, candid moments that tell your unique story. When I'm not behind the camera, you'll find me exploring the Bay Area's hidden gems with my rescue dog, Luna, or perfecting my latte art. I believe your wedding photos should feel like you—authentic, joyful, and full of life!",
      },
      {
        name: "Golden Gate Videography",
        category: "Videographer",
        city: "San Francisco",
        state: "CA",
        metro: "San Francisco Bay Area",
        latitude: "37.7749",
        longitude: "-122.4194",
        basePrice: 1800,
        priceRangeMax: 3500,
        rating: "4.8",
        reviewCount: 92,
        bookingCount: 145,
        verified: true,
        blockedDates: [],
        serviceOfferings: {
          videographer: {
            preEventVideos: true,
            eventDayCoverage: true,
            highlightReel: true,
            fullCeremony: true,
          }
        },
        serviceArea: ["San Francisco", "Oakland", "San Jose"],
        imageUrl: "/placeholder-videographer.jpg",
        description: "Cinematic wedding films that tell your unique love story",
        travelFeeRequired: false,
      },
      {
        name: "Bloom & Petal Florists",
        category: "Florists",
        city: "San Francisco",
        state: "CA",
        metro: "San Francisco Bay Area",
        latitude: "37.7749",
        longitude: "-122.4194",
        basePrice: 1200,
        priceRangeMax: 3000,
        rating: "5.0",
        reviewCount: 203,
        bookingCount: 312,
        verified: true,
        blockedDates: ["2025-12-24", "2025-12-25"],
        serviceOfferings: {
          florist: {
            bridalBouquet: true,
            bridesmaidBouquets: true,
            boutonnieres: true,
            centerpieces: true,
            archInstall: true,
            aisleFlorals: true,
            setup: true,
            touchUps: true,
          }
        },
        serviceArea: ["San Francisco", "Oakland", "Palo Alto", "San Mateo"],
        imageUrl: "/placeholder-florist.jpg",
        description: "Creating stunning floral designs with locally-sourced blooms",
        travelFeeRequired: false,
      },
      {
        name: "Bay Area Catering Co.",
        category: "Catering",
        city: "San Francisco",
        state: "CA",
        metro: "San Francisco Bay Area",
        latitude: "37.7749",
        longitude: "-122.4194",
        basePrice: 3500,
        priceRangeMax: 8000,
        rating: "4.7",
        reviewCount: 178,
        bookingCount: 289,
        verified: true,
        blockedDates: [],
        serviceOfferings: {
          catering: {
            buffet: true,
            plated: true,
            cocktail: true,
            dessertOnly: false,
            glutenFree: true,
            dairyFree: true,
            vegetarian: true,
            vegan: true,
          }
        },
        serviceArea: ["San Francisco", "Oakland", "San Jose", "Napa"],
        imageUrl: "/placeholder-catering.jpg",
        description: "Farm-to-table catering with customizable menus for any event",
        travelFeeRequired: false,
      },
      {
        name: "DJ Soundwave Entertainment",
        category: "DJs",
        city: "San Francisco",
        state: "CA",
        metro: "San Francisco Bay Area",
        latitude: "37.7749",
        longitude: "-122.4194",
        basePrice: 800,
        priceRangeMax: 2000,
        rating: "4.9",
        reviewCount: 134,
        bookingCount: 267,
        verified: true,
        blockedDates: ["2026-01-01"],
        serviceOfferings: {
          dj: {
            ceremonyMusic: true,
            cocktailHour: true,
            reception: true,
            mcServices: true,
          }
        },
        serviceArea: ["San Francisco", "Oakland", "San Jose", "Sacramento"],
        imageUrl: "/placeholder-dj.jpg",
        description: "Professional DJ and MC services to keep your party energized",
        travelFeeRequired: false,
      },
      {
        name: "Event Rentals Plus",
        category: "Prop Rentals",
        city: "San Francisco",
        state: "CA",
        metro: "San Francisco Bay Area",
        latitude: "37.7749",
        longitude: "-122.4194",
        basePrice: 500,
        priceRangeMax: 2500,
        rating: "4.6",
        reviewCount: 87,
        bookingCount: 198,
        verified: false,
        blockedDates: [],
        serviceOfferings: {
          propDecor: {
            tables: true,
            chairs: true,
            linens: true,
            backdrops: true,
            lighting: true,
          }
        },
        serviceArea: ["San Francisco", "Oakland", "San Jose"],
        imageUrl: "/placeholder-props.jpg",
        description: "Complete event rental solutions from furniture to lighting",
        travelFeeRequired: true,
      },
    ];

    sampleVendors.forEach(vendor => {
      const id = randomUUID();
      this.vendors.set(id, {
        ...vendor,
        metro: vendor.metro ?? null,
        latitude: vendor.latitude ?? null,
        longitude: vendor.longitude ?? null,
        priceRangeMax: vendor.priceRangeMax ?? null,
        serviceOfferings: vendor.serviceOfferings ?? null,
        travelFeeRequired: vendor.travelFeeRequired ?? false,
        packages: vendor.packages ?? null,
        addOns: vendor.addOns ?? null,
        reviews: vendor.reviews ?? null,
        aboutSection: vendor.aboutSection ?? null,
        imageUrl: vendor.imageUrl ?? null,
        description: vendor.description ?? null,
        reviewCount: vendor.reviewCount ?? 0,
        bookingCount: vendor.bookingCount ?? 0,
        verified: vendor.verified ?? false,
        blockedDates: vendor.blockedDates ?? [],
        serviceArea: vendor.serviceArea ?? [],
        id,
        createdAt: new Date(),
      });
    });
  }
}

export const storage = new MemStorage();
