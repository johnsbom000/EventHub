import { db } from "../server/db";
import { sql } from "drizzle-orm";

export async function up() {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS vendor_only_signup boolean NOT NULL DEFAULT false;
  `);
}
