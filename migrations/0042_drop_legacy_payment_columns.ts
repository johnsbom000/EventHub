import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * NOTE: This file shares the 0042 prefix with 0042_vendor_owner_personal_details.ts.
 * Both run correctly because the migration runner tracks by full filename.
 * Alphabetical sort means this file (drop_legacy_payment_columns) runs BEFORE
 * 0042_vendor_owner_personal_details.ts — no dependency between them.
 * Future migrations must use strictly sequential numbers (0048, 0049, ...).
 *
 * Drop the three legacy payment columns that are true duplicates of canonical ones.
 *
 *   LEGACY (dropping)     CANONICAL (keeping)        REASON
 *   ─────────────────     ────────────────────────   ──────────────────────────────
 *   platform_fee          platform_fee_amount        Always written with same value
 *   vendor_payout         vendor_net_payout_amount   Always written with same value
 *   refunded_amount       refund_amount              Always written with same value
 *
 * NOTE: `amount` is NOT being dropped. It represents the per-transaction charge
 * (e.g. deposit amount) and is a different concept from `total_amount` (booking total).
 *
 * Safe to run against production:
 * - Step 1 backfills canonical columns for any legacy rows where they are NULL
 *   (rows written before the canonical columns were added).
 * - Step 2 drops the legacy columns.
 * - All application code has been updated to write/read only canonical columns.
 */
export async function up() {
  // 1. Backfill canonical columns from legacy values where NULL
  await db.execute(sql`
    UPDATE payments
    SET platform_fee_amount = platform_fee
    WHERE platform_fee_amount IS NULL AND platform_fee IS NOT NULL;
  `);

  await db.execute(sql`
    UPDATE payments
    SET vendor_net_payout_amount = vendor_payout
    WHERE vendor_net_payout_amount IS NULL AND vendor_payout IS NOT NULL;
  `);

  await db.execute(sql`
    UPDATE payments
    SET refund_amount = refunded_amount
    WHERE refund_amount IS NULL
      AND refunded_amount IS NOT NULL
      AND refunded_amount > 0;
  `);

  // 2. Drop the legacy columns
  await db.execute(sql`
    ALTER TABLE payments
      DROP COLUMN IF EXISTS platform_fee,
      DROP COLUMN IF EXISTS vendor_payout,
      DROP COLUMN IF EXISTS refunded_amount;
  `);

  console.log("[0042] Legacy payment columns platform_fee, vendor_payout, refunded_amount dropped.");
}

export async function down() {
  // Restore columns (data cannot be restored, but structure is reversible)
  await db.execute(sql`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS platform_fee integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS vendor_payout integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS refunded_amount integer DEFAULT 0;
  `);

  // Backfill from canonical columns so existing rows are consistent
  await db.execute(sql`
    UPDATE payments
    SET
      platform_fee   = COALESCE(platform_fee_amount, 0),
      vendor_payout  = COALESCE(vendor_net_payout_amount, 0),
      refunded_amount = COALESCE(refund_amount, 0);
  `);

  console.log("[0042] down: legacy payment columns restored from canonical values.");
}
