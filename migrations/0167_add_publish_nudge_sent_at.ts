import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Once-only guard for the "your storefront is empty" publish nudge.
 *
 * server/jobs/publishNudge.ts emails vendors who signed up but never published
 * an active listing. This column is what stops it emailing the same vendor
 * every single day: the job selects `publish_nudge_sent_at IS NULL` and stamps
 * it immediately after a successful send.
 *
 * THE BACKFILL IS THE POINT, and it is the same add-with-default-then-flip
 * idiom as 0164:
 *
 *   1. ADD COLUMN ... DEFAULT now()  → every vendor that exists at deploy time
 *      is marked as already-nudged, atomically, in one statement.
 *   2. ALTER COLUMN ... DROP DEFAULT → every vendor created AFTER this point
 *      gets NULL and is therefore eligible.
 *
 * That cutover is deliberate and load-bearing for two reasons:
 *
 *   - 16 vendors were sent this exact email by hand on 2026-08-25 (see
 *     server/scripts/send_publish_nudge.ts). Their receipt lives in a local
 *     gitignored file, NOT in the database, so without this backfill the job's
 *     first tick would mail all 16 a duplicate.
 *   - Four further accounts were deliberately excluded from that send as
 *     personal contacts. Backfilling them here keeps them excluded rather than
 *     letting an automated job do what a human chose not to.
 *
 * The result is that the job only ever contacts vendors who sign up from this
 * migration onward, which is exactly the intent: automate it for NEW signups.
 *
 * A plain `UPDATE ... SET publish_nudge_sent_at = now()` would NOT be
 * idempotent: a re-run weeks later would stamp every vendor who had signed up
 * in the meantime and silently suppress the nudge for all of them. This form is
 * safe to re-run — ADD COLUMN IF NOT EXISTS is skipped and DROP DEFAULT is a
 * no-op.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ADD COLUMN IF NOT EXISTS publish_nudge_sent_at timestamptz DEFAULT now()
  `);
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      ALTER COLUMN publish_nudge_sent_at DROP DEFAULT
  `);
  console.log(
    "[0167] vendor_accounts.publish_nudge_sent_at added; existing vendors marked already-nudged, new signups eligible.",
  );
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS publish_nudge_sent_at
  `);
  console.log("[0167] down: publish_nudge_sent_at dropped.");
}
