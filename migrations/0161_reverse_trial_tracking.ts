import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Reverse-Trial Experiment ("make vendors pay to keep what they use").
 *
 * Every new vendor is auto-enrolled in a card-free 30-day Pro trial at provision
 * (a Stripe `trialing` subscription created via createNoCardTrialSubscription).
 * At day 21 we prompt for a card in-app; at day 30 Stripe either charges the card
 * (→ paying Pro) or cancels the trial (→ downgrade to the free "Starter" tier).
 *
 * This migration:
 *  1. Ends the 180-day launch comp campaign so the day-30 pay-or-downgrade
 *     decision is real (tryGrantCampaignComp already no-ops when active=false).
 *     Existing comp grants are left to expire naturally — we do not revoke Pro
 *     from vendors already promised 180 days.
 *  2. Adds reverse-trial tracking columns to vendor_accounts:
 *     - reverse_trial_started_at: cohort marker + 30-day clock anchor. Set when
 *       the vendor was auto-enrolled at provision. Distinguishes reverse-trial
 *       vendors from any other trialing subscription.
 *     - reverse_trial_card_prompt_sent_at: stamped when the day-21 "add a card"
 *       email/notification is sent, so the daily worker never double-sends.
 *     - reverse_trial_card_captured_at: stamped when the vendor adds a card via
 *       the in-app SetupIntent flow (setup_intent.succeeded webhook). Drives the
 *       card-capture-rate metric and hides the day-21 prompt.
 *
 * Idempotent: UPDATE is null/flag-guarded; ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  // 1. End the launch comp campaign (no-op if the row is missing or already off).
  const campaign = await db.execute(sql`
    UPDATE comp_campaigns
    SET active = false
    WHERE key = 'launch_2026' AND active = true
  `);

  // 2. Reverse-trial tracking columns.
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS reverse_trial_started_at timestamptz,
      ADD COLUMN IF NOT EXISTS reverse_trial_card_prompt_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS reverse_trial_card_captured_at timestamptz
  `);

  console.log(
    `[0161] reverse-trial columns added; launch_2026 comp campaign ` +
      `deactivated (${(campaign as any)?.rowCount ?? 0} row updated).`
  );
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS reverse_trial_started_at,
      DROP COLUMN IF EXISTS reverse_trial_card_prompt_sent_at,
      DROP COLUMN IF EXISTS reverse_trial_card_captured_at
  `);
  // Note: we intentionally do NOT re-activate the launch_2026 campaign on down —
  // reversing the schema shouldn't silently resume granting comps.
  console.log("[0161] down: reverse-trial columns dropped.");
}
