import { db } from "../server/db";

/**
 * Originally intended to add `review_id` FK to `review_replies`.
 *
 * This migration is a no-op: the equivalent work was already done by prior
 * migrations:
 *   - 0040_review_replies_listing_fk.ts  → added `listing_review_id` FK
 *   - 0050_drop_review_index_column.ts   → dropped the legacy `review_index` column
 *
 * The column is named `listing_review_id` (not `review_id`).
 * New code must use that column name; see routes.ts `/api/vendor/reviews`.
 */
export async function up() {
  // No-op — see migration header above.
  void db;
}
