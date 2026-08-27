import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Records when a user was sent the founder-greeting email (the personal note
 * from Bo offering a phone call), so it can never be sent to the same person
 * twice — by the one-off batch script, a future on-signup trigger, or both
 * running over the same cohort.
 *
 * NULL means "never sent". Senders must check this column before sending and
 * stamp it immediately after a successful send. The historical recipients of
 * the 2026-08-27 batch are stamped by the batch script's --mark-sent flags,
 * not here — a migration should not encode a recipient list.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS founder_greeting_sent_at timestamptz
  `);
  console.log("[0167] founder_greeting_sent_at column added to users.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      DROP COLUMN IF EXISTS founder_greeting_sent_at
  `);
  console.log("[0167] down: founder_greeting_sent_at dropped.");
}
