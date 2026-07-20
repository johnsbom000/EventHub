import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Add users.first_name / users.last_name — structured name fields for customer
 * profiles. Previously a customer only had `name` (often the raw email for
 * email-provisioned accounts) and an optional free-form `display_name`. The
 * profile now collects First name + Last name separately, and `display_name`
 * defaults to "First Last" but can be overridden. Reviews render `display_name`.
 *
 * BACKFILL: populate first_name/last_name from an existing real name so current
 * customers don't start blank. We split `display_name` (preferred) or `name`,
 * but ONLY when it is a real name — never an email address (`@`), which would
 * leak the email into the name fields. First token -> first_name, remainder ->
 * last_name. Idempotent: only fills rows where both columns are still null.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS + null-guarded backfill.
 */
export async function up() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS first_name text,
      ADD COLUMN IF NOT EXISTS last_name text
  `);

  const result: any = await db.execute(sql`
    WITH source AS (
      SELECT
        id,
        btrim(coalesce(nullif(btrim(display_name), ''), name)) AS full_name
      FROM users
      WHERE first_name IS NULL
        AND last_name IS NULL
    ),
    parsed AS (
      SELECT
        id,
        full_name,
        regexp_split_to_array(regexp_replace(full_name, '\\s+', ' ', 'g'), ' ') AS parts
      FROM source
      WHERE full_name IS NOT NULL
        AND full_name <> ''
        AND position('@' in full_name) = 0
    )
    UPDATE users u
    SET
      first_name = parsed.parts[1],
      last_name = CASE
        WHEN array_length(parsed.parts, 1) > 1
          THEN array_to_string(parsed.parts[2:array_length(parsed.parts, 1)], ' ')
        ELSE NULL
      END
    FROM parsed
    WHERE u.id = parsed.id
  `);

  const count = typeof result?.rowCount === "number" ? result.rowCount : "?";
  console.log(
    `[0160] users.first_name/last_name added; backfilled ${count} row(s) from existing real names.`
  );
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      DROP COLUMN IF EXISTS first_name,
      DROP COLUMN IF EXISTS last_name
  `);

  console.log("[0160] down: users.first_name/last_name dropped.");
}
