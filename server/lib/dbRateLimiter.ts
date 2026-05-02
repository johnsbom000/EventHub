/**
 * Postgres-backed IP rate limiter.
 *
 * Stores per-IP request counts in a lightweight table so limits are shared
 * across all server instances (multi-replica deploys, rolling restarts, etc.).
 *
 * Falls open on DB failure — a transient DB issue should never block
 * legitimate traffic, only log a warning.
 */

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

export function createDbRateLimiter(options: {
  label: string;
  maxPerMinute: number;
}): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const max = Math.max(1, Math.min(options.maxPerMinute, 1000));

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = getRequestIp(req);
    const now = Date.now();
    // Round down to the start of the current 1-minute window.
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    const key = `${options.label}:${ip}`;

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
          console.warn("[dbRateLimiter] prune failed:", e?.message || e)
        );
      }
    } catch (err: any) {
      // Fail open: a DB hiccup should not block legitimate users.
      console.warn(`[dbRateLimiter] DB error for ${key}:`, err?.message || err);
    }

    next();
  };
}
