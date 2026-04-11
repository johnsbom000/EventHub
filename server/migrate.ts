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
  const migrationsDir = path.resolve(__dirname, "../migrations");
  return readdirSync(migrationsDir)
    .filter((file) => /^00\d+_.*\.ts$/.test(file) || /^00\d+_.*\.js$/.test(file))
    .sort()
    .map((file) => path.join(migrationsDir, file));
}

async function run(): Promise<void> {
  console.log("[migrate] Starting migration runner…");

  await ensureHistoryTable();
  const applied = await getAppliedMigrations();

  const files = getMigrationFiles();
  const pending = files.filter((file) => !applied.has(path.basename(file)));

  if (pending.length === 0) {
    console.log("[migrate] All migrations are up to date.");
    await pool.end();
    return;
  }

  console.log(`[migrate] ${pending.length} pending migration(s):`);
  for (const file of pending) {
    console.log(`  • ${path.basename(file)}`);
  }

  for (const file of pending) {
    const name = path.basename(file);
    console.log(`[migrate] Running: ${name}`);
    try {
      // Dynamic import works for both .ts (tsx) and compiled .js (node).
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.up !== "function") {
        throw new Error(`Migration ${name} does not export an 'up' function.`);
      }
      await mod.up();
      await recordMigration(name);
      console.log(`[migrate] ✓ ${name}`);
    } catch (error: any) {
      console.error(`[migrate] ✗ ${name} FAILED:`, error?.message ?? error);
      console.error(error?.stack);
      await pool.end();
      process.exit(1);
    }
  }

  console.log("[migrate] All migrations applied successfully.");
  await pool.end();
}

run().catch((error) => {
  console.error("[migrate] Fatal error:", error);
  process.exit(1);
});
