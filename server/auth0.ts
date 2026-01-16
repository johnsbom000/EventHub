import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import type { Request, Response, NextFunction } from "express";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE!;

// JWKS client to fetch Auth0 public keys
const client = jwksClient({
  jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
});

// Get signing key from Auth0
function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, function (err, key) {
    if (err) {
      callback(err);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
}

export interface Auth0Payload {
  sub: string;
  email?: string;
  email_verified?: boolean;
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
        console.log("AUTH0 verify", {
          issuer: `https://${AUTH0_DOMAIN}/`,
          audience: [AUTH0_AUDIENCE],
        });

        if (err) {
          console.error("AUTH0 jwt.verify ERROR:", err.name, err.message);
          return reject(err);
        }

        resolve(decoded as Auth0Payload);
      }
    );
  });
}

/**
 * If the access token payload is missing email (common for API audience tokens),
 * call Auth0 /userinfo using the same access token to resolve it.
 */
async function fetchUserInfoEmail(accessToken: string): Promise<string | undefined> {
  try {
    const resp = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.warn(
        "AUTH0 /userinfo failed:",
        resp.status,
        resp.statusText,
        text ? `:: ${text}` : ""
      );
      return undefined;
    }

    const data = (await resp.json()) as { email?: string };
    return data?.email;
  } catch (e: any) {
    console.warn("AUTH0 /userinfo exception:", e?.message || e);
    return undefined;
  }
}

/**
 * Express middleware: requires a valid Auth0 Bearer token.
 * Attaches payload to (req as any).auth0
 * If email is missing from token payload, fetch it from /userinfo.
 */
export async function requireAuth0(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const payload = await verifyAuth0Token(token);

    // Build req.auth0 (always include sub)
    const auth0: Auth0Payload = {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
    };

    // Fallback: resolve email via /userinfo if missing
    if (!auth0.email) {
      const email = await fetchUserInfoEmail(token);
      if (email) auth0.email = email;
    }

    (req as any).auth0 = auth0;

    // Optional debug to confirm
    console.log("AUTH0 req.auth0 attached:", {
      sub: auth0.sub,
      hasEmail: Boolean(auth0.email),
    });

    return next();
  } catch (err: any) {
    console.error("Auth0 token verify failed:", err?.name, err?.message);
    return res.status(401).json({ error: "Invalid Auth0 token", details: err?.message });
  }
}
