import { sql } from "drizzle-orm";
import { db } from "../server/db";

/**
 * Drops the Founding Vendor and Marquee Vendor programs.
 *
 * Both programs are retired. Before writing this migration the whole tree was
 * audited and they were already inert:
 *   - No admin UI, no grant path, no invite-issuing endpoint, no search boost.
 *   - No job, no test, and no locale string referenced them.
 *   - CRUCIALLY, they had NO effect on money. resolveFeeRates() in
 *     server/services/feeRatesService.ts never read is_founding_vendor,
 *     is_marquee_vendor, or any of the *_rate_ends_at / *_customer_fee_ends_at
 *     columns. Fee rates come from the pricing model + vendor_accounts.fee_exempt
 *     (migration 0164) and nothing else, so dropping these cannot change what any
 *     vendor or customer is charged.
 *   - vendor_referrals was only ever imported (never queried) by 7 routers, and
 *     the two invite-token tables were only reachable from a stub endpoint that
 *     returned `{ valid: false, expired: true }` unconditionally.
 *
 * Kept deliberately: vendor_accounts.referral_code and its unique index. The
 * referral CODE is captured at onboarding independently of these programs and its
 * future is undecided. Only the vendor_referrals ledger (which nothing wrote to)
 * goes away here.
 *
 * Data loss is real but accepted: the invite/referral rows record redemptions of
 * benefits that no longer exist and no longer pay out.
 *
 * Ordering note for a FRESH database: migrations 0089/0090/0092/0099–0104 still
 * CREATE these objects and 0115/0118 still ALTER them with unguarded statements.
 * That is fine — those all run BEFORE this one, so the objects exist when they
 * execute, and this migration only removes them afterwards. Do not delete or
 * retro-edit 0089–0118; doing so would break 0115/0118 on a fresh DB.
 *
 * Idempotent: every statement is IF EXISTS, and DROP TABLE ordering does not
 * matter because none of these tables are referenced by FK from anything that
 * survives (vendor_referrals points AT vendor_accounts, not the reverse).
 */
export async function up() {
  // Indexes first — dropping the columns would take them anyway, but be explicit.
  // Both exist on a fresh DB: 0092 creates the marquee one, and 0101 re-creates
  // the founding one AFTER 0090 renamed it away, so the two coexist.
  await db.execute(sql`
    DROP INDEX IF EXISTS vendor_accounts_marquee_vendor_number_unique_idx
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS vendor_accounts_founding_vendor_number_unique_idx
  `);

  await db.execute(sql`
    ALTER TABLE IF EXISTS vendor_accounts
      DROP COLUMN IF EXISTS is_marquee_vendor,
      DROP COLUMN IF EXISTS marquee_vendor_number,
      DROP COLUMN IF EXISTS marquee_holiday_bookings_used,
      DROP COLUMN IF EXISTS marquee_holiday_bonus_bookings,
      DROP COLUMN IF EXISTS marquee_activated_at,
      DROP COLUMN IF EXISTS marquee_holiday_ends_at,
      DROP COLUMN IF EXISTS marquee_rate_ends_at,
      DROP COLUMN IF EXISTS marquee_customer_fee_ends_at,
      DROP COLUMN IF EXISTS marquee_visibility_ends_at,
      DROP COLUMN IF EXISTS marquee_consecutive_inactive_months,
      DROP COLUMN IF EXISTS is_founding_vendor,
      DROP COLUMN IF EXISTS founding_vendor_number,
      DROP COLUMN IF EXISTS founding_benefit_bookings_used,
      DROP COLUMN IF EXISTS founding_benefits_activated_at,
      DROP COLUMN IF EXISTS founding_holiday_ends_at,
      DROP COLUMN IF EXISTS founding_rate_ends_at,
      DROP COLUMN IF EXISTS founding_visibility_ends_at,
      DROP COLUMN IF EXISTS founding_referral_bonus_bookings_remaining
  `);

  await db.execute(sql`DROP TABLE IF EXISTS vendor_referrals`);
  await db.execute(sql`DROP TABLE IF EXISTS founding_vendor_invites`);
  await db.execute(sql`DROP TABLE IF EXISTS marquee_vendor_invites`);
  await db.execute(sql`DROP TABLE IF EXISTS marquee_email_invites`);
  await db.execute(sql`DROP TABLE IF EXISTS founding_email_invites`);

  // Enum was only used by vendor_referrals.status, which is now gone.
  await db.execute(sql`DROP TYPE IF EXISTS vendor_referral_status`);

  console.log(
    "[0166] Founding/Marquee vendor programs dropped: 18 vendor_accounts columns, 5 tables, 1 enum, 1 index. referral_code kept."
  );
}

/**
 * No down(). This is a destructive retirement of dead features — recreating empty
 * tables and all-default columns would restore the shape but not the data, which
 * is worse than useless (code no longer reads any of it). To roll back, revert
 * the application commit; the leftover columns/tables are harmless if re-added by
 * re-running 0089–0104.
 */
