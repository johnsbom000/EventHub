import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add multi-language support to EventHub.
 *
 * Two changes:
 *
 * 1. users.preferred_language — stores the user's chosen UI and content
 *    language. Defaults to 'en'. Used by the server to return translated
 *    listing content and by the client to initialise the i18n locale.
 *
 * 2. listing_translations — one row per (listing, language) pair. Written
 *    asynchronously by the translation worker after a vendor saves a listing.
 *    Read by listing GET endpoints when a non-English language is requested.
 *    Supported language codes: 'es' (Spanish), 'pt' (Portuguese).
 *
 * Safe to run against production:
 *   - ADD COLUMN with DEFAULT does not rewrite the table in PostgreSQL 11+.
 *   - CREATE TABLE IF NOT EXISTS is idempotent.
 *   - No existing rows are altered.
 */
export async function up() {
  // 1. Preferred language on users
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS preferred_language varchar(10) NOT NULL DEFAULT 'en';
  `);

  // 2. Listing translations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS listing_translations (
      id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      listing_id    varchar NOT NULL REFERENCES vendor_listings(id) ON DELETE CASCADE,
      language      varchar(10) NOT NULL,
      title         text,
      description   text,
      whats_included  text[] NOT NULL DEFAULT '{}',
      whats_not_included text[] NOT NULL DEFAULT '{}',
      status        varchar(20) NOT NULL DEFAULT 'pending',
      translated_at timestamptz,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT listing_translations_listing_lang_unique UNIQUE (listing_id, language)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_listing_translations_listing_id
      ON listing_translations (listing_id, language);
  `);

  console.log("[0055] i18n: users.preferred_language + listing_translations table created.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_listing_translations_listing_id;`);
  await db.execute(sql`DROP TABLE IF EXISTS listing_translations;`);
  await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS preferred_language;`);
  console.log("[0055] down: i18n changes reverted.");
}
