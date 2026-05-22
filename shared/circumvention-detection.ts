/**
 * Circumvention detection utility.
 *
 * Two-tier system:
 *  - HARD BLOCK: regex patterns that unmistakably match contact information
 *    (emails, phone numbers, URLs, social media links/handles).
 *    Content is blocked from saving/sending and a warning is issued.
 *
 *  - SOFT FLAG: keyword/phrase patterns that suggest intent to route
 *    business off-platform. Content is allowed through but queued for
 *    admin review.
 *
 * Both tiers apply to: chat messages, listing descriptions/titles,
 * vendor descriptions, and taglines.
 */

export type DetectionResult = {
  hardBlocked: boolean;
  softFlagged: boolean;
  matches: string[];
  blockReasons: string[];
};

// ─── Hard-block patterns ──────────────────────────────────────────────────────

const HARD_BLOCK_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
    label: "email address",
  },
  // US phone numbers — standard formats
  {
    pattern: /(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/,
    label: "phone number",
  },
  // Written-out phone digits (e.g. "five five five one two three four five six seven")
  {
    pattern:
      /\b(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)/i,
    label: "phone number (written out)",
  },
  // URLs with protocol
  {
    pattern: /https?:\/\/[^\s<>"']+/i,
    label: "website URL",
  },
  // www. URLs without protocol
  {
    pattern: /\bwww\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}/i,
    label: "website URL",
  },
  // Bare domain with common TLDs (catches "mysite.com", "vendor.io", etc.)
  {
    pattern: /\b[a-zA-Z0-9\-]{2,}\.(com|net|org|io|co|app|biz|info|me|us|shop|store|online|site|web)\b/i,
    label: "website URL",
  },
  // Social media platform links
  {
    pattern: /\b(instagram|facebook|twitter|tiktok|linkedin|snapchat|youtube|pinterest|threads|x\.com)\.(com|me)\/[^\s<>"']+/i,
    label: "social media link",
  },
  // @username handles (must be at least 3 chars to avoid false positives on "@ 9am")
  {
    pattern: /@[a-zA-Z0-9_.]{3,}/,
    label: "social media handle",
  },
];

// ─── Soft-flag phrases ────────────────────────────────────────────────────────

const SOFT_FLAG_PHRASES: string[] = [
  "find us on",
  "find me on",
  "look us up",
  "look me up",
  "search for us",
  "google us",
  "google me",
  "check us out on",
  "check me out on",
  "follow us on",
  "follow me on",
  "we are on instagram",
  "i am on instagram",
  "i'm on instagram",
  "we're on facebook",
  "i'm on facebook",
  "dm me",
  "dm us",
  "direct message me",
  "direct message us",
  "text me",
  "text us",
  "call me",
  "call us",
  "reach me at",
  "reach us at",
  "contact me at",
  "contact us at",
  "contact us directly",
  "contact me directly",
  "book directly",
  "book with us directly",
  "book outside",
  "book us outside",
  "bypass",
  "my website",
  "our website",
  "visit our",
  "visit my",
  "check out our website",
  "check out my website",
  "look up our",
  "yelp",
  "google my business",
  "google reviews",
  "outside of eventhub",
  "off the platform",
  "off platform",
  "without the app",
  "without eventhub",
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run both tiers of detection against a piece of text.
 * Returns a result indicating whether the content should be hard-blocked,
 * soft-flagged, or neither, along with the specific matches found.
 */
export function checkContent(text: string): DetectionResult {
  const normalized = (text || "").trim();
  if (!normalized) {
    return { hardBlocked: false, softFlagged: false, matches: [], blockReasons: [] };
  }

  const matches: string[] = [];
  const blockReasons: string[] = [];

  // Hard-block scan
  for (const { pattern, label } of HARD_BLOCK_PATTERNS) {
    if (pattern.test(normalized)) {
      const found = normalized.match(pattern)?.[0] ?? label;
      matches.push(found.slice(0, 120));
      if (!blockReasons.includes(label)) {
        blockReasons.push(label);
      }
    }
  }

  const hardBlocked = blockReasons.length > 0;

  // Soft-flag scan (only if not already hard-blocked — hard takes priority)
  let softFlagged = false;
  if (!hardBlocked) {
    const lower = normalized.toLowerCase();
    for (const phrase of SOFT_FLAG_PHRASES) {
      if (lower.includes(phrase)) {
        matches.push(phrase);
        softFlagged = true;
        break; // one match is enough to flag
      }
    }
  }

  return { hardBlocked, softFlagged, matches, blockReasons };
}

/**
 * Human-readable explanation for a hard block, shown to the user in the modal.
 * e.g. ["email address", "website URL"] → "email addresses and website URLs"
 */
export function blockReasonSummary(blockReasons: string[]): string {
  if (!blockReasons.length) return "contact information";
  if (blockReasons.length === 1) return blockReasons[0] + "s";
  const last = blockReasons[blockReasons.length - 1];
  const rest = blockReasons.slice(0, -1);
  return rest.map((r) => r + "s").join(", ") + " and " + last + "s";
}
