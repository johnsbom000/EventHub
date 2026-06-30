// ─── Platform fee rates ───────────────────────────────────────────────────────
// EventHub charges NO platform or service fees. These remain as named constants
// (always 0) so the payment math and any callers still resolve cleanly. The env
// overrides are intentionally ignored — fees are off by design, not config.
// Future monetization is a vendor subscription, not per-transaction fees.
export const VENDOR_FEE_RATE = 0;
export const CUSTOMER_FEE_RATE = 0;

// ─── Vendor Pro subscription ──────────────────────────────────────────────────
// Free tier = this many active listings at once, no analytics, no Google sync.
// Pro = unlimited listings + analytics + calendar sync (the product as it works
// today). See server/services/entitlementsService.ts for the entitlement logic.
export const FREE_TIER_MAX_ACTIVE_LISTINGS = 1;
export const PRO_TRIAL_PERIOD_DAYS = 30;
// Stripe Price IDs for the Pro plan (created in the Stripe dashboard). Read from
// env so the same code works across test/live without a redeploy.
export const STRIPE_PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY || "";
export const STRIPE_PRICE_PRO_ANNUAL = process.env.STRIPE_PRICE_PRO_ANNUAL || "";
// Stripe coupon auto-applied at checkout to deliver the launch deal off the base
// prices ($39 -> $29, $390 -> $290). Empty = no discount (charge base price).
export const STRIPE_COUPON_PRO = process.env.STRIPE_COUPON_PRO || "";

// ─── AI reply assistant (Pro-gated, metered) ──────────────────────────────────
// Generates (never auto-sends) suggested replies for vendors in the chat section.
// Each Pro vendor gets AI_INCLUDED_RESPONSES_PER_PERIOD drafts per billing month;
// beyond that, overage auto-bills at AI_OVERAGE_PRICE_CENTS each (opt-out) or hard
// stops (if the vendor opted out). Model is a constant so it's a one-line swap.
export const AI_REPLY_MODEL = "claude-haiku-4-5";
export const AI_INCLUDED_RESPONSES_PER_PERIOD = 200;
export const AI_OVERAGE_PRICE_CENTS = 5;
// Stripe Billing Meter event name + metered Price ID for AI-reply overage (created
// in the Stripe dashboard / via setup). Read from env so test/live both work.
export const STRIPE_AI_OVERAGE_METER_EVENT = process.env.STRIPE_AI_OVERAGE_METER_EVENT || "ai_reply_overage";
export const STRIPE_PRICE_AI_OVERAGE = process.env.STRIPE_PRICE_AI_OVERAGE || "";

// ─── Stripe fee estimation ────────────────────────────────────────────────────
export const STRIPE_FEE_ESTIMATE_PERCENT = 0.029;
export const STRIPE_FEE_ESTIMATE_FIXED_CENTS = 30;
export const VENDOR_ABSORBS_STRIPE_FEES = false;

// ─── Payout / payment lifecycle ───────────────────────────────────────────────
export const PAYOUT_RELEASE_MODE = "auto_24h_hold";
export const AUTO_PAYOUT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Booking expiry ───────────────────────────────────────────────────────────
export const BOOKING_PENDING_EXPIRY_MINUTES = 30;
export const BOOKING_PENDING_EXPIRY_REASON = "payment_session_expired";
export const BOOKING_VENDOR_RESPONSE_EXPIRY_DAYS = 7;
export const BOOKING_VENDOR_NO_RESPONSE_REASON = "vendor_no_response";

// ─── Analytics data retention ─────────────────────────────────────────────────
// Append-only analytics logs (web_traffic, listing_traffic, event_log) are
// trimmed past this window by the data-retention background sweep. Expired
// notifications are cleaned via their own expires_at column, not this value.
export const ANALYTICS_RETENTION_DAYS = 365;

// ─── Listing validation ───────────────────────────────────────────────────────
export const MIN_LISTING_PHOTO_COUNT = 3;
export const LISTING_DESCRIPTION_MAX_CHARS = 1000;
export const LISTING_SUBCATEGORY_MAX_CHARS = 120;
export const LISTING_SUBCATEGORY_DETAIL_MAX_CHARS = 120;
export const LISTING_CATEGORY_VALUES = ["Rentals", "Services", "Venues", "Catering"] as const;
export type ListingCategoryValue = (typeof LISTING_CATEGORY_VALUES)[number];

// ─── Google OAuth ─────────────────────────────────────────────────────────────
export const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Chat / messaging ─────────────────────────────────────────────────────────
export const CHAT_POLICY_WARNING =
  "For your safety, do not share personal contact info, payment card details, or sensitive personal data in chat.";

// ─── Google Calendar error messages ──────────────────────────────────────────
// Maps GoogleCalendarConnectionError codes to safe user-facing messages.
// Internal details (token strings, raw Google API responses) must not reach the client.
export const SAFE_GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_connected: "Google Calendar is not connected. Please reconnect in your settings.",
  google_refresh_token_missing: "Google Calendar authorization has expired. Please reconnect.",
  google_access_token_missing: "Unable to refresh Google Calendar access. Please reconnect.",
  google_oauth_config_missing: "Google Calendar integration is not configured.",
  google_calendar_not_selected: "No Google Calendar is selected. Please choose one in your settings.",
  vendor_account_not_found: "Vendor account not found.",
  booking_time_range_invalid: "Booking time range is invalid.",
  booking_timezone_conversion_failed: "Booking date could not be converted to your timezone.",
  booking_event_date_missing: "Booking is missing an event date.",
  booking_event_date_invalid: "Booking event date is invalid.",
  booking_event_datetime_invalid: "Booking event date or time is invalid.",
  booking_event_datetime_timezone_invalid: "Booking date or time is invalid for your timezone.",
  booking_event_datetime_conversion_failed: "Booking date could not be formatted for Google sync.",
  google_booking_event_create_invalid: "Google Calendar returned an unexpected response when creating the event.",
  google_calendar_create_invalid: "Google Calendar returned an unexpected response when creating the calendar.",
};
