/**
 * One-time backfill: flip users.role 'customer' → 'vendor' for every user who
 * owns a live vendor account.
 *
 * Context: /api/vendor/provision used to leave users.role as 'customer' and
 * only /api/vendor/onboarding/complete flipped it, so vendors who stalled
 * before finishing the onboarding form were stranded as customers. The
 * provision endpoint now flips role at signup; this script corrects the
 * accounts created before that fix.
 *
 * Matches a vendor account by its user_id link, falling back to lower(email)
 * for accounts orphaned before the link-healing fix. Never touches admins
 * (guarded by role = 'customer'), never touches soft-deleted vendor accounts.
 *
 * DRY-RUN by default — prints the DB host and the exact rows it would change,
 * then exits. Re-run with --apply to write.
 *
 * Against PROD:
 *   railway run --service EventHub -- npx tsx server/scripts/backfill_vendor_roles.ts
 *   railway run --service EventHub -- npx tsx server/scripts/backfill_vendor_roles.ts --apply
 *
 * Against local dev:
 *   npx tsx --env-file .env server/scripts/backfill_vendor_roles.ts [--apply]
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";

function hostOf(url: string | undefined): string {
  if (!url) return "<no DATABASE_URL set>";
  // Hostname only — never the credentials.
  const m = /@([^/:?]+)/.exec(url);
  return m ? m[1] : "<unparseable>";
}

const apply = process.argv.includes("--apply");

// One row per user: their id/email/role plus the live vendor account that
// qualifies them, matched by user_id link or (fallback) case-insensitive email.
const AFFECTED = sql`
  select distinct u.id, u.email, u.role, va.business_name, va.created_at as provisioned_at
  from users u
  join vendor_accounts va
    on (va.user_id = u.id or lower(va.email) = lower(u.email))
  where va.deleted_at is null
    and u.role = 'customer'
  order by va.created_at asc
`;

async function main() {
  console.log(`DB host: ${hostOf(process.env.DATABASE_URL)}`);
  console.log(`Mode: ${apply ? "APPLY (will write)" : "dry-run (no writes)"}\n`);

  const affected: any = await db.execute(AFFECTED);
  const rows: any[] = affected.rows ?? [];

  if (rows.length === 0) {
    console.log("No users need a role fix. Nothing to do.");
    return;
  }

  console.log(`${rows.length} user(s) currently role='customer' with a live vendor account:\n`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const when = r.provisioned_at ? new Date(r.provisioned_at).toISOString().slice(0, 10) : "—";
    console.log(`${String(i + 1).padStart(3)}. ${r.email}  (${r.business_name ?? "—"}, provisioned ${when})`);
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to flip these to role='vendor'.");
    return;
  }

  const result: any = await db.execute(sql`
    update users u
    set role = 'vendor', updated_at = now()
    from vendor_accounts va
    where (va.user_id = u.id or lower(va.email) = lower(u.email))
      and va.deleted_at is null
      and u.role = 'customer'
    returning u.email
  `);
  const updated: any[] = result.rows ?? [];
  console.log(`\nUpdated ${updated.length} user(s) to role='vendor'.`);

  // Confirm nothing matching the predicate remains.
  const remaining: any = await db.execute(AFFECTED);
  console.log(`Remaining mismatched rows: ${(remaining.rows ?? []).length} (expected 0)`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
