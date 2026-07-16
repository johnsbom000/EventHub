import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Tracks whether the pre-expiry reminder emails have been sent for a vendor's
 * current comp grant, so the daily comp-expiry reminder job (7 days before and 1
 * day before comp_ends_at) never double-sends. Both are reset to NULL whenever a
 * new comp grant is issued, so a re-granted comp gets a fresh set of reminders.
 *
 * The worker_locks row for the job self-seeds on first acquire (see
 * server/lib/workerLocks.ts), so no lock seed is needed here.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS comp_reminder_7d_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS comp_reminder_1d_sent_at timestamptz
  `);

  console.log("[0154] vendor_accounts comp reminder tracking columns added.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS comp_reminder_7d_sent_at,
      DROP COLUMN IF EXISTS comp_reminder_1d_sent_at
  `);

  console.log("[0154] down: comp reminder tracking columns dropped.");
}
