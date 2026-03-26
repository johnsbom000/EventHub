import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { requireAuth0 } from "./auth0";
import { db } from "./db";
import { eq, and, isNull, sql as drizzleSql } from "drizzle-orm";
import { users, vendorAccounts } from "@shared/schema";

const JWT_SECRET = (process.env.JWT_SECRET || "").trim();
if (!JWT_SECRET) {
  throw new Error("Missing JWT_SECRET environment variable");
}
const SALT_ROUNDS = 10;

export interface JWTPayload {
  id: string;
  email?: string;
  username?: string;
  type: "customer" | "vendor" | "admin";
}

/* ======================================================
   Password helpers
====================================================== */

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/* ======================================================
   JWT helpers (existing system – unchanged)
====================================================== */

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

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
    console.warn("[vendor-resolver]", JSON.stringify(payload));
    return;
  }
  console.info("[vendor-resolver]", JSON.stringify(payload));
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
    if (!account.auth0Sub) {
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
    } else if (account.auth0Sub !== params.auth0Sub) {
      logVendorResolver("warn", "auth0_sub_mismatch", {
        context: params.context,
        accountId: account.id,
        accountAuth0SubPresent: true,
      });
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
};

export async function resolveVendorAccountForAuth0Identity(
  params: ResolveVendorAccountIdentityParams
): Promise<VendorAccountResolutionResult> {
  const auth0Sub = typeof params.auth0Sub === "string" ? params.auth0Sub.trim() : "";
  const normalizedSub = auth0Sub || null;
  const normalizedEmail = normalizeAuthIdentityEmail(params.email);
  const context = params.context || "unknown";

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

  if (normalizedEmail) {
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
      if (normalizedSub && account.auth0Sub && account.auth0Sub !== normalizedSub) {
        logVendorResolver("warn", "email_fallback_auth0_sub_conflict", {
          context,
          accountId: account.id,
          matchedBy: "vendor_accounts.email",
        });
        return finalize(null, "none", resolvedUserId, false, false);
      }
      if (resolvedUserId && account.userId && account.userId !== resolvedUserId) {
        logVendorResolver("warn", "email_fallback_user_id_conflict", {
          context,
          accountId: account.id,
          accountUserId: account.userId,
          resolvedUserId,
        });
        return finalize(null, "none", resolvedUserId, false, false);
      }

      const healed = await maybeHealVendorAccountLinks(account, {
        auth0Sub: normalizedSub,
        resolvedUserId,
        context,
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
   JWT-based middleware (existing system – unchanged)
====================================================== */

export function requireVendorAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload || payload.type !== "vendor") {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  (req as any).vendorAuth = payload;
  next();
}

export function requireCustomerAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (payload && (payload.type === "customer" || payload.type === "admin")) {
    (req as any).customerAuth = payload;
    return next();
  }

  // Fallback for Auth0 access tokens during migration.
  return requireDualAuthAuth0(req, res, next);
}

export function requireDualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (payload) {
    if (payload.type === "customer" || payload.type === "admin") {
      (req as any).customerAuth = payload;
    } else if (payload.type === "vendor") {
      (req as any).vendorAuth = payload;
    } else {
      return res.status(401).json({ message: "Invalid token type" });
    }

    return next();
  }

  // Fallback for Auth0 access tokens during migration.
  return requireDualAuthAuth0(req, res, next);
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (payload && payload.type === "admin") {
    (req as any).adminAuth = payload;
    return next();
  }

  // Fallback for Auth0 access tokens during migration.
  return requireDualAuthAuth0(req, res, () => {
    const customerAuth = (req as any).customerAuth as { id?: string; type?: string } | undefined;
    if (customerAuth?.type === "admin" && customerAuth.id) {
      (req as any).adminAuth = customerAuth;
      return next();
    }

    const customerId = typeof customerAuth?.id === "string" ? customerAuth.id.trim() : "";
    if (!customerId) {
      return res.status(403).json({ message: "Admin access required" });
    }

    void db
      .select({ id: users.id, role: users.role, email: users.email })
      .from(users)
      .where(eq(users.id, customerId))
      .limit(1)
      .then((rows) => {
        const user = rows[0];
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Admin access required" });
        }

        (req as any).adminAuth = {
          id: user.id,
          email: user.email,
          type: "admin",
        };
        return next();
      })
      .catch((error: any) => {
        console.error("Admin role lookup failed:", error?.message || error);
        return res.status(500).json({ message: "Unable to verify admin access" });
      });
  });
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


    const auth0 = (req as any).auth0 as { sub: string; email?: string };
    const sub = auth0?.sub;
    const email = auth0?.email;

    const vendorResolution = await resolveVendorAccountForAuth0Identity({
      auth0Sub: sub,
      email,
      context: "requireDualAuthAuth0",
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
        return next();
      }
      (req as any).vendorAuthBlocked = true;
      (req as any).vendorAuthBlockedReason = vendorIsDeleted ? "deleted" : "inactive";
    }

    // 3) Customer match by email
    const usersFound = email
      ? await db
          .select()
          .from(users)
          .where(eq(users.email, email))
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
    console.error("requireDualAuthAuth0 CATCH:", err?.name, err?.message, err);
    return res.status(401).json({ message: "Invalid or expired Auth0 token" });
  }

}
