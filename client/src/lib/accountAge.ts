/**
 * "Is this account newly created?" — the gate on the signup conversion event.
 *
 * Deliberately in its own module with NO imports. tracking.ts pulls in posthog.ts,
 * which reads `import.meta.env` and therefore only loads under Vite; keeping this
 * logic dependency-free is what makes it directly testable under plain node
 * (same reason bookingAmounts.ts stands alone).
 */

/**
 * How recently an account must have been created for a post-login redirect to
 * count as a signup conversion rather than a returning login.
 *
 * Ten minutes covers the Auth0 round trip, email verification, and a slow
 * device, while being far shorter than any plausible gap before a real user
 * logs back in. Compared against the SERVER's `createdAt`, so clearing browser
 * storage cannot manufacture a conversion.
 */
export const ACCOUNT_IS_NEW_WINDOW_MS = 10 * 60 * 1000;

/**
 * True when a server-supplied creation timestamp falls inside the window.
 *
 * Fails closed on anything unusable — missing, malformed, or in the future.
 * Undercounting a conversion is recoverable; teaching Meta that logins are
 * registrations is not, because it corrupts delivery for the whole campaign.
 */
export function isAccountNew(
  createdAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!createdAt) return false;
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  const age = now - t;
  // age < 0 means the timestamp is in the future (clock skew) — not new.
  return age >= 0 && age <= ACCOUNT_IS_NEW_WINDOW_MS;
}
