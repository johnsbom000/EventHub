import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Improve type safety on messages and notifications:
 *
 * 1. Add message_sender_type enum ('customer' | 'vendor') and apply to
 *    messages.sender_type (was unconstrained text).
 * 2. Add notification_recipient_type enum ('customer' | 'vendor') and apply to
 *    notifications.recipient_type (was unconstrained text).
 * 3. Make messages.read and notifications.read NOT NULL — both had a default
 *    of false but were nullable, meaning NULL reads were indistinguishable from
 *    unread.
 *
 * Safe to run against production:
 * - Non-conforming sender_type / recipient_type values are backfilled to 'customer'
 *   before the type cast.
 * - NULL read values are backfilled to false before the NOT NULL constraint.
 */
export async function up() {
  // 1. Create enum types (idempotent)
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE message_sender_type AS ENUM ('customer', 'vendor');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE notification_recipient_type AS ENUM ('customer', 'vendor');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 2. Backfill non-conforming sender_type values
  await db.execute(sql`
    UPDATE messages
    SET sender_type = 'customer'
    WHERE sender_type NOT IN ('customer', 'vendor');
  `);

  // 3. Backfill non-conforming recipient_type values
  await db.execute(sql`
    UPDATE notifications
    SET recipient_type = 'customer'
    WHERE recipient_type NOT IN ('customer', 'vendor');
  `);

  // 4. Apply enum to messages.sender_type
  await db.execute(sql`
    ALTER TABLE messages
      ALTER COLUMN sender_type TYPE message_sender_type
      USING sender_type::message_sender_type;
  `);

  // 5. Apply enum to notifications.recipient_type
  await db.execute(sql`
    ALTER TABLE notifications
      ALTER COLUMN recipient_type TYPE notification_recipient_type
      USING recipient_type::notification_recipient_type;
  `);

  // 6. Backfill NULL read values before making NOT NULL
  await db.execute(sql`
    UPDATE messages SET read = false WHERE read IS NULL;
  `);

  await db.execute(sql`
    UPDATE notifications SET read = false WHERE read IS NULL;
  `);

  // 7. Enforce NOT NULL
  await db.execute(sql`
    ALTER TABLE messages ALTER COLUMN read SET NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE notifications ALTER COLUMN read SET NOT NULL;
  `);

  console.log("[0036] message_sender_type / notification_recipient_type enums applied; read columns made NOT NULL.");
}

export async function down() {
  await db.execute(sql`ALTER TABLE notifications ALTER COLUMN read DROP NOT NULL;`);
  await db.execute(sql`ALTER TABLE messages ALTER COLUMN read DROP NOT NULL;`);

  await db.execute(sql`
    ALTER TABLE notifications
      ALTER COLUMN recipient_type TYPE text
      USING recipient_type::text;
  `);

  await db.execute(sql`
    ALTER TABLE messages
      ALTER COLUMN sender_type TYPE text
      USING sender_type::text;
  `);
}
