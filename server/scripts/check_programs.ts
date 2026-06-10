import { sql } from "drizzle-orm";
import { db, pool } from "../db";

async function main() {
  const r1 = await db.execute(sql`SELECT id, business_name, email, is_marquee_vendor, marquee_vendor_number, referral_code FROM vendor_accounts WHERE is_marquee_vendor = true OR marquee_vendor_number IS NOT NULL`);
  console.log("Marquee accounts:", JSON.stringify(r1.rows, null, 2));

  const r2 = await db.execute(sql`SELECT * FROM marquee_email_invites ORDER BY sent_at DESC`);
  console.log("marquee_email_invites count:", r2.rows.length, JSON.stringify(r2.rows, null, 2));

  const r3 = await db.execute(sql`SELECT * FROM founding_email_invites ORDER BY sent_at DESC`);
  console.log("founding_email_invites count:", r3.rows.length, JSON.stringify(r3.rows, null, 2));

  await pool.end();
}

main().catch(console.error);
