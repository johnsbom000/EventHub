import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Make review_replies.vendor_id nullable.
 *
 * Same abandoned legacy column as bookings.vendor_id (0129) and
 * payments.vendor_id (0130). review_replies.vendor_id is NOT NULL, but the
 * vendor identity model moved to `vendor_account_id`: the Drizzle review_replies
 * schema defines `vendorAccountId` and no `vendorId`, and the reply insert
 * (server/routers/vendor.ts) writes `vendor_account_id` only. The column can
 * never be populated by current code, so the first vendor reply to a review
 * would fail with:
 *   null value in column "vendor_id" of relation "review_replies" violates
 *   not-null constraint
 *
 * Nothing reads or writes review_replies.vendor_id, so dropping the NOT NULL
 * constraint is the safe, minimal fix. The column is left in place so this
 * migration is non-destructive and reversible.
 *
 * Idempotent: guarded on column existence; DROP NOT NULL is a no-op when the
 * constraint is already absent.
 */
export async function up() {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'review_replies'
          AND column_name = 'vendor_id'
      ) THEN
        ALTER TABLE review_replies ALTER COLUMN vendor_id DROP NOT NULL;
      END IF;
    END $$;
  `);

  console.log("[0131] review_replies.vendor_id is now nullable.");
}

export async function down() {
  // Reinstating NOT NULL would fail on any row with a null vendor_id, so only
  // attempt it when every existing row has the column set.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'review_replies'
          AND column_name = 'vendor_id'
      )
      AND NOT EXISTS (
        SELECT 1 FROM review_replies WHERE vendor_id IS NULL
      ) THEN
        ALTER TABLE review_replies ALTER COLUMN vendor_id SET NOT NULL;
      END IF;
    END $$;
  `);

  console.log("[0131] down: attempted to restore review_replies.vendor_id NOT NULL.");
}
