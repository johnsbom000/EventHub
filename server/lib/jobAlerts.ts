import * as Sentry from "@sentry/node";
import { logger } from "./logger";

/**
 * Centralized error capture for background jobs and webhook handlers.
 *
 * Every background worker and webhook handler catches its own errors and, until
 * now, only `logger.warn`ed (pino → stdout) — nothing reached Sentry even though
 * `Sentry.init` runs in `server/index.ts`. This helper unifies both sinks:
 *
 *   1. A structured `logger.error` line carrying the `jobName` and any context,
 *      so the failure is greppable in Railway/stdout log aggregators.
 *   2. `Sentry.captureException`, tagged by `jobName` so failures are alertable
 *      and groupable in Sentry.
 *
 * Safe no-op for Sentry when `SENTRY_DSN` is unset — `Sentry.init` was called
 * with `enabled: false` in that case, so `captureException` does nothing. The
 * structured log line is always emitted.
 */
export function captureJobError(
  jobName: string,
  err: unknown,
  context?: Record<string, unknown>
): void {
  logger.error({ err, jobName, ...context }, `Job/webhook failure: ${jobName}`);
  Sentry.captureException(err, {
    tags: { jobName },
    extra: context,
  });
}
