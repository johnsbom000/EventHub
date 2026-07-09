/**
 * server/migrate.ts
 *
 * Custom migration runner for EventHub's hand-rolled TypeScript migrations.
 * Drizzle-kit only handles SQL migrations — it ignores the *.ts files in
 * /migrations. This script fills that gap.
 *
 * Algorithm:
 *  1. Connect to the database using the same pool as the app.
 *  2. Create `_migration_history` if it doesn't exist.
 *  3. Glob all migrations/00*.ts files and sort them by filename.
 *  4. Skip any already recorded in `_migration_history`.
 *  5. Run the rest in order by calling their exported `up()` function.
 *  6. Record each successful migration.
 *
 * Usage:
 *   npx tsx server/migrate.ts           (local, reads .env automatically)
 *   NODE_ENV=production node dist/migrate.js  (production — compiled by build)
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the repo root when running locally.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { logger } from "./lib/logger.js";
import { pool } from "./db.js";

const HISTORY_TABLE = "_migration_history";

async function ensureHistoryTable(): Promise<void> {
  await pool.query(`
    create table if not exists ${HISTORY_TABLE} (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    `select name from ${HISTORY_TABLE} order by name`
  );
  return new Set(result.rows.map((row) => row.name));
}

async function recordMigration(name: string): Promise<void> {
  await pool.query(
    `insert into ${HISTORY_TABLE} (name) values ($1) on conflict do nothing`,
    [name]
  );
}

function getMigrationFiles(): string[] {
  // In production, migrations are compiled to dist/migrations/*.js
  // In development (tsx), they are loaded as .ts from migrations/
  const isProd = process.env.NODE_ENV === "production";
  const migrationsDir = isProd
    ? path.resolve(__dirname, "./migrations")   // dist/migrations/
    : path.resolve(__dirname, "../migrations"); // repo root migrations/
  const ext = isProd ? /^\d{4}_.*\.js$/ : /^\d{4}_.*\.ts$/;
  return readdirSync(migrationsDir)
    .filter((file) => ext.test(file))
    .sort()
    .map((file) => path.join(migrationsDir, file));
}

const MAX_CONNECT_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5000;

// The migrate step runs before the app boots (Railway startCommand:
// `node dist/migrate.js && npm start`), so any failure here aborts the whole
// deploy. The Neon serverless (WebSocket) endpoint intermittently refuses a
// single connection attempt; the runner used to make exactly one and exit(1)
// on a miss, failing the deploy even though a retry moments later succeeds.
// Retry the initial connection with capped exponential backoff. Only the
// connection is retried — once the DB answers, a failing migration is still
// fatal (migrations must not be blindly re-run).
async function waitForDatabase(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await pool.query("select 1");
      if (attempt > 1) {
        logger.info(`[migrate] Database reachable after ${attempt} attempt(s).`);
      }
      return;
    } catch (error: any) {
      lastError = error;
      logger.warn(
        `[migrate] DB connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed: ${error?.message ?? error}`
      );
      if (attempt < MAX_CONNECT_ATTEMPTS) {
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  throw new Error(
    `Could not connect to the database after ${MAX_CONNECT_ATTEMPTS} attempts: ${
      (lastError as any)?.message ?? lastError
    }`
  );
}

async function run(): Promise<void> {
  logger.info("[migrate] Starting migration runner…");

  await waitForDatabase();
  await ensureHistoryTable();
  const applied = await getAppliedMigrations();

  const files = getMigrationFiles();
  const pending = files.filter((file) => !applied.has(path.basename(file)));

  if (pending.length === 0) {
    logger.info("[migrate] All migrations are up to date.");
    await pool.end();
    return;
  }

  logger.info(`[migrate] ${pending.length} pending migration(s):`);
  for (const file of pending) {
    logger.info(`  • ${path.basename(file)}`);
  }

  for (const file of pending) {
    const name = path.basename(file);
    logger.info(`[migrate] Running: ${name}`);
    try {
      // Dynamic import works for both .ts (tsx) and compiled .js (node).
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.up !== "function") {
        throw new Error(`Migration ${name} does not export an 'up' function.`);
      }
      await mod.up();
      await recordMigration(name);
      logger.info(`[migrate] ✓ ${name}`);
    } catch (error: any) {
      // Interpolate the detail into the message: pino drops a second arg that
      // isn't a format value, which previously logged the failure with no cause.
      logger.error(`[migrate] ✗ ${name} FAILED: ${error?.stack ?? error?.message ?? error}`);
      await pool.end();
      process.exit(1);
    }
  }

  logger.info("[migrate] All migrations applied successfully.");
  await pool.end();
}

run().catch((error: any) => {
  // Interpolate into the message string — pino's second argument is treated as
  // a format value and silently dropped, so the previous form logged
  // "[migrate] Fatal error:" with no detail, hiding the actual cause on deploy.
  logger.error(`[migrate] Fatal error: ${error?.stack ?? error?.message ?? error}`);
  process.exit(1);
});
