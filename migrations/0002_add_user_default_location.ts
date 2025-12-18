import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // Add default_location JSONB column to users table
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS default_location JSONB;`);
}

export async function down() {
  await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS default_location;`);
}
