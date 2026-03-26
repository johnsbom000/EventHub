import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getFreshAccessToken } from "@/lib/authToken";
import { isApiLikeUrl, resolveRuntimeUrl } from "@/lib/runtimeUrls";

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
    const text = (await res.text()) || res.statusText;
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
