/**
 * One-off send of the "your storefront is empty" nudge.
 *
 * Sends through the normal Resend pipeline, so it comes from the real EventHub
 * domain like every other transactional email — not from a personal inbox.
 *
 * SAFETY
 *   - Dry run by DEFAULT. Nothing is sent without an explicit `--send` flag.
 *   - Every recipient it sends to is appended to a receipt file, and anyone
 *     already in that file is skipped on a later run. Re-running is therefore
 *     safe: it will not double-send.
 *   - Exclusions are printed with their reason, so they can be audited rather
 *     than trusted.
 *
 * Usage:
 *   railway run --service EventHub -- npx tsx server/scripts/send_publish_nudge.ts
 *   railway run --service EventHub -- npx tsx server/scripts/send_publish_nudge.ts --send
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { db, pool } from "../db";
import { vendorAccounts, vendorListings } from "@shared/schema";
import { eq, and, isNull, sql, asc } from "drizzle-orm";
import { sendPublishNudgeEmail } from "../email";

const SEND = process.argv.includes("--send");
// `--test <address>` sends exactly ONE message, to that address, using the first
// real recipient's merge values. Used to confirm rendering and Resend config
// before committing to the full run. Bypasses exclusions by design: the whole
// point is to mail the operator, who is otherwise excluded.
const TEST_IDX = process.argv.indexOf("--test");
const TEST_TO = TEST_IDX > -1 ? process.argv[TEST_IDX + 1] : null;
const SERVER_URL = (process.env.APP_URL || "https://eventhubglobal.com").replace(/\/$/, "");
const RECEIPT = path.join(process.cwd(), ".publish-nudge-sent.json");

/**
 * Accounts the operator explicitly chose not to contact: people they know
 * personally, where a templated "why haven't you published" email would be the
 * wrong register. Kept as data, not a heuristic, so it is reviewable.
 */
const DO_NOT_CONTACT = new Set([
  "cassidymalm21@gmail.com",
  "cassidyjdesign@gmail.com",
  "28johnsnaon@washk12.org",
  "n.johnson212010@gmail.com",
]);

/** Never-email accounts: test fixtures, soft-deleted rows, the operator's own. */
function excludeReason(email: string, businessName: string): string | null {
  const e = email.toLowerCase();
  const n = businessName.toLowerCase();
  if (e.endsWith("@eventhub.deleted")) return "deleted account";
  if (e.includes("+test")) return "test alias";
  if (/^test\s*\d*$/i.test(businessName.trim())) return "test account";
  if (e === "johnsbom000@gmail.com" || e === "boman@griffjohnson.com") return "operator account";
  if (n.startsWith("deleted vendor")) return "deleted account";
  if (DO_NOT_CONTACT.has(e)) return "do-not-contact (personal)";
  return null;
}

function hostOf(url: string | undefined): string {
  if (!url) return "<no DATABASE_URL set>";
  const m = /@([^/:?]+)/.exec(url);
  return m ? m[1] : "<unparseable>";
}

function loadReceipt(): Set<string> {
  if (!existsSync(RECEIPT)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(RECEIPT, "utf8"));
    return new Set<string>(Array.isArray(parsed?.sent) ? parsed.sent : []);
  } catch {
    // A corrupt receipt must NOT be treated as "nothing sent yet" — that would
    // re-send to everyone. Fail loudly instead.
    throw new Error(`Receipt file ${RECEIPT} exists but is unreadable. Refusing to run.`);
  }
}

function saveReceipt(sent: Set<string>): void {
  writeFileSync(RECEIPT, JSON.stringify({ sent: Array.from(sent) }, null, 2), "utf8");
}

async function main() {
  console.log(`DB host    : ${hostOf(process.env.DATABASE_URL)}`);
  console.log(`Server URL : ${SERVER_URL}`);
  console.log(`Mode       : ${SEND ? "*** LIVE SEND ***" : "dry run (pass --send to actually send)"}`);
  console.log(`Receipt    : ${RECEIPT}\n`);

  const alreadySent = loadReceipt();
  if (alreadySent.size) console.log(`${alreadySent.size} address(es) already sent in a previous run\n`);

  const rows = await db
    .select({
      businessName: vendorAccounts.businessName,
      email: vendorAccounts.email,
      shopSlug: vendorAccounts.shopSlug,
      createdAt: vendorAccounts.createdAt,
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
      vendorAccounts.businessName,
      vendorAccounts.email,
      vendorAccounts.shopSlug,
      vendorAccounts.createdAt,
    )
    .orderBy(asc(vendorAccounts.createdAt));

  const candidates = rows.filter((r) => r.activeListings === 0);
  const recipients: typeof candidates = [];

  console.log("=== EXCLUDED ===");
  for (const r of candidates) {
    const why = excludeReason(r.email, r.businessName) ??
      (alreadySent.has(r.email.toLowerCase()) ? "already sent" : null) ??
      (!r.shopSlug?.trim() ? "no shop slug (link would break)" : null);
    if (why) {
      console.log(`  ${r.businessName.slice(0, 34).padEnd(34)} ${r.email.padEnd(34)} [${why}]`);
    } else {
      recipients.push(r);
    }
  }

  console.log(`\n=== RECIPIENTS (${recipients.length}) ===`);
  for (const r of recipients) {
    console.log(`  ${r.businessName.slice(0, 34).padEnd(34)} ${r.email.padEnd(34)} /shop/${r.shopSlug}`);
  }

  if (TEST_TO) {
    const sample = recipients[0];
    if (!sample) throw new Error("No recipients to draw sample merge values from.");
    const result = await sendPublishNudgeEmail(TEST_TO, {
      businessName: sample.businessName,
      shopSlug: sample.shopSlug!,
      serverUrl: SERVER_URL,
    });
    console.log(`\nTEST send to ${TEST_TO} using "${sample.businessName}": ${JSON.stringify(result)}`);
    console.log("No receipt written. Nothing sent to real vendors.");
    return;
  }

  if (!SEND) {
    console.log(`\nDry run. Nothing sent. Re-run with --send to deliver to these ${recipients.length}.`);
    return;
  }

  console.log(`\nSending ${recipients.length} email(s)...\n`);
  let ok = 0;
  const failed: Array<{ email: string; reason: string }> = [];

  for (const r of recipients) {
    try {
      const result = await sendPublishNudgeEmail(r.email, {
        businessName: r.businessName,
        shopSlug: r.shopSlug!,
        serverUrl: SERVER_URL,
      });
      // `skipped` means Resend was not configured and NOTHING went out. It must
      // count as a failure, or the receipt would record sends that never
      // happened and the retry would never fire.
      if (!result.sent) {
        const why = result.skipped ? `skipped: ${result.reason ?? "not configured"}` : (result.reason ?? "unknown");
        failed.push({ email: r.email, reason: why });
        console.log(`  FAIL  ${r.email}  (${why})`);
        continue;
      }
      // Stamp immediately per-recipient, not at the end. If the process dies
      // halfway, the receipt still reflects exactly who received one.
      alreadySent.add(r.email.toLowerCase());
      saveReceipt(alreadySent);
      ok++;
      console.log(`  sent  ${r.email}`);
    } catch (err) {
      failed.push({ email: r.email, reason: String(err) });
      console.log(`  FAIL  ${r.email}  (${err})`);
    }
  }

  console.log(`\nSent ${ok}/${recipients.length}`);
  if (failed.length) {
    console.log(`Failed ${failed.length}:`);
    for (const f of failed) console.log(`  ${f.email}: ${f.reason}`);
    console.log(`\nFailures were NOT written to the receipt, so a re-run will retry exactly those.`);
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
