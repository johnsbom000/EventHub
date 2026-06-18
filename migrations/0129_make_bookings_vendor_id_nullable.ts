import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Make bookings.vendor_id nullable.
 *
 * `vendor_id` is a legacy column from the initial schema (migration 0001),
 * created as `NOT NULL REFERENCES vendor_accounts(id) ON DELETE CASCADE`.
 * The vendor identity model was later migrated to `vendor_account_id` +
 * `vendor_profile_id` (see shared/schema.ts: "migrated from legacy vendors ->
 * vendor_accounts"), and the booking-insert path stopped writing `vendor_id`
 * entirely.
 *
 * Because the column stayed NOT NULL with no default and nothing populating it,
 * the *first* real INSERT into bookings fails with:
 *   null value in column "vendor_id" of relation "bookings" violates not-null
 * This affected both staging and production (production's bookings table was
 * simply empty, so it had never been hit).
 *
 * Nothing in the current codebase reads `vendor_id`, so dropping the NOT NULL
 * constraint is the safe, minimal fix. The column is left in place (rather than
 * dropped) so this migration is non-destructive and trivially reversible.
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
        WHERE table_name = 'bookings'
          AND column_name = 'vendor_id'
      ) THEN
        ALTER TABLE bookings ALTER COLUMN vendor_id DROP NOT NULL;
      END IF;
    END $$;
  `);

  console.log("[0129] bookings.vendor_id is now nullable.");
}

export async function down() {
  // Reinstating NOT NULL would fail on any row with a null vendor_id, so the
  // down path only attempts it when every existing row has the column set.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bookings'
          AND column_name = 'vendor_id'
      )
      AND NOT EXISTS (
        SELECT 1 FROM bookings WHERE vendor_id IS NULL
      ) THEN
        ALTER TABLE bookings ALTER COLUMN vendor_id SET NOT NULL;
      END IF;
    END $$;
  `);

  console.log("[0129] down: attempted to restore bookings.vendor_id NOT NULL.");
}
