import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * One-time backfill: grant every vendor that exists at launch 30 days of
 * complimentary Pro. After 30 days the lazy expiry check in /api/vendor/me drops
 * them to Free unless they've subscribed.
 *
 * Idempotent guard: only touches vendors still at the default 'free' / 'none'
 * state, so re-running never extends a grant or overrides a paid/comp vendor.
 * The migrate runner also tracks applied migrations, so this runs once per
 * environment (including prod, at the moment this feature is deployed).
 */
export async function up() {
  const result: any = await db.execute(sql`
    UPDATE vendor_accounts
    SET
      subscription_plan = 'pro',
      subscription_status = 'comp',
      comp_ends_at = NOW() + INTERVAL '30 days',
      subscription_updated_at = NOW()
    WHERE deleted_at IS NULL
      AND active = true
      AND subscription_plan = 'free'
      AND subscription_status = 'none'
  `);
  const count = typeof result?.rowCount === "number" ? result.rowCount : "?";
  console.log(`[0135] granted 30-day complimentary Pro to ${count} existing vendor(s).`);
}

export async function down() {
  // Data migration: reverting is intentionally a no-op. We cannot reliably tell a
  // backfill-granted comp from one an admin granted later, so we do not strip
  // comp grants on rollback. Use the admin "End comp" tool for specific vendors.
  console.log("[0135] down: no-op (comp grants are not auto-reverted).");
}
