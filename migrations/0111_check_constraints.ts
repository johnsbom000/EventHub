import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds non-empty CHECK constraints on the two polymorphic ID columns that cannot
 * have true FK constraints (they reference either users or vendor_accounts depending
 * on the sender/recipient type). At minimum this prevents blank-string IDs.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE messages
    ADD CONSTRAINT messages_sender_id_nonempty CHECK (sender_id <> '')
  `);

  await db.execute(sql`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_recipient_id_nonempty CHECK (recipient_id <> '')
  `);

  console.log("[0111] added non-empty CHECK constraints on messages.sender_id and notifications.recipient_id");
}

export async function down() {
  await db.execute(sql`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_nonempty`);
  await db.execute(sql`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_recipient_id_nonempty`);
}
