import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertEventSchema,
  insertVendorAccountSchema,
  insertVendorProfileSchema,
  vendorProfiles,
  vendorAccounts,
  vendorListings,
  users,
  insertUserSchema,
  webTraffic,
  bookings,
} from "@shared/schema";
import { scoreVendorsForEvent } from "./vendorScoring";
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  requireVendorAuth, // legacy (kept for now; not used on vendor routes below)
  requireCustomerAuth,
  requireDualAuth,
  requireDualAuthAuth0,
  requireAdminAuth,
} from "./auth";
import { requireAuth0 } from "./auth0"; // ✅ Auth0 middleware
import { z } from "zod";
import { db } from "./db";
import { eq, and, sql as drizzleSql, count, sum, gte, lte, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";

/**proxy: {
  "/api": {
    target: "http://localhost:5001",
    changeOrigin: true,
    secure: false,
  },
},

 * Middleware: after requireAuth0, resolve the vendor account by auth0_sub and
 * attach a normalized vendorAuth object so existing handlers keep working.
 */
async function requireVendorAccountAuth0(req: any, res: any, next: any) {
  try {
    const auth0 = req.auth0 as { sub?: string; email?: string } | undefined;
    const auth0Sub = auth0?.sub;
    const rawEmail = auth0?.email;
    const emailNormalized = rawEmail ? rawEmail.toLowerCase().trim() : undefined;

    if (!auth0Sub && !emailNormalized) {
      return res.status(401).json({ error: "Missing Auth0 identity (sub/email)" });
    }

    let account: any | undefined;

    // 1) Prefer lookup by normalized email to avoid duplicate accounts per email
    if (emailNormalized) {
      const byEmail = await db
        .select()
        .from(vendorAccounts)
        .where(drizzleSql`lower(${vendorAccounts.email}) = ${emailNormalized}`);

      if (byEmail.length > 0) {
        account = byEmail[0];
      }

      // Backfill auth0Sub onto the vendor account so future logins work even if email is missing
      if (account && auth0Sub && !account.auth0Sub) {
        const [updated] = await db
          .update(vendorAccounts)
          .set({ auth0Sub })
          .where(eq(vendorAccounts.id, account.id))
          .returning();

        account = updated;
      }
    }

    // 2) Fallback: lookup by auth0Sub if still not found
    if (!account && auth0Sub) {
      const bySub = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.auth0Sub, auth0Sub));

      if (bySub.length > 0) {
        account = bySub[0];
      }
    }

    if (!account) {
      // Auth0 is valid, but user doesn't have a vendor account row yet
      return res.status(404).json({ error: "Vendor account not found for this Auth0 user" });
    }

    // Ensure auth0Sub is stored/kept in sync on the vendor account
    if (auth0Sub && account.auth0Sub !== auth0Sub) {
      const [updated] = await db
        .update(vendorAccounts)
        .set({ auth0Sub })
        .where(eq(vendorAccounts.id, account.id))
        .returning();
      account = updated;
    }

    // Normalize to the shape legacy code expects
    req.vendorAuth = {
      id: account.id,
      email: account.email,
      type: "vendor",
      auth0Sub: account.auth0Sub,
    };

    // Also expose account directly if useful later
    req.vendorAccount = account;

    return next();
  } catch (err: any) {
    console.error("requireVendorAccountAuth0 failed:", err?.message || err);
    return res.status(500).json({ error: "Failed to resolve vendor account" });
  }
}

/**
 * Convenience combo for vendor routes:
 * - verify Auth0 token
 * - resolve vendor account by auth0_sub
 */
const requireVendorAuth0 = [requireAuth0, requireVendorAccountAuth0] as const;

  export async function registerRoutes(app: Express): Promise<Server> {
    // --- Listing photo uploads (local disk) ---
  const listingUploadsDir = path.join(process.cwd(), "server/uploads/listings");
  if (!fs.existsSync(listingUploadsDir)) fs.mkdirSync(listingUploadsDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, listingUploadsDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const safeExt = ext && ext.length <= 8 ? ext : ".jpg";
        const base = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        cb(null, `${base}${safeExt}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
      if (!ok) return cb(null, false); // silently reject
      return cb(null, true);
    },

  });

  // Upload one listing photo. Returns a public URL under /uploads/...
app.post(
  "/api/uploads/listing-photo",
  requireDualAuthAuth0,
  upload.single("photo"),
  async (req: any, res) => {
    console.log(">>> HIT /api/uploads/listing-photo", req.method, req.path);
    // multer rejected the file OR no file was provided
    if (!req.file) {
      return res.status(400).json({ error: "Only JPG, PNG, or WebP allowed (max 10MB)." });
    }

    return res.json({
      url: `/uploads/listings/${req.file.filename}`,
      filename: req.file.filename,
    });
  }
);

  // Location search (used by LocationPicker autocomplete)
  app.get("/api/locations/search", async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      if (!q || q.length < 2) return res.json([]);

      const token = process.env.MAPBOX_ACCESS_TOKEN;
      console.log("MAPBOX_ACCESS_TOKEN exists:", Boolean(token));

      if (!token) {
        return res.status(500).json({ error: "Mapbox token not configured" });
      }

      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${encodeURIComponent(q)}.json` +
        `?autocomplete=true&limit=5&access_token=${token}`;

      const response = await fetch(url);
      const text = await response.text();

      if (!response.ok) {
        // Mapbox returns a helpful JSON message here; include it
        throw new Error(`Mapbox error: ${response.status} - ${text}`);
      }

      const data = JSON.parse(text);

      const results = (data.features || []).map((f: any) => ({
        id: f.id,
        label: f.place_name,
        lat: f.center[1],
        lng: f.center[0],
      }));

      return res.json(results);
    } catch (err: any) {
      return res.status(500).json({
        error: err?.message || "Location search failed",
      });
    }
  });

  // Vendor Authentication Routes (legacy; kept but not required for Auth0-only flow)
  const vendorSignupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    businessName: z.string().min(2),
  });

  const vendorLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  // Update current vendor account (protected route)
  const updateVendorMeSchema = z.object({
    businessName: z.string().min(1).max(100).optional(),
  });

  /**
   * PATCH /api/vendor/me  ✅ Auth0-only
   */
  app.patch("/api/vendor/me", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const parsed = updateVendorMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }

      const updates = parsed.data;
      if (!updates.businessName) {
        return res.status(400).json({ error: "No updates provided" });
      }

      await db
        .update(vendorAccounts)
        .set({ businessName: updates.businessName.trim() })
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const accounts = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id));

      const account = accounts[0];

      const profiles = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, account.id));

      const profile = profiles[0];

            // ---- Seed listing defaults from vendor profile (so new listings are valid-by-default) ----
      const profileAddress = String((profile as any)?.address || "").trim();
      const profileCity = String((profile as any)?.city || "").trim();
      const profileState = String((profile as any)?.state || "").trim();
      const profileZip = String((profile as any)?.zipCode || (profile as any)?.postalCode || "").trim();

      const radius =
        Number((profile as any)?.serviceRadius ?? 25) || 25;

      // Build a geocode query (best-effort)
      const geoQ = [profileAddress, profileCity, profileState, profileZip].filter(Boolean).join(", ").trim();

      let seededLocation: any = null;
      if (geoQ) {
        try {
          const geoRes = await fetch(`http://127.0.0.1:5001/api/locations/search?q=${encodeURIComponent(geoQ)}`);
          if (geoRes.ok) {
            const results: any[] = await geoRes.json();
            if (results?.[0]) seededLocation = results[0];
          }
        } catch {
          // ignore geocode failures; listing can be edited later
        }
      }

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

  // Legacy vendor signup/login (kept; not used for Auth0-only vendors)
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
      const [account] = await db
        .insert(vendorAccounts)
        .values({
          email,
          password: hashedPassword,
          businessName,
          stripeConnectId: null,
          stripeAccountType: null,
          stripeOnboardingComplete: false,
          active: true,
        })
        .returning();

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

  /**
   * GET /api/vendor/me ✅ Auth0-only
   */
  app.get("/api/vendor/me", ...requireVendorAuth0, async (req, res) => {
    console.log("HIT /api/vendor/me");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Vary", "Authorization");
    res.setHeader("ETag", `vendor-me-${Date.now()}`);
    res.setHeader("Last-Modified", new Date().toUTCString());

    try {
      const vendorAuth = (req as any).vendorAuth;

      const accounts = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.id, vendorAuth.id));

      if (accounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const account = accounts[0];

      // Check if vendor has completed profile (using database)
      const profiles = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, account.id));
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
        vendorType: profile?.serviceType || "unspecified",
        __marker: "vendor_me_route_hit",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Customer Authentication Routes (unchanged)
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
        // Smart error handling: instead of hard error, tell frontend to switch to login
        return res.status(400).json({
          emailExists: true,
          email,
          message: "You already have an account with this email. Please log in instead.",
        });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Auto-assign admin role if email matches ADMIN_EMAIL
      const adminEmail = process.env.ADMIN_EMAIL;
      const role = adminEmail && email.toLowerCase() === adminEmail.toLowerCase() ? "admin" : "customer";

      // Create customer account with role and lastLoginAt
      const [user] = await db
        .insert(users)
        .values({
          name,
          email,
          password: hashedPassword,
          role,
          displayName: name,
          lastLoginAt: new Date(),
        })
        .returning();

      // Generate JWT token with appropriate type
      const tokenType = user.role === "admin" ? "admin" : "customer";
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: tokenType,
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
        // Smart error handling: tell frontend to offer creating account
        return res.status(404).json({
          userNotFound: true,
          email,
          message: "We couldn't find an account with this email. Would you like to create one?",
        });
      }
      const user = userAccounts[0];

      // Verify password
      const valid = await comparePassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // Update last login timestamp
      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      // Generate JWT token with appropriate type
      const tokenType = user.role === "admin" ? "admin" : "customer";
      const token = generateToken({
        id: user.id,
        email: user.email,
        type: tokenType,
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
        role: user.role,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Unified Login Endpoint (legacy; kept)
  const unifiedLoginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = unifiedLoginSchema.parse(req.body);

      // SPECIAL CASE: Check if this is the admin email first
      const adminEmail = process.env.ADMIN_EMAIL;
      const isAdminEmail = adminEmail && email.toLowerCase() === adminEmail.toLowerCase();

      if (isAdminEmail) {
        // For admin email, ONLY check customer accounts (users table)
        const customerAccounts = await db.select().from(users).where(eq(users.email, email));
        if (customerAccounts.length > 0) {
          const user = customerAccounts[0];

          // Verify password
          const valid = await comparePassword(password, user.password);
          if (!valid) {
            return res.status(401).json({ error: "Invalid password" });
          }

          // Ensure admin role is set
          await db
            .update(users)
            .set({
              lastLoginAt: new Date(),
              role: "admin",
            })
            .where(eq(users.id, user.id));

          // Generate admin JWT token
          const token = generateToken({
            id: user.id,
            email: user.email,
            type: "admin",
          });

          return res.json({
            token,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: "admin",
            },
          });
        } else {
          // Admin email but no customer account exists
          return res.status(404).json({
            userNotFound: true,
            email,
            message: "Admin account not found. Please sign up first.",
          });
        }
      }

      // For non-admin emails, check vendor accounts FIRST (legacy)
      const vendorAccountsResult = await db.select().from(vendorAccounts).where(eq(vendorAccounts.email, email));
      if (vendorAccountsResult.length > 0) {
        const account = vendorAccountsResult[0];

        // Verify password
        const valid = await comparePassword(password, account.password);
        if (!valid) {
          return res.status(401).json({ error: "Invalid password" });
        }

        // Generate vendor JWT token
        const token = generateToken({
          id: account.id,
          email: account.email,
          type: "vendor",
        });

        return res.json({
          token,
          user: {
            id: account.id,
            email: account.email,
            businessName: account.businessName,
            role: "vendor",
            profileComplete: account.profileComplete,
            stripeOnboardingComplete: account.stripeOnboardingComplete,
          },
        });
      }

      // Second, check customer accounts (users table)
      const customerAccounts = await db.select().from(users).where(eq(users.email, email));
      if (customerAccounts.length > 0) {
        const user = customerAccounts[0];

        // Verify password
        const valid = await comparePassword(password, user.password);
        if (!valid) {
          return res.status(401).json({ error: "Invalid password" });
        }

        // Update last login timestamp
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

        // Generate customer JWT token
        const token = generateToken({
          id: user.id,
          email: user.email,
          type: "customer",
        });

        return res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        });
      }

      // No account found in either table
      return res.status(404).json({
        userNotFound: true,
        email,
        message: "We couldn't find an account with this email. Would you like to create one?",
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  const ALL_VENDOR_TYPES = [
    "venue",
    "photography",
    "videography",
    "dj",
    "florist",
    "catering",
    "planner",
    "hair-styling",
    "prop-decor",
  ] as const;

  const ENABLED_VENDOR_TYPES = ["prop-decor"] as const;

  // Complete vendor onboarding (already Auth0)
  const completeOnboardingSchema = z.object({
    businessName: z.string().min(2),
    vendorType: z.enum(ENABLED_VENDOR_TYPES),
    contactName: z.string().optional(),
    bio: z.string().optional(),
    website: z.string().optional(),
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    introVideoUrl: z.string().optional(),
    city: z.string(),
    state: z.string().optional(),
    serviceRadius: z.coerce.number().optional(),
    serviceRadiusMiles: z.coerce.number().optional(),
    portfolioImages: z.array(z.string()).optional(),
    serviceHeadline: z.string().optional(),
  });

  app.post("/api/vendor/onboarding/complete", requireAuth0, async (req, res) => {
    try {
      const customerAuth = (req as any).customerAuth;
      const vendorAuth = (req as any).vendorAuth;
      const auth0 = (req as any).auth0 as { sub: string; email?: string } | undefined;

      const onboardingData = completeOnboardingSchema.parse(req.body);

      const rawEmail = auth0?.email;
      const email = rawEmail ? rawEmail.toLowerCase().trim() : undefined;
      const auth0Sub = auth0?.sub;

      if (!email) {
        return res.status(400).json({ error: "Auth0 email is required for onboarding" });
      }

      const existingAccounts = await db
        .select()
        .from(vendorAccounts)
        .where(drizzleSql`lower(${vendorAccounts.email}) = ${email}`);
      let account = existingAccounts[0];

      if (!account) {
        const [created] = await db
          .insert(vendorAccounts)
          .values({
            email,
            auth0Sub,
            password: "auth0-external",
            businessName: onboardingData.businessName,
            profileComplete: false,
            active: true,
          })
          .returning();

        account = created;
      } else {
        const [updated] = await db
          .update(vendorAccounts)
          .set({
            businessName: onboardingData.businessName,
            auth0Sub: auth0Sub ?? account.auth0Sub,
          })
          .where(eq(vendorAccounts.id, account.id))
          .returning();

        account = updated;
      }

      const existingProfiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, account.id));

      const addressParts = [onboardingData.city, onboardingData.state].filter(Boolean);
      const address = addressParts.join(", ");

      const radius = onboardingData.serviceRadius ?? onboardingData.serviceRadiusMiles ?? 25;

      const profilePayload = {
        accountId: account.id,
        serviceType: onboardingData.vendorType,
        experience: 0,
        qualifications: [] as string[],
        onlineProfiles: {
          website: onboardingData.website || null,
          instagram: onboardingData.instagram || null,
          tiktok: onboardingData.tiktok || null,
          introVideoUrl: onboardingData.introVideoUrl || null,
          bio: onboardingData.bio || null,
          headline: onboardingData.serviceHeadline || null,
        },
        address,
        city: onboardingData.city,
        travelMode: "travel-to-guests" as const,
        serviceRadius: radius,
        serviceAddress: null as string | null,
        photos: onboardingData.portfolioImages ?? [],
        serviceDescription: onboardingData.serviceHeadline || `Services by ${onboardingData.businessName}`,
      };

      let profile;
      if (existingProfiles.length > 0) {
        const current = existingProfiles[0];
        const [updatedProfile] = await db
          .update(vendorProfiles)
          .set({
            ...profilePayload,
            updatedAt: new Date(),
          })
          .where(eq(vendorProfiles.id, current.id))
          .returning();

        profile = updatedProfile;
      } else {
        const [createdProfile] = await db.insert(vendorProfiles).values(profilePayload).returning();
        profile = createdProfile;
      }

      await db.update(vendorAccounts).set({ profileComplete: true }).where(eq(vendorAccounts.id, account.id));

      const isUpgrade = Boolean(customerAuth || vendorAuth);

      return res.json({
        vendorAccountId: account.id,
        profileId: profile.id,
        isUpgrade,
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      return res.status(500).json({ error: error.message });
    }
  });

  // Create vendor profile (protected route, steps 1-6 of onboarding)
  const createVendorProfileSchema = insertVendorProfileSchema
    .omit({ accountId: true })
    .extend({
      serviceType: z.enum(ENABLED_VENDOR_TYPES, {
        errorMap: () => ({ message: "Select a valid vendor type" }),
      }),
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

  /**
   * POST /api/vendor/profile ✅ Auth0-only
   */
  app.post("/api/vendor/profile", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const accounts = await db.select().from(vendorAccounts).where(eq(vendorAccounts.id, vendorAuth.id));
      if (accounts.length === 0) {
        return res.status(404).json({ error: "Account not found" });
      }
      const account = accounts[0];

      const existingProfiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, account.id));
      if (existingProfiles.length > 0) {
        return res.status(409).json({
          error: "Profile already exists. Use PUT/PATCH to update existing profile.",
        });
      }

      const validatedData = createVendorProfileSchema.parse(req.body);

      const profileData = {
        ...validatedData,
        accountId: account.id,
      };

      const [profile] = await db.insert(vendorProfiles).values(profileData).returning();

      res.json({
        account: {
          id: account.id,
          email: account.email,
          businessName: account.businessName,
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

    /**
   * GET /api/vendor/profile ✅ Auth0-only
   * Returns the current vendor's profile (created during onboarding)
   */
  app.get("/api/vendor/profile", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      const profiles = await db
        .select()
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, vendorAuth.id));

      if (profiles.length === 0) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      return res.json(profiles[0]);
    } catch (error: any) {
      console.error("GET /api/vendor/profile failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  // Vendor Listings Routes (already Auth0 dual middleware and working)
  app.post("/api/vendor/listings", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const listingData = req.body?.listingData;

      if (!listingData || typeof listingData !== "object") {
        return res.status(400).json({ error: "listingData must be a JSON object." });
      }

      const profiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, vendorAuth.id));

      if (profiles.length === 0) {
        return res.status(400).json({
          error: "Vendor profile required before creating a listing. Complete onboarding first.",
        });
      }

      const profile = profiles[0];
      const vendorType = profile.serviceType;
      const seededListingData = {
        ...listingData,

        // Service area mode (listing-owned)
        serviceAreaMode: listingData?.serviceAreaMode ?? "radius",

        // Radius: listing → legacy field → default
        serviceRadiusMiles:
          listingData?.serviceRadiusMiles ??
          listingData?.serviceRadius ??
          25,

        // Location MUST come from listing UI (map picker)
        // Do NOT infer lat/lng from vendor profile
        serviceLocation: listingData?.serviceLocation ?? null,
        serviceCenter: listingData?.serviceCenter ?? null,
      };

      const safeVendorType =
        typeof vendorType === "string" && vendorType.trim() ? vendorType.trim() : "vendor";

      const title =
        (typeof listingData.title === "string" && listingData.title.trim()) || `New ${safeVendorType} listing`;
      const [listing] = await db
        .insert(vendorListings)
        .values({
          accountId: vendorAuth.id,
          profileId: profile.id,
          status: "draft",
          title,
          listingData: seededListingData,
        })
        .returning();

      return res.status(201).json(listing);
    } catch (error: any) {
      console.error("POST /api/vendor/listings failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  app.patch("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id } = req.params;
      const { listingData, status, title } = req.body;

      const existingListings = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existingListings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const profiles = await db.select().from(vendorProfiles).where(eq(vendorProfiles.accountId, vendorAuth.id));

      if (profiles.length === 0) {
        return res.status(400).json({ error: "Vendor profile required" });
      }

      const normalizedStatus =
        status === "active" ? "active" :
        status === "inactive" ? "inactive" :
        status === "draft" ? "draft" :
        undefined;

      const [updated] = await db
        .update(vendorListings)
        .set({
          listingData,
          status: normalizedStatus ?? existingListings[0].status,
          title: title || existingListings[0].title,
          updatedAt: new Date(),
        })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/vendor/listings/:id/publish", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const ld: any = existing[0]?.listingData || {};

      // ---- Publish validation (hard requirements) ----
      const mode = String(ld.serviceAreaMode || "").trim(); // radius | nationwide | global
      const loc = ld.serviceLocation;

      const hasLoc =
        loc &&
        typeof loc === "object" &&
        typeof loc.label === "string" &&
        Number.isFinite(Number(loc.lat)) &&
        Number.isFinite(Number(loc.lng)) &&
        typeof loc.country === "string" &&
        loc.country.trim().length > 0;

      const titleOk =
        typeof ld.listingTitle === "string" && ld.listingTitle.trim().length >= 2;

      const descOk =
        typeof ld.listingDescription === "string" && ld.listingDescription.trim().length >= 10;

      const photosOk =
        Array.isArray(ld?.photos?.names) && ld.photos.names.length > 0;

      // service area checks
      const modeOk = mode === "radius" || mode === "nationwide" || mode === "global";

      const center = ld.serviceCenter;
      const hasCenter =
        center &&
        typeof center === "object" &&
        Number.isFinite(Number(center.lat)) &&
        Number.isFinite(Number(center.lng));

      const radiusMiles = ld.serviceRadiusMiles ?? ld.serviceRadius ?? null;
      const radiusOk =
        mode !== "radius" ? true : Number.isFinite(Number(radiusMiles)) && Number(radiusMiles) > 0;

      if (!modeOk || !hasLoc || !titleOk || !descOk || !photosOk || !radiusOk || (mode === "radius" && !hasCenter)) {
        return res.status(400).json({
          error: "Listing incomplete — cannot publish",
          missing: {
            serviceAreaMode: !modeOk,
            serviceLocation: !hasLoc,
            listingTitle: !titleOk,
            listingDescription: !descOk,
            photos: !photosOk,
            serviceCenter: mode === "radius" ? !hasCenter : false,
            serviceRadiusMiles: mode === "radius" ? !radiusOk : false,
          },
        });
      }
      const [updated] = await db
        .update(vendorListings)
        .set({
          status: "draft",
          updatedAt: new Date(),
        })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      return res.json(updated);
    } catch (error: any) {
      console.error("PATCH /api/vendor/listings/:id/publish failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

    app.patch("/api/vendor/listings/:id/unpublish", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }

      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const [updated] = await db
        .update(vendorListings)
        .set({
          status: "inactive",
          updatedAt: new Date(),
        })
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)))
        .returning();

      return res.json(updated);
    } catch (error: any) {
      console.error("PATCH /api/vendor/listings/:id/unpublish failed:", error);
      return res.status(500).json({ error: error?.message ?? "Unknown error" });
    }
  });

  // Public Listings (guest browsing)
  // Returns only active listings. No auth.
  app.get("/api/listings/public", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const listings = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          listingData: vendorListings.listingData,

          serviceType: vendorProfiles.serviceType,
          city: vendorProfiles.city,
          vendorId: vendorAccounts.id,
          vendorName: vendorAccounts.businessName,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
        .where(eq(vendorListings.status, "active"));
      return res.json(listings);
    } catch (error: any) {
      console.error("GET /api/listings/public failed:", error);
      return res.status(500).json({
        error: error?.message ?? "Unknown error",
        stack: error?.stack,
      });
    }

  });

    // Public Listing Detail (guest browsing) added 1/22/26
  // Returns one active listing by id. No auth.
  app.get("/api/listings/public/:id", async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");

      // Listing IDs are UUID strings (not numbers)
      const id = String(req.params.id || "").trim();

      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

      if (!isUuid) {
        return res.status(400).json({ error: "Invalid listing id" });
      }

      const rows = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          listingData: vendorListings.listingData,

          serviceType: vendorProfiles.serviceType,
          city: vendorProfiles.city,
          vendorId: vendorAccounts.id,
          vendorName: vendorAccounts.businessName,
        })
        .from(vendorListings)
        .innerJoin(vendorProfiles, eq(vendorListings.profileId, vendorProfiles.id))
        .innerJoin(vendorAccounts, eq(vendorProfiles.accountId, vendorAccounts.id))
        .where(and(eq(vendorListings.status, "active"), eq(vendorListings.id, id)))
        .limit(1);

      const listing = rows[0];
      if (!listing) return res.status(404).json({ error: "Not found" });

      return res.json(listing);
    } catch (error: any) {
      console.error("GET /api/listings/public/:id failed:", error);
      return res.status(500).json({
        error: error?.message ?? "Unknown error",
        stack: error?.stack,
      });
    }
  });

  app.get("/api/vendor/listings", requireDualAuthAuth0, async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { status } = req.query;

      // Map UI bucket names to DB status values
      const normalizedStatus =
        status === "active" ? "active" :
        status === "inactive" ? "inactive" :
        status === "draft" ? "draft" :
        undefined;

      const whereClause = normalizedStatus
        ? and(eq(vendorListings.accountId, vendorAuth.id), eq(vendorListings.status, normalizedStatus))
        : eq(vendorListings.accountId, vendorAuth.id);

      const listings = await db.select().from(vendorListings).where(whereClause);

      console.log(
        "[GET /api/vendor/listings] accountId=",
        vendorAuth.id,
        "status=",
        status,
        "count=",
        listings.length
      );

      res.json(listings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id } = req.params;

      const listings = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (listings.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      res.json(listings[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/vendor/listings/:id", requireDualAuthAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;

      if (!vendorAuth) {
        return res.status(403).json({ error: "Vendor account required" });
      }
      const { id } = req.params;

      const existing = await db
        .select()
        .from(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      if (existing.length === 0) {
        return res.status(404).json({ error: "Listing not found" });
      }

      await db
        .delete(vendorListings)
        .where(and(eq(vendorListings.id, id), eq(vendorListings.accountId, vendorAuth.id)));

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Stripe Connect onboarding routes ✅ Auth0-only now
  const stripeOnboardingSchema = z.object({
    accountType: z.enum(["express", "standard"]),
    businessName: z.string().min(2),
  });

  app.post("/api/vendor/connect/onboard", ...requireVendorAuth0, async (req, res) => {
    try {
      const { accountType, businessName } = stripeOnboardingSchema.parse(req.body);
      const vendorAuth = (req as any).vendorAuth;

      const account = await storage.getVendorAccount(vendorAuth.id);
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      if (account.stripeConnectId) {
        return res.status(400).json({ error: "Stripe account already connected" });
      }

      const { createConnectAccount } = await import("./stripe");

      const result = await createConnectAccount({
        email: account.email,
        businessName,
        accountType,
      });

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

  app.get("/api/vendor/connect/status", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account || !account.stripeConnectId) {
        return res.json({ connected: false });
      }

      const { checkAccountOnboardingStatus } = await import("./stripe");
      const status = await checkAccountOnboardingStatus(account.stripeConnectId);

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

  app.get("/api/vendor/connect/dashboard", ...requireVendorAuth0, async (req, res) => {
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

  // Vendor Dashboard & Management Routes ✅ Auth0-only now
  app.get("/api/vendor/stats", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account?.id) {
        return res.json({
          totalBookings: 0,
          revenue: 0,
          profileViews: 0,
          recentBookings: [],
        });
      }

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

  app.get("/api/vendor/bookings", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account?.id) {
        return res.json([]);
      }

      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/vendor/bookings/:id", ...requireVendorAuth0, async (req, res) => {
    try {
      // TODO: Implement booking update logic
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/messages", ...requireVendorAuth0, async (req, res) => {
    try {
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/payments", ...requireVendorAuth0, async (req, res) => {
    try {
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/vendor/reviews", ...requireVendorAuth0, async (req, res) => {
    try {
      const vendorAuth = (req as any).vendorAuth;
      const account = await storage.getVendorAccount(vendorAuth.id);

      if (!account?.id) {
        return res.json([]);
      }

      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/vendor/reviews/:id/reply", ...requireVendorAuth0, async (req, res) => {
    try {
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

  app.get("/api/events/:eventId/recommendations", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Real recommendations: return active listings for now (scoring can be added later)
      const listings = await db
        .select({
          id: vendorListings.id,
          title: vendorListings.title,
          listingData: vendorListings.listingData,
          vendorProfileId: vendorListings.profileId,
          vendorAccountId: vendorListings.accountId,
        })
        .from(vendorListings)
        .where(eq(vendorListings.status, "active"))
        .limit(50);

      res.json(listings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Booking and Payment Routes (unchanged)
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

      const platformFee = Math.round(data.totalAmount * 0.15);
      const vendorPayout = data.totalAmount - platformFee;

      const booking = await storage.createBooking({
        ...data,
        customerId: null,
        addOnIds: data.addOnIds ?? [],
        platformFee,
        vendorPayout,
        depositAmount: data.depositAmount,
        finalPaymentStrategy: data.finalPaymentStrategy,
        status: "pending",
        paymentStatus: "pending",
      });

      await storage.createPaymentSchedule({
        bookingId: booking.id,
        installmentNumber: 1,
        amount: data.depositAmount,
        dueDate: new Date().toISOString().split("T")[0],
        paymentType: "deposit",
        status: "pending",
      });

      const finalAmount = data.totalAmount - data.depositAmount;
      let finalDueDate: string;

      if (data.finalPaymentStrategy === "immediately") {
        finalDueDate = new Date().toISOString().split("T")[0];
      } else if (data.finalPaymentStrategy === "2_weeks_prior") {
        const eventDate = new Date(data.eventDate);
        const twoWeeksPrior = new Date(eventDate);
        twoWeeksPrior.setDate(twoWeeksPrior.getDate() - 14);
        finalDueDate = twoWeeksPrior.toISOString().split("T")[0];
      } else {
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

  app.post("/api/bookings/:bookingId/payments/:scheduleId", async (req, res) => {
    try {
      const { bookingId, scheduleId } = req.params;

      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const schedule = (await storage.getPaymentSchedulesByBooking(bookingId)).find((s) => s.id === scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Payment schedule not found" });
      }

      const vendorAccount = await storage.getVendorAccountByVendorId(booking.vendorId);
      if (!vendorAccount || !vendorAccount.stripeConnectId || !vendorAccount.stripeOnboardingComplete) {
        return res.status(400).json({ error: "Vendor payment processing not set up" });
      }

      const { createBookingPaymentIntent } = await import("./stripe");
      const paymentIntent = await createBookingPaymentIntent({
        amount: schedule.amount,
        platformFeePercent: 15,
        vendorStripeAccountId: vendorAccount.stripeConnectId,
        description: `Booking ${booking.id} - ${schedule.paymentType}`,
      });

      await storage.updatePaymentSchedule(scheduleId, {
        stripePaymentIntentId: paymentIntent.id,
      });

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

  app.post("/api/webhooks/stripe", async (req, res) => {
    try {
      const event = req.body;

      if (event.type === "payment_intent.succeeded") {
        res.json({ received: true });
      } else {
        res.json({ received: true });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bookings/:bookingId/refund", async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { reason } = req.body;

      const booking = await storage.getBooking(bookingId);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      if (booking.depositPaidAt) {
        const hoursSinceDeposit = (Date.now() - booking.depositPaidAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceDeposit > 48) {
          return res.status(400).json({ error: "Refund period has expired (48 hours)" });
        }
      }

      const payments = await storage.getPaymentsByBooking(bookingId);
      const depositPayment = payments.find((p) => p.paymentType === "deposit" && p.status === "paid");

      if (!depositPayment) {
        return res.status(400).json({ error: "No deposit payment found" });
      }

      const { refundBookingPayment } = await import("./stripe");
      const refund = await refundBookingPayment({
        paymentIntentId: depositPayment.stripePaymentIntentId,
        reason: reason || "requested_by_customer",
      });

      await storage.updatePayment(depositPayment.id, {
        status: "refunded",
        refundAmount: depositPayment.amount,
        refundReason: reason,
        refundedAt: new Date(),
      });

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

  // ============================================
  // ADMIN ANALYTICS ENDPOINTS (unchanged)
  // ============================================

  app.post("/api/track", async (req, res) => {
    try {
      const { path, referrer } = req.body;

      if (typeof path !== "string" || !path.startsWith("/")) {
        return res.status(400).json({ error: "Invalid path" });
      }

      let userId: string | null = null;
      let userType: string | null = null;

      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const payload = verifyToken(token);
        if (payload) {
          userId = payload.id;
          userType = payload.type;
        }
      }

      await db.insert(webTraffic).values({
        userId,
        userType,
        path,
        referrer: referrer || null,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false });
    }
  });

  app.get("/api/admin/stats/users", requireAdminAuth, async (req, res) => {
    try {
      const [totalUsersResult] = await db.select({ count: count() }).from(users);
      const totalUsers = totalUsersResult.count;

      const [totalVendorsResult] = await db.select({ count: count() }).from(vendorAccounts);
      const totalVendors = totalVendorsResult.count;

      const vendorsByType = await db
        .select({
          serviceType: vendorProfiles.serviceType,
          count: count(),
        })
        .from(vendorProfiles)
        .groupBy(vendorProfiles.serviceType);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const userGrowth = await db
        .select({
          date: drizzleSql<string>`DATE(${users.createdAt})`,
          count: count(),
        })
        .from(users)
        .where(gte(users.createdAt, thirtyDaysAgo))
        .groupBy(drizzleSql`DATE(${users.createdAt})`)
        .orderBy(drizzleSql`DATE(${users.createdAt})`);

      res.json({
        totalUsers,
        totalVendors,
        vendorsByType,
        userGrowth,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/stats/listings", requireAdminAuth, async (req, res) => {
    try {
      const [totalListingsResult] = await db.select({ count: count() }).from(vendorListings);
      const totalListings = totalListingsResult.count;

      const [activeListingsResult] = await db
        .select({ count: count() })
        .from(vendorListings)
        .where(eq(vendorListings.status, "active"));
      const activeListings = activeListingsResult.count;

      const [draftListingsResult] = await db
        .select({ count: count() })
        .from(vendorListings)
        .where(eq(vendorListings.status, "draft"));
      const draftListings = draftListingsResult.count;

      const [inactiveListingsResult] = await db
        .select({ count: count() })
        .from(vendorListings)
        .where(eq(vendorListings.status, "inactive"));
      const inactiveListings = inactiveListingsResult.count;

      const listingsByType = await db
        .select({
          serviceType: vendorProfiles.serviceType,
          count: count(),
        })
        .from(vendorProfiles)
        .groupBy(vendorProfiles.serviceType);

      res.json({
        totalListings,
        listingsByType,
        activeListings,
        draftListings,
        inactiveListings,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/stats/bookings", requireAdminAuth, async (req, res) => {
    try {
      const [totalBookingsResult] = await db.select({ count: count() }).from(bookings);
      const totalBookings = totalBookingsResult.count;

      const [completedCount] = await db.select({ count: count() }).from(bookings).where(eq(bookings.status, "completed"));

      const [pendingCount] = await db.select({ count: count() }).from(bookings).where(eq(bookings.status, "pending"));

      const [revenueResult] = await db.select({ total: sum(bookings.totalAmount) }).from(bookings);
      const totalRevenue = revenueResult.total || 0;

      res.json({
        totalBookings,
        completedBookings: completedCount.count,
        pendingBookings: pendingCount.count,
        totalRevenue,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/stats/traffic", requireAdminAuth, async (req, res) => {
    try {
      const [totalVisitsResult] = await db.select({ count: count() }).from(webTraffic);
      const totalVisits = totalVisitsResult.count;

      const [uniqueVisitorsResult] = await db
        .select({
          count: drizzleSql<number>`COUNT(DISTINCT ${webTraffic.userId})`,
        })
        .from(webTraffic)
        .where(drizzleSql`${webTraffic.userId} IS NOT NULL`);
      const uniqueVisitors = uniqueVisitorsResult.count;

      const topPaths = await db
        .select({
          path: webTraffic.path,
          count: count(),
        })
        .from(webTraffic)
        .groupBy(webTraffic.path)
        .orderBy(desc(count()))
        .limit(10);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const dailyTraffic = await db
        .select({
          date: drizzleSql<string>`DATE(${webTraffic.timestamp})`,
          count: count(),
        })
        .from(webTraffic)
        .where(gte(webTraffic.timestamp, thirtyDaysAgo))
        .groupBy(drizzleSql`DATE(${webTraffic.timestamp})`)
        .orderBy(drizzleSql`DATE(${webTraffic.timestamp})`);

      res.json({
        totalVisits,
        uniqueVisitors,
        topPaths,
        dailyTraffic,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
