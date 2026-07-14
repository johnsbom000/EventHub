/**
 * Repair script for vendors left half-provisioned by the /api/vendor/provision
 * 42P10 bug: `POST /api/vendor/provision` inserted the vendor_accounts row, then
 * threw on `insert into users ... on conflict (email)` because migration 0148
 * dropped the plain unique on users.email (replaced by the lower(email)
 * expression index users_email_ci_unique). The handler was not transactional,
 * so the account committed while the stub vendor_profiles row was never created.
 * Those accounts 404 on PATCH /api/vendor/profile (timezone step) and cannot
 * finish onboarding.
 *
 * This lists every active vendor_accounts row that has NO vendor_profiles row.
 * To avoid touching legacy accounts that predate the bug (their missing profile
 * has a different, older cause), it scopes to accounts created on/after the
 * timestamp migration 0148 was applied in THIS database. If 0148 is not in
 * _migration_history, the 42P10 bug cannot have occurred here, so the script
 * reports only and never applies.
 *
 * The repair mirrors exactly what provisioning should have done: insert the
 * minimal stub profile and point vendor_accounts.active_profile_id at it, in one
 * transaction. Idempotent — an account that already has a profile is skipped, so
 * re-running is safe and an account healed by a client retry won't be touched.
 *
 * Dry-run by default (report only). Pass --apply to perform the repair.
 *
 * Run with:
 *   npx tsx --env-file .env server/scripts/repair_orphaned_vendor_profiles.ts
 *   npx tsx --env-file .env server/scripts/repair_orphaned_vendor_profiles.ts --apply
 */

import { db, pool } from "../db";
import { eq } from "drizzle-orm";
import { vendorAccounts, vendorProfiles } from "@shared/schema";

const APPLY = process.argv.includes("--apply");

type OrphanRow = {
  id: string;
  business_name: string | null;
  created_at: string;
  user_id: string | null;
  active_profile_id: string | null;
};

function dbHost(): string {
  const url = process.env.DATABASE_URL || "";
  const m = url.match(/@([^/:?]+)/);
  return m ? m[1] : "(unknown host)";
}

async function main() {
  console.log(`[repair-orphaned-profiles] DB host: ${dbHost()}`);
  console.log(`[repair-orphaned-profiles] mode: ${APPLY ? "APPLY" : "DRY-RUN (report only)"}\n`);

  // When was migration 0148 applied here? That is the earliest a provision could
  // have hit the 42P10 bug, so it is the cutoff for attributable orphans.
  const cutoffRes = await pool.query<{ applied_at: string }>(
    `select applied_at from _migration_history where name like '%0148%' order by applied_at limit 1`
  );
  const cutoff = cutoffRes.rows[0]?.applied_at ?? null;

  if (!cutoff) {
    console.warn(
      "[repair-orphaned-profiles] Migration 0148 is NOT in _migration_history here.\n" +
        "  The 42P10 provision bug requires 0148, so it cannot have occurred in this DB.\n" +
        "  Any orphaned accounts below have a different (older) cause — REPORT ONLY, no repair.\n"
    );
  } else {
    console.log(`[repair-orphaned-profiles] 0148 applied at ${cutoff} — scoping to accounts created on/after this.\n`);
  }

  const orphansRes = await pool.query<OrphanRow>(
    `select va.id, va.business_name, va.created_at, va.user_id, va.active_profile_id
       from vendor_accounts va
      where va.deleted_at is null
        and not exists (select 1 from vendor_profiles vp where vp.account_id = va.id)
        ${cutoff ? "and va.created_at >= $1" : ""}
      order by va.created_at desc`,
    cutoff ? [cutoff] : []
  );

  const orphans = orphansRes.rows;
  console.log(`[repair-orphaned-profiles] Found ${orphans.length} half-provisioned account(s):`);
  for (const o of orphans) {
    console.log(
      `  - ${o.id}  "${o.business_name ?? "(no name)"}"  created ${o.created_at}  ` +
        `userId=${o.user_id ?? "NULL"}  activeProfileId=${o.active_profile_id ?? "NULL"}`
    );
  }
  console.log("");

  if (orphans.length === 0) {
    console.log("[repair-orphaned-profiles] Nothing to repair.");
    return;
  }

  if (!APPLY || !cutoff) {
    console.log(
      `[repair-orphaned-profiles] Dry-run — no changes made. ` +
        `${cutoff ? "Re-run with --apply to repair." : "Repair disabled (0148 not applied here)."}`
    );
    return;
  }

  let repaired = 0;
  for (const o of orphans) {
    const profileName = (o.business_name ?? "").trim() || "Your Business";
    // Re-check inside the transaction so an account healed by a concurrent client
    // retry is never double-inserted.
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: vendorProfiles.id })
        .from(vendorProfiles)
        .where(eq(vendorProfiles.accountId, o.id))
        .limit(1);
      if (existing.length > 0) {
        console.log(`  ~ ${o.id} already has a profile (healed elsewhere) — skipped`);
        return;
      }
      const [profile] = await tx
        .insert(vendorProfiles)
        .values({
          accountId: o.id,
          profileName,
          experience: 0,
          address: "",
          city: "",
          travelMode: "travel-to-guests",
          serviceDescription: "",
        })
        .returning();
      await tx
        .update(vendorAccounts)
        .set({ activeProfileId: profile.id })
        .where(eq(vendorAccounts.id, o.id));
      repaired += 1;
      console.log(`  ✓ ${o.id} repaired — profile ${profile.id} created and linked`);
    });
  }

  console.log(`\n[repair-orphaned-profiles] Done. Repaired ${repaired} account(s).`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[repair-orphaned-profiles] FAILED:", err);
    await pool.end();
    process.exit(1);
  });
