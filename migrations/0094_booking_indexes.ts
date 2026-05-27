import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_bookings_customer_id
      ON bookings(customer_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_bookings_vendor_account_id
      ON bookings(vendor_account_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_bookings_status
      ON bookings(status)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_bookings_event_date
      ON bookings(event_date)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_payments_booking_id
      ON payments(booking_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_messages_booking_id
      ON messages(booking_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id
      ON notifications(recipient_id)
  `);

  console.log("[0094] added performance indexes on bookings, payments, messages, notifications");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_bookings_customer_id`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_bookings_vendor_account_id`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_bookings_status`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_bookings_event_date`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_payments_booking_id`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_messages_booking_id`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_notifications_recipient_id`);
}
