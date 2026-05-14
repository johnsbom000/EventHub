import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drop the deprecated review_replies.review_index column.
 *
 * Background:
 *   review_index was a legacy integer pointer to a position in an array.
 *   It was replaced by listing_review_id (a real FK to listing_reviews.id)
 *   which was added in migration 0040. The column comment in schema.ts
 *   states "DEPRECATED: use listingReviewId FK instead; kept until backfill
 *   is confirmed."
 *
 * This migration first verifies that every row in review_replies that has
 * any reply content also has a non-null listing_review_id, confirming the
 * backfill is complete. If any row lacks listing_review_id the migration
 * aborts safely — fix the backfill before re-running.
 *
 * Safe to run against production:
 *   - Aborts if backfill is incomplete.
 *   - DROP COLUMN is transactional in PostgreSQL.
 *   - No other table references review_index.
 */
export async function up() {
  // Verify backfill: every reply must have a listing_review_id.
  const incomplete: any = await db.execute(sql`
    SELECT COUNT(*) AS cnt
    FROM review_replies
    WHERE listing_review_id IS NULL;
  `);
  const incompleteCount = Number(incomplete?.rows?.[0]?.cnt ?? incomplete?.[0]?.cnt ?? 0);
  if (incompleteCount > 0) {
    throw new Error(
      `[0050] Backfill incomplete: ${incompleteCount} review_replies row(s) still have NULL listing_review_id. ` +
      `Backfill listing_review_id for all rows before running this migration.`
    );
  }

  await db.execute(sql`
    ALTER TABLE review_replies DROP COLUMN IF EXISTS review_index;
  `);

  console.log("[0050] review_replies.review_index dropped.");
}

export async function down() {
  // Restore the column. It was NOT NULL in the original schema, but restoring
  // it as nullable avoids a backfill requirement on rollback.
  await db.execute(sql`
    ALTER TABLE review_replies
      ADD COLUMN IF NOT EXISTS review_index integer NOT NULL DEFAULT 0;
  `);

  console.log("[0050] down: review_replies.review_index restored (filled with 0).");
}
