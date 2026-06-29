import type { Express } from "express";
import { createServer, type Server } from "http";
import { logger } from "./lib/logger";
import {
  assertCanonicalBookingSchemaReady,
  startAllBackgroundWorkers,
} from "./services/backgroundJobs";
import { deactivateActiveListingsViolatingPublishGate } from "./services/bookingService";
import { registerGoogleRoutes } from "./routers/google";
import { registerBoardRoutes } from "./routers/boards";
import { registerCircumventionRoutes } from "./routers/circumvention";
import { registerBookingRoutes } from "./routers/bookings";
import { registerPaymentRoutes } from "./routers/payments";
import { registerMiscRoutes } from "./routers/misc";
import { registerCustomerRoutes } from "./routers/customer";
import { registerVendorRoutes } from "./routers/vendor";
import { registerAdminRoutes } from "./routers/admin";
import { registerBillingRoutes } from "./routers/billing";
import { registerAiRoutes } from "./routers/ai";

export async function registerRoutes(app: Express): Promise<Server> {
  await assertCanonicalBookingSchemaReady();

  try {
    await deactivateActiveListingsViolatingPublishGate();
  } catch (error: any) {
    logger.warn("[listing publish gate] startup reconciliation failed:", error?.message || error);
  }

  startAllBackgroundWorkers();

  registerGoogleRoutes(app);
  registerMiscRoutes(app);
  registerVendorRoutes(app);
  registerCustomerRoutes(app);
  registerBookingRoutes(app);
  registerPaymentRoutes(app);
  registerBoardRoutes(app);
  registerCircumventionRoutes(app);
  registerAdminRoutes(app);
  registerBillingRoutes(app);
  registerAiRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
