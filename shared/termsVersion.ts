/**
 * The version of the Terms of Service currently in force.
 *
 * WHY THIS EXISTS: acceptance used to be a checkbox that only enabled a button —
 * `agreedToTerms` was local React state, never sent to the server, and no column
 * recorded it. That makes every protective clause (arbitration, the class
 * waiver, the $100 liability cap) hard to enforce, and makes a fee change
 * impossible to defend, because you cannot show WHAT a given user agreed to or
 * WHEN.
 *
 * BUMP THIS whenever the substance of the Terms changes — fees, dispute windows,
 * governing law, arbitration, liability. Do NOT bump it for typos, translation
 * fixes, or formatting: every bump means existing users are on a stale version,
 * and you want that signal to mean something.
 *
 * Format is the ISO date the version took effect, which sorts correctly as a
 * string and reads unambiguously in a legal context. It is rendered on the Terms
 * page and stamped onto vendor_accounts / users at acceptance.
 *
 * HISTORY
 *   2026-08-18  Vendor commission (8%) and customer service fee (5%) disclosed;
 *               legacy-vendor exemption added; Stripe fee allocation stated;
 *               governing law and venue fixed to Utah; dispute window stated as
 *               72 hours in all three locales.
 *   2026-08-19  Sections 8–14 added (Version 8): acceptable use, user-content
 *               license + DMCA, subscription auto-renewal & billing, termination,
 *               warranty disclaimer & liability limits, indemnification, general
 *               provisions. Vendor damage-claim window tied to event end (matches
 *               the enforced booking_end_at + 72h window) instead of "item return".
 *               Security-deposit handling disclosed in Section 6 (auto-refund 72h
 *               after event end absent an open dispute; withhold on upheld claims).
 */
export const TERMS_VERSION = "2026-08-19";

/**
 * True when a recorded acceptance is for the Terms currently in force.
 * `null` / `undefined` means the user has never accepted anything on record —
 * treated as stale, never as accepted.
 */
export function hasAcceptedCurrentTerms(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion === TERMS_VERSION;
}
