import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    ALTER TABLE founding_vendor_invites
      ADD COLUMN IF NOT EXISTS redemption_count integer NOT NULL DEFAULT 0
  `);

  console.log("[0100] added redemption_count to founding_vendor_invites.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE founding_vendor_invites
      DROP COLUMN IF EXISTS redemption_count
  `);
}
