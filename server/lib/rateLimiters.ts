import { createDbRateLimiter } from "./dbRateLimiter";

export const paymentRateLimiter = createDbRateLimiter({
  label: "payments",
  maxPerMinute: 20,
  failClosed: true,
});

export const uploadRateLimiter = createDbRateLimiter({
  label: "uploads",
  maxPerMinute: 30,
});

export const bookingRateLimiter = createDbRateLimiter({
  label: "bookings",
  maxPerMinute: 5,
  failClosed: true,
});

export const eventsRateLimiter = createDbRateLimiter({
  label: "events",
  maxPerMinute: 10,
});

export const trackRateLimiter = createDbRateLimiter({
  label: "track",
  maxPerMinute: 60,
});

// Account creation and onboarding flows — tight limit to prevent scripted signups.
export const onboardingRateLimiter = createDbRateLimiter({
  label: "onboarding",
  maxPerMinute: 5,
});

// General vendor/customer profile and content mutations.
export const mutationRateLimiter = createDbRateLimiter({
  label: "mutation",
  maxPerMinute: 20,
});

// Reviews, disputes, and vendor replies — user-facing social actions.
export const socialRateLimiter = createDbRateLimiter({
  label: "social",
  maxPerMinute: 5,
});

// Chat bootstrap and moderation — slightly more generous than social.
export const messagingRateLimiter = createDbRateLimiter({
  label: "messaging",
  maxPerMinute: 15,
});

// Planning board saves/removes — frequent UX click action.
export const boardsRateLimiter = createDbRateLimiter({
  label: "boards",
  maxPerMinute: 30,
});

// Admin dashboard operations — admins are trusted but should not hammer the DB.
export const adminRateLimiter = createDbRateLimiter({
  label: "admin",
  maxPerMinute: 30,
});

// Public listing browse — throttles scrapers while allowing normal user browsing.
export const browseRateLimiter = createDbRateLimiter({
  label: "browse",
  maxPerMinute: 60,
});
