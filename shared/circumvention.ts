// ─── Off-platform circumvention detection ─────────────────────────────────────
// Hard patterns that indicate someone is trying to move the conversation off
// EventHub (sharing email, phone, external links, or social handles). Shared by
// the chat composer (client) and the AI reply assistant (server) so generated
// drafts are held to the same policy as typed messages.

export const CIRCUMVENTION_HARD_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/,
  /(\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/,
  /\b(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)[\s\-]+(zero|one|two|three|four|five|six|seven|eight|nine)/i,
  /https?:\/\/[^\s<>"']+/i,
  /\bwww\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}/i,
  /\b[a-zA-Z0-9\-]{2,}\.(com|net|org|io|co|app|biz|info|me|us|shop|store|online|site|web)\b/i,
  /\b(instagram|facebook|twitter|tiktok|linkedin|snapchat|youtube|pinterest|threads|x\.com)\.(com|me)\/[^\s<>"']+/i,
  /@[a-zA-Z0-9_.]{3,}/,
];

export function detectChatCircumvention(text: string): { blocked: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const pattern of CIRCUMVENTION_HARD_PATTERNS) {
    const found = text.match(pattern)?.[0];
    if (found) matches.push(found.slice(0, 120));
  }
  return { blocked: matches.length > 0, matches };
}
