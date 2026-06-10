import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_profiles
      ADD COLUMN IF NOT EXISTS gallery_photos text[] NOT NULL DEFAULT '{}';
  `);
  console.log("[0119] Added gallery_photos column to vendor_profiles");
}
