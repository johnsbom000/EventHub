import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { requireAuth0 } from "./auth0";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, vendorAccounts } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
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

  if (!payload || (payload.type !== "customer" && payload.type !== "admin")) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  (req as any).customerAuth = payload;
  next();
}

export function requireDualAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  if (payload.type === "customer" || payload.type === "admin") {
    (req as any).customerAuth = payload;
  } else if (payload.type === "vendor") {
    (req as any).vendorAuth = payload;
  } else {
    return res.status(401).json({ message: "Invalid token type" });
  }

  next();
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload || payload.type !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  (req as any).adminAuth = payload;
  next();
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

    // 1) Vendor match by Auth0 sub (preferred, if we have it stored)
    let vendorsFound = sub
      ? await db
          .select()
          .from(vendorAccounts)
          .where(eq(vendorAccounts.auth0Sub, sub))
      : [];

    // 2) Fallback: vendor match by email
    if (vendorsFound.length === 0 && email) {
      vendorsFound = await db
        .select()
        .from(vendorAccounts)
        .where(eq(vendorAccounts.email, email));
    }

    if (vendorsFound.length > 0) {
      (req as any).vendorAuth = {
        id: vendorsFound[0].id,
        email: vendorsFound[0].email,
        type: "vendor",
      };
      return next();
    }

    // 3) Customer match by email
    const usersFound = email
      ? await db
          .select()
          .from(users)
          .where(eq(users.email, email))
      : [];

    if (usersFound.length > 0) {
      const u = usersFound[0];
      (req as any).customerAuth = {
        id: u.id,
        email: u.email,
        type: u.role === "admin" ? "admin" : "customer",
      };
      return next();
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
