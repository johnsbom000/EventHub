// ─── Platform fee rates ───────────────────────────────────────────────────────
// EventHub charges NO platform or service fees. These remain as named constants
// (always 0) so the payment math and any callers still resolve cleanly. The env
// overrides are intentionally ignored — fees are off by design, not config.
// Future monetization is a vendor subscription, not per-transaction fees.
export const VENDOR_FEE_RATE = 0;
export const CUSTOMER_FEE_RATE = 0;

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
