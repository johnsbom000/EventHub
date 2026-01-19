import { sql } from "drizzle-orm";
import { db } from "../server/db";

// Cleanup known dummy/test vendors and add a case-insensitive unique index on vendor_accounts.email
export async function up() {
  // 1) Delete listings, profiles, and accounts for known dummy vendors by email
  await db.execute(sql`
    WITH dead_accounts AS (
      SELECT id
      FROM vendor_accounts
      WHERE email IN (
        'fake@email.com',
        'mockvendor@email.com',
        'testvendor@example.com'
      )
    ),
    deleted_listings AS (
      DELETE FROM vendor_listings
      WHERE account_id IN (SELECT id FROM dead_accounts)
      RETURNING id
    ),
    deleted_profiles AS (
      DELETE FROM vendor_profiles
      WHERE account_id IN (SELECT id FROM dead_accounts)
      RETURNING id
    )
    DELETE FROM vendor_accounts
    WHERE id IN (SELECT id FROM dead_accounts);
  `);

  // 2) Add unique index on lower(email) to prevent future duplicates by case
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_email_lower_unique
    ON vendor_accounts (LOWER(email));
  `);
}

export async function down() {
  // This migration is destructive with respect to dummy data; we only make the index reversible.
  await db.execute(sql`
    DROP INDEX IF EXISTS vendor_accounts_email_lower_unique;
  `);
}
