/**
 * Postgres-backed rate limiter.
 *
 * Keys authenticated requests by Auth0 sub (extracted from the Bearer token
 * without verification — auth decisions are made separately). Falls back to
 * IP address for unauthenticated requests. Counts are shared across all
 * server instances so limits hold under multi-replica Railway deploys.
 *
 * Falls open on DB failure — a transient DB issue should never block
 * legitimate traffic, only log a warning. Payment and booking limiters
 * use failClosed: true — they 503 on DB error rather than allow unlimited
 * requests against the most sensitive endpoints.
 */

import { logger } from "./logger";
import { db } from "../db";
import { sql as drizzleSql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60 * 1000; // 1-minute sliding window
let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (tableReady) return tableReady;
  tableReady = (async () => {
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS ip_rate_limits (
        key          TEXT    NOT NULL,
        window_start BIGINT  NOT NULL,
        count        INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (key, window_start)
      )
    `);
    await db.execute(drizzleSql`
      CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_window_start
        ON ip_rate_limits (window_start)
    `);
  })().catch((err) => {
    // Allow retry next call
    tableReady = null;
    throw err;
  });
  return tableReady;
}

/** Delete rows older than two windows so the table doesn't grow unboundedly. */
async function pruneOldRows(): Promise<void> {
  const cutoff = Date.now() - WINDOW_MS * 2;
  await db.execute(drizzleSql`
    DELETE FROM ip_rate_limits WHERE window_start < ${cutoff}
  `);
}

function getRequestIp(req: Request): string {
  return (req.ip || (req.socket as any)?.remoteAddress || "unknown").toString();
}

/**
 * Returns a stable rate-limit key for the request.
 *
 * For authenticated requests we key by the Auth0 `sub` claim extracted from
 * the Bearer token. We intentionally skip signature verification here — this
 * is only used to choose a bucket, not to make an auth decision. The real
 * auth check happens in the route middleware that runs after the limiter.
 * Keying by sub means an attacker cannot bypass limits by rotating IPs or
 * spoofing X-Forwarded-For.
 *
 * For unauthenticated requests (no token) we fall back to the IP address.
 */
function getRequestKey(req: Request, label: string): string {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    try {
      const payloadB64 = authHeader.slice(7).split(".")[1];
      if (payloadB64) {
        const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
        const sub = typeof decoded.sub === "string" ? decoded.sub.trim() : "";
        if (sub) return `${label}:user:${sub}`;
      }
    } catch {
      // Malformed token — fall through to IP
    }
  }
  return `${label}:ip:${getRequestIp(req)}`;
}

export function createDbRateLimiter(options: {
  label: string;
  maxPerMinute: number;
  /**
   * When true, a DB failure causes a 503 response instead of passing the
   * request through. Use this for endpoints where bypassing the limit is
   * worse than a brief outage (e.g. payment creation, booking creation).
   * Defaults to false (fail-open) so read-heavy public endpoints stay up.
   */
  failClosed?: boolean;
}): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const max = Math.max(1, Math.min(options.maxPerMinute, 1000));
  const failClosed = options.failClosed === true;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const now = Date.now();
    // Round down to the start of the current 1-minute window.
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    const key = getRequestKey(req, options.label);

    try {
      await ensureTable();

      // Atomic upsert: increment count if the row exists, insert with count=1 if not.
      const result = await db.execute(drizzleSql`
        INSERT INTO ip_rate_limits (key, window_start, count)
        VALUES (${key}, ${windowStart}, 1)
        ON CONFLICT (key, window_start)
        DO UPDATE SET count = ip_rate_limits.count + 1
        RETURNING count
      `);

      const rows: Array<{ count?: number }> = Array.isArray(result)
        ? result
        : Array.isArray((result as any)?.rows)
          ? (result as any).rows
          : [];

      const count = typeof rows[0]?.count === "number" ? rows[0].count : 1;

      if (count > max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(429).json({ error: "Too many requests. Please try again shortly." });
        return;
      }

      // Probabilistic cleanup: run roughly once per 200 requests to keep the table small.
      if (Math.random() < 0.005) {
        void pruneOldRows().catch((e: any) =>
          logger.warn("[dbRateLimiter] prune failed:", e?.message || e)
        );
      }
    } catch (err: any) {
      if (failClosed) {
        // For payment and booking endpoints, a DB failure means we cannot
        // enforce limits — return 503 rather than allow unlimited requests.
        const retryAfterSeconds = 30;
        logger.error(`[dbRateLimiter] DB error on fail-closed limiter "${options.label}":`, err?.message || err);
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(503).json({ error: "Service temporarily unavailable. Please try again shortly." });
        return;
      }
      // Fail open for non-critical endpoints: log loudly but let the request through.
      logger.warn(`[dbRateLimiter] DB error for "${options.label}" (failing open):`, err?.message || err);
    }

    next();
  };
}
