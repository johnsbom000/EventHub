import { sql } from "drizzle-orm";
import { db } from "../server/db";

export async function up() {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_marquee_vendor_number_unique_idx
    ON vendor_accounts (marquee_vendor_number)
    WHERE marquee_vendor_number IS NOT NULL
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendor_accounts_referral_code_unique_idx
    ON vendor_accounts (referral_code)
    WHERE referral_code IS NOT NULL
  `);

  console.log("[0092] added unique indexes on vendor_accounts(marquee_vendor_number) and vendor_accounts(referral_code).");
}

export async function down() {
  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_marquee_vendor_number_unique_idx`);
  await db.execute(sql`DROP INDEX IF EXISTS vendor_accounts_referral_code_unique_idx`);
}
