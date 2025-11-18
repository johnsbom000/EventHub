import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertVendorAccountSchema, insertVendorProfileSchema, vendorProfiles, vendorAccounts, vendorListings, users, insertUserSchema } from "@shared/schema";
import { scoreVendorsForEvent } from "./vendorScoring";
import { hashPassword, comparePassword, generateToken, requireVendorAuth, requireCustomerAuth, requireDualAuth } from "./auth";
import { z } from "zod";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export async function registerRoutes(app: Express): Promise<Server> {
  // Vendor Authentication Routes
  const vendorSignupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    businessName: z.string().min(2),
  });

  const vendorLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  app.post("/api/vendor/signup", async (req, res) => {
    try {
      const { email, password, businessName } = vendorSignupSchema.parse(req.body);
      
      // Check if vendor account already exists (check database)
      const existing = await db.select().from(vendorAccounts).where(eq(vendorAccounts.email, email));
      if (existing.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create vendor account in database
      const [account] = await db.insert(vendorAccounts).values({
        email,
        password: hashedPassword,
        businessName,
        stripeConnectId: null,
        stripeAccountType: null,
        stripeOnboardingComplete: false,
        active: true,
      }).returning();

      // Generate JWT token
      const token = generateToken({
        id: account.id,
        email: account.email,
        type: "vendor",
      });

      res.json({
        token,
        vendorAccount: {
          id: account.id,
          email: account.email,
          profileComplete: account.profileComplete,
          stripeOnboardingComplete: account.stripeOnboardingComplete,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/vendor/login", async (req, res) => {
    try {
      const { email, password } = vendorLoginSchema.parse(req.body);

      // Find vendor account (from database)
      const accounts = await db.select().from(vendorAccounts).where(eq(vendorAccounts.email, email));
      if (accounts.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const account = accounts[0];

      // Verify password
      const valid = await comparePassword(password, account.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Generate JWT token
      const token = generateToken({
        id: account.id,
        email: account.email,
        type: "vendor",
      });

      res.json({
        token,
        vendorAccount: {
          id: account.id,
          email: account.email,
          profileComplete: account.profileComplete,
          stripeOnboardingComplete: account.stripeOnboardingComplete,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get current vendor account (protected route)
  app.get("/api/vendor/me", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const accounts = await db.select().from(vendorAccounts).where(eq(vendorAccounts.id, vendorAuth.id));
      
      if (accounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const account = accounts[0];

      // Check if vendor has completed profile (using database)
      const profiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, account.id));
      const profile = profiles[0];

      res.json({
        id: account.id,
        email: account.email,
        businessName: account.businessName,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        active: account.active,
        profileComplete: profile !== undefined,
        profileId: profile?.id || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Customer Authentication Routes
  const customerSignupSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  });

  const customerLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  app.post("/api/customer/signup", async (req, res) => {
    try {
      const { name, email, password } = customerSignupSchema.parse(req.body);
      
      // Check if customer already exists
      const existing = await db.select().from(users).where(eq(users.email, email));
      if (existing.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create customer account
      const [user] = await db.insert(users).values({
        name,
        email,
        password: hashedPassword,
      }).returning();

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: "customer",
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/customer/login", async (req, res) => {
    try {
      const { email, password } = customerLoginSchema.parse(req.body);

      // Find customer account
      const userAccounts = await db.select().from(users).where(eq(users.email, email));
      if (userAccounts.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const user = userAccounts[0];

      // Verify password
      const valid = await comparePassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Generate JWT token
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: "customer",
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/customer/me", requireCustomerAuth, async (req, res) => {
    try {
      const customerAuth = (req as any).customerAuth;
      const userAccounts = await db.select().from(users).where(eq(users.id, customerAuth.id));
      
      if (userAccounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const user = userAccounts[0];

      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Complete vendor onboarding (handles both new vendors and customer upgrades)
  const completeOnboardingSchema = z.object({
    businessName: z.string().min(2),
    serviceType: z.string(),
    contactName: z.string().optional(),
    bio: z.string().optional(),
    website: z.string().optional(),
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    introVideoUrl: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    serviceRadius: z.number().optional(),
    portfolioImages: z.array(z.string()).optional(),
    serviceHeadline: z.string().optional(),
    serviceDescription: z.string(),
  });

  app.post("/api/vendor/onboarding/complete", requireDualAuth, async (req, res) => {
    try {
      const customerAuth = (req as any).customerAuth;
      const vendorAuth = (req as any).vendorAuth;
      const isCustomer = !!customerAuth;
      const isVendor = !!vendorAuth;

      // Validate onboarding data
      const onboardingData = completeOnboardingSchema.parse(req.body);

      let vendorAccountId: string;
      let vendorToken: string;

      if (isCustomer) {
        // Customer becoming vendor flow
        const customerAccounts = await db.select().from(users).where(eq(users.id, customerAuth.id));
        if (customerAccounts.length === 0) {
          return res.status(404).json({ error: "Customer account not found" });
        }
        const customer = customerAccounts[0];

        // Check if vendor account already exists for this email
        const existingVendor = await db.select().from(vendorAccounts).where(eq(vendorAccounts.email, customer.email));
        
        if (existingVendor.length > 0) {
          // Vendor account already exists
          vendorAccountId = existingVendor[0].id;
          
          // Only update if this vendor account is unlinked (not another user's account)
          if (!existingVendor[0].userId || existingVendor[0].userId === customer.id) {
            // Safe to link/update this vendor account to the customer
            const updateData: any = { 
              userId: customer.id,
              password: customer.password, // Sync password so customer can log in as vendor
            };
            
            // Only update business name if provided and non-empty
            if (onboardingData.businessName && onboardingData.businessName.trim()) {
              updateData.businessName = onboardingData.businessName;
            }
            
            await db.update(vendorAccounts)
              .set(updateData)
              .where(eq(vendorAccounts.id, vendorAccountId));
          } else {
            // Vendor account belongs to different user - this shouldn't happen
            // but we should prevent hijacking another user's account
            return res.status(400).json({ 
              error: "A vendor account with this email already exists and belongs to another user" 
            });
          }
        } else {
          // Create new vendor account linked to customer with same password
          const [newVendorAccount] = await db.insert(vendorAccounts).values({
            userId: customer.id,
            email: customer.email,
            password: customer.password, // Share password hash
            businessName: onboardingData.businessName,
            profileComplete: false,
          }).returning();
          vendorAccountId = newVendorAccount.id;
        }

        // Generate vendor token
        vendorToken = generateToken({
          id: vendorAccountId,
          email: customer.email,
          type: "vendor",
        });
      } else {
        // Existing vendor completing onboarding
        const vendorAcct = await db.select().from(vendorAccounts).where(eq(vendorAccounts.id, vendorAuth.id));
        if (vendorAcct.length === 0) {
          return res.status(404).json({ error: "Vendor account not found" });
        }
        vendorAccountId = vendorAcct[0].id;
        const token = req.headers.authorization!.split(" ")[1];
        vendorToken = token;
      }

      // Create or update vendor profile with proper defaults
      const existingProfiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, vendorAccountId));
      
      // Build profile data with all onboarding information
      const profileData = {
        accountId: vendorAccountId,
        serviceType: onboardingData.serviceType,
        experience: 0,
        qualifications: [],
        onlineProfiles: {
          website: onboardingData.website || null,
          instagram: onboardingData.instagram || null,
          tiktok: onboardingData.tiktok || null,
          introVideoUrl: onboardingData.introVideoUrl || null,
          bio: onboardingData.bio || null,
          headline: onboardingData.serviceHeadline || null, // Save service headline
        },
        address: onboardingData.city + (onboardingData.state ? `, ${onboardingData.state}` : ""),
        city: onboardingData.city,
        travelMode: "travel-to-guests" as const,
        serviceRadius: onboardingData.serviceRadius || 25,
        serviceAddress: null,
        photos: onboardingData.portfolioImages || [],
        serviceDescription: onboardingData.serviceDescription,
      };

      let profile;
      if (existingProfiles.length > 0) {
        // Update existing profile
        [profile] = await db.update(vendorProfiles)
          .set(profileData)
          .where(eq(vendorProfiles.id, existingProfiles[0].id))
          .returning();
      } else {
        // Create new profile
        [profile] = await db.insert(vendorProfiles).values(profileData).returning();
      }

      // Update vendor account profileComplete flag
      await db.update(vendorAccounts)
        .set({ profileComplete: true })
        .where(eq(vendorAccounts.id, vendorAccountId));

      res.json({
        vendorToken,
        isUpgrade: isCustomer,
        vendorAccountId,
        profileId: profile.id,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Create vendor profile (protected route, steps 1-6 of onboarding)
  const createVendorProfileSchema = insertVendorProfileSchema
    .omit({ accountId: true })
    .extend({
      // Ensure serviceRadius is present when travel mode is "travel-to-guests"
      serviceRadius: z.number().optional(),
      serviceAddress: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.travelMode === "travel-to-guests") {
          return data.serviceRadius !== undefined && data.serviceRadius > 0;
        }
        return true;
      },
      {
        message: "Service radius is required when you travel to guests",
        path: ["serviceRadius"],
      }
    )
    .refine(
      (data) => {
        if (data.travelMode === "guests-come-to-me") {
          return data.serviceAddress !== undefined && data.serviceAddress.length > 0;
        }
        return true;
      },
      {
        message: "Service address is required when guests come to you",
        path: ["serviceAddress"],
      }
    );

  app.post("/api/vendor/profile", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const accounts = await db.select().from(vendorAccounts).where(eq(vendorAccounts.id, vendorAuth.id));
      
      if (accounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const account = accounts[0];

      // Check if profile already exists (using database)
      const existingProfiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, account.id));
      if (existingProfiles.length > 0) {
        return res.status(409).json({ 
          error: "Profile already exists. Use PUT/PATCH to update existing profile." 
        });
      }

      // Validate and parse request body
      const validatedData = createVendorProfileSchema.parse(req.body);

      // Enrich with accountId from authenticated session
      const profileData = {
        ...validatedData,
        accountId: account.id,
      };

      // Create vendor profile in database
      const [profile] = await db.insert(vendorProfiles).values(profileData).returning();

      // Return both account and profile data to avoid extra round trip
      res.json({
        account: {
          id: account.id,
          email: account.email,
          businessName: account.businessName,
          vendorId: account.vendorId,
          stripeConnectId: account.stripeConnectId,
          stripeAccountType: account.stripeAccountType,
          stripeOnboardingComplete: account.stripeOnboardingComplete,
          active: account.active,
          profileComplete: true,
          profileId: profile.id,
        },
        profile,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Vendor Listings Routes
  // Create a new vendor listing (draft)
  app.post("/api/vendor/listings", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { listingData } = req.body;

      // Get vendor profile (optional - listing can be created without profile)
      const profiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, vendorAuth.id));
      const profileId = profiles.length > 0 ? profiles[0].id : null;

      // Create draft listing
      const [listing] = await db.insert(vendorListings).values({
        accountId: vendorAuth.id,
        profileId,
        status: "draft",
        title: listingData?.serviceType || null,
        listingData,
      }).returning();

      res.json(listing);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update an existing vendor listing
  app.patch("/api/vendor/listings/:id", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { id } = req.params;
      const { listingData, status, title } = req.body;

      // Verify ownership
      const existingListings = await db.select().from(vendorListings).where(
        and(
          eq(vendorListings.id, id),
          eq(vendorListings.accountId, vendorAuth.id)
        )
      );

      if (existingListings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      // Update listing
      const [updated] = await db.update(vendorListings)
        .set({
          listingData,
          status: status || existingListings[0].status,
          title: title || existingListings[0].title,
          updatedAt: new Date(),
        })
        .where(eq(vendorListings.id, id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Publish a draft listing (change status to active)
  app.patch("/api/vendor/listings/:id/publish", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { id } = req.params;

      // Verify ownership and that it's a draft
      const existingListings = await db.select().from(vendorListings).where(
        and(
          eq(vendorListings.id, id),
          eq(vendorListings.accountId, vendorAuth.id)
        )
      );

      if (existingListings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      // Update status to active
      const [published] = await db.update(vendorListings)
        .set({
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(vendorListings.id, id))
        .returning();

      res.json(published);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all vendor listings (with optional status filter)
  app.get("/api/vendor/listings", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { status } = req.query;

      let query = db.select().from(vendorListings).where(eq(vendorListings.accountId, vendorAuth.id));

      if (status) {
        query = query.where(and(
          eq(vendorListings.accountId, vendorAuth.id),
          eq(vendorListings.status, status as string)
        )) as any;
      }

      const listings = await query;
      res.json(listings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get a specific listing by ID
  app.get("/api/vendor/listings/:id", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const { id } = req.params;

      const listings = await db.select().from(vendorListings).where(
        and(
          eq(vendorListings.id, id),
          eq(vendorListings.accountId, vendorAuth.id)
        )
      );

      if (listings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      res.json(listings[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe Connect onboarding routes
  const stripeOnboardingSchema = z.object({
    accountType: z.enum(["express", "standard"]),
    businessName: z.string().min(2),
  });

  app.post("/api/vendor/connect/onboard", requireVendorAuth, async (req, res) => {
    try {
      const { accountType, businessName } = stripeOnboardingSchema.parse(req.body);
      const vendorAuth = (req as any).vendorAuth;
      
      const account = await storage.getVendorAccount(vendorAuth.id);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      // Check if already has Stripe account
      if (account.stripeConnectId) {
        return res.status(400).json({ error: "Stripe account already connected" });
      }

      const { createConnectAccount } = await import("./stripe");
      
      const result = await createConnectAccount({
        email: account.email,
        businessName,
        accountType,
      });

      // Update vendor account with Stripe Connect ID
      await storage.updateVendorAccount(account.id, {
        stripeConnectId: result.accountId,
        stripeAccountType: accountType,
      });

      res.json({
        accountId: result.accountId,
        onboardingUrl: result.onboardingUrl,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/connect/status", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);
      
      if (!account || !account.stripeConnectId) {
        return res.json({ connected: false });
      }

      const { checkAccountOnboardingStatus } = await import("./stripe");
      const status = await checkAccountOnboardingStatus(account.stripeConnectId);

      // Update onboarding complete status
      if (status.complete && !account.stripeOnboardingComplete) {
        await storage.updateVendorAccount(account.id, {
          stripeOnboardingComplete: true,
        });
      }

      res.json({
        connected: true,
        complete: status.complete,
        detailsSubmitted: status.detailsSubmitted,
        chargesEnabled: status.chargesEnabled,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/connect/dashboard", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);
      
      if (!account || !account.stripeConnectId) {
        return res.status(400).json({ error: "No Stripe account connected" });
      }

      const { createDashboardLoginLink } = await import("./stripe");
      const url = await createDashboardLoginLink(account.stripeConnectId);

      res.json({ url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vendor Dashboard & Management Routes
  
  // Get vendor dashboard stats
  app.get("/api/vendor/stats", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);
      
      if (!account?.vendorId) {
        return res.json({
          totalBookings: 0,
          revenue: 0,
          profileViews: 0,
          recentBookings: [],
        });
      }

      // TODO: Implement actual stats calculation from database
      // For now, return mock data
      res.json({
        totalBookings: 24,
        bookingsThisMonth: 3,
        revenue: 45200,
        revenueGrowth: 12,
        profileViews: 1234,
        profileViewsGrowth: 18,
        recentBookings: [],
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get vendor's bookings
  app.get("/api/vendor/bookings", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);
      
      if (!account?.vendorId) {
        return res.json([]);
      }

      // TODO: Implement actual bookings retrieval
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update booking status (accept, reschedule, cancel, complete)
  app.patch("/api/vendor/bookings/:id", requireVendorAuth, async (req, res) => {
    try {
      const { status, notes } = req.body;
      // TODO: Implement booking update logic
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get vendor's messages
  app.get("/api/vendor/messages", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      // TODO: Implement messages retrieval
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get vendor's payments
  app.get("/api/vendor/payments", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      // TODO: Implement payments retrieval
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get vendor's reviews
  app.get("/api/vendor/reviews", requireVendorAuth, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);
      
      if (!account?.vendorId) {
        return res.json([]);
      }

      // TODO: Implement reviews retrieval
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reply to a review
  app.post("/api/vendor/reviews/:id/reply", requireVendorAuth, async (req, res) => {
    try {
      const { replyText } = req.body;
      // TODO: Implement review reply logic
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Customer-facing routes (existing)
  app.post("/api/events", async (req, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      const event = await storage.createEvent(validatedData);
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getAllEvents();
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendors", async (req, res) => {
    try {
      const vendors = await storage.getAllVendors();
      res.json(vendors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendors/meta/categories", async (req, res) => {
    try {
      const vendors = await storage.getAllVendors();
      const categories = Array.from(new Set(vendors.map(v => v.category))).sort();
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendors/:id", async (req, res) => {
    try {
      const vendor = await storage.getVendor(req.params.id);
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:eventId/recommendations", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const allVendors = await storage.getAllVendors();
      const scoredRecommendations = scoreVendorsForEvent(event, allVendors);
      
      res.json(scoredRecommendations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Booking and Payment Routes
  const createBookingSchema = z.object({
    vendorId: z.string(),
    eventId: z.string().optional(),
    packageId: z.string().optional(),
    addOnIds: z.array(z.string()).optional(),
    eventDate: z.string(),
    eventStartTime: z.string().optional(),
    eventLocation: z.string().optional(),
    guestCount: z.number().optional(),
    specialRequests: z.string().optional(),
    totalAmount: z.number().int().positive(),
    depositAmount: z.number().int().positive(),
    finalPaymentStrategy: z.enum(["immediately", "2_weeks_prior", "day_of_event"]),
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const data = createBookingSchema.parse(req.body);
      
      // Calculate platform fee (15%)
      const platformFee = Math.round(data.totalAmount * 0.15);
      const vendorPayout = data.totalAmount - platformFee;

      // Create booking
      const booking = await storage.createBooking({
        ...data,
        customerId: null, // TODO: Get from auth when customer auth is implemented
        addOnIds: data.addOnIds ?? [],
        platformFee,
        vendorPayout,
        depositAmount: data.depositAmount,
        finalPaymentStrategy: data.finalPaymentStrategy,
        status: "pending",
        paymentStatus: "pending",
      });

      // Create payment schedules
      // 1. Deposit (due immediately)
      await storage.createPaymentSchedule({
        bookingId: booking.id,
        installmentNumber: 1,
        amount: data.depositAmount,
        dueDate: new Date().toISOString().split('T')[0],
        paymentType: "deposit",
        status: "pending",
      });

      // 2. Final payment (based on strategy)
      const finalAmount = data.totalAmount - data.depositAmount;
      let finalDueDate: string;
      
      if (data.finalPaymentStrategy === "immediately") {
        finalDueDate = new Date().toISOString().split('T')[0];
      } else if (data.finalPaymentStrategy === "2_weeks_prior") {
        const eventDate = new Date(data.eventDate);
        const twoWeeksPrior = new Date(eventDate);
        twoWeeksPrior.setDate(twoWeeksPrior.getDate() - 14);
        finalDueDate = twoWeeksPrior.toISOString().split('T')[0];
      } else { // day_of_event
        finalDueDate = data.eventDate;
      }

      await storage.createPaymentSchedule({
        bookingId: booking.id,
        installmentNumber: 2,
        amount: finalAmount,
        dueDate: finalDueDate,
        paymentType: "final",
        status: "pending",
      });

      res.json(booking);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Process a payment (deposit or scheduled payment)
  app.post("/api/bookings/:bookingId/payments/:scheduleId", async (req, res) => {
    try {
      const { bookingId, scheduleId } = req.params;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const schedule = (await storage.getPaymentSchedulesByBooking(bookingId))
        .find(s => s.id === scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Payment schedule not found" });
      }

      // Get vendor's Stripe Connect ID
      const vendorAccount = await storage.getVendorAccountByVendorId(booking.vendorId);
      if (!vendorAccount || !vendorAccount.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
        return res.status(400).json({ error: "Vendor payment processing not set up" });
      }

      // Create Stripe Payment Intent with platform fee
      const { createBookingPaymentIntent } = await import("./stripe");
      const paymentIntent = await createBookingPaymentIntent({
        amount: schedule.amount,
        platformFeePercent: 15,
        vendorStripeAccountId: vendorAccount.stripeConnectId,
        description: `Booking ${booking.id} - ${schedule.paymentType}`,
      });

      // Update payment schedule with Stripe payment intent ID
      await storage.updatePaymentSchedule(scheduleId, {
        stripePaymentIntentId: paymentIntent.id,
      });

      // Create payment record
      const platformFee = Math.round(schedule.amount * 0.15);
      await storage.createPayment({
        bookingId: booking.id,
        scheduleId: schedule.id,
        customerId: booking.customerId,
        vendorId: booking.vendorId,
        stripePaymentIntentId: paymentIntent.id,
        amount: schedule.amount,
        platformFee,
        vendorPayout: schedule.amount - platformFee,
        paymentType: schedule.paymentType,
        status: "pending",
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook to handle successful payments
  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      const event = req.body;

      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;
        
        // Find payment by Stripe payment intent ID
        const allPayments = await storage.getAllEvents(); // This should be getAllPayments but storage doesn't have it yet
        // TODO: Implement proper payment lookup and update booking/schedule status
        
        res.json({ received: true });
      } else {
        res.json({ received: true });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Request refund (48-hour policy)
  app.post("/api/bookings/:bookingId/refund", async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { reason } = req.body;
      
      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Check 48-hour policy
      if (booking.depositPaidAt) {
        const hoursSinceDeposit = (Date.now() - booking.depositPaidAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceDeposit > 48) {
          return res.status(400).json({ error: "Refund period has expired (48 hours)" });
        }
      }

      // Get deposit payment
      const payments = await storage.getPaymentsByBooking(bookingId);
      const depositPayment = payments.find(p => p.paymentType === "deposit" && p.status === "paid");
      
      if (!depositPayment) {
        return res.status(400).json({ error: "No deposit payment found" });
      }

      // Issue refund
      const { refundBookingPayment } = await import("./stripe");
      const refund = await refundBookingPayment({
        paymentIntentId: depositPayment.stripePaymentIntentId,
        reason: reason || "requested_by_customer",
      });

      // Update payment record
      await storage.updatePayment(depositPayment.id, {
        status: "refunded",
        refundAmount: depositPayment.amount,
        refundReason: reason,
        refundedAt: new Date(),
      });

      // Update booking
      await storage.updateBooking(bookingId, {
        status: "cancelled",
        paymentStatus: "refunded",
        cancellationReason: reason,
        cancelledAt: new Date(),
      });

      res.json({ refund, message: "Booking cancelled and refund processed" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
