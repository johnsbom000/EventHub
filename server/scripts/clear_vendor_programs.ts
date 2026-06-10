/**
 * One-off script: removes all marquee and founding vendor statuses from production.
 * Also clears all invite tokens, email invite logs, and vendor referrals.
 *
 * Run with: npx tsx --env-file=.env server/scripts/clear_vendor_programs.ts
 */

import { sql } from "drizzle-orm";
import { db, pool } from "../db";

async function main() {
  console.log("Starting vendor program cleanup...\n");

  // 1. Reset all marquee fields on vendor_accounts
  const marqueeResult = await db.execute(sql`
    UPDATE vendor_accounts SET
      is_marquee_vendor                    = false,
      marquee_vendor_number                = NULL,
      marquee_holiday_bookings_used        = 0,
      marquee_holiday_bonus_bookings       = 0,
      marquee_activated_at                 = NULL,
      marquee_holiday_ends_at              = NULL,
      marquee_rate_ends_at                 = NULL,
      marquee_customer_fee_ends_at         = NULL,
      marquee_visibility_ends_at           = NULL,
      marquee_consecutive_inactive_months  = 0
    WHERE is_marquee_vendor = true
  `);
  console.log(`Marquee vendor accounts reset: ${marqueeResult.rowCount ?? 0}`);

  // 2. Reset all founding fields on vendor_accounts
  const foundingResult = await db.execute(sql`
    UPDATE vendor_accounts SET
      is_founding_vendor                        = false,
      founding_vendor_number                    = NULL,
      founding_benefit_bookings_used            = 0,
      founding_benefits_activated_at            = NULL,
      founding_holiday_ends_at                  = NULL,
      founding_rate_ends_at                     = NULL,
      founding_visibility_ends_at               = NULL,
      founding_referral_bonus_bookings_remaining = 0
    WHERE is_founding_vendor = true
  `);
  console.log(`Founding vendor accounts reset: ${foundingResult.rowCount ?? 0}`);

  // 3. Clear invite token tables
  const fviResult = await db.execute(sql`DELETE FROM founding_vendor_invites`);
  console.log(`Founding vendor invite tokens deleted: ${fviResult.rowCount ?? 0}`);

  const mviResult = await db.execute(sql`DELETE FROM marquee_vendor_invites`);
  console.log(`Marquee vendor invite tokens deleted: ${mviResult.rowCount ?? 0}`);

  // 4. Clear email invite logs
  const meiResult = await db.execute(sql`DELETE FROM marquee_email_invites`);
  console.log(`Marquee email invites deleted: ${meiResult.rowCount ?? 0}`);

  const feiResult = await db.execute(sql`DELETE FROM founding_email_invites`);
  console.log(`Founding email invites deleted: ${feiResult.rowCount ?? 0}`);

  // 5. Clear vendor referrals
  const vrResult = await db.execute(sql`DELETE FROM vendor_referrals`);
  console.log(`Vendor referrals deleted: ${vrResult.rowCount ?? 0}`);

  console.log("\nDone. All vendor program data has been cleared.");
  await pool.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
