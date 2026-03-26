#!/usr/bin/env node
import * as dotenv from 'dotenv';
dotenv.config();

const target = process.argv[2];
if (!target) {
  console.error('Usage: npx tsx scripts/run-single-migration.ts <migration-file>');
  process.exit(1);
}

const migration = await import(`../migrations/${target}`);
if (typeof migration.up !== 'function') {
  console.error(`Migration ${target} is missing an up() export`);
  process.exit(1);
}

console.log(`Running ${target}...`);
await migration.up();
console.log('Done.');
process.exit(0);
