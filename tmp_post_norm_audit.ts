import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './server/db.ts';

const rowOf = (r: any) => (Array.isArray(r?.rows) ? r.rows[0] : Array.isArray(r) ? r[0] : null);
const run = async (label: string, query: any) => {
  const r = await db.execute(query);
  console.log(`${label} ${JSON.stringify(rowOf(r))}`);
};

await run('bookings_total', sql`select count(*)::int as count from bookings`);

await run(
  'bookings_linkage_nulls',
  sql`select
    count(*)::int as total,
    count(*) filter (where vendor_account_id is null)::int as vendor_account_id_null,
    count(*) filter (where vendor_profile_id is null)::int as vendor_profile_id_null,
    count(*) filter (where listing_id is null)::int as listing_id_null,
    count(*) filter (where vendor_account_id is null or listing_id is null)::int as owner_linkage_fallback_candidates
  from bookings`
);

await run(
  'bookings_window_nulls',
  sql`select
    count(*)::int as total,
    count(*) filter (where booking_start_at is null)::int as booking_start_at_null,
    count(*) filter (where booking_end_at is null)::int as booking_end_at_null,
    count(*) filter (where booking_start_at is null or booking_end_at is null)::int as window_fallback_candidates,
    count(*) filter (where status <> 'cancelled' and (booking_start_at is null or booking_end_at is null))::int as active_window_gap
  from bookings`
);

await run(
  'bookings_snapshot_nulls',
  sql`select
    count(*)::int as total,
    count(*) filter (where listing_title_snapshot is null or btrim(coalesce(listing_title_snapshot,''))='')::int as listing_title_snapshot_null,
    count(*) filter (where pricing_unit_snapshot is null or btrim(coalesce(pricing_unit_snapshot,''))='')::int as pricing_unit_snapshot_null,
    count(*) filter (where unit_price_cents_snapshot is null)::int as unit_price_cents_snapshot_null,
    count(*) filter (where booked_quantity is null or booked_quantity < 1)::int as booked_quantity_invalid,
    count(*) filter (where base_subtotal_cents is null)::int as base_subtotal_cents_null,
    count(*) filter (where subtotal_amount_cents is null)::int as subtotal_amount_cents_null,
    count(*) filter (where customer_fee_amount_cents is null)::int as customer_fee_amount_cents_null,
    count(*) filter (where delivery_fee_amount_cents is null and setup_fee_amount_cents is null and travel_fee_amount_cents is null and logistics_total_cents is null)::int as logistics_snapshot_all_null
  from bookings`
);

await run(
  'bookings_item_dependency_shape',
  sql`with bi as (
      select booking_id, count(*)::int as item_count
      from booking_items
      group by booking_id
    )
    select
      count(*)::int as total,
      count(*) filter (where coalesce(bi.item_count,0)=0)::int as no_booking_items,
      count(*) filter (where coalesce(bi.item_count,0)>0)::int as has_booking_items,
      count(*) filter (
        where (b.listing_title_snapshot is null or btrim(coalesce(b.listing_title_snapshot,''))='')
          and coalesce(bi.item_count,0)>0
      )::int as title_needs_item_fallback,
      count(*) filter (
        where b.subtotal_amount_cents is null
          and coalesce(bi.item_count,0)>0
      )::int as subtotal_needs_item_fallback
    from bookings b
    left join bi on bi.booking_id = b.id`
);

await run('listings_total', sql`select count(*)::int as count from vendor_listings`);

await run(
  'listings_typed_core_gaps',
  sql`select
    count(*)::int as total,
    count(*) filter (where category is null or btrim(coalesce(category,''))='')::int as category_null,
    count(*) filter (where title is null or btrim(coalesce(title,''))='')::int as title_null,
    count(*) filter (where description is null or btrim(coalesce(description,''))='')::int as description_null,
    count(*) filter (where pricing_unit is null or btrim(coalesce(pricing_unit,''))='')::int as pricing_unit_null,
    count(*) filter (where price_cents is null or price_cents <= 0)::int as price_cents_null_or_nonpositive,
    count(*) filter (where service_area_mode is null or btrim(coalesce(service_area_mode,''))='')::int as service_area_mode_null,
    count(*) filter (where service_radius_miles is null or service_radius_miles <= 0)::int as service_radius_null_or_nonpositive,
    count(*) filter (where listing_service_center_lat is null or listing_service_center_lng is null)::int as service_center_missing,
    count(*) filter (where status='active')::int as active_total,
    count(*) filter (
      where status='active' and (
        category is null or btrim(coalesce(category,''))='' or
        title is null or btrim(coalesce(title,''))='' or
        description is null or btrim(coalesce(description,''))='' or
        pricing_unit is null or btrim(coalesce(pricing_unit,''))='' or
        price_cents is null or price_cents <= 0
      )
    )::int as active_core_gap
  from vendor_listings`
);

await run(
  'listings_legacy_alias_presence',
  sql`select
    count(*)::int as total,
    count(*) filter (where listing_data ? 'listingCategory')::int as has_listingCategory_alias,
    count(*) filter (where listing_data ? 'listingSubcategory')::int as has_listingSubcategory_alias,
    count(*) filter (where listing_data ? 'availableUnits')::int as has_availableUnits_alias,
    count(*) filter (where listing_data ? 'inventoryQuantity')::int as has_inventoryQuantity_alias,
    count(*) filter (where listing_data ? 'deliverySetup')::int as has_deliverySetup_alias,
    count(*) filter (where listing_data ? 'pickupEnabled')::int as has_pickupEnabled_alias,
    count(*) filter (where listing_data ? 'pickupOnly')::int as has_pickupOnly_alias,
    count(*) filter (where listing_data ? 'pricingByPropType')::int as has_pricingByPropType_alias,
    count(*) filter (where listing_data ? 'rentalTypes')::int as has_rentalTypes_alias,
    count(*) filter (where listing_data ? 'propTypes')::int as has_propTypes_alias
  from vendor_listings`
);

await run(
  'listings_alias_vs_typed_conflicts',
  sql`select
    count(*)::int as total,
    count(*) filter (
      where (category is null or btrim(coalesce(category,''))='')
        and (coalesce(listing_data->>'category','')<>'' or coalesce(listing_data->>'listingCategory','')<>'')
    )::int as category_only_in_json,
    count(*) filter (
      where (price_cents is null or price_cents<=0)
        and (
          coalesce(listing_data->>'priceCents','') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
          or coalesce(listing_data->>'price','') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
          or coalesce(listing_data->>'rate','') ~ '^\\s*[+-]?\\d+(\\.\\d+)?\\s*$'
        )
    )::int as price_only_in_json,
    count(*) filter (
      where (pricing_unit is null or btrim(coalesce(pricing_unit,''))='')
        and (coalesce(listing_data->>'pricingUnit','')<>'')
    )::int as pricing_unit_only_in_json,
    count(*) filter (
      where (service_radius_miles is null or service_radius_miles<=0)
        and (coalesce(listing_data->>'serviceRadiusMiles','')<>'' or coalesce(listing_data->>'serviceRadius','')<>'')
    )::int as service_radius_only_in_json
  from vendor_listings`
);

await run(
  'bookings_sync_legacy_time_fallback_candidates',
  sql`select
    count(*)::int as total,
    count(*) filter (where booking_start_at is null or booking_end_at is null)::int as canonical_window_missing,
    count(*) filter (where (booking_start_at is null or booking_end_at is null) and coalesce(event_date,'') <> '')::int as event_date_fallback_possible,
    count(*) filter (where (booking_start_at is null or booking_end_at is null) and (coalesce(event_date,'') = ''))::int as sync_time_unusable
  from bookings`
);

process.exit(0);
