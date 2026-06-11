// client/src/lib/authToken.ts
type TokenGetterOptions = { forceRefresh?: boolean };

let tokenGetter: ((opts?: TokenGetterOptions) => Promise<string | null>) | null = null;

export function setTokenGetter(fn: (opts?: TokenGetterOptions) => Promise<string | null>) {
  tokenGetter = fn;
}

// forceRefresh bypasses Auth0's token cache and mints a brand-new token. Needed
// after email verification: claims like email_verified are baked in at issuance,
// so the cached token keeps saying "unverified" until it expires otherwise.
export async function getFreshAccessToken(opts?: TokenGetterOptions): Promise<string | null> {
  try {
    return tokenGetter ? await tokenGetter(opts) : null;
  } catch {
    return null;
  }
}
