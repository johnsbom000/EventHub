/**
 * Backfill Auth0 users into Neon DB.
 *
 * For every user in Auth0 that has no matching row in the `users` table (matched
 * by email), this script:
 *   1. Creates a `users` row with role "customer" and vendorOnlySignup = true
 *   2. If a matching `vendor_accounts` row already exists (by email or auth0_sub),
 *      links it by setting vendor_accounts.user_id
 *
 * Run with:
 *   npx tsx --env-file .env server/scripts/backfill_auth0_users.ts
 *
 * Requires in .env:
 *   AUTH0_MGMT_CLIENT_ID=<machine-to-machine client id>
 *   AUTH0_MGMT_CLIENT_SECRET=<machine-to-machine client secret>
 */

import { db, pool } from "../db";
import { users, vendorAccounts } from "@shared/schema";
import { eq, isNull, and, sql as drizzleSql } from "drizzle-orm";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID;
const MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET;

if (!AUTH0_DOMAIN || !MGMT_CLIENT_ID || !MGMT_CLIENT_SECRET) {
  console.error(
    "Missing required env vars: AUTH0_DOMAIN, AUTH0_MGMT_CLIENT_ID, AUTH0_MGMT_CLIENT_SECRET"
  );
  process.exit(1);
}

type Auth0User = {
  user_id: string;
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email_verified?: boolean;
};

async function getMgmtToken(): Promise<string> {
  const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: MGMT_CLIENT_ID,
      client_secret: MGMT_CLIENT_SECRET,
      audience: `https://${AUTH0_DOMAIN}/api/v2/`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to get Management API token: ${res.status} ${body}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function getAllAuth0Users(token: string): Promise<Auth0User[]> {
  const all: Auth0User[] = [];
  let page = 0;
  const perPage = 100;

  while (true) {
    const url = `https://${AUTH0_DOMAIN}/api/v2/users?per_page=${perPage}&page=${page}&include_totals=false&fields=user_id,email,name,given_name,family_name,email_verified`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Auth0 user list failed: ${res.status} ${body}`);
    }
    const batch = await res.json() as Auth0User[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }

  return all;
}

function resolveDisplayName(u: Auth0User): string {
  if (u.name && u.name !== u.email) return u.name;
  if (u.given_name || u.family_name)
    return [u.given_name, u.family_name].filter(Boolean).join(" ");
  return u.email.split("@")[0];
}

async function main() {
  console.log("Fetching Management API token…");
  const token = await getMgmtToken();

  console.log("Fetching all Auth0 users…");
  const auth0Users = await getAllAuth0Users(token);
  console.log(`Found ${auth0Users.length} Auth0 user(s).`);

  let created = 0;
  let alreadyExisted = 0;
  let linked = 0;
  let skipped = 0;

  for (const a0 of auth0Users) {
    const email = a0.email?.toLowerCase().trim();
    if (!email) {
      console.log(`  SKIP  (no email) ${a0.user_id}`);
      skipped++;
      continue;
    }

    // Check if a users row already exists.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(drizzleSql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (existing) {
      alreadyExisted++;
      continue;
    }

    const displayName = resolveDisplayName(a0);
    const auth0Sub = a0.user_id;

    // Create the users row.
    const [inserted] = await db
      .insert(users)
      .values({
        name: displayName,
        displayName,
        email,
        role: "customer",
        auth0Sub,
        vendorOnlySignup: true,
        lastLoginAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: users.id });

    if (!inserted) {
      // Race or conflict — another row was inserted between the select and insert.
      alreadyExisted++;
      continue;
    }

    created++;
    console.log(`  CREATED  ${email} (${displayName})`);

    // Try to link an existing vendor account to this new users row.
    const [vendorRow] = await db
      .select({ id: vendorAccounts.id, userId: vendorAccounts.userId })
      .from(vendorAccounts)
      .where(
        and(
          drizzleSql`lower(${vendorAccounts.email}) = ${email}`,
          isNull(vendorAccounts.deletedAt),
          isNull(vendorAccounts.userId)
        )
      )
      .limit(1);

    if (vendorRow) {
      await db
        .update(vendorAccounts)
        .set({ userId: inserted.id })
        .where(eq(vendorAccounts.id, vendorRow.id));
      linked++;
      console.log(`           → linked to vendor account ${vendorRow.id}`);
    }
  }

  console.log("\n── Summary ──────────────────────────────");
  console.log(`  Auth0 users found:   ${auth0Users.length}`);
  console.log(`  Already in DB:       ${alreadyExisted}`);
  console.log(`  Newly created:       ${created}`);
  console.log(`  Vendor rows linked:  ${linked}`);
  console.log(`  Skipped (no email):  ${skipped}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
