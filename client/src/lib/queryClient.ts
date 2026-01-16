import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Try to retrieve an Auth0 access token from localStorage.
 * This supports:
 *  - direct storage keys you may have set (auth0_access_token, access_token)
 *  - Auth0 SPA SDK cache entries (keys that include "@@auth0spajs@@")
 */
function getAuth0AccessToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Auth0 SPA SDK cache keys
      if (!key.startsWith("@@auth0spajs@@")) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);

      // This is the exact structure Auth0 uses
      const token = parsed?.body?.access_token;

      if (typeof token === "string" && token.length > 0) {
        return token;
      }
    }
  } catch (err) {
    console.warn("Failed to read Auth0 access token from storage", err);
  }

  return null;
}


function buildHeaders(url: string, data?: unknown): HeadersInit {
  const headers: Record<string, string> = {};

  if (data !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // Only attach auth header for API calls (your server routes)
  // (This keeps it from accidentally attaching to external URLs)
  if (url.startsWith("/api/") || url.includes("/api/")) {
    const token = getAuth0AccessToken();
    console.log("[api auth] url:", url, "token?", Boolean(token));
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }


  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const headers = buildHeaders(url, data);

  const res = await fetch(url, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const headers = buildHeaders(url);

    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as any;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
