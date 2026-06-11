import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add users.vendor_intent_pending — a one-shot flag for customers who tried to
 * become vendors under the old flow (which required completing full onboarding
 * before a vendor account existed) and were left as plain customers.
 *
 * When true, the next sign-in redirects the user to /vendor/provision (the
 * "What's your business called?" page) and the flag is cleared immediately —
 * the redirect never fires twice. Defaults to false for everyone; it is only
 * ever set manually for specific re-engagement targets, so no other user's
 * sign-in behavior changes.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS vendor_intent_pending boolean NOT NULL DEFAULT false
  `);

  console.log("[0127] users.vendor_intent_pending added (default false).");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      DROP COLUMN IF EXISTS vendor_intent_pending
  `);

  console.log("[0127] down: users.vendor_intent_pending dropped.");
}
