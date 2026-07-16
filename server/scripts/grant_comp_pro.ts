/**
 * Grant complimentary ("comp") Pro to one or more vendor accounts by email.
 *
 * Mirrors the admin endpoint POST /api/admin/vendors/:id/grant-comp exactly:
 * sets subscription_plan='pro', subscription_status='comp',
 * comp_ends_at = now + N days, subscription_updated_at = now. DB-only; never
 * touches Stripe. Idempotent — re-running just refreshes the end date.
 *
 * Looks a vendor up by lower(email) on either vendor_accounts.email or the
 * linked users.email. Skips (does not create) if no vendor account exists.
 *
 * DRY-RUN BY DEFAULT. Prints the intended change and writes nothing unless you
 * pass --apply.
 *
 * Run (dry run):
 *   DATABASE_URL='<url>' npx tsx server/scripts/grant_comp_pro.ts a@x.com b@y.com
 * Apply:
 *   DATABASE_URL='<url>' npx tsx server/scripts/grant_comp_pro.ts --apply a@x.com b@y.com
 * Optional: --days=90 (default 365, clamped 1..365)
 */

import { db, pool } from "../db";
import { vendorAccounts, users } from "@shared/schema";
import { and, eq, isNull, sql as drizzleSql } from "drizzle-orm";

async function main() {
  const rawArgs = process.argv.slice(2);
  const apply = rawArgs.includes("--apply");
  const daysArg = rawArgs.find((a) => a.startsWith("--days="));
  const days = Math.max(1, Math.min(365, daysArg ? parseInt(daysArg.split("=")[1], 10) || 365 : 365));
  const emails = rawArgs
    .filter((a) => !a.startsWith("--"))
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    console.error("No emails provided. Usage: [--apply] [--days=365] <email> [email...]");
    process.exit(1);
  }

  // Show which DB we're hitting (host only — never the full URL with creds).
  const host = (() => {
    try { return new URL(process.env.DATABASE_URL as string).host; } catch { return "unknown"; }
  })();
  const compEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  console.log(`DB host:  ${host}`);
  console.log(`Mode:     ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`Grant:    ${days} days → comp_ends_at ${compEndsAt.toISOString()}`);
  console.log(`Targets:  ${emails.join(", ")}`);
  console.log("");

  for (const email of emails) {
    const matches = await db
      .select({
        id: vendorAccounts.id,
        vaEmail: vendorAccounts.email,
        businessName: vendorAccounts.businessName,
        active: vendorAccounts.active,
        plan: vendorAccounts.subscriptionPlan,
        status: vendorAccounts.subscriptionStatus,
        compEndsAt: vendorAccounts.compEndsAt,
        userEmail: users.email,
      })
      .from(vendorAccounts)
      .leftJoin(users, eq(vendorAccounts.userId, users.id))
      .where(
        and(
          isNull(vendorAccounts.deletedAt),
          drizzleSql`(lower(${vendorAccounts.email}) = ${email} OR lower(${users.email}) = ${email})`
        )
      );

    if (matches.length === 0) {
      console.log(`❌ ${email} — NO vendor account found (skipped). They may have signed up as a customer only.`);
      continue;
    }
    if (matches.length > 1) {
      console.log(`⚠️  ${email} — ${matches.length} vendor accounts matched; acting on all active, non-deleted ones.`);
    }

    for (const v of matches) {
      const before = `plan=${v.plan}, status=${v.status}, compEndsAt=${v.compEndsAt ? new Date(v.compEndsAt).toISOString() : "null"}`;
      console.log(`• ${email} → vendor ${v.id} (${v.businessName ?? "—"}, active=${v.active})`);
      console.log(`    before: ${before}`);

      if (!apply) {
        console.log(`    would set: plan=pro, status=comp, compEndsAt=${compEndsAt.toISOString()}`);
        continue;
      }

      const [updated] = await db
        .update(vendorAccounts)
        .set({
          subscriptionPlan: "pro",
          subscriptionStatus: "comp",
          compEndsAt,
          subscriptionUpdatedAt: new Date(),
          // Manual grants are exempt from the launch-campaign publish stipulation
          // (the enforcement job only targets comp_source='launch_2026').
          compSource: "manual",
          // Fresh grant → fresh pre-expiry reminders + publish-stipulation state.
          compReminder7dSentAt: null,
          compReminder1dSentAt: null,
          compPublishNudgeSentAt: null,
          compRevokedAt: null,
        })
        .where(and(eq(vendorAccounts.id, v.id), isNull(vendorAccounts.deletedAt)))
        .returning({
          id: vendorAccounts.id,
          plan: vendorAccounts.subscriptionPlan,
          status: vendorAccounts.subscriptionStatus,
          compEndsAt: vendorAccounts.compEndsAt,
        });

      if (updated) {
        console.log(`    ✅ after:  plan=${updated.plan}, status=${updated.status}, compEndsAt=${updated.compEndsAt ? new Date(updated.compEndsAt).toISOString() : "null"}`);
      } else {
        console.log(`    ❌ update affected 0 rows (unexpected)`);
      }
    }
  }
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
