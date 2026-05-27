import { db } from "../db";
import { eventLog } from "@shared/schema";

export function logEvent(
  name: string,
  actorType: "vendor" | "customer" | "system",
  actorId: string | null,
  properties: Record<string, unknown>,
  sessionId?: string | null
): void {
  db.insert(eventLog)
    .values({
      eventName: name,
      actorType,
      actorId: actorId ?? null,
      sessionId: sessionId ?? null,
      properties,
    })
    .catch((err) => console.error("[events] Failed to log", name, err));
  // Intentionally fire-and-forget: no await, never throws
}
