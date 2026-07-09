import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  // bookings
  await db.execute(sql`
    create index if not exists idx_bookings_customer_id
      on bookings (customer_id);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_vendor_account_id
      on bookings (vendor_account_id);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_listing_id
      on bookings (listing_id)
      where listing_id is not null;
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_status
      on bookings (status);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_booking_start_at
      on bookings (booking_start_at)
      where booking_start_at is not null;
  `);

  // payments
  await db.execute(sql`
    drop index if exists idx_payments_stripe_payment_intent;
  `);

  // NOTE: this migration originally created a single-column UNIQUE index on
  // payments.stripe_payment_intent_id here. That was wrong — one PaymentIntent
  // legitimately maps to multiple payment rows (booking + security_deposit),
  // and the unique index made onConflictDoNothing() silently swallow deposit
  // rows on fresh databases. The block was removed (see migration 0143, which
  // also drops the index on any database that already built it). Uniqueness is
  // the composite idx_payments_pi_type_unique on (stripe_payment_intent_id,
  // payment_type).

  await db.execute(sql`
    create index if not exists idx_payments_booking_id
      on payments (booking_id);
  `);

  await db.execute(sql`
    create index if not exists idx_payments_vendor_account_id
      on payments (vendor_account_id)
      where vendor_account_id is not null;
  `);

  // listing_traffic
  await db.execute(sql`
    create index if not exists idx_listing_traffic_listing_event_time
      on listing_traffic (listing_id, event_type, occurred_at desc);
  `);

  // messages
  await db.execute(sql`
    create index if not exists idx_messages_booking_id
      on messages (booking_id, created_at asc);
  `);

  // notifications
  await db.execute(sql`
    create index if not exists idx_notifications_recipient
      on notifications (recipient_id, recipient_type, read, created_at desc);
  `);
}

export async function down() {
  await db.execute(sql`
    drop index if exists idx_notifications_recipient;
  `);

  await db.execute(sql`
    drop index if exists idx_messages_booking_id;
  `);

  await db.execute(sql`
    drop index if exists idx_listing_traffic_listing_event_time;
  `);

  await db.execute(sql`
    drop index if exists idx_payments_vendor_account_id;
  `);

  await db.execute(sql`
    drop index if exists idx_payments_booking_id;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_booking_start_at;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_status;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_listing_id;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_vendor_account_id;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_customer_id;
  `);
}
