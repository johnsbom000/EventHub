import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Removes the deprecated review_replies.review_index column.
 * listing_review_id is the canonical FK and has been in place since the review system
 * was migrated. This migration aborts if any row still lacks a listing_review_id,
 * preventing a silent data loss if the backfill was never completed.
 */
export async function up() {
  // Check if the column still exists (migration 0050 may have already dropped it).
  const exists = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'review_replies' AND column_name = 'review_index'
  `);

  if (exists.rows.length === 0) {
    console.log("[0110] review_replies.review_index already absent — skipping");
    return;
  }

  // Safety check: abort if backfill is incomplete
  const result = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM review_replies WHERE listing_review_id IS NULL
  `);
  const count = Number((result.rows[0] as { cnt: string }).cnt);
  if (count > 0) {
    throw new Error(
      `[0110] Aborted: ${count} review_replies rows still have NULL listing_review_id. Run the backfill before this migration.`
    );
  }

  await db.execute(sql`ALTER TABLE review_replies ALTER COLUMN review_index DROP NOT NULL`);
  await db.execute(sql`ALTER TABLE review_replies DROP COLUMN review_index`);

  console.log("[0110] dropped deprecated review_replies.review_index");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE review_replies ADD COLUMN review_index integer NOT NULL DEFAULT 0
  `);
}
