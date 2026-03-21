import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    create index if not exists idx_bookings_listing_window_active_quantity
    on bookings (listing_id, booking_start_at, booking_end_at, booked_quantity)
    where status <> 'cancelled';
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'bookings_booked_quantity_positive_check'
      ) then
        alter table bookings
          add constraint bookings_booked_quantity_positive_check
          check (booked_quantity >= 1) not valid;
      end if;
    end $$;
  `);

  await db.execute(sql`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'bookings_snapshot_amounts_nonnegative_check'
      ) then
        alter table bookings
          add constraint bookings_snapshot_amounts_nonnegative_check
          check (
            (delivery_fee_amount_cents is null or delivery_fee_amount_cents >= 0)
            and (setup_fee_amount_cents is null or setup_fee_amount_cents >= 0)
            and (travel_fee_amount_cents is null or travel_fee_amount_cents >= 0)
            and (logistics_total_cents is null or logistics_total_cents >= 0)
            and (base_subtotal_cents is null or base_subtotal_cents >= 0)
            and (subtotal_amount_cents is null or subtotal_amount_cents >= 0)
            and (customer_fee_amount_cents is null or customer_fee_amount_cents >= 0)
          ) not valid;
      end if;
    end $$;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_snapshot_amounts_nonnegative_check;
  `);

  await db.execute(sql`
    alter table bookings
      drop constraint if exists bookings_booked_quantity_positive_check;
  `);

  await db.execute(sql`
    drop index if exists idx_bookings_listing_window_active_quantity;
  `);
}
