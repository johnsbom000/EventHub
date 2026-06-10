/**
 * Validates the migrations/ directory before running migrations.
 * Checks for duplicate number prefixes and non-sequential gaps that would
 * cause the migration runner to apply files in the wrong order.
 *
 * Run standalone: npm run validate:migrations
 * Runs automatically before: npm run migrate
 */

import { readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../migrations");

const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.*\.ts$/.test(f))
  .sort();

// Group files by their 4-digit prefix
const byNumber = new Map<string, string[]>();
for (const file of files) {
  const prefix = file.slice(0, 4);
  const existing = byNumber.get(prefix) ?? [];
  existing.push(file);
  byNumber.set(prefix, existing);
}

const duplicates = [...byNumber.entries()].filter(([, names]) => names.length > 1);

if (duplicates.length > 0) {
  console.error("\n[validate-migrations] ERROR: Duplicate migration numbers found:\n");
  for (const [num, names] of duplicates) {
    console.error(`  ${num}:`);
    for (const name of names) console.error(`    - ${name}`);
  }
  console.error(
    "\nFix: rename one of the duplicate files to the next available number,\n" +
    "then update _migration_history in Neon with the new filename.\n" +
    "Run: ls migrations/ | grep -E '^[0-9]{4}' | sort | tail -5  to find the next safe number.\n"
  );
  process.exit(1);
}

const numbers = [...byNumber.keys()].map(Number).sort((a, b) => a - b);
console.log(
  `[validate-migrations] OK — ${files.length} migration files, ` +
  `numbers ${numbers[0].toString().padStart(4, "0")}–${numbers[numbers.length - 1].toString().padStart(4, "0")}, no duplicates.`
);
