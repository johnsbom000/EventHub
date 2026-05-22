import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds dispute response support to the dispute_cases / dispute_filings system.
 *
 * Changes:
 * 1. dispute_filing_dispute_type enum — adds "response_to_dispute" value so
 *    the admin timeline can badge responses distinctly from original filings.
 * 2. dispute_filings — adds is_response boolean (default false) to mark which
 *    filings are responses vs original filings.
 * 3. dispute_cases — adds response_deadline_at timestamp so each case knows
 *    when the 72-hour response window closes. Backfills existing rows to
 *    created_at + 72 hours (those deadlines will already be passed for real
 *    data, which is intentional — no retroactive responses).
 */
export async function up() {
  // dispute_filings.filed_by and dispute_type are plain text columns (not PG enums),
  // so no enum alteration is needed — 'response_to_dispute' is a valid text value as-is.

  // 1. Add is_response to dispute_filings
  await db.execute(sql`
    alter table dispute_filings
      add column if not exists is_response boolean not null default false;
  `);

  // 2. Add response_deadline_at to dispute_cases + backfill
  await db.execute(sql`
    alter table dispute_cases
      add column if not exists response_deadline_at timestamptz;
  `);

  await db.execute(sql`
    update dispute_cases
      set response_deadline_at = created_at + interval '72 hours'
      where response_deadline_at is null;
  `);

  console.log("[0085] Added is_response to dispute_filings, response_deadline_at to dispute_cases.");
}

export async function down() {
  await db.execute(sql`
    alter table dispute_cases
      drop column if exists response_deadline_at;

    alter table dispute_filings
      drop column if exists is_response;
  `);

  // Note: PostgreSQL does not support removing enum values; the
  // response_to_dispute value is left in place on rollback.
  console.log("[0085] down(): removed response_deadline_at and is_response. Enum value cannot be removed in PostgreSQL.");
}
