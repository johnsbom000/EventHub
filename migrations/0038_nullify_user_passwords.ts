import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Nullify users.password and make the column nullable.
 *
 * Background: mirrors migration 0034 which cleared vendor_accounts.password.
 * Customer authentication now goes through Auth0 (auth0_sub). The password
 * column on users carries stale bcrypt hashes that represent unnecessary attack
 * surface and require every Auth0-created user row to write a placeholder value.
 *
 * Safe to run against production:
 * - Clears all password values first.
 * - Then drops the NOT NULL constraint.
 * - Passwords cannot be restored (intentionally irreversible, same as 0034).
 */
export async function up() {
  // 1. Clear all password values
  await db.execute(sql`
    UPDATE users
    SET password = ''
    WHERE password IS NOT NULL AND password <> '';
  `);

  // 2. Make column nullable — no longer required since Auth0 handles authn
  await db.execute(sql`
    ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
  `);

  console.log("[0038] users.password hashes cleared; column made nullable.");
}

export async function down() {
  // Passwords cannot be restored. We can only re-apply the NOT NULL constraint,
  // which will require callers to write a placeholder value again.
  await db.execute(sql`
    UPDATE users SET password = '' WHERE password IS NULL;
  `);

  await db.execute(sql`
    ALTER TABLE users ALTER COLUMN password SET NOT NULL;
  `);

  console.log("[0038] down: password column made NOT NULL again (values are not restored).");
}
