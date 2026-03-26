import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force-load the repo-root .env (one level above /server)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

if (process.env.NODE_ENV !== "production") {
  console.log(">>> DATABASE_URL loaded?", Boolean(process.env.DATABASE_URL));
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

if (process.env.NODE_ENV !== "production") {
  console.log(">>> RUNNING server/index.ts from:", import.meta.url);
  console.log(">>> PORT in code is:", process.env.PORT);
}

const app = express();

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

// Serve uploaded files
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "server/uploads"), {
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  })
);


declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  // Customer profile photos are sent as base64 data URLs in JSON.
  // 2MB binary expands above 2.6MB as base64, so default parser size is insufficient.
  limit: "6mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: "6mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const isDev = app.get("env") === "development";
    const message = isDev ? err?.message || "Internal Server Error" : "Internal Server Error";

    console.error("UNHANDLED ERROR:", err?.stack || err);
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
    log(`serving on port ${port}`);
  });
})();
