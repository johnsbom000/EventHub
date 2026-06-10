import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drop the legacy password columns from users and vendor_accounts.
 *
 * Background:
 * - vendor_accounts.password was cleared by migration 0034 (Auth0 adoption).
 * - users.password was always a bcrypt hash of a random UUID — never used
 *   for authentication; all auth flows through Auth0.
 * - Neither column is read or checked anywhere in the application.
 *
 * Dropping both removes unnecessary attack surface and dead schema.
 */
export async function up() {
  await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS password`);
  console.log("[0035] Dropped users.password");

  await db.execute(sql`ALTER TABLE vendor_accounts DROP COLUMN IF EXISTS password`);
  console.log("[0035] Dropped vendor_accounts.password");
}

export async function down() {
  // Passwords cannot be restored — this migration is intentionally irreversible.
  console.log("[0035] down: passwords cannot be restored, no-op.");
}
