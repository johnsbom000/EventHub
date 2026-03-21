import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table bookings
      add column if not exists booked_quantity integer,
      add column if not exists delivery_fee_amount_cents integer,
      add column if not exists setup_fee_amount_cents integer,
      add column if not exists travel_fee_amount_cents integer,
      add column if not exists logistics_total_cents integer,
      add column if not exists base_subtotal_cents integer,
      add column if not exists subtotal_amount_cents integer,
      add column if not exists customer_fee_amount_cents integer;
  `);

  await db.execute(sql`
    with booking_item_quantities as (
      select
        bi.booking_id,
        greatest(1, sum(greatest(coalesce(bi.quantity, 1), 1)))::int as booked_quantity
      from booking_items bi
      group by bi.booking_id
    )
    update bookings b
    set booked_quantity = booking_item_quantities.booked_quantity
    from booking_item_quantities
    where b.id = booking_item_quantities.booking_id
      and (b.booked_quantity is null or b.booked_quantity < 1);
  `);

  await db.execute(sql`
    update bookings
    set booked_quantity = 1
    where booked_quantity is null or booked_quantity < 1;
  `);

  await db.execute(sql`
    alter table bookings
      alter column booked_quantity set default 1;
  `);

  await db.execute(sql`
    alter table bookings
      alter column booked_quantity set not null;
  `);

  await db.execute(sql`
    with item_fee_totals as (
      select
        bi.booking_id,
        sum(
          case
            when coalesce(bi.item_data #>> '{logisticsFees,deliveryFeeCents}', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
              then greatest(0, floor((bi.item_data #>> '{logisticsFees,deliveryFeeCents}')::numeric))::int
            else 0
          end
        )::int as delivery_fee_amount_cents,
        sum(
          case
            when coalesce(bi.item_data #>> '{logisticsFees,setupFeeCents}', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
              then greatest(0, floor((bi.item_data #>> '{logisticsFees,setupFeeCents}')::numeric))::int
            else 0
          end
        )::int as setup_fee_amount_cents,
        sum(
          case
            when coalesce(bi.item_data #>> '{logisticsFees,travelFlatFeeCents}', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
              then greatest(0, floor((bi.item_data #>> '{logisticsFees,travelFlatFeeCents}')::numeric))::int
            when coalesce(bi.item_data #>> '{logisticsFees,travelFeeCents}', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
              then greatest(0, floor((bi.item_data #>> '{logisticsFees,travelFeeCents}')::numeric))::int
            else 0
          end
        )::int as travel_fee_amount_cents
      from booking_items bi
      group by bi.booking_id
    )
    update bookings b
    set
      delivery_fee_amount_cents = case
        when b.delivery_fee_amount_cents is null and item_fee_totals.delivery_fee_amount_cents > 0
          then item_fee_totals.delivery_fee_amount_cents
        else b.delivery_fee_amount_cents
      end,
      setup_fee_amount_cents = case
        when b.setup_fee_amount_cents is null and item_fee_totals.setup_fee_amount_cents > 0
          then item_fee_totals.setup_fee_amount_cents
        else b.setup_fee_amount_cents
      end,
      travel_fee_amount_cents = case
        when b.travel_fee_amount_cents is null and item_fee_totals.travel_fee_amount_cents > 0
          then item_fee_totals.travel_fee_amount_cents
        else b.travel_fee_amount_cents
      end
    from item_fee_totals
    where b.id = item_fee_totals.booking_id;
  `);

  await db.execute(sql`
    update bookings
    set base_subtotal_cents = unit_price_cents_snapshot * booked_quantity
    where base_subtotal_cents is null
      and coalesce(unit_price_cents_snapshot, 0) > 0
      and coalesce(booked_quantity, 0) > 0;
  `);

  await db.execute(sql`
    with item_base_totals as (
      select
        bi.booking_id,
        sum(
          case
            when coalesce(bi.quantity, 0) > 0 and coalesce(bi.unit_price_cents, 0) > 0
              then bi.quantity * bi.unit_price_cents
            else 0
          end
        )::int as base_subtotal_cents
      from booking_items bi
      group by bi.booking_id
    )
    update bookings b
    set base_subtotal_cents = item_base_totals.base_subtotal_cents
    from item_base_totals
    where b.id = item_base_totals.booking_id
      and b.base_subtotal_cents is null
      and item_base_totals.base_subtotal_cents > 0;
  `);

  await db.execute(sql`
    update bookings
    set subtotal_amount_cents = platform_fee + vendor_payout
    where subtotal_amount_cents is null
      and platform_fee is not null
      and vendor_payout is not null
      and platform_fee >= 0
      and vendor_payout >= 0
      and (platform_fee + vendor_payout) > 0
      and not (coalesce(total_amount, 0) >= 10000 and (platform_fee + vendor_payout) < 1000)
      and (
        total_amount is null
        or total_amount <= 0
        or (platform_fee + vendor_payout) <= total_amount
      );
  `);

  await db.execute(sql`
    update bookings
    set logistics_total_cents =
      coalesce(delivery_fee_amount_cents, 0) +
      coalesce(setup_fee_amount_cents, 0) +
      coalesce(travel_fee_amount_cents, 0)
    where logistics_total_cents is null
      and (
        delivery_fee_amount_cents is not null
        or setup_fee_amount_cents is not null
        or travel_fee_amount_cents is not null
      );
  `);

  await db.execute(sql`
    update bookings
    set logistics_total_cents = subtotal_amount_cents - base_subtotal_cents
    where logistics_total_cents is null
      and subtotal_amount_cents is not null
      and base_subtotal_cents is not null
      and subtotal_amount_cents >= base_subtotal_cents;
  `);

  await db.execute(sql`
    update bookings
    set subtotal_amount_cents = base_subtotal_cents + logistics_total_cents
    where subtotal_amount_cents is null
      and base_subtotal_cents is not null
      and logistics_total_cents is not null;
  `);

  await db.execute(sql`
    update bookings
    set customer_fee_amount_cents = total_amount - subtotal_amount_cents
    where customer_fee_amount_cents is null
      and total_amount is not null
      and subtotal_amount_cents is not null
      and total_amount >= subtotal_amount_cents;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table bookings
      drop column if exists customer_fee_amount_cents,
      drop column if exists subtotal_amount_cents,
      drop column if exists base_subtotal_cents,
      drop column if exists logistics_total_cents,
      drop column if exists travel_fee_amount_cents,
      drop column if exists setup_fee_amount_cents,
      drop column if exists delivery_fee_amount_cents,
      drop column if exists booked_quantity;
  `);
}
