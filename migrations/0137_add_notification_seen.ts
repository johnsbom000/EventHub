import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add notifications.seen — whether the recipient has *seen* (glanced at) a
 * notification, as distinct from having *read* (opened/dismissed) it.
 *
 * The sidebar count badge previously derived "unread" from the `read` flag but
 * was only ever cleared client-side via a localStorage baseline. That baseline
 * is per-device and wiped on logout, so the badge reappeared on reload or a
 * fresh login even though the user had already looked at their notifications.
 *
 * Moving the badge's source of truth to the server `seen` column makes it
 * survive reloads/logins: opening the notifications page marks everything seen,
 * and the badge only returns when a genuinely new (unseen) notification arrives.
 * `read` stays independent — users still mark individual notifications read by
 * clicking them.
 *
 * Backfill: existing already-read notifications are treated as seen so the badge
 * doesn't resurface things the user has clearly already handled.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS; backfill is naturally re-runnable.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS notifications
      ADD COLUMN IF NOT EXISTS seen boolean NOT NULL DEFAULT false
  `);

  await db.execute(sql`
    UPDATE notifications SET seen = true WHERE read = true AND seen = false
  `);

  console.log("[0137] notifications.seen added (default false; backfilled seen = read).");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS notifications
      DROP COLUMN IF EXISTS seen
  `);

  console.log("[0137] down: notifications.seen dropped.");
}
