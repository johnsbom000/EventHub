import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drop the dead vendor_accounts.seen_tour_keys column.
 *
 * Added in migration 0128 for per-page dashboard tours, it was superseded by
 * dashboard_tour_completed_at (migration 0133) and is no longer read or written
 * anywhere in server/ or client/ (verified). Removing it cleans up the widest
 * table in the schema.
 *
 * Idempotent: DROP COLUMN IF EXISTS.
 * Safe to run against: any DB. The column data is not recoverable after drop
 * (down() restores the column structure only).
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts DROP COLUMN IF EXISTS seen_tour_keys
  `);

  console.log("[0140] dropped dead column vendor_accounts.seen_tour_keys.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
      ADD COLUMN IF NOT EXISTS seen_tour_keys text[] NOT NULL DEFAULT '{}'
  `);

  console.log("[0140] down: restored vendor_accounts.seen_tour_keys (structure only).");
}
