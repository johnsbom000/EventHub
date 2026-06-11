// server/auth0.ts
import { logger } from "./lib/logger";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { Request, Response, NextFunction } from "express";

import { db } from "./db";
import { sql as drizzleSql } from "drizzle-orm";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE!;

// JWKS client to fetch Auth0 public keys
const client = jwksClient({
  jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
  timeout: 2000,          // ✅ fail fast (ms)
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});


// Get signing key from Auth0
function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export interface Auth0Payload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  nickname?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Verifies an Auth0 access token and returns the payload
 */
export function verifyAuth0Token(token: string): Promise<Auth0Payload> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        audience: [AUTH0_AUDIENCE],
        issuer: `https://${AUTH0_DOMAIN}/`,
        algorithms: ["RS256"],
      },
      (err, decoded) => {
        if (err) {
          logger.error({ err, name: err.name }, "AUTH0 jwt.verify error");
          return reject(err);
        }

        // Auth0 emits email / email_verified / profile fields as namespaced
        // custom claims on the access token (a bare claim name is silently
        // dropped by Auth0). Hoist them into the standard fields so downstream
        // code reads them with no extra /userinfo round-trip. No-op if
        // AUTH0_CLAIMS_NAMESPACE is unset or the claim is absent, so the
        // /userinfo fallback still covers those.
        const claims = decoded as Record<string, any>;
        const ns = (process.env.AUTH0_CLAIMS_NAMESPACE || "").replace(/\/+$/, "");
        if (ns) {
          if (claims.email === undefined && claims[`${ns}/email`] !== undefined) {
            claims.email = claims[`${ns}/email`];
          }
          if (claims.email_verified === undefined && claims[`${ns}/email_verified`] !== undefined) {
            claims.email_verified = claims[`${ns}/email_verified`];
          }
          for (const field of ["name", "given_name", "family_name", "nickname"] as const) {
            if (claims[field] === undefined && claims[`${ns}/${field}`] !== undefined) {
              claims[field] = claims[`${ns}/${field}`];
            }
          }
        }

        resolve(claims as Auth0Payload);
      }
    );
  });
}

/**
 * Optional: If the access token payload is missing email (common for API audience tokens),
 * call Auth0 /userinfo using the same access token to resolve it.
 *
 * IMPORTANT: This MUST be time-bounded to avoid hanging protected routes.
 */
type UserInfoProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  nickname?: string;
  given_name?: string;
  family_name?: string;
};

// In-process cache for /userinfo responses — avoids one external HTTP call per request.
// Key: auth0 sub. Result-dependent TTL: a VERIFIED profile is cached normally,
// but an UNVERIFIED one is cached only briefly so a user who just clicked the
// verification link is recognised within seconds — WITHOUT re-hitting /userinfo
// on every request (which would blow Auth0's /userinfo rate limit and trap the
// session in a 403 loop).
const _userInfoCache = new Map<string, { profile: UserInfoProfile; expiresAt: number }>();
const USERINFO_VERIFIED_TTL_MS = 5 * 60 * 1000;
const USERINFO_UNVERIFIED_TTL_MS = 15 * 1000;

async function fetchUserInfoProfile(accessToken: string): Promise<UserInfoProfile | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2000);

  try {
    const resp = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      logger.warn({ status: resp.status, statusText: resp.statusText, body: text }, "AUTH0 /userinfo failed");
      return null;
    }

    const data = (await resp.json()) as UserInfoProfile;
    return data ?? null;
  } catch (e: any) {
    // AbortError or network errors should not block auth
    logger.warn("AUTH0 /userinfo exception:", e?.name || "", e?.message || e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchUserInfoProfileCached(sub: string, accessToken: string): Promise<UserInfoProfile | null> {
  const now = Date.now();
  const cached = _userInfoCache.get(sub);
  if (cached && cached.expiresAt > now) return cached.profile;

  const profile = await fetchUserInfoProfile(accessToken);
  if (profile) {
    const ttl = profile.email_verified === true ? USERINFO_VERIFIED_TTL_MS : USERINFO_UNVERIFIED_TTL_MS;
    _userInfoCache.set(sub, { profile, expiresAt: now + ttl });
  }
  return profile;
}

/**
 * Resolve whether the identity behind this token has a verified email.
 *
 * Returns true ONLY when verification is positively confirmed — from the token
 * claim, or from the /userinfo fallback when the claim is absent (API-audience
 * access tokens commonly omit email_verified). An undefined/unknown result is
 * treated as NOT verified (fail closed), never as verified.
 *
 * Exported so paths that verify tokens directly (e.g. analytics ingestion and
 * the Google OAuth start, which bypass requireAuth0) can apply the same gate.
 */
export async function resolveEmailVerified(
  payload: Pick<Auth0Payload, "sub" | "email_verified">,
  accessToken: string
): Promise<boolean> {
  if (payload.email_verified === true) return true;
  if (payload.email_verified === false) return false;
  // Claim absent — consult /userinfo before deciding.
  const userInfo = await fetchUserInfoProfileCached(payload.sub, accessToken);
  return userInfo?.email_verified === true;
}

// Stable machine code so the frontend can prompt "verify your email" instead of
// treating this like an auth failure (a bare 401 triggers the auto-logout path).
export const EMAIL_NOT_VERIFIED_RESPONSE = {
  error: "email_not_verified",
  message: "Please verify your email address to continue.",
} as const;

// ── Management API: resend verification email ────────────────────────────────
// Requires an Auth0 M2M application authorized for the Management API with the
// update:users scope. Configured via AUTH0_MGMT_CLIENT_ID / AUTH0_MGMT_CLIENT_SECRET.
// Absent credentials degrade gracefully (callers surface "not configured").

let _mgmtToken: { token: string; expiresAt: number } | null = null;

async function getManagementToken(): Promise<string | null> {
  const clientId = (process.env.AUTH0_MGMT_CLIENT_ID || "").trim();
  const clientSecret = (process.env.AUTH0_MGMT_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (_mgmtToken && _mgmtToken.expiresAt > now + 60_000) return _mgmtToken.token;

  const resp = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${AUTH0_DOMAIN}/api/v2/`,
    }),
  });
  if (!resp.ok) {
    logger.warn({ status: resp.status }, "[auth0] management token request failed");
    return null;
  }
  const data = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  _mgmtToken = {
    token: data.access_token,
    expiresAt: now + Math.max(60, data.expires_in ?? 3600) * 1000,
  };
  return _mgmtToken.token;
}

export async function sendVerificationEmailForUser(
  sub: string
): Promise<{ ok: true } | { ok: false; reason: "not_configured" | "request_failed" }> {
  const mgmtToken = await getManagementToken();
  if (!mgmtToken) return { ok: false, reason: "not_configured" };

  const resp = await fetch(`https://${AUTH0_DOMAIN}/api/v2/jobs/verification-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mgmtToken}`,
    },
    body: JSON.stringify({ user_id: sub }),
  });
  if (!resp.ok) {
    logger.warn({ status: resp.status, sub }, "[auth0] resend verification email failed");
    return { ok: false, reason: "request_failed" };
  }
  return { ok: true };
}

/**
 * Express middleware: requires a valid Auth0 Bearer token.
 * Attaches payload to (req as any).auth0
 * If email is missing from token payload, tries /userinfo (with timeout).
 */
export async function requireAuth0(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const payload = await verifyAuth0Token(token);

    const auth0: Auth0Payload = {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      nickname: payload.nickname,
      given_name: payload.given_name,
      family_name: payload.family_name,
    };

    // Fallback: resolve missing profile claims via /userinfo. Crucially we also
    // fetch whenever email_verified is not positively true (undefined OR false):
    // API-audience tokens often omit it, and the token claim is frozen at
    // issuance, so a user who just verified would otherwise stay locked out
    // until their token expires. /userinfo reflects the LIVE profile, and its
    // cache uses a short TTL for unverified results (see fetchUserInfoProfileCached),
    // so this is recognised within seconds without a per-request /userinfo storm.
    if (!auth0.email || auth0.email_verified !== true || !auth0.name || !auth0.given_name || !auth0.family_name || !auth0.nickname) {
      const userInfo = await fetchUserInfoProfileCached(payload.sub, token);
      if (userInfo) {
        if (!auth0.email && userInfo.email) auth0.email = userInfo.email;
        if (auth0.email_verified !== true && userInfo.email_verified !== undefined) auth0.email_verified = userInfo.email_verified;
        if (!auth0.name && userInfo.name) auth0.name = userInfo.name;
        if (!auth0.nickname && userInfo.nickname) auth0.nickname = userInfo.nickname;
        if (!auth0.given_name && userInfo.given_name) auth0.given_name = userInfo.given_name;
        if (!auth0.family_name && userInfo.family_name) auth0.family_name = userInfo.family_name;
      }
    }

    // SECURITY GATE: require a verified email before any protected route runs.
    // email_verified has been resolved from the token and/or /userinfo above; if
    // it is anything other than true we fail closed. This blocks vendor-account
    // takeover via an unverified email/password identity. Social logins (e.g.
    // Google) return email_verified:true and are unaffected.
    if (auth0.email_verified !== true) {
      logger.warn({ sub: auth0.sub }, "[auth0] rejected unverified email");
      return res.status(403).json(EMAIL_NOT_VERIFIED_RESPONSE);
    }

    // Attach to request for downstream middleware/routes
    logger.debug({ sub: auth0.sub }, "[auth0] token verified");
    (req as any).auth0 = auth0;

    // Update last_login_at (non-blocking)
    // NOTE: This assumes users.auth0_sub and users.last_login_at exist.
    // If not, this will warn but will NOT block auth.
    void (async () => {
      try {
        if (!auth0.sub && !auth0.email) return;

        // Prefer matching by auth0_sub when present; fall back to email
        if (auth0.sub) {
          await db.execute(
            drizzleSql`
              UPDATE users
              SET last_login_at = NOW()
              WHERE auth0_sub = ${auth0.sub}
            `
          );
        } else if (auth0.email) {
          await db.execute(
            drizzleSql`
              UPDATE users
              SET last_login_at = NOW()
              WHERE lower(email) = lower(${auth0.email})
            `
          );
        }
      } catch (e: any) {
        logger.warn("AUTH0 last_login_at update failed:", e?.message || e);
      }
    })();

    return next();
  } catch (err: any) {
    logger.error("Auth0 token verify failed:", err?.name, err?.message);
    return res.status(401).json({ error: "Invalid Auth0 token" });
  }
}
