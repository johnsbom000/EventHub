import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds tracking columns for automated email jobs so each email fires exactly once.
 *
 * bookings table:
 *   - pending_reminder_6pm_sent      — vendor reminder sent at ~6pm on day of request
 *   - pending_reminder_9am_sent      — vendor reminder sent at ~9am the next morning
 *   - pending_reminder_24h_sent      — vendor reminder sent 24h after request created
 *   - event_day_reminder_sent        — 24h-before-event reminder sent (vendor + customer)
 *   - vendor_msg_email_last_sent_at  — last time an email was sent to vendor for a new message (rate limit)
 *   - customer_msg_email_last_sent_at — last time an email was sent to customer for a new message (rate limit)
 *
 * payments table:
 *   - payout_email_sent — payout processed email sent to vendor
 *
 * vendor_suspensions table:
 *   - lift_email_sent — suspension lifted email sent to vendor
 *
 * All boolean columns default false. All timestamptz columns are nullable.
 * ADD COLUMN IF NOT EXISTS is safe to re-run.
 */
export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists pending_reminder_6pm_sent boolean not null default false,
      add column if not exists pending_reminder_9am_sent boolean not null default false,
      add column if not exists pending_reminder_24h_sent boolean not null default false,
      add column if not exists event_day_reminder_sent boolean not null default false,
      add column if not exists vendor_msg_email_last_sent_at timestamptz,
      add column if not exists customer_msg_email_last_sent_at timestamptz;
  `);

  await db.execute(sql`
    alter table payments
      add column if not exists payout_email_sent boolean not null default false;
  `);

  await db.execute(sql`
    alter table vendor_suspensions
      add column if not exists lift_email_sent boolean not null default false;
  `);

  console.log("[0061] Email tracking columns added to bookings, payments, vendor_suspensions.");
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists pending_reminder_6pm_sent,
      drop column if exists pending_reminder_9am_sent,
      drop column if exists pending_reminder_24h_sent,
      drop column if exists event_day_reminder_sent,
      drop column if exists vendor_msg_email_last_sent_at,
      drop column if exists customer_msg_email_last_sent_at;
  `);

  await db.execute(sql`
    alter table payments
      drop column if exists payout_email_sent;
  `);

  await db.execute(sql`
    alter table vendor_suspensions
      drop column if exists lift_email_sent;
  `);

  console.log("[0061] Email tracking columns removed.");
}
