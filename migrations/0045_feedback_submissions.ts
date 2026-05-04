import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Feedback submissions — feature requests and bug reports from customers and vendors.
 *
 * Adds one table to store user-submitted feedback.
 * Admins can flag important submissions for follow-up.
 *
 * Safe to run against production:
 *  - CREATE TYPE uses IF NOT EXISTS (PG 9.6+).
 *  - CREATE TABLE uses IF NOT EXISTS.
 *  - No existing rows modified.
 */
export async function up() {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE feedback_type AS ENUM ('feature_request', 'bug_report');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS feedback_submissions (
      id                              varchar   PRIMARY KEY DEFAULT gen_random_uuid(),
      type                            feedback_type NOT NULL,
      title                           text      NOT NULL,
      description                     text      NOT NULL,
      attachment_url                  text,
      submitted_by_user_id            varchar   REFERENCES users(id)            ON DELETE SET NULL,
      submitted_by_vendor_account_id  varchar   REFERENCES vendor_accounts(id)  ON DELETE SET NULL,
      submitter_role                  text      NOT NULL,
      submitter_name                  text,
      submitter_email                 text,
      flagged                         boolean   NOT NULL DEFAULT false,
      flagged_at                      timestamp,
      created_at                      timestamp NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS feedback_submissions_type_idx
      ON feedback_submissions (type, created_at DESC);

    CREATE INDEX IF NOT EXISTS feedback_submissions_flagged_idx
      ON feedback_submissions (flagged, created_at DESC);
  `);

  console.log("[0045] feedback_submissions table created.");
}

export async function down() {
  await db.execute(sql`
    DROP TABLE IF EXISTS feedback_submissions;
    DROP TYPE IF EXISTS feedback_type;
  `);
}
