// Publish stipulation on launch-campaign comps — pure policy, no DB imports so
// tests can exercise it without a DATABASE_URL.
//
// The vendor must publish their first listing within PUBLISH_DEADLINE_DAYS of
// account creation or the comp is revoked and the slot returns to the pool.
// Starting Stripe Connect onboarding (stripe_connect_id set) extends the
// deadline by STRIPE_GRACE_DAYS, since Stripe's identity verification can take
// days and publishing is blocked until it completes.

export const PUBLISH_DEADLINE_DAYS = 7;
export const STRIPE_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Effective publish deadline for a launch-comp vendor. Single source of truth —
 * used by the enforcement job, the day-5 nudge, and the dashboard banner, so
 * what the vendor sees always matches what the job enforces.
 */
export function getCompPublishDeadline(account: {
  createdAt: Date;
  stripeConnectId: string | null;
}): { deadline: Date; graceApplied: boolean } {
  const graceApplied = Boolean(account.stripeConnectId);
  const days = PUBLISH_DEADLINE_DAYS + (graceApplied ? STRIPE_GRACE_DAYS : 0);
  return {
    deadline: new Date(account.createdAt.getTime() + days * DAY_MS),
    graceApplied,
  };
}
