import { getFreshAccessToken } from "@/lib/authToken";

const SESSION_KEY = "eh_session_id";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function trackEvent(
  name: string,
  properties: Record<string, unknown> = {}
): void {
  void (async () => {
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      const token = await getFreshAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      await fetch("/api/events", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, properties, sessionId: getSessionId() }),
      });
    } catch {
      // Never throw — analytics must not impact user experience
    }
  })();
}

// Use for beforeunload events — sendBeacon survives navigation where fetch does not
export function trackEventBeacon(
  name: string,
  properties: Record<string, unknown> = {}
): void {
  try {
    const payload = JSON.stringify({ name, properties, sessionId: getSessionId() });
    navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
  } catch {
    // Never throw
  }
}
