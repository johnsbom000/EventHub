import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const vendorToken = localStorage.getItem("vendorToken");
  const customerToken = localStorage.getItem("customerToken");
  const headers: HeadersInit = data ? { "Content-Type": "application/json" } : {};
  
  // Add appropriate Authorization header based on route
  if (url.includes("/vendor/")) {
    if (vendorToken) {
      headers["Authorization"] = `Bearer ${vendorToken}`;
    }
  } else if (url.includes("/customer/") || url.includes("/admin/")) {
    if (customerToken) {
      headers["Authorization"] = `Bearer ${customerToken}`;
    }
  } else {
    // For non-specific routes, try vendor token first, then customer
    if (vendorToken) {
      headers["Authorization"] = `Bearer ${vendorToken}`;
    } else if (customerToken) {
      headers["Authorization"] = `Bearer ${customerToken}`;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
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
    const vendorToken = localStorage.getItem("vendorToken");
    const customerToken = localStorage.getItem("customerToken");
    const url = queryKey.join("/") as string;
    const headers: HeadersInit = {};
    
    // Add appropriate Authorization header based on route
    if (url.includes("/vendor/")) {
      if (vendorToken) {
        headers["Authorization"] = `Bearer ${vendorToken}`;
      }
    } else if (url.includes("/customer/") || url.includes("/admin/")) {
      if (customerToken) {
        headers["Authorization"] = `Bearer ${customerToken}`;
      }
    } else {
      // For non-specific routes, try vendor token first, then customer
      if (vendorToken) {
        headers["Authorization"] = `Bearer ${vendorToken}`;
      } else if (customerToken) {
        headers["Authorization"] = `Bearer ${customerToken}`;
      }
    }

    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
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
