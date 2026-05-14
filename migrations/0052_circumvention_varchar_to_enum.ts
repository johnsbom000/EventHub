import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Convert circumvention_flags free-text columns to typed PostgreSQL enums.
 *
 * Problem: flag_type, content_type, and status were stored as unconstrained
 * varchar. A typo like "Pending" vs "pending" would silently write an invalid
 * value that admin dashboard filters would miss.
 *
 * Enum domains:
 *   circumvention_flag_type:    hard_block_attempt | soft_flag | customer_report
 *   circumvention_content_type: chat_message | listing_description | listing_title
 *                               | vendor_description | tagline
 *   circumvention_flag_status:  pending | dismissed | actioned
 *
 * Safe to run against production:
 *   - Step 1 audits existing values. Any row with a non-conforming value is
 *     reported and the migration aborts — fix the data first.
 *   - Step 2 creates the enum types (idempotent).
 *   - Step 3 alters the columns.
 */
export async function up() {
  // 1. Validate existing values match the expected domains.
  const validFlagTypes = ["hard_block_attempt", "soft_flag", "customer_report"];
  const validContentTypes = [
    "chat_message",
    "listing_description",
    "listing_title",
    "vendor_description",
    "tagline",
  ];
  const validStatuses = ["pending", "dismissed", "actioned"];

  const badFlagTypes: any = await db.execute(sql`
    SELECT DISTINCT flag_type FROM circumvention_flags
    WHERE flag_type NOT IN ('hard_block_attempt','soft_flag','customer_report');
  `);
  const badFlagTypeRows = badFlagTypes?.rows ?? badFlagTypes ?? [];
  if (badFlagTypeRows.length > 0) {
    throw new Error(
      `[0052] circumvention_flags has invalid flag_type values: ` +
      `${badFlagTypeRows.map((r: any) => r.flag_type).join(", ")}. Fix before migrating.`
    );
  }

  const badContentTypes: any = await db.execute(sql`
    SELECT DISTINCT content_type FROM circumvention_flags
    WHERE content_type NOT IN (
      'chat_message','listing_description','listing_title','vendor_description','tagline'
    );
  `);
  const badContentTypeRows = badContentTypes?.rows ?? badContentTypes ?? [];
  if (badContentTypeRows.length > 0) {
    throw new Error(
      `[0052] circumvention_flags has invalid content_type values: ` +
      `${badContentTypeRows.map((r: any) => r.content_type).join(", ")}. Fix before migrating.`
    );
  }

  const badStatuses: any = await db.execute(sql`
    SELECT DISTINCT status FROM circumvention_flags
    WHERE status NOT IN ('pending','dismissed','actioned');
  `);
  const badStatusRows = badStatuses?.rows ?? badStatuses ?? [];
  if (badStatusRows.length > 0) {
    throw new Error(
      `[0052] circumvention_flags has invalid status values: ` +
      `${badStatusRows.map((r: any) => r.status).join(", ")}. Fix before migrating.`
    );
  }

  // 2. Create enum types (idempotent via DO block).
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE circumvention_flag_type AS ENUM (
        'hard_block_attempt', 'soft_flag', 'customer_report'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE circumvention_content_type AS ENUM (
        'chat_message', 'listing_description', 'listing_title',
        'vendor_description', 'tagline'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE circumvention_flag_status AS ENUM (
        'pending', 'dismissed', 'actioned'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // 3. Drop text defaults so PostgreSQL can cast the columns to their enum types.
  //    (PostgreSQL cannot auto-convert a text DEFAULT to an enum during ALTER COLUMN TYPE.)
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      ALTER COLUMN flag_type    DROP DEFAULT,
      ALTER COLUMN content_type DROP DEFAULT,
      ALTER COLUMN status       DROP DEFAULT;
  `);

  // 4. Alter columns to enum types.
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      ALTER COLUMN flag_type    TYPE circumvention_flag_type    USING flag_type::circumvention_flag_type,
      ALTER COLUMN content_type TYPE circumvention_content_type USING content_type::circumvention_content_type,
      ALTER COLUMN status       TYPE circumvention_flag_status  USING status::circumvention_flag_status;
  `);

  // 5. Restore the status default using the enum literal.
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      ALTER COLUMN status SET DEFAULT 'pending'::circumvention_flag_status;
  `);

  console.log("[0052] circumvention_flags varchar columns converted to enums.");
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE circumvention_flags
      ALTER COLUMN flag_type    TYPE varchar USING flag_type::text,
      ALTER COLUMN content_type TYPE varchar USING content_type::text,
      ALTER COLUMN status       TYPE varchar USING status::text;
  `);
  await db.execute(sql`DROP TYPE IF EXISTS circumvention_flag_status;`);
  await db.execute(sql`DROP TYPE IF EXISTS circumvention_content_type;`);
  await db.execute(sql`DROP TYPE IF EXISTS circumvention_flag_type;`);
  console.log("[0052] down: circumvention_flags columns reverted to varchar.");
}
