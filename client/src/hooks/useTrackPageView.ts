import { useEffect } from "react";
import { useLocation } from "wouter";

export function useTrackPageView() {
  const [location] = useLocation();

  useEffect(() => {
    // Get token from localStorage
    const customerToken = localStorage.getItem("customerToken");
    const vendorToken = localStorage.getItem("vendorToken");
    const token = customerToken || vendorToken;

    // Prepare headers
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Include Authorization header if user is authenticated
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Track the page view
    fetch("/api/track", {
      method: "POST",
      headers,
      body: JSON.stringify({
        path: location,
        referrer: document.referrer || null,
      }),
    }).catch(() => {
      // Silently fail - don't impact user experience
    });
  }, [location]);
}
