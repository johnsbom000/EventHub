import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Nullify the legacy bcrypt password column on vendor_accounts.
 *
 * Background: vendor_accounts.password was used before Auth0 was adopted.
 * All active vendor logins now go through Auth0; these stale hashes are
 * no longer used for authentication and represent unnecessary attack surface
 * if the database is ever compromised.
 *
 * We null the values here but keep the column so the schema stays valid.
 * A follow-up migration can drop the column once confirmed safe.
 */
export async function up() {
  // Null out all legacy bcrypt hashes.
  await db.execute(sql`
    update vendor_accounts
    set password = ''
    where password is not null and password <> '';
  `);

  console.log("[0034] Legacy vendor_accounts password hashes cleared.");
}

export async function down() {
  // Passwords cannot be restored — this migration is intentionally irreversible.
  console.log("[0034] down: passwords cannot be restored, no-op.");
}
