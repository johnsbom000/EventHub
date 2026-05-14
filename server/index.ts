import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force-load the repo-root .env (one level above /server)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { logger } from "./lib/logger";
import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";

if (process.env.NODE_ENV !== "production") {
  logger.debug("DATABASE_URL loaded: %s", Boolean(process.env.DATABASE_URL));
  logger.debug("server entry: %s", import.meta.url);
  logger.debug("PORT env: %s", process.env.PORT);
}

const app = express();

// Trust exactly one proxy hop (e.g. Render/Fly/nginx). This makes Express
// populate req.ip from the last X-Forwarded-For entry added by our trusted
// reverse proxy rather than trusting the raw header from the client.
app.set("trust proxy", 1);

// Auth0 tenant is baked into the frontend bundle at build time.
// We read it server-side here solely to build an accurate CSP that allows the
// browser to reach the correct Auth0 endpoint for token operations.
const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN || "").trim();

app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production"
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
              "'self'",
              // Stripe.js — required for payment UI
              "https://js.stripe.com",
              // Auth0 Universal Login / silent auth iframes
              AUTH0_DOMAIN ? `https://${AUTH0_DOMAIN}` : "",
              // Mapbox GL JS worker loaded via blob: URL
              "blob:",
            ].filter(Boolean),
            styleSrc: [
              "'self'",
              "'unsafe-inline'", // Mapbox GL and Stream Chat inject styles at runtime
              "https://fonts.googleapis.com",
            ],
            fontSrc: [
              "'self'",
              "https://fonts.gstatic.com",
            ],
            imgSrc: [
              "'self'",
              "data:",
              "blob:",
              // Mapbox tiles and static map images
              "https://*.mapbox.com",
              // Cloudflare R2 CDN for listing/vendor photos
              process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || "",
              // Stripe-hosted payment brand images
              "https://*.stripe.com",
            ].filter(Boolean),
            connectSrc: [
              "'self'",
              // Stripe payment and Connect API
              "https://api.stripe.com",
              "https://*.stripe.com",
              // Auth0 token endpoint and JWKS
              AUTH0_DOMAIN ? `https://${AUTH0_DOMAIN}` : "",
              // Mapbox geocoding, tiles, and events
              "https://api.mapbox.com",
              "https://events.mapbox.com",
              "https://*.tiles.mapbox.com",
              // Stream Chat API and WebSocket
              "https://*.stream-io-api.com",
              "wss://*.stream-io-api.com",
            ].filter(Boolean),
            frameSrc: [
              // Stripe hosted payment UIs (3D Secure, Connect onboarding)
              "https://js.stripe.com",
              "https://*.stripe.com",
              // Auth0 silent auth iframe
              AUTH0_DOMAIN ? `https://${AUTH0_DOMAIN}` : "",
            ].filter(Boolean),
            workerSrc: [
              "'self'",
              // Mapbox GL JS spawns a Web Worker from a blob: URL
              "blob:",
            ],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
          },
        }
      : false, // Dev: CSP off so Vite HMR works without restriction
    crossOriginEmbedderPolicy: false, // Stripe.js requires this to be off
  })
);

const uploadsDir = path.resolve(__dirname, "./uploads");

// Dev/local fallback for listing/shop uploads when object storage is not configured.
app.use("/uploads", express.static(uploadsDir));

function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function parseAllowedOrigins(): Set<string> {
  const rawValues = [
    process.env.APP_URL || "",
    ...(process.env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim()),
  ];

  const normalized = rawValues
    .map((value) => normalizeOrigin(value))
    .filter((value) => value.length > 0);

  return new Set(normalized);
}

const allowedCorsOrigins = parseAllowedOrigins();

app.use((req, res, next) => {
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const requestOrigin = normalizeOrigin(originHeader);
  const isAllowed = requestOrigin.length > 0 && allowedCorsOrigins.has(requestOrigin);

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    if (!originHeader) {
      return res.status(204).end();
    }
    if (isAllowed) {
      return res.status(204).end();
    }
    return res.status(403).end();
  }

  return next();
});



declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Restrict body size for public/unauthenticated endpoints before the global 6MB parser.
// This prevents large-payload DoS attacks against routes that need no photos.
app.use(["/api/events", "/api/track"], express.json({ limit: "10kb" }));

app.use(express.json({
  // Customer profile photos are sent as base64 data URLs in JSON.
  // 2MB binary expands above 2.6MB as base64, so default parser size is insufficient.
  limit: "6mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: "6mb" }));

// Structured HTTP request logger — emits one line per API response.
app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;

  res.on("finish", () => {
    if (reqPath.startsWith("/api")) {
      const durationMs = Date.now() - start;
      logger.info(
        { method: req.method, path: reqPath, status: res.statusCode, durationMs },
        "%s %s %d in %dms",
        req.method,
        reqPath,
        res.statusCode,
        durationMs
      );
    }
  });

  next();
});

// Lightweight health check — must be registered before registerRoutes so it
// has no dependencies and always responds even if DB/services are unavailable.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const isDev = app.get("env") === "development";
    const message = isDev ? err?.message || "Internal Server Error" : "Internal Server Error";

    logger.error({ err }, "unhandled server error");
    if (!res.headersSent) {
      res.status(status).json({ error: message });
    }
    // do NOT rethrow here — it can crash the server / hide logs
  });



  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5001', 10);
  server.listen(port, "0.0.0.0", () => {
    logger.info("serving on port %d", port);
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      logger.warn("[startup] RESEND_API_KEY or RESEND_FROM_EMAIL is not set — transactional emails will be silently skipped");
    }
  });
})();
