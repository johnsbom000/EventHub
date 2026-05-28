// ─── Platform fee rates ───────────────────────────────────────────────────────
// Read from env so they can be changed without a code deploy.
export const VENDOR_FEE_RATE = parseFloat(process.env.VENDOR_FEE_RATE || "0.08");
export const CUSTOMER_FEE_RATE = parseFloat(process.env.CUSTOMER_FEE_RATE || "0.05");

// ─── Marquee Vendor program ───────────────────────────────────────────────────
export const MARQUEE_VENDOR_MAX_SPOTS = 20;
export const MARQUEE_HOLIDAY_BOOKING_COUNT = 20;   // fee holiday ends at N bookings…
export const MARQUEE_HOLIDAY_DAYS = 30;             // …OR 30 days, whichever comes LAST
export const MARQUEE_REFERRAL_BONUS_BOOKINGS = 5;  // each successful referral adds 5 bonus bookings
export const MARQUEE_REFERRAL_BONUS_FEE_RATE = 0.04; // 4% on those bonus bookings (half the normal 8%)
export const MARQUEE_VENDOR_FEE_RATE = 0.06;       // 6% for 24 months after holiday
export const MARQUEE_RATE_MONTHS = 24;
export const MARQUEE_CUSTOMER_FEE_RATE = 0.025;    // 2.5% customer fee for first 12 months
export const MARQUEE_CUSTOMER_FEE_MONTHS = 12;
export const MARQUEE_VISIBILITY_MONTHS = 12;        // search boost for first 12 months

if (!Number.isFinite(VENDOR_FEE_RATE) || VENDOR_FEE_RATE <= 0 || VENDOR_FEE_RATE >= 1) {
  throw new Error(
    `Invalid VENDOR_FEE_RATE env var: "${process.env.VENDOR_FEE_RATE}". Must be a number between 0 (exclusive) and 1 (exclusive), e.g. "0.08" for 8%.`
  );
}
if (!Number.isFinite(CUSTOMER_FEE_RATE) || CUSTOMER_FEE_RATE < 0 || CUSTOMER_FEE_RATE >= 1) {
  throw new Error(
    `Invalid CUSTOMER_FEE_RATE env var: "${process.env.CUSTOMER_FEE_RATE}". Must be a number between 0 (inclusive) and 1 (exclusive), e.g. "0.05" for 5%.`
  );
}

// ─── Founding Vendor program ──────────────────────────────────────────────────
export const FOUNDING_VENDOR_HOLIDAY_BOOKING_COUNT = 10; // 0% until N bookings…
export const FOUNDING_VENDOR_HOLIDAY_DAYS = 14;          // …OR 14 days, whichever comes LAST
export const FOUNDING_VENDOR_FEE_RATE = 0.06;            // 6% for 12 months after holiday
export const FOUNDING_VENDOR_RATE_MONTHS = 12;
export const FOUNDING_VENDOR_VISIBILITY_MONTHS = 6;      // search boost for 6 months
export const FOUNDING_VENDOR_REFERRAL_BONUS_BOOKINGS = 2; // 2 extra bookings per referral
export const FOUNDING_VENDOR_REFERRAL_BONUS_FEE_RATE = 0.04; // 4% on referral bonus bookings

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
