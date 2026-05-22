import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Adds `soft_attempt` to the circumvention_flag_type enum.
 *
 * Previously, every hard-block detection immediately issued a formal warning
 * (counting toward the 3-warning suspension threshold). This migration supports
 * a new escalation ladder:
 *
 *   Soft attempts 1–5  → content blocked, flag logged as soft_attempt, no warning issued
 *   Hard warnings 1–3  → content blocked + formal warning issued (email sent)
 *   After warning 3    → 30-day account suspension
 *
 * ALTER TYPE ... ADD VALUE cannot run inside a transaction in PG < 12.
 * We run it as a standalone statement to stay compatible with older hosts.
 */
export async function up() {
  await db.execute(sql`
    ALTER TYPE circumvention_flag_type ADD VALUE IF NOT EXISTS 'soft_attempt';
  `);

  console.log("[0082] circumvention_flag_type: added 'soft_attempt' value.");
}

export async function down() {
  // PostgreSQL does not support removing enum values without recreating the type.
  // Log a warning rather than leaving a broken down() that silently does nothing.
  console.warn(
    "[0082] down(): cannot remove 'soft_attempt' from circumvention_flag_type enum. " +
    "Manually recreate the enum if a full rollback is required."
  );
}
