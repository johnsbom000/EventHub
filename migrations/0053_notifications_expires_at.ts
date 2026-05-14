import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add expires_at to the notifications table.
 *
 * Notifications accumulate forever with no cleanup mechanism. Every vendor
 * and customer dashboard loads all of their notifications on open, and over
 * time this payload grows without bound.
 *
 * Strategy — soft expiry:
 *   - New notifications get expires_at = now() + 90 days.
 *   - The read query filters out expired rows.
 *   - Expired rows remain in the table for 90 days so that if a user opens
 *     a notification link during the window it still resolves. After 90 days
 *     a future cleanup job can hard-delete them (out of scope for this migration).
 *   - Existing notifications are backfilled to expires_at = created_at + 90 days,
 *     preserving their original time-to-live window.
 *
 * Safe to run against production:
 *   - ADD COLUMN with DEFAULT does not rewrite the table in PostgreSQL 11+.
 *   - Backfill UPDATE touches all existing rows once; non-blocking for small tables.
 *   - No existing rows are deleted.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS expires_at timestamptz;
  `);

  // Backfill existing rows.
  await db.execute(sql`
    UPDATE notifications
    SET expires_at = created_at + interval '90 days'
    WHERE expires_at IS NULL;
  `);

  // Set default for future inserts.
  await db.execute(sql`
    ALTER TABLE notifications
      ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');
  `);

  // Index to speed up the filtered read query.
  // Note: WHERE expires_at > now() is rejected by PostgreSQL because now() is not
  // IMMUTABLE. Using WHERE expires_at IS NOT NULL as the predicate instead — the
  // query still benefits from the index since the read filter (expires_at > now())
  // is applied over the indexed rows.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_active
      ON notifications (recipient_id, recipient_type, read, created_at DESC)
      WHERE expires_at IS NOT NULL;
  `);

  console.log("[0053] notifications.expires_at added and backfilled.");
}

export async function down() {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_notifications_recipient_active;
  `);
  await db.execute(sql`
    ALTER TABLE notifications DROP COLUMN IF EXISTS expires_at;
  `);
  console.log("[0053] down: notifications.expires_at removed.");
}
