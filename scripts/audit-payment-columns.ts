/**
 * Diagnostic script: audit payments table for legacy vs canonical column parity.
 *
 * NOTE: this script has been superseded by migration 0042 which dropped the
 * legacy columns. It is kept here for reference / future audits.
 *
 * Run with:
 *   node --env-file=.env node_modules/.bin/tsx scripts/audit-payment-columns.ts
 *
 * Background: the payments table had two overlapping sets of financial columns:
 *
 *   LEGACY (dropped)      CANONICAL (kept)
 *   ─────────────────     ────────────────────────
 *   platformFee           platformFeeAmount
 *   vendorPayout          vendorNetPayoutAmount
 *   refundedAmount        refundAmount
 *
 *   NOTE: `amount` ≠ `totalAmount` — different concepts, both kept.
 *
 * Before we can drop the legacy columns we need to confirm both sets agree on
 * every row — or understand and document any discrepancies.
 *
 * Usage:
 *   npx tsx scripts/audit-payment-columns.ts
 *
 * This script is READ-ONLY. It makes no changes to the database.
 */

// dotenv MUST be configured before server/db is imported, because db.ts reads
// DATABASE_URL at module evaluation time. Use dynamic imports below.
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Dynamic imports so DATABASE_URL is set before db.ts initialises
const { db, pool } = await import("../server/db");
const { sql: drizzleSql } = await import("drizzle-orm");

function extractRows<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function dollars(cents: number | null): string {
  if (cents === null) return "NULL";
  return `$${(cents / 100).toFixed(2)}`;
}

async function run() {
  console.log("=".repeat(60));
  console.log("  EventHub — Payments Column Parity Audit");
  console.log("=".repeat(60));

  // ── 1. Row count ──────────────────────────────────────────────
  const totalResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS total FROM payments
  `);
  const total = Number(extractRows<{ total: string }>(totalResult)[0]?.total ?? 0);
  console.log(`\nTotal payment rows: ${fmt(total)}`);
  if (total === 0) {
    console.log("\nNo payment rows found — nothing to audit.\n");
    return;
  }

  // ── 2. amount vs totalAmount ───────────────────────────────────
  const amountResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS diverged
    FROM payments
    WHERE
      -- canonical column is populated AND differs from legacy
      (total_amount IS NOT NULL AND amount != total_amount)
      -- OR canonical is populated but legacy is not (shouldn't happen — amount is NOT NULL)
      OR (total_amount IS NULL AND amount IS NOT NULL)
  `);
  const amountDiverged = Number(extractRows<{ diverged: string }>(amountResult)[0]?.diverged ?? 0);

  const amountNullResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS null_count FROM payments WHERE total_amount IS NULL
  `);
  const amountNull = Number(extractRows<{ null_count: string }>(amountNullResult)[0]?.null_count ?? 0);

  // ── 3. platformFee vs platformFeeAmount ───────────────────────
  const feeResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS diverged
    FROM payments
    WHERE platform_fee_amount IS NOT NULL
      AND platform_fee != platform_fee_amount
  `);
  const feeDiverged = Number(extractRows<{ diverged: string }>(feeResult)[0]?.diverged ?? 0);

  const feeNullResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS null_count FROM payments WHERE platform_fee_amount IS NULL
  `);
  const feeNull = Number(extractRows<{ null_count: string }>(feeNullResult)[0]?.null_count ?? 0);

  // ── 4. vendorPayout vs vendorGrossAmount ──────────────────────
  const payoutResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS diverged
    FROM payments
    WHERE vendor_gross_amount IS NOT NULL
      AND vendor_payout != vendor_gross_amount
  `);
  const payoutDiverged = Number(extractRows<{ diverged: string }>(payoutResult)[0]?.diverged ?? 0);

  const payoutNullResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS null_count FROM payments WHERE vendor_gross_amount IS NULL
  `);
  const payoutNull = Number(extractRows<{ null_count: string }>(payoutNullResult)[0]?.null_count ?? 0);

  // ── 5. refundedAmount vs refundAmount ──────────────────────────
  const refundResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS diverged
    FROM payments
    WHERE refund_amount IS NOT NULL
      AND COALESCE(refunded_amount, 0) != refund_amount
  `);
  const refundDiverged = Number(extractRows<{ diverged: string }>(refundResult)[0]?.diverged ?? 0);

  const refundNullResult: any = await db.execute(drizzleSql`
    SELECT COUNT(*) AS null_count FROM payments WHERE refund_amount IS NULL
  `);
  const refundNull = Number(extractRows<{ null_count: string }>(refundNullResult)[0]?.null_count ?? 0);

  // ── Report ─────────────────────────────────────────────────────
  console.log("\n┌──────────────────────────────┬───────────────┬───────────────┬──────────────────┐");
  console.log("│ Column pair                  │ Canonical NULLs│  Diverged rows│ Verdict          │");
  console.log("├──────────────────────────────┼───────────────┼───────────────┼──────────────────┤");

  function row(label: string, nulls: number, diverged: number): string {
    const verdict =
      nulls === total ? "⚠  NEVER WRITTEN" :
      diverged > 0    ? "✗  MISMATCH"      :
      nulls > 0       ? "△  PARTIAL"       :
                        "✓  SAFE TO DROP";
    return `│ ${label.padEnd(28)} │ ${fmt(nulls).padStart(13)} │ ${fmt(diverged).padStart(13)} │ ${verdict.padEnd(16)} │`;
  }

  console.log(row("amount → totalAmount",      amountNull,  amountDiverged));
  console.log(row("platformFee → feeAmount",   feeNull,     feeDiverged));
  console.log(row("vendorPayout → grossAmount",payoutNull,  payoutDiverged));
  console.log(row("refundedAmount → refundAmt",refundNull,  refundDiverged));
  console.log("└──────────────────────────────┴───────────────┴───────────────┴──────────────────┘");

  const hasAnyDivergence = amountDiverged + feeDiverged + payoutDiverged + refundDiverged > 0;
  const allCanonicalNeverWritten =
    amountNull === total && feeNull === total && payoutNull === total;

  console.log("\n── Interpretation ────────────────────────────────────────");
  if (allCanonicalNeverWritten) {
    console.log("⚠  CANONICAL COLUMNS WERE NEVER WRITTEN.");
    console.log("   The codebase is still writing only to legacy columns.");
    console.log("   Do NOT drop legacy columns yet. Update storage/routes");
    console.log("   to write canonical columns first, then re-run this audit.");
  } else if (hasAnyDivergence) {
    console.log("✗  DISCREPANCIES FOUND. Do not drop legacy columns.");
    console.log("   Review the sample rows below and reconcile manually.");
  } else {
    console.log("✓  All populated canonical values match legacy values.");
    console.log("   It is safe to stop writing legacy columns and plan their removal.");
    if (amountNull > 0 || feeNull > 0 || payoutNull > 0) {
      console.log(`\n   Note: ${fmt(Math.max(amountNull, feeNull, payoutNull))} row(s) have NULL`);
      console.log("   canonical values — likely pre-migration rows. Check whether");
      console.log("   those rows need backfilling before the legacy columns can be dropped.");
    }
  }

  // ── Sample divergent rows (up to 10) ──────────────────────────
  if (hasAnyDivergence) {
    console.log("\n── Sample Divergent Rows (up to 10) ─────────────────────");
    const sampleResult: any = await db.execute(drizzleSql`
      SELECT
        id,
        created_at,
        amount,
        total_amount,
        platform_fee,
        platform_fee_amount,
        vendor_payout,
        vendor_gross_amount,
        coalesce(refunded_amount, 0) AS refunded_amount,
        refund_amount
      FROM payments
      WHERE
        (total_amount IS NOT NULL AND amount != total_amount)
        OR (platform_fee_amount IS NOT NULL AND platform_fee != platform_fee_amount)
        OR (vendor_gross_amount IS NOT NULL AND vendor_payout != vendor_gross_amount)
        OR (refund_amount IS NOT NULL AND coalesce(refunded_amount, 0) != refund_amount)
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const samples = extractRows<any>(sampleResult);
    for (const r of samples) {
      console.log(`\n  id: ${r.id}  created: ${r.created_at}`);
      console.log(`    amount/totalAmount:           ${dollars(r.amount)} / ${dollars(r.total_amount)}`);
      console.log(`    platformFee/feeAmount:        ${dollars(r.platform_fee)} / ${dollars(r.platform_fee_amount)}`);
      console.log(`    vendorPayout/grossAmount:     ${dollars(r.vendor_payout)} / ${dollars(r.vendor_gross_amount)}`);
      console.log(`    refundedAmount/refundAmount:  ${dollars(r.refunded_amount)} / ${dollars(r.refund_amount)}`);
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

run()
  .catch((err: any) => {
    console.error("[audit-payment-columns] failed:", err?.message || err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
