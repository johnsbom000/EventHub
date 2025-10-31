import { type User, type InsertUser, type Event, type InsertEvent, type Vendor, type InsertVendor } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createEvent(event: InsertEvent): Promise<Event>;
  getEvent(id: string): Promise<Event | undefined>;
  getAllEvents(): Promise<Event[]>;
  
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  getVendor(id: string): Promise<Vendor | undefined>;
  getVendorsByCategory(category: string): Promise<Vendor[]>;
  getAllVendors(): Promise<Vendor[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private events: Map<string, Event>;
  private vendors: Map<string, Vendor>;

  constructor() {
    this.users = new Map();
    this.events = new Map();
    this.vendors = new Map();
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

  private seedVendors() {
    // Seed some sample vendors for testing
    const sampleVendors: InsertVendor[] = [
      {
        name: "Sarah Chen Photography",
        category: "photographer",
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
        category: "videographer",
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
        category: "florist",
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
        category: "catering",
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
        category: "dj",
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
        category: "prop-decor",
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
