import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Records WHICH version of the Terms a user accepted, and WHEN.
 *
 * Before this, acceptance was a checkbox that only enabled a button — the value
 * never left the browser and no column stored it. Nothing in the database showed
 * that any user had ever agreed to anything, which makes the arbitration clause,
 * the class-action waiver, the $100 liability cap and any future fee change hard
 * to enforce.
 *
 * DELIBERATELY NOT BACKFILLED. Every existing row stays NULL, meaning "never
 * accepted anything on record". Stamping a version onto historical accounts
 * would be manufacturing evidence of an event we cannot actually attest to — we
 * do not know what text those users saw or when. NULL is the honest answer, and
 * it is also the safe one: `hasAcceptedCurrentTerms(null)` is false, so any
 * re-acceptance prompt built later will correctly catch these accounts.
 *
 * This is low-risk for the existing cohort specifically because they are all
 * fee-exempt (migration 0164) — the fee change they never accepted does not
 * apply to them. It matters for everyone who signs up after this deploys.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS terms_version_accepted text,
      ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS terms_version_accepted text,
      ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz
  `);
  console.log("[0165] terms acceptance columns added to vendor_accounts + users (not backfilled, by design).");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS terms_version_accepted,
      DROP COLUMN IF EXISTS terms_accepted_at
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      DROP COLUMN IF EXISTS terms_version_accepted,
      DROP COLUMN IF EXISTS terms_accepted_at
  `);
  console.log("[0165] down: terms acceptance columns dropped.");
}
