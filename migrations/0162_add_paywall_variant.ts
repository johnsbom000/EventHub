import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Paywall A/B test (reverse-trial experiment). The day-21/day-30 "keep Pro" modal
 * is shown in one of several visual/persuasion variants (1a–1e), assigned
 * independently of the landing-page variant via a PostHog multivariate flag.
 *
 * The resolved variant is persisted here (set once, sticky) so the admin
 * reverse-trial dashboard can break card-capture rate down per variant. NULL =
 * not yet assigned (e.g. vendor never opened the modal, or PostHog not loaded).
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS paywall_variant text
  `);
  console.log("[0162] vendor_accounts.paywall_variant added.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS paywall_variant
  `);
  console.log("[0162] down: vendor_accounts.paywall_variant dropped.");
}
