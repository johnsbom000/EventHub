import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Application-wide structured logger.
 *
 * Development: pretty-printed, colorized output via pino-pretty.
 * Production:  JSON lines to stdout — Railway and most log aggregators
 *              parse these automatically.
 *
 * Log level can be overridden at runtime via the LOG_LEVEL env var.
 * Defaults: "debug" in development, "info" in production.
 */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
    // In production, serialize Error objects under the "err" key automatically.
    serializers: {
      err: pino.stdSerializers.err,
    },
  },
  isDev
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname",
        },
      })
    : undefined
);
