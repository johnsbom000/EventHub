import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds google_account_email to vendor_accounts so the dashboard can show
 * which Google account is connected (e.g. "Connected as user@gmail.com").
 * Populated during the OAuth callback via the Google userinfo endpoint.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
    ADD COLUMN IF NOT EXISTS google_account_email varchar
  `);

  console.log("[0087] added google_account_email column to vendor_accounts.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE vendor_accounts
    DROP COLUMN IF EXISTS google_account_email
  `);

  console.log("[0087] down: dropped google_account_email column from vendor_accounts.");
}
