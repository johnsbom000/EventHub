import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Make payments.vendor_id nullable.
 *
 * Same legacy-column issue as bookings.vendor_id (migration 0129): payments
 * originally had a `vendor_id NOT NULL` column, but the vendor identity model
 * moved to `vendor_account_id`. The payment-initialization insert
 * (server/services/paymentService.ts > initializeBookingPayment) writes
 * `vendor_account_id` and never `vendor_id`, and the Drizzle `payments` schema
 * no longer defines a `vendorId` column at all — so the column can never be
 * populated by current code.
 *
 * With the column left NOT NULL and unpopulated, the first INSERT into payments
 * fails with:
 *   null value in column "vendor_id" of relation "payments" violates not-null
 * which surfaced as a 500 from POST /api/bookings/:id/initialize-payment right
 * after the booking row itself started inserting (see 0129).
 *
 * Nothing reads or writes payments.vendor_id, so dropping the NOT NULL
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
        WHERE table_name = 'payments'
          AND column_name = 'vendor_id'
      ) THEN
        ALTER TABLE payments ALTER COLUMN vendor_id DROP NOT NULL;
      END IF;
    END $$;
  `);

  console.log("[0130] payments.vendor_id is now nullable.");
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
        WHERE table_name = 'payments'
          AND column_name = 'vendor_id'
      )
      AND NOT EXISTS (
        SELECT 1 FROM payments WHERE vendor_id IS NULL
      ) THEN
        ALTER TABLE payments ALTER COLUMN vendor_id SET NOT NULL;
      END IF;
    END $$;
  `);

  console.log("[0130] down: attempted to restore payments.vendor_id NOT NULL.");
}
