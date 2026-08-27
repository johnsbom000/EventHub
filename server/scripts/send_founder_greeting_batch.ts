/**
 * One-off batch send of the founder-greeting email to vendor signups created
 * after 2026-08-10.
 *
 * DRY-RUN by default — prints the DB host and the exact recipient list (with
 * the greeting each person would get), sends nothing. Re-run with --apply to
 * actually send. Not idempotent: running --apply twice emails everyone twice,
 * so check the dry-run list first and run --apply once.
 *
 * Recipients: users with role='vendor' AND created_at after the cutoff.
 * Internal/test accounts are excluded defensively. Greeting uses a real first
 * name when one exists (users.first_name, else vendor_accounts.owner_first_name),
 * otherwise the generic "Hi, this is Bo Johnson." — never users.name, which
 * often holds an email address or business name.
 *
 * Against PROD:
 *   railway run --service EventHub -- npx tsx server/scripts/send_founder_greeting_batch.ts
 *   railway run --service EventHub -- npx tsx server/scripts/send_founder_greeting_batch.ts --apply
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { sendViaResendRaw } from "../email";
import { founderGreetingTemplate } from "../emails/founderGreeting";

const CUTOFF = "2026-08-11T00:00:00Z"; // "after August 10th"
const REPLY_TO = "support@eventhubglobal.com";

// Internal accounts and test aliases must never receive outreach.
const EXCLUDE_PATTERNS = [
  "johnsbom000%",
  "cassidymalm21%",
  "eventhubglobal@gmail.com",
  "%+test%",
];

function hostOf(url: string | undefined): string {
  if (!url) return "<no DATABASE_URL set>";
  const m = /@([^/:?]+)/.exec(url);
  return m ? m[1] : "<unparseable>";
}

const apply = process.argv.includes("--apply");

async function main() {
  console.log(`DB host: ${hostOf(process.env.DATABASE_URL)}`);
  console.log(`Mode: ${apply ? "APPLY (will send email)" : "dry-run (no sends)"}\n`);

  const result: any = await db.execute(sql`
    select distinct on (lower(u.email))
      u.email,
      u.first_name,
      va.owner_first_name,
      va.business_name,
      u.created_at
    from users u
    left join vendor_accounts va
      on (va.user_id = u.id or lower(va.email) = lower(u.email)) and va.deleted_at is null
    where u.role = 'vendor'
      and u.created_at > ${CUTOFF}
      and not (${sql.join(
        EXCLUDE_PATTERNS.map((p) => sql`lower(u.email) like ${p}`),
        sql` or `
      )})
    order by lower(u.email), va.created_at asc
  `);
  const rows: any[] = (result.rows ?? []).sort(
    (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (rows.length === 0) {
    console.log("No matching vendor signups. Nothing to do.");
    return;
  }

  console.log(`${rows.length} vendor signup(s) after ${CUTOFF.slice(0, 10)}:\n`);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const first = (r.first_name || r.owner_first_name || "").trim() || null;
    const when = r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "—";
    console.log(
      `${String(i + 1).padStart(3)}. ${r.email}  (${r.business_name ?? "—"}, signed up ${when})  greeting: ${
        first ? `"Hi ${first}, …"` : `generic "Hi, …"`
      }`
    );
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to send.");
    return;
  }

  console.log("\nSending…\n");
  let sent = 0;
  const failed: string[] = [];
  for (const r of rows) {
    const first = (r.first_name || r.owner_first_name || "").trim() || null;
    const { subject, html, text } = founderGreetingTemplate({ recipientName: first });
    const res = await sendViaResendRaw({ to: r.email, subject, html, text, replyTo: REPLY_TO });
    if (res.sent) {
      sent++;
      console.log(`  sent  ${r.email}`);
    } else {
      failed.push(`${r.email} — ${res.reason ?? "unknown"}`);
      console.log(`  FAIL  ${r.email} — ${res.reason ?? "unknown"}`);
    }
    // Stay well under Resend's rate limit.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  console.log(`\nDone: ${sent}/${rows.length} sent.`);
  if (failed.length > 0) {
    console.log(`Failed:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
