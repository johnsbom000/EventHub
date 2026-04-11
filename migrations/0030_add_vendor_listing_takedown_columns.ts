import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_listings
      add column if not exists takedown_offered boolean not null default false,
      add column if not exists takedown_fee_enabled boolean not null default false,
      add column if not exists takedown_fee_amount_cents integer;
  `);

  await db.execute(sql`
    update vendor_listings
    set
      takedown_offered = case
        when lower(
          coalesce(
            nullif(btrim(coalesce(listing_data ->> 'takedownOffered', '')), ''),
            nullif(btrim(coalesce(listing_data ->> 'takedownIncluded', '')), ''),
            nullif(btrim(coalesce(listing_data #>> '{deliverySetup,takedownIncluded}', '')), '')
          )
        ) in ('true','t','1','yes','y') then true
        when lower(
          coalesce(
            nullif(btrim(coalesce(listing_data ->> 'takedownOffered', '')), ''),
            nullif(btrim(coalesce(listing_data ->> 'takedownIncluded', '')), ''),
            nullif(btrim(coalesce(listing_data #>> '{deliverySetup,takedownIncluded}', '')), '')
          )
        ) in ('false','f','0','no','n') then false
        else takedown_offered
      end,
      takedown_fee_enabled = case
        when lower(
          coalesce(
            nullif(btrim(coalesce(listing_data ->> 'takedownFeeEnabled', '')), ''),
            nullif(btrim(coalesce(listing_data #>> '{deliverySetup,takedownFeeEnabled}', '')), '')
          )
        ) in ('true','t','1','yes','y') then true
        when lower(
          coalesce(
            nullif(btrim(coalesce(listing_data ->> 'takedownFeeEnabled', '')), ''),
            nullif(btrim(coalesce(listing_data #>> '{deliverySetup,takedownFeeEnabled}', '')), '')
          )
        ) in ('false','f','0','no','n') then false
        else takedown_fee_enabled
      end
    where listing_data is not null;
  `);

  await db.execute(sql`
    update vendor_listings
    set takedown_fee_amount_cents =
      case
        when not takedown_offered or not takedown_fee_enabled then null
        else coalesce(
          case
            when coalesce(listing_data ->> 'takedownFeeAmountCents', '') ~ '^\\s*[+-]?\\d+\\s*$'
              then greatest(0, (listing_data ->> 'takedownFeeAmountCents')::int)
            else null
          end,
          case
            when coalesce(listing_data #>> '{deliverySetup,takedownFeeAmountCents}', '') ~ '^\\s*[+-]?\\d+\\s*$'
              then greatest(0, (listing_data #>> '{deliverySetup,takedownFeeAmountCents}')::int)
            else null
          end,
          case
            when coalesce(listing_data ->> 'takedownFeeAmount', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
              then greatest(0, round((listing_data ->> 'takedownFeeAmount')::numeric * 100)::int)
            else null
          end,
          case
            when coalesce(listing_data #>> '{deliverySetup,takedownFeeAmount}', '') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
              then greatest(0, round((listing_data #>> '{deliverySetup,takedownFeeAmount}')::numeric * 100)::int)
            else null
          end,
          takedown_fee_amount_cents
        )
      end
    where listing_data is not null;
  `);
}

export async function down() {
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists takedown_fee_amount_cents,
      drop column if exists takedown_fee_enabled,
      drop column if exists takedown_offered;
  `);
}
