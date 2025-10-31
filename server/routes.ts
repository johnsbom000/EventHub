import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertVendorAccountSchema } from "@shared/schema";
import { scoreVendorsForEvent } from "./vendorScoring";
import { hashPassword, comparePassword, generateToken, requireVendorAuth } from "./auth";
import { z } from "zod";

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
      
      // Check if vendor account already exists
      const existing = await storage.getVendorAccountByEmail(email);
      if (existing) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create vendor account (without vendorId initially - will be linked during onboarding)
      const account = await storage.createVendorAccount({
        email,
        password: hashedPassword,
        businessName,
        vendorId: null,
        stripeConnectId: null,
        stripeAccountType: null,
        stripeOnboardingComplete: false,
        active: true,
      });

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
          vendorId: account.vendorId,
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

      // Find vendor account
      const account = await storage.getVendorAccountByEmail(email);
      if (!account) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

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
          vendorId: account.vendorId,
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
      const account = await storage.getVendorAccount(vendorAuth.id);
      
      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      res.json({
        id: account.id,
        email: account.email,
        businessName: account.businessName,
        vendorId: account.vendorId,
        stripeConnectId: account.stripeConnectId,
        stripeAccountType: account.stripeAccountType,
        stripeOnboardingComplete: account.stripeOnboardingComplete,
        active: account.active,
      });
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
