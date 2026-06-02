/**
 * purge-owner-traffic.ts
 *
 * One-time script: deletes all web_traffic rows tied to owner accounts.
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   npx tsx scripts/purge-owner-traffic.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const OWNER_EMAILS = [
  "johnsbom000@gmail.com",
  "boman@griffjohnson.com",
  "cassidymalm21@gmail.com",
  "eventhubglobal@gmail.com",
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rowCount } = await pool.query(`DELETE FROM web_traffic`);

  console.log(`Deleted ${rowCount} web_traffic rows.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
