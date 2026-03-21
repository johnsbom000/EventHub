import { sql } from "drizzle-orm";

import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    alter table vendor_profiles
      add column if not exists business_phone text,
      add column if not exists business_email text,
      add column if not exists business_address_label text,
      add column if not exists business_street text,
      add column if not exists business_city text,
      add column if not exists business_state text,
      add column if not exists business_zip text,
      add column if not exists home_base_lat double precision,
      add column if not exists home_base_lng double precision,
      add column if not exists show_business_phone_to_customers boolean not null default false,
      add column if not exists show_business_email_to_customers boolean not null default false,
      add column if not exists show_business_address_to_customers boolean not null default false,
      add column if not exists about_vendor text,
      add column if not exists about_business text;
  `);

  await db.execute(sql`
    alter table vendor_listings
      add column if not exists category text,
      add column if not exists subcategory text,
      add column if not exists description text,
      add column if not exists whats_included text[] not null default '{}'::text[],
      add column if not exists tags text[] not null default '{}'::text[],
      add column if not exists popular_for text[] not null default '{}'::text[],
      add column if not exists instant_book_enabled boolean not null default false,
      add column if not exists pricing_unit text,
      add column if not exists price_cents integer,
      add column if not exists minimum_hours integer,
      add column if not exists listing_service_center_label text,
      add column if not exists listing_service_center_lat double precision,
      add column if not exists listing_service_center_lng double precision,
      add column if not exists service_radius_miles integer,
      add column if not exists service_area_mode text,
      add column if not exists travel_offered boolean not null default false,
      add column if not exists travel_fee_enabled boolean not null default false,
      add column if not exists travel_fee_type text,
      add column if not exists travel_fee_amount_cents integer,
      add column if not exists delivery_offered boolean not null default false,
      add column if not exists delivery_fee_amount_cents integer,
      add column if not exists setup_offered boolean not null default false,
      add column if not exists setup_fee_amount_cents integer,
      add column if not exists photos text[] not null default '{}'::text[];
  `);
}

export async function down() {
  await db.execute(sql`
    alter table vendor_listings
      drop column if exists photos,
      drop column if exists setup_fee_amount_cents,
      drop column if exists setup_offered,
      drop column if exists delivery_fee_amount_cents,
      drop column if exists delivery_offered,
      drop column if exists travel_fee_amount_cents,
      drop column if exists travel_fee_type,
      drop column if exists travel_fee_enabled,
      drop column if exists travel_offered,
      drop column if exists service_area_mode,
      drop column if exists service_radius_miles,
      drop column if exists listing_service_center_lng,
      drop column if exists listing_service_center_lat,
      drop column if exists listing_service_center_label,
      drop column if exists minimum_hours,
      drop column if exists price_cents,
      drop column if exists pricing_unit,
      drop column if exists instant_book_enabled,
      drop column if exists popular_for,
      drop column if exists tags,
      drop column if exists whats_included,
      drop column if exists description,
      drop column if exists subcategory,
      drop column if exists category;
  `);

  await db.execute(sql`
    alter table vendor_profiles
      drop column if exists about_business,
      drop column if exists about_vendor,
      drop column if exists show_business_address_to_customers,
      drop column if exists show_business_email_to_customers,
      drop column if exists show_business_phone_to_customers,
      drop column if exists home_base_lng,
      drop column if exists home_base_lat,
      drop column if exists business_zip,
      drop column if exists business_state,
      drop column if exists business_city,
      drop column if exists business_street,
      drop column if exists business_address_label,
      drop column if exists business_email,
      drop column if exists business_phone;
  `);
}
