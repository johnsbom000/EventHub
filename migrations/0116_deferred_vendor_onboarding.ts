import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
    ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
  `);

  // Backfill existing vendors who already completed onboarding
  // (i.e. have an active profile). They should not see the incomplete banner
  // or be blocked from publishing.
  await db.execute(sql`
    UPDATE vendor_accounts
    SET onboarding_completed_at = now()
    WHERE profile_complete = true
      AND onboarding_completed_at IS NULL;
  `);

  console.log("[0116] Added onboarding_completed_at to vendor_accounts and backfilled existing vendors");
}
