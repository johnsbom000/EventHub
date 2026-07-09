import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds 'resolving' to the dispute_case_status enum (open | pending_review |
 * resolved | resolving).
 *
 * Why: concurrent opposite dispute resolutions (M11) could both pass their
 * status pre-check and each fire a Stripe settlement before either wrote
 * 'resolved' — a double-settle. The fix claims a case by CAS'ing it to
 * 'resolving' before any Stripe call; 'resolving' is treated as an ACTIVE
 * dispute by payout eligibility so payouts stay blocked mid-settlement.
 *
 * Safe to run against production:
 *   - Adding an enum value is non-destructive; no existing row references it.
 *   - Idempotent: ADD VALUE IF NOT EXISTS + the duplicate_object guard make
 *     re-runs a no-op.
 *
 * Note: `ALTER TYPE ... ADD VALUE` cannot run inside an explicit transaction
 * block. The migration runner (server/migrate.ts) calls up() WITHOUT wrapping
 * it in a transaction, and each db.execute runs in autocommit, so this executes
 * as a standalone statement — matching migrations 0059/0070/0075/0090.
 */
export async function up() {
  await db.execute(sql`
    DO $$
    BEGIN
      ALTER TYPE dispute_case_status ADD VALUE IF NOT EXISTS 'resolving';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END$$;
  `);

  console.log("[0149] Added 'resolving' to dispute_case_status enum.");
}
