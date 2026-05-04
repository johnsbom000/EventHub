import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add ON DELETE CASCADE to board_saved_listings.listing_id FK.
 *
 * Background: without cascade, hard-deleting a vendor listing raises a FK
 * violation on board_saved_listings. Since listings use soft-delete semantics
 * (status = 'deleted'), this was silent — but planning boards accumulate
 * references to delisted listings with no cleanup path.
 *
 * Safe to run against production:
 * - Drops and recreates the FK only — no data is modified.
 * - Uses a dynamic lookup for the existing constraint name to handle any
 *   auto-generated name Postgres assigned at table creation time.
 */
export async function up() {
  // Dynamically find and drop the existing FK on listing_id
  await db.execute(sql`
    DO $$
    DECLARE
      cname text;
    BEGIN
      SELECT tc.constraint_name
      INTO cname
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_name      = kcu.table_name
      WHERE tc.table_name      = 'board_saved_listings'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name    = 'listing_id';

      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE board_saved_listings DROP CONSTRAINT %I', cname);
      END IF;
    END $$;
  `);

  // Recreate with ON DELETE CASCADE
  await db.execute(sql`
    ALTER TABLE board_saved_listings
      ADD CONSTRAINT board_saved_listings_listing_id_fkey
      FOREIGN KEY (listing_id)
      REFERENCES vendor_listings(id)
      ON DELETE CASCADE;
  `);

  console.log("[0037] board_saved_listings.listing_id FK updated to ON DELETE CASCADE.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE board_saved_listings
      DROP CONSTRAINT IF EXISTS board_saved_listings_listing_id_fkey;
  `);

  await db.execute(sql`
    ALTER TABLE board_saved_listings
      ADD CONSTRAINT board_saved_listings_listing_id_fkey
      FOREIGN KEY (listing_id)
      REFERENCES vendor_listings(id);
  `);
}
