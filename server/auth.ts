import type { Request, Response, NextFunction } from "express";
import { logger } from "./lib/logger";
import { requireAuth0 } from "./auth0";
import { db } from "./db";
import { eq, and, isNull, sql as drizzleSql } from "drizzle-orm";
import { users, vendorAccounts } from "@shared/schema";

type VendorResolverMatchPath = "users.user_id" | "vendor_accounts.auth0_sub" | "vendor_accounts.email" | "none";

export type VendorAccountResolutionResult = {
  account: (typeof vendorAccounts.$inferSelect) | null;
  matchedBy: VendorResolverMatchPath;
  resolvedUserId: string | null;
  healedAuth0Sub: boolean;
  healedUserId: boolean;
};

function normalizeAuthIdentityEmail(rawEmail?: string | null): string | null {
  const normalized = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  return normalized || null;
}

function extractSqlRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as any).rows)) {
    return (result as any).rows as T[];
  }
  return [];
}

function logVendorResolver(
  level: "info" | "warn",
  event: string,
  fields: Record<string, unknown>
) {
  const payload = {
    scope: "vendor_identity_resolver",
    event,
    ...fields,
  };
  if (level === "warn") {
    logger.warn({ payload }, "[vendor-resolver]");
    return;
  }
  logger.info({ payload }, "[vendor-resolver]");
}

async function resolveSingleUserByAuth0Sub(
  auth0Sub: string | null,
  context: string
): Promise<{ id: string } | null> {
  if (!auth0Sub) return null;

  try {
    const result = await db.execute(
      drizzleSql`select id from users where auth0_sub = ${auth0Sub} limit 3`
    );
    const rows = extractSqlRows<{ id?: string }>(result).filter(
      (row) => typeof row?.id === "string" && row.id.trim()
    );

    if (rows.length > 1) {
      logVendorResolver("warn", "users_by_auth0_sub_ambiguous", {
        context,
        auth0SubPresent: true,
        userMatchCount: rows.length,
      });
      return null;
    }

    if (rows.length === 1) {
      return { id: String(rows[0].id).trim() };
    }
  } catch (error: any) {
    // users.auth0_sub may not exist in all environments.
    logVendorResolver("warn", "users_by_auth0_sub_lookup_failed", {
      context,
      auth0SubPresent: true,
      error: error?.message || String(error),
    });
  }

  return null;
}

async function maybeHealVendorAccountLinks(
  account: typeof vendorAccounts.$inferSelect,
  params: {
    auth0Sub: string | null;
    resolvedUserId: string | null;
    context: string;
    // When true, we arrived via a verified email match — safe to overwrite a
    // stale auth0Sub so future logins resolve on the faster sub path.
    trustedEmailMatch?: boolean;
  }
): Promise<{
  account: typeof vendorAccounts.$inferSelect;
  healedAuth0Sub: boolean;
  healedUserId: boolean;
}> {
  if (account.deletedAt) {
    logVendorResolver("warn", "heal_skipped_deleted_account", {
      context: params.context,
      accountId: account.id,
    });
    return { account, healedAuth0Sub: false, healedUserId: false };
  }

  let healedAuth0Sub = false;
  let healedUserId = false;
  const updates: Record<string, unknown> = {};

  if (params.auth0Sub) {
    if (!account.auth0Sub || (params.trustedEmailMatch && account.auth0Sub !== params.auth0Sub)) {
      // Only write the new sub if no other active account already owns it.
      const bySub = await db
        .select({ id: vendorAccounts.id })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.auth0Sub, params.auth0Sub), isNull(vendorAccounts.deletedAt)))
        .limit(2);
      const hasConflict = bySub.some((candidate) => candidate.id !== account.id);
      if (hasConflict) {
        logVendorResolver("warn", "auth0_sub_link_conflict", {
          context: params.context,
          accountId: account.id,
          matchedBy: "link_heal",
        });
      } else {
        updates.auth0Sub = params.auth0Sub;
        healedAuth0Sub = true;
      }
    }
  }

  if (params.resolvedUserId) {
    if (!account.userId) {
      const byUserId = await db
        .select({ id: vendorAccounts.id })
        .from(vendorAccounts)
        .where(and(eq(vendorAccounts.userId, params.resolvedUserId), isNull(vendorAccounts.deletedAt)))
        .limit(2);
      const hasConflict = byUserId.some((candidate) => candidate.id !== account.id);
      if (hasConflict) {
        logVendorResolver("warn", "user_id_link_conflict", {
          context: params.context,
          accountId: account.id,
          resolvedUserId: params.resolvedUserId,
        });
      } else {
        updates.userId = params.resolvedUserId;
        healedUserId = true;
      }
    } else if (account.userId !== params.resolvedUserId) {
      logVendorResolver("warn", "user_id_mismatch", {
        context: params.context,
        accountId: account.id,
        accountUserId: account.userId,
        resolvedUserId: params.resolvedUserId,
      });
    }
  }

  if (!healedAuth0Sub && !healedUserId) {
    return { account, healedAuth0Sub: false, healedUserId: false };
  }

  const [updated] = await db
    .update(vendorAccounts)
    .set(updates)
    .where(eq(vendorAccounts.id, account.id))
    .returning();

  return {
    account: updated ?? account,
    healedAuth0Sub,
    healedUserId,
  };
}

type ResolveVendorAccountIdentityParams = {
  auth0Sub?: string | null;
  email?: string | null;
  context?: string;
  // Defense in depth: an email is only trusted to resolve or rebind an account
  // when Auth0 has positively verified it. Defaults to NOT verified so the
  // resolver is safe even if a caller forgets to run requireAuth0 first.
  emailVerified?: boolean;
};

export async function resolveVendorAccountForAuth0Identity(
  params: ResolveVendorAccountIdentityParams
): Promise<VendorAccountResolutionResult> {
  const auth0Sub = typeof params.auth0Sub === "string" ? params.auth0Sub.trim() : "";
  const normalizedSub = auth0Sub || null;
  const normalizedEmail = normalizeAuthIdentityEmail(params.email);
  const context = params.context || "unknown";
  // Fail closed: only an explicitly-verified email may be used for the email
  // fallback match or an auth0Sub rebind.
  const emailVerified = params.emailVerified === true;

  const finalize = (
    account: typeof vendorAccounts.$inferSelect | null,
    matchedBy: VendorResolverMatchPath,
    resolvedUserId: string | null,
    healedAuth0Sub: boolean,
    healedUserId: boolean
  ): VendorAccountResolutionResult => {
    logVendorResolver("info", "resolution", {
      context,
      matchedBy,
      accountId: account?.id || null,
      resolvedUserId,
      healedAuth0Sub,
      healedUserId,
      auth0SubPresent: Boolean(normalizedSub),
      emailPresent: Boolean(normalizedEmail),
    });
    return { account, matchedBy, resolvedUserId, healedAuth0Sub, healedUserId };
  };

  if (!normalizedSub && !normalizedEmail) {
    return finalize(null, "none", null, false, false);
  }

  const userFromSub = await resolveSingleUserByAuth0Sub(normalizedSub, context);
  const resolvedUserId = userFromSub?.id || null;

  if (resolvedUserId) {
    const accountsByUserId = await db
      .select()
      .from(vendorAccounts)
      .where(and(eq(vendorAccounts.userId, resolvedUserId), isNull(vendorAccounts.deletedAt)))
      .limit(3);

    if (accountsByUserId.length > 1) {
      logVendorResolver("warn", "accounts_by_user_id_ambiguous", {
        context,
        resolvedUserId,
        accountMatchCount: accountsByUserId.length,
      });
    } else if (accountsByUserId.length === 1) {
      const healed = await maybeHealVendorAccountLinks(accountsByUserId[0], {
        auth0Sub: normalizedSub,
        resolvedUserId,
        context,
      });
      return finalize(healed.account, "users.user_id", resolvedUserId, healed.healedAuth0Sub, healed.healedUserId);
    }
  }

  if (normalizedSub) {
    const accountsBySub = await db
      .select()
      .from(vendorAccounts)
      .where(and(eq(vendorAccounts.auth0Sub, normalizedSub), isNull(vendorAccounts.deletedAt)))
      .limit(3);

    if (accountsBySub.length > 1) {
      logVendorResolver("warn", "accounts_by_auth0_sub_ambiguous", {
        context,
        auth0SubPresent: true,
        accountMatchCount: accountsBySub.length,
      });
    } else if (accountsBySub.length === 1) {
      const healed = await maybeHealVendorAccountLinks(accountsBySub[0], {
        auth0Sub: normalizedSub,
        resolvedUserId,
        context,
      });
      return finalize(
        healed.account,
        "vendor_accounts.auth0_sub",
        resolvedUserId,
        healed.healedAuth0Sub,
        healed.healedUserId
      );
    }
  }

  // EMAIL FALLBACK — only ever runs for a verified email. An unverified or
  // unknown-verification email must never resolve an account by address, since
  // that would let an attacker take over a vendor account by signing up with the
  // victim's email on an unverified identity. Sub-based resolution above is
  // unaffected (a fresh attacker identity has a different sub).
  if (normalizedEmail && emailVerified) {
    const accountsByEmail = await db
      .select()
      .from(vendorAccounts)
      .where(and(drizzleSql`lower(${vendorAccounts.email}) = ${normalizedEmail}`, isNull(vendorAccounts.deletedAt)))
      .limit(3);

    if (accountsByEmail.length > 1) {
      logVendorResolver("warn", "accounts_by_email_ambiguous", {
        context,
        emailPresent: true,
        accountMatchCount: accountsByEmail.length,
      });
      return finalize(null, "none", resolvedUserId, false, false);
    }

    if (accountsByEmail.length === 1) {
      const account = accountsByEmail[0];

      // If a different active vendor account already owns this userId, something
      // is structurally wrong — log and skip rather than silently merge.
      if (resolvedUserId && account.userId && account.userId !== resolvedUserId) {
        logVendorResolver("warn", "email_fallback_user_id_conflict", {
          context,
          accountId: account.id,
          accountUserId: account.userId,
          resolvedUserId,
        });
        return finalize(null, "none", resolvedUserId, false, false);
      }

      // This branch only runs when emailVerified === true (guarded above), so a
      // matching email is genuine proof of ownership regardless of which login
      // method (Google, email/password, etc.) the user chose this session.
      // Verification is enforced in two places: requireAuth0 rejects
      // email_verified !== true at the gate, and this resolver independently
      // refuses to email-match an unverified identity. Pass trustedEmailMatch so
      // the heal can overwrite a stale auth0Sub — safe only because the email is
      // verified.
      const healed = await maybeHealVendorAccountLinks(account, {
        auth0Sub: normalizedSub,
        resolvedUserId,
        context,
        trustedEmailMatch: true,
      });
      return finalize(
        healed.account,
        "vendor_accounts.email",
        resolvedUserId,
        healed.healedAuth0Sub,
        healed.healedUserId
      );
    }
  }

  return finalize(null, "none", resolvedUserId, false, false);
}

/* ======================================================
   Admin middleware
====================================================== */

// Admin access is gated by an env-var allowlist of verified emails, not the
// DB role column. This means a DB compromise cannot grant admin access —
// only changing the server env var (which requires server access) can.
const ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Step 1: Verify Auth0 token. requireAuth0 rejects expired tokens and now
    // also rejects unverified emails (403 email_not_verified) before reaching
    // here — so auth0.email is safe to trust for the allowlist check below.
    let authed = false;
    await new Promise<void>((resolve) => {
      requireAuth0(req, res, () => {
        authed = true;
        resolve();
      });
    });
    if (!authed) return; // requireAuth0 already sent 401

    const auth0 = (req as any).auth0 as { sub: string; email?: string };
    const email = typeof auth0.email === "string" ? auth0.email.trim().toLowerCase() : "";

    // Step 2: Allowlist check — always fresh, never trusts a prior middleware.
    if (!email || !ADMIN_EMAILS.has(email)) {
      // Return generic 403 — don't reveal that an admin page exists.
      return res.status(403).json({ message: "Forbidden" });
    }

    // Step 3: Fetch or auto-provision the admin user row.
    // The DB record is not required for access (allowlist is the gate), but
    // having one lets admin routes that join on users.id work correctly.
    const auth0Full = (req as any).auth0 as {
      sub: string; email?: string; name?: string;
      given_name?: string; family_name?: string;
    };

    let [user] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(drizzleSql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (!user) {
      // First-ever login for this admin email — create the user record.
      const displayName =
        auth0Full.name ||
        [auth0Full.given_name, auth0Full.family_name].filter(Boolean).join(" ") ||
        email.split("@")[0];
      try {
        const [inserted] = await db
          .insert(users)
          // `email` is the trimmed, lowercased allowlist value — never insert
          // the raw-cased Auth0 email (users.email is unique on lower(email),
          // migration 0148, and all lookups compare lowercased).
          .values({ name: displayName, email, role: "admin", auth0Sub: auth0Full.sub || null })
          .onConflictDoNothing()
          .returning({ id: users.id, email: users.email, role: users.role });
        user = inserted ?? undefined;
      } catch {
        // Non-fatal — admin access is already granted above.
      }
    } else if (user.role !== "admin") {
      // Ensure existing record has the admin role.
      await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id)).catch(() => {});
    }

    (req as any).adminAuth = {
      id: user?.id ?? null,
      email: auth0Full.email ?? user?.email ?? null,
      sub: auth0Full.sub,
      type: "admin",
    };

    return next();
  } catch (err: any) {
    logger.error("requireAdminAuth error:", err?.message || err);
    return res.status(401).json({ message: "Unauthorized" });
  }
}

/* ======================================================
   Auth0 bridge middleware (NEW)
   Maps Auth0 users → existing auth contexts
====================================================== */

export async function requireDualAuthAuth0(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Verify Auth0 token (requireAuth0 handles sending 401 itself)
    let authed = false;
    await new Promise<void>((resolve) => {
      requireAuth0(req, res, () => {
        authed = true;
        resolve();
      });
    });
    if (!authed) return; // requireAuth0 already responded with 401


    const auth0 = (req as any).auth0 as { sub: string; email?: string; email_verified?: boolean };
    const sub = auth0?.sub;
    const email = auth0?.email;

    const vendorResolution = await resolveVendorAccountForAuth0Identity({
      auth0Sub: sub,
      email,
      context: "requireDualAuthAuth0",
      emailVerified: auth0?.email_verified === true,
    });

    if (vendorResolution.account) {
      const matchedVendor = vendorResolution.account;
      const vendorIsDeleted = Boolean((matchedVendor as any)?.deletedAt);
      const vendorIsActive = matchedVendor?.active !== false && !vendorIsDeleted;
      if (vendorIsActive) {
        (req as any).vendorAuth = {
          id: matchedVendor.id,
          email: matchedVendor.email,
          type: "vendor",
        };

        // Also populate customerAuth so vendor users can access customer routes
        // (book other vendors, view their own bookings as a customer, etc.).
        // Vendors are a superset of customers — they can do everything a customer can.
        // Prefer the userId FK on the vendor account; fall back to email lookup.
        const linkedUserId = (matchedVendor as any).userId as string | null | undefined;
        const normalizedEmailForVendor = typeof email === "string" ? email.trim().toLowerCase() : "";
        const vendorUserRows = linkedUserId
          ? await db.select().from(users).where(eq(users.id, linkedUserId)).limit(1)
          : normalizedEmailForVendor
            ? await db.select().from(users).where(drizzleSql`lower(${users.email}) = ${normalizedEmailForVendor}`).limit(1)
            : [];
        if (vendorUserRows[0]) {
          const u = vendorUserRows[0];
          (req as any).customerAuth = {
            id: u.id,
            email: u.email,
            type: u.role === "admin" ? "admin" : "customer",
          };
        }

        return next();
      }
      (req as any).vendorAuthBlocked = true;
      (req as any).vendorAuthBlockedReason = vendorIsDeleted ? "deleted" : "inactive";
    }

    // 3) Customer match by email (case-insensitive)
    const normalizedEmailForCustomer = typeof email === "string" ? email.trim().toLowerCase() : "";
    const usersFound = normalizedEmailForCustomer
      ? await db
          .select()
          .from(users)
          .where(drizzleSql`lower(${users.email}) = ${normalizedEmailForCustomer}`)
      : [];

    if (usersFound.length > 0) {
      if ((req as any).vendorAuthBlocked && req.path.startsWith("/api/vendor")) {
        return res.status(403).json({
          message:
            (req as any).vendorAuthBlockedReason === "deleted"
              ? "Vendor account is deleted"
              : "Vendor account is not active",
        });
      }
      const u = usersFound[0];
      (req as any).customerAuth = {
        id: u.id,
        email: u.email,
        type: u.role === "admin" ? "admin" : "customer",
      };
      return next();
    }

    if ((req as any).vendorAuthBlocked) {
      return res.status(403).json({
        message:
          (req as any).vendorAuthBlockedReason === "deleted"
            ? "Vendor account is deleted"
            : "Vendor account is not active",
      });
    }

    // No local account yet – allow request through with raw Auth0 identity
    // so onboarding or account-linking routes can create the local records.
    (req as any).auth0Only = true;
    return next();
  } catch (err: any) {
    logger.error("requireDualAuthAuth0 CATCH:", err?.name, err?.message, err);
    return res.status(401).json({ message: "Invalid or expired Auth0 token" });
  }

}
