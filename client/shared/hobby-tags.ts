export const HOBBY_MAX_ITEMS = 15;
export const HOBBY_MAX_LABEL_LENGTH = 30;

function titleCaseNoApostropheBoost(word: string): string {
  if (!word) return "";
  const lowered = word.toLowerCase();
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

function cleanRawToken(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[’]/g, "'")
    .replace(/[^a-zA-Z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHobbyLabel(raw: unknown, maxLen = HOBBY_MAX_LABEL_LENGTH): string {
  const cleaned = cleanRawToken(raw).slice(0, maxLen);
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => titleCaseNoApostropheBoost(word))
    .join(" ");
}

export function normalizeHobbyInput(raw: string, maxLen = HOBBY_MAX_LABEL_LENGTH): string {
  const cleaned = (raw || "")
    .replace(/[’]/g, "'")
    .replace(/[^a-zA-Z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s+/, "");
  const hasTrailingSpace = /\s$/.test(cleaned);
  const normalized = normalizeHobbyLabel(cleaned, maxLen);
  if (!normalized) return "";
  return hasTrailingSpace && normalized.length < maxLen ? `${normalized} ` : normalized;
}

export function normalizeHobbyList(value: unknown, maxItems = HOBBY_MAX_ITEMS): string[] {
  const rawItems: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|\n]/g)
      : [];

  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const rawItem of rawItems) {
    const label = normalizeHobbyLabel(rawItem);
    if (!label) continue;
    const dedupeKey = label.toLowerCase();
    if (unique.has(dedupeKey)) continue;
    unique.add(dedupeKey);
    normalized.push(label);
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

export function serializeHobbyList(value: unknown, maxItems = HOBBY_MAX_ITEMS): string {
  return normalizeHobbyList(value, maxItems).join(", ");
}
