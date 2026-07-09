import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds 'resolving' to the dispute_case_status enum when that enum exists.
 *
 * Why: concurrent opposite dispute resolutions (M11) could both pass their
 * status pre-check and each fire a Stripe settlement before either wrote
 * 'resolved' — a double-settle. The fix claims a case by CAS'ing it to
 * 'resolving' before any Stripe call; 'resolving' is treated as an ACTIVE
 * dispute by payout eligibility so payouts stay blocked mid-settlement.
 *
 * Some existing databases have dispute_cases.status as text because migration
 * 0078 originally created that column as text. In those environments no enum
 * alteration is needed: text can already store the transient 'resolving' value.
 *
 * Safe to run against production:
 *   - Adding an enum value is non-destructive when the enum exists.
 *   - Text-backed dispute_cases.status databases are detected and left alone.
 *   - Idempotent: ADD VALUE IF NOT EXISTS makes re-runs a no-op.
 *
 * Note: `ALTER TYPE ... ADD VALUE` cannot run inside an explicit transaction
 * block. The migration runner (server/migrate.ts) calls up() WITHOUT wrapping
 * it in a transaction, and the ALTER TYPE below is issued as its own db.execute
 * statement when needed.
 */
export async function up() {
  const enumCheck: any = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'dispute_case_status'
    ) AS exists;
  `);
  const enumExists = Boolean(enumCheck?.rows?.[0]?.exists ?? enumCheck?.[0]?.exists);

  if (!enumExists) {
    const columnCheck: any = await db.execute(sql`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'dispute_cases'
        AND column_name = 'status'
      LIMIT 1;
    `);
    const column = columnCheck?.rows?.[0] ?? columnCheck?.[0];

    if (column?.data_type === "text" || column?.udt_name === "text") {
      console.log("[0149] dispute_cases.status is text-backed; no enum alteration needed.");
      return;
    }

    throw new Error(
      "[0149] dispute_case_status enum not found, and dispute_cases.status is not text-backed."
    );
  }

  await db.execute(sql`
    ALTER TYPE dispute_case_status ADD VALUE IF NOT EXISTS 'resolving';
  `);

  console.log("[0149] Added 'resolving' to dispute_case_status enum.");
}
