import { logger } from "./logger";
import { SAFE_GOOGLE_ERROR_MESSAGES } from "./constants";
import type { GoogleCalendarConnectionError } from "../google";

export function safeGoogleErrorMessage(error: GoogleCalendarConnectionError): string {
  return SAFE_GOOGLE_ERROR_MESSAGES[error.code] ?? "A Google Calendar error occurred. Please try again.";
}

export function logRouteError(route: string, error: unknown) {
  if (error instanceof Error) {
    const extra: string[] = [];
    if ((error as any).detail) extra.push(`detail: ${(error as any).detail}`);
    if ((error as any).code) extra.push(`code: ${(error as any).code}`);
    logger.error({ err: error, detail: (error as any).detail, code: (error as any).code }, "%s failed", route);
  } else {
    logger.error("%s failed: %s", route, String(error));
  }
}

export function respondWithInternalServerError(req: any, res: any, error: unknown) {
  const method = typeof req?.method === "string" ? req.method : "UNKNOWN";
  const routePath =
    typeof req?.originalUrl === "string" && req.originalUrl.trim().length > 0
      ? req.originalUrl
      : typeof req?.path === "string" && req.path.trim().length > 0
        ? req.path
        : "unknown_route";
  logRouteError(`${method} ${routePath}`, error);
  return res.status(500).json({ error: "Internal server error" });
}

/** Returns the public-facing app URL used in email links.
 *  APP_URL is the frontend origin (correct in all envs).
 *  Falls back to SERVER_URL for backwards compatibility in production
 *  where both are the same domain. */
export function appUrl(): string {
  return (process.env.APP_URL || process.env.SERVER_URL || "http://localhost:5173").replace(/\/$/, "");
}

export function formatCentsAsDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

// Drizzle's sql template doesn't serialize JS arrays to PostgreSQL text[]
// format. Convert explicitly: ['a','b'] → '{"a","b"}'
export function toPgTextArray(arr: string[]): string {
  if (arr.length === 0) return '{}';
  return `{${arr.map(s => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',')}}`;
}
