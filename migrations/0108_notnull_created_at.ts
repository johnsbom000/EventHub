import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Hardens created_at on 9 tables that define it as defaultNow() but without NOT NULL.
 * Any insert that explicitly passed null would have silently succeeded. This backfills
 * any existing null rows (defensive) then enforces the constraint going forward.
 */
export async function up() {
  const tables = [
    "events",
    "vendor_accounts",
    "vendor_profiles",
    "vendor_listings",
    "bookings",
    "messages",
    "payments",
    "notifications",
    "review_replies",
  ];

  for (const table of tables) {
    await db.execute(
      sql.raw(`UPDATE ${table} SET created_at = NOW() WHERE created_at IS NULL`)
    );
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ALTER COLUMN created_at SET NOT NULL`)
    );
  }

  console.log("[0108] created_at set NOT NULL on 9 tables");
}

export async function down() {
  const tables = [
    "events",
    "vendor_accounts",
    "vendor_profiles",
    "vendor_listings",
    "bookings",
    "messages",
    "payments",
    "notifications",
    "review_replies",
  ];

  for (const table of tables) {
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ALTER COLUMN created_at DROP NOT NULL`)
    );
  }
}
