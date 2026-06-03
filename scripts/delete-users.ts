/**
 * delete-users.ts
 *
 * Permanently deletes specific users from the DB and Auth0.
 * Deletion order:
 *   1. vendorAccounts (cascades → vendorProfiles, listings, etc.)
 *   2. users row (cascades → planningBoards; nulls booking/review FKs)
 *   3. Auth0 account (via Management API, if M2M creds are set)
 *
 * Usage:
 *   npx tsx scripts/delete-users.ts [--dry-run]
 *
 * For Auth0 deletion, set these env vars (M2M app with delete:users permission):
 *   AUTH0_MGMT_CLIENT_ID=...
 *   AUTH0_MGMT_CLIENT_SECRET=...
 */

import * as dotenv from "dotenv";
dotenv.config();

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const EMAILS_TO_DELETE = [
  "cassidymalm21@gmail.com",
  "boman@griffjohnson.com",
];

const DRY_RUN = process.argv.includes("--dry-run");

async function getAuth0ManagementToken(domain: string): Promise<string | null> {
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const resp = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
    }),
  });

  if (!resp.ok) {
    console.error("Failed to get Auth0 management token:", await resp.text());
    return null;
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

async function deleteFromAuth0(domain: string, token: string, auth0Sub: string): Promise<boolean> {
  const encoded = encodeURIComponent(auth0Sub);
  const resp = await fetch(`https://${domain}/api/v2/users/${encoded}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (resp.status === 204 || resp.status === 200) return true;
  console.error(`  Auth0 delete failed for ${auth0Sub}: ${resp.status} ${await resp.text().catch(() => "")}`);
  return false;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const domain = process.env.AUTH0_DOMAIN!;

  if (DRY_RUN) console.log("=== DRY RUN — no changes will be made ===\n");

  // 1. Look up users
  const emailList = EMAILS_TO_DELETE.map((e) => `'${e}'`).join(", ");
  const { rows: users } = await pool.query<{
    id: string;
    email: string;
    name: string;
    role: string;
    auth0_sub: string | null;
  }>(`SELECT id, email, name, role, auth0_sub FROM users WHERE lower(email) = ANY(ARRAY[${EMAILS_TO_DELETE.map((_, i) => `$${i + 1}`).join(",")}])`, EMAILS_TO_DELETE.map((e) => e.toLowerCase()));

  if (users.length === 0) {
    console.log("No matching users found in the database.");
    await pool.end();
    return;
  }

  console.log(`Found ${users.length} user(s):`);
  for (const u of users) {
    console.log(`  - ${u.email} | id=${u.id} | role=${u.role} | auth0_sub=${u.auth0_sub ?? "(none)"}`);
  }

  // 2. Look up their vendor accounts
  const userIds = users.map((u) => u.id);
  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
  const { rows: vendorAccounts } = await pool.query<{
    id: string;
    business_name: string;
    email: string;
    user_id: string;
  }>(`SELECT id, business_name, email, user_id FROM vendor_accounts WHERE user_id = ANY(ARRAY[${placeholders}]) AND deleted_at IS NULL`, userIds);

  if (vendorAccounts.length > 0) {
    console.log(`\nVendor accounts to delete (cascade → profiles, listings, availability, etc.):`);
    for (const va of vendorAccounts) {
      console.log(`  - ${va.business_name} (${va.email}) | id=${va.id}`);
    }
  } else {
    console.log("\nNo active vendor accounts found.");
  }

  console.log(`\nPlanning boards owned by these users will be CASCADE deleted.`);
  console.log(`Bookings, reviews, and other records will have their user FK set to NULL.\n`);

  if (DRY_RUN) {
    console.log("=== DRY RUN complete — re-run without --dry-run to delete ===");
    await pool.end();
    return;
  }

  // 3. Get Auth0 management token (optional)
  const mgmtToken = await getAuth0ManagementToken(domain);
  if (!mgmtToken) {
    console.log("AUTH0_MGMT_CLIENT_ID / AUTH0_MGMT_CLIENT_SECRET not set — will skip Auth0 deletion.");
    console.log("After this script, manually delete these Auth0 subs from the Auth0 dashboard:");
    for (const u of users) {
      if (u.auth0_sub) console.log(`  ${u.auth0_sub}`);
    }
    console.log();
  }

  // 4. Delete vendor profiles first (FK not cascade), then vendor accounts
  if (vendorAccounts.length > 0) {
    const vaIds = vendorAccounts.map((va) => va.id);
    const vaPlaceholders = vaIds.map((_, i) => `$${i + 1}`).join(",");
    const { rowCount: vpDeleted } = await pool.query(
      `DELETE FROM vendor_profiles WHERE account_id = ANY(ARRAY[${vaPlaceholders}])`,
      vaIds
    );
    if ((vpDeleted ?? 0) > 0) console.log(`Deleted ${vpDeleted} vendor profile(s).`);
    const { rowCount: vaDeleted } = await pool.query(
      `DELETE FROM vendor_accounts WHERE id = ANY(ARRAY[${vaPlaceholders}])`,
      vaIds
    );
    console.log(`Deleted ${vaDeleted} vendor account(s) (and cascaded data).`);
  }

  // 5. Delete user rows
  const { rowCount: usersDeleted } = await pool.query(
    `DELETE FROM users WHERE id = ANY(ARRAY[${placeholders}])`,
    userIds
  );
  console.log(`Deleted ${usersDeleted} user row(s) from the database.`);

  // 6. Delete Auth0 accounts
  if (mgmtToken) {
    for (const u of users) {
      if (!u.auth0_sub) {
        console.log(`  Skipping Auth0 for ${u.email} — no auth0_sub on record.`);
        continue;
      }
      const ok = await deleteFromAuth0(domain, mgmtToken, u.auth0_sub);
      if (ok) {
        console.log(`  Deleted Auth0 account: ${u.auth0_sub} (${u.email})`);
      }
    }
  }

  console.log("\nDone.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
