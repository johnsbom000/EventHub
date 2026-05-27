import { db } from "../db";
import { eq, and, sql as drizzleSql } from "drizzle-orm";
import { users, vendorAccounts } from "@shared/schema";
import { requireDualAuthAuth0 } from "../auth";
import { resolveVendorAccountForAuth0Identity } from "../auth";
import { asTrimmedString, extractRows } from "../lib/routeUtils";

export function requireCustomerAnyAuth(req: any, res: any, next: any) {
  return requireDualAuthAuth0(req, res, next);
}

export function isMachineGeneratedCustomerName(value: unknown): boolean {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return true;
  if (/^auth0[_-]/i.test(name)) return true;
  if (/^auth0[_-]?google[_-]?oauth2[_-]?\d+$/i.test(name)) return true;
  if (/^google[_-]?oauth2[_-]?\d+$/i.test(name)) return true;
  if (/^[a-z0-9_]{28,}$/i.test(name) && /\d/.test(name)) return true;
  return false;
}

export function isSyntheticAuth0LocalEmail(value: unknown): boolean {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email) return false;
  if (!email.endsWith("@eventhub.local")) return false;
  const local = email.split("@")[0] || "";
  return local.startsWith("auth0_");
}

export function normalizeIdentityEmailCandidate(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return undefined;
  if (isSyntheticAuth0LocalEmail(normalized)) return undefined;
  return normalized;
}

export async function resolveCanonicalIdentityEmail(params: {
  sub?: string;
  auth0Email?: string;
  userId?: string;
}): Promise<string | undefined> {
  const auth0Email = normalizeIdentityEmailCandidate(params.auth0Email);
  if (auth0Email) return auth0Email;

  const userId = params.userId?.trim();
  if (userId) {
    try {
      const vendorByUserId = await db
        .select({ email: vendorAccounts.email })
        .from(vendorAccounts)
        .where(eq(vendorAccounts.userId, userId))
        .limit(1);
      const byUserIdEmail = normalizeIdentityEmailCandidate(vendorByUserId[0]?.email);
      if (byUserIdEmail) return byUserIdEmail;
    } catch {
      // Ignore and continue to other fallbacks.
    }
  }

  const sub = params.sub?.trim();
  if (!sub) return undefined;

  try {
    const resolution = await resolveVendorAccountForAuth0Identity({
      auth0Sub: sub,
      context: "resolveCanonicalIdentityEmail",
    });
    return normalizeIdentityEmailCandidate(resolution.account?.email);
  } catch {
    return undefined;
  }
}

export async function safelyBackfillCustomerEmail(params: {
  userId: string;
  currentEmail: string;
  nextEmail?: string;
  /** When true, allows replacing a real email with the Auth0 token email.
   *  Only pass this when the user was matched by auth0_sub — a strong identity proof. */
  allowRealEmailReplacement?: boolean;
}) {
  const currentEmail = params.currentEmail.trim().toLowerCase();
  const nextEmail = normalizeIdentityEmailCandidate(params.nextEmail);
  if (!nextEmail || nextEmail === currentEmail) return currentEmail;

  const canRepair =
    isSyntheticAuth0LocalEmail(currentEmail) ||
    !currentEmail ||
    params.allowRealEmailReplacement === true;
  if (!canRepair) return currentEmail;

  const conflict = await db
    .select({ id: users.id })
    .from(users)
    .where(and(drizzleSql`lower(${users.email}) = ${nextEmail}`, drizzleSql`${users.id} <> ${params.userId}`))
    .limit(1);

  if (conflict.length > 0) {
    return nextEmail;
  }

  const [updated] = await db
    .update(users)
    .set({
      email: nextEmail,
      updatedAt: new Date(),
    })
    .where(eq(users.id, params.userId))
    .returning({ email: users.email });

  return updated?.email?.trim().toLowerCase() || nextEmail;
}

export function toHumanNameFromEmail(email: string | undefined): string | null {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return null;
  const local = normalized.split("@")[0] || "";
  if (!local) return null;
  if (local.startsWith("auth0_")) return null;

  const words = local
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (words.length === 0) return null;
  const titled = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return titled.join(" ");
}

export async function resolvePreferredCustomerName(params: {
  sub?: string;
  email?: string;
  auth0Name?: string;
}): Promise<string | null> {
  const auth0Name = (params.auth0Name || "").trim();
  if (auth0Name && !isMachineGeneratedCustomerName(auth0Name)) {
    return auth0Name;
  }

  const email = params.email?.trim().toLowerCase();
  return toHumanNameFromEmail(email);
}

export async function resolveVendorBusinessNameForIdentity(params: {
  sub?: string;
  email?: string;
}): Promise<string | null> {
  const resolution = await resolveVendorAccountForAuth0Identity({
    auth0Sub: params.sub,
    email: params.email,
    context: "resolveVendorBusinessNameForIdentity",
  });
  const name = resolution.account?.businessName?.trim();
  return name || null;
}

export async function resolveCustomerAuthFromRequest(
  req: any,
  opts?: { createIfMissing?: boolean }
): Promise<{ id: string; email: string; type: "customer" | "admin" } | null> {
  const auth0 = req?.auth0 as {
    sub?: string;
    email?: string;
    name?: string;
    nickname?: string;
    given_name?: string;
    family_name?: string;
  } | undefined;
  const sub = auth0?.sub?.trim();
  const emailFromAuth0 = auth0?.email?.toLowerCase().trim();
  const auth0Name =
    auth0?.name?.trim() ||
    [auth0?.given_name, auth0?.family_name].filter(Boolean).join(" ").trim() ||
    auth0?.nickname?.trim() ||
    "";
  const existingCustomerAuthId =
    typeof req?.customerAuth?.id === "string" ? req.customerAuth.id.trim() : "";
  if (existingCustomerAuthId) {
    const existingAuthEmail =
      typeof req?.customerAuth?.email === "string" ? req.customerAuth.email.trim().toLowerCase() : "";
    const [existingUser] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, existingCustomerAuthId))
      .limit(1);

    if (existingUser?.id) {
      const canonicalIdentityEmail = await resolveCanonicalIdentityEmail({
        sub,
        auth0Email: emailFromAuth0,
        userId: existingUser.id,
      });

      const resolvedEmail = await safelyBackfillCustomerEmail({
        userId: existingUser.id,
        currentEmail: existingUser.email,
        nextEmail: canonicalIdentityEmail || existingAuthEmail,
      });

      req.customerAuth = {
        id: existingUser.id,
        email: resolvedEmail,
        type: existingUser.role === "admin" ? "admin" : "customer",
      };
      return req.customerAuth;
    }
  }

  const canonicalIdentityEmail = await resolveCanonicalIdentityEmail({ sub, auth0Email: emailFromAuth0 });
  let email = canonicalIdentityEmail;

  // Prefer stable Auth0 subject matching when available (works even if email is missing in token).
  if (sub) {
      try {
      const subLookup = await db.execute(
        drizzleSql`select id, email, role from users where auth0_sub = ${sub} limit 1`
      );
      const subRows = extractRows<{ id?: string; email?: string; role?: string }>(subLookup);
      const subUser = subRows[0];
      if (subUser?.id && subUser?.email) {
        let resolvedUserId = subUser.id;
        let resolvedUserEmail = subUser.email.trim().toLowerCase();
        let resolvedUserRole = subUser.role;
        const canonicalForSubUser =
          canonicalIdentityEmail ||
          (await resolveCanonicalIdentityEmail({
            sub,
            auth0Email: emailFromAuth0,
            userId: resolvedUserId,
          }));
        const resolvedEmail =
          canonicalForSubUser ||
          normalizeIdentityEmailCandidate(resolvedUserEmail) ||
          resolvedUserEmail;

        resolvedUserEmail = await safelyBackfillCustomerEmail({
          userId: resolvedUserId,
          currentEmail: resolvedUserEmail,
          nextEmail: resolvedEmail,
          // We proved identity via auth0_sub — trust the Auth0 token email as authoritative.
          allowRealEmailReplacement: true,
        });

        return {
          id: resolvedUserId,
          email: resolvedUserEmail,
          type: resolvedUserRole === "admin" ? "admin" : "customer",
        };
      }
    } catch {
      // Ignore if users.auth0_sub is unavailable in this environment.
    }
  }

  // If token email is missing, use a deterministic synthetic email from sub to keep customer flows functional.
  if (!email && sub) {
    const safeSub = sub.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 48);
    email = `auth0_${safeSub}@eventhub.local`;
  }

  if (!email) return null;

  let [userRow] = await db
    .select()
    .from(users)
    .where(drizzleSql`lower(${users.email}) = ${email}`)
    .limit(1);

  const preferredName = await resolvePreferredCustomerName({
    sub,
    email,
    auth0Name,
  });
  const vendorBusinessName = await resolveVendorBusinessNameForIdentity({ sub, email });

  if (!userRow && opts?.createIfMissing) {
    const generatedName = preferredName || toHumanNameFromEmail(email) || "Customer";

    [userRow] = await db
      .insert(users)
      .values({
        name: generatedName,
        displayName: generatedName,
        email,
        role: "customer",
        lastLoginAt: new Date(),
      })
      .returning();

    if (userRow?.id && sub) {
      try {
        await db.execute(drizzleSql`update users set auth0_sub = ${sub} where id = ${userRow.id}`);
      } catch {
        // Ignore if users.auth0_sub is unavailable in this environment.
      }
    }
  }

  if (userRow && opts?.createIfMissing && preferredName) {
    const currentName = typeof userRow.name === "string" ? userRow.name.trim() : "";
    const currentDisplayName =
      typeof userRow.displayName === "string" ? userRow.displayName.trim() : "";
    const preferredNameNormalized = preferredName.toLowerCase();
    const vendorBusinessNameNormalized = vendorBusinessName?.trim().toLowerCase() || "";
    const currentNameNormalized = currentName.toLowerCase();
    const currentDisplayNameNormalized = currentDisplayName.toLowerCase();
    const currentLooksLikeVendorBusiness =
      !!vendorBusinessNameNormalized &&
      (currentNameNormalized === vendorBusinessNameNormalized ||
        currentDisplayNameNormalized === vendorBusinessNameNormalized);

    const shouldRepairName =
      isMachineGeneratedCustomerName(currentName) ||
      (currentLooksLikeVendorBusiness && currentNameNormalized !== preferredNameNormalized);
    const shouldRepairDisplayName =
      isMachineGeneratedCustomerName(currentDisplayName) ||
      (currentLooksLikeVendorBusiness && currentDisplayNameNormalized !== preferredNameNormalized);

    if (shouldRepairName || shouldRepairDisplayName) {
      const [updatedRow] = await db
        .update(users)
        .set({
          name: shouldRepairName ? preferredName : userRow.name,
          displayName: shouldRepairDisplayName ? preferredName : userRow.displayName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userRow.id))
        .returning();

      if (updatedRow) {
        userRow = updatedRow;
      }
    }
  }

  if (!userRow) return null;

  return {
    id: userRow.id,
    email: userRow.email,
    type: userRow.role === "admin" ? "admin" : "customer",
  };
}
