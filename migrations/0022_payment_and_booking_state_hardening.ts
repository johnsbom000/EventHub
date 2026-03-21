import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    do $$
    begin
      alter type booking_status add value if not exists 'failed';
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      alter type booking_status add value if not exists 'expired';
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      alter type payment_status add value if not exists 'failed';
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      alter type payment_status add value if not exists 'disputed';
    exception
      when duplicate_object then null;
    end $$;
  `);

  await db.execute(sql`
    create index if not exists idx_payments_stripe_payment_intent
    on payments (stripe_payment_intent_id);
  `);

  await db.execute(sql`
    create index if not exists idx_payment_schedules_booking_type_status
    on payment_schedules (booking_id, payment_type, status);
  `);

  await db.execute(sql`
    create index if not exists idx_bookings_pending_payment_expiry
    on bookings (created_at)
    where status in ('pending', 'confirmed')
      and payment_status = 'pending';
  `);
}

export async function down() {
  // Enum values are intentionally not removed during down-migrations.
  await db.execute(sql`
    drop index if exists idx_bookings_pending_payment_expiry;
  `);

  await db.execute(sql`
    drop index if exists idx_payment_schedules_booking_type_status;
  `);

  await db.execute(sql`
    drop index if exists idx_payments_stripe_payment_intent;
  `);
}
