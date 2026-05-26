import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  // Add shop_slug column (nullable initially to allow backfill)
  await db.execute(sql`
    ALTER TABLE vendor_accounts ADD COLUMN IF NOT EXISTS shop_slug text
  `);

  // Backfill: generate slugs from existing business names.
  // Strips non-alphanumeric chars, lowercases, collapses whitespace to hyphens.
  // Handles collisions among existing rows with a -2, -3 suffix.
  await db.execute(sql`
    UPDATE vendor_accounts SET shop_slug = sub.final_slug
    FROM (
      WITH base AS (
        SELECT id, created_at,
          lower(
            regexp_replace(
              regexp_replace(business_name, '[^a-zA-Z0-9\\s-]', '', 'g'),
              '\\s+', '-', 'g'
            )
          ) AS base_slug
        FROM vendor_accounts
        WHERE deleted_at IS NULL
      ),
      ranked AS (
        SELECT id, base_slug,
          row_number() OVER (PARTITION BY base_slug ORDER BY created_at) AS rn
        FROM base
      )
      SELECT id,
        CASE WHEN rn = 1 THEN base_slug ELSE base_slug || '-' || rn END AS final_slug
      FROM ranked
    ) sub
    WHERE vendor_accounts.id = sub.id
  `);

  // Ensure all rows have a slug (safety net for any that had empty business names)
  await db.execute(sql`
    UPDATE vendor_accounts
    SET shop_slug = 'vendor-' || substring(id::text, 1, 8)
    WHERE shop_slug IS NULL OR shop_slug = ''
  `);

  // Make non-nullable
  await db.execute(sql`
    ALTER TABLE vendor_accounts ALTER COLUMN shop_slug SET NOT NULL
  `);

  // Unique partial index on shop_slug (active vendors only)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_shop_slug_unique_idx
    ON vendor_accounts(shop_slug)
    WHERE deleted_at IS NULL
  `);

  // Case-insensitive unique partial index on business_name (active vendors only)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_business_name_ci_unique_idx
    ON vendor_accounts(lower(business_name))
    WHERE deleted_at IS NULL
  `);

  console.log("[0088] added shop_slug column and indexes to vendor_accounts.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_business_name_ci_unique_idx`);
  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_shop_slug_unique_idx`);
  await db.execute(sql`ALTER TABLE vendor_accounts DROP COLUMN IF EXISTS shop_slug`);
}
