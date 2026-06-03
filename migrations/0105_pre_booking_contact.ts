import { db } from "../server/db";
import { sql } from "drizzle-orm";

export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_listings
      ADD COLUMN IF NOT EXISTS allow_pre_booking_contact boolean NOT NULL DEFAULT false;
  `);

  await db.execute(sql`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS inquiry_channel_id varchar(255);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS vendor_inquiries (
      id                 varchar(36)  NOT NULL PRIMARY KEY,
      vendor_account_id  varchar(255) NOT NULL REFERENCES vendor_accounts(id),
      customer_id        varchar(255) NOT NULL,
      stream_channel_id  varchar(255) NOT NULL,
      initial_listing_id varchar(255) REFERENCES vendor_listings(id),
      booking_id         varchar(255) REFERENCES bookings(id),
      status             varchar(20)  NOT NULL DEFAULT 'active',
      created_at         timestamp    NOT NULL DEFAULT now(),
      updated_at         timestamp    NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_inquiries_vendor_customer_unique_idx
      ON vendor_inquiries (vendor_account_id, customer_id);
  `);

  console.log("[0105] Added allow_pre_booking_contact to vendor_listings, inquiry_channel_id to bookings, and created vendor_inquiries table.");
}
