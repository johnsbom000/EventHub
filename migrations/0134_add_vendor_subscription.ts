import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Vendor Pro subscription (freemium + paid Pro) state on vendor_accounts.
 *
 * Free tier = 1 active listing, no analytics, no Google Calendar sync.
 * Pro ($29/mo or $290/yr) = unlimited listings + analytics + calendar sync.
 *
 * Billing is via Stripe Billing and is entirely separate from the Connect payout
 * account (stripe_connect_id). subscription_status mirrors Stripe's subscription
 * status, plus a local-only 'comp' value for complimentary grants (no card).
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS subscription_plan text NOT NULL DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
      ADD COLUMN IF NOT EXISTS stripe_price_id text,
      ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
      ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS comp_ends_at timestamptz,
      ADD COLUMN IF NOT EXISTS subscription_updated_at timestamptz
  `);

  // One Stripe subscription per vendor account (partial: only enforced when set).
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_stripe_subscription_id_unique_idx
      ON vendor_accounts (stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL
  `);

  console.log("[0134] vendor_accounts subscription columns + stripe_subscription_id unique index added.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_stripe_subscription_id_unique_idx`);
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS subscription_plan,
      DROP COLUMN IF EXISTS subscription_status,
      DROP COLUMN IF EXISTS stripe_subscription_id,
      DROP COLUMN IF EXISTS stripe_price_id,
      DROP COLUMN IF EXISTS subscription_current_period_end,
      DROP COLUMN IF EXISTS subscription_cancel_at_period_end,
      DROP COLUMN IF EXISTS comp_ends_at,
      DROP COLUMN IF EXISTS subscription_updated_at
  `);

  console.log("[0134] down: vendor_accounts subscription columns + index dropped.");
}
