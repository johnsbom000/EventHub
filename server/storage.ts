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
        id,
        createdAt: new Date(),
      });
    });
  }
}

export const storage = new MemStorage();
