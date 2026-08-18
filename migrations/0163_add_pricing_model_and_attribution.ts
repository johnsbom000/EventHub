import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Commission pricing test (Modal A vs Modal B).
 *
 * pricing_model decides how a vendor is monetized and is set ONCE at provision
 * from a PostHog assignment. 'subscription' = today's freemium + Pro model.
 * 'commission' = no subscription, no tiers, full feature access, 8% vendor fee.
 * The two are mutually exclusive: a vendor can never switch or opt into the
 * other. Existing vendors default to 'subscription', so nothing changes for them.
 *
 * landing_style / utm_* / fbclid record which Meta ad produced the vendor, so ad
 * spend can be reconciled against signups per pricing model. Nothing captured
 * vendor-level ad attribution before this.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS pricing_model text NOT NULL DEFAULT 'subscription',
      ADD COLUMN IF NOT EXISTS landing_style text,
      ADD COLUMN IF NOT EXISTS utm_source text,
      ADD COLUMN IF NOT EXISTS utm_medium text,
      ADD COLUMN IF NOT EXISTS utm_campaign text,
      ADD COLUMN IF NOT EXISTS utm_content text,
      ADD COLUMN IF NOT EXISTS fbclid text
  `);
  console.log("[0163] vendor_accounts pricing_model + ad attribution columns added.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS pricing_model,
      DROP COLUMN IF EXISTS landing_style,
      DROP COLUMN IF EXISTS utm_source,
      DROP COLUMN IF EXISTS utm_medium,
      DROP COLUMN IF EXISTS utm_campaign,
      DROP COLUMN IF EXISTS utm_content,
      DROP COLUMN IF EXISTS fbclid
  `);
  console.log("[0163] down: pricing_model + attribution columns dropped.");
}
