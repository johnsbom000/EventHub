# Event Hub Decisions Log

Last updated: February 24, 2026

## Purpose
This file tracks decisions that affect product scope, architecture, and launch tradeoffs.

Template for new entries:

## [YYYY-MM-DD] Decision title
- Context:
- Decision:
- Why:
- Impact:
- Revisit trigger:

---

## [2026-02-24] Make customer display-name updates flow through shared customer profile API state
- Context: Updating display name in Customer Dashboard profile did not update the profile header name or top-right nav avatar initials.
- Decision: Persist display-name edits via `PATCH /api/customer/me`, return `displayName` from customer profile APIs, and have customer dashboard/nav use `displayName` with `name` fallback from the shared `/api/customer/me` query.
- Why: Keeps profile identity display consistent across customer dashboard surfaces without UI redesign.
- Impact: Display-name changes now propagate immediately after save through react-query invalidation; profile-only updates no longer risk clearing `defaultLocation`.
- Revisit trigger: If account model is unified further and customer identity fields are consolidated into a single canonical name field.

## [2026-02-24] Add optional customer profile photo using existing customer profile API storage
- Context: Customers need an optional single profile photo with circular preview and the ability to revert to initials.
- Decision: Add profile-photo upload/drop support in Customer Profile, persist photo data URL through `PATCH /api/customer/me`, and store it in `defaultLocation` metadata (`_profilePhotoDataUrl`) to avoid a schema migration during MVP.
- Why: Delivers requested avatar behavior quickly while preserving launch velocity and avoiding risky database changes in active flows.
- Impact: Customer profile card and top-right nav avatar now show the saved photo when present; users can remove the photo and fall back to initials; checkout location persistence remains compatible.
- Revisit trigger: When user profile fields are formally expanded (e.g., dedicated avatar column/storage), migrate photo metadata out of `defaultLocation`.

## [2026-02-24] Optimize customer profile photos client-side and raise upload size allowance
- Context: Real customer photos frequently exceed a strict 2MB cap and fail before upload.
- Decision: Increase allowed raw profile photo file size to 12MB and add client-side resize/compression before save (targeting smaller encoded avatars).
- Why: Reduces upload failures from common phone images while keeping stored avatar payloads lightweight for dashboard performance.
- Impact: Users can select larger original images; app automatically optimizes them and still enforces single-photo behavior with initials fallback.
- Revisit trigger: When profile photos move to dedicated object storage/CDN with server-side processing.

## [2026-02-24] Keep customer profile photo storage cap at 2MB while optimizing client-side
- Context: Requirement changed to avoid increasing persisted profile-photo size.
- Decision: Keep effective saved profile-photo cap at 2MB and rely on client-side resize/compression before save; reject only if optimized output still exceeds 2MB.
- Why: Preserves payload discipline while still handling large source images from phones.
- Impact: Source image selection can be larger, but saved profile-photo payload remains capped at 2MB in both frontend and backend validation.
- Revisit trigger: If profile photos move to object storage with dedicated transformation pipeline.

## [2026-02-24] Add draggable circular fitting and deterministic initials fallback for customer avatars
- Context: "Use initials" could appear blank and uploaded photos were hard-cropped without user positioning control.
- Decision: Render profile avatar preview with explicit theme-colored initials fallback and add drag-to-reposition controls inside circular crop preview before saving.
- Why: Improves reliability of identity display and prevents accidental face/head cutoff while keeping profile photo flow lightweight.
- Impact: Initials now derive from display name consistently (one-word names use first two characters); users can reposition uploaded photos and saved avatar reflects chosen framing in profile and top-right nav.
- Revisit trigger: If a full multi-step image editor (zoom/rotate/crop modal) is introduced.

## [2026-02-24] Move customer avatar repositioning into explicit modal editor with drag + scale
- Context: Inline crop controls were not discoverable enough, and users expected an explicit edit step after upload.
- Decision: Switch profile photo CTA to `Edit photo` after upload, open a modal editor with circular preview, support drag reposition + scale slider, and apply changes only when modal `Save` is clicked.
- Why: Matches expected workflow while preserving current dashboard layout and single-photo behavior.
- Impact: Upload button now transitions to edit flow, modal provides clearer control over framing, and saved avatar uses chosen drag/scale crop for profile and nav surfaces.
- Revisit trigger: If profile image editing is expanded to include rotate/reset presets or multi-device touch gestures.

## [2026-02-24] Raise Express JSON parser limit to support base64 profile-photo payloads
- Context: Saving customer profile updates with photo could fail with `request entity too large` before route-level validation executed.
- Decision: Set `express.json` and `express.urlencoded` limits to `6mb` in server bootstrap.
- Why: 2MB binary images expand significantly when sent as base64 data URLs inside JSON, exceeding default parser limits.
- Impact: Customer profile photo updates can reach `/api/customer/me` validation and save path reliably; stored photo-size constraints remain enforced in app logic.
- Revisit trigger: When profile photos move to multipart/object storage and base64 JSON payloads are removed.

## [2026-02-20] Focus MVP on rental vendors first
- Context: Event Hub long-term vision includes broader event services.
- Decision: Launch initial MVP specifically for rental vendors.
- Why: Tight scope improves launch speed and reduces complexity.
- Impact: Product language, onboarding, and listing model should optimize for rentals.
- Revisit trigger: 20+ active vendors and repeat booking activity.

## [2026-02-20] Prioritize booking infrastructure over feature breadth
- Context: Major risk is overbuilding and shipping late.
- Decision: Treat booking flow reliability as the highest priority.
- Why: Marketplace value is proven by real bookings, not by broad feature count.
- Impact: Non-essential features may be delayed or removed.
- Revisit trigger: Booking funnel conversion stabilizes and core flow is trusted.

## [2026-02-20] Use practical success metrics, not vanity launch targets
- Context: Perfect UX and large-scale volume targets are not realistic for first launch.
- Decision: Track execution metrics tied to real usage.
- Why: Early validation requires proof vendors can onboard, list, and receive bookings.
- Impact: Success measured by active vendors, live listings, booking requests, and payout activity.
- Revisit trigger: Post-launch data indicates stable repeat behavior.

## [2026-02-20] Keep architecture simple enough for solo execution
- Context: Solo founder with beginner engineering level and short timeline.
- Decision: Prefer straightforward implementations over highly abstract systems.
- Why: Maintainability and shipping speed matter more than perfect design patterns today.
- Impact: Technical debt may exist but should be documented and bounded.
- Revisit trigger: Team growth, scale bottlenecks, or repeated defects in core flows.

## [2026-02-20] Fee model for MVP transactions
- Context: Platform needs revenue logic in booking flow.
- Decision: Apply 8% vendor fee and 5% customer service fee.
- Why: Establish monetization from day one while validating demand.
- Impact: Pricing display and payment calculations must be explicit and accurate.
- Revisit trigger: Vendor conversion drop-off or pricing feedback from first cohort.

## [2026-02-20] Require authenticated customers for booking creation
- Context: Booking creation on listing detail did not reliably link bookings to customer dashboards.
- Decision: Protect `POST /api/bookings` with Auth0 customer auth and persist `customerId` from the authenticated user.
- Why: Pending bookings must appear for both customer and vendor dashboards to validate MVP booking flow.
- Impact: Guests must log in before booking, and booking records are now traceable to a real customer account.
- Revisit trigger: If conversion drops due to forced login, evaluate guest inquiry flow with post-submit account creation.

## [2026-02-20] Add transactional booking emails via Resend with safe fallback
- Context: MVP done criteria requires customer and vendor confirmation emails after booking request creation.
- Decision: Use Resend API (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`) for booking confirmation emails; skip sending with explicit reason when env vars are missing.
- Why: Keeps implementation lightweight and production-ready without blocking local development.
- Impact: Email delivery works when configured, while booking flow remains functional if email provider config is absent.
- Revisit trigger: If deliverability issues or provider cost constraints emerge, switch to alternate provider abstraction.

## [2026-02-20] Auto-provision missing customer row from Auth0 identity
- Context: Customer dashboard rendered a blank state when Auth0-authenticated users had no resolvable local customer context.
- Decision: Resolve customer by Auth0 email for customer routes and create a customer record when missing.
- Why: Booking and dashboard flows must work immediately for authenticated users without manual account seeding.
- Impact: `/api/customer/me`, `/api/customer/bookings`, and booking creation can recover from missing local customer rows.
- Revisit trigger: If unified account linking logic is introduced across vendor/customer roles.

## [2026-02-20] Add Auth0 sub fallback for customer identity resolution
- Context: Some Auth0 access tokens may not contain email, causing customer profile resolution to stall in dashboard flows.
- Decision: Resolve customer by `auth0_sub` when available, and use deterministic synthetic email fallback only when token email is unavailable.
- Why: Keeps customer dashboard and booking flows functional even when Auth0 token claims vary.
- Impact: Reduces dashboard dead-end states and improves reliability of customer route access.
- Revisit trigger: When users table is formally migrated with first-class `auth0_sub` support and enforced account-linking rules.

## [2026-02-20] Support dual auth on customer booking/dashboard routes
- Context: Customer sessions can exist as legacy JWT or Auth0 bearer tokens depending on login path.
- Decision: Add `requireCustomerAnyAuth` middleware that accepts valid customer/admin JWT first, then falls back to Auth0 verification.
- Why: Prevents 401 token mismatch errors and keeps customer flows working during auth transition.
- Impact: `/api/customer/me`, `/api/customer/bookings`, and `/api/bookings` now work with either token type.
- Revisit trigger: After full migration to a single auth system and token format.

## [2026-02-20] Run backend in watch mode during development
- Context: Server code changes were not applying because `dev:server` used non-watch execution.
- Decision: Change `dev:server` to `tsx watch --env-file .env server/index.ts`.
- Why: Prevent stale-route behavior during iterative debugging and prevent false-negative test results.
- Impact: Backend reloads automatically on code edits in local development.
- Revisit trigger: If watch mode causes performance issues or unstable reload behavior.

## [2026-02-20] Add Auth0 fallback inside legacy customer middleware
- Context: Some requests were still traversing JWT middleware paths and returning `Invalid or expired token` for Auth0 tokens.
- Decision: Update `requireCustomerAuth` and `requireDualAuth` to fall back to `requireDualAuthAuth0` when JWT verification fails.
- Why: Prevent auth-format mismatch errors while both token systems are still active.
- Impact: Customer and dual-auth routes become resilient regardless of whether bearer token is JWT or Auth0.
- Revisit trigger: Remove fallback once legacy JWT auth is fully retired.

## [2026-02-20] Persist booking creation in Postgres (not in-memory storage)
- Context: Booking creation used `storage.createBooking`/`storage.getVendorAccountById`, while dashboard reads used direct DB queries.
- Decision: Validate vendor with DB query and insert booking/payment schedule rows directly into Postgres in `POST /api/bookings`.
- Why: Ensure successful bookings appear in customer and vendor dashboards and prevent false `Vendor not found` from in-memory maps.
- Impact: Booking flow now writes durable records used by dashboard APIs.
- Revisit trigger: If storage layer is refactored to a true DB-backed repository implementation.

## [2026-02-20] Add bookings vendor-column compatibility layer
- Context: Runtime error showed `bookings.vendor_account_id` missing in some environments where the table still uses `vendor_id`.
- Decision: Detect vendor reference column on startup (`vendor_account_id` vs `vendor_id`) and branch booking insert/select queries accordingly.
- Why: Fix booking flow immediately without requiring a migration during MVP launch sprint.
- Impact: Bookings can be created and read in customer/vendor dashboards across both schema variants.
- Revisit trigger: Once production schema is normalized to one column name.

## [2026-02-20] Normalize Drizzle execute result shapes
- Context: `db.execute()` can return either `{ rows: [...] }` or a plain array depending on driver/runtime path.
- Decision: Add an `extractRows` helper and use it for booking schema detection, raw select fallbacks, and raw insert returning data.
- Why: Prevent false defaults and empty results that can break booking creation/read flows.
- Impact: Booking APIs are resilient to runtime differences in DB execute response format.
- Revisit trigger: When DB access is consolidated on one query path and response shape.

## [2026-02-20] Align booking ownership to legacy schema via booking_items
- Context: Live Neon `bookings` table has no vendor reference column (`vendor_account_id` or `vendor_id`), but does include `booking_items.listing_id`.
- Decision: Use `listingId` in booking creation, derive vendor through `vendor_listings.account_id`, and insert `booking_items` for each new booking; vendor/customer booking reads fall back to joins through `booking_items`.
- Why: Restores booking flow and dashboard visibility without forcing a risky schema migration during MVP sprint.
- Impact: `Book Now` can persist successfully on current schema and both dashboards can resolve vendor-linked bookings.
- Revisit trigger: When booking schema is normalized and vendor reference is explicitly stored on `bookings`.

## [2026-02-20] Add staged error context to booking creation
- Context: Runtime SQL errors were hard to localize from generic API error messages.
- Decision: Add stage labels in `POST /api/bookings` error responses and prefer Drizzle insert builder for non-legacy vendor column paths.
- Why: Makes production debugging fast and reduces ambiguity about which query failed.
- Impact: Booking error messages now include a stage prefix (e.g., `[insert-booking-item] ...`) for precise troubleshooting.
- Revisit trigger: After booking flow stabilizes and structured server-side logging is in place.

## [2026-02-20] Avoid Drizzle returning() on bookings when schema column is absent
- Context: In environments where `bookings` lacks `vendor_account_id`, `db.insert(bookings).returning()` can still reference that missing column from the TS schema model.
- Decision: In the no-vendor-column path, use raw SQL `insert into bookings (...) returning id` instead of Drizzle table returning.
- Why: Prevent schema-model mismatch from generating invalid SQL against the live table.
- Impact: Booking insert succeeds on legacy bookings schema while preserving follow-up inserts (booking_items/payment_schedules).
- Revisit trigger: When DB schema and TypeScript schema are fully aligned.

## [2026-02-20] Require Stripe payment-method collection before booking creation
- Context: Customers could create bookings without entering card information on listing detail.
- Decision: Add Stripe CardElement to booking card UI and require a Stripe `paymentMethodId` (`pm_...`) in `POST /api/bookings`.
- Why: Align booking flow with payment-first expectation and prevent no-payment booking creation.
- Impact: Booking button stays disabled until card details are complete; backend rejects bookings without Stripe payment method IDs.
- Revisit trigger: Replace CardElement-only collection with full payment/intent confirmation flow.

## [2026-02-20] Store booking amounts in cents and normalize legacy displays
- Context: Existing booking records showed `$3.70` for `$370` due to older dollar-vs-cent mismatch.
- Decision: Send booking amounts as cents from listing detail and normalize legacy non-cent values in customer/vendor booking displays.
- Why: Ensure money consistency in persisted data and correct user-visible amounts during transition.
- Impact: New bookings persist in cents; old mismatched records render correctly without immediate DB migration.
- Revisit trigger: Once historical booking records are backfilled to a single cents format.

## [2026-02-20] Move payment entry to dedicated checkout page
- Context: Card input inside the listing reservation box degraded UX and did not match expected marketplace checkout patterns.
- Decision: Keep listing reservation card minimal (price, date, book button) and route `Book Now` to `/checkout/:listingId`.
- Why: Provide a cleaner funnel with explicit checkout stages and order summary.
- Impact: Payment method, contact details, delivery address (when needed), and booking submission now happen on checkout page.
- Revisit trigger: If conversion data indicates a shorter inline flow performs better.

## [2026-02-20] Remove duplicate Stripe initialization from server entrypoint
- Context: `server/index.ts` had a second Stripe client init pinned to old API version (`2023-10-16`), causing TypeScript incompatibility with current Stripe SDK typings.
- Decision: Remove unused Stripe initialization from `server/index.ts` and keep Stripe setup centralized in `server/stripe.ts`.
- Why: Eliminate version drift and avoid redundant env/key coupling in server bootstrap.
- Impact: `npm run typecheck` passes without `index.ts` Stripe API version errors.
- Revisit trigger: If a shared Stripe client is needed across modules, export a single canonical instance from one file.

## [2026-02-20] Harden checkout against Stripe/env misconfiguration and silent white screens
- Context: `/checkout/:listingId` could render a blank page when Stripe frontend initialization failed or route parsing was brittle.
- Decision: Validate `VITE_STRIPE_PUBLISHABLE_KEY` format (`pk_`), catch Stripe load failures, keep rendering a visible checkout error state, and wrap app render in an active error boundary.
- Why: Avoid silent failures during MVP testing and make configuration issues self-explanatory.
- Impact: Checkout now displays actionable Stripe config errors instead of white-screening, and runtime crashes show fallback UI.
- Revisit trigger: When centralized app-level error tracking and a global crash screen are added.

## [2026-02-20] Load frontend env vars from repo root for Vite
- Context: Checkout showed `Stripe is not configured` even with `VITE_STRIPE_PUBLISHABLE_KEY` set in repo-root `.env`.
- Decision: Set `envDir` in `vite.config.ts` to repo root (`path.resolve(import.meta.dirname)`).
- Why: Vite root is `client/`, so without `envDir` it ignores root `.env` and frontend vars stay undefined.
- Impact: Frontend now reads `VITE_*` keys from the existing root `.env`, including Stripe publishable key.
- Revisit trigger: If env management is moved to `client/.env*` or centralized secrets tooling.

## [2026-02-20] Reuse existing Mapbox LocationPicker for checkout delivery address
- Context: Checkout delivery address was plain text and did not provide address suggestions/autofill.
- Decision: Replace checkout delivery street input with shared `LocationPicker` and auto-populate street/city/state/zip from selected result.
- Why: Keep UX consistent with existing app patterns and avoid introducing a second address-search implementation.
- Impact: Customers now get dropdown suggestions while typing and delivery fields auto-fill on selection.
- Revisit trigger: If checkout requires stricter address validation (e.g., hard requirement to select from dropdown only).

## [2026-02-20] Persist customer checkout delivery address in users.default_location
- Context: Customers wanted delivery address remembered across checkouts without schema migration.
- Decision: Reuse `users.default_location` JSONB; expose it in `GET /api/customer/me` and add `PATCH /api/customer/me` for update from checkout.
- Why: Fast MVP-safe persistence using an existing column and auth route.
- Impact: Checkout now pre-fills delivery address from the customer profile and updates it after successful checkout submission.
- Revisit trigger: If shipping/billing addresses need multi-address support or separate address book records.

## [2026-02-20] Hide Stripe Link in checkout CardElement
- Context: Stripe Link CTA (`Save with Link`) appeared in card input and was not desired for MVP checkout UX.
- Decision: Set `disableLink: true` on Stripe `CardElement` options.
- Why: Keep payment UI focused and reduce extra UX branches while flow is stabilized.
- Impact: Stripe Link prompt is hidden on checkout card input.
- Revisit trigger: If conversion testing later shows Link improves completion rates.

## [2026-02-20] Remove checkout promotion-code section for MVP
- Context: Checkout showed a placeholder promotion-code input that is not implemented and adds distraction.
- Decision: Remove the promotion-code UI block from checkout order summary.
- Why: Keep checkout focused on completing booking/payment with minimal friction.
- Impact: No promo-code input or apply button is shown.
- Revisit trigger: Reintroduce only when discount rules and backend validation are implemented.

## [2026-02-20] Persist checkout address draft across refresh with localStorage
- Context: Delivery address fields were cleared on browser refresh before booking submission.
- Decision: Save checkout delivery address draft (street/city/state/zip + optional selected location label/coords) to localStorage and hydrate on checkout load.
- Why: Prevent data loss during refresh while preserving quick MVP flow.
- Impact: Typed/selected delivery address survives refresh on checkout page.
- Revisit trigger: When checkout state is centralized in authenticated server-side draft records.

## [2026-02-20] Vendor bookings API should use authenticated vendor id, not in-memory storage lookup
- Context: Vendor Bookings page showed no results while customer My Events had bookings.
- Decision: In `GET /api/vendor/bookings`, use `req.vendorAuth.id` directly for DB filtering across vendor-column variants and legacy joins.
- Why: `storage.getVendorAccount` is in-memory and can be empty even when Postgres contains the vendor and bookings.
- Impact: Vendor bookings query now returns persisted booking rows for the authenticated vendor account.
- Revisit trigger: If storage layer is replaced with a fully DB-backed repository and route dependencies are consolidated.

## [2026-02-20] Make checkout listing parsing resilient across listingData variants
- Context: Some checkout pages showed `$0.00` and hid delivery address despite valid listing setup.
- Decision: In checkout listing fetch mapping, support multiple pricing field shapes (`pricing`, `pricingByPropType`, legacy values) and parse boolean-like delivery flags robustly.
- Why: Existing listings can have mixed data shapes from different create/edit flows.
- Impact: Checkout correctly resolves price and delivery-included status for more listings, restoring address block and payable totals.
- Revisit trigger: Once listing schema is strictly normalized and old variants are migrated.

## [2026-02-20] Treat only confirmed bookings as "Upcoming" in vendor calendar
- Context: Vendor Bookings showed pending requests in Upcoming summary/tab, violating accepted-job workflow.
- Decision: Update vendor bookings page logic so Upcoming summary and Upcoming tab include only future bookings with status `confirmed`.
- Why: Preserve workflow rule that requests stay pending until vendor acceptance (and later contract steps where applicable).
- Impact: Pending requests no longer inflate upcoming counts/revenue or appear under Upcoming.
- Revisit trigger: When contract-signed state is added and upcoming eligibility depends on contract status too.

## [2026-02-20] Make Vendor Bookings summary and view mode tab-aware
- Context: Vendor Bookings always showed an "Upcoming" summary card even when Pending/Completed/Cancelled tabs were selected.
- Decision: Make summary labels/metrics dynamic by active tab and add a Calendar/List view toggle that respects the selected tab filter.
- Why: Align page behavior with workflow expectations and improve operational review for non-upcoming states.
- Impact: Summary card now reflects active tab context (e.g., completed count/revenue on Completed tab), and users can switch between filtered calendar and filtered list views.
- Revisit trigger: When richer row data (customer name, listing title, actions) is added to vendor bookings list.

## [2026-02-20] Add vendor Accept/Cancel actions for pending bookings in list view
- Context: Vendor list view showed pending bookings but had no per-booking controls to act on requests.
- Decision: Add `Accept` and `Cancel` buttons on pending booking rows and implement `PATCH /api/vendor/bookings/:id` to update status (`pending -> confirmed/cancelled`) with vendor ownership checks.
- Why: Enable core pending-request workflow before adding contract-aware transitions.
- Impact: Vendors can action pending requests directly from list view; bookings API validates ownership and pending-only transition for this slice.
- Revisit trigger: When contract-required flow is added and status transitions depend on contract state.

## [2026-02-20] Add Completed/Cancel actions for confirmed bookings in Upcoming list
- Context: Vendors needed per-booking controls on Upcoming jobs to mark completion or cancel.
- Decision: In Upcoming list view, add `Completed` and `Cancel` buttons for `confirmed` rows and extend `PATCH /api/vendor/bookings/:id` transitions to allow `confirmed -> completed/cancelled`.
- Why: Support core operational workflow after acceptance without requiring calendar interactions.
- Impact: Upcoming jobs can now be moved to Completed or Cancelled directly from list rows; API enforces valid transition rules.
- Revisit trigger: When contract-signed gating is introduced and completion rules become date- or contract-dependent.

## [2026-02-20] Replace vendor dashboard stats placeholder with DB-backed metrics
- Context: Vendor dashboard cards and recent activity were showing incorrect zeros/static values due to placeholder implementation and in-memory account dependency.
- Decision: Rebuild `GET /api/vendor/stats` to compute totals from Postgres bookings/listing traffic using authenticated vendor id across schema variants and return real `recentBookings`.
- Why: Dashboard must reflect live marketplace activity and not depend on transient in-memory storage.
- Impact: Total bookings, bookings this month, revenue, revenue growth, profile views, profile view growth, and recent activity now derive from persisted data.
- Revisit trigger: When analytics requirements expand to include richer inquiry/message activity and dedicated reporting tables.

## [2026-02-20] Adopt 8% vendor fee + 5% customer fee display for checkout/payments slice
- Context: Payments UX needed to hide fee internals from vendors while enforcing updated fee policy.
- Decision: Set vendor platform fee math to 8% in booking/payment calculations, show a 5% customer service fee on checkout summary, and display net-only values in Vendor Payments.
- Why: Match marketplace fee policy and keep vendor-facing finance view focused on take-home earnings.
- Impact: Vendor payouts are calculated with 8% fee; checkout total visibly includes 5% customer fee; vendor payments page removes platform-fee card/details and shows net metrics/history.
- Revisit trigger: When Stripe PaymentIntents fully charge customer totals (subtotal + customer fee) and fee components are persisted in dedicated columns.

## [2026-02-20] Enforce fee policy server-side and expose admin fee earnings
- Context: Fee totals could drift if frontend-sent amounts were trusted, and admin lacked a clear fee-earnings KPI.
- Decision: Enforce booking amount math on the server from listing base price (`8%` vendor fee + `5%` customer fee), ignore client-submitted totals for persistence math, and include `platformFeeTotal`, `customerFeeTotal`, and `totalFeeEarnings` in admin booking stats.
- Why: Keep fee accounting authoritative in backend logic and make marketplace take-rate visible for operations.
- Impact: Booking records now persist fee-consistent totals/payouts independent of client payloads, checkout and vendor payouts align with policy, and admin dashboard shows fee earnings breakdown + total.
- Revisit trigger: If fee policy becomes tiered by vendor plan/category or if customer/vendor fee components move to dedicated reporting tables.

## [2026-02-20] Vendor payments must align with bookings ownership paths and completion date rules
- Context: Vendor Bookings showed completed jobs while Vendor Payments sometimes showed zero history/earnings, and vendors could mark jobs completed before event date.
- Decision: Add a robust fallback ownership query in `GET /api/vendor/payments` (legacy `booking_items -> vendor_listings` join) when primary vendor-column lookup returns no rows; enforce `confirmed -> completed` transition only when `today > event_date`.
- Why: Keep vendor earnings consistent with visible bookings and prevent premature completion state changes.
- Impact: Completed/confirmed jobs now appear in payments even in mixed-schema data setups, and completion is blocked until after the scheduled event date.
- Revisit trigger: When all environments are migrated to a single canonical vendor reference on bookings and completion can be automated by event-time workflows.

## [2026-02-20] Normalize mixed legacy payout units in vendor payments API
- Context: Some bookings stored payout values in cents while older records used dollar-style values, causing re-multiplication and inflated UI amounts (e.g., `$31,450` instead of `$314.50`).
- Decision: Update vendor payments amount normalization to infer units using gross booking context and treat high integer values as cents.
- Why: Preserve accurate vendor net earnings/history without risky data migration during MVP.
- Impact: Vendor Payments now displays realistic net amounts that align with Bookings card values for mixed legacy data.
- Revisit trigger: Once all historical booking money fields are backfilled to a single canonical cents format.

## [2026-02-20] Net Earned reflects completed jobs only; confirmed remains upcoming payout
- Context: Vendor payout is not considered realized until the event is completed, but confirmed jobs should remain visible as future payout pipeline.
- Decision: In `GET /api/vendor/payments`, compute `totalNetEarned` from `completed` bookings only; keep `upcomingNetPayout` sourced from future `confirmed` bookings.
- Why: Separate realized earnings from expected earnings to match vendor payout lifecycle.
- Impact: Payments cards no longer count confirmed jobs in Net Earned, while Upcoming Net Payout continues to show pending confirmed revenue.
- Revisit trigger: If payout timing changes (e.g., partial pre-event payouts or milestone releases).

## [2026-02-20] Vendor Payments net must always be computed from base listing value at 8%
- Context: Legacy `vendor_payout` values from prior fee policy created mismatches (e.g., `$314.xx`) against current pricing rules.
- Decision: In `GET /api/vendor/payments`, derive base amount from `booking_items.total_price_cents` per booking and compute net as `base - round(base * 0.08)`, with fallback to booking total when item rows are missing.
- Why: Eliminate old 15%-era payout behavior from vendor payment cards/history without requiring immediate data migration.
- Impact: Net Earned, Upcoming Net Payout, and history net amounts align with current fee policy (`8%` vendor, `5%` customer) for current bookings.
- Revisit trigger: When historical booking records are fully backfilled and payout fields are canonicalized.

## [2026-02-20] Auto-correct legacy dollar-in-cents booking item values for vendor payments read path
- Context: Some booking item totals were historically stored as dollar-like values in `_cents` columns, producing `$3.40`-style net amounts.
- Decision: In vendor payments read path, detect implausibly tiny base amounts relative to booking gross and upscale by `100` before applying fee math.
- Why: Prevent underreported payouts without risky immediate data migration.
- Impact: Affected bookings now display expected net amounts (e.g., `$340.40` instead of `$3.40`) in history/cards.
- Revisit trigger: After one-time DB backfill normalizes all booking item money fields to true cents.

## [2026-02-20] Store checkout notes/questions per booking item and expose to vendor booking details
- Context: Customers need booking-specific notes/questions that do not affect listing-level data and vendors need visibility per booking.
- Decision: Add `customerNotes` and `customerQuestions` to checkout booking payload, persist in `booking_items.item_data`, and return them in `GET /api/vendor/bookings`; vendor list rows can expand to show details.
- Why: Keep notes/questions scoped to the individual booking while avoiding risky schema migrations.
- Impact: Customer notes and questions entered at checkout are saved with that booking and visible to vendors from the booking list.
- Revisit trigger: If notes/questions require dedicated relational columns with search/filter/reporting support.

## [2026-02-20] Add checkout event assignment (existing event or new titled event)
- Context: Customers needed to organize bookings under named events during checkout without risky schema migration.
- Decision: Add `GET /api/customer/events` for customer-specific event options, add checkout UI to select existing event or create a new event title, and persist selected event context per booking in `booking_items.item_data.customerEvent`. For new titles, create a lightweight `events` row and link `bookings.event_id`.
- Why: Enable event-level organization immediately while reusing existing tables and preserving MVP delivery speed.
- Impact: Each checkout now captures event context (existing or new), and booking records carry that event assignment for downstream grouping/UI.
- Revisit trigger: When event ownership/title should move to first-class customer-event domain models with strict relational constraints.

## [2026-02-20] Checkout event picker should show event records only and gate new-event creation on title input
- Context: Dropdown UX mistakenly mixed booking-derived pseudo entries and hid explicit new-event controls.
- Decision: Restrict event dropdown to real customer event records and keep `Event name` + `Create New Event` controls visible; disable create action until title input is non-empty.
- Why: Match intended mental model: select an existing event or explicitly create one from a title.
- Impact: Customers no longer see booking-like duplicate entries in event picker; new event creation is explicit and validation-gated.
- Revisit trigger: When My Events gets dedicated event CRUD and event ownership table.

## [2026-02-20] Confirm new-event action inline on checkout and surface event title to vendor booking rows
- Context: Customers needed immediate in-page confirmation after pressing `Create New Event`, and vendors needed event context visible per booking.
- Decision: Show inline confirmation text in checkout after create action and return `customerEventTitle` in vendor bookings API/UI from booking item metadata/event title.
- Why: Reduce ambiguity during checkout and give vendors immediate context for which customer event a booking belongs to.
- Impact: Checkout confirms new-event intent without navigation, and vendor booking list shows event title for linked bookings.
- Revisit trigger: When full event CRUD and assignment management are added to customer My Events.

## [2026-02-20] Group customer My Events by event title and allow per-booking event reassignment
- Context: Customer dashboard showed a flat booking list with no event organization, and users needed to move existing bookings into different events.
- Decision: Enrich `/api/customer/bookings` with booking item/event metadata (`customerEventId`, `customerEventTitle`, `itemTitle`, `displayTitle`), add `PATCH /api/customer/bookings/:id/event` for reassign/create-and-move, and render grouped sections by event title in customer My Events UI.
- Why: Keep event organization customer-centric and editable without schema migration.
- Impact: New events/bookings now appear under event sections; customers can move bookings to existing events or create a new event title and move booking in one action.
- Revisit trigger: When dedicated event ownership/CRUD tables are introduced for stricter consistency guarantees.

## [2026-02-20] Split customer My Events into Upcoming vs Completed event groups with status sections
- Context: My Events still showed mixed lifecycle states and inconsistent booking labels/titles, which made event-level organization hard to manage.
- Decision: Default My Events to `Upcoming Events`, add `Completed Events` toggle, group bookings by event, and section each event by status; harden event move/create controls to prevent empty payload submissions.
- Why: Improve day-to-day booking management clarity without introducing new schema dependencies.
- Impact: Customers can manage upcoming and completed work separately, see listing-title-first booking labels, and reliably create/move events without `customerEventId/customerEventTitle` API errors.
- Revisit trigger: When event CRUD and richer timeline/status workflows are introduced for both customer and vendor portals.

## [2026-02-20] Remove redundant left status headings in customer My Events
- Context: Booking cards already display status badges, so repeated left-side status headers (`PENDING`, `CANCELLED`, etc.) created visual noise.
- Decision: Keep status ordering internally but remove section heading labels; increase event title typography for stronger event-group hierarchy.
- Why: Improve scanability and reduce duplication without changing booking-state behavior.
- Impact: Customer My Events is cleaner while preserving per-booking status visibility on each card.
- Revisit trigger: If customers need explicit collapsed-by-status groups rather than flat ordered cards.

## [2026-02-20] Gate customer reviews to completed bookings and persist per-booking linkage
- Context: Customers needed to leave reviews from completed events, tied to the booked listing, with duplicate prevention per booking.
- Decision: Add `POST /api/customer/bookings/:id/review` (completed-only), insert review rows into `listing_reviews`, and store booking-linked review metadata in `booking_items.item_data.review`; expose review status in `/api/customer/bookings` and published listing reviews in `/api/listings/public/:id`.
- Why: Deliver review UX quickly using existing tables while preserving booking-level idempotency without risky schema migration.
- Impact: Completed booking cards now support star-first + written review submission, submitted cards collapse to a condensed confirmation, and new reviews appear on listing detail pages.
- Revisit trigger: When review moderation, edit/delete workflows, or explicit `booking_id` column support is introduced in `listing_reviews`.

## [2026-02-21] Make customer review submission booking-item atomic and concurrency-safe
- Context: Review linkage depends on `booking_items.item_data.review` (no `booking_id` on `listing_reviews`), so concurrent submits could create duplicate review rows if writes were not atomic.
- Decision: Wrap `POST /api/customer/bookings/:id/review` write path in a DB transaction, lock the target booking item row (`FOR UPDATE OF bi`), reject if any prior review metadata exists, insert `listing_reviews` with generated id, and update only the locked booking item with review linkage metadata (`reviewId`, `bookingId`, `listingId`).
- Why: Preserve MVP booking-flow reliability and prevent duplicate-per-booking reviews without adding risky schema changes.
- Impact: One successful review submit per completed booking item; duplicate/race submits return `409` and listing review data stays tied to the same booking context.
- Revisit trigger: When `listing_reviews` gets first-class booking linkage (`booking_id`) or multi-item booking review UX is expanded.

## [2026-02-21] Separate listing-detail tags from "What's Included" content
- Context: Listing detail rendered `tagsByPropType.__listing__` under "What’s Included", which conflated search/filter tags with actual included-items content.
- Decision: Keep the "What’s Included" section but map it only from explicit inclusion-style fields when present (`whatsIncluded`, `whatIsIncluded`, `included`, `includedItems`, `inclusions`), and add a dedicated "Tags" section below Reviews for listing tags.
- Why: Preserve scope discipline and UI clarity without schema changes while matching customer-facing terminology.
- Impact: Tags now display in their own section below Reviews, and "What’s Included" remains available for future dedicated input data.
- Revisit trigger: When vendor create/edit flows add a first-class structured "What’s Included" field.

## [2026-02-21] Add structured "What’s Included" bullets to listing creation
- Context: Vendors could only describe included items in free-text description, while listing detail now has a dedicated "What’s Included" section.
- Decision: Add a "What’s Included" bullet-entry input in Create Listing (Title & Description step) that persists to `listingData.whatsIncluded`, with add/remove controls and normalization rules (capitalize first character, remove ending periods, dedupe).
- Why: Improve listing clarity and capture inclusion details in structured form without schema migration.
- Impact: Vendors can add explicit inclusion bullets during listing creation, and listing detail can render those bullets directly.
- Revisit trigger: When listing edit flow gets full parity UI for maintaining `whatsIncluded` bullets.

## [2026-02-21] Centralize and expand event-type options with Popular For select-all controls
- Context: Popular-for options were inconsistent between create/edit listing flows and broader event-type selectors, and there was no fast way to select all relevant event types.
- Decision: Create a shared event-types constants module, expand options (including reunion/concert/elopement/proposal/bachelor-bachelorette/anniversary/gender reveal/quinceañera/baptism/funeral/conference/training/fundraiser/nonprofit/farmers market/sporting/school dance), dedupe `Reunion`, and add `Select all`/`Deselect all` controls in both listing Popular For selection UIs.
- Why: Keep scope disciplined while improving vendor setup speed and consistency across selection surfaces without schema or API changes.
- Impact: Create Listing, Vendor Listing Edit, Hero event-type selector, and Event Planner event-type selector now use a single option source; `listingData.popularFor` persistence remains unchanged and Neon writes continue through existing autosave/PATCH paths.
- Revisit trigger: When non-rental vendor-type onboarding requires segmented event taxonomies per vendor category.

## [2026-02-21] Trim unsupported event-type options from shared selection lists
- Context: Some newly added event-type options were not desired for the current launch slice.
- Decision: Remove `Training`, `Nonprofit`, `Elopement`, `Fundraiser`, and `Farmers Market` from shared `POPULAR_FOR_OPTIONS` and `EVENT_TYPE_OPTIONS`.
- Why: Keep option lists aligned with current product direction while preserving one-source consistency across create/edit/search/planner flows.
- Impact: These five options no longer appear in listing Popular For selectors or general event-type dropdowns, and persisted `popularFor` storage behavior remains unchanged.
- Revisit trigger: Re-add specific options when demand or category expansion priorities require them.

## [2026-02-21] Remove Create Listing rental-type step while preserving legacy rental-type data compatibility
- Context: Create Listing wizard needed a simpler MVP flow without a dedicated rental-type step, while older listings still store rental selections under legacy `propTypes`.
- Decision: Remove the Rental Types step from `CreateListingWizard` navigation/flow, start at `Title & Description`, and keep `rentalTypes` as the primary field in create/edit UIs. Persist both `rentalTypes` and legacy `propTypes` on save/autosave, and add read fallbacks (`rentalTypes -> propTypes`) in listing surfaces.
- Why: Reduce setup friction and keep launch flow moving, without risky DB/schema migration or breaking older listing payloads.
- Impact: Wizard flow is now `Title/Description -> Popular For -> Pricing -> Photos -> Delivery/Setup`; existing listings with legacy `propTypes` continue loading/editing/price parsing correctly; Neon persistence remains via existing PATCH/autosave paths.
- Revisit trigger: When a formal data backfill/migration removes legacy `propTypes` from listing JSON payloads.

## [2026-02-22] Remove Rental Types editing controls from vendor listing edit screen
- Context: Vendor listing edit (`/vendor/listings/:id`) still exposed Rental Types selection and treated rental-type selection as a publish gate, even after create flow removed that step.
- Decision: Remove Rental Types UI controls/copy from `VendorListingEdit`, keep existing rental-type payload compatibility (read `rentalTypes` with legacy `propTypes` fallback, save both `rentalTypes` and `propTypes`), and drop rental-type requirement from edit-screen `canPublish`.
- Why: Align edit flow with simplified MVP listing flow while avoiding schema risk and preserving backward compatibility for older listings.
- Impact: Edit page no longer shows Rental Types selection; publish gating on edit no longer blocks on rental-type selection; legacy listings remain readable and save through existing PATCH/Neon path.
- Revisit trigger: When listing data is fully migrated to canonical `rentalTypes` and legacy `propTypes` write-through can be removed.

## [2026-02-22] Add What’s Included bullet editor to vendor listing edit title/description section
- Context: Create Listing already supports structured `whatsIncluded` bullets, but Vendor Listing Edit lacked parity, preventing vendors from maintaining that content post-create.
- Decision: Add a `What’s Included` editor under `Title & Description` in `VendorListingEdit` with add/remove controls and normalization rules (capitalize first letter, remove trailing period, dedupe), while persisting to existing `listingData.whatsIncluded` via current PATCH flow.
- Why: Keep listing edit/create behavior aligned for MVP reliability without schema changes.
- Impact: Vendors can now add/update/remove inclusion bullets on edit, existing `whatsIncluded` values load in-place, and saves continue through current Neon PATCH path.
- Revisit trigger: When listing edit/create forms are consolidated into a shared schema-driven form model.

## [2026-02-22] Sanitize destructive toast copy into customer-friendly language
- Context: Error toasts across the app surfaced technical details (HTTP status codes, API route text, stack-like messages) that are confusing for customers.
- Decision: Add centralized destructive-toast sanitization in `use-toast` so error titles/descriptions are rewritten into plain-language messages and status-code/API noise is removed before rendering.
- Why: Keep customer-facing messaging understandable while avoiding broad per-screen toast rewrites.
- Impact: Red toast popups now avoid raw status codes and technical jargon; common failure messages are normalized to simple, actionable language.
- Revisit trigger: When product defines a full message catalog and per-domain localized error copy.

## [2026-02-23] Standardize cover-photo orientation metadata across create/edit and listing surfaces
- Context: Listing photos were managed in square-first UI blocks, and cover orientation choices were not consistently editable/saved/rendered across vendor and customer surfaces.
- Decision: Introduce shared listing photo helpers (`coverPhotoRatio`, `coverPhotoIndex`, `coverPhotoName` handling), upgrade Create Listing and Vendor Listing Edit photo management to include a modal with preset cover ratios + set-cover + reorder/remove controls, and render listing cards/detail hero using the saved cover ratio.
- Why: Deliver cleaner vendor photo control with minimal schema risk by reusing existing `listingData.photos` JSON shape and current PATCH/autosave flows.
- Impact: Cover orientation now persists and renders consistently on vendor listings, edit page photo preview, landing cards, and browse cards; no-photo fallback remains unchanged and clean.
- Revisit trigger: When a dedicated image-crop pipeline (stored crop coordinates) is added beyond ratio/index metadata.

## [2026-02-23] Move listing photo management inline with drag reorder and per-photo crop editing
- Context: Vendors wanted photo editing controls visible directly on create/edit pages instead of a modal popup, with cover-first behavior and quick reordering.
- Decision: Replace popup photo editor UI with an inline shared editor component using `@dnd-kit` for drag reorder and `react-easy-crop` for non-cover crop controls; define cover as the first photo in order and persist cover ratio plus optional `cropsByName` metadata inside existing `listingData.photos`.
- Why: Improve editing clarity and speed while keeping API/schema unchanged and preserving current PATCH/autosave persistence paths to Neon.
- Impact: Create Listing and Edit Listing now support on-page add/remove/drag-reorder workflow, first-photo cover behavior, cover-ratio controls on selected cover, and per-photo crop state capture for gallery photos.
- Revisit trigger: When crop metadata should be fully applied/rendered across all customer-facing gallery surfaces or backed by server-side image derivatives.

## [2026-02-23] Replace horizontal photo strip with grid collage and corner-resizable non-cover crop box
- Context: Inline photo editor still showed long filename labels, used a sideways photo strip, and lacked direct corner-drag orientation resizing for non-cover photos.
- Decision: Remove filename text from photo tiles, switch `All photos` to a larger responsive grid collage below the selected image, and enable non-cover crop-box resizing via draggable corner (`resize: both`) while preserving drag-reorder and cover-first rules.
- Why: Improve visual cleanliness and editing ergonomics without adding schema or API complexity.
- Impact: Create Listing and Edit Listing photo sections now feel cleaner, avoid horizontal scrolling, and support direct corner-resize orientation control for gallery-photo crop boxes.
- Revisit trigger: When true saved crop-rectangle rendering needs to be applied end-to-end to customer gallery outputs.

## [2026-02-23] Refine inline photo controls for larger non-cover editing and lighter tile actions
- Context: Vendors reported non-cover crop area felt too small, corner resizing was unreliable in practice, zoom slider added clutter, and remove actions were visually heavy.
- Decision: Increase default non-cover crop viewport size, use explicit corner-drag handle logic for resizing, remove the zoom slider UI, keep gallery tile sizing stable, and replace tile remove labels with a small top-right `X` control.
- Why: Make the photo editing experience feel cleaner and more direct while preserving current behavior and persistence model.
- Impact: Non-cover editing area is larger and easier to orient, resize interaction is clearer, photo tiles remain visually stable, and remove actions are less intrusive.
- Revisit trigger: If we add a dedicated visual editor with guided handles and explicit crop frame dimensions.

## [2026-02-23] Move non-cover orientation drag control from crop viewport to photo-grid corner
- Context: Vendors expected orientation drag to live on the photo-grid area, not inside the selected crop viewport, and wanted orientation changes without resizing the selected image area.
- Decision: Anchor the orientation drag handle to the bottom-right of the `All photos` grid and map drag deltas to aspect-ratio updates only, while keeping selected crop viewport dimensions fixed.
- Why: Match expected interaction model and avoid unintended "image box grows/shrinks" behavior.
- Impact: Non-cover orientation can be adjusted from grid corner drag, and selected crop viewport size stays consistent while orientation changes.
- Revisit trigger: If we replace manual drag with dedicated orientation controls or a richer crop UI toolkit.

## [2026-02-23] Auto-save non-cover crop edits and remove explicit Save button
- Context: Vendors requested that the latest crop/orientation edits be what persists without an extra save click in the photo editor.
- Decision: Remove the `Save crop` action and auto-persist non-cover crop edits (debounced) whenever crop/zoom/aspect changes differ from stored values.
- Why: Reduce friction and make photo editing behavior match a "last edit wins" workflow.
- Impact: Crop edits now save automatically in both Create Listing and Edit Listing photo flows; explicit crop save button is no longer shown.
- Revisit trigger: If autosave proves too chatty for performance and needs stronger interaction-end batching.

## [2026-02-23] Enable draggable cover-photo crop positioning in inline photo editor
- Context: Cover-photo editing allowed ratio selection but did not allow direct drag positioning inside the crop frame.
- Decision: Switch cover-photo preview area to the same draggable crop canvas behavior as gallery photos, lock aspect to selected cover ratio, and include the same auto-save/reset behavior for cover crop state.
- Why: Give vendors direct control over subject positioning in the cover frame without schema or API changes.
- Impact: Cover photos can now be dragged/repositioned inside the selected orientation box in both Create Listing and Edit Listing flows; latest cover crop edits auto-save.
- Revisit trigger: When crop metadata is fully applied to generated image derivatives across all customer-facing surfaces.

## [2026-02-23] Place non-cover orientation drag handle in selected crop area
- Context: Orientation drag handle positioned under the photo grid created confusion and did not match expected control placement.
- Decision: Move non-cover orientation drag handle back into the bottom-right of the selected crop area and remove the grid-level handle.
- Why: Keep orientation controls directly attached to the active crop context.
- Impact: Vendors adjust orientation from the selected photo area itself; grid area remains focused on ordering/selection.
- Revisit trigger: If future UX consolidates orientation controls into a separate fixed control bar.

## [2026-02-23] Make edit-listing header actions status-aware and return to listings after save
- Context: Edit Listing header always showed Publish, and Save did not return users to Listings as expected by the vendor workflow.
- Decision: In `VendorListingEdit`, show `Publish` only for `draft` and `inactive` statuses (hide for `active`), and navigate to `/vendor/listings` after successful `Save changes`.
- Why: Match status-specific action expectations and keep vendor edit flow efficient.
- Impact: Active listings now show `Save changes` + `Back to listings` only; Draft/Inactive show `Save changes` + `Publish` + `Back to listings`; save always returns user to the listings page.
- Revisit trigger: If edit page introduces unsaved-change guards or configurable post-save navigation behavior.

## [2026-02-23] Stabilize vendor listing-card action row layout to prevent clipped buttons
- Context: On `/vendor/listings`, card action buttons (especially `Delete`) could clip at narrower in-row widths and near the right edge of horizontal rails.
- Decision: Keep cover photo rendering unchanged, but switch card action row to a 3-column grid with `w-full/min-w-0` buttons and add trailing rail padding on the horizontal list container.
- Why: Ensure predictable button widths and consistent side margins without touching business logic or API behavior.
- Impact: Draft/Inactive/Active listing cards now keep all actions fully visible with cleaner horizontal spacing; right-edge clipping is reduced on common desktop widths.
- Revisit trigger: If vendor listings move from horizontal rails to a wrapped grid layout across breakpoints.

## [2026-02-23] Move listing-card Edit action to top-right chip and keep bottom row as publish/unpublish vs delete
- Context: Vendors requested `Edit` to be less button-heavy and placed in the top-right of each listing card, with bottom actions focused on status/destructive actions.
- Decision: In `/vendor/listings` cards, move `Edit` to a subtle top-right chip-style action in the card header, remove `Edit` from the bottom action row, and keep bottom row as `Publish/Unpublish` (left) and `Delete` (right).
- Why: Reduce visual clutter and align action hierarchy while preserving quick edit access.
- Impact: Cards now have clearer action grouping and avoid crowded three-button bottom rows; publish/unpublish appears opposite delete consistently across statuses.
- Revisit trigger: If card interaction shifts to context menus or if edit is moved to card-click-only behavior.

## [2026-02-23] Make listing-detail non-cover collage dimension-driven to reduce visible cutoffs
- Context: On `/listing/:id`, non-cover tiles in the top photo collage could show harsh head/body cutoffs due to fixed crop-box behavior.
- Decision: Keep cover-photo-first layout and existing `Show all photos` behavior, but change non-cover collage rendering to use intrinsic image dimensions (`h-auto` + `object-contain`) and masonry-style arrangement for 5+ layouts.
- Why: Improve perceived photo quality quickly with CSS/layout-only adjustments and no API/schema/data-shape changes.
- Impact: Non-cover photos render with cleaner framing and reduced truncation artifacts while preserving the same overall hero collage structure.
- Revisit trigger: If we later apply saved crop metadata consistently across customer-facing gallery/detail surfaces.

## [2026-02-23] Align listing-detail photo UI with Airbnb-style hero collage and full-screen all-photos view
- Context: Listing detail needed a cleaner, familiar photo presentation: large cover image on the left with stacked non-cover images on the right, plus a full-screen collage when users click `Show all photos`.
- Decision: Update `/listing/:id` hero collage to use a desktop split layout (`2fr / 1fr`) with cover photo left and either 2 or 4 non-cover tiles right, and replace the small modal with a full-screen gallery overlay showing all photos in a responsive collage.
- Why: Improve visual quality and browsing clarity with a recognized pattern while keeping existing data/API behavior unchanged.
- Impact: Hero collage now matches expected marketplace layout, and `Show all photos` opens a full-screen gallery experience instead of a small centered modal.
- Revisit trigger: If we add slideshow/lightbox navigation or need crop-aware rendering from stored per-photo crop metadata.

## [2026-02-23] Render listing-detail photos with vendor-saved crop framing metadata
- Context: Important parts of faces/subjects were still being cut off on listing detail even after hero layout updates, despite vendors setting crop orientation during create/edit.
- Decision: In `/listing/:id`, read existing `listingData.photos.cropsByName` (no API/schema changes), map crop metadata by photo URL, and apply saved crop center as `object-position` in hero tiles and full-screen gallery; also apply saved crop aspect ratio in full-screen collage tiles when present.
- Why: Preserve vendor-selected framing across customer-facing listing detail surfaces while keeping current object-cover tile layout and existing data flow.
- Impact: Hero cover/non-cover photos and `Show all photos` now honor vendor crop choices more closely, reducing visible subject cutoffs.
- Revisit trigger: If we move to server-generated cropped derivatives or need pixel-perfect parity with editor crop output.

## [2026-02-24] Use Stream booking-scoped channels for MVP 1:1 vendor-customer messaging with retention and moderation hooks
- Context: MVP requires reliable in-app vendor-customer messaging tied to booking/request records after payment info collection, with 30-day post-event retention and flagged-account visibility for moderation.
- Decision: Implement Stream Chat integration with deterministic one-channel-per-booking IDs, enforce booking ownership + payment-method presence at server bootstrap endpoints, apply retention expiry (event date + 30 days) with expired-channel deletion attempts, add client-side profanity/toxicity masking before send plus server-side moderation flag logging, and expose flagged accounts in admin stats.
- Why: Delivers launch-speed real-time messaging using hosted Stream UI while keeping booking reliability, scope discipline, and moderation visibility without broad schema rewrites.
- Impact: Customer and vendor message pages now use Stream hosted components for real-time text/file messaging, vendor messaging route is re-enabled, chat is blocked outside booking scope, expired chats return deterministic expiry behavior, and admin dashboard shows flagged chat accounts.
- Revisit trigger: When mobile app launch requires shared chat abstractions, when stronger server-side moderation/webhook enforcement is needed, or when automated retention cleanup scheduling is required beyond access-time expiration handling.

## [2026-02-24] Restrict chat conversation lists to payment-info-collected bookings and surface Stream unread indicators in sidebars
- Context: Message sidebars were showing bookings without collected payment information and did not provide unread indicators, so recipients could miss inbound messages.
- Decision: Filter customer/vendor conversation API payloads to bookings that include payment method metadata, augment conversation payloads with per-booking unread counts from Stream read state, add unread-count endpoints for customer/vendor sidebars, and render unread badges/highlight on message list rows plus sidebar message tabs.
- Why: Align chat visibility with MVP gating rules and provide a minimal reliable “notification” signal without introducing separate notification infrastructure.
- Impact: Customer and vendor message pages now only show eligible paid bookings, unread chats are visually highlighted in the conversation list, and message tabs on both dashboards show unread counts.
- Revisit trigger: If product introduces multi-channel notifications (email/push/in-app notifications center) or changes chat eligibility rules beyond payment-info gating.

## [2026-02-24] Use customer event-first chat navigation with vendor drill-down inside selected event
- Context: Customers needed a clearer mental model for multi-booking messaging by event, with the ability to enter one event, see vendors tied to it, and go back out to all events.
- Decision: Add event metadata to chat conversation payloads and implement customer-only sidebar drill-down flow in chat UI: default `Events` list, click event to view vendor conversations for that event, and explicit `Back to events` action.
- Why: Reduces conversation clutter and aligns messaging with event-planning workflow while preserving existing booking-scoped 1:1 vendor channels.
- Impact: Customer message navigation now starts at event level, vendor conversations are scoped to selected event, and users can return to global event list without route changes.
- Revisit trigger: If messaging expands to true event-level shared channels or requires dedicated event-chat routes/state persistence.

## [2026-02-24] Override Stream edit-message action styling with scoped Event Hub CSS
- Context: In edit mode, `Cancel` and `Send` actions rendered too close together and `Send` appeared in all caps, reducing clarity in the vendor message composer.
- Decision: Add targeted `.eventhub-stream-chat` CSS overrides for `.str-chat__edit-message-form-options`, `.str-chat__edit-message-cancel`, and `.str-chat__edit-message-send` to enforce spacing and preserve title case labels.
- Why: Resolve the UX issue quickly without forking Stream components or adding custom message-input code paths.
- Impact: Edit mode actions now have clear separation and consistent casing while retaining hosted Stream behavior.
- Revisit trigger: If we replace hosted edit UI with fully custom message-input components.

## [2026-02-24] Use popup-first Auth0 login with redirect fallback for faster return sign-in
- Context: Users should be able to sign in again quickly without re-entering passwords when an Auth0 SSO session is still active, while still supporting browsers that block popups.
- Decision: Add a shared `loginWithPopupFirst` helper and use it in primary login entry points (`AuthModal`, listing booking login gate, and checkout login gate), falling back to `loginWithRedirect` only when popup open is blocked.
- Why: Preserves Auth0 Universal Login security model while reducing login friction for returning users and keeping behavior reliable across browser popup policies.
- Impact: Login attempts now use popup-first SSO checks for fast/no-password re-auth where possible, with automatic redirect fallback when popup cannot be opened.
- Revisit trigger: If we consolidate all auth entry points behind route guards or move to a different session/token strategy.

## [2026-02-24] Align vendor logged-in navigation with dual-role access and hide redundant vendor CTA
- Context: Vendor-authenticated users still saw `Become a Vendor` in the footer and lacked a direct `My Events` path in top navigation despite needing customer-side event management access.
- Decision: Add vendor-role `My Events` navigation actions (top bar + dropdown) pointing to customer dashboard events routes, and conditionally hide footer `Become a Vendor` when the authenticated account resolves as a vendor.
- Why: Removes contradictory UI for existing vendors and supports intended dual-role workflow without introducing new routes or auth model changes.
- Impact: Vendor users now see both `Vendor Dashboard` and `My Events` access, and no longer see `Become a Vendor` in footer while logged in as vendor.
- Revisit trigger: If account roles are split into separate personas with explicit role switching or dedicated customer/vendor shells.

## [2026-02-24] Hide browse-sidebar shortcut and curated match planner entry points for current release
- Context: Current launch scope requires reducing optional discovery/planner UX and focusing customers on direct browsing flow.
- Decision: Remove `Browse Vendors` from the customer dashboard sidebar, remove `Help me find the best matches` card/content from `Plan New Event`, and hide the footer `Event Planner` link.
- Why: Keeps the release focused and prevents users entering a deferred planner experience before it is ready for launch.
- Impact: Customer dashboard now presents a simpler planning surface centered on browsing vendors; planner/recommendation flow is no longer discoverable from primary dashboard/footer navigation.
- Revisit trigger: When next release re-enables curated matching and event-planner onboarding flow.

## [2026-02-24] Standardize top-nav hover affordances for primary account action buttons
- Context: In top navigation, `Vendor Dashboard` used text-link underline hover while `Back to Marketplace` used a faint boxed hover, creating inconsistent interaction cues.
- Decision: Render `Vendor Dashboard` as the same `ghost` button style used by `Back to Marketplace`/`My Events`, with shared sizing/rounding classes across vendor and customer account action buttons.
- Why: Keep hover behavior visually consistent across roles/pages and improve perceived UI quality without changing route structure.
- Impact: Top-nav account action buttons now show the same subtle boxed hover treatment for vendor and customer flows.
- Revisit trigger: If navigation is redesigned into a unified command bar or action menu pattern.

## [2026-02-24] Remove calendar icon from top-nav My Events actions while preserving hover style
- Context: `My Events` top-nav actions showed a calendar icon that was not desired, while the hover/button treatment introduced for nav consistency should remain unchanged.
- Decision: Remove only the calendar icon nodes from vendor and customer `My Events` top-nav buttons in shared navigation, keeping existing ghost button style classes.
- Why: Match requested simpler label presentation without reintroducing inconsistent hover affordances.
- Impact: `My Events` now renders as text-only action for both vendor and customer flows, with the same boxed hover behavior retained.
- Revisit trigger: If iconography standards for top-nav actions are redefined in a future design pass.

## [2026-02-24] Implement client-side browse filters with URL query persistence for MVP listing discovery
- Context: View-all listings page needed practical filtering without backend changes, plus refresh-safe state persistence.
- Decision: Implement filtering entirely in `BrowseVendors` using in-memory listing data + query-param sync for `q`, `sort`, `location`, `minPrice`, `maxPrice`, `delivery`, `setup`, `tags`, `availabilityDate`, and `bestFor`; retain compatibility with existing hero params (`lat`, `lng`, `sr`, legacy `eventType/date` reads).
- Why: Delivers fast MVP filtering scope while avoiding API/schema risk and preserving shareable/refresh-stable filter URLs.
- Impact: Users can filter by title search, price range, location, delivery/setup toggles, tags, availability date, and best-for event types; results count updates live and clear-all resets both UI and URL.
- Revisit trigger: When server-backed indexed filtering/faceting is required for scale or when availability logic needs real booking-calendar conflict checks.

## [2026-02-24] Remove number spinner controls from browse price-range inputs
- Context: Price range inputs on the browse filter panel showed browser stepper arrows that clashed with the desired UI.
- Decision: Keep numeric input behavior but apply appearance overrides on min/max fields to hide native spinner controls.
- Why: Maintain clean MVP filter UI while preserving keyboard/manual numeric entry.
- Impact: `Min` and `Max` price fields now appear as plain text-style numeric inputs without up/down arrows.
- Revisit trigger: If we replace price fields with a dedicated range slider or custom numeric input component.

## [2026-02-24] Enforce backend publish price gate and auto-demote active listings missing valid price
- Context: At least one active listing was visible publicly without a valid price, meaning frontend-only publish checks were insufficient.
- Decision: Add server-side listing-price validation in publish endpoint (`/api/vendor/listings/:id/publish`) and require a positive numeric price; also reconcile active listings on vendor/public listing reads by setting any active listing without valid price to `inactive`.
- Why: Make price requirement authoritative at the backend and immediately clean up previously-published invalid listings.
- Impact: Publish API now rejects price-less listings with `missing.price`; existing active listings without valid price are automatically moved to `inactive`, so they no longer appear on public browse.
- Revisit trigger: When moving from request-time reconciliation to scheduled/background data quality jobs and stricter schema-level constraints.

## [2026-02-24] Run listing-price reconciliation once during server startup
- Context: Read-time reconciliation fixed invalid listing states eventually, but data cleanup should happen immediately after deployment without waiting for a specific endpoint hit.
- Decision: Execute `deactivateActiveListingsWithoutValidPrice()` once during route registration startup, with warning-only failure handling.
- Why: Ensures legacy active listings without valid prices are transitioned to `inactive` as soon as backend boots.
- Impact: Public browse and vendor dashboards start from a corrected active-listing set immediately after restart, while existing read-time safeguards remain in place.
- Revisit trigger: Replace startup/read-time cleanup with a scheduled/background reconciliation job and stronger DB-level constraints.

## [2026-02-24] Align public listing price rendering with backend price-validity shapes
- Context: A listing could appear on browse with a dash price (`—`) while backend still considered it valid due alternate pricing shapes (e.g., per-type pricing fields), and React Query stale cache could preserve outdated browse results.
- Decision: Add shared frontend price resolver (`getListingDisplayPrice`) that reads all supported listing price shapes, filter browse results to priced listings only, force `/api/listings/public` query refetch on mount, and add a backend `/api/listings/public` guard to return only price-valid listings.
- Why: Keep user-visible price behavior consistent with backend publish gating and prevent stale no-price cards from lingering in the UI.
- Impact: Browse cards now display a price whenever backend accepts one; listings with no valid price are excluded from public results both server-side and client-side.
- Revisit trigger: When listing pricing schema is fully normalized and a single canonical price field is enforced at the DB level.

## [2026-02-24] Introduce Pinterest-style public listing cards with hover actions and share modal
- Context: Public listing cards needed a more modern visual style with stronger hover affordances and built-in share options while keeping card click-to-detail behavior.
- Decision: Redesign shared `ListingCard` with rounded media-first card treatment, darker hover overlay, hover-only `View Listing` action, floating title/price caption panel, and a share modal supporting `Copy link`, `Messages`, `Email`, and `Messenger`.
- Why: Improves listing browse polish and action clarity for MVP without backend/API changes or routing changes.
- Impact: Home and Browse listing grids now use richer card interactions; both card click and `View Listing` button navigate to listing detail; share action opens a modal and provides quick share paths.
- Revisit trigger: If mobile-first behavior requires always-visible action buttons or if native social share integrations replace URI/deeplink-based actions.

## [2026-02-24] Flatten listing card caption styling to non-overlapping Pinterest-like text row
- Context: Floating caption chip under cards introduced overlap, gray-box styling, and shadow that did not match the intended cleaner Pinterest reference.
- Decision: Remove card/media shadows and replace overlapping caption chip with a plain title/price row directly beneath the listing image.
- Why: Match requested visual direction while keeping existing hover actions and click-through behavior.
- Impact: Listing cards now present image-first tiles with simple text metadata below, improving visual consistency with the provided reference style.
- Revisit trigger: If card metadata density needs to increase (ratings, vendor name, badges) and requires a structured caption container again.

## [2026-02-24] Standardize app typography to David Libre for first-party web UI
- Context: Product direction required a single, consistent typeface across EventHub’s first-party web interface without changing existing spacing/weight scale decisions.
- Decision: Set global font tokens (`--font-sans`, `--font-heading`) to `David Libre`, remap Tailwind `font-serif` to the same token, and replace the broad Google Fonts include with `David Libre` only.
- Why: Ensure consistent typography across existing `font-sans` and `font-serif` usage while minimizing payload and avoiding per-component rewrites.
- Impact: Customer, vendor, and admin first-party text now renders in `David Libre` with serif fallback on all pages; type scale and weight classes remain unchanged.
- Revisit trigger: If brand guidelines introduce a multi-font system (e.g., separate display/body fonts) after MVP launch.

## [2026-02-24] Replace icon-based brand mark with Damion Event Hub wordmark
- Context: Branded header/footer/auth/sidebar logo spots still used the old calendar/sparkle icon mark, while the requested visual identity is a script wordmark.
- Decision: Create shared `BrandWordmark` (`Event Hub` in `Damion`, themed turquoise via `text-primary`), load `Damion` globally, and replace icon-logo usages in navigation, footer, auth modal, login page, and vendor sidebar.
- Why: Enforces consistent brand identity across customer, vendor, and auth surfaces with one reusable component.
- Impact: Old icon logo is no longer rendered in first-party brand positions; all branded UI areas now show the Damion `Event Hub` wordmark in theme color.
- Revisit trigger: If brand guidelines introduce lockups that require a symbol + wordmark combination again.

## [2026-02-24] Standardize app typography to Tienne for first-party web UI
- Context: Typography was previously standardized to `David Libre`, but product direction changed to use `Tienne` consistently across first-party web surfaces.
- Decision: Replace `David Libre` with `Tienne` in global font tokens (`--font-sans`, `--font-heading`), Google Fonts import, and runtime fallback UI font-family declarations.
- Why: Apply the new brand typography direction quickly while preserving existing type scale, weight utilities, and fallback structure.
- Impact: Customer, vendor, and admin first-party text now renders in `Tienne` with existing serif fallback and no layout/system-level typography rewrites.
- Revisit trigger: If post-launch brand guidelines require separate heading/body font families or a self-hosted font pipeline.

## [2026-02-24] Increase listing card title and price baseline font sizes while preserving responsive scaling
- Context: Listing metadata under cards needed to read larger at default viewport sizes without losing the existing responsive behavior.
- Decision: Increase only the `clamp(...)` size values for listing title and price text in shared `ListingCard`, keeping clamp-based viewport scaling intact.
- Why: Improves legibility for core browse content with a minimal, low-risk UI-only tweak.
- Impact: Title and price text beneath listing cards render larger by default on home/browse surfaces, while still scaling with screen size as before.
- Revisit trigger: If listing-card metadata density changes (e.g., adding ratings/vendor name) and requires typography rebalancing.

## [2026-02-24] Slightly increase listing card metadata font clamps after initial size bump
- Context: After the first increase, listing title and price text still needed to be a bit larger for readability.
- Decision: Raise the same title/price `clamp(...)` values by a small additional amount, preserving the existing responsive scaling strategy.
- Why: Fine-tunes legibility while keeping the prior responsive behavior and avoiding broader card/layout changes.
- Impact: Listing title and price under cards are modestly larger than the previous revision across viewport sizes.
- Revisit trigger: If card text crowds on smaller devices or metadata density increases.
