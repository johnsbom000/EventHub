// client/src/lib/authToken.ts
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

export async function getFreshAccessToken(): Promise<string | null> {
  try {
    return tokenGetter ? await tokenGetter() : null;
  } catch {
    return null;
  }
}
