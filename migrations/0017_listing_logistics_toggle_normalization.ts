import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists pickup_offered boolean,
      add column if not exists delivery_fee_enabled boolean,
      add column if not exists setup_fee_enabled boolean;
  `);

  await db.execute(sql`
    update vendor_listings
    set
      delivery_fee_enabled = coalesce(
        case
          when lower(coalesce(nullif(btrim(coalesce(listing_data ->> 'deliveryFeeEnabled', '')), ''), nullif(btrim(coalesce(listing_data #>> '{deliverySetup,deliveryFeeEnabled}', '')), ''))) in ('true','t','1','yes','y') then true
          when lower(coalesce(nullif(btrim(coalesce(listing_data ->> 'deliveryFeeEnabled', '')), ''), nullif(btrim(coalesce(listing_data #>> '{deliverySetup,deliveryFeeEnabled}', '')), ''))) in ('false','f','0','no','n') then false
          else null
        end,
        case
          when coalesce(
            delivery_fee_amount_cents,
            case
              when coalesce(listing_data ->> 'deliveryFeeAmountCents', '') ~ '^\\s*[+-]?\\d+\\s*$'
                then greatest(0, (listing_data ->> 'deliveryFeeAmountCents')::int)
              else null
            end,
            case
              when coalesce(listing_data ->> 'deliveryFeeAmount', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
                then greatest(0, round((listing_data ->> 'deliveryFeeAmount')::numeric * 100)::int)
              when coalesce(listing_data #>> '{deliverySetup,deliveryFeeAmount}', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
                then greatest(0, round((listing_data #>> '{deliverySetup,deliveryFeeAmount}')::numeric * 100)::int)
              else null
            end,
            0
          ) > 0 then true
          else false
        end
      ),
      setup_fee_enabled = coalesce(
        case
          when lower(coalesce(nullif(btrim(coalesce(listing_data ->> 'setupFeeEnabled', '')), ''), nullif(btrim(coalesce(listing_data #>> '{deliverySetup,setupFeeEnabled}', '')), ''))) in ('true','t','1','yes','y') then true
          when lower(coalesce(nullif(btrim(coalesce(listing_data ->> 'setupFeeEnabled', '')), ''), nullif(btrim(coalesce(listing_data #>> '{deliverySetup,setupFeeEnabled}', '')), ''))) in ('false','f','0','no','n') then false
          else null
        end,
        case
          when coalesce(
            setup_fee_amount_cents,
            case
              when coalesce(listing_data ->> 'setupFeeAmountCents', '') ~ '^\\s*[+-]?\\d+\\s*$'
                then greatest(0, (listing_data ->> 'setupFeeAmountCents')::int)
              else null
            end,
            case
              when coalesce(listing_data ->> 'setupFeeAmount', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
                then greatest(0, round((listing_data ->> 'setupFeeAmount')::numeric * 100)::int)
              when coalesce(listing_data #>> '{deliverySetup,setupFeeAmount}', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
                then greatest(0, round((listing_data #>> '{deliverySetup,setupFeeAmount}')::numeric * 100)::int)
              else null
            end,
            0
          ) > 0 then true
          else false
        end
      ),
      pickup_offered = coalesce(
        case
          when lower(coalesce(nullif(btrim(coalesce(listing_data ->> 'pickupOffered', '')), ''), nullif(btrim(coalesce(listing_data ->> 'pickupEnabled', '')), ''), nullif(btrim(coalesce(listing_data ->> 'pickupAvailable', '')), ''))) in ('true','t','1','yes','y') then true
          when lower(coalesce(nullif(btrim(coalesce(listing_data ->> 'pickupOffered', '')), ''), nullif(btrim(coalesce(listing_data ->> 'pickupEnabled', '')), ''), nullif(btrim(coalesce(listing_data ->> 'pickupAvailable', '')), ''))) in ('false','f','0','no','n') then false
          else null
        end,
        case
          when lower(coalesce(nullif(btrim(coalesce(listing_data ->> 'pickupOnly', '')), ''))) in ('true','t','1','yes','y') then true
          else null
        end,
        case
          when lower(
            coalesce(
              nullif(btrim(coalesce(category, '')), ''),
              nullif(btrim(coalesce(listing_data ->> 'category', '')), ''),
              nullif(btrim(coalesce(listing_data ->> 'listingCategory', '')), ''),
              nullif(btrim(coalesce(listing_data ->> 'serviceType', '')), ''),
              nullif(btrim(coalesce(listing_data ->> 'vendorType', '')), '')
            )
          ) in ('rental', 'rentals', 'prop-decor', 'prop-rental', 'catering', 'caterer')
            then true
          else false
        end
      );
  `);

  await db.execute(sql`
    update vendor_listings
    set
      delivery_fee_enabled = case
        when coalesce(delivery_offered, false) then coalesce(delivery_fee_enabled, false)
        else false
      end,
      setup_fee_enabled = case
        when coalesce(setup_offered, false) then coalesce(setup_fee_enabled, false)
        else false
      end,
      travel_fee_enabled = case
        when coalesce(travel_offered, false) then coalesce(travel_fee_enabled, false)
        else false
      end;
  `);

  await db.execute(sql`
    update vendor_listings
    set
      delivery_fee_amount_cents = case when delivery_fee_enabled then delivery_fee_amount_cents else null end,
      setup_fee_amount_cents = case when setup_fee_enabled then setup_fee_amount_cents else null end,
      travel_fee_type = case when travel_fee_enabled then travel_fee_type else null end,
      travel_fee_amount_cents = case when travel_fee_enabled then travel_fee_amount_cents else null end;
  `);

  await db.execute(sql`
    update vendor_listings
    set
      pickup_offered = false
    where pickup_offered is null;
  `);

  await db.execute(sql`
    alter table vendor_listings
      alter column pickup_offered set default false,
      alter column delivery_fee_enabled set default false,
      alter column setup_fee_enabled set default false;
  `);

  await db.execute(sql`
    alter table vendor_listings
      alter column pickup_offered set not null,
      alter column delivery_fee_enabled set not null,
      alter column setup_fee_enabled set not null;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists setup_fee_enabled,
      drop column if exists delivery_fee_enabled,
      drop column if exists pickup_offered;
  `);
}
