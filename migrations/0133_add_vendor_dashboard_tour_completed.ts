import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add vendor_accounts.dashboard_tour_completed_at — the moment a vendor finished
 * (or dismissed) the one-time onboarding tour shown on their first dashboard visit.
 * NULL means they have not completed it yet.
 *
 * Replaces the per-page seen_tour_keys model (migration 0128) for triggering the
 * tour. The seen_tour_keys column is left in place but dormant — no longer read or
 * written — to avoid migration churn.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS dashboard_tour_completed_at timestamptz
  `);

  console.log("[0133] vendor_accounts.dashboard_tour_completed_at added (nullable).");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS dashboard_tour_completed_at
  `);

  console.log("[0133] down: vendor_accounts.dashboard_tour_completed_at dropped.");
}
