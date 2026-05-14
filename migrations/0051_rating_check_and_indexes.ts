import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Two unrelated but low-risk additions bundled into one migration:
 *
 * 1. Add CHECK constraint on listing_reviews.rating to enforce 1–5 range.
 *    Any integer was previously accepted at the DB level. A bug or malformed
 *    request could store ratings of 0, -1, or 999, corrupting aggregated scores.
 *
 * 2. Add indexes on vendor_listings (status, category) to speed up the public
 *    listing query, which currently does a full table scan filtered by status.
 *    Also adds an index on vendor_listings.account_id for vendor-scoped queries.
 *
 * Safe to run against production:
 *   - CHECK constraint addition: validates existing data first and aborts if
 *     any ratings are outside 1–5.
 *   - Indexes use IF NOT EXISTS and are non-blocking (CREATE INDEX does not
 *     hold an exclusive lock in standard PostgreSQL).
 */
export async function up() {
  // 1. Validate existing ratings before adding the constraint.
  const bad: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM listing_reviews WHERE rating < 1 OR rating > 5;
  `);
  const badCount = Number(bad?.rows?.[0]?.cnt ?? bad?.[0]?.cnt ?? 0);
  if (badCount > 0) {
    throw new Error(
      `[0051] ${badCount} listing_reviews row(s) have rating outside 1–5. ` +
      `Fix these rows before applying the CHECK constraint.`
    );
  }

  await db.execute(sql`
    ALTER TABLE listing_reviews
      ADD CONSTRAINT listing_reviews_rating_range CHECK (rating >= 1 AND rating <= 5);
  `);
  console.log("[0051] listing_reviews rating CHECK constraint added.");

  // 2. Indexes for vendor_listings.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_listings_status_category
      ON vendor_listings (status, category)
      WHERE status = 'active';
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_listings_account_id
      ON vendor_listings (account_id);
  `);
  console.log("[0051] vendor_listings indexes added.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE listing_reviews
      DROP CONSTRAINT IF EXISTS listing_reviews_rating_range;
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_vendor_listings_status_category;
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_vendor_listings_account_id;
  `);
  console.log("[0051] down: rating constraint and listing indexes removed.");
}
