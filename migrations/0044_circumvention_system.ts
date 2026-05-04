import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Circumvention prevention system.
 *
 * Adds three tables and two columns to vendor_listings to support:
 *  - Flagging contact-info sharing attempts (hard blocks, soft flags, customer reports)
 *  - A 3-warning suspension system for vendors
 *  - Admin review queue for pending flags
 *  - Listing removal + re-review flow for violations
 *
 * Safe to run against production:
 *  - All CREATE TABLE statements use IF NOT EXISTS.
 *  - All ALTER TABLE statements use IF NOT EXISTS (PG 9.6+).
 *  - No existing rows modified.
 */
export async function up() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS circumvention_flags (
      id                   varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      flag_type            varchar NOT NULL,
      content_type         varchar NOT NULL,
      content_snapshot     text    NOT NULL,
      matches              text[]  NOT NULL DEFAULT '{}',
      vendor_account_id    varchar REFERENCES vendor_accounts(id) ON DELETE SET NULL,
      user_id              varchar REFERENCES users(id)            ON DELETE SET NULL,
      reported_by_user_id  varchar REFERENCES users(id)            ON DELETE SET NULL,
      listing_id           varchar REFERENCES vendor_listings(id)  ON DELETE SET NULL,
      booking_id           varchar REFERENCES bookings(id)         ON DELETE SET NULL,
      status               varchar NOT NULL DEFAULT 'pending',
      reviewed_by          varchar,
      reviewed_at          timestamp,
      created_at           timestamp NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS circumvention_flags_vendor_idx
      ON circumvention_flags (vendor_account_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS circumvention_flags_status_idx
      ON circumvention_flags (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS circumvention_warnings (
      id                 varchar  PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id  varchar  NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      flag_id            varchar  REFERENCES circumvention_flags(id) ON DELETE SET NULL,
      reason             text     NOT NULL,
      issued_by          varchar  NOT NULL DEFAULT 'system',
      warning_number     integer  NOT NULL,
      notified_email     boolean  NOT NULL DEFAULT false,
      created_at         timestamp NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS circumvention_warnings_vendor_idx
      ON circumvention_warnings (vendor_account_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS vendor_suspensions (
      id                 varchar  PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_account_id  varchar  NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE,
      reason             text     NOT NULL,
      warning_snapshot   integer  NOT NULL,
      starts_at          timestamp NOT NULL DEFAULT NOW(),
      ends_at            timestamp NOT NULL,
      created_by         varchar  NOT NULL DEFAULT 'system',
      notified_email     boolean  NOT NULL DEFAULT false,
      lifted_at          timestamp,
      lifted_by          varchar,
      created_at         timestamp NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS vendor_suspensions_vendor_idx
      ON vendor_suspensions (vendor_account_id, ends_at DESC);

    ALTER TABLE vendor_listings
      ADD COLUMN IF NOT EXISTS violation_removal    boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS pending_admin_review boolean NOT NULL DEFAULT false;
  `);

  console.log("[0044] circumvention prevention tables and columns created.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_listings
      DROP COLUMN IF EXISTS violation_removal,
      DROP COLUMN IF EXISTS pending_admin_review;

    DROP TABLE IF EXISTS vendor_suspensions;
    DROP TABLE IF EXISTS circumvention_warnings;
    DROP TABLE IF EXISTS circumvention_flags;
  `);
}
