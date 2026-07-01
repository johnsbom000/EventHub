import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getFreshAccessToken } from "@/lib/authToken";
import { isApiLikeUrl, resolveRuntimeUrl } from "@/lib/runtimeUrls";

// Called whenever any API response returns 401. AuthTokenBridge registers this
// when the user appears authenticated so stale sessions (e.g. synced via iCloud
// or Google account across devices) trigger a clean logout immediately.
let global401Callback: (() => void) | null = null;

export function setGlobal401Callback(fn: (() => void) | null) {
  global401Callback = fn;
}

// Called whenever any API response is 403 email_not_verified. The server gates
// all protected routes on Auth0 email verification, so a session whose email is
// unverified would otherwise see every request fail with no way forward.
// EmailVerificationGate registers this and swaps the app for a recovery screen
// (verify → continue, or log out).
let globalEmailUnverifiedCallback: (() => void) | null = null;

export function setGlobalEmailUnverifiedCallback(fn: (() => void) | null) {
  globalEmailUnverifiedCallback = fn;
}

// For callers using raw fetch (outside apiRequest/getQueryFn) that detect the
// 403 themselves and want to hand off to the EmailVerificationGate.
export function notifyEmailUnverified() {
  globalEmailUnverifiedCallback?.();
}

export class ApiRequestError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string) {
    super(`${status}: ${responseText || "Request failed"}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.responseText = responseText;
  }
}

// Extracts a clean, user-facing message from an error thrown by `apiRequest`.
// `ApiRequestError.message` is formatted as "<status>: <raw body>" and the raw
// body is usually JSON like `{"error":"..."}`, so a naive `err.message` toast
// renders ugly text (e.g. `400: {"error":"..."}`). This surfaces the server's
// real reason instead, falling back to a generic message when none is available.
export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw =
    error instanceof ApiRequestError
      ? error.responseText
      : error instanceof Error
        ? error.message.replace(/^\d{3}:\s*/, "") // strip "400: " prefix
        : typeof error === "string"
          ? error
          : "";
  const text = raw?.trim();
  if (!text) return fallback;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      const msg = parsed?.error ?? parsed?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    } catch {
      /* not JSON — fall through to raw text */
    }
  }
  return text;
}

export function getApiErrorStatus(error: unknown): number | null {
  if (!error) return null;
  if (typeof error === "object" && error !== null && "status" in error) {
    const statusValue = Number((error as any).status);
    if (Number.isFinite(statusValue)) return statusValue;
  }
  if (error instanceof Error) {
    const match = error.message.match(/^(\d{3}):/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function buildHeaders(url: string, data?: unknown): Promise<HeadersInit> {
  const headers: Record<string, string> = {};

  if (data !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // Only attach auth header for API calls (your server routes)
  // (This keeps it from accidentally attaching to external URLs)
  if (isApiLikeUrl(url)) {
    const token = await getFreshAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }


  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) global401Callback?.();
    const text = (await res.text()) || res.statusText;
    if (res.status === 403 && text.includes('"email_not_verified"')) {
      globalEmailUnverifiedCallback?.();
    }
    throw new ApiRequestError(res.status, text);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined
): Promise<Response> {
  const requestUrl = resolveRuntimeUrl(url);
  const headers = await buildHeaders(requestUrl, data);

  const res = await fetch(requestUrl, {
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
    const url = resolveRuntimeUrl(queryKey.join("/") as string);
    const headers = await buildHeaders(url);

    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      global401Callback?.();
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
