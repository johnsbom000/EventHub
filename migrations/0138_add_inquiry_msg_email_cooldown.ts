import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add per-inquiry email cooldown timestamps to vendor_inquiries, mirroring the
 * booking-channel cooldown columns on bookings (vendor_msg_email_last_sent_at /
 * customer_msg_email_last_sent_at).
 *
 * These rate-limit the "new message" email sent when a customer or vendor posts
 * in a pre-booking inquiry channel, so a back-and-forth chat doesn't trigger an
 * email on every message. NULL means no email has been sent yet.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_inquiries
      ADD COLUMN IF NOT EXISTS vendor_msg_email_last_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS customer_msg_email_last_sent_at timestamptz
  `);

  console.log("[0138] vendor_inquiries msg-email cooldown columns added (nullable).");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_inquiries
      DROP COLUMN IF EXISTS vendor_msg_email_last_sent_at,
      DROP COLUMN IF EXISTS customer_msg_email_last_sent_at
  `);

  console.log("[0138] down: vendor_inquiries msg-email cooldown columns dropped.");
}
