# EventHub Event Log Reference

All events are written to the `event_log` table. Query with `scripts/event-queries.ts`.

---

## Table Schema

| Column | Type | Notes |
|---|---|---|
| `id` | text (uuid) | `gen_random_uuid()` |
| `event_name` | text | Indexed |
| `actor_type` | text | `'vendor' \| 'customer' \| 'system'` |
| `actor_id` | text nullable | Vendor account ID or user ID; indexed |
| `session_id` | text nullable | Client sessionStorage UUID; stitches anonymous sessions; indexed |
| `properties` | jsonb | Event-specific payload |
| `created_at` | timestamptz | Indexed DESC |

---

## Vendor Activation

### `vendor_signup_started`
Fires when a vendor initiates Auth0 login during onboarding (before the popup/redirect).

| Property | Type | Notes |
|---|---|---|
| `step` | number | Onboarding step the vendor was on |

**Fire site:** `client/src/pages/VendorOnboarding.tsx` — just before `loginWithPopupFirst()` call

---

### `vendor_signup_completed`
Fires when the server successfully processes `/api/vendor/onboarding/complete`.

| Property | Type | Notes |
|---|---|---|
| `is_new` | boolean | `true` if this is the vendor's first onboarding |
| `is_upgrade` | boolean | `true` if an existing customer/vendor is adding a profile |

**Fire site:** `server/routers/vendor.ts` — end of `POST /api/vendor/onboarding/complete` handler, before `res.json()`

---

### `vendor_onboarding_step_viewed`
Fires when the current onboarding step changes.

| Property | Type | Notes |
|---|---|---|
| `step` | number | Step number (1–3) |

**Fire site:** `client/src/pages/VendorOnboarding.tsx` — `useEffect` on `currentStep`

---

### `vendor_onboarding_step_completed`
Fires when a vendor completes a step (clicks Next or advances).

| Property | Type | Notes |
|---|---|---|
| `step` | number | Step number that was completed |

**Fire site:** `client/src/pages/VendorOnboarding.tsx` — inside `markStepComplete()`

---

### `vendor_onboarding_abandoned`
Fires when the vendor navigates away from the onboarding page mid-flow. Uses `sendBeacon` so it fires during page unload.

| Property | Type | Notes |
|---|---|---|
| `step` | number | Step the vendor was on when they left |

**Fire site:** `client/src/pages/VendorOnboarding.tsx` — `beforeunload` listener via `trackEventBeacon`

---

### `vendor_first_listing_published`
Fires when a vendor publishes their very first listing (i.e., transitions from 0 active listings to 1).

| Property | Type | Notes |
|---|---|---|
| `listing_id` | string | The listing ID |
| `category` | string \| null | Listing category |

**Fire site:** `server/routers/vendor.ts` — end of `PATCH /api/vendor/listings/:id/publish` handler, after DB update confirms status=active and count check returns 1

---

## Customer Matching

### `search_performed`
Fires after the browse page receives search results.

| Property | Type | Notes |
|---|---|---|
| `query` | string \| null | Text search query (client-side filter) |
| `location` | string \| null | Human-readable location label |
| `category` | string \| null | Selected category filter |
| `subcategories` | string[] \| null | Selected subcategory filters |
| `sort` | string | Sort order |
| `results_count` | number | Total results returned by server |

**Fire site:** `client/src/pages/BrowseVendors.tsx` — `useEffect` on `listingPage` data

---

### `vendor_card_clicked`
Fires when a user clicks a listing card to open the listing detail page.

| Property | Type | Notes |
|---|---|---|
| `vendor_id` | string \| null | Vendor account ID |
| `listing_id` | string | Listing ID |

**Fire site:** `client/src/components/ListingCard.tsx` — inside `handleOpenListing()`

---

### `vendor_profile_viewed`
Fires when a vendor's public shop page loads.

| Property | Type | Notes |
|---|---|---|
| `vendor_id` | string | Vendor account ID (from URL param) |
| `source` | string \| null | `document.referrer` at time of view |

**Fire site:** `client/src/pages/vendorhub.tsx` — `useEffect` on `vendorId`

---

### `contact_form_opened`
Fires when a customer clicks "Book Now" to initiate the checkout/booking flow. No standalone contact form exists — all messaging flows through bookings.

| Property | Type | Notes |
|---|---|---|
| `vendor_id` | string | Vendor account ID |
| `listing_id` | string | Listing ID being booked |

**Fire site:** `client/src/pages/ListingDetail.tsx` — inside `handleBookNow()`, just before `onStartCheckout()`

---

### `contact_message_sent`
Fires when a customer or vendor successfully sends a message in the booking chat.

| Property | Type | Notes |
|---|---|---|
| `vendor_id` | string \| null | Vendor account ID from conversation context |
| `booking_id` | string \| null | Booking ID |
| `role` | `'vendor' \| 'customer'` | Who sent the message |

**Fire site:** `client/src/features/chat/BookingChatWorkspace.tsx` — after `activeChannel?.sendMessage()` resolves

---

## Conversion

### `booking_request_created`
Fires when a customer creates a booking in request-to-book (non-instant) mode.

| Property | Type | Notes |
|---|---|---|
| `booking_id` | string | Booking ID |
| `listing_id` | string \| null | Listing ID |
| `vendor_id` | string \| null | Vendor account ID |
| `status` | string | Booking status after creation (`'pending'`) |

**Fire site:** `server/routers/bookings.ts` — end of `POST /api/bookings` handler, when `bookingStatus !== 'confirmed'`

---

### `booking_confirmed`
Fires when a booking is instantly confirmed (instant-book listing within service radius).

| Property | Type | Notes |
|---|---|---|
| `booking_id` | string | Booking ID |
| `listing_id` | string \| null | Listing ID |
| `vendor_id` | string \| null | Vendor account ID |
| `status` | string | `'confirmed'` |

**Fire site:** `server/routers/bookings.ts` — end of `POST /api/bookings` handler, when `bookingStatus === 'confirmed'`

---

### `booking_paid`
Fires when Stripe's `payment_intent.succeeded` webhook processes a booking payment.

| Property | Type | Notes |
|---|---|---|
| `booking_id` | string | Booking ID |
| `payment_intent_id` | string | Stripe PaymentIntent ID |

**Fire site:** `server/routers/payments.ts` — inside `payment_intent.succeeded` webhook handler, after transaction completes, only for `payment_type = 'booking'`

---

## Example Funnel Query

Ask a future Claude session: *"Show me the onboarding drop-off rate for the last 7 days"* — it should read this file and run `scripts/event-queries.ts` query #1.
