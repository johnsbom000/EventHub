import type { ReactNode } from "react";

type PublishMissingFlags = {
  serviceAreaMode?: boolean;
  serviceLocation?: boolean;
  listingTitle?: boolean;
  listingDescription?: boolean;
  photos?: boolean;
  price?: boolean;
  serviceCenter?: boolean;
  serviceRadiusMiles?: boolean;
};

type PublishErrorPayload = {
  error?: unknown;
  missing?: unknown;
  reasons?: unknown;
};

const GENERIC_PUBLISH_ERROR = "Listing can't be published right now. Please complete required fields and try again.";

const MISSING_REASON_ORDER: Array<[keyof PublishMissingFlags, string]> = [
  ["listingTitle", "Add listing title."],
  ["listingDescription", "Add listing description (at least 10 characters)."],
  ["photos", "Add at least 1 photo."],
  ["price", "Add a valid price."],
  ["serviceAreaMode", "Select service area mode."],
  ["serviceLocation", "Select service location."],
  ["serviceCenter", "For radius mode, set service center."],
  ["serviceRadiusMiles", "For radius mode, set service radius miles."],
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonPayload = (raw: string): PublishErrorPayload | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withoutStatus = trimmed.replace(/^\d{3}\s*:\s*/, "").trim();
  const candidate =
    withoutStatus.startsWith("{") && withoutStatus.endsWith("}")
      ? withoutStatus
      : (() => {
          const start = withoutStatus.indexOf("{");
          const end = withoutStatus.lastIndexOf("}");
          return start >= 0 && end > start ? withoutStatus.slice(start, end + 1) : "";
        })();

  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate);
    return isRecord(parsed) ? (parsed as PublishErrorPayload) : null;
  } catch {
    return null;
  }
};

const normalizeReasons = (payload: PublishErrorPayload | null): string[] => {
  if (!payload) return [];

  if (Array.isArray(payload.reasons)) {
    const reasons = payload.reasons
      .filter((reason): reason is string => typeof reason === "string")
      .map((reason) => reason.trim())
      .filter((reason) => reason.length > 0);

    if (reasons.length > 0) {
      return Array.from(new Set(reasons));
    }
  }

  if (!isRecord(payload.missing)) return [];
  const missing = payload.missing as PublishMissingFlags;

  const reasons = MISSING_REASON_ORDER
    .filter(([key]) => missing[key] === true)
    .map(([, reason]) => reason);

  return Array.from(new Set(reasons));
};

const extractPublishErrorPayload = (error: unknown): PublishErrorPayload | null => {
  if (isRecord(error)) {
    const directPayload: PublishErrorPayload = {
      error: error.error,
      missing: error.missing,
      reasons: error.reasons,
    };
    if (directPayload.missing || directPayload.reasons || directPayload.error) {
      return directPayload;
    }

    if (typeof error.message === "string") {
      return parseJsonPayload(error.message);
    }
  }

  if (typeof error === "string") {
    return parseJsonPayload(error);
  }

  return null;
};

export function getPublishFailureToastContent(error: unknown): {
  title: string;
  description: ReactNode;
} {
  const payload = extractPublishErrorPayload(error);
  const reasons = normalizeReasons(payload);

  if (reasons.length === 0) {
    return {
      title: "Couldn't publish",
      description: GENERIC_PUBLISH_ERROR,
    };
  }

  return {
    title: "Couldn't publish",
    description: (
      <div className="space-y-1">
        <p>Complete these before publishing:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>
    ),
  };
}

