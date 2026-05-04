import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add listing_review_id FK to review_replies.
 *
 * Background: review_replies previously used an integer column (review_index)
 * to associate a vendor's reply with a review — an index into an imaginary
 * in-memory array. This had no DB integrity and is unqueryable via joins.
 *
 * This migration adds the proper FK to listing_reviews. The legacy review_index
 * column is kept as deprecated for now (not dropped) since automatic backfill
 * would require matching by vendor + review order, which must be done manually
 * or via a follow-up script before review_index can be dropped.
 *
 * Safe to run against production:
 * - listing_review_id is nullable — no existing rows are touched.
 * - review_index is not removed.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE review_replies
      ADD COLUMN IF NOT EXISTS listing_review_id varchar
      REFERENCES listing_reviews(id) ON DELETE CASCADE;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_review_replies_listing_review_id
      ON review_replies (listing_review_id)
      WHERE listing_review_id IS NOT NULL;
  `);

  // review_index is now deprecated. New code must write listing_review_id.
  // Drop review_index in a follow-up migration after backfill is confirmed.

  console.log("[0040] review_replies.listing_review_id FK added. review_index is deprecated.");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS idx_review_replies_listing_review_id;`);
  await db.execute(sql`ALTER TABLE review_replies DROP COLUMN IF EXISTS listing_review_id;`);
}
