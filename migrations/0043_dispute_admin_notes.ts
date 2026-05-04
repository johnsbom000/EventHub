import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add dispute_admin_notes table.
 *
 * Background: booking_disputes.admin_notes is a single text field — it gets
 * overwritten every time the admin saves a note. This is fine for a simple
 * resolution comment, but the admin needs a full chronological log of their
 * own notes on each case (e.g. "contacted vendor", "customer confirmed", etc.)
 * before and after resolution.
 *
 * This table stores one row per note, linked to a dispute, with a timestamp.
 * The existing admin_notes field is kept for the resolution summary. This
 * table is the running timeline.
 *
 * Safe to run against production:
 *   - CREATE TABLE IF NOT EXISTS; fully idempotent.
 *   - No existing rows modified.
 */
export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dispute_admin_notes (
      id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      dispute_id  varchar NOT NULL
                    REFERENCES booking_disputes(id) ON DELETE CASCADE,
      content     text NOT NULL,
      created_at  timestamp NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS dispute_admin_notes_dispute_id_idx
      ON dispute_admin_notes (dispute_id, created_at DESC);
  `);

  console.log("[0043] dispute_admin_notes table created.");
}

export async function down() {
  await db.execute(sql`
    DROP TABLE IF EXISTS dispute_admin_notes;
  `);
}
