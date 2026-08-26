/**
 * Reconcile publish_nudge_sent_at against who actually received the email.
 *
 * Migration 0167 backfills EVERY vendor existing at migration time as
 * already-nudged. That is correct only if everyone existing has in fact been
 * nudged. Vendors who signed up between the manual send (2026-08-25) and the
 * migration running have NOT been, so the blanket backfill would suppress them
 * forever.
 *
 * This checks both directions and can repair the second:
 *   - Everyone in the manual-send receipt MUST be stamped. If one is not, the
 *     job would email them a second time. Reported as a hard error.
 *   - Anyone stamped who is NOT in the receipt and has never been emailed is
 *     clearing-eligible: --repair sets them back to NULL so the job picks them
 *     up on its normal schedule.
 *
 * Read-only unless --repair is passed.
 *
 *   railway run --service EventHub -- npx tsx server/scripts/verify_publish_nudge_stamps.ts
 *   railway run --service EventHub -- npx tsx server/scripts/verify_publish_nudge_stamps.ts --repair
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { db, pool } from "../db";
import { vendorAccounts, vendorListings } from "@shared/schema";
import { eq, and, isNull, sql, inArray, asc } from "drizzle-orm";

const REPAIR = process.argv.includes("--repair");
const RECEIPT = path.join(process.cwd(), ".publish-nudge-sent.json");

function hostOf(url: string | undefined): string {
  const m = /@([^/:?]+)/.exec(url ?? "");
  return m ? m[1] : "<unparseable>";
}

function loadReceipt(): Set<string> {
  if (!existsSync(RECEIPT)) {
    throw new Error(
      `No receipt at ${RECEIPT}. Refusing to run: without it there is no record of who was already emailed, and repairing blind could re-send.`,
    );
  }
  const parsed = JSON.parse(readFileSync(RECEIPT, "utf8"));
  return new Set<string>((parsed?.sent ?? []).map((e: string) => e.toLowerCase()));
}

async function main() {
  console.log(`DB host : ${hostOf(process.env.DATABASE_URL)}`);
  console.log(`Mode    : ${REPAIR ? "*** REPAIR ***" : "verify only"}\n`);

  const received = loadReceipt();
  console.log(`Receipt records ${received.size} address(es) actually emailed on 2026-08-25\n`);

  const rows = await db
    .select({
      id: vendorAccounts.id,
      email: vendorAccounts.email,
      businessName: vendorAccounts.businessName,
      createdAt: vendorAccounts.createdAt,
      stampedAt: vendorAccounts.publishNudgeSentAt,
      activeListings: sql<number>`count(${vendorListings.id})`.mapWith(Number),
    })
    .from(vendorAccounts)
    .leftJoin(
      vendorListings,
      and(eq(vendorListings.accountId, vendorAccounts.id), eq(vendorListings.status, "active")),
    )
    .where(isNull(vendorAccounts.deletedAt))
    .groupBy(
      vendorAccounts.id,
      vendorAccounts.email,
      vendorAccounts.businessName,
      vendorAccounts.createdAt,
      vendorAccounts.publishNudgeSentAt,
    )
    .orderBy(asc(vendorAccounts.createdAt));

  // ── Direction 1: everyone emailed MUST be stamped ────────────────────────
  const emailedButUnstamped = rows.filter(
    (r) => received.has(r.email.toLowerCase()) && r.stampedAt == null,
  );
  console.log("=== Were all 2026-08-25 recipients stamped? ===");
  if (emailedButUnstamped.length === 0) {
    const stamped = rows.filter((r) => received.has(r.email.toLowerCase()) && r.stampedAt != null);
    console.log(`  YES — all ${stamped.length}/${received.size} are stamped. They cannot be emailed again.\n`);
  } else {
    console.log(`  *** NO — ${emailedButUnstamped.length} would receive a DUPLICATE: ***`);
    for (const r of emailedButUnstamped) console.log(`    ${r.businessName} <${r.email}>`);
    console.log("");
  }

  // ── Direction 2: stamped-but-never-emailed, and still unpublished ────────
  const suppressed = rows.filter(
    (r) =>
      r.stampedAt != null &&
      !received.has(r.email.toLowerCase()) &&
      r.activeListings === 0 &&
      !/\+test|@eventhub\.deleted/i.test(r.email),
  );

  console.log("=== Stamped but never actually emailed (would be silently suppressed) ===");
  if (!suppressed.length) {
    console.log("  none\n");
  } else {
    for (const r of suppressed) {
      const signed = r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "—";
      console.log(`  signed ${signed}  ${r.businessName.padEnd(30)} <${r.email}>`);
    }
    console.log("");
  }

  if (!REPAIR) {
    if (suppressed.length) {
      console.log(`Pass --repair to clear the stamp on those ${suppressed.length}, so the job emails them normally.`);
    }
    return;
  }

  if (!suppressed.length) {
    console.log("Nothing to repair.");
    return;
  }

  // Clear ONLY the specific ids listed above. Never a blanket UPDATE.
  const ids = suppressed.map((r) => r.id);
  await db
    .update(vendorAccounts)
    .set({ publishNudgeSentAt: null })
    .where(inArray(vendorAccounts.id, ids));
  console.log(`Cleared publish_nudge_sent_at for ${ids.length} vendor(s). The job will now nudge them at their local 8am.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
