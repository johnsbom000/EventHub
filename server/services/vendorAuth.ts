import { db } from "../db";
import { eq, asc, sql as drizzleSql } from "drizzle-orm";
import { vendorAccounts, vendorProfiles } from "@shared/schema";
import { logger } from "../lib/logger";
import { requireAuth0 } from "../auth0";
import { resolveVendorAccountForAuth0Identity } from "../auth";
import { asTrimmedString } from "../lib/routeUtils";

export type VendorProfileContext = {
  account: any;
  profiles: any[];
  activeProfile: any | null;
  activeProfileId: string | null;
};

export function isGenericProfileName(value: unknown): boolean {
  const normalized = asTrimmedString(value).toLowerCase();
  return normalized === "vendor profile";
}

export function getProfileDisplayName(profile: any, fallback = "Vendor Profile"): string {
  const profileName = asTrimmedString(profile?.profileName);
  const online =
    profile?.onlineProfiles && typeof profile.onlineProfiles === "object" && !Array.isArray(profile.onlineProfiles)
      ? (profile.onlineProfiles as Record<string, unknown>)
      : null;
  const onlineProfileName = asTrimmedString((online as any)?.profileBusinessName);
  const fallbackName = asTrimmedString(fallback) || "Vendor Profile";

  if (profileName && !isGenericProfileName(profileName)) return profileName;
  if (onlineProfileName && !isGenericProfileName(onlineProfileName)) return onlineProfileName;
  if (!isGenericProfileName(fallbackName)) return fallbackName;

  if (profileName) return profileName;
  if (onlineProfileName) return onlineProfileName;
  return fallbackName;
}

export function bookingRowMatchesActiveProfile(
  row: any,
  activeProfileId: string,
  profileCount: number
): boolean {
  const bookingProfileId = asTrimmedString(row?.vendorProfileId);
  const listingProfileId = asTrimmedString(row?.listingProfileId);
  if (bookingProfileId) return bookingProfileId === activeProfileId;
  if (listingProfileId) return listingProfileId === activeProfileId;
  // Legacy rows with no profile ownership are safe only when the account still has a single profile.
  return profileCount <= 1;
}

export async function listVendorProfilesForAccount(accountId: string) {
  const rows = await db
    .select()
    .from(vendorProfiles)
    .where(eq(vendorProfiles.accountId, accountId))
    .orderBy(asc(vendorProfiles.createdAt), asc(vendorProfiles.id));
  return rows;
}

export async function normalizeProfileNamesForAccount(account: any) {
  const accountId = asTrimmedString(account?.id);
  if (!accountId) return;

  const accountBusinessName = asTrimmedString(account?.businessName);

  await db.execute(drizzleSql`
    update vendor_profiles vp
    set profile_name = coalesce(
      nullif(vp.online_profiles ->> 'profileBusinessName', ''),
      ${accountBusinessName || null},
      'Vendor Profile'
    )
    where vp.account_id = ${accountId}
      and (
        vp.profile_name is null
        or btrim(vp.profile_name) = ''
        or lower(btrim(vp.profile_name)) = 'vendor profile'
      )
  `);
  await db.execute(drizzleSql`
    update vendor_profiles vp
    set online_profiles = jsonb_set(
      coalesce(vp.online_profiles, '{}'::jsonb),
      '{profileBusinessName}',
      to_jsonb(
        coalesce(
          nullif(vp.profile_name, ''),
          ${accountBusinessName || null},
          'Vendor Profile'
        )
      ),
      true
    )
    where vp.account_id = ${accountId}
      and (
        vp.online_profiles is null
        or nullif(btrim(coalesce(vp.online_profiles ->> 'profileBusinessName', '')), '') is null
        or lower(btrim(coalesce(vp.online_profiles ->> 'profileBusinessName', ''))) = 'vendor profile'
      )
  `);
}

export async function getVendorAccountFromRequest(req: any) {
  const cached = req.vendorAccount;
  if (cached?.id) return cached;

  const vendorId = typeof req?.vendorAuth?.id === "string" ? req.vendorAuth.id.trim() : "";
  if (!vendorId) return undefined;

  const rows = await db
    .select()
    .from(vendorAccounts)
    .where(eq(vendorAccounts.id, vendorId))
    .limit(1);
  const account = rows[0];
  if (account) {
    req.vendorAccount = account;
  }
  return account;
}

/**
 * Middleware: after requireAuth0, resolve the vendor account by auth0_sub and
 * attach a normalized vendorAuth object so existing handlers keep working.
 */
export async function requireVendorAccountAuth0(req: any, res: any, next: any) {
  try {
    const auth0 = req.auth0 as { sub?: string; email?: string; email_verified?: boolean } | undefined;
    logger.debug({ sub: auth0?.sub }, "[vendor-auth]");
    const resolution = await resolveVendorAccountForAuth0Identity({
      auth0Sub: auth0?.sub,
      email: auth0?.email,
      context: "requireVendorAccountAuth0",
      emailVerified: auth0?.email_verified === true,
    });
    const account = resolution.account;

    if (!account) {
      // Auth0 is valid, but user doesn't have a vendor account row yet
      logger.info({ sub: auth0?.sub }, "[vendor-auth] 404 — no account found");
      return res.status(404).json({ error: "Vendor account not found for this Auth0 user" });
    }
    if (account.deletedAt) {
      return res.status(403).json({ error: "Vendor account is deleted" });
    }
    if (account.active === false) {
      return res.status(403).json({ error: "Vendor account is not active" });
    }

    // Normalize to the shape legacy code expects
    req.vendorAuth = {
      id: account.id,
      email: account.email,
      type: "vendor",
      auth0Sub: account.auth0Sub,
    };

    // Also expose account directly if useful later
    req.vendorAccount = account;

    return next();
  } catch (err: any) {
    logger.error("requireVendorAccountAuth0 failed:", err?.message || err);
    return res.status(500).json({ error: "Failed to resolve vendor account" });
  }
}

/**
 * Convenience combo for vendor routes:
 * - verify Auth0 token
 * - resolve vendor account by auth0_sub
 */
export const requireVendorAuth0 = [requireAuth0, requireVendorAccountAuth0] as const;

export async function resolveActiveVendorProfile(req: any): Promise<VendorProfileContext | null> {
  const account = await getVendorAccountFromRequest(req);
  if (!account?.id) return null;

  await normalizeProfileNamesForAccount(account);

  const profiles = await listVendorProfilesForAccount(account.id);
  if (profiles.length === 0) {
    req.vendorProfileContext = {
      account,
      profiles: [],
      activeProfile: null,
      activeProfileId: null,
    } satisfies VendorProfileContext;
    return req.vendorProfileContext;
  }

  const headerProfileIdRaw = req.headers?.["x-vendor-profile-id"];
  const headerProfileId =
    typeof headerProfileIdRaw === "string"
      ? asTrimmedString(headerProfileIdRaw)
      : Array.isArray(headerProfileIdRaw)
        ? asTrimmedString(headerProfileIdRaw[0])
        : "";
  const queryProfileId = asTrimmedString(req.query?.profileId);
  const requestedProfileId = headerProfileId || queryProfileId;

  let activeProfile =
    (requestedProfileId ? profiles.find((profile) => profile.id === requestedProfileId) : undefined) ||
    (account.activeProfileId
      ? profiles.find((profile) => profile.id === account.activeProfileId)
      : undefined) ||
    profiles[0];

  if (!activeProfile) {
    activeProfile = profiles[0];
  }

  if (activeProfile?.id && account.activeProfileId !== activeProfile.id) {
    const [updatedAccount] = await db
      .update(vendorAccounts)
      .set({ activeProfileId: activeProfile.id })
      .where(eq(vendorAccounts.id, account.id))
      .returning();
    req.vendorAccount = updatedAccount ?? account;
  }

  const context: VendorProfileContext = {
    account: req.vendorAccount ?? account,
    profiles,
    activeProfile,
    activeProfileId: activeProfile?.id ?? null,
  };
  req.vendorProfileContext = context;
  return context;
}
