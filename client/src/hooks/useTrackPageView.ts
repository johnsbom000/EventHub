import { useEffect } from "react";
import { useLocation } from "wouter";
import { getFreshAccessToken } from "@/lib/authToken";

export function useTrackPageView() {
  const [location] = useLocation();

  useEffect(() => {
    // Meta Pixel: fire PageView on first load and on every client-side route
    // change (wouter `location`). Guarded — no-op until metaPixel.ts has
    // defined window.fbq.
    window.fbq?.("track", "PageView");

    let cancelled = false;

    void (async () => {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      const token = await getFreshAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      if (cancelled) return;

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
    })();

    return () => {
      cancelled = true;
    };
  }, [location]);
}
