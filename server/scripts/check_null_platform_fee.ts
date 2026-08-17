/**
 * Pre-launch safety check for the commission pricing rollout.
 *
 * Fee amounts are resolved at booking creation and PERSISTED on the booking row.
 * Downstream code treats the stored value as authoritative and now REFUSES to
 * guess a rate when it is missing (server/services/paymentService.ts) — because
 * guessing silently mis-bills. The trade-off is that a booking with a NULL
 * platform_fee can no longer be paid out; it throws instead.
 *
 * `bookings.platform_fee` is declared NOT NULL in the schema, so this should
 * return zero. Verify that against the REAL database before enabling non-zero
 * fee rates. Dev was verified clean (25 bookings, 0 nulls); production was not.
 *
 * A non-zero result is not a blocker by itself — it is a backfill task. Fix the
 * rows, then deploy.
 *
 * Run against production with the prod DATABASE_URL in the environment:
 *   DATABASE_URL='<prod url>' npx tsx server/scripts/check_null_platform_fee.ts
 *
 * Read-only. Executes a single SELECT and writes nothing.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

async function main() {
  const host = (process.env.DATABASE_URL || "").replace(/^.*@([^/]+)\/.*$/, "$1");
  console.log(`Database host: ${host || "(could not parse)"}\n`);

  const result: any = await db.execute(sql`
    SELECT
      count(*)::int                                                AS total_bookings,
      count(*) FILTER (WHERE platform_fee IS NULL)::int             AS null_platform_fee,
      count(*) FILTER (WHERE vendor_payout IS NULL)::int            AS null_vendor_payout,
      count(*) FILTER (WHERE subtotal_amount_cents IS NULL)::int    AS null_subtotal,
      count(*) FILTER (WHERE customer_fee_amount_cents IS NULL)::int AS null_customer_fee
    FROM bookings
  `);

  const row = (result.rows ?? result)[0];
  console.table(row);

  const blocking = Number(row.null_platform_fee) + Number(row.null_vendor_payout);
  if (blocking > 0) {
    console.log(
      `\n✗ ${blocking} booking(s) have a NULL platform_fee or vendor_payout.\n` +
        `  These will THROW rather than pay out once fee rates are non-zero.\n` +
        `  Backfill them before deploying the rate flip.`,
    );
    process.exit(1);
  }

  console.log("\n✓ No NULL platform_fee or vendor_payout rows. Safe to enable fee rates.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
