const rawApiBaseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || "").trim();
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");
const FETCH_PATCH_FLAG = "__eventhub_fetch_base_url_patched__";

function isSpecialScheme(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}

function shouldRouteThroughApiBase(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/") || pathname === "/uploads" || pathname.startsWith("/uploads/");
}

function joinWithApiBase(pathname: string, search = "", hash = ""): string {
  return `${apiBaseUrl}${pathname}${search}${hash}`;
}

export function hasApiBaseUrl(): boolean {
  return apiBaseUrl.length > 0;
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function isApiLikeUrl(url: string): boolean {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) return false;

  if (value.startsWith("/")) return value === "/api" || value.startsWith("/api/");

  if (isSpecialScheme(value)) {
    try {
      const parsed = new URL(value);
      return parsed.pathname === "/api" || parsed.pathname.startsWith("/api/");
    } catch {
      return value.includes("/api/");
    }
  }

  return value === "api" || value.startsWith("api/") || value.includes("/api/");
}

export function resolveRuntimeUrl(url: string): string {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value || !hasApiBaseUrl()) return url;

  if (value.startsWith("/")) {
    return shouldRouteThroughApiBase(value) ? joinWithApiBase(value) : value;
  }

  if (!isSpecialScheme(value)) return value;

  try {
    const parsed = new URL(value);
    if (!shouldRouteThroughApiBase(parsed.pathname)) return value;
    return joinWithApiBase(parsed.pathname, parsed.search, parsed.hash);
  } catch {
    return value;
  }
}

export function resolveAssetUrl(url: string | null | undefined): string {
  const value = (url || "").trim();
  if (!value) return "";
  return resolveRuntimeUrl(value);
}

export function installRuntimeFetchBaseUrl(): void {
  if (typeof window === "undefined" || !hasApiBaseUrl()) return;
  if ((window as any)[FETCH_PATCH_FLAG]) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") {
      return originalFetch(resolveRuntimeUrl(input), init);
    }

    if (input instanceof URL) {
      return originalFetch(resolveRuntimeUrl(input.toString()), init);
    }

    if (input instanceof Request) {
      const resolvedUrl = resolveRuntimeUrl(input.url);
      if (resolvedUrl !== input.url) {
        const nextRequest = new Request(resolvedUrl, input);
        return originalFetch(nextRequest, init);
      }
    }

    return originalFetch(input, init);
  };

  (window as any)[FETCH_PATCH_FLAG] = true;
}
