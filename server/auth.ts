import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const SALT_ROUNDS = 10;

export interface JWTPayload {
  id: string;
  email?: string;
  username?: string;
  type: "customer" | "vendor" | "admin";
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT token generation
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

// Middleware for vendor authentication
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

// Middleware for customer authentication (also accepts admin tokens)
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

// Middleware for dual authentication (accepts both customer and vendor tokens)
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
  
  if (payload.type !== "customer" && payload.type !== "vendor" && payload.type !== "admin") {
    return res.status(401).json({ message: "Invalid token type" });
  }
  
  // Set appropriate auth context based on token type
  if (payload.type === "customer" || payload.type === "admin") {
    (req as any).customerAuth = payload;
  } else {
    (req as any).vendorAuth = payload;
  }
  
  next();
}

// Middleware for admin authentication
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
