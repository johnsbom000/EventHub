# Event Hub Decisions Log

Last updated: March 30, 2026

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

## [2026-03-30] Force favicon refresh with versioned icon URL
- Context: Browser tabs were still showing the old Replit-style icon even after replacing `client/public/favicon.png`, due to favicon caching.
- Decision: Append a version query string to the favicon link in `client/index.html` (`/favicon.png?v=2`) so browsers request the updated icon.
- Why: This is the smallest deploy-safe cache-bust that updates the tab icon without changing routing or build setup.
- Impact: Browsers fetch the new favicon URL on reload, so the updated EventHub icon appears without waiting for long-lived cache expiry.
- Revisit trigger: If favicon assets become pipeline-versioned automatically, remove manual query-string versioning from static HTML.

---

## [2026-03-30] Align browser tab and social page-title metadata branding to EventHub
- Context: Browser tabs were still showing legacy `EventVibe` branding from static HTML metadata despite app branding being EventHub.
- Decision: Update `client/index.html` title metadata from `EventVibe` to `EventHub` for the document `<title>` and `og:title`.
- Why: Corrects visible browser-tab branding immediately with minimal scope and no runtime behavior changes.
- Impact: New page loads now show EventHub branding in tab titles and Open Graph title metadata.
- Revisit trigger: If product wants a different marketing tagline, update title strings in the same metadata file.

---

## [2026-03-30] Keep Home footer below the fold by default with landing-only content height floor
- Context: On Home with empty featured listings, the footer was visible immediately on first paint, reducing the intended full-page white hero/listing canvas feel.
- Decision: Set a Home-page-only `main` minimum height floor (`min-h-[calc(100vh+7rem)]`) so the footer requires scroll to be seen even when listing content is sparse.
- Why: This preserves current component structure and visual format while achieving the requested above-the-fold behavior only on the landing page.
- Impact: Home now opens with full white content area and footer below fold by default; other pages remain unchanged.
- Revisit trigger: If Home receives additional above-the-fold modules that naturally push footer below fold across breakpoints, remove the explicit min-height floor.

---

## [2026-03-26] Add split-hosting production bridge with frontend API base routing and backend CORS allowlist
- Context: Production setup requires frontend requests to target Railway API while app code used relative `/api` and `/uploads` paths, which breaks when frontend and backend run on different origins.
- Decision: Add frontend runtime URL resolver with optional `VITE_API_BASE_URL`, patch `window.fetch` to reroute relative `/api`/`/uploads` requests to that base, normalize listing/media URL builders through the same resolver, and add backend CORS allowlist support (`APP_URL` + `CORS_ALLOWED_ORIGINS`) with credentialed preflight handling.
- Why: This is the thinnest launch-safe path to keep existing client fetch/media code working in split hosting without large call-site rewrites.
- Impact: Frontend can call Railway from production frontend domains using one env var, uploaded media paths resolve correctly when backend is cross-origin, and backend now explicitly allows configured production origins for Auth0 bearer-token API calls.
- Revisit trigger: If deployment standardizes on single-origin hosting (frontend + API behind one domain), remove fetch URL patching and simplify to direct relative paths with tighter CORS defaults.

---

## [2026-03-26] Apply launch-priority auth/payment security hardening for bookings and Google OAuth tokens
- Context: Security audit identified three pre-launch hardening gaps: plaintext Google OAuth token storage at rest, missing booking creation rate limiting, and multiple `500` responses leaking raw `error.message` values to clients.
- Decision: Encrypt Google access/refresh tokens in `server/google.ts` write paths using the existing AES-GCM helper and document `GOOGLE_TOKEN_ENCRYPTION_KEY`; add `bookingRateLimiter` to `POST /api/bookings`; replace raw `500` error-message responses in `server/routes.ts` with a centralized sanitized responder that logs server-side details and returns `"Internal server error"`.
- Why: These changes reduce blast radius from DB credential leaks, booking-flood abuse, and internal error information disclosure without changing core booking or Auth0/Stripe behavior.
- Impact: Booking endpoint now has per-IP throttling, Google token refresh writes are encrypted, and client-visible `500` responses no longer expose internal exception strings while preserving route-level error logging.
- Revisit trigger: When route modules are split from `routes.ts`, move the internal-error responder and rate-limit policy into shared middleware to enforce uniformly across all domains.

---

## [2026-03-26] Remove remaining legacy auth compatibility route shims in frontend router
- Context: `/login`, `/signup`, and `/vendor/signup` were still present as compatibility redirect shims in client routing after legacy auth/page cleanup.
- Decision: Delete those three shim routes and remove their redirect helper components from `client/src/App.tsx`, leaving canonical `/vendor/login` Auth0 flow as the only explicit login route.
- Why: Product direction is to fully retire legacy auth page behavior instead of preserving compatibility redirects.
- Impact: Hitting `/login`, `/signup`, or `/vendor/signup` now falls through to the app not-found route instead of redirecting; canonical auth/login flow remains unchanged.
- Revisit trigger: If external link traffic still depends on these URLs, add targeted server-level redirects with telemetry instead of restoring client-side legacy shims.

---

## [2026-03-26] Scope Browse filter-label typography override to explicit 11.5px
- Context: Browse Vendors filter-field labels (`Location`, `Price range`, `Delivery included?`, `Setup included?`, etc.) rendered too small after global font scaling and needed a precise size target.
- Decision: Apply a page-local class override on those specific Browse filter `Label` instances to force `11.5px` text, instead of changing shared `Label` defaults.
- Why: This satisfies exact UX sizing requirements without changing label typography across onboarding/forms elsewhere.
- Impact: Browse filter labels now render at `11.5px` effective size on desktop and mobile, with scope limited to this page’s filter panel.
- Revisit trigger: If a consistent filter-typography token is introduced, replace inline per-label override with a shared semantic class.

---

## [2026-03-26] Hide browse tag-row scrollbar while preserving horizontal scrolling behavior
- Context: The top tag-pill strip on Browse Vendors showed an always-visible horizontal scrollbar that felt visually heavy and distracting.
- Decision: Hide the scrollbar for that specific horizontal pill scroller using a scoped utility class (`scrollbar-width: none`, `-ms-overflow-style: none`, and WebKit scrollbar suppression) while keeping `overflow-x-auto` unchanged.
- Why: This keeps the interaction (mouse wheel, trackpad, touch, keyboard-driven horizontal scroll) intact but removes the visible bar for cleaner presentation.
- Impact: No visible horizontal scrollbar under the tag pills; pill strip still scrolls smoothly on desktop and mobile without layout shifts.
- Revisit trigger: If discoverability drops for horizontal filtering, add a lightweight visual affordance (edge fade/chevrons) without restoring the native bar.

---

## [2026-03-26] Remove deprecated duplicate vendor profile-create endpoint and align docs to canonical Auth0 model
- Context: `POST /api/vendor/profiles` had been running in deprecated mode (`410` + telemetry/dev fallback) as the last duplicate vendor profile creation path after canonical onboarding/profile flows were established.
- Decision: Delete `POST /api/vendor/profiles` entirely, remove its route-specific deprecation/schema helpers, and update core docs (`API_DOCS.md`, `replit.md`) to reflect Auth0-managed login and the canonical one-vendor-account/many-vendor-profiles model.
- Why: The route was not part of active frontend flows and keeping a deprecated duplicate create path increased unnecessary surface area and documentation drift.
- Impact: No duplicate backend vendor profile-create endpoint remains outside onboarding; docs no longer describe removed legacy password-auth endpoints as active behavior.
- Revisit trigger: If external clients surface unexpected dependency on the removed route, add a short-lived explicit migration notice endpoint instead of restoring duplicate create logic.

---

## [2026-03-26] Remove fully blocked legacy email/password auth endpoints from backend
- Context: Legacy email/password auth endpoints (`/api/vendor/signup`, `/api/vendor/login`, `/api/customer/signup`, `/api/customer/login`, `/api/auth/login`) had already been rerouted away in frontend and were default-blocked via deprecation `410` responses.
- Decision: Delete all five legacy endpoint handlers, remove their now-dead schemas and auth-deprecation helper code, and remove dead auth helpers (`comparePassword`, `generateToken`) that were only used by those endpoints.
- Why: This safely reduces auth surface area and maintenance burden without touching canonical Auth0 identity/account resolution flows.
- Impact: Legacy password-auth backend entrypoints are now absent (`404`), while canonical Auth0 onboarding/account/profile flows remain unchanged.
- Revisit trigger: If any external legacy client usage appears after removal, evaluate adding a short-lived explicit migration response route instead of restoring password-auth logic.

---

## [2026-03-26] Consolidate duplicate vendor profile creation surface by removing one path and deprecating the other
- Context: Profile creation had three backend entrypoints (`/api/vendor/onboarding/complete`, `POST /api/vendor/profile`, `POST /api/vendor/profiles`) while current frontend profile creation flows already route through onboarding.
- Decision: Remove `POST /api/vendor/profile` entirely as an unused duplicate and deprecate `POST /api/vendor/profiles` behind telemetry + `410` with a dev-only fallback switch (`ALLOW_LEGACY_VENDOR_PROFILE_CREATE_IN_DEV=true`), keeping canonical onboarding/profile read-update/switch/lifecycle routes unchanged.
- Why: This is the smallest low-risk cleanup that reduces duplicate create paths without affecting active vendor onboarding/dashboard flows.
- Impact: Duplicate profile-create surface is reduced immediately; any legacy callers of `POST /api/vendor/profiles` now get explicit deprecation behavior in production and can be temporarily allowed in dev for troubleshooting.
- Revisit trigger: After telemetry remains quiet for a stable window, remove `POST /api/vendor/profiles` handler body and delete the dev fallback.

---

## [2026-03-26] Cleanup Batch 3 backend legacy auth middleware and deprecated no-op vendor route
- Context: Backend still carried unused JWT-era middleware exports (`requireVendorAuth`, `requireCustomerAuth`, `requireDualAuth`) and a deprecated no-op route (`POST /api/vendor/me/deactivate`) that had no current frontend call sites.
- Decision: Delete the three unused middleware exports from `server/auth.ts`, remove stale imports from `server/routes.ts`, and remove `POST /api/vendor/me/deactivate` while keeping other deprecated legacy auth endpoints blocked with `410` + telemetry.
- Why: This trims dead backend auth surface area and reduces maintenance noise without changing active Auth0 vendor/customer flows or broadening route access.
- Impact: Dead middleware code is gone, the deprecated no-op deactivation endpoint now fully resolves to absence (`404`) instead of an intentional `410`, and canonical vendor-account gating remains the active protection path.
- Revisit trigger: When legacy-auth telemetry confirms zero usage over a stable window, remove remaining blocked legacy auth endpoints entirely.

---

## [2026-03-26] Remove dead legacy frontend auth pages and trim unused token/local-storage remnants
- Context: After Batch 1 rerouted legacy auth paths and deprecated backend legacy auth endpoints, `Login.tsx` / `Signup.tsx` were no longer reachable by canonical flow and some frontend legacy localStorage writes/cleanup remained.
- Decision: Delete dead legacy auth pages, keep compatibility routes as redirect shims in `App.tsx`, remove unused legacy token-clearing in navigation logout, and remove unused onboarding writes for `vendorAccountId` / `vendorProfileId`.
- Why: This reduces frontend auth drift and dead code without changing user-visible Auth0 onboarding/dashboard behavior.
- Impact: Frontend auth entry now consistently funnels through canonical Auth0 screens with less legacy noise and fewer stale localStorage side effects.
- Revisit trigger: When compatibility routes are no longer needed externally, retire `/login`, `/signup`, and `/vendor/signup` redirect shims entirely.

---

## [2026-03-26] Deprecate legacy password auth entrypoints and reroute frontend auth paths to canonical Auth0 flow
- Context: Legacy email/password signup/login routes remained reachable from frontend paths (`/login`, `/signup`, `/vendor/signup`) and backend endpoints (`/api/vendor/signup`, `/api/vendor/login`, `/api/customer/signup`, `/api/customer/login`, `/api/auth/login`), creating ownership-drift risk against the canonical Auth0-linked vendor identity model.
- Decision: Reroute frontend legacy auth routes to canonical Auth0 entrypoints via `/vendor/login` return-to redirects, replace footer "Become a Vendor" target to Auth0 + onboarding path, and deprecate the five legacy backend auth endpoints with structured telemetry + controlled `410` responses that direct clients to Auth0. Keep a guarded dev-only fallback switch (`ALLOW_LEGACY_AUTH_IN_DEV=true`) to avoid silently breaking insecure preview troubleshooting.
- Why: This stops new production traffic from entering legacy account-creation/auth paths while preserving a narrow emergency/dev bridge without broad deletion.
- Impact: New auth/account creation traffic is funneled into Auth0 flow; legacy endpoints no longer create accounts by default and emit auditable deprecation logs when called.
- Revisit trigger: After transition confidence is high and preview/dev no longer needs legacy fallback, remove endpoint bodies and delete legacy Signup/Login UI modules entirely.

---

## [2026-03-25] Stabilize Hub routes and extend venue logistics with takedown fees while removing duplicate edit-map rendering
- Context: My Hub/Vendor Hub navigation needed stronger compatibility for legacy links, listing logistics UX needed visible currency prefixes and venue takedown controls, and edit listing service-area preview was rendering two overlapping maps.
- Decision: Add route/API compatibility for hub paths (`/vendor/hub/:vendorId`, `/vendor/my-hub`, `/my-hub`) and support legacy public-shop IDs by resolving `:vendorId` as either `vendor_accounts.id` or `vendor_profiles.id`; remove static map overlay in edit flow so only one live map renders; add venue-only takedown fields (toggle + fee enable + amount) to create/edit listing flows; keep fee inputs currency-prefixed; propagate takedown fee through checkout/booking logistics totals.
- Why: These are targeted MVP fixes that restore key navigation paths, prevent map UX confusion, and complete venue logistics configuration without broad schema refactors.
- Impact: Hub links are resilient to old URLs, edit listing now shows a single map, create/edit logistics now supports takedown pricing for venues, and checkout/booking totals include takedown fees when configured.
- Revisit trigger: When listing logistics columns are expanded in DB, promote takedown from listingData JSON to canonical columns and simplify fee parsing fallbacks.

---

## [2026-03-23] Harden vendor identity ownership at DB layer with guarded backfill, duplicate repair/reporting, and partial uniqueness
- Context: Identity resolution and frontend vendor-state handling were hardened in app code, but DB-level ownership guarantees for `users.auth0_sub` and `vendor_accounts.user_id`/`auth0_sub` were still incomplete.
- Decision: Add migration `0025_vendor_identity_backfill_and_constraint_hardening` to (1) align schema by ensuring `users.auth0_sub`, (2) run unambiguous identity backfills, (3) detect/report duplicates, (4) run deterministic account-level duplicate repair when safe (repoint dependents + soft-retire duplicates), and (5) enforce unique indexes only after unresolved duplicates are absent.
- Why: Canonical ownership rules must be guaranteed in data, not only in request-time resolver logic.
- Impact: Active vendor accounts are now protected by unique partial identity constraints (`vendor_accounts.user_id` and `vendor_accounts.auth0_sub` for non-deleted rows) and users are protected by unique Auth0 subject mapping; unresolved conflicts block constraint enforcement with a persistent report trail.
- Revisit trigger: After identity cleanup stabilizes in production, consider removing migration-window dependency on `vendor_accounts.auth0_sub` as fallback and tightening account/profile integrity constraints further.

---

## [2026-03-23] Add explicit vendor-state contract and error-aware frontend vendor detection
- Context: Frontend vendor detection was using `/api/vendor/me` success as vendor and any failure as non-vendor, causing returning vendors to appear as non-vendors during auth/session or transient API failures.
- Decision: Extend `/api/vendor/me` with compatibility-safe state booleans (`hasVendorAccount`, `hasAnyVendorProfiles`, `hasActiveVendorProfile`, `needsNewVendorProfileOnboarding`) and update frontend vendor checks to classify `401` (auth/session), `404` (non-vendor), and transient failures separately instead of collapsing them into non-vendor.
- Why: Vendor account existence, profile existence, and active profile selection are different states; collapsing them produced incorrect UI role gating.
- Impact: Returning vendors are no longer immediately downshifted to customer UI on transient or auth errors, and dashboard/nav gating can rely on explicit vendor-state semantics.
- Revisit trigger: After DB identity constraints and resolver migration are complete, replace local fallback heuristics with a shared typed vendor-state hook across all pages that query `/api/vendor/me`.

---

## [2026-03-23] Centralize Auth0 vendor account resolution with deterministic precedence and guarded link-heal
- Context: Returning vendors were intermittently treated as non-vendors because backend resolution paths diverged (email-first in some routes, sub-first in others) and could overwrite/link identity fields unsafely.
- Decision: Add one canonical backend resolver (`resolveVendorAccountForAuth0Identity`) and route all Auth0 vendor-account resolution through it with strict precedence: `Auth0 sub -> users.auth0_sub -> vendor_accounts.user_id` (primary), then `vendor_accounts.auth0_sub`, then email fallback only for one-time legacy linking. Add guarded in-app link-heal for missing `vendor_accounts.user_id` / `vendor_accounts.auth0_sub` only when matches are unique and non-conflicting.
- Why: Deterministic identity resolution prevents duplicate-account drift and restores reliable returning-vendor recognition without schema migrations or frontend changes.
- Impact: Vendor identity checks now share one source of truth across Auth0 bridge middleware, vendor-only route middleware, onboarding completion account lookup, and Google OAuth vendor resolution; ambiguity/conflict cases are logged and never auto-overwritten.
- Revisit trigger: After duplicate-account cleanup + DB uniqueness constraints are in place, tighten resolver behavior to fail fast on conflicts and remove legacy email fallback path where safe.

---

## [2026-03-23] Use popup-first re-auth + one-shot retry for onboarding final CTA actions
- Context: Vendors reported `Go To My Hub` and `Create first listing` appearing non-functional on onboarding confirm because both actions depended on one protected submit path that could fail on expired/missing auth tokens.
- Decision: In onboarding final submit, add stronger auth-error normalization, run popup-first Auth0 re-auth (`loginWithPopupFirst` with redirect fallback), retry onboarding completion once after successful popup auth, and disable CTA buttons with in-button progress text while submit is in-flight.
- Why: Both CTAs share the same mutation; this keeps end-of-onboarding routing reliable under token churn and removes the silent/no-feedback feel when auth recovery is needed.
- Impact: If submit auth is stale, onboarding now attempts immediate re-auth and retries completion in-place before routing to `/vendor/shop`, `/vendor/dashboard`, or `/vendor/listings/new`; buttons no longer allow duplicate clicks during finalize.
- Revisit trigger: If centralized API auth refresh/retry middleware is introduced, remove onboarding-local retry/auth-detection logic and rely on shared request-layer behavior.

---

## [2026-03-23] Treat onboarding submit 401/403 responses as re-auth flow instead of hard failure
- Context: Vendors on onboarding `Confirm` could click `Create first listing` and receive `Onboarding failed: Login required` even though the intended behavior is to continue into the listing wizard.
- Decision: In `VendorOnboarding`, normalize auth failure detection so API submit responses with `401/403` (or auth-required error messages) map to the existing `loginWithRedirect` path that preserves onboarding draft state.
- Why: This keeps the end-of-onboarding CTA reliable and avoids dead-end toasts for recoverable auth/session expiration states.
- Impact: Clicking `Create first listing` now triggers re-auth when needed and returns the user to onboarding with draft preserved, allowing completion and navigation to `/vendor/listings/new`.
- Revisit trigger: If auth is centralized with automatic token refresh/retry for protected mutations, remove onboarding-local auth error pattern matching and rely on shared auth middleware.

---

## [2026-03-23] Preserve onboarding draft and trigger Auth0 re-login when final submit token is missing
- Context: Vendors could return to onboarding `Confirm` with draft data, but clicking `Create first listing` failed with `Login required` when silent token retrieval was unavailable.
- Decision: In `VendorOnboarding`, switch final submit token retrieval to shared `getFreshAccessToken`, treat missing token as an auth-reauth case, trigger `loginWithRedirect` back to the same onboarding URL, and preserve draft local-storage across that redirect by bypassing unmount cleanup only for that case.
- Why: This keeps the final onboarding action reliable without changing existing onboarding/profile persistence behavior and avoids losing user-entered data during re-auth.
- Impact: If auth is valid, onboarding completes and routes to `/vendor/listings/new` as before; if auth is stale, user is re-authenticated and returned to onboarding with draft intact so they can complete and proceed to the listing wizard.
- Revisit trigger: If onboarding gains route-level auth guards or a centralized session-refresh mechanism, remove local submit-level re-auth handling and rely on shared guard behavior.

---

## [2026-03-23] Enable onboarding spellcheck for non-address text fields, including Specialties
- Context: Product requested browser spellcheck for the vendor onboarding `Specialties` input and asked to apply the same behavior to other onboarding text fields, except address fields.
- Decision: Add optional `spellCheck` support to shared `HobbyPillInput` and enable `spellCheck` on non-address onboarding text inputs/textareas in Step 2 and Step 3, while explicitly keeping address fields (`street`, `city`, `state`, `zip`, and address search input) non-spellchecked.
- Why: This delivers native spelling feedback for freeform/vendor-entered copy without changing current normalization, validation, or address-entry behavior.
- Impact: `Specialties`, `Hobbies`, and other non-address onboarding text fields now surface browser spellcheck cues; address-entry flow remains unchanged.
- Revisit trigger: If onboarding form configuration is centralized, move spellcheck allow/deny behavior into a shared field metadata map instead of per-field props.

---

## [2026-03-23] Increase vendor onboarding step-body typography by 0.5px while excluding sidebar and headers
- Context: Product requested all text in vendor onboarding steps be increased by `0.5px`, with explicit exclusions for sidebar and header text.
- Decision: Add vendor-onboarding-only typography scope classes (`vendor-onboarding-steps-typography` and `vendor-onboarding-step-content`) and apply `+0.5px` overrides for step-body typography (default body text, inputs/textarea/select, labels, `text-xs`, `text-sm`, `text-base`, confirm row text, and large action button text), while leaving step headers and sidebar text outside the scoped wrapper.
- Why: Scoped classes satisfy the request precisely without leaking typography changes into shared create-listing styles that reuse onboarding input-surface classes.
- Impact: Vendor onboarding body content reads larger by `0.5px` across steps; sidebar icon rail labels and step header text remain unchanged.
- Revisit trigger: If onboarding typography is centralized into semantic tokens, replace scoped per-class pixel overrides with token-driven step-body and step-header variants.

---

## [2026-03-21] Configure Firebase Hosting deployment for EventHub web app
- Context: Project needed immediate Hosting deployment on Firebase (`eventhub-a5700`) while postponing Functions/Firestore deployment setup.
- Decision: Add repo-level Firebase Hosting config (`firebase.json`, `.firebaserc`) targeting Vite client output at `dist/public`, and deploy with `firebase deploy --only hosting --project eventhub-a5700`.
- Why: This enables fast MVP web deployment with minimal scope and avoids coupling this release to backend cloud migration work.
- Impact: Static web app now deploys reliably to Firebase Hosting via one command; Functions/Firestore can be configured later without blocking web release.
- Revisit trigger: If backend APIs or server rendering move to Firebase infrastructure, extend config to include Functions/Firestore and environment-specific targets.

---

## [2026-03-21] Add 24-hour post-event dispute lifecycle with automatic payout release and admin dispute resolution
- Context: Product required a strict flow of `event ends -> 24-hour dispute window -> auto payout unless disputed`, with manual admin handling only when a dispute is filed.
- Decision: Introduce a first-class `booking_disputes` table and dispute routes (`customer file`, `vendor respond`, `admin list/resolve`), switch payout eligibility hold from 48 hours to 24 hours, block payouts when booking dispute status is active, and auto-process eligible payouts on a recurring server worker.
- Why: This creates a deterministic MVP dispute lifecycle that protects customers during a short fixed window while preserving vendor payout speed when no dispute exists.
- Impact: Non-disputed bookings now auto-release payouts after 24 hours post-event; disputed bookings move to blocked payout state until admin resolves with either refund or payout release.
- Revisit trigger: If support volume or dispute complexity grows, move auto-payout/dispute transitions to a durable job queue with explicit retries, dead-letter handling, and full audit trail actions.

---

## [2026-03-21] Harden create-listing Step 4 Mapbox initialization with resize and load-timeout fallback
- Context: Service Area map could remain on "Loading map..." with map chrome visible, and product suspected render-area sizing contributed to intermittent map paint failures.
- Decision: Stabilize map init effect to run per-step entry (not per center change), add deferred resize after load plus immediate resize observer kick, and add a load-timeout fallback that surfaces a token/allowed-URL error message when style load stalls.
- Why: This addresses both container sizing timing issues and silent long-load states that left the step stuck without actionable feedback.
- Impact: Step 4 map should render more reliably after mount/resizes, and failed style loads now show explicit diagnostic copy instead of indefinite loading.
- Revisit trigger: If map reliability issues persist in production, instrument map lifecycle telemetry (load/error/timeout) and evaluate extracting shared map hook used by create/edit flows.

---

## [2026-03-21] Reorder create-listing Service Area step to place listing center picker above radius control
- Context: Product requested listing center address input to appear earlier in Step 4 so vendors set the location before adjusting coverage radius.
- Decision: Move `Listing center address` `LocationPicker` block to the top of the Service Area card, above `Coverage radius`, and keep map preview below both controls.
- Why: This aligns control order with user intent (set center first, then radius) and improves comprehension.
- Impact: Step 4 now presents center selection first; supporting map placeholder copy was updated to remove positional wording.
- Revisit trigger: If map-first workflows are reintroduced, reassess whether location input should be in-map only or split with inline search.

---

## [2026-03-21] Increase "Back to Marketplace" button text to 12.5px and widen button width without height changes
- Context: Product requested larger text inside "Back to Marketplace" while preserving button height and allowing horizontal expansion if needed.
- Decision: Set all "Back to Marketplace" button text to `12.5px`; increase dashboard shell button minimum width from `116px` to `136px`; keep existing heights unchanged.
- Why: This improves readability while preserving existing compact header vertical rhythm.
- Impact: Back-to-marketplace controls are easier to read and no longer feel cramped at the prior small text size.
- Revisit trigger: If header button typography is standardized via design tokens, migrate these hardcoded sizes to shared button variants.

---

## [2026-03-21] Enforce required-field completion before forward step navigation in create-listing wizard
- Context: Users could use sidebar step icons to move forward without satisfying required fields on the current step, creating the impression that mandatory steps were skippable.
- Decision: Apply the same forward-navigation guard used by the Next button to sidebar step clicks: when clicking a later step, block navigation if current step required fields are incomplete and trigger current-step validation messaging.
- Why: This keeps progression behavior consistent and prevents bypassing required inputs through alternative navigation paths.
- Impact: Forward movement now requires current-step completeness whether users click Next or a later step icon.
- Revisit trigger: If product later introduces explicit "skip step" affordances for optional steps, split required vs optional forward-navigation rules by step metadata.

---

## [2026-03-21] Stabilize create-listing Step 4 Mapbox center dependency to prevent map re-init loop
- Context: Service Area map in create-listing Step 4 could remain stuck on "Loading map..." while Mapbox UI chrome rendered, indicating map initialization was repeatedly interrupted.
- Decision: Memoize the derived `center` object (`lat/lng`) so its reference changes only when coordinates change, preventing the map-init effect from tearing down/recreating on unrelated rerenders.
- Why: The map-init effect depended on `center`; recreating `{ lat, lng }` each render caused repeated cleanup and prevented reliable `load` completion.
- Impact: Step 4 map initialization is now stable and should transition out of loading once Mapbox style/data load succeeds.
- Revisit trigger: If Step 4 map logic is extracted into a shared hook/component, keep dependency inputs primitive or memoized to avoid effect churn regressions.

---

## [2026-03-21] Reorder and split rental quantity helper copy in create-listing Step 3
- Context: In Booking & Pricing for rental listings, quantity helper copy order reduced clarity and the two-sentence quantity rule appeared as one line.
- Decision: Move the “Example: if this listing is a set of 5 vases…” helper above the quantity input, and split quantity guidance into two lines by rendering `Use "What's Included" from Step 1...` as a separate paragraph.
- Why: This makes context visible before input entry and improves scanability of the quantity rule.
- Impact: Rental quantity guidance now appears in requested order and with clearer line breaks.
- Revisit trigger: If helper copy is centralized into shared content components, move this ordering/line-break behavior into that shared helper config.

---

## [2026-03-21] Hide Booking Type section for rental listings in create-listing pricing step
- Context: In Booking & Pricing, rentals showed a Booking Type label plus informational text even though rental flow uses fixed instant-book behavior for MVP.
- Decision: Render the Booking Type section only when category requires a choice (`Service`, `Venue`, `Catering`) and show nothing for `Rental`.
- Why: This removes non-actionable UI for rentals and keeps the pricing step focused on fields vendors can actually edit.
- Impact: Rental category no longer displays the Booking Type header or default Instant Book helper copy.
- Revisit trigger: If rental booking mode becomes configurable in MVP or post-launch, restore an explicit rental Booking Type control.

---

## [2026-03-21] Move create-listing "Perfect For" select-all control to bottom-right action row
- Context: Product requested the `Select all` control in the "Perfect For" step to sit below the option pills instead of top-left.
- Decision: Reorder the step layout so the pill grid renders first and the existing select-all/clear-all button renders in a bottom action row aligned right.
- Why: This keeps focus on option selection and places bulk action in a conventional trailing position.
- Impact: The control now appears at the bottom-right of the "Perfect For" section, with no behavior changes.
- Revisit trigger: If additional bulk actions are introduced for this step, revisit action-row structure for spacing and grouping.

---

## [2026-03-21] Center align create-listing "Perfect For" pill rows to remove right-heavy whitespace
- Context: With larger event pills in the "Perfect For" step, left-aligned wrap rows created visually awkward right-side gaps.
- Decision: Update the pill container layout to `justify-center` while keeping existing pill sizing, spacing, and selection styles unchanged.
- Why: Center alignment balances wrapped rows and improves perceived layout polish without changing interaction behavior.
- Impact: Pill rows now render centered within available width, reducing uneven right-side empty space.
- Revisit trigger: If product later requires strict left-aligned scan order across breakpoints, revisit row alignment and evaluate a responsive grid layout.

---

## [2026-03-21] Reduce forced vertical overflow on listing-basics step by lowering bottom spacer
- Context: Create-listing uses a fixed bottom action bar and a shared content bottom spacer (`pb-36`) to prevent overlap, but Listing Basics was showing unnecessary vertical scroll due to excess reserved space.
- Decision: Make create-listing content bottom padding step-aware: `pb-24` for `basics`, `pb-36` for other steps.
- Why: This preserves footer-safe spacing while avoiding forced overflow on the shorter basics page.
- Impact: Listing Basics no longer shows extra scrolling unless content truly exceeds viewport height; other steps keep previous spacing behavior.
- Revisit trigger: If action bar height or positioning changes, recalculate step spacers and consider deriving spacer from a shared footer height token.

---

## [2026-03-21] Render create-listing "What's Included" entries as wrapping compact chips
- Context: "What's Included" entries were displayed as full-width rows, making the section feel oversized compared with nearby Search Tags and reducing scan efficiency.
- Decision: Change the "What's Included" list container to `flex-wrap` and render each item as an inline compact bordered chip (keeping square/rounded-rectangle styling).
- Why: This preserves visual style while improving density and allowing side-by-side alignment before wrapping.
- Impact: Added inclusion items now sit side-by-side and wrap naturally, instead of always taking full row width.
- Revisit trigger: If inclusions need long-form readability or drag reordering later, revisit chip vs. row layout and introduce responsive mode switching.

---

## [2026-03-21] Reduce create-listing side gutters and widen step content cards
- Context: Wizard step cards had large left/right gutters and narrower content width than desired for authoring-heavy forms.
- Decision: Reduce horizontal padding on the create-listing main content container and increase each step content wrapper width from `max-w-3xl` to approximately 10% wider (`max-w-[53rem]`).
- Why: This improves available editing space and visual balance without changing step structure or form behavior.
- Impact: Section cards across all create-listing steps render wider with reduced side gutters.
- Revisit trigger: If responsive layout QA shows crowding on smaller breakpoints, split widths by breakpoint-specific max widths.

---

## [2026-03-21] Apply wizard-scoped typography overrides for create-listing labels and helper copy
- Context: Product requested larger, more editorial typography across all create-listing steps: labels in Cormorant Garamond at `17.5px` and helper paragraph text at `15.5px`.
- Decision: Add scoped CSS under `.create-listing-wizard-typography` and attach that class to the create-listing wizard content container. Override `label` typography and muted helper paragraphs (`p.text-muted-foreground`) within that scope only.
- Why: Scoped overrides meet the request across all wizard pages without changing unrelated onboarding/dashboard surfaces that share base input styles.
- Impact: Create-listing step labels now render in heading font at `17.5px`; helper paragraph text renders at `15.5px` throughout wizard steps.
- Revisit trigger: If wizard typography tokens become part of shared design system, replace scoped hardcoded values with semantic token utilities.

---

## [2026-03-21] Style create-listing search tag chips with brand accent fill
- Context: In Listing Basics, added search-tag chips were neutral while nearby controls already used stronger accent cues.
- Decision: Update added search-tag chip styling to use `#E07A6A` as filled background/border with white text for readability.
- Why: This makes added tags visually distinct and aligns with requested accent behavior.
- Impact: Search tags in create-listing basics now render as brand-accent pills immediately after being added.
- Revisit trigger: If tag color tokens are centralized in design system, replace hardcoded hex usage with shared semantic token.

---

## [2026-03-21] Enhance create-listing "Perfect For" pills with stronger selection state and emoji cues
- Context: Product requested larger event pills in the listing wizard "Perfect For" step, explicit selected color `#E07A6A`, and visual emoji cues tied to each event type.
- Decision: Update only the "Perfect For" pill rendering classes to increase size and use `#E07A6A` selected styling, and append right-side emoji markers from a local option-to-emoji map.
- Why: This increases scanability and feedback in a high-frequency categorization step without changing flow logic or layout structure.
- Impact: Pills are larger, selected state is visually clearer, and each option includes a contextual emoji on the right.
- Revisit trigger: If design system tokenizes semantic accent colors/icons for selection controls, migrate this step to shared tokens/components instead of inline classes/map.

---

## [2026-03-21] Make create-listing helper text category-aware with rental fallback
- Context: Listing wizard helper copy under Description, What's Included, and Search Tags was rental-focused and static across all categories.
- Decision: Add category-mapped helper text config in `CreateListingWizard` and render helper copy dynamically from selected category (`Rental`, `Venue`, `Service`, `Caterer`) with default fallback to rental when category is unset.
- Why: This keeps guidance relevant for each listing type without changing layout or data model.
- Impact: Helper text updates instantly when category changes, with no refresh and no additional state writes.
- Revisit trigger: If helper copy is moved to CMS or localization, migrate this config to shared content source and keep same category mapping contract.

---

## [2026-03-21] Tighten create-listing tag and included-text sanitization/casing rules
- Context: Listing creation needed stricter formatting rules for `Search Tags` and `What's Included`: title-style casing, no special characters beyond spaces/apostrophes, and no forced capitalization after apostrophes.
- Decision: Update wizard-side normalizers so both fields accept only alphanumeric characters, spaces, and apostrophes; normalize to word-level capitalization with remaining characters lowercased.
- Why: This keeps listing metadata consistent and readable while respecting names/phrases that include apostrophes.
- Impact: Added tags and included bullets are now sanitized and formatted consistently at entry time before being persisted.
- Revisit trigger: If edit flow/server-side validation adds shared normalization utilities, move this logic to a shared layer to keep create/edit/API behavior fully aligned.

---

## [2026-03-21] Enforce title-case entry for listing creation titles
- Context: Vendors could enter listing titles in inconsistent casing (for example, lowercase mid-words), creating uneven listing presentation quality.
- Decision: Update listing creation title normalization in `CreateListingWizard` to automatically uppercase the first letter of each word segment while preserving existing spacing and max-length constraints.
- Why: This is a low-risk input-level guardrail that improves listing consistency without adding backend schema or migration work.
- Impact: Newly typed listing titles in create-flow basics step are normalized to title-style capitalization as users type.
- Revisit trigger: If we add stricter global text normalization policy across create/edit APIs, move title-casing enforcement to shared server-side validation and align edit flow behavior.

---

## [2026-03-21] Auto-fill My Hub service area from onboarding location and persist profile-level service radius
- Context: Vendor Hub already fell back to city when `serviceAreaLabel` was empty, but My Hub `Service Area` remained blank, creating mismatch between vendor-edit view and public view. Product also needed a simple radius control to display coverage like `Highland, UT +100 miles`.
- Decision: In My Hub, default `Service Area` draft to onboarding city/state when `onlineProfiles.serviceAreaLabel` is empty, add `Service Radius (miles)` input backed by `vendor_profiles.service_radius`, and include that radius in vendor shop API + Vendor Hub display formatting.
- Why: This preserves current source-of-truth fields, avoids schema churn, and makes vendor-facing editing behavior consistent with customer-facing display.
- Impact: Vendors now see an auto-filled service area in My Hub, can set a profile-level radius, and Vendor Hub can render `Service Area + radius` when configured.
- Revisit trigger: If service-area logic is consolidated around listing-level delivery coverage only, remove or de-emphasize profile-level radius from public vendor storefront fields.

---

## [2026-03-21] Anchor hero category dropdown inside zoomed hero container
- Context: The homepage hero search bar uses `zoom: 0.7` (`.landing-hero-search-scale-down`). With Category select content rendered via portal, the dropdown could appear detached in the viewport corner instead of under the `Rentals` trigger.
- Decision: Render the Category `SelectContent` with `disablePortal` in `client/src/components/Hero.tsx`, keeping popper alignment (`bottom/start`) so it stays in the same coordinate system as the trigger.
- Why: This is the smallest, MVP-safe fix that restores predictable dropdown anchoring without changing hero layout dimensions.
- Impact: Category dropdown now opens directly below the Category trigger in the hero bar, matching expected dropdown behavior.
- Revisit trigger: If hero zoom/scaling is removed later, reevaluate shared select portal behavior and restore portal rendering if no positioning drift remains.

---

## [2026-03-19] Add vendor dashboard danger-zone deactivation flow wired to canonical soft-deactivate route
- Context: Server-side `POST /api/vendor/me/deactivate` existed, but vendors had no product UI path to trigger deactivation with clear lifecycle warnings.
- Decision: Add a minimal “Danger Zone” section to `VendorDashboard` with a destructive confirmation dialog that calls the deactivation endpoint, communicates lifecycle effects (deactivated not erased, listings hidden, no new bookings, historical bookings preserved), then logs out and redirects to a safe non-vendor page.
- Why: A launch-safe lifecycle policy is not complete unless vendors can execute it through normal UI flows.
- Impact: Vendors now have an explicit, confirm-first account deactivation flow aligned with preservation requirements.
- Revisit trigger: If account reactivation or admin-assisted restoration is introduced, add a separate, audited restore workflow rather than changing deactivation semantics.

---

## [2026-03-19] Normalize booking/listing FK behavior to remove duplicate live constraint ambiguity
- Context: Live DB still had duplicate `bookings.listing_id` foreign keys with conflicting delete behavior (`SET NULL` and default/no-action), plus `booking_items.listing_id` using `RESTRICT`, which diverged from canonical code expectations.
- Decision: Add migration `0020_booking_listing_fk_cleanup` to drop duplicate booking listing FK constraints and recreate a single canonical `ON DELETE SET NULL` FK on `bookings.listing_id`; also recreate `booking_items.listing_id` FK as `ON DELETE SET NULL`. Update typed schema references for booking linkage fields to explicitly match `SET NULL`.
- Why: Duplicate/ambiguous FK behavior is a concrete lifecycle risk and can produce non-deterministic delete semantics in future maintenance/admin paths.
- Impact: Booking-listing linkage semantics become explicit and consistent with deactivation-first preservation policy.
- Revisit trigger: If hard-delete admin tooling is introduced, add explicit preflight checks on booking/listing history before any destructive action.

---

## [2026-03-19] Treat vendor listing delete as inactive-and-hidden with active-only read contract
- Context: Product requires delete to feel permanent in vendor UX while preserving listing and booking history for integrity.
- Decision: Keep vendor listing delete as status transition (`active|draft -> inactive`) and enforce active-only listing reads across vendor listings APIs, vendor direct listing fetch, public browse/detail/shop, recommendations, and booking eligibility checks.
- Why: This keeps dashboards simple (no archive/inactive surface) and prevents new bookings on removed listings without destructive data loss.
- Impact: Deleted listings disappear from vendor/public discovery surfaces, direct vendor edit access returns not found once inactive, and booking history remains preserved and link-safe.
- Revisit trigger: If product introduces archive management later, add explicit archived/inactive management routes and UI with role-scoped access instead of relaxing active-only reads.

---

## [2026-03-19] Enforce vendor deactivation over hard-delete and preserve listing/booking history
- Context: Live data showed historical bookings with missing linkage, vendor-facing listing delete used hard-delete, and there was no canonical vendor account deactivation flow despite policy requiring historical booking preservation.
- Decision: Implement `POST /api/vendor/me/deactivate` as the normal account deletion path (soft deactivation via `vendor_accounts.active = false`), force vendor listings to `inactive` on deactivation, block deactivated vendor auth on vendor routes, and change vendor listing `DELETE` behavior to inactivate instead of hard-delete while returning preserved booking-history counts.
- Why: Marketplace records (confirmed/completed/cancelled bookings) must remain durable for support, payouts, and auditability; hard-deleting vendor/listing data in normal product flow risks data loss and orphaned history.
- Impact: Deactivated vendors can no longer use vendor APIs, public listing/shop/recommendation routes now exclude inactive vendors, booking creation rejects inactive vendor listings, and vendor listing “delete” now preserves records by moving listings inactive.
- Revisit trigger: If we add explicit admin/data-retention tooling, introduce a separate privileged hard-delete path for verified test/junk data only, with repair checks before execution.

---

## [2026-03-19] Remove unreferenced legacy onboarding/listing-step files to reduce dead-path risk
- Context: The current vendor onboarding and create-listing flows were consolidated into new canonical components, but legacy step files and a backup page artifact remained in the client tree with no active imports from the app entry graph.
- Decision: Delete unreferenced legacy create-listing step files under `client/src/features/vendor/create-listing/steps`, legacy onboarding step files no longer imported by `VendorOnboarding`, and `client/src/pages/ListingDetail.tsx.bak`.
- Why: Reducing dead files lowers maintenance overhead and prevents accidental regressions from stale components that are no longer part of launch MVP flows.
- Impact: The active onboarding/listing flows remain unchanged, while dead code surface is reduced and future refactors have fewer ambiguous legacy paths.
- Revisit trigger: If product intentionally restores multi-step legacy onboarding/listing experiences, recreate those steps from current flow requirements instead of restoring stale deleted files.

---

## [2026-03-19] Phase 4 legacy cleanup: reduce listing/booking JSON alias dependence and tighten booking snapshot integrity
- Context: After typed-first listing and booking normalization, several runtime paths still relied on deep `listing_data` alias trees (`pricingByPropType`, `deliverySetup`, quantity aliases) and booking context fallbacks that could hide canonical-data drift.
- Decision: Remove high-churn legacy alias dependence from listing detail/checkout/server listing helpers and booking context shaping, keeping only narrow compatibility fallbacks to direct mirrored keys for older records. Add safe booking integrity tightening with an active-window overlap index and NOT VALID checks for positive `booked_quantity` and nonnegative snapshot amounts.
- Why: Launch reliability depends on deterministic typed contracts; fallback trees should no longer silently reconstruct core operational behavior when canonical fields exist.
- Impact: Customer listing/checkout paths now derive operational behavior from typed fields first with reduced JSON alias fallback, server booking context no longer reads listing JSON alias trees for core booking-level data, and booking overlap/snapshot constraints are better protected for new writes.
- Revisit trigger: After confirming no production dependency on remaining compatibility fallback fields, remove listing JSON mirrors for operational fields entirely and eliminate `booking_items` ownership/linkage fallbacks for rows with null canonical linkage.

---

## [2026-03-19] Phase 3 booking normalization: persist typed booking quantity and fee breakdown snapshots on bookings
- Context: Booking creation and downstream vendor/customer views still depended on `booking_items.item_data` and runtime reconstruction for booked quantity and logistics/customer-fee breakdown, which risks historical drift when listing config changes.
- Decision: Add canonical booking snapshot columns on `bookings` (`booked_quantity`, delivery/setup/travel fee amounts, logistics total, base subtotal, subtotal before customer fee, customer fee amount), backfill conservatively from reliable existing sources, and make booking create/read/conflict/payments paths prefer these typed snapshot fields first.
- Why: A booking must remain an immutable record of what was booked and charged at that moment, independent of mutable listing JSON and partial `booking_items` metadata.
- Impact: New bookings now write quantity and fee/subtotal snapshots directly to `bookings`; overlap checks prefer booking-level quantity; vendor/customer booking APIs expose and prioritize immutable booking snapshots; `booking_items` remains compatibility fallback for older rows.
- Revisit trigger: After validating all active legacy rows have sufficient snapshot data, remove remaining `booking_items.item_data` fallbacks from booking-level read contexts and migrate review/customer-note/event-link metadata to dedicated typed booking tables/columns.

---

## [2026-03-19] Phase 2 listing normalization: make logistics toggle/fee state explicit in typed listing columns
- Context: After Phase 1 typed-first reads, listing logistics behavior still had ambiguity because delivery/setup fee-enabled state was inferred from fee amounts in some server/client paths. That meant operational behavior was still partly derived rather than explicitly modeled.
- Decision: Add explicit typed listing columns for `pickup_offered`, `delivery_fee_enabled`, and `setup_fee_enabled`, backfill these from legacy JSON booleans with conservative compatibility fallback to existing fee amounts where needed, and update listing canonical builders/read paths so logistics behavior is driven by explicit typed flags (not amount inference).
- Why: Booking and checkout totals must rely on deterministic listing configuration for launch reliability, and fee toggles are core operational state.
- Impact: Listing create/update/publish now persist canonical logistics toggle state to typed columns; public listing APIs expose these explicit fields; checkout/listing detail and server booking fee summary consume explicit fee-enabled toggles first. Legacy JSON remains a temporary fallback/mirror for compatibility.
- Revisit trigger: Remove remaining listing-data compatibility fallbacks once legacy listings are backfilled/verified and vendor edit surfaces no longer depend on JSON alias trees.

---

## [2026-03-19] Phase 1 harden listing/booking read contract to typed-first with compatibility fallbacks
- Context: Core listing surfaces (public APIs, listing detail, checkout, and some booking context reads) still consumed `vendor_listings.listing_data` aliases first even though canonical typed columns already existed. This kept checkout and publish/public compliance logic sensitive to legacy JSON shape drift.
- Decision: Make typed columns the primary read/source-of-truth contract for canonical listing behavior (category, title, description, pricing unit, price cents, quantity, service area, logistics, media readiness inputs) and booking context snapshots where already available. Keep JSON fallbacks only as temporary compatibility for legacy records.
- Why: MVP reliability depends on deterministic booking and checkout behavior. Typed-first reads reduce ambiguity and avoid rebuilding business-critical logic from mutable JSON blobs.
- Impact: Public listing payloads now expose and prioritize canonical typed fields; listing detail, checkout, browse/listing-card pricing/title logic, and booking context enrichment prefer typed/snapshot values first; legacy JSON remains fallback-only to avoid breaking existing listings/drafts.
- Revisit trigger: After Phase 2 snapshot/cleanup, remove remaining JSON alias fallback paths and mirrored compatibility reads for listing/logistics metadata.

---

## [2026-03-19] Promote listing quantity to canonical typed column with temporary JSON mirror compatibility
- Context: Listing quantity was being interpreted from `vendor_listings.listing_data` JSON fields (`quantity`, `availableUnits`, `inventoryQuantity`) across listing detail, checkout, and booking availability checks. This made quantity semantics harder to validate and raised launch risk for booking-capacity enforcement.
- Decision: Add `vendor_listings.quantity` as a first-class typed integer column (`not null`, default `1`), backfill from `listing_data.quantity` via migration, and switch canonical server/client read paths plus booking capacity checks to this typed column. Keep temporary mirrored writes to legacy JSON quantity keys during listing create/update/publish to preserve compatibility while remaining fallback readers are removed.
- Why: Typed quantity as source of truth improves booking-flow reliability and keeps capacity checks deterministic without a risky full JSON cleanup before launch.
- Impact: Existing listings/drafts safely backfill to valid quantity values, booking conflict logic now uses canonical listing quantity, and customer quantity selectors consume typed API quantity first while maintaining fallback compatibility.
- Revisit trigger: Remove JSON quantity mirrors/fallback reads after verifying all listing read/write consumers exclusively use `vendor_listings.quantity` in production.

---

## [2026-03-19] Simplify create-listing to single-listing MVP with quantity-based capacity and checkout logistics totals
- Context: Create listing UX still reflected legacy multi-mode (`single/package/a_la_carte`) behavior, which confused vendors on what one listing represents, how quantity works, and what is included. Customer booking flow also lacked quantity-aware capacity handling and did not include configured logistics fees in checkout totals.
- Decision: Rebuild `CreateListingWizard` into a focused 6-step MVP flow (Listing Basics, Perfect For, Booking & Pricing, Service Area, Logistics, Photos & Videos), remove subcategory from wizard input, standardize listing payload writes around one listing per distinct rentable style/item, and store rental quantity as identical units available. Add quantity selector to listing detail and checkout for multi-unit listings, enforce quantity-aware overlap checks server-side, and include configured delivery/setup/travel-flat fees in booking subtotal and checkout total calculations.
- Why: This keeps launch scope tight while directly improving booking-flow reliability and reducing vendor/customer confusion in the highest-impact listing and checkout surfaces.
- Impact: Vendors now create clearer listings with stronger publish readiness signals; rentals can accept concurrent bookings up to configured quantity; checkout totals reflect applicable logistics fees; booking records persist quantity and fee metadata without schema-breaking changes.
- Revisit trigger: If launch feedback requires full travel-fee automation (per-mile/per-hour) or per-unit logistics fee rules, add explicit distance/time inputs and dedicated canonical fee columns instead of expanding JSON-only inference.

---

## [2026-03-18] Normalize hobbies as tag-style pills while keeping string storage compatibility
- Context: `Hobbies` was freeform text across onboarding/My Hub and rendered as plain paragraph text on Vendor Hub, which made formatting inconsistent and allowed unsupported characters. Existing persisted data stores hobbies in `online_profiles.hobbies` as a string.
- Decision: Introduce shared hobby normalization rules (Title Case words, allow only letters/numbers/spaces/apostrophes, no forced capitalization after apostrophes) and switch onboarding/My Hub hobbies input to tag-style pill entry. Keep persisted storage as a normalized comma-separated string for compatibility, and render vendor-facing hobbies as pills by parsing that string.
- Why: This delivers the requested UX without requiring schema changes or risky data migrations before launch verification.
- Impact: Vendors now add/remove hobbies as pills in onboarding and My Hub, hobby text is sanitized consistently on both client and server saves, and Vendor Hub displays hobbies as pill badges.
- Revisit trigger: If owner profile metadata becomes fully canonicalized in typed columns, migrate hobbies to an explicit text-array field and remove comma-separated compatibility formatting.

---

## [2026-03-15] Phase 1 canonical ownership for onboarding and listing operations
- Context: Pre-launch cleanup required freezing ownership boundaries without attempting full legacy cutover in one pass. Onboarding business identity fields were split across `vendor_accounts`, `vendor_profiles`, and `online_profiles` JSON, while listing operational fields were mostly stored in `vendor_listings.listing_data`.
- Decision: For Phase 1, persist canonical business onboarding fields directly on `vendor_profiles` and canonical listing operational fields directly on `vendor_listings` typed columns. Keep compatibility JSON writes in `online_profiles`/`listing_data` where needed, but treat those as supporting data. Keep runtime schema mutation unchanged in legacy paths for now, but do not add any new runtime schema mutation.
- Why: This creates a launch-ready source-of-truth path for onboarding and listing creation with minimal risk to currently working flows, while avoiding a large cutover/backfill in the same phase.
- Impact: New onboarding submissions and listing draft/publish writes now populate first-class columns for business identity, listing pricing/location/logistics, and instant-book mode. Existing compatibility readers continue working via JSON fallbacks during transition.
- Revisit trigger: Phase 2 should remove compatibility fallback reads/writes, perform targeted backfill, and eliminate runtime schema mutation from remaining legacy paths.

---

## [2026-03-15] Phase 2 canonical checkout CTA/timing snapshots and booking listing linkage
- Context: Checkout and booking creation still leaned on legacy/category inference in key places, while booking/listing linkage and timing/snapshot fields were spread across `booking_items` and fallback logic.
- Decision: Keep the Phase 2 slice narrow and introduce first-class booking columns for `listing_id`, per-day logistics times, and booking snapshot fields. Update listing public payloads and customer pages to prefer canonical listing fields (`instant_book_enabled`, `pricing_unit`, `minimum_hours`) with explicit fallbacks only for older records. Keep `booking_items` writes for compatibility, but persist canonical booking linkage/snapshots directly on `bookings`.
- Why: This locks launch-critical CTA behavior and booking window persistence to typed source-of-truth fields without requiring full legacy cutover.
- Impact: Listing detail now shows `Book Now` vs `Request to Book` from canonical instant-book mode, checkout collects and submits concrete timing inputs for both pricing units, booking inserts persist canonical timing/snapshot/listing-link fields, and availability/sync flows still run on canonical blocked windows while compatibility joins remain intact.
- Revisit trigger: Phase 3 should remove remaining category/JSON fallback paths, finish timezone hardening around vendor-local IANA zones, and migrate read paths away from `booking_items` for listing linkage where safe.

---

## [2026-03-14] Keep vendor bookings visible independent of Google sync and backfill legacy booking sync after calendar selection
- Context: A live vendor account had multiple bookings linked through legacy `booking_items` ownership, but the Vendor Bookings page could still present an empty state while Google backfill also failed because the live database was missing newer booking sync columns expected by the sync helper.
- Decision: Treat vendor booking visibility and Google sync as separate concerns. Make the vendor bookings page refetch on mount and show explicit load errors instead of a silent empty state, expose per-booking Google sync metadata in the vendor bookings API/UI as `Synced` or `Unsynced`, ensure missing booking Google-sync columns exist at runtime, and trigger a best-effort sync of existing bookings immediately after a vendor selects a Google calendar.
- Why: MVP launch priority is reliable vendor booking visibility first. Runtime schema repair plus auto-backfill is the smallest fix that supports legacy data without rewriting listing cards or requiring manual database work before vendors can trust the dashboard.
- Impact: Vendors now see their bookings whether or not Google sync has succeeded, can tell which bookings still need backfill, and newly selected Google calendars immediately attempt to sync existing eligible bookings while preserving the existing manual retry path.
- Revisit trigger: If schema drift continues across environments, replace runtime `alter table ... if not exists` repairs with enforced migrations during deploy and add a background retry job for booking sync.

---

## [2026-03-13] Separate per-day rental logistics window from event timeline, while keeping hourly bookings as one possession window
- Context: Calendar sync and conflict checks need the true blocked possession window, but the checkout flow was only collecting one start/end pair. Product clarified that hourly listings should keep a single booked possession window with better guidance, while per-day instant-book rentals need both event timing and a separate item possession window.
- Decision: Add `event_end_time` to bookings, keep `booking_start_at` / `booking_end_at` as the canonical blocked window, and update checkout so `per_day` instant-book rentals collect event start/end plus needed-by/done-with times. For `per_hour`, keep one start/end range and explicitly guide customers to include setup, takedown, pickup, and delivery buffer in that selected booking window.
- Why: This is the smallest change that makes outbound Google sync use the real possession window without overcomplicating hourly checkout or adding more persistent fields than MVP needs.
- Impact: Per-day rentals can now save actual event timing separately from the blocked rental window, while hourly rentals remain simple and block exactly the selected possession window. Google sync and conflict checks continue to use the canonical booking range.
- Revisit trigger: If vendors need richer logistics scheduling, add first-class setup/pickup/delivery buffer durations or separate hourly event-time fields instead of relying on checkout guidance alone.

---

## [2026-03-13] Treat rental listings as instant-booked and normalize legacy pending rental bookings
- Context: The booking create route was hard-coding every booking to `pending`, which made rental listings appear as request-based jobs in the vendor dashboard even though rental checkout is positioned as `Book Now`. Existing rental bookings already saved as `pending` also needed cleanup so booking state stays reliable for dashboard workflows and calendar sync.
- Decision: Classify booking lifecycle from listing category at booking creation time. Rentals now create `confirmed` bookings immediately, while services, venues, and catering remain `pending`. Also normalize existing `pending` rental bookings to `confirmed` when the vendor bookings feed is loaded.
- Why: Rental inventory is meant to be instant booking for MVP, and status correctness is part of the launch-critical booking flow. Fixing the state in the database is lower risk than teaching the UI to special-case incorrect data.
- Impact: New rental bookings land in the upcoming flow immediately, pending actions remain available only for request-based listing types, and legacy rental bookings stop inflating pending counts once vendors load their booking feed.
- Revisit trigger: If product adds explicit per-listing booking mode controls, move this behavior from category-based inference to a first-class listing setting and backfill bookings from that source of truth.

---

## [2026-03-13] Persist canonical booking blocked-window timestamps for Google sync and future availability
- Context: Booking records previously stored only `event_date` and optional `event_start_time`, while outbound Google sync had to fall back to guessed 1-hour or all-day windows. Hourly listings also had no persisted end time.
- Decision: Add `booking_start_at` and `booking_end_at` directly on `bookings`, compute them during booking creation from listing pricing mode plus checkout inputs, and make Google sync prefer those timestamps over legacy date/time fallbacks.
- Why: Canonical blocked-window timestamps are the smallest reliable foundation for outbound calendar sync now and conflict detection later, without refactoring the broader booking model.
- Impact: Per-day bookings now block full-day ranges, hourly bookings collect and persist same-day start/end times, and Google events mirror the same stored blocked window. Delivery/setup booleans still do not change blocked time because the current product model has no explicit buffer durations.
- Revisit trigger: If product adds multi-day rental checkout, setup/breakdown buffers, or timezone/location-aware scheduling, expand canonical range computation and stop relying on UTC-naive timestamp assumptions.

---

## [2026-03-13] Block same-listing double bookings using canonical booking ranges and matched selected-calendar events
- Context: Canonical booking range timestamps now exist, but booking creation still allowed overlapping reservations for the same listing. Vendors also needed selected Google calendar events to participate in blocking only when confidently tied to that listing.
- Decision: Before creating a booking, check the requested canonical range against existing non-cancelled EventHub bookings for the same `listing_id`, then against normalized events from the vendor’s selected Google calendar. Only block Google events confidently matched to the same listing by exact metadata first, then by clean exact listing-title match; unmatched calendar events remain non-blocking.
- Why: This prevents same-listing double booking with minimal scope while avoiding broad false positives from unrelated calendar activity.
- Impact: Same-listing overlapping bookings now return a clear `409` conflict, different listings may still overlap, and selected-calendar events only block when they map confidently to that listing.
- Revisit trigger: If vendors need manual mapping for unmatched external events or stricter calendar enforcement, add review/reconciliation tooling rather than making unmatched events globally blocking.

---

## [2026-03-13] Fail closed when Google-enabled availability cannot be verified and expose reconciliation state
- Context: Same-listing Google conflict checks were previously fail-open. If a vendor had Google connected with a selected calendar but the Google read failed, booking creation could still proceed as though no Google conflict existed.
- Decision: Treat Google availability checks as three states: `checked`, `skipped`, or `failed`. For vendors with `google_connection_status = connected` and a selected `google_calendar_id`, a Google read failure now blocks booking creation with a non-409 availability-unverifiable response. Also add a vendor-auth reconciliation endpoint that reports bookings with failed sync state, missing Google event ids, or missing events in the selected calendar when that calendar can be read.
- Why: Google-enabled vendors should not silently double book when external calendar verification is broken, and MVP still needs a lightweight debugging surface instead of background jobs.
- Impact: Booking creation now clearly distinguishes EventHub conflicts, matched Google conflicts, and unverifiable Google availability. EventHub-only vendors remain unaffected. Vendors also have an on-demand route to inspect Google sync issues.
- Revisit trigger: If a booking reschedule/edit time path is added, reuse the shared availability helper there; if reconciliation needs to scale, move the checks into background jobs and persisted audit records.

---

## [2026-03-13] Persist manual Google event-to-listing mappings for unmatched selected-calendar events
- Context: Some selected-calendar Google events cannot be confidently matched by EventHub metadata or exact unique title matching, which leaves them non-blocking even when a vendor knows they belong to a specific listing.
- Decision: Add a small `google_calendar_event_mappings` table keyed by vendor account + selected calendar + Google event id, and extend match priority to: EventHub metadata, manual/reviewed mapping, exact unique title match, then unmatched. Expose vendor-auth routes to list unmatched selected-calendar events, save a manual mapping, and clear a mapping.
- Why: A dedicated mapping table is the smallest reliable foundation for review/remapping without overloading bookings or turning all unmatched events into blockers.
- Impact: Vendors can explicitly link unmatched Google events to a listing, and those mapped events now participate in future same-listing conflict checks exactly like other matched Google events.
- Revisit trigger: If this evolves into a polished review workflow, add UI, audit history, and ambiguity handling for bulk mappings instead of expanding the manual route surface ad hoc.

---

## [2026-03-13] Persist per-booking Google sync metadata and sync on booking lifecycle writes
- Context: Google OAuth connection and calendar selection are already working. MVP now needs safe outbound EventHub -> Google booking sync without adding import, blocking, or background reconciliation complexity.
- Decision: Add minimal Google sync metadata directly on `bookings` (`google_event_id`, `google_calendar_id`, `google_sync_status`, `google_last_synced_at`, `google_sync_error`) and trigger Google event create/update/delete inline from booking create, vendor status updates, and refund-driven cancellation. Failures are persisted on the booking record but never block the booking write itself.
- Why: Per-booking metadata is the smallest clean way to prevent duplicate Google events, support updates/deletes against the same Google event, and keep launch-focused visibility into sync failures.
- Impact: New bookings can create one Google event when the vendor is connected and has a selected calendar; later status changes reuse or remove that same event; Google failures stay isolated from core booking reliability.
- Revisit trigger: If vendors need backfill/retry, disconnect handling, or calendar changes to move existing bookings between calendars, add a background reconciliation job and explicit retry controls instead of expanding the inline request path.

---

## [2026-03-12] Convert Vendor Bookings summary ("All" section) to separator-only metrics row
- Context: Product requested removing both the outer summary card outline and inner metric mini-card outlines in Vendor Bookings, leaving only two vertical separators between key metrics.
- Decision: In `VendorBookings`, replace the summary `Card` block with a plain section containing three metric columns and two blue vertical separators (`rgba(74,106,125,0.22)`), while preserving existing summary data logic.
- Why: Matches the new dashboard visual language by reducing boxed containers and emphasizing section dividers.
- Impact: The Bookings summary row now renders without card borders and uses only two vertical separators between metric groups.
- Revisit trigger: If mobile needs explicit separators in stacked layout, add breakpoint-specific horizontal separators for small screens.

## [2026-03-12] Apply dashboard-wide blue border parity across vendor/customer tab cards
- Context: Product approved rolling the vendor dashboard blue-divider card treatment across the rest of vendor/customer dashboard tabs.
- Decision: Add a `swap-dashboard-whites` scoped border rule in `index.css` so dashboard cards and rounded bordered row blocks use `rgba(74,106,125,0.22)` consistently; exempt intentional setup-highlight cards with `dashboard-setup-card`. Also ensure legacy dashboard pages (`VendorAccount`, `VendorCalendar`) run inside `swap-dashboard-whites` so they inherit the same rules.
- Why: A scoped stylesheet rollout delivers consistent border color treatment across many dashboard tabs without risky page-by-page rewrites.
- Impact: Vendor/customer dashboard cards and bordered list rows now use the same blue as dashboard separators; setup-highlight cards keep their special styling.
- Revisit trigger: If you want full separator-only structure (no card outlines) across all tabs, do a second pass with per-page layout refactors using the vendor dashboard section pattern.

## [2026-03-12] Match vendor Recent Activity row outlines to dashboard separator blue in all themes
- Context: Product requested Recent Activity row card outlines on vendor dashboard match the blue horizontal separator color in both light and dark mode.
- Decision: In `VendorDashboard`, set Recent Activity row border class to explicit `border-[rgba(74,106,125,0.22)]` instead of theme token `border`.
- Why: Explicit rgba ensures exact color parity with the existing separator lines regardless of theme token differences.
- Impact: Vendor dashboard Recent Activity row outlines now visually match horizontal separators in both light and dark mode.
- Revisit trigger: If dashboard border color becomes tokenized centrally, replace explicit rgba with one shared semantic divider token.

## [2026-03-12] Add divider below Quick Actions and remove Profile Details card outline on vendor dashboard
- Context: Product requested a horizontal divider after `Quick Actions` and no outlined card container around `Profile Details`.
- Decision: In `VendorDashboard`, add one blue section divider directly below `Quick Actions` and convert `Profile Details` from `Card` wrapper to a plain section container while preserving its internal form content and spacing.
- Why: Aligns `Profile Details` with the new separator-driven layout system and keeps section boundaries explicit without extra boxed styling.
- Impact: Vendor dashboard now shows a divider under quick actions; profile details no longer has a rounded card border.
- Revisit trigger: If full dashboard standardization is approved, apply the same non-card section treatment to remaining profile/config modules across vendor/customer tabs.

## [2026-03-12] Remove horizontal separators immediately above and below vendor setup callout
- Context: Product requested no horizontal divider line directly above or below the `Complete Your Setup` section while keeping the setup box outline.
- Decision: In `VendorDashboard`, suppress the pre-setup divider when setup is visible and remove the post-setup divider inside the setup conditional block.
- Why: Keeps the setup callout visually distinct without sandwiching it between section separator lines.
- Impact: When setup is incomplete, the setup card appears without adjacent horizontal separators; when setup is complete (card hidden), the normal blue separator between stats and recent activity still renders.
- Revisit trigger: If section separator rhythm should stay uniform regardless of temporary callouts, reintroduce a single divider below setup only.

## [2026-03-12] Keep vendor dashboard stat-row vertical separators blue regardless of setup state
- Context: Product requested the short vertical separators between top stat blocks stay blue and not switch to gold when `Complete Your Setup` is visible.
- Decision: In `VendorDashboard`, make `dashboardDividerBgClass` always `bg-[rgba(74,106,125,0.22)]` while leaving setup-card border styling unchanged.
- Why: Keeps separator system visually consistent with global dashboard divider color while preserving setup-card highlight treatment.
- Impact: Both horizontal and vertical section separators now stay blue in vendor dashboard.
- Revisit trigger: If separator color state should vary by alert level in future, introduce explicit per-section divider tokens rather than coupling to setup visibility.

## [2026-03-12] Keep vendor dashboard horizontal separators blue even when setup card is visible
- Context: Product requested removing the yellow/gold horizontal separator lines around the temporary `Complete Your Setup` section.
- Decision: In `VendorDashboard`, set horizontal separator color to blue (`rgba(74,106,125,0.22)`) unconditionally, while keeping setup-card highlight styling unchanged.
- Why: Preserves the requested section emphasis on the setup card itself without tinting global section dividers.
- Impact: Horizontal section dividers now stay blue regardless of setup completion state.
- Revisit trigger: If full separator theming should be state-based later, split vertical/horizontal divider tokens into shared dashboard design tokens.

## [2026-03-12] Pilot vendor dashboard section separators with dynamic gold/blue divider color
- Context: Product requested replacing card outlines (for top dashboard blocks) with explicit vertical and horizontal separators, including gold divider behavior while the temporary setup section is visible and blue dividers once setup is complete.
- Decision: In `VendorDashboard`, convert stats/recent/quick top sections to plain section layouts, add two short vertical separators between the three stats blocks, and add horizontal separators between stats/setup/recent/quick. Use a shared conditional divider color token: gold (`hsl(var(--secondary-accent)/0.45)`) while setup is incomplete, blue (`rgba(74,106,125,0.22)`) when setup is complete.
- Why: This creates the requested visual hierarchy without changing booking data behavior and provides a reusable pattern for expansion to other vendor/customer dashboard tabs.
- Impact: Vendor dashboard now shows separator-driven layout in the requested top sections; setup state automatically changes separator color behavior.
- Revisit trigger: If this style is approved for rollout, apply the same separator component/classes across remaining vendor dashboard sections and customer dashboard tabs.

## [2026-03-12] Unify dashboard header and sidebar divider color across vendor/customer shells
- Context: Product requested the top horizontal dashboard divider line match the left sidebar vertical divider color on vendor and customer dashboard tabs.
- Decision: Set dashboard header borders to `border-[rgba(74,106,125,0.22)]` in shared and standalone dashboard shells (`VendorShell`, `CustomerDashboard`, `VendorAccount`, `VendorCalendar`, `VendorListingEdit`) and set customer sidebar container border to the same color in `customer-sidebar`.
- Why: Using one explicit divider token removes line-color mismatches and keeps dashboard framing consistent as icon-only sidebar patterns expand.
- Impact: Vendor and customer dashboard tabs now render matching horizontal/vertical divider color with the same `rgba(74,106,125,0.22)` value.
- Revisit trigger: If divider tokens are centralized in a design system, replace hardcoded rgba classes with a shared semantic border token.

## [2026-03-12] Enlarge and center vendor icon-rail navigation with wider sidebar and fixed hover labels
- Context: Product requested the 8 vendor sidebar navigation controls be centered, approximately 30% larger, the sidebar widened to fit, hover labels restored, and sidebar surface set to `#f0eee9`.
- Decision: Update `vendor-sidebar` to center nav items, increase nav button size from `44px` to `56px` and icon size from `20px` to `26px`, force sidebar background to `#f0eee9`, and adjust overflow/z-index so hover labels render beyond the rail; increase vendor sidebar width tokens from `4.75rem` to `6rem` in `VendorShell`, `VendorAccount`, `VendorCalendar`, and `VendorListingEdit`.
- Why: A single shared sidebar/component update plus consistent width tokens across vendor wrappers ensures the requested visual scale and behavior is consistent on all vendor surfaces.
- Impact: Vendor icon rail now has larger centered controls, wider rail spacing, visible hover labels, and a unified `#f0eee9` sidebar background.
- Revisit trigger: If navigation density feels too tall on shorter screens, keep centered alignment but reduce inter-button gap before shrinking button/icon sizes.

## [2026-03-12] Restore EventHub wordmark in vendor shell header top-left
- Context: Product requested adding the EventHub logo back to the top-left area of the vendor header after recent layout simplification.
- Decision: In `VendorShell`, add a left-aligned home link rendering `BrandWordmark` with brand colors and keep account/back controls right-aligned.
- Why: Restores expected brand anchor in the header while preserving the full-width header divider and sidebar-below-header structure.
- Impact: Vendor pages now show the EventHub wordmark in the header’s top-left and keep existing right-side actions unchanged.
- Revisit trigger: If vendor shell needs different branding than marketplace nav, swap to a vendor-specific logo token/component.

## [2026-03-12] Make vendor header divider full-width and start icon rail below it
- Context: Product requested the vendor portal's horizontal header line run across the full screen, with the left icon rail beginning below that line; they also requested removing the sidebar collapse icon from the header.
- Decision: In `VendorShell`, switch page structure from side-by-side `sidebar + header/content` to `full-width header` above a `sidebar + content` row, keep the header `border-b` as the shared divider, and remove `SidebarTrigger` from the header.
- Why: This directly matches the requested visual hierarchy (header first, rail second) while keeping existing nav routes and dashboard content behavior unchanged.
- Impact: The left sidebar now ends at the header divider and all eight nav controls render below it; the divider spans the entire viewport width; the top-left collapse icon is removed.
- Revisit trigger: If vendors need quick sidebar hide/show for narrow screens, add a separate mobile-only toggle pattern that does not reintroduce the desktop header icon.

## [2026-03-12] Switch vendor portal sidebar to icon-only rail with hover labels
- Context: Product requested Pinterest-style vendor navigation where only icons are visible in the left rail and tab names appear on hover.
- Decision: Update `vendor-sidebar` to render icon-only nav buttons (Dashboard/Bookings/Listings/Messages/Payments/Reviews/Notifications/My Hub), show a right-side hover label tooltip for each item, and keep active-state styling on the selected icon. Shrink vendor sidebar widths to `4.75rem` in vendor portal wrappers (`VendorShell`, `VendorAccount`, `VendorCalendar`, `VendorListingEdit`) to remove empty sidebar space.
- Why: Keeps vendor portal navigation visually consistent with the requested Pinterest-inspired interaction while preserving existing routes and click targets.
- Impact: Vendor portal pages now show a compact icon rail; labels are revealed on hover; content area gains more horizontal space.
- Revisit trigger: If users need persistent labels for accessibility, add a settings toggle for compact vs labeled vendor navigation.

## [2026-03-12] Standardize landing header + background light surface to #f0eee9
- Context: Product requested the landing header and landing page background use the same exact light color value to remove any visible seam.
- Decision: Update `Navigation` light-mode base background from `#f5f0e8` to `#f0eee9`; landing page background already uses `#f0eee9`.
- Why: Exact token match avoids subtle contrast seams between adjacent sticky header and page surfaces.
- Impact: Header and landing background now share the same light surface color (`#f0eee9`).
- Revisit trigger: If a design-token system is introduced, move this hardcoded color into one shared semantic surface token.

## [2026-03-12] Increase primary nav link emphasis for dashboard/event shortcuts
- Context: Product requested `Vendor Dashboard` and `My Events` links be bolder and 10% larger, with customer `My Events` matching the same size.
- Decision: Update shared `navActionButtonClass` in `Navigation` to `text-[1.11rem]` and `font-bold` (from `text-[1.01rem]` and `font-medium`).
- Why: Those links already share one class, so one style change keeps vendor and customer variants visually consistent.
- Impact: Vendor Dashboard and My Events nav links now render bolder and ~10% larger for both vendor and customer contexts.
- Revisit trigger: If nav crowding appears at smaller widths, keep weight but reduce size slightly with breakpoint-specific text classes.

## [2026-03-12] Remove landing-page nav bottom divider while preserving sticky header
- Context: Product requested removing the horizontal line under the header on the landing page only, with no change to sticky behavior.
- Decision: In `Home`, pass `showBottomBorder={false}` to `Navigation`.
- Why: Reuses existing scoped nav-border control and keeps behavior unchanged outside landing.
- Impact: Landing header remains sticky at top but no longer shows the bottom divider line.
- Revisit trigger: If all pages should adopt this borderless header style, flip `Navigation` default or apply the prop consistently across routes.

## [2026-03-12] Match Browse listing grid spacing behavior to Landing with 5-column desktop target
- Context: Product requested Browse use the same card layout/spacing behavior as Landing and called out extra edge gutter behavior on Browse.
- Decision: In `BrowseVendors`, align card width tokens to Landing (`minCardWidthPx=240`, `cardMaxWidthPx=290`, `singleColumnCardMaxWidthPx=340`) and keep `maxColumns=5` when filters are closed (`4` when open). Also remove the hidden-sidebar desktop gap by switching flex gap to `lg:gap-0` when filters are closed.
- Why: Matching the same width tokens and removing the collapsed-sidebar gutter produces the same effective density model as Landing while preserving filter-panel behavior.
- Impact: Browse now uses Landing-equivalent spacing inputs and can fit 5 cards per row at full desktop widths with reduced edge/gap drift.
- Revisit trigger: If Browse still feels denser/looser than Landing after QA, unify remaining page-shell paddings and listing container widths under shared layout tokens.

## [2026-03-12] Match Browse nav surface background to page surface to remove header/tag seam
- Context: Product reported a faint horizontal seam between top nav/search area and the tag rail in Browse.
- Decision: Add optional `surfaceClassName` to `Navigation` and pass Browse `browseSurfaceClass` to it so nav and header extension share the exact same background token.
- Why: Eliminates visible color-step lines caused by close-but-different background hex values across adjacent header blocks.
- Impact: Browse header/search/tag area now blends into one continuous surface with no faint dividing seam.
- Revisit trigger: If a global nav theme system is introduced, replace per-page surface overrides with shared semantic surface tokens.

## [2026-03-12] Add uniform top-row vertical padding around browse nav search lane
- Context: Product requested visible space above and below the search bar while ensuring left logo and right controls shift down by the same amount.
- Decision: In `Navigation`, change the top row wrapper from fixed `h-16` to `min-h-16` with `py-2`, so all row content (logo, middle search, right controls) receives equal vertical offset.
- Why: Row-level padding preserves alignment across all top-row elements and avoids one-off offsets on only the search field.
- Impact: Search no longer appears pressed to the top edge; there is balanced spacing above and below the search lane across the full header row.
- Revisit trigger: If compact header density is needed on smaller screens, keep desktop padding and apply a reduced mobile `py` value.

## [2026-03-12] Place browse search bar in nav middle lane and pull tag rail upward with preserved gap
- Context: Product requested the browse search bar live between the EventHub logo and the light/dark toggle area, while keeping all non-search controls unchanged and maintaining the same search-to-tags spacing.
- Decision: Add optional `middleContent` support to `Navigation` and mount Browse search input there; keep tags in `headerContent` but reduce top padding so the visual gap from search bottom to tag/filter rail stays consistent.
- Why: This satisfies the structural/header requirement and layout constraint without moving logo, theme toggle, account controls, or changing control sizes.
- Impact: Browse search now sits in the top nav row between left and right nav clusters; tag/filter pills are raised accordingly with preserved vertical rhythm.
- Revisit trigger: If other pages need center-lane search, extract a shared nav-search slot component with page-specific sizing tokens.

## [2026-03-12] Support browse header extension content in Navigation and mount search/tag rail there
- Context: Product requested the Browse search bar and tag pills be part of the header while keeping their current visual position.
- Decision: Add optional `headerContent` support to `Navigation` and pass the Browse search + top tag rail block through that slot instead of rendering it inside the page body.
- Why: This keeps the existing spacing/layout appearance while making those controls structurally part of the header.
- Impact: Browse search and tags now render under the main nav row inside the header container, with unchanged interaction behavior.
- Revisit trigger: If other pages need similar header-mounted controls, formalize slot variants (compact/standard) for reuse.

## [2026-03-12] Allow per-page nav bottom border control and hide it on Browse
- Context: Product requested removing the horizontal divider between the header and search bar on the Browse page.
- Decision: Add an optional `showBottomBorder` prop to `Navigation` (default `true`) and pass `showBottomBorder={false}` from `BrowseVendors`.
- Why: This removes the divider where requested without changing header styling globally across other pages.
- Impact: Browse no longer shows the nav bottom line; other routes keep the existing header divider.
- Revisit trigger: If the no-divider style should become global, remove the prop and apply the borderless nav style everywhere.

## [2026-03-12] Normalize top-rail filter/tag pill heights for flush alignment
- Context: Product requested the filter pill top and bottom edges line up exactly with the top and bottom of the tag pills.
- Decision: In `BrowseVendors`, keep both controls at the same fixed height (`58px`) and remove extra bottom padding from the horizontal tag rail wrapper.
- Why: Equal control heights plus no wrapper offset produces a flush visual baseline across the rail.
- Impact: Top browse filter pill and tag pills now align on the same top and bottom edges.
- Revisit trigger: If horizontal scrollbars overlap content on specific browsers, reintroduce minimal scrollbar spacing with a matching offset strategy on the filter pill.

## [2026-03-12] Increase browse search-bar text size to 1.5x while preserving input height
- Context: Product requested rolling back the prior 2x increase and setting browse search placeholder + typed text to 1.5x without changing the search input box size.
- Decision: In `BrowseVendors`, set search input text size to `1.725rem` (1.5x of the original `1.15rem`) and apply the same size to placeholder text, while keeping the existing `h-[56px]` input height unchanged.
- Why: Keeps stronger search emphasis while preventing the oversized text feel from the 2x variant.
- Impact: Browse top search text and placeholder now render 1.5x larger in the same input box footprint.
- Revisit trigger: If larger text clips at smaller breakpoints, keep desktop at 2x and apply a reduced mobile size token.

## [2026-03-12] Keep "Other" event-type filter pill at end of list
- Context: Product requested the `Other` event-type pill appear last in the filter pill set for clearer scan order.
- Decision: In `BrowseVendors`, keep normal alphabetical ordering for event types but post-process to move any `Other` label(s) to the end.
- Why: Preserves predictable sorting while matching UX expectation that `Other` behaves as a catch-all final option.
- Impact: Event-type pills now always render with `Other` at the end.
- Revisit trigger: If event-type ordering becomes curated/manual, replace this rule with an explicit ordering config.

## [2026-03-12] Use Pinterest-style side pop-out filters with grid column reduction when open
- Context: Product requested Browse filters to pop out from the side (not dropdown) and for listing cards to reflow from denser layout to fewer columns when filters are visible.
- Decision: Replace the filter-pill dropdown behavior with a left side panel toggled by the top filter pill, keep Sort + Filters + bottom actions (`Clear filters`, `Apply filters`) inside that panel, and set listing masonry `maxColumns` to `4` when closed and `3` when open.
- Why: Matches requested Pinterest interaction and creates visible “content shifts to fewer columns” behavior when filter controls occupy horizontal space.
- Impact: Browse now animates a side filter panel in/out and listing cards reflow to a lower column count while panel is open.
- Revisit trigger: If users prefer filtering without layout shift on smaller screens, keep side panel on desktop and switch to overlay mode on mobile only.

## [2026-03-12] Replace browse sidebar filters with filter-pill popover dropdown and bottom actions
- Context: Product requested sort/filter controls to appear as a dropdown from the top filter pill instead of a persistent left sidebar.
- Decision: Move `Sort` and `Filters` controls into a `Popover` opened by the filter pill in `BrowseVendors`, remove the standalone sidebar filter cards, and add bottom `Clear filters` + `Apply filters` actions in the dropdown.
- Why: Aligns interaction model with the new top rail controls and reduces layout clutter while keeping existing filtering logic and URL sync.
- Impact: Browse now has one filter entry point in the pill row; controls are available in the dropdown; listings use full content width.
- Revisit trigger: If users need simultaneous visibility of filters and results for power use-cases, add an optional pinned-filter mode in addition to popover mode.

## [2026-03-12] Style browse tag pills with brand-gradient themes and in-palette contrast text
- Context: Product requested tag pills to use gradient styling based on EventHub's existing palette, with contrasting text still drawn from the same color family.
- Decision: In `BrowseVendors`, replace flat pill fills with rotating brand-gradient themes for unselected tags and stronger gradient themes for selected tags, using `#2a3a42` or `#f5f0e8` text for contrast.
- Why: Keeps pill controls visually rich and on-brand while maintaining readability and clear selected-state affordance.
- Impact: Top tag rail now shows Pinterest-like themed gradient pills with improved visual hierarchy and consistent brand color usage.
- Revisit trigger: If accessibility checks flag low contrast on specific gradients, keep gradients but tighten specific stop colors to pass target contrast thresholds.

## [2026-03-12] Add top tag-rail filter toggle pill to match Pinterest-like browse controls
- Context: Product requested a filter control on the left of the horizontal tag pills, styled as a matching pill with icon.
- Decision: In `BrowseVendors`, add a left-aligned icon pill (`SlidersHorizontal`) before the tag pills and wire it to existing `showFilters` state so it toggles filter-panel visibility behavior.
- Why: Keeps control affordances consistent with the new pill-based tag UI and matches the requested Pinterest-inspired top rail.
- Impact: Users now see a filter icon pill at the start of the tag row and can use it to toggle filters from the same horizontal control cluster.
- Revisit trigger: If desktop behavior should fully collapse/expand the sidebar (not just mobile), move sidebar visibility from breakpoint-forced CSS to explicit toggle state across breakpoints.

## [2026-03-12] Simplify browse header to one primary search bar and remove listing headline copy
- Context: Product requested a cleaner Pinterest-style top section with one dominant search field and no redundant heading/subtitle copy.
- Decision: In `BrowseVendors`, remove the dynamic heading (`All Listings`/category label) and subtitle text, remove the top category dropdown, and render a single full-width search input as the primary header control.
- Why: Reduces visual noise and prioritizes search-first browsing behavior.
- Impact: Browse now starts with one large search bar; filter state and URL-driven category filtering continue to work in the background.
- Revisit trigger: If users need explicit category switching at top-level again, reintroduce as compact chips adjacent to the search bar (not a secondary dropdown row).

## [2026-03-12] Move browse tag filtering to a top horizontal pill rail
- Context: Tag filtering was buried in the left filter card as vertical checkboxes, but product requested a Pinterest-style horizontal tag experience.
- Decision: Render available tags as a top horizontal, scrollable pill rail in `BrowseVendors`; pills toggle selection state and drive the same `selectedTags` query/filter logic; remove the redundant sidebar tag checkbox list.
- Why: Increases tag discoverability and makes quick multi-tag toggling faster on both desktop and mobile without changing backend behavior.
- Impact: Tags now appear across the top as pills with selected/unselected states while URL sync and filtering behavior remain unchanged.
- Revisit trigger: If tag count grows too large for usability, add grouping or a compact "More tags" drawer while keeping pill interaction for primary tags.

## [2026-03-12] Simplify listing Delivery/Setup wizard branching and clarify browse yes/no toggles
- Context: Product required simpler vendor input flow for setup/delivery pricing and clearer customer filter semantics for setup/delivery inclusion.
- Decision: In Create Listing step 5, use this branch order: setup required yes/no -> setup charge yes/no -> amount; pickup-only vs deliver -> delivery charge yes/no -> amount. In Browse filters, keep existing boolean logic but explicitly label toggles with yes/no state copy (`Yes` = included-only, `No` = show all).
- Why: Reduces vendor confusion during listing creation and makes customer filtering behavior obvious without changing backend contracts.
- Impact: Listing data still writes to the same fields (`deliverySetup.setupIncluded/setupFeeEnabled/setupFeeAmount` and `deliverySetup.deliveryIncluded/deliveryFeeEnabled/deliveryFeeAmount`), while the UI now matches the requested question flow and filter expectations.
- Revisit trigger: If vendors need separate pickup-fee or delivery-fee types (flat vs per-mile), split amount fields and add explicit fee-type controls.

## [2026-03-12] Make Hero category selectable and wire Browse category filtering to listing-level data
- Context: Landing Hero category UI was hardcoded to "Rentals" and search always forced `category=rentals`, so vendors/customers could not browse Services/Venues/Catering from Hero.
- Decision: Replace Hero category text with a `Select` dropdown (Rentals/Services/Venues/Catering), pass selected category in browse query params, and apply category filtering in `BrowseVendors` using listing-level category values with tolerant normalization.
- Why: Aligns Hero UX with marketplace category model and ensures query parameters actually affect browse results.
- Impact: Category can now be selected in Hero and Browse top filter; `/browse?category=...` now filters results by listing-level classification.
- Revisit trigger: If category taxonomy expands, move option values to shared constants and update normalization mapping in one place.

## [2026-03-12] Require explicit listing category for publish and auto-inactivate active listings missing category
- Context: Listings could still publish/live without an explicit listing-level `category` because legacy service-type fallbacks were filling classification implicitly.
- Decision: Enforce category as an explicit listing field at publish-time (no legacy fallback for publish gating), keep subcategory optional, add category input to create/edit listing forms, and auto-move active listings without category to `inactive` during publish-gate reconciliation.
- Why: This keeps listing classification intentionally listing-owned and prevents implicit vendor/profile-level classification from bypassing publish requirements.
- Impact: Listings cannot publish until category is selected; existing live listings missing category are hidden until updated; vendor UI now surfaces category as a required publish field and subcategory as optional text.
- Revisit trigger: If vendor friction is high for legacy inventory updates, add a one-time admin-assisted backfill tool (not automatic runtime fallback).

## [2026-03-10] Use active-profile context for vendor data while keeping authentication account-scoped
- Context: Vendor profile edits, listings, bookings, and dashboard data were keyed to `vendor_accounts` with 1:1 profile assumptions, which blocked multi-profile workflows and caused profile edits (for example, business name) to overwrite account-level identity.
- Decision: Introduce active profile context (`vendor_accounts.active_profile_id`) and profile-level ownership (`vendor_profiles.profile_name`, `bookings.vendor_profile_id`) while keeping auth/session tokens account-scoped; route reads/writes for vendor profile, listings, stats, bookings, payments, and public shop now resolve the active profile and persist profile edits in `vendor_profiles`/`onlineProfiles`.
- Why: This preserves a single login/session per account, isolates business data per profile, and avoids a disruptive auth rewrite during MVP launch preparation.
- Impact: Vendor dashboard and My Hub profile saves are now profile-scoped; vendors can create/switch profiles under one account; booking/listing/payments/stats responses are filtered to active profile context with legacy-row backfills to keep existing data usable.
- Revisit trigger: If collaborative multi-user profile access or per-profile payout accounts become launch-critical, add a membership table and explicit profile-scoped role/permissions model.

## [2026-03-10] Enforce Title Case for listing titles and tags across UI and listing APIs
- Context: Vendors could still type all-caps tags and lowercase-starting title words in some listing flows, and legacy saved data could bypass UI-only normalization.
- Decision: Normalize listing titles and tag text to Title Case in Create Listing and Vendor Listing Edit inputs, and enforce the same normalization server-side on listing create/update/publish payloads (including legacy `perPropDetails` and `tagsByPropType` data).
- Why: Keeps marketplace text presentation consistent and prevents invalid capitalization from entering or persisting in listing data.
- Impact: Title words now auto-format to `Upper + lower` casing, tags no longer persist as all caps, and existing legacy values are corrected when listings are saved or published.
- Revisit trigger: If vendor feedback requests preserving stylized brand casing, add an allowlist path for approved brand tokens while keeping default Title Case normalization.

## [2026-03-10] Raise listing-description cap to 1000 chars across create/edit with backend enforcement
- Context: Listing description inputs were capped at 300 characters, and the product requirement changed to allow up to 1000 characters for both listing-level and a la carte per-item descriptions.
- Decision: Update create-listing and vendor-edit description inputs/helpers to `1000` chars and add server-side clamping in `server/routes.ts` for `listingDescription` and `perPropDetails[*].description` on create/update/publish payload handling.
- Why: A frontend-only change can be bypassed by stale data or direct API calls; backend clamping guarantees a hard cap while keeping UI copy consistent.
- Impact: Description fields now enforce a 1000-character maximum in the Create Listing wizard and Vendor Listing Edit page, helper text reads `Max 1000 chars.`, and persisted listing data is normalized to the same limit.
- Revisit trigger: If moderation or search-ranking signals indicate long descriptions hurt conversion quality, adjust the cap with matched UI + server constants.

## [2026-03-10] Allow special characters in create-listing description fields
- Context: Listing description inputs were stripping special characters during typing, which prevented vendors from using normal punctuation and expressive text in listing copy.
- Decision: In `client/src/features/vendor/create-listing/CreateListingWizard.tsx`, remove regex-based special-character filtering from both listing-level and per-item description handlers while keeping the 300-character cap.
- Why: Description text should preserve vendor intent; character-limit enforcement is sufficient without destructive input sanitization.
- Impact: Vendors can now enter and save special characters in create-listing descriptions, and helper text now reflects only the 300-character limit.
- Revisit trigger: If moderation/safety requirements tighten, add explicit server-side validation rules rather than client-side stripping.

## [2026-03-10] Re-center Create Listing wizard step containers with shared wrapper classes
- Context: Create Listing step content (including the Listing Details card) appeared left-anchored after layout drift because step wrappers used `max-w-3xl` without horizontal centering.
- Decision: In `client/src/features/vendor/create-listing/CreateListingWizard.tsx`, update all step container and footer-nav wrappers from `max-w-3xl ...` to `mx-auto w-full max-w-3xl ...`.
- Why: Applying centering in shared step wrappers restores consistent alignment across all wizard sections with one low-risk change and no card-size redesign.
- Impact: Title & Description and all other wizard section boxes now render centered in the main panel on desktop/tablet while preserving mobile width behavior.
- Revisit trigger: If a future wizard redesign requires asymmetric layouts, replace shared centering wrappers with per-step layout variants.

## [2026-03-10] Enforce 3-photo minimum for active listings with automatic inactivation
- Context: Product requires that listings cannot be published/live unless they include enough photos for marketplace-quality presentation, and existing active listings that fail this must be automatically hidden.
- Decision: Add a publish gate requiring at least 3 photos in `server/routes.ts`, auto-inactivate active listings that violate publish compliance during startup/reconciliation and listing updates, and update vendor publish UI messaging/disabled states to match the backend rule.
- Why: Keeps live inventory quality consistent without relying on manual moderation and prevents under-populated galleries from reaching customers.
- Impact: Vendors cannot publish with fewer than 3 photos; existing active listings below this threshold are automatically moved to inactive until compliant.
- Revisit trigger: If launch metrics show significant vendor friction from the hard threshold, revisit with guided photo onboarding while keeping backend enforcement.

## [2026-03-10] Use fixed-height adaptive marketplace gallery templates on listing detail
- Context: Listing detail preview photos could become visually broken when listings had only 1-2 images, with tall images dominating above-the-fold space and creating misaligned collage blocks.
- Decision: In `client/src/pages/ListingDetail.tsx`, replace preview behavior with photo-count templates (1: full-width hero, 2-4: split hero + right stack, 5+: marketplace grid), enforce one shared gallery height cap (`h-[60vh] min-h-[320px] max-h-[520px]`), and render preview tiles with `object-cover` inside `overflow-hidden` wrappers.
- Why: Keeps gallery quality independent of photo count, prevents runaway vertical image growth, and produces a consistent premium layout similar to marketplace galleries.
- Impact: Listing detail gallery now remains bounded, aligned, and visually consistent across photo counts while preserving existing "Show all photos" modal behavior.
- Revisit trigger: If photo crop complaints increase for specific categories, keep the same height bounds but tune per-template slot ratios or integrate optional focal-point controls.

## [2026-03-09] Match listing-detail photo whitespace/gaps to page background color
- Context: After switching listing-detail photos to `object-contain`, unused image area and inter-photo gaps still showed as muted/white blocks due `bg-muted` wrappers.
- Decision: In `client/src/pages/ListingDetail.tsx`, remove muted backgrounds from preview wrappers and set full-gallery figure background to `bg-background` so whitespace behind and between photos visually matches the page surface.
- Why: Keeps full-photo visibility while avoiding visually distracting white tiles between contained images.
- Impact: Listing-detail photo collage and gallery now blend with the page background instead of showing contrasting white/muted blocks.
- Revisit trigger: If contrast/readability issues appear in dark mode, switch to a dedicated neutral token tuned per theme.

## [2026-03-09] Use static responsive max-height classes and no-crop rendering for listing detail photos
- Context: Listing detail photo cap changes were not visible because Tailwind class generation can miss interpolated arbitrary-value class strings, and preview/gallery images were still set to `object-cover` which crops content.
- Decision: In `client/src/pages/ListingDetail.tsx`, replace interpolated cap class construction with a literal static class (`max-h-[min(26vh,380px)] md:max-h-[min(34vh,380px)]`) and switch preview/gallery image rendering from `object-cover` to `object-contain`.
- Why: Literal class tokens compile reliably in Tailwind, and `object-contain` guarantees full-photo visibility without cropping while preserving each image's aspect ratio.
- Impact: Listing detail photos now render with a smaller responsive cap and show full image content in both preview collage and full gallery.
- Revisit trigger: If letterboxing feels too heavy in preview tiles, tune cap values or use mixed contain/cover behavior by section.

## [2026-03-09] Reduce listing detail preview photo max-height caps by 50%
- Context: Initial listing-detail preview cap still felt visually tall in practice and continued to dominate above-the-fold space.
- Decision: In `client/src/pages/ListingDetail.tsx`, retune preview max-height constants from `52vh/68vh/760px` to `26vh/34vh/380px`.
- Why: Halving the cap keeps listing context, pricing, and booking controls visible sooner while preserving existing aspect-ratio and object-position rendering behavior.
- Impact: Listing-detail preview collage now renders at roughly half prior maximum height across mobile and desktop.
- Revisit trigger: If previews feel too compressed for certain listing image ratios, increment mobile/desktop `vh` values in small steps while keeping hard-cap discipline.

## [2026-03-09] Cap listing detail preview photo collage height while keeping vendor photo aspect/framing behavior
- Context: Listing detail top photo collage could render excessively tall on large viewports, pushing core booking information below the fold.
- Decision: In `client/src/pages/ListingDetail.tsx`, add shared preview max-height tokens (`52vh` mobile, `68vh` desktop, hard cap `760px`) and apply one shared class to one-photo, mobile, and desktop preview collage cover blocks.
- Why: A global cap on preview height keeps listing detail above-the-fold balance consistent while preserving existing aspect ratio + crop/object-position behavior vendors configured.
- Impact: Listing detail photos no longer grow unbounded on wide screens; preview remains responsive and visually stable across breakpoints.
- Revisit trigger: If preview feels too short/tall during QA, tune the three constants in `ListingDetail.tsx` without changing gallery structure.

## [2026-03-09] Reduce nav Login / Sign up button footprint by ~50% while preserving label text size
- Context: The pink Login / Sign up CTA in top navigation appeared oversized; product requested at least a half-size area reduction but to keep the label text size unchanged.
- Decision: In `client/src/components/Navigation.tsx`, reduce only button container dimensions (`h`, `min-w`, `padding`, `radius`) from the logged-out nav CTA and keep text class at `text-[1.15rem]`.
- Why: Adjusting container footprint without reducing typography preserves readability while making the button proportionally smaller and cleaner.
- Impact: Login / Sign up pink area is approximately half the previous size everywhere Navigation renders, with the same label text size and unchanged CTA color treatment.
- Revisit trigger: If text starts to feel cramped at narrow widths/localized strings, increase horizontal padding slightly while keeping the reduced height.

## [2026-03-09] Anchor Hero Event Type dropdown inside field container to avoid zoom/portal offset
- Context: On Home hero search, Event Type options could appear detached (offset above/right) because the hero search bar is rendered with `zoom: 0.7` while select content was portaled to `body`.
- Decision: Extend shared `SelectContent` with optional `disablePortal` support and apply it only to Hero Event Type `SelectContent` in `client/src/components/Hero.tsx`, keeping `position="popper"` with bottom-start alignment and trigger-width sizing.
- Why: Rendering content in the same coordinate space as the trigger avoids portal/zoom mismatch and keeps positioning anchored to the Event Type field.
- Impact: Event Type dropdown now opens directly below and aligned to the Hero Event Type section, remains visually attached, and still overlays surrounding content via z-index.
- Revisit trigger: If any clipping appears inside the hero container on very small screens, introduce a mobile-only fallback that keeps local anchoring while adjusting max-height.

## [2026-03-09] Reduce Home/Browse listing title and price overrides by 10%
- Context: Home and Browse listing cards needed a slightly lighter text footprint while preserving the recent page-scoped sizing system and leaving other listing surfaces unchanged.
- Decision: Decrease Home/Browse-only `ListingCard` override clamps by 10% in `client/src/pages/Home.tsx` and `client/src/pages/BrowseVendors.tsx` for both title and price classes.
- Why: Page-scoped class adjustments provide precise visual tuning without changing shared `ListingCard` defaults or affecting Vendor Listings and other routes.
- Impact: Titles and prices under listing cards on Home and Browse render slightly smaller, improving balance against card media while preserving the same responsive behavior.
- Revisit trigger: If readability drops at smaller breakpoints, bump the minimum clamp values only (keep max values unchanged).

## [2026-03-09] Force Hero Event Type dropdown to open directly below trigger
- Context: On landing hero search, Event Type select content could appear offset above/right of its trigger, which felt detached from the field interaction.
- Decision: In `client/src/components/Hero.tsx`, set Event Type `SelectContent` to `position="popper"` with `side="bottom"`, `align="start"`, `sideOffset={6}`, `avoidCollisions={false}`, and trigger-width-matched sizing classes.
- Why: Explicit bottom-start placement with no auto-flip gives predictable “true dropdown” behavior under the Event Type field without changing select behavior globally.
- Impact: Hero Event Type options panel now opens directly below the Event Type section and stays width-aligned to that field.
- Revisit trigger: If small viewport clipping appears, re-enable collisions for mobile only while preserving bottom-start behavior on desktop.

## [2026-03-09] Unify Home and Browse listing-card sizing with shared width-range rules and 5-column desktop target
- Context: Home and Browse listing cards were controlled by overlapping width/column rules and oversized max-width values, causing inconsistent card behavior and visual scale between the two primary marketplace surfaces.
- Decision: For Home and Browse only, use one shared `MasonryListingGrid` width model: `minCardWidthPx=240`, `cardMaxWidthPx=290`, `singleColumnCardMaxWidthPx=340`, `maxColumns=5`; keep shared grid gap unchanged for both pages; and apply page-scoped title/price size overrides through `ListingCard` render props.
- Why: A min/max-driven model is simpler to reason about, prevents oversized cards on wide screens, preserves smooth shrink behavior until a minimum width is reached, and then drops columns predictably as available width tightens.
- Impact: Home and Browse now follow the same responsive card-width behavior with matching spacing and a 5-column desktop cap, while Vendor Listings and other card surfaces retain their existing sizing behavior.
- Revisit trigger: If Browse cannot reliably sustain 5 columns at target desktop viewport QA widths, tune only Home/Browse min/max values without changing global card defaults.

## [2026-03-07] Constrain Home/Browse listing cards to fixed width range with softer typography
- Context: Home and Browse listing cards were visually oversized due broad max-width settings and large marketplace text scales, and needed consistent width behavior while preserving sizing on all other listing surfaces.
- Decision: For Home and Browse only, set `MasonryListingGrid` to `minCardWidthPx=240`, `cardMaxWidthPx=290`, `singleColumnCardMaxWidthPx=340`, and `maxColumns=4`; add Home/Browse-only `renderCard` overrides using `ListingCard` with reduced local scales (`titleScale="oneAndQuarter"`, `priceScale="oneAndHalf"`). In shared grid logic, single-column max now honors `singleColumnCardMaxWidthPx` directly.
- Why: This keeps cards near max width on medium/large screens, drops columns before violating the minimum width, allows controlled fluid shrink when constrained, prevents oversized cards on wide screens, and keeps the change scoped to the two marketplace pages.
- Impact: Home and Browse cards now follow the requested 240-290 multi-column range with centered 340 max in single-column mode and slightly lighter typography; Vendor Listings and other pages retain existing sizing behavior.
- Revisit trigger: If scanability or conversion drops on desktop/tablet, tune only Home/Browse card text scale or max columns without changing global listing-card defaults.

## [2026-03-07] Align Home listing columns with Browse Vendors responsive behavior
- Context: Home featured listings were pinned to five desktop columns while Browse Vendors used shared responsive column rules, causing layout inconsistency between the two marketplace surfaces.
- Decision: Remove `desktopColumns={5}` and `maxColumns={5}` from Home's `MasonryListingGrid` usage in `client/src/pages/Home.tsx`, keeping the existing shared card-width props.
- Why: Reusing one responsive column system improves consistency and reduces page-specific layout divergence without changing listing card typography or content.
- Impact: Home now follows the same responsive column-count behavior as Browse Vendors, while still allowing up to five columns on very wide screens through default grid logic.
- Revisit trigger: If conversion or scanability drops on Home at desktop breakpoints, re-evaluate with a metrics-backed Home-specific column override.

## [2026-03-07] Shift 15% of landing Event Type column width to Search column
- Context: Product requested the landing hero search Event Type area be slightly narrower and the same amount of width be transferred to the Search-button area, while preserving mobile stacked behavior.
- Decision: Update landing hero grid templates in `Hero.tsx` so Event Type width is reduced by 15% and Search column gains that exact amount at both medium and large breakpoints.
- Why: Column-template adjustment is the most direct way to move horizontal space between those two fields without affecting field typography or small-screen stacking behavior.
- Impact: On tablet/desktop, Event Type is visibly narrower and Search area visibly wider by the same amount; mobile remains stacked.
- Revisit trigger: If Event Type labels begin truncating at specific tablet widths, slightly rebalance medium template fractions only.

## [2026-03-07] Increase all landing hero search-bar typography by 15%
- Context: Product requested all text in the landing hero search bar (labels, values/inputs, button text) be larger by 15% while preserving layout integrity.
- Decision: In `Hero.tsx` and `index.css`, increase all explicit hero-search font-size tokens by 15% for label text, Event Type value, Date input value, Category value, Location input text, and Search button text.
- Why: Direct token updates apply the exact requested increase without introducing another global scaling layer.
- Impact: Hero search bar text is uniformly larger and still compiles cleanly across breakpoints.
- Revisit trigger: If medium-width overflow appears for long values, tune hero column ratios or introduce a medium-only font-size floor.

## [2026-03-07] Remove non-location icons from landing hero search and prevent Event Type truncation
- Context: Product requested cleaner hero search fields by removing small icons from Event Type/Date/Category while keeping the location pin, and required full display of longer selected Event Type values (for example, "Bachelorette Party").
- Decision: In `Hero.tsx`, remove Event Type/Date/Category icon elements and corresponding left-padding offsets, keep Location field unchanged, widen Event Type column share in medium/large grid templates, and override select-trigger value clamp so selected labels render in full.
- Why: Improves readability and visual cleanliness in the primary landing search surface without altering booking flow behavior.
- Impact: Landing hero search now shows no icons for Event Type/Date/Category, keeps location pin behavior, and displays longer Event Type selections without ellipsis truncation.
- Revisit trigger: If long Event Type labels begin overlapping at narrower tablet widths, reduce label font size slightly at medium breakpoints or tune column ratios further.

## [2026-03-07] Keep landing hero search bar shape consistent across tablet/desktop widths
- Context: Hero search bar was changing shape at medium breakpoints due to a two-column grid branch, causing visual jumps while resizing.
- Decision: In `Hero.tsx`, change search grid from `md:grid-cols-2` to `md:grid-cols-5` (with matching medium gap) and keep the large-screen custom five-column template.
- Why: Preserves one-row search bar structure from medium screens upward so the component shrinks proportionally instead of changing form.
- Impact: Search bar keeps a stable single-row shape on tablet/desktop; only small mobile uses stacked layout.
- Revisit trigger: If medium-width fields feel too compressed, tune the medium column proportions rather than reintroducing multi-row layout.

## [2026-03-07] Tune landing hero/search/card density with explicit per-element sizing
- Context: Product requested targeted landing-page sizing updates: search bar 30% smaller, hero headline 15% smaller, and featured listing cards able to render 5 per row.
- Decision: On `/` only, remove blanket hero wrapper scale, reduce hero title clamp values by 15%, apply a landing-specific search-bar scale class (`zoom: 0.7`), and pass `desktopColumns={5}` + `maxColumns={5}` to Home `MasonryListingGrid`.
- Why: Per-element tuning matches exact product asks while avoiding side effects to non-landing surfaces (vendor listings, browse, dashboards).
- Impact: Landing headline now renders ~15% smaller, landing search bar renders ~30% smaller, and featured listing grid can render five columns on desktop widths.
- Revisit trigger: If mobile usability/legibility regresses (especially search controls), add breakpoint-specific landing overrides instead of global scale changes.

## [2026-03-07] Set vendor Listings-tab card titles to explicit +20% local size
- Context: Product requested another ~20% title increase and clarified title size should remain proportional to listing-card presentation, without broad global-scale changes.
- Decision: Keep the change local to `VendorListings` listing-card title and set `font-size` to `1.8rem` (`text-[1.8rem]`) on the title `<h3>`.
- Why: Explicit local sizing keeps behavior predictable, preserves card-level proportional scaling, and avoids collateral effects on other pages/cards.
- Impact: Vendor Listings-tab card titles are larger with the requested incremental bump; other listing-title surfaces are unchanged.
- Revisit trigger: If truncation becomes too aggressive with long titles, reduce to `1.7rem` or increase card width at that surface.

## [2026-03-07] Increase vendor Listings-tab card titles by ~20% via local class change
- Context: Product requested a larger title specifically for listing cards in the vendor portal Listings tab, without introducing additional global scale-factor adjustments.
- Decision: Update the listing-card title `<h3>` in `VendorListings.tsx` from `text-xl` to `text-2xl` (keeping existing `leading-tight` and clamp behavior).
- Why: A local class change is the simplest and safest way to improve readability in the target surface while leaving all other listing-card surfaces unchanged.
- Impact: Only titles on vendor Listings-tab cards are larger; global/hero/card scaling system remains as-is.
- Revisit trigger: If long titles truncate too aggressively after this increase, adjust card width or reduce to an intermediate custom size.

## [2026-03-07] Increase vendor-portal listings card title text without changing global scale system
- Context: Product requested larger listing titles specifically in `/vendor/listings` cards and preferred a direct style adjustment over additional global scale-factor tuning.
- Decision: Update `VendorListings` card title class from `text-base` to `text-xl` with `leading-tight` on the listing title `<h3>`.
- Why: Solves the readability issue in the targeted surface while avoiding collateral sizing changes across the app.
- Impact: Listing titles in the vendor Listings tab now render noticeably larger; other listing-card surfaces remain unchanged.
- Revisit trigger: If title wrapping/truncation increases for long names, adjust card width or drop to an intermediate title size token.

## [2026-03-07] Scale landing hero and all listing-card variants to match global downsizing pass
- Context: After global UI downsizing, landing hero and listing cards still appeared oversized because they were using explicit sizing and scale-exempt paths.
- Decision: Add dedicated scale tokens in `client/src/index.css` and apply `75%` scale to the landing hero section (`Hero`) and `85%` scale to both listing-card render paths (`ListingCard` and `VendorListings` `ListingCardRow`).
- Why: Targeted component-level scaling preserves each surface's internal proportions (title, price, controls) while bringing these outliers into visual parity with the rest of the app.
- Impact: Home hero now renders 25% smaller, and listing cards render 15% smaller everywhere they currently appear (marketplace cards and vendor listing-management cards).
- Revisit trigger: If mobile Safari/Chrome shows clipping or horizontal scroll at specific breakpoints, reduce card width tokens or add breakpoint-specific scale floors.

## [2026-03-07] Increase Back-to-Marketplace button label size after half-size pass
- Context: After reducing Back-to-Marketplace controls to half size, label text appeared too small for comfortable readability.
- Decision: Increase Back-to-Marketplace label font size to `0.72rem` across all current instances (Navigation, CustomerDashboard, VendorShell, VendorAccount) while keeping the reduced button footprint.
- Why: Improves legibility without undoing the requested 50% button-size reduction or affecting other CTA/button patterns.
- Impact: Back-to-Marketplace buttons remain compact but with visibly larger, easier-to-read text.
- Revisit trigger: If text wraps/clips on narrower breakpoints, adjust horizontal padding or introduce a small-screen-specific fallback size.

## [2026-03-07] Reduce all "Back to Marketplace" buttons to half size across nav and dashboard shells
- Context: Product requested the "Back to Marketplace" control be rendered at half its prior size everywhere it appears.
- Decision: Apply 50% sizing overrides to all Back-to-Marketplace button instances in `Navigation`, `CustomerDashboard`, `VendorShell`, and `VendorAccount` (height, min-width/padding, text size, icon size, and gap).
- Why: Targeted per-button overrides meet the request exactly without shrinking unrelated CTA/button patterns that support booking flow usability.
- Impact: All Back-to-Marketplace controls now render at half size consistently across affected surfaces, while other buttons remain unchanged.
- Revisit trigger: If usability feedback indicates the button is too small on touch/mobile, introduce a responsive floor size only for small breakpoints.

## [2026-03-07] Apply additional 25% sitewide UI reduction on top of prior scale pass
- Context: After the first sitewide reduction, product requested one more proportional 25% size decrease while keeping existing proportions and cross-browser consistency.
- Decision: Keep the same root-token strategy and update `--global-scale-factor` in `client/src/index.css` from `0.75` to `0.5625` (cumulative `0.75 * 0.75` from the prior base scale).
- Why: Reusing the same single source of truth keeps the change low-risk, reversible, and consistent across core routes without introducing per-page overrides.
- Impact: Rem-driven typography/spacing/controls are now reduced by another 25% relative to the previous pass, preserving proportional relationships across the site.
- Revisit trigger: If specific routes become disproportionately small in visual QA, add targeted route/component overrides instead of further global scaling.

## [2026-03-07] Apply sitewide 25% UI size reduction via root scale token
- Context: UI had been scaled up during cross-browser troubleshooting, and after Safari/Chrome zoom parity was restored the product needed a proportional sitewide size reduction without using browser zoom controls.
- Decision: Keep the existing global scaling path in `client/src/index.css` and set a single reduction factor (`--global-scale-factor: 0.75`) that multiplies the prior base scale (`--global-font-scale-base: 1.15`) to drive the final root font scale.
- Why: A root-token adjustment is a low-risk, reversible change that reduces typography and rem-based spacing consistently across routes, including booking flow surfaces, without per-page rewrites.
- Impact: Core pages now render about 25% smaller for rem-driven sizing, with shared proportions preserved and no route-specific exclusions applied.
- Revisit trigger: If visual QA shows any route materially smaller than the rest after this change, add a targeted page-level override only for that route.

## [2026-03-06] Add viewport-width section dividers under vendor listings horizontal rails
- Context: On `/vendor/listings`, Active/Inactive/Draft sections visually ran together; product requested horizontal separators directly beneath the horizontal card-scroll area, but only across the listing viewport width (not full-screen).
- Decision: Extend local `ListingSection` in `VendorListings.tsx` with an optional `showSectionDivider` flag and render a `1px` divider using the same horizontal rail wrapper width classes (`-mx-6 px-6`) after Active and Inactive sections.
- Why: Reusing the rail wrapper sizing keeps divider width aligned to the visible listings area while avoiding global layout changes.
- Impact: Clear visual separation now appears between `Active -> Inactive` and `Inactive -> Draft` sections without spanning across the entire shell width.
- Revisit trigger: If listings sections move to a shared reusable rail component, migrate this divider behavior into that shared primitive.

## [2026-03-06] Match edit-map static fallback image size to live container to prevent radius clipping
- Context: Radius overlays could still appear clipped on listing edit because the static fallback map image used a fixed `1200x700` source and was rendered with `object-cover` inside a much wider/shorter container, which crops top/bottom geometry.
- Decision: Track live map container dimensions with `ResizeObserver`, request Mapbox Static API images using those dimensions, increase fit padding, and render fallback image with `object-fill` (no cover-crop).
- Why: Using the actual container aspect ratio avoids post-render cropping that cuts off the circle even when overlay geometry is valid.
- Impact: The full service-radius circle remains inside the visible map container across radius changes on edit-page fallback rendering.
- Revisit trigger: If static fallback is removed after GL rendering is fully reliable, delete container-size tracking and static sizing logic.

## [2026-03-06] Render service-radius overlay inside static edit-map fallback
- Context: After enabling a static underlay fallback for blank GL map canvases on listing edit, the map became visible but the service-radius circle was still missing whenever the fallback image was the visible map surface.
- Decision: Generate the static fallback image using Mapbox Static API `geojson(...)` overlay with both the radius polygon and center marker, fitting the viewport via `auto` and re-computing on radius changes.
- Why: Preserves map visibility and keeps radius context accurate even when Mapbox GL tiles/layers do not paint in the edit container.
- Impact: On listing edit, radius visualization now remains visible and updates with slider changes in both normal GL render and static-fallback scenarios.
- Revisit trigger: If map rendering is fully stabilized/centralized and static fallback is removed, drop this static-overlay duplication and rely on one map renderer path.

## [2026-03-06] Normalize edit-page service coordinates and add same-box static Mapbox underlay fallback
- Context: The listing edit Delivery/Setup map still showed a blank tile area for some listings even after resize lifecycle fixes, indicating certain edit payloads/container states could leave the GL canvas transparent while controls/attribution rendered.
- Decision: In `VendorListingEdit`, normalize `serviceLocation`/`serviceCenter` coordinates from multiple possible shapes into finite `lat/lng`, derive map center from normalized values only, and render a static Mapbox image underlay in the same map container (same dimensions) so a visible map remains present when GL tiles do not paint.
- Why: Existing listings may contain legacy/mixed coordinate shapes, and a transparent GL canvas should not leave vendors without visual map context on edit.
- Impact: Map preview on edit now has a visible map surface in the same box even in blank-canvas edge cases, while preserving interactive Mapbox behavior when GL rendering succeeds.
- Revisit trigger: If map previews are centralized into a shared component with unified coordinate schema guarantees and robust GL health checks, move/remove this page-local underlay fallback.

## [2026-03-06] Stabilize listing-edit Mapbox lifecycle to radius-section visibility
- Context: On `/vendor/listings/:id` edit flow, the Delivery/Setup map could show a blank tile area with attribution after layout/scale adjustments; map initialization was tied to full `draft` object changes, causing repeated map teardown/re-init during normal form edits.
- Decision: Scope `VendorListingEdit` map initialization/cleanup to `serviceAreaMode === "radius"` visibility (plus listing identity), keep one stable map instance while editing fields, and add a deferred post-load `map.resize()` to catch late container-size settling.
- Why: Mapbox GL tile rendering is sensitive to container dimensions and repeated lifecycle churn; avoiding unnecessary remounts and resizing after final layout settle improves render reliability without broad UI changes.
- Impact: The edit-page radius map should now render tiles consistently in the existing map box and stay stable while users edit nearby fields, with no size/behavior changes to unrelated components.
- Revisit trigger: If map preview logic is extracted into a shared component, consolidate lifecycle + resize handling there and remove page-specific duplication.

## [2026-03-06] Add drag-position cover photo editor for My Hub with persisted public framing
- Context: My Hub cover photos could be uploaded/changed but vendors could not drag-position the image inside the wide cover frame before saving, unlike the existing profile-photo edit flow.
- Decision: Add a dedicated rectangular cover-photo editor modal in `/vendor/shop` that opens on cover upload/change, supports drag positioning inside the frame, stores normalized position as `shopCoverImagePosition` in `vendor_profiles.onlineProfiles`, and applies that position to both My Hub preview and public `/shop/:vendorId` hero rendering.
- Why: Reuses the proven photo-position interaction pattern while keeping implementation thin (no schema migration) and improving cover framing reliability for launch.
- Impact: Vendors can place cover photos intentionally before save, saved framing persists with the cover image, and public Vendor Hub shows the same hero composition selected in My Hub.
- Revisit trigger: If cover editing expands to include zoom/rotate presets or if photo metadata is moved from JSON profile data to typed media records.

## [2026-03-06] Preserve listing input order in My Hub and Vendor Hub masonry with oldest-first data ordering
- Context: Listing cards on `/vendor/shop` and `/shop/:vendorId` appeared visually ordered by card size because masonry distribution prioritized estimated card heights, which created a large-to-small pattern.
- Decision: Add an opt-in `preserveInputOrder` mode to `MasonryListingGrid` that assigns cards by sequential column placement (instead of height-based balancing), enable it for My Hub and public Vendor Hub, and order both backing listing queries oldest-first by `vendor_listings.created_at` (with `id` tie-break).
- Why: Keeps card sizes and top-row alignment unchanged while removing size-ranked presentation and ensuring both surfaces render the same deterministic listing order.
- Impact: My Hub and Vendor Hub now show listings in the same oldest-first sequence without the prior large-to-small ordering effect; other masonry surfaces keep existing balancing behavior.
- Revisit trigger: If we introduce a vendor-controlled listing sort preference (manual pinning, newest-first toggle, or drag ordering) that should override oldest-first.

## [2026-03-06] Align My Hub cover editor frame ratio to Vendor Hub hero max ratio
- Context: Cover positioning in the My Hub editor could feel mismatched against how covers render on public Vendor Hub because the editor frame ratio was wider than the Vendor Hub hero's max layout ratio.
- Decision: Set My Hub cover preview and cover-editor frame ratio to `100:42`, matching the public Vendor Hub hero's max sizing ratio from `clamp(280px, 42vw, 520px)`.
- Why: Keeps vendor framing intent consistent between edit and public view without changing cover rendering behavior.
- Impact: Cover placement in the editor better reflects the final public hero composition, reducing surprise after save.
- Revisit trigger: If Vendor Hub hero sizing is redesigned or moves to a fixed aspect-ratio strategy.

## [2026-03-06] Make My Hub cover edit/add frames follow live Vendor Hub hero proportions
- Context: Matching a fixed ratio still looked off on wider screens because public Vendor Hub cover dimensions are viewport-dependent (`clamp(280px, 42vw, 520px)`), not a single static aspect ratio.
- Decision: Derive My Hub cover frame ratio from the same live viewport formula used by Vendor Hub hero height and apply it to both the add/edit cover preview block and the cover editor modal frame.
- Why: Ensures cover framing in edit mode stays proportionally consistent with how the public hero actually renders at the current screen width.
- Impact: On large and small screens, My Hub cover frames now track Vendor Hub cover proportions more accurately, reducing composition mismatch after save.
- Revisit trigger: If Vendor Hub hero sizing formula changes or moves away from viewport-clamped height.

## [2026-03-06] Load Mapbox CSS globally and surface map runtime errors on vendor map previews
- Context: Listing edit/create map previews could appear blank with only attribution visible in some browser/session paths, while still rendering in Chrome, indicating route/session-dependent Mapbox UI styling/runtime differences rather than missing map state.
- Decision: Import `mapbox-gl/dist/mapbox-gl.css` once in `client/src/main.tsx` so every route has Mapbox base styles, and add `map.on("error")` handlers in vendor onboarding/listing create/listing edit map initializers to show explicit load failures in-place.
- Why: Mapbox map surfaces depend on shared global CSS; per-route imports can lead to inconsistent styling/rendering when route CSS chunks are not yet loaded, and explicit runtime errors make browser-specific issues diagnosable instead of silently blank.
- Impact: Map previews now consistently receive required Mapbox styling across routes, and any token/style/network/browser failure presents actionable text instead of a blank map.
- Revisit trigger: If map previews are centralized into a shared map component with built-in fallback/static preview mode.

## [2026-03-06] Remove overly aggressive 2s Auth0 token timeout from shared API token bridge
- Context: Vendor edit pages could fail with `401 Missing Authorization Bearer token` in slower browsers even while user appeared logged in, because shared `getFreshAccessToken` used a 2-second timeout race and returned `null` too quickly.
- Decision: In `AuthTokenBridge`, stop racing `getAccessTokenSilently` against a 2-second timeout and return token directly when authenticated.
- Why: A 2-second hard cutoff is too strict for some browsers/network conditions and causes false-negative auth headers on protected API calls.
- Impact: Protected vendor API requests are less likely to drop bearer headers due to transient token retrieval latency, reducing spurious 401s on listing edit/create routes.
- Revisit trigger: If token requests start hanging in production, add a longer, configurable timeout with retry/backoff instead of a fixed 2-second cutoff.

## [2026-03-06] Register shared Auth0 token getter before first protected queries fire
- Context: `Edit listing` could still show `401 Missing Authorization Bearer token` on initial load because first protected queries sometimes fired before `AuthTokenBridge`'s `useEffect` had registered the shared token getter.
- Decision: Register `setTokenGetter(...)` during `AuthTokenBridge` render (instead of waiting for a post-render effect) and always attempt `getAccessTokenSilently` inside the getter.
- Why: Eliminates first-render race conditions where API calls are made before the shared token bridge is available or before `isAuthenticated` has settled.
- Impact: Initial vendor protected requests are much less likely to be sent without bearer headers, reducing hard-fail 401 states on first page load.
- Revisit trigger: If render-time registration causes unexpected side effects, move registration to a higher-level bootstrap path while preserving pre-query availability guarantees.

## [2026-03-06] Add resize handling to Vendor Listing Edit map preview to prevent blank-attribution map state
- Context: On `/vendor/listings/:id`, the Delivery/Setup map could render as a blank box with Mapbox attribution visible (no tiles), while create/onboarding map previews remained stable.
- Decision: Mirror the create/onboarding map behavior in `VendorListingEdit` by triggering `map.resize()` on map load and attaching a `ResizeObserver` to the map container to resize when layout dimensions settle/change.
- Why: Mapbox GL canvases can initialize with stale zero/small dimensions when mounted during async/layout transitions; without explicit resize handling, tiles may never paint even though controls/attribution render.
- Impact: Listing edit map previews now reflow to actual container size and are less likely to appear blank across browser/layout timing differences.
- Revisit trigger: If map rendering is centralized into a shared component, move this resize logic into that component and remove per-page duplication.

## [2026-03-06] Persist Auth0 session tokens across hard refresh in vendor/customer app shell
- Context: Vendors were being prompted to sign in again after browser hard refresh because the Auth0 React provider was configured with in-memory token cache.
- Decision: Switch `Auth0Provider` cache location in `client/src/main.tsx` from `memory` to `localstorage`.
- Why: In-memory cache is cleared on full page reload; local storage preserves token cache across refreshes and avoids unnecessary re-auth prompts.
- Impact: Signed-in users should remain authenticated after hard refresh in normal token-valid windows, reducing portal friction on listing/edit flows.
- Revisit trigger: If security requirements tighten around browser storage of tokens, move to refresh-token rotation/session strategies that preserve UX without local-storage token persistence.

## [2026-02-26] Add editable circular shop profile image workflow and expand optional Vendor Shop public fields
- Context: Vendor Shop needed customer-avatar-style photo adjustment (drag + scale + save), additional optional storytelling fields, and customer-facing conditional rendering that hides any empty vendor-shop-managed fields.
- Decision: Implement circular shop photo editing UI in `/vendor/shop` mirroring customer avatar interaction, upload finalized cropped image via `/api/uploads/vendor-shop-photo`, persist `aboutBusiness`, `aboutOwner`, `yearsInBusiness`, `hobbies`, `likesDislikes`, `homeState`, `funFacts`, and `shopProfileImageUrl` in `vendor_profiles.onlineProfiles`, and conditionally render those fields only when non-empty on `/shop/:vendorId`.
- Why: Adds richer vendor personalization while preserving scope discipline by reusing existing JSON profile storage and existing upload infrastructure.
- Impact: Vendors can upload/reposition/edit shop image and manage expanded optional profile content; public shop hides blank fields; listing cards show vendor image + business name inside the card when a shop image exists; prior below-card vendor image/name chip is removed.
- Revisit trigger: If vendor public profile metadata outgrows JSON storage and should move to typed schema with dedicated media/CDN pipeline.

## [2026-02-26] Split public shop narrative fields and add vendor shop profile image across shop + listing cards
- Context: Vendor Shop needed separate customer-facing narratives for business and owner, plus a configurable shop profile image that appears on listing cards and next to business name on the public shop page; blank optional fields should not be hinted at to customers.
- Decision: Store `aboutBusiness`, `aboutOwner`, and `shopProfileImageUrl` in `vendor_profiles.onlineProfiles`, add authenticated upload endpoint `/api/uploads/vendor-shop-photo`, expose only safe public fields in vendor shop/listing public APIs, and render customer-facing sections conditionally only when values are non-empty.
- Why: Delivers requested storefront storytelling and branding without schema migrations, while preserving privacy by avoiding exposure of unrelated `onlineProfiles` values.
- Impact: Vendors can independently manage business/owner copy and shop image in Vendor Shop editor; listing cards now show vendor profile image when configured; public shop displays image beside business name and hides empty optional sections.
- Revisit trigger: If vendor public profile fields are promoted to first-class typed DB columns or a centralized media service replaces local upload storage.

## [2026-02-26] Align Home and Browse listing-stack spacing with Vendor Shop masonry spacing
- Context: Listing stack spacing was tuned on Vendor Shop to reduce vertical whitespace, and the same behavior needed to remain consistent as listing volume grows on Home and Browse Vendors.
- Decision: Apply the same masonry-column listing container and card wrapper spacing (`break-inside-avoid` + tight bottom margin) on Home featured listings and Browse Vendors results.
- Why: Keeps cross-surface listing rhythm predictable and prevents grid-row whitespace growth with mixed image heights.
- Impact: Home, Browse Vendors, vendor shop, and public shop now share consistent stacked-card spacing behavior as more listings are added.
- Revisit trigger: If a shared reusable listing-layout component is introduced to centralize all marketplace listing surfaces.

## [2026-02-26] Use masonry columns for Vendor Shop listings with tighter proportional vertical spacing
- Context: Vendor Shop listing stacks had excessive vertical gaps, especially with mixed image heights, and needed spacing tuned so inter-card gap is about 2x the image-to-title/price gap.
- Decision: Replace Vendor Shop listing grids with responsive masonry-style column layouts on `/vendor/shop` and `/shop/:vendorId`, and wrap each card with `break-inside-avoid` plus tight bottom spacing.
- Why: CSS grid row alignment creates large empty vertical blocks for mixed-height cards; masonry columns preserve card size while significantly reducing stacked whitespace.
- Impact: Vendor/public shop pages now stack listings tightly with consistent readable spacing and reduced dead space.
- Revisit trigger: If listing cards gain fixed-height media or a dedicated masonry component is introduced globally.

## [2026-02-26] Increase Vendor Shop listing card footprint by reducing shop-grid density
- Context: Vendor Shop cards became visually too small in both vendor portal and public customer-mode views due to high column density within the split-layout shop pages.
- Decision: Reduce Vendor Shop listing grids to larger-card density (`1/2/3` responsive columns) on both `/vendor/shop` and `/shop/:vendorId`, and increase the vendor-portal `Active Listings` heading size.
- Why: Restores readable card scale while preserving existing listing-card typography parity and overall page structure.
- Impact: Vendor and public shop listings render larger and easier to scan; vendor-portal section heading has stronger visual hierarchy.
- Revisit trigger: If shop page layout is redesigned to full-width listings or a dedicated masonry/card-size system.

## [2026-02-26] Add customer-mode exit control on public Vendor Shop for vendor-owner sessions
- Context: Vendors can enter customer mode from `/vendor/shop` but had no direct way to return from the public shop view.
- Decision: On `/shop/:vendorId`, detect vendor-owner session via `/api/vendor/me` and show a top-right `Exit Customer Mode` button that routes back to `/vendor/shop` only when the logged-in vendor owns the viewed shop.
- Why: Keeps customer-mode preview reversible in one click without exposing vendor-only navigation to non-owner visitors.
- Impact: Vendor owners can safely preview and immediately return to editing flow; customer/public browsing behavior is unchanged.
- Revisit trigger: If customer-mode preview evolves into a global role-switch state shared across multiple routes.

## [2026-02-26] Normalize nullable vendor-profile fields on PATCH to prevent Vendor Shop save failures
- Context: Vendor Shop edits could fail with `Validation failed` when saving `about`/business details because `/api/vendor/profile` PATCH merged partial payloads with existing profile rows that may contain nullable DB values (`serviceRadius`, `serviceAddress`, `onlineProfiles`), while schema parsing expected optional non-null values.
- Decision: In `/api/vendor/profile` PATCH, normalize nullable merged fields (`serviceRadius`, `serviceAddress`, `onlineProfiles`) to optional/absent before schema parse and keep `serviceDescription` non-null default.
- Why: Preserves existing profile validation model while removing false-negative validation errors for partial Vendor Shop edits.
- Impact: Vendor Shop save now succeeds for existing vendors with nullable profile fields, and customer-mode/public shop views can reflect updated business/about content reliably.
- Revisit trigger: If vendor profile validation is refactored to use dedicated PATCH schema with explicit partial/nullable semantics.

## [2026-02-26] Add public Vendor Shop page with vendor-portal edit and customer preview mode
- Context: Vendors need a shareable public storefront page they can link in social channels, customers need direct access from listing cards, and vendors need to edit shop-facing business/about content from inside the portal.
- Decision: Add a public route (`/shop/:vendorId`) backed by a new public API (`/api/vendors/public/:vendorId/shop`) that returns non-private vendor shop data plus active listings; add `Vendor Shop` as the final vendor-sidebar tab (`/vendor/shop`) with business-name/about editing via existing `/api/vendor/me` and `/api/vendor/profile` endpoints, plus an `Enter Customer Mode` action to open the same public shop view.
- Why: Delivers marketplace credibility and vendor self-promotion value quickly while reusing existing account/profile/listing sources to keep edits synchronized across the app.
- Impact: Customers can open vendor shops from listing cards and direct links; vendors can manage public shop details in one place; private contact info remains excluded from the public shop payload.
- Revisit trigger: If vendor public profiles move to slug-based URLs or require richer public sections (featured collections, testimonials, branded media) beyond the MVP storefront layout.

## [2026-02-26] Remove Messages item from vendor/customer portal avatar dropdowns
- Context: The circular avatar dropdowns in vendor and customer portals should not include a `Messages` option.
- Decision: Remove the `Messages` dropdown item from `VendorShell` and `CustomerDashboard` avatar menus only.
- Why: Matches requested portal-level menu scope while preserving existing sidebar navigation and message routes.
- Impact: Vendor/customer portal avatar dropdowns no longer show `Messages`; other menu items and messaging functionality remain available through existing portal navigation.
- Revisit trigger: If account dropdown options are centralized and message entry points are redefined across portal surfaces.

## [2026-02-26] Remove avatar-dropdown Notifications item on landing and dashboard shells
- Context: The circular avatar dropdown should not show a `Notifications` option on the landing page, customer dashboard, or vendor dashboard.
- Decision: Hide `Notifications` in `Navigation` only when route is `/` (landing), and remove `Notifications` menu items from `CustomerDashboard` and `VendorShell` avatar dropdown menus.
- Why: Matches the requested UI scope while preserving existing notifications route and other menu behavior outside those contexts.
- Impact: `Notifications` no longer appears in avatar dropdowns on landing/customer-dashboard/vendor-dashboard surfaces; other menu options and routes remain intact.
- Revisit trigger: If account-menu items are centralized into a shared configuration with role/surface-level menu policies.

## [2026-02-26] Increase customer listing-card text emphasis and share icon size
- Context: Customer-facing listing cards on Home and Browse needed stronger visual emphasis for listing title/price and a larger send-listing icon.
- Decision: In shared `ListingCard`, increase title weight from `font-medium` to `font-semibold`, increase price weight from `font-semibold` to `font-bold`, and increase the send icon from `20px` to `30px`.
- Why: Meets the requested visual adjustments while keeping spacing/layout and responsive behavior unchanged by editing one shared component.
- Impact: All customer-facing listing cards that use `ListingCard` now render bolder title/price text and a larger send icon consistently across Home and Browse.
- Revisit trigger: If card metadata wraps or icon affordance needs tuning after visual QA on smaller breakpoints.

## [2026-02-26] Normalize customer profile email away from synthetic Auth0 fallback addresses
- Context: Customer/My Events profile email could show synthetic values like `auth0_...@eventhub.local` for vendor-linked Auth0 users, even when a real account email existed.
- Decision: In customer identity resolution, treat synthetic Auth0-local emails as placeholders, prefer canonical real email from Auth0 claims, then vendor account email by Auth0 sub, and auto-backfill the customer `users.email` when safely unique.
- Why: Fixes the root identity data source instead of UI-only masking, and keeps profile/booking flows aligned to real account contact info.
- Impact: Customer profile email now auto-fills with the real account email for affected users, and repaired values persist for subsequent requests.
- Revisit trigger: If customer/vendor identities are later unified under a dedicated account-linking model with enforced canonical email ownership.

## [2026-02-26] Extend customer email repair to JWT-auth path and vendor link by userId
- Context: Some sessions still returned synthetic `@eventhub.local` email because `resolveCustomerAuthFromRequest` exited early when `req.customerAuth` already existed, bypassing Auth0-based repair logic.
- Decision: Normalize/repair email even in the early `req.customerAuth` branch, add canonical fallback lookup via `vendor_accounts.user_id`, and make `/api/customer/me` prefer resolved auth email when profile row is still synthetic.
- Why: Ensures one consistent canonical-email path regardless of token/middleware branch and avoids UI-specific workarounds.
- Impact: Vendor-linked My Events profiles now resolve real account email even when request context originates from pre-populated customer auth state.
- Revisit trigger: If identity/account-linking is centralized and this compatibility repair logic can be replaced by a single authoritative account record.

## [2026-02-26] Use vendor-style avatar dropdown on customer dashboard for vendor-linked accounts
- Context: Vendor-linked users in the customer (`My Events`) dashboard needed the top-right avatar/dropdown to visually match the vendor portal shell, while still reflecting the customer person identity.
- Decision: In `CustomerDashboard`, switch to a vendor-style dropdown variant when a vendor account exists: no profile image, `Vendor Account` label, vendor-style menu options (including Vendor Dashboard and Notifications), and avatar initials derived from customer real name (first + last initial).
- Why: Keeps cross-portal vendor experience cohesive without leaking business-name initials into customer booking identity.
- Impact: Vendor-linked users now see a matching vendor-style header control on My Events; non-vendor customers keep the existing customer avatar behavior.
- Revisit trigger: If account menus are centralized into a shared role-aware component across all shells.

## [2026-02-26] Fix customer-dashboard vendor detection query for header account menu variant
- Context: The customer header dropdown kept rendering the non-vendor variant because vendor-account detection never resolved during My Events rendering.
- Decision: Use an explicit authenticated query function for `/api/vendor/me` in `CustomerDashboard` (with Auth0 bearer token) and treat non-OK responses as non-vendor only.
- Why: Ensures vendor-linked accounts are detected reliably in customer shell context so the intended vendor-style dropdown branch actually renders.
- Impact: Vendor accounts now correctly see the vendor-style header menu variant in My Events; non-vendor accounts remain unchanged.
- Revisit trigger: If header account-menu role detection is centralized into shared auth context/state.

## [2026-02-26] Stabilize vendor-mode customer header avatar to prevent blank/unstyled circle state
- Context: In My Events, vendor-linked users could briefly render customer profile-photo avatar state first, then switch to vendor mode, resulting in a blank/unstyled avatar circle instead of the filled vendor-style avatar.
- Decision: Gate customer-photo rendering until vendor-account lookup resolves and key the avatar by role mode (`vendor`/`customer`) to force a clean remount when mode changes.
- Why: Ensures the same visual treatment as vendor portal without transient Radix avatar image-state artifacts.
- Impact: Vendor-linked customer dashboard header now consistently shows filled vendor-style initials avatar color/state.
- Revisit trigger: If avatar/header controls are unified into one shared shell component with role-aware rendering.

## [2026-02-26] Use non-generic listing-title fallback chain for vendor booking surfaces
- Context: Vendor dashboard recent activity could display stale generic booking-item titles like `New unspecified listing` even when the linked listing has a proper current title.
- Decision: In `attachBookingItemContext`, normalize generic placeholder titles to null and resolve item title via fallback chain: booking-item title -> booking-item JSON snapshot title -> linked `vendor_listings` title/listingData title.
- Why: Keeps vendor-facing booking cards aligned with actual listing names while preserving booking snapshot metadata when meaningful.
- Impact: Recent Activity (and other vendor booking surfaces using this helper) now avoid generic placeholder titles and show real listing titles when available.
- Revisit trigger: If booking items are later migrated to immutable normalized title snapshots and runtime fallback is no longer required.

## [2026-02-25] Set Browse Vendors page background to Cloud Dancer `#f0eee9`
- Context: Browse Vendors background needed to match the specified light neutral tone.
- Decision: Update the Browse Vendors page surface wrapper color to `#f0eee9`.
- Why: Aligns the page background with the requested palette value.
- Impact: Browse Vendors main background now renders `#f0eee9` while preserving existing behavior and layout.
- Revisit trigger: If browse-page colors are later centralized into semantic page-level tokens.

## [2026-02-25] Apply unified light-gray surface tone to Browse Vendors background and input controls
- Context: Browse Vendors needed the page background and input boxes aligned to a specific light-gray swatch.
- Decision: Set a scoped swatch class on Browse Vendors wrappers and apply the same swatch to all page input controls (search, location, min/max price, availability date, and sort trigger).
- Why: Delivers the requested visual uniformity on the browse surface without changing behavior or global theme tokens.
- Impact: Browse Vendors now uses a consistent swatch color for page background and input-like controls.
- Revisit trigger: If browse-page theming is later refactored into dedicated page-level tokens.

## [2026-02-25] Adjust notification toggle to gold thumb with lighter-gold checked track
- Context: Notification switch thumb needed to match the gold accent, and checked track needed to be a lighter shade of that same gold.
- Decision: Set notification toggle thumb fill/border to secondary-accent gold and reduce checked-track intensity to a lighter tint while keeping unchecked track white.
- Why: Matches requested visual hierarchy and keeps ON/OFF readability.
- Impact: Toggles now use gold thumb + lighter-gold ON track with white OFF track.
- Revisit trigger: If switch colors are standardized globally across dashboard pages.

## [2026-02-25] Set notification toggles to blue thumb with gold/white track states
- Context: Notification switches needed clearer state mapping and specific brand-color treatment for thumb and track.
- Decision: In vendor notifications, style switch thumb as solid brand blue and set track to gold when checked and white when unchecked.
- Why: Matches requested visual language and improves state clarity without changing switch behavior.
- Impact: Notification toggles now render with explicit blue knob + gold/white track states.
- Revisit trigger: If switch appearance is later unified globally across all pages.

## [2026-02-25] Increase visual definition of notification toggles on vendor notifications page
- Context: Notification preference switches looked like plain pills and lacked clear toggle affordance in the current dashboard color context.
- Decision: Apply a page-scoped switch class in `VendorNotifications` with stronger track border/shadow, higher-contrast thumb, and explicit checked/unchecked differentiation.
- Why: Improves scanability and interaction clarity without changing switch behavior or global component defaults.
- Impact: Toggles on vendor notifications now read clearly as switches while preserving existing state handling.
- Revisit trigger: If switch definition should be standardized globally across all dashboard pages.

## [2026-02-25] Match dashboard base surfaces to screenshot by using the base background tone
- Context: Prior white-surface override made dashboard surfaces too bright versus the provided screenshot.
- Decision: Update scoped dashboard surface override so `background`, `card`, and `sidebar` use the base background tone token instead of the brighter card-white token.
- Why: Aligns vendor/dashboard main background colors with the screenshot while keeping input and component behavior unchanged.
- Impact: Dashboard canvas and large containers now render in the softer base light tone seen in the reference.
- Revisit trigger: If final visual QA asks for stronger contrast between canvas and card surfaces.

## [2026-02-25] Unify dashboard background and large container surfaces to the lighter white tone
- Context: The initial dashboard white-surface swap still left visual mismatch; requested result was the lighter white on both page background and larger non-input boxes.
- Decision: Update scoped dashboard override so both `--background` and `--card` resolve to the lighter white token inside vendor and customer dashboard wrappers.
- Why: Matches the exact visual request while preserving input styles and global theme behavior.
- Impact: Vendor dashboard and customer dashboard (`My Events` area) now render the canvas and large cards in the same lighter white tone.
- Revisit trigger: If dashboard needs separate contrast hierarchy again for accessibility or information density.

## [2026-02-25] Invert light-surface pair on vendor and customer dashboard containers
- Context: Vendor dashboard and customer dashboard (`My Events` area) needed the two light surface tones (“dark white” and “light white”) flipped relative to each other.
- Decision: Add scoped `.swap-dashboard-whites` token override that swaps `--background` and `--card`, and apply it to `VendorShell` and `CustomerDashboard` wrappers only.
- Why: Delivers requested color inversion without changing global site theme or modifying component behavior.
- Impact: Dashboard canvases and card surfaces now render with swapped light-surface hierarchy in both light and dark modes for those dashboard sections only.
- Revisit trigger: If dashboard visual system is later split into dedicated tokens instead of scoped overrides.

## [2026-02-25] Prefer vendor personal display name over business name on customer My Events labels
- Context: My Events booking labels were showing vendor shop/business names where users expected vendor personal display names.
- Decision: Extend customer bookings payload to include vendor display name from linked `users` records, prefer that name when building booking display titles, and keep business name as fallback only.
- Why: Aligns customer-facing booking labels with expected person-first identity while preserving backward compatibility for vendors without linked profile names.
- Impact: `My Events` now shows `listing from {vendor personal name}` when available, with shop name fallback for incomplete account links.
- Revisit trigger: If vendor identity model formalizes separate public-facing person name and business label fields.

## [2026-02-25] Replace Auth0 machine fallback names with human display names in customer profile resolution
- Context: Some authenticated users (including vendor-linked accounts using customer dashboard surfaces) were seeing machine-generated names like `auth0_google_oauth2_...` because fallback identity creation used synthetic email local-parts when Auth0 email/name claims were missing.
- Decision: Update customer auth resolution to prefer human names from Auth0 claims, then a humanized email local-part; additionally auto-repair existing user rows whose `name`/`displayName` match machine fallback patterns (and shop-name fallback remnants from prior logic).
- Why: Preserves current auth/database flow while fixing user-facing identity quality and expected initials without schema changes.
- Impact: Affected profiles now resolve to readable person-style names and initials match those names instead of machine identifiers.
- Revisit trigger: If user identity model is split into separate customer/vendor personas with explicit per-role profile names.

## [2026-02-25] Persist vendor Street Address in dashboard profile details without schema changes
- Context: Vendor profile details had verified address selection but no dedicated Street Address input to visibly store and restore the street line after LocationPicker selection.
- Decision: Add a `Street Address` field in Vendor Dashboard Profile Details, auto-fill it from LocationPicker selection parsing, and persist it through existing `/api/vendor/profile` payload by storing in `onlineProfiles.streetAddress` with service-address parsing fallback.
- Why: Meets the requested UX while keeping backend/schema unchanged and preserving existing profile save behavior.
- Impact: Vendors can see/edit/save the street line directly; selecting an address hydrates the field; reset/hydration restores it consistently.
- Revisit trigger: If vendor profiles get dedicated structured address columns (street/city/state/zip) and JSON fallback should be migrated.

## [2026-02-25] Propagate landing control/accent styling to vendor and customer dashboards
- Context: Dashboard routes still had hardcoded legacy cyan/green/yellow styles that diverged from the landing page’s themed control system and secondary-accent behavior in light/dark mode.
- Decision: Replace dashboard-specific hardcoded colors with shared theme tokens/components, including secondary-accent styling for unread badges, publish/status actions, selected review stars, warning cards, and destructive/error text states.
- Why: Keeps booking-critical dashboard flows visually consistent with landing without backend/schema changes, while preserving existing functionality and launch velocity.
- Impact: Vendor and customer dashboard controls now inherit the same token-driven accent behavior as landing in both light and dark mode, reducing one-off style drift.
- Revisit trigger: If a dedicated dashboard design system diverges intentionally from landing tokens or if broader component variants are introduced for accent actions.

## [2026-02-25] Scale landing hero/search section components by 15% on desktop only
- Context: The landing hero block (headline, supporting copy, search fields, and CTA) needed to render larger while preserving its existing composition and mobile behavior.
- Decision: Increase hero/search typography, control heights, paddings, and spacing by ~15% at `lg` breakpoints and keep current mobile/tablet base values unchanged.
- Why: Matches requested visual sizing while preserving established proportions and reducing risk to the MVP booking entry surface.
- Impact: Desktop hero/search reads noticeably larger with the same visual hierarchy; mobile responsiveness and interaction flow remain unchanged.
- Revisit trigger: If QA finds desktop overflow/wrapping issues on narrower laptop widths or if brand scale tokens are standardized.

## [2026-02-25] Apply a second proportional +15% desktop scale pass to hero/search
- Context: After the first desktop-only scaling pass, the hero/search surface still needed to read larger while retaining the same composition and mobile behavior.
- Decision: Multiply existing `lg` hero/search size tokens by another 15% (typography, spacing, control/icon/button sizing) without changing base mobile/tablet values.
- Why: Preserves proportional visual hierarchy and keeps the requested responsive behavior intact.
- Impact: Desktop hero/search now renders larger again with unchanged interactions and unchanged mobile sizing.
- Revisit trigger: If narrower desktop breakpoints show clipping or if final brand type scale tokens are standardized.

## [2026-02-25] Standardize form dropdowns on shared themed select styling
- Context: Form dropdowns were visually inconsistent with the current editorial theme, especially native browser select menus.
- Decision: Use the shared `ui/select` component styles as the dropdown baseline for form surfaces, replace remaining native form `<select>` controls with `Select`, and align LocationPicker suggestion menus to the same popover/accent styling system in light and dark mode.
- Why: Ensures consistent colors, borders, radius, and typography across form dropdown interactions while preserving existing form behavior.
- Impact: Event-type/event-selection dropdowns and form suggestion lists now render with unified theme styling in both light and dark modes.
- Revisit trigger: If a dedicated design token set for form controls is introduced or dropdown density needs per-surface tuning.

## [2026-02-25] Standardize calendar/date-picker theming across custom and native date inputs
- Context: Date-picking surfaces were visually inconsistent with the current theme, especially browser-native date picker controls.
- Decision: Restyle shared `ui/calendar` day/caption/nav tokens, set calendar popovers to themed border/radius/background classes, and add global `input[type="date"]` theming hooks (color-scheme, typography, and WebKit picker-indicator styling) for light/dark modes.
- Why: Delivers consistent calendar visuals site-wide while preserving existing date selection behavior and native picker functionality.
- Impact: Custom calendar dropdowns now match theme tokens more closely, and native date-input controls are themed as far as browser support allows in both light and dark modes.
- Revisit trigger: If date inputs are later migrated to fully custom calendar pickers for complete cross-browser visual control.

## [2026-02-25] Expand hero location field width and remove right mini pin control
- Context: The hero location input was too narrow to read typed location values clearly, and the extra right-side mini pin icon crowded the field.
- Decision: Increase hero search-shell width and rebalance desktop grid proportions so the location segment is substantially wider (~2.3x target), reduce horizontal margins, and hide the location button in the hero `LocationPicker` while keeping it available elsewhere.
- Why: Improves scanability and typing clarity in the highest-priority browse entry surface without backend/schema changes or flow changes.
- Impact: Hero location section now occupies much more horizontal space, typed values are more visible, and the right mini pin is removed in hero only; other location pickers keep existing behavior.
- Revisit trigger: If other pages request the same no-pin behavior or if small-laptop QA shows column crowding in the hero bar.

## [2026-02-25] Increase desktop hero field-label typography by 10%
- Context: The hero filter labels (`Location`, `Event Type`, `Date`, `Category`) needed stronger visibility in the desktop search bar.
- Decision: Increase only the desktop (`lg`) label font size tokens for those four labels by exactly 10%, leaving other typography and spacing unchanged.
- Why: Improves readability while preserving current hierarchy and responsive behavior.
- Impact: Desktop hero labels render larger without changing layout structure, interactions, or non-desktop sizing.
- Revisit trigger: If further desktop readability tuning is requested for hero metadata text.

## [2026-02-25] Introduce #c9a06a as a discreet secondary accent across interactive states
- Context: UI needed a surprising but restrained secondary accent that complements existing primary tokens instead of replacing them.
- Decision: Add a dedicated secondary-accent token (`#c9a06a` in light mode, tuned lighter in dark mode) and apply it to secondary interactive states: switch checked state + focus ring, link hover/underline color, secondary badge variant, select item focus/checked states, and calendar hover/today highlights.
- Why: Creates a cohesive secondary accent system across key interactions while preserving current primary color hierarchy.
- Impact: Gold appears consistently in secondary interactions across light/dark mode with no behavioral changes and no backend/schema changes.
- Revisit trigger: If brand direction requests expanding gold usage beyond secondary interactions or tightening it further.

## [2026-02-25] Double listing-card price typography on landing and browse-vendors surfaces
- Context: Price values under listing cards were too small relative to the requested emphasis on marketplace pricing.
- Decision: Add a scoped `priceScale` prop to `ListingCard` and set it to `double` only in `Home` and `BrowseVendors`, resulting in exactly 2x price text size on those two surfaces.
- Why: Meets the visual requirement without affecting other pages or card contexts.
- Impact: Listing-card price text is now significantly more prominent on landing and browse-vendors pages; no backend/schema or interaction changes.
- Revisit trigger: If card metadata density or wrapping becomes an issue at smaller widths.

## [2026-02-25] Increase listing-card title typography by 1.5x on landing and browse-vendors surfaces
- Context: After increasing listing-card prices, listing titles under cards still needed stronger visual presence on the same two marketplace surfaces.
- Decision: Add a scoped `titleScale` prop to `ListingCard` and set it to `oneAndHalf` only in `Home` and `BrowseVendors`, resulting in exactly 1.5x title text size there.
- Why: Keeps scope aligned with the requested pages and preserves existing behavior/layout elsewhere.
- Impact: Listing titles under cards are now more prominent on landing and browse-vendors pages without backend/schema or interaction changes.
- Revisit trigger: If card text wrapping or metadata balance needs tuning at smaller viewport widths.

## [2026-02-25] Tighten listing-card metadata gap and reduce enlarged price size on landing/browse surfaces
- Context: After doubling listing-card prices on landing and browse-vendors pages, the price baseline looked visually too far from the image and too large relative to adjacent title text.
- Decision: For `ListingCard` instances using `priceScale="double"`, reduce metadata top margin (`mt-2` to `mt-1`) and reduce price size by ~15% (`2.56rem` to `2.176rem`) with tighter line-height.
- Why: Restores balanced vertical rhythm while keeping the requested emphasis and same page scope.
- Impact: Price now sits closer to the image with cushion closer to the title, and the enlarged price remains prominent but less overpowering on landing and browse-vendors surfaces only.
- Revisit trigger: If additional spacing harmonization is requested after visual QA on narrow columns.

## [2026-02-25] Apply gold accent to four specific hero/navigation/home text targets
- Context: Four specific landing-facing text/icon targets needed the secondary gold accent while preserving all other color behavior.
- Decision: Set only these targets to gold in light mode (`#c9a06a`) with a lighter companion in dark mode (`#d9b78c`): hero subtitle text, hero `Pros,` wordmark span, navigation theme-toggle label + sun/moon icons row, and the featured-rentals helper subtitle.
- Why: Meets the requested targeted color shift without broad token/theme changes.
- Impact: Only the specified surfaces now render gold-toned accents consistently across light/dark and desktop/mobile; no functional changes.
- Revisit trigger: If brand review asks to extend or narrow gold usage beyond these exact targets.

## [2026-02-25] Revert targeted gold accent on hero subtitle/theme-row/helper subtitle/pros span
- Context: The most recent targeted gold pass needed to be rolled back.
- Decision: Restore previous colors for the four scoped targets only: hero subtitle, hero `Pros,` span, navigation theme toggle label/icons row, and home featured-rentals helper subtitle.
- Why: Honor explicit rollback request while keeping all other styling and behavior untouched.
- Impact: Those four surfaces now use their prior non-gold colors again in both light and dark experiences.
- Revisit trigger: If targeted gold usage is re-requested with updated scope.

## [2026-02-25] Restore landing-page brand/logo script style and Pinterest-style listing metadata placement
- Context: The latest landing-page polish pass moved logo wordmarks away from Damion and pulled listing title/price back inside the card shell, which no longer matched the requested visual direction.
- Decision: Re-enable Damion as the logo font token in `BrandWordmark`, keep split color styling where used, remove the hero eyebrow line, and move listing title/price into a separate metadata row beneath the image card.
- Why: Aligns the homepage with the requested Pinterest-inspired listing treatment and prior EventHub logo styling while preserving current behavior and routing.
- Impact: Logo marks now render in Damion across nav/footer/auth surfaces, the hero is simplified, and listing images are visually separated from title/price text without functional flow changes.
- Revisit trigger: If brand guidelines are finalized with a different permanent logo typeface or listing-card information hierarchy.

## [2026-02-25] Increase landing-page typography scale by 5% with proportional responsive sizing
- Context: Landing-page text needed a universal legibility bump without changing layout behavior or interaction flows.
- Decision: Increase explicit text sizes across `Navigation`, `Hero`, `Home` featured header block, `ListingCard`, and `Footer` by ~5%, including proportional updates to hero `clamp(...)` values.
- Why: Meets the requested visual refinement while preserving existing responsive scaling dynamics and component structure.
- Impact: Home landing text renders consistently larger across desktop/mobile with no functional changes.
- Revisit trigger: If mobile QA shows crowding in search or card metadata rows.

## [2026-02-25] Increase landing-page typography again for stronger visual hierarchy
- Context: A prior 5% increase was still visually smaller than desired for the landing experience.
- Decision: Apply another proportional landing-only typography bump (~10% over the current values) across nav, hero, featured header, listing card metadata/dialog, and footer text sizes.
- Why: Match requested larger type direction while preserving existing responsive clamps and component behavior.
- Impact: All visible landing-page text now renders noticeably larger with no routing, data, or interaction changes.
- Revisit trigger: If text wrapping/crowding appears at smaller breakpoints during QA.

## [2026-02-25] Refine landing primary button styling to screenshot-matched shape and weight
- Context: Landing `Search` and `Login / Sign up` buttons needed tighter visual matching to provided references.
- Decision: Update `editorial-search-btn` and `editorial-login-btn` to softer 14px corners with fixed border weight and adjusted letter spacing/weight, and tune their landing dimensions/text sizing in `Hero` and `Navigation`.
- Why: Preserve existing button behavior while matching the intended visual look more closely.
- Impact: Landing primary CTAs now read closer to the provided mock references with no functional change.
- Revisit trigger: If final brand QA specifies different radius/size tokens for global buttons.

## [2026-02-25] Force landing Search/Login color tokens to override default button variant utilities
- Context: Landing buttons still rendered steel blue because shared default button utility classes overrode custom editorial color declarations.
- Decision: Apply explicit priority (`!important`) to `background-color`, `border-color`, and `color` for `.editorial-search-btn` and `.editorial-login-btn` (including hover state).
- Why: Ensure the requested mint/coral button colors render consistently without changing component logic or shared button behavior.
- Impact: `Search` now reliably renders mint with steel-blue text and `Login / Sign up` reliably renders coral with white text in light mode.
- Revisit trigger: If shared button system is refactored to semantic variants that remove utility-order conflicts.

## [2026-02-25] Invert landing hero surface colors using Cloud Dancer background
- Context: Landing hero needed the outer canvas and inner search shell light tones swapped for closer visual match to design reference.
- Decision: Set hero light-mode background to Cloud Dancer `#F0EEE9` and set the search container surface to `#f5f0e8`; keep dark-mode values unchanged.
- Why: Achieves requested visual inversion without touching search behavior or component structure.
- Impact: Landing hero now shows a warmer outer background with a subtly deeper inner search panel contrast.
- Revisit trigger: If final design QA requests removal of the radial tint or a single flat background color.

## [2026-02-25] Remove hero-to-listings seam by using flat shared Cloud Dancer surface
- Context: A faint horizontal seam remained visible between hero and featured listings after color inversion.
- Decision: Remove hero radial gradient and set both landing root/main background surfaces to flat `#F0EEE9` in light mode.
- Why: Ensures continuous visual surface between hero and listings while preserving all existing component behavior.
- Impact: Landing page now renders as one continuous Cloud Dancer background with no visible break line between sections.
- Revisit trigger: If future design direction reintroduces sectional background contrast intentionally.

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

## [2026-02-25] Apply editorial palette and typography system with persisted light/dark theme toggle
- Context: Website UI needed a cohesive editorial restyle using a strict color palette plus two-brand-font system, while preserving existing booking/navigation behavior.
- Decision: Replace global theme tokens with the new palette (light and dark), switch typography tokens to `Cormorant Garamond` for headings/logo/price styling and `DM Sans` for body/controls, add targeted editorial button/pill style classes for login/search/CTA/category treatments, and add a navigation theme toggle persisted via `localStorage` (`eventhub-theme`) with default light mode.
- Why: Delivers requested visual direction quickly without changing routing, data, or core component logic, and keeps theme behavior predictable across sessions.
- Impact: Primary customer/vendor surfaces now use the editorial palette and typography baseline, specified CTA/button/pill treatments are standardized, and users can switch/persist light/dark theme from navigation.
- Revisit trigger: If post-launch design QA identifies specific pages/components still using legacy hard-coded colors that should be migrated to semantic theme tokens.

## [2026-02-25] Tighten landing page to screenshot-matched editorial composition and token fidelity
- Context: Initial editorial pass needed closer visual parity with the provided reference (logo treatment, hero rhythm, search bar structure, card/section typography, and footer palette usage) while keeping behavior unchanged.
- Decision: Refine landing-only styling for navigation, hero, search shell, featured listings header, listing cards, and footer using strict palette colors and updated Google font weights (`Cormorant Garamond` + `DM Sans`), while retaining existing toggle persistence and page logic.
- Why: Improves launch-facing polish and visual consistency without introducing functional risk or scope creep beyond the landing surface.
- Impact: Home page now presents closer screenshot alignment in both light/dark modes, including refined logo wordmark contrast, compact editorial type hierarchy, screenshot-style search bar controls, and palette-accurate footer styling.
- Revisit trigger: If post-launch accessibility review requires contrast/size adjustments at specific breakpoints.

## [2026-02-25] Scope listing-card title font to heading style only on Home and Browse
- Context: Listing title text under cards needed to use Cormorant Garamond on Landing and Browse Vendors, without affecting other pages that might reuse the shared card.
- Decision: Add a `titleFont` prop to shared `ListingCard` with default `sans`, and pass `titleFont=\"heading\"` only from `Home` and `BrowseVendors`.
- Why: Delivers requested typography change with minimal risk and keeps shared component behavior stable by default.
- Impact: Card titles beneath listings now render in Cormorant Garamond on Landing and Browse Vendors only; other current/future `ListingCard` usages keep default sans titles unless explicitly opted in.
- Revisit trigger: If product direction requires heading-font card titles globally across all listing-card surfaces.

## [2026-02-25] Replace listing-card overlay share glyph with iOS-style white icon
- Context: The listing-card share action icon used a node-link glyph that did not match the requested iOS-style share symbol.
- Decision: Replace the overlay share glyph in `ListingCard` with a square-and-up-arrow icon rendered in white, and remove extra icon chrome styling from that control.
- Why: Aligns listing-card affordance with requested visual direction while preserving existing share modal behavior.
- Impact: On home and browse listing cards, the share action now appears as a white iOS-style share icon over the image overlay with unchanged click behavior.
- Revisit trigger: If we standardize all share affordances platform-wide to a single icon system with shared reusable icon components.

## [2026-02-25] Apply cream interior fill for Browse Sort/Filters cards with parchment page background
- Context: Browse Vendors filter rail needed the Sort and Filters box interiors to use the same cream tone as the hero search interior while the surrounding page remains parchment.
- Decision: Set Sort and Filters card backgrounds to `#F5F0E8` and keep Browse page surface class at `#F0EEE9`.
- Why: Aligns filter panel visual hierarchy with the requested palette and preserves contrast between page background and card interiors.
- Impact: Browse filter rail cards now render cream interiors against the existing parchment page background without structural or behavioral changes.
- Revisit trigger: If filter rail styling is later tokenized into shared semantic surface roles instead of page-specific hex values.

## [2026-02-25] Force readable dark-mode contrast for Browse Sort/Filters controls on cream cards
- Context: After applying cream card interiors, dark mode inherited light text tokens (`text-foreground`/`text-muted-foreground`) inside those cards, causing filter labels and selected values to appear washed out.
- Decision: Keep cream card background and explicitly set card/control text to dark ink on `BrowseVendors` (`text-[#2a3a42]`, darker placeholder/border classes for inputs/select trigger, and fixed helper-text color).
- Why: Preserves requested card colors while ensuring control readability in both themes.
- Impact: Sort/Filters labels, selected values, placeholders, and helper text remain visible in dark mode with no behavior changes.
- Revisit trigger: If browse filters are later moved to fully semantic tokens that already handle mixed-surface contrast automatically.

## [2026-02-25] Keep listing-card title ink readable in dark mode and remove card outlines
- Context: On browse/landing dark mode, listing titles became too light against the fixed light page surface and card edges showed visible outlines not desired in current visual direction.
- Decision: Remove dark-mode title color override in `ListingCard` so titles keep the same dark ink color, and set listing media card border to `border-0`.
- Why: Maintains readable typography on light surfaces while eliminating unwanted card-edge outlines.
- Impact: Listing titles remain legible in dark mode on landing/browse surfaces, and listing cards no longer render border lines around image tiles.
- Revisit trigger: If listing surfaces move back to a truly dark background where title contrast should switch to light ink again.

## [2026-02-25] Replace featured listings multi-column layout with stable responsive grid on Home
- Context: Featured Rentals cards were jumping/reflowing on hover, causing listings to appear/disappear in unexpected positions.
- Decision: Replace CSS multi-column masonry layout in Home listings with an explicit responsive CSS grid (`grid-cols-1..5`) and remove hover z-index wrapper behavior.
- Why: CSS column balancing can reshuffle cards during hover/height changes; grid keeps deterministic card placement.
- Impact: Featured Rentals cards remain visible and stable in correct positions during mouse movement/hover, with no booking/navigation behavior changes.
- Revisit trigger: If we intentionally reintroduce masonry behavior, use a dedicated layout approach that does not rebalance on hover.

## [2026-02-25] Set dark-mode toggle thumb circles to parchment tone
- Context: Toggle thumb circles in dark mode appeared too dark and did not match the requested visual style.
- Decision: Apply `#F0EEE9` to dark-mode switch thumbs in shared `Switch`, plus dark-mode thumb overrides in navigation theme toggle and vendor notifications toggles.
- Why: Keeps dark-mode toggles readable and visually aligned with the existing parchment palette.
- Impact: Toggle circles now render as `#F0EEE9` in dark mode across shared and custom-styled switches without changing toggle logic.
- Revisit trigger: If toggle theming is fully centralized into semantic tokens and component variants.

## [2026-02-25] Match dark-mode off toggle tracks to light-mode visual style
- Context: In dark mode, some toggles (notably notification preferences) used a white off-state track that looked inconsistent with the desired defined off-state style.
- Decision: Set dark-mode unchecked tracks to `#4a6a7d` in shared `Switch` and notification toggle overrides while preserving existing checked-state colors and behavior.
- Why: Makes dark-mode off toggles visually consistent with the preferred light-mode off-toggle appearance.
- Impact: Off toggles in dark mode now present a defined dark-blue track with the existing light thumb color across shared/custom toggle implementations.
- Revisit trigger: If toggles are migrated to a centralized semantic state-token system with dedicated light/dark state mappings.

## [2026-02-25] Surface explicit publish-blocker reasons consistently across vendor publish flows
- Context: Publish failures returned backend validation flags, but vendor UI showed generic errors and sometimes raw payload text, making it unclear what needed to be fixed.
- Decision: Keep publish gate rules unchanged, enrich publish 400 response with optional `reasons` (while preserving `error` + `missing`), and introduce a shared client formatter used by both `VendorListings` and `VendorListingEdit` to render the same human-readable reason list.
- Why: Improves booking-flow reliability and launch speed by reducing vendor confusion without schema changes or validation logic drift.
- Impact: Failed publish attempts now show concrete actionable requirements (title, description, photos, price, service area/mode, radius center/radius) in a consistent format on both publish entry points; unknown/non-validation errors still fall back to a safe generic message.
- Revisit trigger: If publish rules are expanded (e.g., additional required fields), update the backend reason mapping and shared formatter in lockstep.

## [2026-02-25] Apply edit-listing cream/mint palette to scoped surfaces and tan action buttons
- Context: Vendor Edit Listing page needed specific surface/background colors and replacement of tan (`#c9a06a`) action-button styling with mint/steel treatment.
- Decision: On `VendorListingEdit`, set page + sidebar surfaces to `#F0EEE9`, set the six requested section cards (Title & Description, Popular For, Pricing, Photos, Delivery / Setup, Status) to `#F5F0E8`, and replace tan action button classes (Publish + Yes/No selected states) with `#9dd4cc` background and `#4a6a7d` text.
- Why: Aligns page-level visual hierarchy with the requested palette while keeping scope isolated to the Edit Listing experience.
- Impact: Edit Listing now renders with parchment page/sidebar background, cream section panels, and mint/steel action buttons instead of tan accents.
- Revisit trigger: If secondary accent usage is re-standardized globally and these page-local class overrides should be tokenized.

## [2026-02-25] Remove vendor listings card outlines while preserving card layout
- Context: Vendor Listings cards (active/inactive/draft rows) displayed a visible outer outline that was no longer desired.
- Decision: Remove only the outer border on listing row cards in `VendorListings` by adding `border-0` to the card wrapper class.
- Why: Eliminates the unwanted outline without changing card content structure, spacing, actions, or hover behavior.
- Impact: Vendor listing cards now render without outer outline lines, while all listing controls and metadata remain unchanged.
- Revisit trigger: If vendor card design is later standardized to include explicit framed card outlines again.

## [2026-02-25] Propagate vendor-dashboard surface style across non-excluded routes
- Context: Product direction required vendor-dashboard styling parity (buttons/toggles/outline language tied to dashboard surface tokens) across the app, excluding Landing, Browse Vendors, and My Event dashboard routes.
- Decision: Add route-scoped `vendor-dashboard-parity` class toggling in `AppContent` for all routes except `/`, `/browse*`, and `/dashboard*`, and define parity surface token overrides in `index.css` (`background`, `card`, `sidebar`, `popover`).
- Why: Provides broad style consistency via shared theme tokens without per-page rewrites and preserves explicitly excluded surfaces.
- Impact: Non-excluded pages now inherit vendor-dashboard base surface styling by default; Landing, Browse Vendors, and My Event dashboard retain their existing distinct styling.
- Revisit trigger: If route-level theming becomes fully declarative per layout/page type and this global class toggle should be replaced.

## [2026-02-25] Force exact sidebar/main background parity on Vendor Listing Edit
- Context: Vendor Listing Edit sidebar appeared visually different from the main page background due token-driven sidebar slot styling overriding page-level hex classes.
- Decision: Apply explicit `#F0EEE9` overrides to sidebar root plus sidebar header/content/footer slots on `VendorListingEdit`.
- Why: Ensures the left sidebar and main background render as the exact same color on the edit listing route.
- Impact: Sidebar and main background now match precisely on Vendor Listing Edit.
- Revisit trigger: If sidebar slot backgrounds are centralized under shared route theme tokens with guaranteed parity.

## [2026-02-25] Set edit-listing input/select/location field interiors to cream
- Context: Vendor Listing Edit needed all form field interiors (inputs, textareas, select triggers, location picker input) to match the cream field surface used in the page design.
- Decision: Add a shared page-local field surface class (`#F5F0E8`) and apply it to all editable inputs/textareas/select triggers, plus the location picker input via scoped class override.
- Why: Keeps field interiors visually consistent with the requested panel palette while remaining isolated to the edit listing route.
- Impact: All input/selection/location entry surfaces on Vendor Listing Edit now render with `#F5F0E8` interiors.
- Revisit trigger: If form field surfaces are moved to a global semantic token that should replace page-local class overrides.

## [2026-02-25] Change edit-listing form field interiors from cream to white
- Context: With cream section backgrounds, cream input interiors lacked contrast and appeared too similar to surrounding card surfaces.
- Decision: Update the shared edit-listing field surface class and location-picker input override from `#F5F0E8` to `#FFFFFF`.
- Why: Improves field contrast/readability while staying scoped to Vendor Listing Edit.
- Impact: Input boxes, selection boxes, and location picker input on Vendor Listing Edit now render with white interiors.
- Revisit trigger: If form field contrast is later standardized across vendor pages using shared semantic field tokens.

## [2026-02-25] Set edit-listing Popular For option box interiors to white
- Context: Event-type option boxes in the Popular For section still visually blended with the cream card background.
- Decision: Force both checked and unchecked Popular For option label backgrounds to `#FFFFFF` on Vendor Listing Edit.
- Why: Matches requested white interior treatment for selection boxes and improves contrast/readability.
- Impact: Popular For option boxes now render white interiors regardless of checked state.
- Revisit trigger: If selectable option chips are later tokenized with dedicated active/inactive surface states.

## [2026-02-25] Unify Vendor Listing Edit surfaces and field interiors to one parchment tone
- Context: After iterative adjustments, mixed card/input fills on Vendor Listing Edit created unnecessary contrast variation.
- Decision: Set section card backgrounds, input/select/location-picker interiors, and Popular For option box interiors all to `#F0EEE9` on Vendor Listing Edit.
- Why: Delivers a single-surface look per updated direction and removes conflicting white/cream overrides.
- Impact: Main background, section cards, and form/selection surfaces now use the same `#F0EEE9` color on the Edit Listing page.
- Revisit trigger: If form affordance contrast requirements later call for separate field/card surface tokens.

## [2026-02-25] Align Edit Listing Add Photos and Select All button state styling to active Add to listing style
- Context: On Vendor Listing Edit, `Add photos` and `Select all` buttons needed to visually align with the active `Add to listing` button treatment while preserving existing behavior.
- Decision: Add a shared `activeFillButtonClass` (`bg-primary text-primary-foreground hover:bg-primary/90`), apply it to `Add photos` at all times, and apply it to `Select all` only when `allPopularForSelected` is true (outline otherwise).
- Why: Creates consistent action emphasis and state feedback without changing upload/select logic.
- Impact: `Add photos` is now always filled in active style; `Select all` toggles between outline and filled style based on full-selection state.
- Revisit trigger: If button hierarchy on edit forms is redesigned with a centralized action priority system.

## [2026-02-25] Persist latest edit payload when publishing from Vendor Listing Edit
- Context: Publishing directly from Vendor Listing Edit activated listings without persisting unsaved in-form edits (title/pricing/delivery/etc.), causing published data to lag behind visible draft changes unless users clicked Save first.
- Decision: Reuse a shared payload builder in `VendorListingEdit` for both Save and Publish, send `listingData` + `title` with publish requests, and update publish endpoint to validate against and persist optional incoming payload before setting `status=active`.
- Why: Ensures publish action reflects the user’s latest edits and removes a data-loss/confusion path in core listing flow.
- Impact: Clicking Publish on Vendor Listing Edit now saves current draft changes and publishes in one step; validation messages still come from backend publish rules.
- Revisit trigger: If publish/save flows are consolidated into a single backend command endpoint with explicit transaction semantics.

## [2026-02-25] Keep one Add Photos action on Edit Listing and align Save Changes with primary filled action style
- Context: Vendor Listing Edit showed two Add Photos buttons (one steel-blue primary and one outline inside the photo editor), and top Save Changes appeared as outline instead of matching the primary action style.
- Decision: Add an optional `showAddPhotosButton` prop to `InlinePhotoEditor` and disable it on `VendorListingEdit`, while styling top `Save changes` with the same filled action class used by the steel-blue Add Photos button.
- Why: Removes duplicated upload affordances and keeps top-level edit actions visually consistent without changing existing behavior.
- Impact: Vendor Listing Edit now shows exactly one Add Photos button (steel-blue) and one steel-blue Save Changes button; photo upload/save functionality remains unchanged.
- Revisit trigger: If shared photo-editor behavior is standardized and the page-specific Add Photos control is moved fully into or out of the editor component.

## [2026-02-25] Append hourly suffix on public listing-card prices for per-hour listings
- Context: Featured/Browse listing cards showed the numeric price only, making hourly-priced listings ambiguous.
- Decision: Add a shared pricing-unit reader in `listingPrice` and render ` / Hour` after the price on `ListingCard` when the effective unit is `per_hour`.
- Why: Clarifies pricing semantics directly in cards without changing rate calculations or non-hourly displays.
- Impact: Public listing cards now show values like `$75 / Hour` for hourly listings while per-day/other listings remain unchanged.
- Revisit trigger: If card-level pricing copy is redesigned (e.g., unit badges or localized unit strings).

## [2026-02-25] Increase Vendor Dashboard top stat-card title text to 18px
- Context: The three top dashboard stat-card titles (Total Bookings, Revenue, Profile Views) needed larger title typography.
- Decision: Change those `CardTitle` classes in `VendorDashboard` from `text-sm` to `text-[18px]`.
- Why: Improves readability and visual emphasis of key metrics.
- Impact: Only the three top stat-box titles on Vendor Dashboard render at 18px; values/subtext and other pages remain unchanged.
- Revisit trigger: If dashboard typography is centralized into shared heading tokens.

## [2026-02-25] Standardize Vendor Dashboard card titles to 20px
- Context: Dashboard card titles had mixed sizing/weight (`18px` stat titles, `text-lg` setup card, and default sizes in other cards).
- Decision: Set all `CardTitle` instances in `VendorDashboard` to `text-[20px]` and remove the stat-title `font-medium` override so card-title weight is consistent.
- Why: Creates a uniform, clearer heading hierarchy across dashboard cards.
- Impact: Card titles for Total Bookings, Revenue, Profile Views, Complete Your Setup, Recent Activity, Quick Actions, and Profile Details now all render at 20px with consistent title weight.
- Revisit trigger: If global heading tokens are introduced and dashboard-specific title sizing should be inherited from shared typography scales.

## [2026-02-25] Normalize CardTitle typography to 20px where titles were <=20px
- Context: Card-title sizes were inconsistent across pages (`text-sm`, `text-lg`, `text-xl`, and `text-[20px]`) and some stat cards used `font-medium` overrides.
- Decision: Update all explicit `CardTitle` usages at or below 20px to `text-[20px]`, and remove `font-medium` overrides on top stat titles so default `CardTitle` weight applies.
- Why: Keeps heading hierarchy consistent while respecting scope guardrails by not changing card titles already above 20px.
- Impact: Card titles on affected pages now render at 20px with consistent weight; larger card titles (e.g., `text-2xl`/default) are unchanged.
- Revisit trigger: If heading scales are centralized into global typography tokens and per-page class overrides should be removed.

## [2026-02-25] Apply global 15% UI scale with ListingCard size exemption
- Context: Product direction requested a broad 15% size increase across UI controls/typography/surfaces while keeping public listing cards unchanged in size/title/price.
- Decision: Introduce global scale tokens in `index.css` and apply `html { zoom: 1.15; }`, then add an inverse scale class (`.listing-card-scale-exempt`) to `ListingCard` root using `zoom: 0.8695652174`.
- Why: Delivers a consistent site-wide size lift with minimal per-component rewrites and explicitly protects listing card visual baseline.
- Impact: Non-listing-card UI renders ~15% larger across pages; `ListingCard` container/title/price remain at previous baseline on Home and Browse.
- Revisit trigger: If we migrate to a tokenized typography/spacing system where size scaling is controlled by semantic tokens instead of zoom-based global scaling.

## [2026-02-25] Align Customer Dashboard to vendor portal shell and exclude vendor back button from global scale
- Context: Customer My Events dashboard needed the same structural shell pattern as vendor portal (persistent left sidebar + in-shell header), and vendor portal text scaling needed an exception for `Back to Marketplace`.
- Decision: Replace `CustomerDashboard` custom top-nav + inline menu layout with a sidebar-shell layout (`SidebarProvider`, sidebar trigger header, and persistent left `CustomerSidebar`), and add a reusable `.no-global-scale` utility applied to vendor `Back to Marketplace` buttons.
- Why: Creates consistent dashboard layout language between customer and vendor experiences while honoring the explicit back-button sizing exception.
- Impact: Customer dashboard routes now render with a vendor-shell-style left sidebar; vendor back-to-marketplace buttons remain at baseline scale while other vendor portal text remains scaled.
- Revisit trigger: If dashboard shells are consolidated into a single configurable shared shell component with role-based sidebars.

## [2026-02-25] Backfill vendor profile contact/address fields on read and persist onboarding street address
- Context: Existing vendors could have empty Business Email and Street Address in Vendor Dashboard because onboarding did not store `onlineProfiles.streetAddress`, and profile reads returned raw `onlineProfiles` values without fallback normalization.
- Decision: Write `streetAddress` into `onlineProfiles` during onboarding; on `GET /api/vendor/profile`, normalize/backfill missing `onlineProfiles` values (`businessEmail` from account email and address parts from existing saved address labels) and persist that backfill; add a client fallback so Business Email hydrates from account email when profile field is empty.
- Why: Keeps dashboard profile fields populated for both new and existing vendors without schema changes, and aligns visible data with what vendors already provided during signup/onboarding.
- Impact: New onboarding records include `onlineProfiles.streetAddress`; older profiles are auto-repaired on first profile read; Vendor Dashboard now reliably shows Business Email even before manual resave.
- Revisit trigger: If profile/contact fields are moved from JSONB into dedicated typed columns and migration backfills are introduced.

## [2026-02-26] Improve dark-mode readability for public listing titles
- Context: Listing card titles on dark mode became unreadable against dark page backgrounds on Home and Browse.
- Decision: Set `ListingCard` title text to use `dark:text-[#f5f0e8]`, matching the dark-mode section heading color used on Home (`Featured Rentals`), while keeping light-mode color unchanged.
- Why: Fixes readability with minimal risk and preserves existing typography, sizing, and price styling.
- Impact: Listing titles on landing and browse cards are clearly visible in dark mode; no changes to light mode or other listing card text styles.
- Revisit trigger: If public-page typography colors are centralized into semantic tokens for section and card title parity.

## [2026-02-26] Vendor bookings now prioritize payout visibility with explicit fee breakdown in details
- Context: Vendor booking cards were showing gross booking totals, which could diverge from listing prices and obscure what vendors actually earn.
- Decision: On `VendorBookings`, show only `Estimated payout` in list/calendar booking cards and move full fee visibility (listing price, customer fee, customer total, EventHub fee, estimated payout) into the expanded `View details` panel.
- Why: Keeps high-signal earnings visible at a glance while preserving transparency in a dedicated details surface.
- Impact: Vendors see payout-first amounts in booking lists; booking details now include a complete fee breakdown and still include notes/questions when present.
- Revisit trigger: If a dedicated booking-details page/modal is introduced and fee rows should be centralized there.

## [2026-02-26] Normalize mixed legacy booking amount units for vendor stats and bookings UI
- Context: Some booking totals were being interpreted inconsistently between legacy dollar rows and newer cent-based rows, causing inflated displays (e.g., `$26,250`).
- Decision: Update vendor-side normalization to treat non-integer values as dollars, small integers (`<1000`) as legacy dollars, and larger integers as cents.
- Why: Reduces false upscaling for cent-based totals while still preserving readability for older dollar-based rows.
- Impact: Vendor dashboard recent booking amounts and vendor booking cards now render with more reliable cent normalization across mixed historical data.
- Revisit trigger: If a one-time database migration guarantees all monetary values are stored uniformly in cents.

## [2026-02-26] Use “Decline” label for vendor booking rejection actions
- Context: Vendor booking action buttons used the word “Cancel,” which read ambiguously in request-review flows.
- Decision: Rename vendor-side rejection button copy from `Cancel`/`Cancelling...` to `Decline`/`Declining...` while keeping the backend status transition as `cancelled`.
- Why: Improves action clarity for vendors without changing booking-state behavior.
- Impact: Pending/confirmed booking rejection actions now display “Decline” wording in Vendor Bookings UI.
- Revisit trigger: If booking status semantics are renamed from `cancelled` to a dedicated `declined` state in API/database.

## [2026-02-26] Add vendor shell avatar dropdown next to Back to Marketplace
- Context: Vendor portal pages using `VendorShell` needed a top-right profile circle dropdown (matching marketplace nav behavior) immediately to the right of `Back to Marketplace`.
- Decision: Extend `VendorShell` header with a right-side avatar trigger + dropdown menu (Profile, Messages, My Events, Notifications, Account settings, Languages & currency, Help Center, Sign out), sourcing initials from `/api/vendor/me` and using Auth0 logout for sign out.
- Why: Provides consistent, quick account navigation on vendor pages without requiring users to use sidebar-only navigation.
- Impact: All `VendorShell` routes now display the profile circle dropdown beside the Back button; existing routing behavior remains unchanged.
- Revisit trigger: If header/account controls are centralized into a shared authenticated shell component across vendor and customer dashboards.

## [2026-02-26] Add Vendor Dashboard entry to vendor-only header dropdown
- Context: Vendors needed a direct `Vendor Dashboard` shortcut in the new top-right avatar dropdown, positioned directly under `My Events`.
- Decision: Add a `Vendor Dashboard` dropdown item in `VendorShell` under `My Events` linking to `/vendor/dashboard`.
- Why: Improves navigation parity with sidebar routes and matches requested menu ordering.
- Impact: Vendor-only header dropdown now includes `Vendor Dashboard` beneath `My Events`.
- Revisit trigger: If dropdown navigation is consolidated into a shared config-driven menu system.

## [2026-02-26] Remove Messages from vendor top-nav avatar dropdown and add explicit Vendor Dashboard item
- Context: The vendor avatar dropdown in the marketplace top navigation still showed `Messages`, which is ambiguous because vendor and My Events messaging streams differ.
- Decision: Remove `Messages` from the vendor-only top-nav dropdown (`Navigation`) and add an explicit `Vendor Dashboard` item directly under `My Events`.
- Why: Clarifies navigation destinations and avoids cross-dashboard messaging confusion.
- Impact: Vendor top-nav dropdown now lists `My Events` followed by `Vendor Dashboard`, with no `Messages` option.
- Revisit trigger: If messaging streams are unified and a single cross-role messages entry becomes valid again.

## [2026-02-26] Align Browse Vendors dark surfaces with landing dark theme
- Context: Browse Vendors page stayed on light parchment backgrounds in dark mode, creating white sections while landing page correctly used the dark navy theme.
- Decision: Update `BrowseVendors` surface and control classes to add dark-theme variants (`dark:bg-background`, dark card surfaces/borders, and dark input surface/text/placeholder colors) while preserving existing light-mode colors.
- Why: Ensures dark mode visual consistency between landing and browse experiences without changing filtering behavior or layout.
- Impact: In dark mode, browse page background, sort/filter cards, and form controls now render with the same dark surface language as landing instead of light white backgrounds.
- Revisit trigger: If browse and landing both migrate to shared page-surface utility tokens/components.

## [2026-02-26] Show listing title in Vendor Dashboard recent activity rows
- Context: Vendor Dashboard `Recent Activity` rows still showed `Booking #...` identifiers while Vendor Bookings list had already shifted to listing-title-first labeling.
- Decision: Enrich `/api/vendor/stats` recent bookings with `itemTitle` via booking-item context lookup and render `itemTitle` in `VendorDashboard` recent activity, keeping booking-id as fallback.
- Why: Keeps dashboard recent activity naming consistent with bookings view and improves quick scanning for vendors.
- Impact: Recent activity cards now display listing titles (when available) instead of raw booking numbers.
- Revisit trigger: If booking title normalization is centralized in a shared backend serializer used by both stats and bookings endpoints.

## [2026-02-26] Route vendor payment-setup buttons directly to Stripe Connect links
- Context: `Complete Payment Setup` actions were sending vendors to internal `/vendor/onboarding`, which created theme mismatch confusion and did not start Stripe account setup.
- Decision: Add `/api/vendor/connect/setup-link` to generate the correct Stripe destination (create account + onboarding link when needed, resume onboarding when incomplete, dashboard link when complete), and wire Vendor Dashboard/Account/Payments setup buttons to redirect to that URL.
- Why: Aligns button behavior with user expectation and Stripe Connect flow while keeping onboarding wizard available for actual vendor profile onboarding.
- Impact: Clicking payment setup now opens Stripe instead of the internal onboarding form; setup CTA visibility on payments respects `stripeOnboardingComplete`.
- Revisit trigger: If onboarding/payment setup flows are split into explicit dedicated screens with separate role-based entry points.

## [2026-02-26] Resolve Stripe setup-link “Account not found” by using DB-backed vendor account context
- Context: Vendors received `Unable to open Stripe setup: Account not found` because Stripe connect routes looked up accounts through `storage.getVendorAccount`, which reads in-memory state while Auth0 vendor resolution is database-backed.
- Decision: Add a shared `getVendorAccountFromRequest` helper that uses `req.vendorAccount` (set by Auth0 vendor middleware) with DB fallback, and switch vendor connect + related vendor-account reads to this helper; replace connect-route account updates with direct DB updates.
- Why: Keeps account lookup/update source consistent with authenticated vendor identity and avoids memory-vs-DB drift.
- Impact: Payment setup button now resolves existing vendor accounts correctly and can open Stripe onboarding/dashboard links.
- Revisit trigger: If storage layer is refactored to a single DB-backed implementation for vendor account reads/writes.

## [2026-02-26] Move vendor account storage methods from in-memory map to Postgres
- Context: `storage.getVendorAccount()` and related vendor-account methods still used in-memory `Map` state, which can diverge from authenticated DB-backed account resolution and cause route-level inconsistencies.
- Decision: Refactor `getVendorAccount`, `getVendorAccountById`, `getVendorAccountByEmail`, `createVendorAccount`, and `updateVendorAccount` in `storage.ts` to use `vendor_accounts` table reads/writes via Drizzle.
- Why: Eliminates in-memory/vendor-account drift and aligns storage behavior with the authenticated source of truth.
- Impact: Vendor account reads/updates now persist and resolve from Postgres consistently across requests and routes.
- Revisit trigger: If storage interface is split into explicit DB and in-memory implementations for tests versus production.

## [2026-02-26] Restrict vendor payment history list to completed bookings only
- Context: Vendor Payments history was showing pending/cancelled/confirmed rows, but the required behavior is to show only completed bookings as payment history.
- Decision: Filter `/api/vendor/payments` history rows to `status === completed` before building response records.
- Why: Keeps payment-history semantics aligned with realized/completed earnings rather than in-flight or cancelled jobs.
- Impact: Payment History list now includes only completed bookings; pending/cancelled/confirmed rows no longer appear there.
- Revisit trigger: If payments UI later adds explicit tabs/sections for pending or cancelled payout-related items.

## [2026-02-26] Move vendor payment setup CTA into dedicated section below payment history
- Context: Payments tab briefly flashed the setup CTA inside empty-state content during refresh because `vendorAccount` starts undefined and the previous inline condition evaluated truthy.
- Decision: Remove the setup CTA from the payment-history empty state and render a dedicated `Complete Your Setup` card below Payment History only when `stripeOnboardingComplete === false`.
- Why: Eliminates refresh flicker and keeps setup affordance in a stable location while preserving behavior for incomplete Stripe accounts.
- Impact: No temporary setup-button flash on reload; vendors with incomplete Stripe setup see a persistent setup section below payment history.
- Revisit trigger: If payments page is redesigned with a unified status/alerts rail for onboarding blockers.

## [2026-02-26] Use listing title instead of booking number in vendor payments history rows
- Context: Vendor Payments history rows still showed `Booking #...` while vendor-facing booking surfaces use listing-title-first labels.
- Decision: Enrich `/api/vendor/payments` completed-history rows with `itemTitle` via booking-item context and render `itemTitle` in `VendorPayments` with booking-id fallback.
- Why: Improves scanability and keeps naming consistent across vendor portal booking/payment views.
- Impact: Payments history now hides booking number when listing title is available and shows listing title in its place.
- Revisit trigger: If booking/listing label formatting is centralized into one shared serializer for all vendor endpoints.

## [2026-02-27] Remove card-level zoom and shift aspect-ratio sizing to image for Safari listing visibility
- Context: Vendor Shop listing cards in Safari could render as blank/hidden until hover, with hover controls appearing over empty areas.
- Decision: Stop applying `zoom` through `.listing-card-scale-exempt` on listing cards and move ratio sizing from the image container to the image/fallback element itself in `ListingCard`.
- Why: Safari has fragile paint/layout behavior with nested `zoom` + column/masonry-like flows; removing card-level zoom and using intrinsic image sizing avoids zero-height/blank card states.
- Impact: Listing cards render consistently across Vendor Shop, Landing, and Browse without hover-only visibility artifacts.
- Revisit trigger: If global scale is reimplemented without CSS `zoom` (e.g., tokenized sizing or transform-based scale strategy) and card-level compensation is no longer needed.

## [2026-02-27] Use partial schema for vendor profile PATCH updates to prevent legacy-shape save failures
- Context: Vendor Shop saves were failing with `Validation failed` because `PATCH /api/vendor/profile` revalidated merged profile data against onboarding/create constraints, which can reject legacy or previously-valid profile shapes unrelated to the edited shop fields.
- Decision: Introduce a dedicated `updateVendorProfileSchema` for partial updates and update only provided fields, with object-merge behavior for `onlineProfiles`.
- Why: Vendor Shop edits should not fail because of unrelated historical profile values; partial updates are safer for incremental UI edits.
- Impact: Shop detail saves now persist optional fields in `onlineProfiles` without requiring full profile revalidation against onboarding rules.
- Revisit trigger: If profile data is migrated to a strict versioned schema and a centralized migration path guarantees all profile rows conform before updates.

## [2026-02-27] Remove under-card vendor identity pill from listing cards
- Context: The vendor-name pill below each listing card added visual clutter and was explicitly requested to be removed.
- Decision: Remove the under-card vendor avatar/name pill render block from `ListingCard`, keeping title/price and optional `Visit {business}` action behavior unchanged.
- Why: Improves scanability of listing stacks and aligns card presentation with current storefront direction.
- Impact: Listing cards no longer render the business-name badge directly beneath the image.
- Revisit trigger: If a compact vendor identity treatment is reintroduced as part of a unified card metadata redesign.

## [2026-02-27] Move vendor-shop CTA from listing cards to listing detail and restore smaller card density on Home/Browse
- Context: Vendor shop links should not appear around listing cards, and listing cards on Landing/Browse were unintentionally too large after layout changes.
- Decision: Disable `Visit {vendor}` card CTA by default in `ListingCard`, add vendor-shop CTA inside `ListingDetail` vendor section, and restore Home/Browse listing layouts to the smaller multi-column grid density (`1/2/3/4/5` responsive columns).
- Why: Keeps cards visually clean in feed views while preserving vendor-shop discoverability at a deeper-intent touchpoint (listing detail).
- Impact: No vendor-shop button around listing cards on Landing/Browse; vendor-shop entry now appears on listing detail; card size changes are limited to Landing and Browse pages only.
- Revisit trigger: If product direction reintroduces in-card vendor CTAs or a unified card/linking strategy across all listing surfaces.

## [2026-02-27] Prevent vendor listing cards from stretching to tallest card height in horizontal rows
- Context: In Vendor Listings sections, shorter cards were stretching vertically to match the tallest card, causing excess empty bordered space.
- Decision: Set the horizontal card row flex container to `items-start` so each card keeps its intrinsic content height.
- Why: Flexbox default cross-axis stretch was forcing equal-height cards; top alignment preserves intended proportional card outlines.
- Impact: Active/Inactive/Draft listing card borders now end at each card’s own content instead of stretching to row max height.
- Revisit trigger: If Vendor Listings switches from horizontal flex rows to masonry/grid cards with a shared card wrapper component.

## [2026-02-27] Match active status badge styling to draft badges in Vendor Listings cards
- Context: Vendor requested the top-left `Active` status chip to match the visual style used by `Draft`.
- Decision: Render `Active` with the same `Badge` variant (`secondary`) used for `Draft` in `VendorListings` card overlays.
- Why: Keeps status chips visually consistent and reduces unnecessary style differences between editable listing states.
- Impact: Active listing cards now display the same badge treatment as draft cards in the top-left overlay.
- Revisit trigger: If listing status chips are redesigned into a centralized status-color system across vendor surfaces.

## [2026-02-27] Use shortest-column masonry layout for Landing and Browse listing feeds
- Context: Standard row-based grid on Landing/Browse created large vertical voids under shorter cards on wider screens, breaking the desired Pinterest-style rhythm.
- Decision: Introduce `MasonryListingGrid` that distributes listings into responsive columns (`1/2/3/4/5`) by assigning each next listing to the current shortest column using a card-height estimate.
- Why: Preserves top-aligned first-row cards, enforces consistent inter-card vertical gaps, and reduces ragged bottom depth compared to fixed grid rows.
- Impact: Landing and Browse feeds now behave like true masonry stacks during normal browsing and filtered/searched result changes without affecting Vendor Shop or portal listing layouts.
- Revisit trigger: If we adopt native CSS masonry support or a shared virtualization/grid library with measured-height column packing.

## [2026-02-27] Enforce left-packed masonry columns on Landing/Browse while preserving height balancing
- Context: Shortest-column placement could produce visually empty left-side slots on the second row, which looked like a gap/hole in the feed.
- Decision: Update `MasonryListingGrid` placement to only allow assignments that preserve non-increasing per-column counts from left to right (`c0 >= c1 >= c2 ...`), then choose the lowest projected-height column among valid candidates.
- Why: Guarantees no left-side holes while still using height-aware balancing for lower ragged bottoms.
- Impact: Listings visually fill left-to-right without left gaps, and card stacks remain masonry-like with consistent vertical spacing.
- Revisit trigger: If CSS native masonry or a measured-positioning library is adopted and can natively enforce left-packed placement rules.

## [2026-02-27] Optimize masonry depth with capacity-aware placement while preserving vendor-set card shapes
- Context: Left-packed placement removed left-side gaps but still could leave a deeper-than-necessary final bottom edge.
- Decision: Keep listing card shapes untouched and switch to a capacity-aware packing heuristic: sort listings by estimated rendered height, then place each listing into columns with remaining capacity by prioritizing fewer remaining slots first and then shorter current height.
- Why: This pushes larger cards into columns that will receive fewer total cards, reducing the deepest final column while preserving left-to-right fill behavior.
- Impact: Landing/Browse masonry keeps vendor-defined cover ratios, avoids left gaps, and better minimizes the lowest bottom point after stacking.
- Revisit trigger: If we introduce measured DOM-height packing (post-render) or a dedicated masonry engine that can optimize exact pixel heights.

## [2026-02-27] Keep landing/browse listing-card max size stable when result count is small
- Context: When filtered result count was lower than responsive column count, masonry reduced the number of columns to result count, causing cards to stretch excessively wide.
- Decision: Keep responsive column count based on viewport width (not result count) and allow empty trailing columns when needed.
- Why: Preserves existing shrink-on-smaller-screens behavior while capping max card size to normal feed dimensions.
- Impact: Listing cards no longer become oversized when only a few results are visible; max card width stays consistent with the standard feed.
- Revisit trigger: If we add a dedicated max-card-width token with centered packing that can achieve the same cap without empty trailing columns.

## [2026-02-27] Increase share-feedback contrast for listing link copy confirmation
- Context: In the listing share modal, `Link copied.` feedback text had low contrast and was hard to read.
- Decision: Set share feedback text color to a stronger blue (`#2563eb`) in `ListingCard`.
- Why: Improves visibility and confirmation clarity after copy/share actions.
- Impact: Copy confirmation text is now clearly readable against the modal background.
- Revisit trigger: If feedback text colors are centralized into semantic success/info tokens across dialogs.

## [2026-02-27] Use theme primary token for listing share-copy feedback color
- Context: Hardcoded blue feedback color did not match Event Hub theme colors.
- Decision: Replace hardcoded `#2563eb` with `text-primary` for share-copy feedback in `ListingCard`.
- Why: Keeps confirmation messaging on-brand and consistent with existing color tokens.
- Impact: `Link copied.` now uses the darker theme blue instead of a custom off-theme color.
- Revisit trigger: If share feedback adopts a dedicated semantic token (e.g., info/success) distinct from primary actions.

## [2026-02-27] Use same-tab Auth0 redirect for customer login and unauthenticated booking attempts
- Context: Popup-based Auth0 login created a small authorization window that felt visually off-brand and disruptive.
- Decision: Replace popup-first login with `loginWithRedirect` in user-facing auth modal flows and in unauthenticated booking-trigger flows (`ListingDetail` and `Checkout`), while preserving existing `appState.returnTo` behavior.
- Why: Full-page redirect creates a cleaner login experience and keeps return navigation unchanged after authentication.
- Impact: Clicking login or attempting to book while logged out now opens Auth0 in the same tab and returns users to the same page after login; other non-user-facing/test flows remain unchanged.
- Revisit trigger: If we later implement a custom-branded Auth0 Universal Login page or decide to reintroduce popup login in select contexts.

## [2026-03-02] Make shared sidebar brand links return home and unify switch styling to the mint/blue control palette
- Context: Portal sidebars showed a non-clickable top-left EventHub brand block, and shared toggle styling had drifted across pages from the requested mint search-button palette.
- Decision: Wrap the shared vendor/customer sidebar brand blocks in home links and centralize the shared `Switch` styling to use a mint checked track, white unchecked track, and blue thumb, while removing local switch color overrides so they inherit the shared appearance.
- Why: This preserves existing layout while making the primary brand affordance consistently return users to the landing page and keeps toggles visually consistent across portal and marketplace surfaces.
- Impact: Clicking the top-left EventHub brand in either sidebar now routes to `/`, and switch controls across the app use the same requested mint/white track states with a blue thumb without changing toggle behavior.
- Revisit trigger: If branding or route-specific control theming is redesigned into a layout-level theme system with intentionally different sidebar or toggle treatments.

## [2026-03-02] Use booking-detail modals in vendor notifications instead of booking route jumps
- Context: The vendor notifications center treated each row as a route jump, which caused read-before-navigate errors and did not expose enough booking context inside the notification flow.
- Decision: Keep non-booking notifications as static read-only cards, but resolve booking-related notifications against vendor booking data and open a read-only modal with booking details; also store the booking id in new booking notification links and title new booking alerts as `New booking for [listing title]`.
- Why: This preserves the booking-request workflow inside the vendor portal, fixes the broken click path, and surfaces the booking details vendors need without forcing a context switch to the bookings page.
- Impact: New booking notifications now open in-place detail modals with pricing, timing, notes/questions, and listing context; new notifications carry booking-specific metadata; non-booking notifications no longer imply that they can be opened.
- Revisit trigger: If notifications gain first-class typed metadata (for example a dedicated `bookingId` column or JSON payload) or if the notifications center becomes a broader inbox with per-type detail layouts.

## [2026-03-02] Raise global UI scale by 25% while exempting protected marketplace surfaces
- Context: Product direction called for a broad 25% size increase across the app, while explicitly keeping the landing hero, listing-card surfaces, listing-detail page content, and all `Back to Marketplace` buttons at their prior size.
- Decision: Increase the existing global zoom token by 25% and use the existing inverse-scale helper to exempt the shared hero, shared listing-card wrapper, listing-detail root, and every `Back to Marketplace` button instance.
- Why: A token-level scale change is the thinnest way to make a broad UI-size adjustment without touching dozens of page-specific classes, and explicit opt-outs keep the protected surfaces visually unchanged.
- Impact: Most app chrome, text, spacing, and controls render noticeably larger, while the excluded surfaces retain their previous sizing.
- Revisit trigger: If the app moves away from the current global zoom approach toward component-level size tokens or if additional surfaces need to be excluded from broad scale changes.

## [2026-03-02] Increase shared card typography and smallest text utilities by 15%
- Context: Product direction called for a secondary typography pass that makes all shared card titles, all shared card descriptions, and the smallest text styles used across the app feel more readable without requiring page-by-page edits.
- Decision: Add a shared 15% scale hook to `CardTitle` and `CardDescription`, keep `CardDescription` on a dedicated base size class so it does not double-scale, and override the global `text-xs` and `text-sm` utility sizes to 15% larger values.
- Why: Centralized typography changes preserve launch velocity and ensure consistent sizing in dashboards, dropdowns, forms, and modals instead of relying on scattered one-off class edits.
- Impact: Every `CardTitle` renders 15% larger than its assigned font size, every `CardDescription` renders 15% larger even when locally overridden, and all `text-xs` / `text-sm` text across the app now appears 15% larger.
- Revisit trigger: If typography is later moved to semantic design tokens or if certain surfaces need separate small-text scales rather than global utility overrides.

## [2026-03-02] Animate the landing hero keyword as a vertical rotating word stack
- Context: The landing hero headline needed a more dynamic focal point without changing its overall typography, color treatment, or layout structure.
- Decision: Replace the static `Pros` word in the hero headline with a CSS-driven overflow-hidden vertical word stack that rotates through `Vendors`, `Rentals`, `Venues`, and `Pros`, includes a duplicated first frame for a seamless loop, and stops animating for users who prefer reduced motion.
- Why: A CSS-only animation keeps the implementation light, avoids timer state in the hero, and preserves the existing headline composition while adding motion to only the emphasized keyword.
- Impact: The landing hero now cycles the highlighted word smoothly with readable pauses on desktop and mobile, while the rest of the hero remains unchanged.
- Revisit trigger: If hero motion expands into a broader animation system, or if product wants per-word timing/content to be CMS-driven instead of hardcoded in the component.

## [2026-03-02] Lock the rotating hero keyword to a fixed baseline and gap
- Context: The first rotating hero implementation let the highlighted word drift upward between frames and caused the perceived gap after `Event` to feel inconsistent.
- Decision: Refactor the first-line hero lockup into an inline flex row with a fixed gap, and place each rotating word in a fixed-height bottom-aligned slot so every frame shares the same baseline and left edge.
- Why: Structural alignment is more reliable than relying on inline text metrics during transform-based animation.
- Impact: The rotating hero keyword now stays flush with `Event` throughout the loop, and the spacing between `Event` and the animated word remains constant on desktop and mobile.
- Revisit trigger: If the hero headline is redesigned away from the current two-line lockup or if the animated word list becomes variable-length content.

## [2026-03-02] Use per-word overlay animation for the hero keyword cycle
- Context: The moving word-stack variant still produced a visibility bug in the browser, where only the first word rendered reliably.
- Decision: Replace the translated shared stack with a fixed-size keyword viewport that overlays one absolutely positioned word per frame, using staggered negative animation delays so each word animates independently through the same 12-second loop.
- Why: Independent per-word animation removes the rendering dependency on a translated multi-line stack and makes the visible slot deterministic.
- Impact: Each hero keyword now stays visible for its full pause interval while preserving the fixed baseline and fixed gap next to `Event`.
- Revisit trigger: If the hero copy becomes dynamic enough that the visible keyword width must be measured from content instead of using a fixed sizing reference.

## [2026-03-02] Add internal right overhang room for the rotating hero comma
- Context: Italic punctuation on the rotating hero keyword was clipping against the right edge of the fixed keyword viewport.
- Decision: Add a small internal right padding to the rotating keyword container and cancel it with an equal negative right margin so the comma has render room without changing the visible layout width.
- Why: This fixes punctuation clipping while preserving timing, baseline alignment, spacing after `Event`, and the overall headline layout.
- Impact: The comma after each rotating hero keyword now renders fully throughout the loop on desktop and mobile.
- Revisit trigger: If the hero keyword font treatment changes away from the current italic style or if the keyword viewport is redesigned to size dynamically from live content.

## [2026-03-02] Restore the rotating hero keyword markup after static regression
- Context: The hero headline stopped animating because the component was rendering a static `Pros,` span even though the rotation CSS remained in place.
- Decision: Restore the rotating hero lockup markup in `Hero.tsx` and set the four keyword phases with staggered inline animation delays, while keeping the existing shared animation CSS and comma-overhang fix unchanged.
- Why: Reinstating the minimal missing markup is the fastest way to recover the intended motion without changing timing, spacing, baseline alignment, or layout behavior.
- Impact: The hero headline again rotates through `Vendors,`, `Rentals,`, `Venues,`, and `Pros,` with readable pauses and a fully visible comma.
- Revisit trigger: If hero copy or timing needs to become configurable outside the component instead of staying hardcoded in the current four-word cycle.

## [2026-03-02] Keep booking pricing server-locked at booking creation
- Context: The booking flow already stored total, deposit, payment schedules, and booking item prices at booking creation, but checkout was still sending client-computed price fields that the server ignored.
- Decision: Keep the existing server-side price snapshot as the source of truth and remove client-supplied `totalAmount` and `depositAmount` from the booking API contract and checkout request payload.
- Why: This makes the locked-price behavior explicit and prevents any later confusion about whether the booking API trusts live client pricing.
- Impact: A customer’s booked amount remains fixed from the listing price at the moment the booking is created, while vendors can still change listing prices for future customers only.
- Revisit trigger: If bookings later support multi-item carts, negotiated quotes, or package/add-on pricing that requires a richer server-side pricing snapshot model.

## [2026-03-02] Auto-save profile photo changes separately from broader profile forms
- Context: The customer and vendor profile photo areas needed a smaller `Edit photo` button, a dedicated `Change Photo` action, and immediate persistence of photo changes without requiring the main form save buttons.
- Decision: Add photo-only save paths on both profile surfaces, keep `Edit photo` for crop/reposition, add a stacked `Change Photo` button that reuses the existing upload picker flow, and auto-save select/change/remove actions independently of the rest of each form.
- Why: Photo changes should feel immediate and should not accidentally save unrelated draft text fields just because the user changed an image.
- Impact: Customer profile photos and vendor shop profile images now persist as soon as the image is selected, changed, edited, or removed, while the larger profile form save actions remain focused on non-photo fields.
- Revisit trigger: If profile editing is later consolidated into a shared form state system or if photo uploads move into a reusable shared component.

## [2026-03-02] Restyle the customer chat back button to match portal theme
- Context: The `Back to events` control in the customer messages sidebar looked visually disconnected from the rest of the portal theme.
- Decision: Change the button label to `Back` and restyle it as a filled blue portal-theme button instead of a muted outline control.
- Why: This keeps the navigation action visually consistent with the rest of the customer portal while simplifying the label.
- Impact: The customer messages sidebar now shows a clearer, theme-aligned `Back` button when drilling into a specific event thread list.
- Revisit trigger: If the chat sidebar controls are later moved to shared button variants or if product wants breadcrumb-style navigation instead of a back button.

## [2026-03-02] Make the create-listing wizard shell a solid page surface
- Context: The create-listing flow looked like frosted glass because its fullscreen shell used a semi-transparent background with backdrop blur.
- Decision: Remove the wizard shell blur/transparency and render the outer shell, sidebar, and main panel on the same solid beige page background used across the site.
- Why: The create-listing flow should read like a stable working surface, not a modal glass layer, and this keeps the fix limited to shell styling only.
- Impact: The create-listing view no longer shows blurred background bleed-through and now matches the rest of the site’s solid light theme.
- Revisit trigger: If the listing creation flow is later redesigned into a true modal/sheet pattern with a separate dedicated overlay system.

## [2026-03-02] Match slider thumbs to the filled track color
- Context: The service-radius sliders showed a primary-colored filled range on the left, but the draggable thumb stayed on the neutral page background.
- Decision: Update the shared slider thumb fill from `bg-background` to `bg-primary` while keeping the existing primary border and focus styling.
- Why: The thumb should read as part of the active range and visually match the left side of the slider.
- Impact: Radius sliders now show a solid primary-colored thumb that matches the filled track segment.
- Revisit trigger: If the app later needs different slider themes per context instead of one shared slider appearance.

## [2026-03-02] Replace global page zoom with real font sizing
- Context: The app was using `html { zoom: ... }` plus inverse zoom exceptions, which made Chrome and Safari render the overall layout differently and broke Safari Mapbox rendering.
- Decision: Neutralize the global UI zoom variables, remove the `html` zoom scaling, add a modest global font-size bump on `html`, and neutralize the card text zoom helper so the app uses normal browser layout metrics again.
- Why: Browser-level zoom is not a stable cross-browser layout system; real font sizing is a safer base for consistent rendering.
- Impact: Chrome and Safari should now render the same structural layout much more closely, with text still slightly enlarged for readability but without the previous oversized Chrome scaling and Safari zoom side effects.
- Revisit trigger: After reviewing the app visually in both browsers, if more typography tuning is needed, move remaining sizing adjustments into shared semantic type and spacing tokens instead of zoom-based helpers.

## [2026-03-03] Keep `/vendor/login` as an Auth0 compatibility handoff route
- Context: Unauthenticated vendor sessions were still being sent to a legacy custom email/password form at `/vendor/login`, even though the active vendor portal already relies on Auth0 session state.
- Decision: Remove the custom vendor login form UI, keep `/vendor/login` as a compatibility route that immediately starts Auth0 sign-in with popup-first behavior and redirect fallback, and preserve the intended vendor return path through `returnTo`.
- Why: This keeps stale links and timeout redirects working without exposing a second login system that no longer matches the active Auth0-based vendor portal.
- Impact: Timed-out vendor sessions now reopen Auth0 instead of landing on the legacy form, and successful re-authentication returns vendors to the vendor page they were trying to access.
- Revisit trigger: If vendor auth is later fully unified with the customer Auth0 entry points or product wants a dedicated branded vendor auth surface again.

## [2026-03-05] Normalize vendor shop profile photos to remove square/padding artifacts
- Context: Some vendor shop profile photos displayed as a smaller square-like image inside the circular avatar frame, causing mismatch between edit expectations and the customer-facing view.
- Decision: Normalize shop profile images through canvas processing (including transparent-edge trimming) when loading/uploading, and render the circular preview with a full-cover base image plus positioned crop overlay.
- Why: This preserves the current edit UX while ensuring the saved photo visually fills the circular frame without square outlines in vendor and customer views.
- Impact: Edited/uploaded shop photos now render as full-circle avatars in the vendor editor and the public vendor hub header.
- Revisit trigger: If profile media processing moves server-side or if a shared avatar processing utility is introduced across all profile surfaces.

## [2026-03-05] Rename vendor shop surface labels and page files to hub naming
- Context: Product direction renamed the vendor-facing shop surface from `Vendor Shop` to `My Hub` and asked for customer-facing naming/file alignment.
- Decision: Rename page files to `myhub.tsx` (vendor-facing) and `vendorhub.tsx` (customer-facing), update route imports, and update the vendor sidebar and page labels to `My Hub` / `Vendor Hub`.
- Why: This keeps naming consistent across code and UI while preserving existing route paths and behavior for launch stability.
- Impact: Vendors now see `My Hub` in navigation and page headings; customer-facing shop page uses `Vendor Hub` labeling; app routing continues to work with the existing URLs.
- Revisit trigger: If route paths themselves are renamed from `/vendor/shop` and `/shop/:vendorId` in a future URL-cleanup pass.

## [2026-03-05] Expand My Hub inputs to power the full public Vendor Hub layout
- Context: The new customer-facing Vendor Hub layout requires more structured vendor-provided content than the original minimal storefront form.
- Decision: Add required My Hub inputs for cover photo, tagline, service area label, in-business-since year, specialties, and events-served baseline, and persist them in `vendor_profiles.online_profiles` alongside existing profile fields.
- Why: The public page cannot reliably render the requested hero, quick-info, and specialty sections unless those fields are explicitly captured from vendors.
- Impact: Vendors must now complete these fields before saving My Hub updates; public Vendor Hub pages receive richer structured profile content.
- Revisit trigger: If profile fields move from `online_profiles` JSON into first-class schema columns.

## [2026-03-05] Compute Vendor Hub quick-info metrics from live platform data
- Context: Product required `Events Served` to combine a vendor-entered starting count with platform activity, and `Avg. Response Time` to be computed from real chat timestamps.
- Decision: Compute completed-booking counts server-side per vendor, add them to a non-negative baseline from profile settings, and compute average vendor response minutes from Stream channel message timelines for the vendor’s booking chats.
- Why: This keeps quick-info metrics credible by grounding them in actual booking/chat behavior while still allowing migration-friendly vendor baseline values.
- Impact: Vendor Hub now shows derived events-served totals, response-time badges, review aggregates, and richer review feeds without manual metric entry by vendors.
- Revisit trigger: If chat metrics should be pre-aggregated/cached for performance or moved to analytics pipelines instead of request-time computation.

## [2026-03-05] Rebuild customer Vendor Hub page to match guided structure with Event Hub theming
- Context: The previous Vendor Hub page was a lightweight listings-plus-about surface and did not match the requested storefront composition.
- Decision: Recompose the public page into the requested structure: hero cover + profile block, ratings line, quick info card, specialties card, available rentals grid, and full review summary/list, while intentionally omitting `message first` and `Find me online`.
- Why: Matching the requested layout improves perceived storefront quality without introducing an off-theme visual system.
- Impact: Customers now see a richer, guide-aligned Vendor Hub page that uses existing Event Hub color tokens/typography and surfaces more vendor trust signals.
- Revisit trigger: If design direction changes from fixed handcrafted layout sections to modular, configurable storefront blocks.

## [2026-03-05] Reuse shared masonry ListingCard on public Vendor Hub listings
- Context: The public Vendor Hub listing section was rendering custom bordered cards that visually diverged from the site-wide vendor-facing masonry listing cards.
- Decision: Replace the public Vendor Hub custom listing card rendering with the same shared `ListingCard` component and masonry column wrapper used in My Hub.
- Why: Reusing the shared listing card implementation keeps typography, spacing, hover behavior, and border treatment consistent across vendor and customer storefront contexts.
- Impact: Customer-facing Vendor Hub listings now match the existing masonry card layout style and no longer show the previous bordered custom card shells.
- Revisit trigger: If product later requires a distinct customer-only listing card variant that intentionally diverges from vendor-facing card styling.

## [2026-03-05] Make Vendor Hub hero full-bleed with below-cover identity row
- Context: The top of the public Vendor Hub page still layered multiple controls and labels directly over the cover image, and kept a separate `Browse Listings` button that was not needed for a single-page listings view.
- Decision: Convert the hero to a full-width taller cover area with no decorative overlays, keep only a subtle top-right `Exit Customer Mode` control (when viewing in vendor preview mode), place a smaller profile avatar at the lower-left with 50% overlap, and move business identity/review summary below the cover.
- Why: This aligns the storefront header with the requested visual hierarchy: emphasize media first, keep controls minimal, and present vendor identity directly below the hero.
- Impact: The cover now spans edge-to-edge without border framing, the profile image overlaps the cover edge, business name/reviews sit below the hero, and the prior `Browse Listings` CTA is removed while listings remain in the shared masonry feed.
- Revisit trigger: If responsive behavior on very small screens needs further refinement for avatar overlap offsets or if product introduces additional hero actions.

## [2026-03-05] Keep Vendor Hub hero height stable when cover image is missing or fails
- Context: Vendors without a saved cover image could end up with a visually collapsed hero strip on the public Vendor Hub.
- Decision: Make the hero container own a fixed responsive height (`clamp(...)`) with a built-in gradient base, then layer the cover image absolutely only when it is available and has not failed to load.
- Why: The section should preserve visual hierarchy even before a cover is uploaded, and should degrade gracefully when a stored image URL is invalid.
- Impact: Public Vendor Hub always shows a full-height hero area; cover photos render when available; missing/broken covers fall back to a visible gradient instead of collapsing.
- Revisit trigger: If cover images move to a validated media pipeline that guarantees URL availability and dimensions.

## [2026-03-05] Align Vendor Hub avatar-left to storefront name block
- Context: The profile avatar sat left of the business-name text column in the public Vendor Hub header.
- Decision: Position the avatar in the same centered content container and apply the same left offset values as the business-name block (`ml-[5.75rem]` / `sm:ml-[7rem]`) while keeping the existing avatar size and `translate-y-1/2` overlap.
- Why: Matching left edges creates a cleaner header alignment without changing vertical overlap behavior or avatar sizing.
- Impact: Avatar now sits directly above the business-name text column with unchanged size and 50% overlap.
- Revisit trigger: If header spacing tokens or breakpoint padding values are redesigned, re-check offset parity between avatar and identity text.

## [2026-03-05] Increase Vendor Hub avatar size by 25% without scaling transforms
- Context: Product requested a larger storefront profile avatar while preserving existing alignment and overlap behavior.
- Decision: Increase avatar dimensions from `h-20/w-20` to `h-[6.25rem]/w-[6.25rem]` and from `sm:h-24/w-24` to `sm:h-[7.5rem]/w-[7.5rem]`, keeping the same left offsets and `translate-y-1/2`; adjust identity row top padding to maintain clear separation.
- Why: Explicit dimension changes satisfy the “no zoom” requirement and keep layout math deterministic across breakpoints.
- Impact: The avatar renders 25% larger while remaining aligned with the business-title left edge and preserving 50% cover overlap.
- Revisit trigger: If avatar tokenization is introduced for shared header components, move these hardcoded dimensions into shared design tokens.

## [2026-03-05] Lock Vendor Hub content columns to left-info and right-listings/reviews
- Context: Product requested explicit storefront composition with vendor info cards on the left and listing/review content on the right, matching provided layout references.
- Decision: Enforce a two-column layout from medium breakpoints upward with fixed left info width and flexible right content width, keep masonry listing cards in the right column, and keep the reviews section directly beneath listings in that same right column.
- Why: Explicit grid constraints remove ambiguity and preserve the expected information hierarchy across common desktop/tablet widths.
- Impact: `About the Vendor`, `Quick Info`, and `Specialties` remain stacked on the left; `Available Rentals` masonry and `What Clients Say` render on the right with reviews below listings.
- Revisit trigger: If storefront layout becomes component-configurable or if responsive breakpoints are globally retuned.

## [2026-03-05] Harden Vendor Hub header/avatar sizing and column grid classes
- Context: A follow-up storefront iteration produced an oversized avatar rendering and a collapsed single-column content layout where the left/right sections stacked unexpectedly.
- Decision: Replace fragile arbitrary avatar size values with explicit pixel-based width/height classes (`100px` / `120px`) and switch grid template classes to Tailwind-safe underscore syntax (`md:grid-cols-[340px_1fr]`, `lg:grid-cols-[360px_1fr]`).
- Why: These class forms are more reliable for Tailwind extraction and prevent runtime regressions in critical storefront layout areas.
- Impact: Avatar no longer overwhelms the hero area, and desktop/tablet reliably show left info cards with right masonry listings/reviews.
- Revisit trigger: If shared layout tokens are introduced for hub pages, migrate these hardcoded values into shared utilities/components.

## [2026-03-05] Use explicit Vendor Hub avatar CSS and standard grid split for preview stability
- Context: The vendor preview path (`My Hub` -> `Enter Customer Mode`) still showed an oversized hero avatar and stacked content despite prior class-level fixes.
- Decision: Move avatar size control to explicit CSS (`.vendor-hub-avatar` at 100px/120px) and use standard Tailwind layout classes (`lg:grid-cols-3` with `lg:col-span-1/2`) instead of arbitrary grid templates for the main content area.
- Why: Explicit CSS and standard Tailwind grid classes are less fragile across build/cache paths and make preview rendering deterministic.
- Impact: Avatar size is constrained, title alignment remains intact, and desktop preview consistently renders info cards on the left with listings/reviews on the right.
- Revisit trigger: If hub layout is extracted to shared layout primitives, consolidate these page-specific sizing/grid rules there.

## [2026-03-05] Harden Exit Customer Mode placement and return behavior in Vendor Hub preview
- Context: In customer preview mode, the `Exit Customer Mode` control appeared misplaced and did not reliably return vendors to `My Hub`.
- Decision: Anchor the button in the cover hero using explicit `top/right` positioning and route to `/vendor/shop` with a direct browser navigation fallback.
- Why: This avoids fragile positioning outcomes and ensures vendors can always exit preview mode back to the editing surface.
- Impact: The exit control now renders at the top-right of the cover and consistently returns to `My Hub`.
- Revisit trigger: If preview mode gets a dedicated route/state manager, replace the direct navigation fallback with centralized preview-exit handling.

## [2026-03-05] Allow Vendor Hub avatar overlap to render outside hero bounds
- Context: The overlapping storefront avatar appeared cut in half at the hero bottom edge.
- Decision: Change the hero wrapper from `overflow-hidden` to `overflow-visible` so the lower half of the 50% overlap is not clipped.
- Why: The intended design requires the avatar to extend beyond the cover boundary into the identity section.
- Impact: The circular avatar now renders fully at the overlap seam instead of being visually truncated.
- Revisit trigger: If the hero is redesigned with rounded clipping masks, re-evaluate where overlap clipping should occur.

## [2026-03-05] Move About/Quick Info cards to the right of listing content on Vendor Hub
- Context: Product updated the storefront composition to keep listing content as the primary left-side column while showing only `About the Vendor` and `Quick Info` in a right-side support column.
- Decision: Keep the main content grid at `lg:grid-cols-3`, place listings + reviews in `lg:col-span-2` on the left, and move only `About the Vendor` and `Quick Info` into `lg:col-span-1` on the right; leave hero/title block unchanged.
- Why: This prioritizes browsable inventory and social proof while still exposing vendor context in a predictable side panel.
- Impact: Desktop Vendor Hub now renders masonry listings with reviews beneath on the left, while the two requested info cards render on the right.
- Revisit trigger: If specialties should also move to the right or if product introduces a configurable column layout.

## [2026-03-05] Reuse shared MasonryListingGrid on Vendor Hub for flush top-row alignment
- Context: Vendor Hub listing cards needed to match the same top-row alignment behavior already used on Home/Hero and Browse Vendors.
- Decision: Replace Vendor Hub’s page-local CSS column masonry markup with the shared `MasonryListingGrid` component.
- Why: Using the same component guarantees consistent column balancing and top alignment behavior across marketplace surfaces.
- Impact: Vendor Hub listing cards now inherit the same flush top-row behavior and masonry stacking pattern as Home and Browse Vendors.
- Revisit trigger: If Vendor Hub later needs container-aware column limits that differ from global masonry behavior, extend `MasonryListingGrid` with scoped configuration.

## [2026-03-05] Match Vendor Hub listing card scale to Browse Vendors within split layout
- Context: After moving Vendor Hub into a split content layout, listing cards became too small because global masonry column count logic used viewport width while the listings lived in a narrower left pane.
- Decision: Add optional `maxColumns` support to `MasonryListingGrid`, set Vendor Hub listings to `maxColumns={3}`, and widen Vendor Hub content container (`w-full` with `lg:px-12` and `max-w-[1500px]`) to reduce side margins.
- Why: Capping columns per-surface preserves Browse-like card scale in constrained panes without changing the global masonry behavior used elsewhere.
- Impact: Vendor Hub cards are visually larger and closer to Browse Vendors card sizing while keeping the masonry layout and right-side info column.
- Revisit trigger: If masonry switches to container-width-based auto columns globally, remove the per-page `maxColumns` override.

## [2026-03-05] Force 5 desktop masonry columns on Vendor Hub listings
- Context: Product requested a denser Vendor Hub listing presentation with less perceived empty horizontal space on large screens.
- Decision: Extend `MasonryListingGrid` with optional `desktopColumns`, then set Vendor Hub listings to `desktopColumns={5}` and `maxColumns={5}`; also widen Vendor Hub content width (`max-w-[1700px]`) and reduce side padding (`lg:px-8`).
- Why: This provides deterministic 5-column desktop behavior on Vendor Hub without changing global masonry behavior on other pages.
- Impact: On desktop (`>=1024px`), Vendor Hub listings render in 5 columns, using more horizontal space and reducing side-gutter emptiness.
- Revisit trigger: If container-width-driven column logic is adopted globally, replace per-page forced desktop column counts with container-aware auto layout.

## [2026-03-05] Prioritize Vendor Hub card readability over forced 5-column density
- Context: The forced 5-column Vendor Hub listing grid reduced card size too aggressively in the split layout and hurt readability.
- Decision: Revert Vendor Hub listings to `maxColumns={3}` (previous card scale) and reduce only outer row gutters (`px-2` / `lg:px-4`) while restoring content max width to `1500px`.
- Why: This keeps listing cards at the preferred pre-change scale while still trimming left/right empty space around the full content row.
- Impact: Vendor Hub cards return to larger, readable sizing; side margins are tighter without shrinking cards via extra columns.
- Revisit trigger: If product later wants denser desktop grids again, use container-aware breakpoints instead of a fixed 5-column override.

## [2026-03-05] Reduce Vendor Hub side gutters to 1/4 and force 5-card desktop row
- Context: Product requested significantly smaller side gutters and a 5-card first row on desktop without zoom-based scaling.
- Decision: Reduce Vendor Hub outer section padding from `px-2`/`lg:px-4` to `px-0.5`/`lg:px-1`, widen container to `max-w-[1900px]`, shift desktop layout to `lg:grid-cols-5` with listings `lg:col-span-4`, and set listing masonry to `desktopColumns={5}` + `maxColumns={5}`.
- Why: Combining narrower outer gutters with a wider listings pane enables 5 desktop cards per row while preserving card component styling.
- Impact: Vendor Hub desktop layout now renders 5 listing columns in the listings pane and uses much smaller side gutters.
- Revisit trigger: If card readability drops on common laptop widths, add desktop breakpoint-specific column caps instead of a fixed 5 at all `>=1024px` widths.

## [2026-03-05] Keep only review summary card in Vendor Hub right column, move full reviews behind dialog
- Context: Product requested removing the standalone latest-review card block and keeping only a compact review summary box in the side column, while still allowing customers to see full review details on demand.
- Decision: Remove the inline review-card list from the main content area, place the `What Clients Say` summary card beneath `About the Vendor` and `Quick Info` on the right, and wire `All reviews` to open a dialog containing the full review list.
- Why: This keeps the main storefront layout cleaner and box-count controlled without losing access to complete review content.
- Impact: The right side now contains summary-only review stats in-page, and customers can open a modal to read all reviews.
- Revisit trigger: If product wants a dedicated `/reviews` surface instead of modal-based review browsing.

## [2026-03-05] Reduce Vendor Hub outer gutters and widen right-side info column
- Context: Product requested slightly smaller side gutters and wider right-side cards while preserving existing listing card spacing.
- Decision: Reduce outer section padding to `px-0` / `lg:px-0.5`, increase container width to `max-w-[2000px]`, and switch desktop grid to explicit proportional columns (`3.7fr` listings area, `1.3fr` right-side boxes).
- Why: This shifts available horizontal space toward the right-side box stack without modifying masonry card gap settings.
- Impact: Side gutters are smaller, right-side cards are wider, and listing card spacing remains unchanged.
- Revisit trigger: If right-side content grows significantly, revisit the column ratio to avoid line-length/readability issues.

## [2026-03-05] Halve Vendor Hub desktop side padding again
- Context: Product requested another reduction to full-screen side padding after the previous gutter-tightening pass.
- Decision: Reduce Vendor Hub desktop horizontal padding from `lg:px-0.5` to `lg:px-[1px]` on the main content section.
- Why: This keeps the same overall layout while halving the remaining desktop gutter padding.
- Impact: On desktop/full-screen, the content row sits 1px from section edges instead of 2px, increasing usable horizontal space.
- Revisit trigger: If content appears visually cramped against viewport edges on common laptop widths, reintroduce a slightly larger desktop gutter.

## [2026-03-05] Remove Vendor Hub main content max-width cap
- Context: Product requested removing the remaining hard width cap after gutter reductions because it still constrained horizontal use on full-screen.
- Decision: Remove `max-w-[2000px]` from the Vendor Hub content grid wrapper and keep `w-full` layout.
- Why: A hard max width was still creating unused horizontal space at very wide viewport sizes.
- Impact: Vendor Hub listings + right-side cards can now expand to full available width (subject to existing grid ratios and paddings).
- Revisit trigger: If ultrawide readability degrades, reintroduce a larger cap with breakpoint-specific behavior rather than a single fixed max width.

## [2026-03-05] Match Vendor Hub content gutters to Hero spacing tokens
- Context: Product requested aligning Vendor Hub side gutter feel with Hero page spacing.
- Decision: Update Vendor Hub main content wrapper horizontal padding to `px-4 sm:px-6 lg:px-4` (matching Hero’s breakpoint gutters).
- Why: Shared gutter tokens keep horizontal rhythm consistent across key marketing/storefront surfaces.
- Impact: Vendor Hub now has the same responsive side padding scale as Hero while preserving its existing grid and card sizing behavior.
- Revisit trigger: If a global layout shell token is introduced, replace page-level hardcoded gutter classes with shared spacing utilities.

## [2026-03-05] Double Vendor Hub side gutters across all breakpoints
- Context: Product requested increasing the far-left and far-right gutter size globally after the Hero-matching pass.
- Decision: Double Vendor Hub content wrapper horizontal padding from `px-4 sm:px-6 lg:px-4` to `px-8 sm:px-12 lg:px-8`.
- Why: This applies a consistent 2x side-gutter increase at every responsive breakpoint without changing internal grid/card behavior.
- Impact: Vendor Hub content sits further inward from both viewport edges on mobile, tablet, and desktop.
- Revisit trigger: If content density drops too much on smaller screens, consider breakpoint-specific reductions instead of a uniform 2x increase.

## [2026-03-05] Force Exit Customer Mode control to stay right-anchored and use direct My Hub link
- Context: In preview mode, the `Exit Customer Mode` control appeared left-clipped and did not consistently return to `My Hub`.
- Decision: Render the control as a direct anchor link (`href="/vendor/shop"`) inside `Button asChild`, and explicitly enforce right anchoring with `left-auto right-4 top-4` plus truncation safeguards.
- Why: A direct link avoids router-state edge cases and explicit positioning prevents left-side spill regressions.
- Impact: The exit control remains visible in the hero top-right and always navigates back to `My Hub`.
- Revisit trigger: If preview mode navigation is centralized in a shared state machine/router helper, replace page-local link logic with that shared mechanism.

## [2026-03-06] Require customer ownership for booking payment and refund actions
- Context: Booking payment-intent creation and refund routes were reachable without authenticated customer ownership checks, creating a high-risk unauthorized payment/refund surface.
- Decision: Protect `POST /api/bookings/:bookingId/payments/:scheduleId` and `POST /api/bookings/:bookingId/refund` with customer auth middleware and explicit booking ownership checks.
- Why: Payment and refund operations are security-critical and must be bound to the authenticated customer that owns the booking.
- Impact: Unauthorized callers can no longer trigger booking payment/refund actions for other users; these routes now require valid authenticated customer ownership.
- Revisit trigger: When Batch 2 payment hardening starts, move these paths to DB-transaction-backed authorization + idempotency validation and webhook-driven state transitions.

## [2026-03-06] Scope notification read updates to authenticated vendor recipient
- Context: Vendor notification read updates were keyed only by notification ID, which allowed cross-account notification state changes if an ID was guessed.
- Decision: Update notification read writes to require matching `id + recipient_id + recipient_type` and return not-found when ownership does not match.
- Why: Notification state is user-specific data and should be writable only by the owning recipient.
- Impact: Vendor notification read operations are now ownership-scoped, closing the IDOR path on read-state updates.
- Revisit trigger: In Batch 2, add customer notification read endpoints using the same ownership-scoped pattern and add audit records for notification state changes.

## [2026-03-06] Remove insecure JWT fallback and reduce API/log leakage
- Context: The backend accepted a hardcoded fallback JWT secret and exposed internal diagnostics through API responses/logging in sensitive paths.
- Decision: Require `JWT_SECRET` at startup (no default), remove stack/details exposure from selected API responses, and stop logging API JSON response bodies.
- Why: Default secrets and verbose internals increase exploitability and post-exploitation impact.
- Impact: Token signing now fails fast if not explicitly configured; API responses are less likely to leak internal traces; logs are less likely to capture sensitive response payloads.
- Revisit trigger: During Batch 2, enforce a unified safe-error serializer across all routes and move to structured, scrubbed security logging with request correlation IDs.

## [2026-03-06] Add per-IP security rate limits and normalize auth failure responses
- Context: Auth and payment/refund endpoints needed abuse controls and reduced account enumeration risk before launch.
- Decision: Add in-process per-IP rate limiters (capped at <=100 requests/minute) for auth, payment/refund, and upload endpoints, and normalize auth route failures to generic credential/account creation errors.
- Why: Limiting brute-force volume and removing identity-specific error signals lowers attack success probability with minimal launch-risk code changes.
- Impact: Repeated high-frequency requests now receive `429`; auth endpoints no longer expose existence-specific responses such as `userNotFound` or `emailExists`.
- Revisit trigger: In production scale-up, replace in-process limiter state with shared store (Redis/edge) and tune endpoint-specific limits from observed traffic.

## [2026-03-06] Source admin authority from database role and migrate canonical admin email
- Context: Admin elevation logic was previously coupled to hardcoded/env email checks at auth time.
- Decision: Remove runtime email-based auto-promotion, treat `users.role='admin'` as the source of truth, and add migration `0004_security_batch2_baseline` to set `eventhubglobal@gmail.com` to admin in database state.
- Why: Role-based authorization should be durable and data-driven, not inferred dynamically from request email values.
- Impact: Admin auth now depends on persisted user role; environment email flags are no longer required for admin elevation behavior.
- Revisit trigger: If admin management is moved to Auth0 RBAC claims or a dedicated admin management UI.

## [2026-03-06] Verify Stripe webhook signatures and enforce replay protection
- Context: Stripe webhooks were previously accepted without signature verification or replay deduplication.
- Decision: Validate webhook signatures via `STRIPE_WEBHOOK_SECRET`, persist processed event IDs in `stripe_webhook_events` with unique `event_id`, and ignore duplicate deliveries.
- Why: Signature validation and replay protection are required controls for trusted payment state transitions.
- Impact: Unsigned/invalid webhook calls are rejected; duplicate Stripe events are idempotently ignored; payment success webhooks now safely update payment/schedule/booking payment status.
- Revisit trigger: If webhook processing is moved to a background job system with dead-letter and retry observability.

## [2026-03-06] Harden payment/refund routes with DB-backed transactional checks and idempotency
- Context: Payment/refund routes relied on in-memory storage access paths and lacked robust idempotent transaction controls.
- Decision: Rework booking payment intent and refund flows to use DB-backed authorization/state checks, transactional schedule/payment updates, and Stripe idempotency keys.
- Why: Security-critical money operations require durable state checks and replay-safe external calls.
- Impact: Payment/refund operations now validate booking ownership against database records, reduce race conditions, and avoid duplicate external charge/refund actions.
- Revisit trigger: If payment orchestration is extracted into a dedicated service layer or async job pipeline.

## [2026-03-06] Enforce stricter upload acceptance and vendor-only listing photo uploads
- Context: Upload endpoints previously trusted MIME headers and allowed broader auth scope for listing photos.
- Decision: Switch upload processing to memory buffers with server-side magic-byte validation (JPG/PNG/WebP only), persist with generated filenames/extensions, apply upload rate limiting, and require vendor auth for listing photo uploads.
- Why: Content-based validation and tighter authorization reduce malicious upload and storage abuse risk.
- Impact: Non-image payloads disguised by MIME are rejected; listing image uploads now require vendor authorization; upload throughput is constrained per IP.
- Revisit trigger: When moving to object storage, add antivirus scanning and server-side image re-encoding pipeline.

## [2026-03-06] Sanitize remaining public/sensitive route error output for Phase 1
- Context: Several public/sensitive routes still returned raw provider/internal error messages and included debug logging, which can leak implementation details.
- Decision: Add a shared route-level error logger helper and switch `/api/locations/search`, `/api/vendor/me`, `/api/customer/me`, `/api/vendor/listings`, `/api/vendor/listings/:id`, and vendor notifications/reviews error responses to generic safe messages while preserving response shape.
- Why: Generic client-facing errors reduce reconnaissance value to attackers while keeping launch-risk low and preserving existing API contracts.
- Impact: Internal/provider errors remain in server logs only; clients now receive stable non-diagnostic failure messages on those endpoints.
- Revisit trigger: In Batch 2 Phase 2, replace route-local handling with a centralized safe-error serializer and structured request-correlated security logging.

## [2026-03-06] Align system documentation with current security authority model and hardened controls
- Context: `replit.md` still documented removed behavior (`ADMIN_EMAIL` runtime admin auto-promotion and legacy token-storage assumptions), creating security guidance drift from live code.
- Decision: Update `replit.md` authentication/admin sections to reflect database-role admin authority, generic auth-failure behavior, Auth0-primary token handling, and Stripe webhook signature/replay protections.
- Why: Security documentation must accurately match runtime behavior to prevent unsafe operational assumptions during deployment and incident response.
- Impact: Team-facing architecture docs now match the active hardened security model and reduce risk of reintroducing deprecated patterns.
- Revisit trigger: During Batch 2 Phase 2, revisit docs again after centralized safe-error serialization and structured security logging are implemented.

## [2026-03-06] Remove vendor listing route diagnostics and raw internal 500 error leakage
- Context: Vendor listing CRUD/publish routes still emitted verbose debug logs and returned raw internal error messages in 500 responses.
- Decision: Remove route-level debug logging from vendor listing endpoints and replace raw/internal 500 responses with stable safe messages while preserving existing success payload shapes.
- Why: Listing management routes are authenticated but still internet-facing; reducing diagnostic output and message leakage lowers reconnaissance value without launch-risk API contract changes.
- Impact: Vendor listing create/update/publish/unpublish/delete/list routes now log server-side failures via `logRouteError` and return generic 500 error text to clients.
- Revisit trigger: In Batch 2 Phase 2, move these endpoints to centralized safe-error serialization and structured request-correlated logging.

## [2026-03-06] Sanitize remaining public route error leakage before launch
- Context: Public browse/event endpoints still returned raw internal error messages (`error.message`) to unauthenticated clients.
- Decision: Replace raw error output with generic safe messages and route failure logging via `logRouteError` for `/api/vendors/public/:vendorId/shop`, `/api/listings/public`, `/api/listings/public/:id`, and `/api/events*` public endpoints.
- Why: Public endpoints should not leak provider/runtime internals in production responses.
- Impact: Unauthenticated clients now receive stable non-diagnostic error messages on these routes while server-side logging retains failure visibility.
- Revisit trigger: When centralized safe-error serialization is implemented, migrate these route-level handlers to the shared serializer.

## [2026-03-06] Lock Vendor Hub Exit Customer Mode control to hero top-right and prevent edge bleed
- Context: In Vendor Hub customer preview, the `Exit Customer Mode` control was rendering at the top-left and could clip against viewport edges.
- Decision: Keep the existing control styling/text but harden placement by disabling button hover-elevation positional overrides for this control and tightening responsive right/top offsets plus max-width/overflow constraints.
- Why: The control must remain predictably anchored to the hero top-right while preserving current visual design.
- Impact: `Exit Customer Mode` now stays top-right of the cover image on mobile/desktop and truncates safely without spilling off-screen.
- Revisit trigger: If shared button interaction utilities are refactored, re-verify that absolute-positioned buttons are not forced to `position: relative`.

## [2026-03-06] Replace Vendor Hub right-column boxed cards with horizontal section dividers
- Context: The Vendor Hub right column (`About the Vendor`, `Quick Info`, `What Clients Say`) used bordered card boxes, but product direction called for Airbnb-style horizontal separators between sections while keeping current content layout.
- Decision: Remove right-column `Card` wrappers and render the same content in plain section containers, adding `border-t` divider lines only between sections at the same column width as the prior boxes.
- Why: This keeps structure and readability intact while matching the requested visual treatment without broad layout changes.
- Impact: Right-side boxes no longer appear; each section is separated by a single horizontal line; column width and section order remain unchanged.
- Revisit trigger: If storefront styling becomes tokenized/shared, move these divider rules into shared section primitives for consistency across profile surfaces.

## [2026-03-06] Use SPA navigation for Vendor Hub Exit Customer Mode to preserve session
- Context: Clicking `Exit Customer Mode` was using a direct anchor navigation, which triggered a full page reload and intermittently forced vendor re-authentication.
- Decision: Keep the existing button visuals/placement but switch exit behavior to in-app routing via `setLocation("/vendor/shop")` in `vendorhub.tsx`.
- Why: SPA navigation preserves the active Auth0 client state and avoids unnecessary full reload auth checks.
- Impact: Exiting customer mode returns to `My Hub` without forcing sign-in in normal active-session cases.
- Revisit trigger: If preview mode gets a centralized navigation/state service, migrate this local route action into that shared flow.

## [2026-03-06] Scope My Hub listing card CTA to vendor edit flow and align header actions with Shop Details column
- Context: On `My Hub`, clicking listing cards opened customer-facing listing detail, but the requested behavior is editing the vendor listing. The two header action buttons also needed to align flush with the `Shop Details` panel width.
- Decision: Add opt-in `ListingCard` props for navigation behavior (`disableCardNavigation`, `primaryActionLabel`, `primaryActionPath`) and apply them only in `myhub.tsx` so cards are non-clickable, CTA reads `Edit Listing`, and CTA routes to `/vendor/listings/:id`. Also switch My Hub header/actions layout to a `lg:grid-cols-3` structure so the button row occupies the same right column as `Shop Details`, with left/right button edges flush to that column.
- Why: This preserves shared card visuals across the app while enabling My Hub-specific vendor workflow behavior and precise alignment without broad layout rewrites.
- Impact: My Hub cards keep current look/size/share icon, card background clicks no longer navigate, CTA now opens the vendor edit page for the clicked listing, and top action buttons align with the right-side Shop Details box edges.
- Revisit trigger: If listing cards are split into dedicated customer/vendor variants later, remove behavior props from shared `ListingCard` and move this logic into role-specific card components.

## [2026-03-06] Align Vendor Hub avatar/name/review block with listings left gutter
- Context: The Vendor Hub profile identity block (avatar, business name, review row) sat farther right than the `Available Rentals` heading and listing card column, causing left-gutter inconsistency.
- Decision: Keep avatar size and vertical spacing unchanged, but switch the profile-overlay and profile-text wrappers to the same horizontal padding tokens used by the listings content (`px-8 sm:px-12 lg:px-8`) and remove extra left offsets (`ml-24/sm:ml-28`, `pl-24/sm:pl-28`).
- Why: Matching shared gutter tokens is the thinnest safe change to align horizontal rhythm without affecting card sizing, typography scale, or vertical layout.
- Impact: Avatar, vendor title, and review summary now align with the left edge/cushion of `Available Rentals` and listing cards while preserving existing sizes and heights.
- Revisit trigger: If storefront gutters are later centralized into shared layout primitives, replace these page-level padding classes with shared container utilities.

## [2026-03-06] Swap Vendor Hub desktop column sides while preserving sizing and gutters
- Context: Product requested moving the divider-based info sections (`About the Vendor`, `Quick Info`, `What Clients Say`) to the left side and placing the listing cards on the right, without changing widths, typography, or gutter spacing.
- Decision: Keep existing section markup and sizing tokens, but switch the desktop grid column template to `lg:grid-cols-[minmax(420px,1.3fr)_minmax(0,3.7fr)]` and apply `lg`-only order classes so info renders in column 1 and listings in column 2.
- Why: This performs a pure side swap with minimal code change and avoids unintended style/layout drift.
- Impact: On desktop, info sections now render on the left and listing cards on the right; mobile stacked order and existing spacing/typography remain unchanged.
- Revisit trigger: If desktop column ratios are redesigned later, revisit the template values while keeping explicit order behavior.

## [2026-03-06] Remove My Hub container max-width cap to match Vendor Hub full-width formatting
- Context: My Hub had significant empty space on both sides of the main grid because content was wrapped in a centered `max-w-7xl` container, unlike the broader Vendor Hub presentation.
- Decision: In `myhub.tsx`, replace `mx-auto max-w-7xl` on the top content wrapper with `w-full`, keeping all existing internal grid, typography, and component spacing unchanged.
- Why: Removing the width cap is the minimal, targeted way to eliminate side dead space while preserving current My Hub layout behavior.
- Impact: My Hub now uses the full available shell content width, reducing left/right empty space around listings and the Shop Details column.
- Revisit trigger: If a shared vendor-portal page container standard is introduced, migrate My Hub to that shared layout utility instead of page-local width classes.

## [2026-03-06] Narrow My Hub required fields, remove redundant years input, and move save action to top
- Context: Product updated My Hub requirements so only core storefront fields should block save (`Business Name`, `Profile Photo`, `Service Area`, `In Business Since`, `Events Served`, `About the Business`), and requested removal of redundant `Years in Business` input plus a top-positioned save action.
- Decision: Update My Hub validation rules to require only the specified fields, drop `Years in Business` state/UI wiring from `myhub.tsx`, change the events-served helper copy to `Enter how many events you have served so far and we will calculate from here.`, remove `Required` wording from cover-photo helper text, and move `Save Shop Details` (and validation alert) to the top of the Shop Details card.
- Why: This aligns form friction with current MVP data priorities and removes redundant inputs while making the primary save action immediately accessible.
- Impact: Vendors can save without filling tagline/about-owner/specialties/cover photo, the redundant years field is no longer shown, events-served guidance reflects the new wording, and save controls appear at the top of Shop Details.
- Revisit trigger: If storefront profile schema is simplified further (e.g., removing optional legacy bio fields), revisit My Hub form sections and persistence payload shape together.

## [2026-03-06] Double Vendor Hub avatar and business title size while preserving anchor alignment
- Context: Product requested the Vendor Hub hero identity cluster to be more prominent by doubling both the circular avatar and business title size while keeping the avatar half-overlapping the cover edge and preserving left-side alignment.
- Decision: Increase `.vendor-hub-avatar` dimensions from `100/120px` to `200/240px`, raise the vendor title from `text-[2rem]` to `text-[4rem]`, and increase post-cover top padding (`pt-16/sm:pt-20` to `pt-28/sm:pt-32`) so the larger avatar still clears content while remaining centered on the cover boundary via existing `translate-y-1/2`.
- Why: This delivers the requested 2x visual prominence without changing the existing horizontal gutter tokens or avatar anchor logic.
- Impact: Vendor Hub avatar and business name now render at 2x size; avatar remains half over the cover and half below; left-side positioning remains unchanged.
- Revisit trigger: If responsive typography is later tokenized for storefront headers, move this fixed 2x size scaling into shared breakpoint-aware tokens.

## [2026-03-06] Increase Vendor Hub detail-column typography proportionally without changing column width
- Context: Product requested larger text in the left detail column (`About the Vendor`, `Quick Info`, `What Clients Say`) while explicitly keeping the detail section width unchanged and aligning all section titles to the `What Clients Say` title size.
- Decision: Keep the existing layout/grid widths untouched and update only text classes in `vendorhub.tsx`: promote `About the Vendor`/`Quick Info` headings from `text-xl` to `text-2xl`, increase supporting body/label/value text from `text-sm` to `text-base`, raise in-section subheadings to `text-lg`, and increase review-link/review-breakdown text from `text-sm` to `text-base`.
- Why: Class-level typography scaling preserves existing spacing/structure while making the detail column more readable and visually consistent with the requested heading baseline.
- Impact: All detail-column section titles now match `What Clients Say` heading size, and the rest of the shown detail text is proportionally larger; column width remains unchanged.
- Revisit trigger: If a shared storefront type scale token set is introduced, migrate these page-local font-size utilities to semantic typography tokens.

## [2026-03-06] Halve Vendor Hub hero height when no cover image is available
- Context: With no uploaded cover image, the Vendor Hub hero reserved the full cover-photo height, creating excessive empty vertical space.
- Decision: Keep the existing hero height when a cover image is visible (`clamp(280px, 42vw, 520px)`), but switch to a half-height clamp (`clamp(140px, 21vw, 260px)`) when no cover image is present or the cover fails to load.
- Why: This preserves current cover-photo presentation while reducing empty state space without changing layout width or image behavior when a real cover exists.
- Impact: Vendors without cover photos now see a hero area that is 50% as tall; vendors with cover photos keep the same hero height behavior as before.
- Revisit trigger: If hero sizing becomes tokenized globally, move these conditional clamps into shared storefront hero size tokens.

## [2026-03-06] Flatten Vendor Hub about-section hierarchy to two peer headings
- Context: The about area showed a parent heading (`About the Vendor`) plus nested subheadings (`About the Business`, `About the Owner`), but product requested only the two specific headings with the same visual style as the parent heading.
- Decision: Remove the `About the Vendor` heading and restyle `About the Business` / `About the Owner` as peer section headers using the same `text-2xl font-semibold` title class, with body copy kept directly beneath each heading.
- Why: This simplifies content hierarchy and matches the requested presentation without changing section width or neighboring layout.
- Impact: The about area now renders only `About the Business` and `About the Owner`, both with matching section-title styling.
- Revisit trigger: If content model expands to additional about subsections, consider introducing a reusable subsection title/body component for consistency.

## [2026-03-06] Unify Vendor Hub detail text color to the darker storefront tone
- Context: The detail area used mixed text colors (dark + muted + orange link accent), and product requested a single darker text color across the shown content.
- Decision: In the Vendor Hub header/detail sections, replace muted/accent text classes in the shown block with the darker storefront color (`#2a3a42`, dark-mode fallback `#f5f0e8`) for review count text, about-body copy, quick-info labels/values, review-link text, and rating-breakdown labels/percentages.
- Why: A single text tone improves visual consistency and matches the requested “darker of the two colors” treatment.
- Impact: All text in the requested screenshot area now renders in one consistent dark text color instead of mixed muted/accent variants.
- Revisit trigger: If a semantic color-token pass is done later, map this section to shared typography color roles rather than hardcoded hex classes.

## [2026-03-06] Match My Hub full-screen listing card size to Vendor Hub by increasing desktop masonry columns
- Context: On full-screen desktop, My Hub listing cards appeared significantly larger than Vendor Hub listing cards.
- Decision: Keep My Hub card component behavior/styles unchanged, but increase My Hub masonry columns at desktop breakpoints from `sm:2 / xl:3` to `sm:2 / lg:4 / xl:5` so card widths at full-screen match Vendor Hub sizing more closely.
- Why: Adjusting column count is the minimal, layout-only way to reduce card size without touching CTA logic, card internals, or page gutters.
- Impact: My Hub cards render smaller at large/full-screen widths and visually align with Vendor Hub card sizing; mobile/tablet behavior remains unchanged.
- Revisit trigger: If card density expectations change by breakpoint, move these column counts into shared storefront layout tokens.

## [2026-03-06] Hide Vendor Hub average response time row when value is unavailable
- Context: Quick Info displayed an `Avg. Response Time` row even when the computed value was `Unavailable`.
- Decision: Add an availability guard in `vendorhub.tsx` and render the `Avg. Response Time` row only when `avgResponseMinutes` is a finite number greater than zero.
- Why: Showing an unavailable metric adds noise; hiding it until data exists keeps Quick Info focused on meaningful values.
- Impact: Vendors with no response-time data no longer show the `Avg. Response Time` label/value row; once response-time data is present, the row appears automatically.
- Revisit trigger: If product later wants explicit empty-state messaging for missing metrics, replace this hide behavior with a standardized placeholder treatment.

## [2026-03-06] Increase Vendor Hub detail-section typography using explicit Tailwind size classes (no zoom)
- Context: Product requested increasing all font sizes in the shown Vendor Hub detail block without using any zoom-based scaling.
- Decision: Increase the relevant Tailwind text size classes directly in `vendorhub.tsx`: section titles `text-2xl -> text-3xl`, body copy `text-base -> text-lg`, quick-info container text `text-base -> text-lg`, and review-link text `text-base -> text-lg`.
- Why: Direct font-size class updates provide deterministic sizing changes while avoiding global/browser zoom behavior.
- Impact: The targeted detail block renders larger text across headings, body copy, labels/values, and the `All reviews` link without altering width/gutter behavior.
- Revisit trigger: If typography scales are centralized later, move these class-level sizes into shared semantic type tokens.

## [2026-03-06] Enforce shared flush-top first-row listing rule on My Hub via shared masonry grid
- Context: My Hub was using a page-local CSS multi-column listing layout that produced non-flush first-row card tops, while other storefront surfaces used the shared masonry grid behavior.
- Decision: Extend `MasonryListingGrid` with an optional `renderCard` hook and switch My Hub listing rendering from local `columns-*` markup to `MasonryListingGrid` with the existing My Hub card behavior (`Edit Listing`, disabled card click, vendor edit route CTA) preserved.
- Why: Reusing the shared grid path applies the existing sitewide first-row alignment rule and avoids one-off CSS behavior drift.
- Impact: My Hub first-row card tops now align flush like other listing surfaces, while My Hub-specific card actions/appearance remain unchanged.
- Revisit trigger: If all listing surfaces later adopt a single shared card-action config system, replace per-page `renderCard` overrides with centralized role-based card action mapping.

## [2026-03-06] Show filled optional owner details on Vendor Hub under About the Owner
- Context: My Hub captured optional owner fields (`Hobbies`, `Likes & Dislikes`, `Home State`, `Fun Facts`), but Vendor Hub did not render them, so filled values were invisible to customers.
- Decision: In `vendorhub.tsx`, read trimmed optional owner fields from the vendor payload and render each field directly under `About the Owner` when populated; also render the `About the Owner` section when either main owner bio or any optional owner detail exists.
- Why: This exposes vendor-provided profile depth on the storefront without showing empty placeholders.
- Impact: When these fields are filled, Vendor Hub now displays them immediately beneath the owner section in consistent typography; empty fields remain hidden.
- Revisit trigger: If profile content sections become configurable, migrate these fixed fields into a reusable metadata section renderer.

## [2026-03-06] Route My Hub card click to vendor listing edit page (matching Edit Listing CTA)
- Context: My Hub listing cards already had an `Edit Listing` CTA that correctly routed to `/vendor/listings/:id`, but clicking the card itself did not follow the same edit flow.
- Decision: Extend `ListingCard` with an optional `cardNavigationPath` override and use it in `myhub.tsx` so full-card click/keyboard navigation routes to `/vendor/listings/:id` for that listing, while keeping the change scoped to My Hub.
- Why: This aligns card-click behavior with the existing CTA and reduces friction in the vendor editing workflow.
- Impact: On My Hub only, both the card click and `Edit Listing` button open the same vendor listing edit page; behavior on other pages remains unchanged.
- Revisit trigger: If listing card interactions are centralized by role/context later, replace per-page route props with a shared interaction policy.

## [2026-03-06] Remove Likes & Dislikes field from My Hub details form
- Context: Product requested removing `Likes & Dislikes` from the My Hub details box.
- Decision: Delete only the `Likes & Dislikes` form section from `myhub.tsx` UI while leaving other profile fields unchanged.
- Why: This reduces unnecessary form surface area and matches current profile-input priorities.
- Impact: Vendors no longer see or edit `Likes & Dislikes` from My Hub; all other details fields remain in place.
- Revisit trigger: If profile customization fields are revisited later, decide whether to restore this as an optional advanced field.

## [2026-03-06] Match optional owner subsection title font styling to About the Owner title at one-step smaller size
- Context: Product requested that optional subsection titles under `About the Owner` (e.g., `Hobbies`, `Home State`, `Fun Facts`) use the same title font treatment as `About the Owner`, but slightly smaller.
- Decision: Change optional owner subsection labels in `vendorhub.tsx` from medium body-style `<p>` labels to semantic `<h4>` headings with `text-2xl font-semibold` (one step down from `About the Owner`’s `text-3xl font-semibold`) while keeping color and body text unchanged.
- Why: This creates a clear, consistent heading hierarchy and visual style match with the section title while preserving readability.
- Impact: Optional owner detail titles now visually match the `About the Owner` heading family and weight, at a slightly smaller size.
- Revisit trigger: If storefront heading scales are centralized, replace page-level heading classes with shared semantic heading tokens.

## [2026-03-07] Cap Landing and Browse listing card width at 1000px using shared masonry grid option
- Context: Product confirmed a `1000px` maximum listing-card width target for Landing (`/`) and Browse Vendors (`/browse`) and requested card internals remain proportional to card size.
- Decision: Extend `MasonryListingGrid` with an optional `cardMaxWidthPx` prop that applies a per-card wrapper `max-width`, then enable `cardMaxWidthPx={1000}` on `Home.tsx` and `BrowseVendors.tsx`.
- Why: Applying the cap in the shared grid keeps the change thin and consistent across both requested surfaces without introducing page-specific card clones.
- Impact: Landing and Browse listing cards now cannot exceed `1000px` width; card image/text/price layout remains proportional because the existing shared `ListingCard` structure and sizing behavior are unchanged.
- Revisit trigger: If card width policy needs to differ by surface (e.g., Vendor Hub/My Hub), replace raw numeric prop usage with shared layout tokens per surface.

## [2026-03-07] Keep Landing and Browse single-column listing cards from over-growing on narrower viewports
- Context: On narrower desktop/tablet widths where the masonry grid collapses to one column, listing cards appeared visually too large even with a global `1000px` max-width cap.
- Decision: Extend `MasonryListingGrid` with `singleColumnCardMaxWidthPx` and set `singleColumnCardMaxWidthPx={560}` on Landing and Browse while keeping `cardMaxWidthPx={1000}`.
- Why: A dedicated one-column cap preserves the `1000px` maximum rule while preventing oversized cards during responsive collapse states.
- Impact: Landing and Browse cards remain centered and proportionally scaled, with one-column layouts capped at `560px` max width; multi-column layouts continue using the `1000px` cap.
- Revisit trigger: If product defines canonical card width tokens by breakpoint, replace these page-level numeric caps with shared responsive design tokens.

## [2026-03-07] Keep two cards visible at narrower Landing/Browse widths by lowering the 2-column breakpoint
- Context: On split-screen widths, Landing/Browse still dropped to one column too early, making each card appear too large for the viewport.
- Decision: Extend `MasonryListingGrid` with `twoColumnMinWidthPx` (default `640`) and set `twoColumnMinWidthPx={520}` on Landing and Browse.
- Why: Lowering the 2-column threshold on these two customer-facing listing surfaces preserves perceived card size and keeps density consistent in narrow desktop windows.
- Impact: Landing and Browse now keep 2 columns down to 520px viewport width, so half-screen desktop sizes show approximately two cards instead of one oversized card.
- Revisit trigger: If responsive layout tokens are centralized, move this per-surface numeric threshold into shared breakpoint tokens.

## [2026-03-11] Restrict legacy unscoped bookings from appearing in every profile
- Context: During vendor account migration from 1:1 to multi-profile, some legacy booking rows may not yet have a reliable `vendor_profile_id` (or listing profile link), which can cause those rows to show in every switched profile.
- Decision: In vendor stats/bookings/payments profile filters, only include unscoped legacy rows when the account still has exactly one profile; once multiple profiles exist, require explicit booking/listing profile ownership to include the row.
- Why: Preventing cross-profile data bleed is more important for dashboard correctness than showing ambiguous legacy rows in all profile contexts.
- Impact: Multi-profile vendors may see some old, unscoped rows hidden until backfill ties them to a specific profile; single-profile vendors keep current visibility.
- Revisit trigger: After a full backfill enforces profile ownership on all bookings/listings, remove this conditional fallback and require strict profile matching.

## [2026-03-11] Backfill legacy vendor profile names from original account business names
- Context: Legacy vendors created before multi-profile support could retain placeholder profile names (`Vendor Profile`) in selectors, while their original business name still lived on the account record.
- Decision: Add a dedicated data migration to replace placeholder/empty `vendor_profiles.profile_name` values with `onlineProfiles.profileBusinessName` or fallback `vendor_accounts.business_name`, and set `onlineProfiles.profileBusinessName` when missing/placeholder. Keep a runtime normalization guard on profile resolution for straggler rows.
- Why: Old accounts need stable, user-facing profile names that match their original business identity without relying on UI fallbacks.
- Impact: Existing vendor accounts now persist the expected profile name (for example, `Bo's Event Rentals`) in both profile columns used by dropdowns and profile forms.
- Revisit trigger: Once all environments have run the migration and placeholder profile names stop appearing in production data, remove redundant runtime normalization if desired.

## [2026-03-11] Standardize active-profile UI state as ID-driven and refresh profile labels on rename
- Context: Vendor profile switching is intended to be identity-by-`vendor_profiles.id`, but profile rename flows could leave stale selector/header labels until hard refresh in some screens.
- Decision: Keep profile switching keyed by `activeProfileId` and `profile.id` in dashboard/shell UI, and add `"/api/vendor/profiles"` query invalidation after profile-scoped saves so renamed `profile_name` values refresh immediately.
- Why: ID-driven state avoids accidental name-as-identity coupling and immediate label refresh keeps profile rename behavior predictable.
- Impact: Active-profile selector/check state is explicitly ID-based in UI logic, and renamed profile labels propagate without manual page reload.
- Revisit trigger: If profile state is centralized into a shared client store later, move this query invalidation and active-profile derivation into the shared profile context layer.

## [2026-03-11] Normalize vendor profile names to alphanumeric title case on save
- Context: Product requested profile branding names disallow special characters/all-caps and auto-format each word with initial capitalization.
- Decision: Add shared backend normalization for `profile_name`/`profileBusinessName` writes (onboarding complete, profile create, profile patch, additional-profile create): strip non-alphanumeric chars, collapse whitespace, enforce 120-char max, and convert to title case. Add matching UI `onBlur` normalization for profile-name inputs in Vendor Dashboard and My Hub.
- Why: Server-side normalization guarantees rule consistency regardless of client source, while client-side blur formatting provides immediate visual feedback.
- Impact: Saved profile names are now consistently formatted and no longer store special characters or all-caps variants.
- Revisit trigger: If branding requirements later need apostrophes/ampersands/hyphens, relax the normalization regex and add explicit allowed-character validation copy in UI.

## [2026-03-11] Use the same solid status badge style for inactive vendor listings
- Context: In Vendor Portal listings, inactive cards used an outline badge with icon while active/draft used a solid status badge, creating inconsistent status affordance.
- Decision: Update inactive card status badge in `VendorListings.tsx` to use the same `Badge variant="secondary"` format as active and draft cards.
- Why: Consistent badge treatment reduces visual noise and keeps status labels comparable across listing states.
- Impact: Inactive listing cards now display status in the same solid badge format as active and draft.
- Revisit trigger: If design later requires state-specific color coding, introduce explicit per-status badge variants consistently across all three states.

## [2026-03-11] Make My Hub the single source for vendor "About the Business" copy
- Context: Vendor Dashboard profile details duplicated an "About The Business" editor that also exists in My Hub, causing unclear ownership of storefront bio content.
- Decision: Remove the "About The Business" input (and related save/reset wiring) from `VendorDashboard.tsx`, and update public vendor shop response mapping to source `aboutBusiness` from `onlineProfiles.aboutBusiness` only.
- Why: A single editing source avoids conflicting updates and keeps storefront bio content aligned with the dedicated My Hub profile editor.
- Impact: Vendors now edit About-the-Business copy only in My Hub; dashboard profile details no longer writes `serviceDescription`; public shop consumes My Hub bio field directly.
- Revisit trigger: If product later reintroduces a quick-edit bio in dashboard, it should write/read the same `onlineProfiles.aboutBusiness` field instead of a separate profile description path.

## [2026-03-11] Force Auth0 login/signup flows to prompt for account selection instead of silent SSO reuse
- Context: In Chrome, Auth0 could automatically re-authenticate the previous session account during login/signup attempts, preventing account switching for users trying a different email.
- Decision: Add explicit Auth0 prompt controls on client login entry points: default redirect prompt to `login`, set Google social flow prompt to `select_account`, and apply prompt configuration to vendor popup-first login fallback and checkout/listing login redirects.
- Why: Prompting removes silent SSO auto-selection and makes account switching reliable without changing account/profile identity architecture.
- Impact: Login/signup flows now consistently show an authentication prompt/account chooser instead of silently signing users back into the last Auth0 session.
- Revisit trigger: If product later wants low-friction “continue as current user” in specific flows, make prompt behavior route-specific rather than global for all Auth entry points.

## [2026-03-11] Allow apostrophes in vendor business/profile naming normalization
- Context: Vendor-facing business/profile name inputs were auto-normalizing by stripping all punctuation, which turned names like `Bo's Event Rentals` into `Bo S Event Rentals` on blur/save.
- Decision: Keep title-case normalization but allow apostrophes by normalizing smart apostrophes (`’`) to `'` and permitting `'` in profile-name input sanitization on Vendor Dashboard/My Hub, with backend validation copy updated to match.
- Why: Apostrophes are common in business branding and should be preserved while keeping ID-driven profile identity unchanged.
- Impact: Profile/business naming inputs now preserve apostrophes and keep the post-apostrophe character lowercase via existing title-case logic (`Bo's`, not `Bo'S`).
- Revisit trigger: If branding rules later need additional punctuation (e.g., ampersands or slashes), extend the shared allowed-character policy in one place across UI + API copy.

## [2026-03-12] Convert Vendor Reviews stats + customer review containers to divider-only layout
- Context: Product requested the Vendor Reviews page match the dashboard separator style by removing card outlines, adding vertical separators between top review stats, and adding a horizontal separator above the Customer Reviews section.
- Decision: Replace the three top review stat cards and customer-reviews card container in `VendorReviews.tsx` with plain sections; insert two vertical divider elements between the top metrics and one horizontal divider between the metric row and customer reviews using `var(--dashboard-divider-blue)`.
- Why: This aligns the Reviews page with the current icon-sidebar dashboard visual language and removes heavier card framing.
- Impact: Vendor Reviews now renders with separator-based structure (no outlines for the four previous cards), while preserving existing stat values and empty-state behavior.
- Revisit trigger: If a reusable dashboard separator layout component is introduced, migrate this page to shared primitives instead of local divider markup.

## [2026-03-12] Convert Vendor Payments summary/history containers to one-vertical/one-horizontal divider layout
- Context: Product requested the same separator-based style on Vendor Payments, but with exactly one vertical divider between the two top metrics and one horizontal divider above Payment History.
- Decision: Replace the two top payment stat cards and Payment History outer card in `VendorPayments.tsx` with plain sections; add one vertical divider between `Net Earned` and `Upcoming Net Payout`, and one horizontal divider between the top metrics block and Payment History using `var(--dashboard-divider-blue)`.
- Why: This keeps visual consistency with the updated dashboard language while honoring the page-specific one-vertical/one-horizontal divider requirement.
- Impact: Vendor Payments now has no top/outer card outlines, uses a single vertical metric separator, and a single horizontal section separator, while preserving existing payment data and empty-state behavior.
- Revisit trigger: If shared dashboard section primitives are introduced, migrate this page’s local divider markup to the shared component.

## [2026-03-12] Remove Conversations header divider and soften contact-card borders in vendor chat list
- Context: Product requested removing the horizontal divider under `Conversations` and changing contact card outlines from dark blue to the lighter dashboard divider blue in Vendor Messages.
- Decision: In `BookingChatWorkspace.tsx`, remove the left pane `CardHeader` bottom border and set conversation/event row button border colors to `rgba(74,106,125,0.22)` across default/active/unread states.
- Why: This aligns chat-list framing with the lighter divider styling used across the rest of the updated dashboard surfaces.
- Impact: Vendor chat list no longer shows the header underline and conversation cards render with lighter outlines while preserving existing selection/unread background behaviors.
- Revisit trigger: If a shared chat-list style token system is introduced, replace hardcoded rgba border colors with shared semantic tokens.

## [2026-03-12] Guard vendor/customer chat against stale Stream channels after client disconnect
- Context: Runtime overlay showed `You can't use a channel after client.disconnect() was called` in Messages, indicating a chat lifecycle race where stale channel access happened after disconnect/reconnect.
- Decision: In `BookingChatWorkspace.tsx`, clear chat state before disconnecting/recycling Stream client on user change and wrap `chatClient.channel(...)` in a safe `try/catch` that returns `null` when the underlying client/channel is stale.
- Why: This prevents runtime crashes from transient disconnect windows while preserving the existing chat reconnect flow.
- Impact: Messages page no longer hard-crashes when Stream client/channel state is briefly stale; chat gracefully waits for a valid active channel.
- Revisit trigger: If chat client lifecycle is centralized (shared Stream provider), move these guards into the shared connection manager and remove local defensive handling.

## [2026-03-12] Remove Notifications section card outlines and separate sections with shared light-blue divider
- Context: Product requested removing the outer card outlines around `Recent Notifications` and `Notification Preferences`, while keeping a light-blue horizontal separator between those two sections.
- Decision: In `VendorNotifications.tsx`, replace both section-level `Card` wrappers with plain sections and insert a standalone horizontal divider using `bg-[var(--dashboard-divider-blue)]` between them.
- Why: This aligns Notifications with the separator-based dashboard styling now used across vendor surfaces.
- Impact: The two notifications sections no longer render outer outlines and are now separated by one matching light-blue horizontal line; inner notification entry cards remain unchanged.
- Revisit trigger: If a shared section-shell component is introduced for dashboard pages, migrate this page to that shared primitive.

## [2026-03-12] Increase vendor icon-sidebar navigation icon size by ~15%
- Context: Product requested the small sidebar navigation icons appear larger while preserving the existing icon-only sidebar button layout.
- Decision: Update vendor sidebar icon render size in `vendor-sidebar.tsx` from `26px` to `30px` (approximately +15.4%).
- Why: This provides the requested visual emphasis without changing button container size, spacing, or hover/active behavior.
- Impact: All eight vendor sidebar navigation icons render noticeably larger in both inactive and active states.
- Revisit trigger: If sidebar sizing tokens are introduced, move this hardcoded icon size to a shared sidebar icon scale variable.

## [2026-03-12] Force vendor icon-sidebar navigation icons to ~20% larger effective size
- Context: After increasing icon class size, icons did not appear larger in UI due to sidebar button SVG sizing utility precedence.
- Decision: Set vendor sidebar icon classes to `!h-8 !w-8` (`32px`) in `vendor-sidebar.tsx` so icon sizing is enforced against inherited sidebar SVG rules.
- Why: A forced size guarantees the requested larger visual icon treatment actually renders.
- Impact: Vendor sidebar icons now display at an effectively larger size (~20%+ vs original `26px`) in all button states.
- Revisit trigger: If sidebar button component exposes a formal icon-size prop/token, replace local `!important` sizing with that shared API.

## [2026-03-12] Use SidebarMenuButton tooltips for all eight vendor icon-nav buttons
- Context: Product requested reliable hover popups for each of the eight vendor sidebar icon buttons, and custom absolute-label spans were not consistently appearing.
- Decision: In `vendor-sidebar.tsx`, move icon labels to `SidebarMenuButton`’s built-in tooltip prop with `hidden: false`, `side: "right"`, and matching light-theme tooltip styling; remove the manual hover-label `<span>` for each menu item.
- Why: Built-in Radix tooltip rendering is more reliable than sibling absolute spans and avoids clipping/hover-state edge cases.
- Impact: Hovering each vendor sidebar icon now consistently shows its label popup (`Dashboard`, `Bookings`, `Listings`, `Messages`, `Payments`, `Reviews`, `Notifications`, `My Hub`).
- Revisit trigger: If shared sidebar tooltip styling tokens are introduced, replace local tooltip class strings with shared semantic tooltip styles.

## [2026-03-12] Apply vendor-style shell/sidebar + separator-first section framing to customer dashboard tabs
- Context: Product requested customer dashboard parity with vendor style in ordered steps: icon-only hover-labeled sidebar, full-width header with nav buttons below header line, and removal of large blue card outlines in favor of section separators.
- Decision: Update `CustomerDashboard.tsx` to a full-width header-first shell, convert `CustomerSidebar` to icon-only vendor-style buttons (`h-14 w-14`, forced larger icons, right-side tooltips), and refactor customer tab surfaces (`CustomerEvents`, `CustomerMessages` via `BookingChatWorkspace`, `CustomerPlanEvent`, `CustomerProfile`) to remove large outer card outlines and add light-blue separators using `var(--dashboard-divider-blue)`.
- Why: Matching shell/nav behavior and section framing across vendor and customer dashboards improves consistency while preserving existing booking, messaging, and profile flows.
- Impact: Customer dashboard now renders with vendor-parity navigation behavior and separator-based section structure, while keeping page functionality and inner controls intact.
- Revisit trigger: If a shared dashboard layout primitive is introduced, consolidate vendor/customer shell and separator patterns into shared components instead of per-page class composition.

## [2026-03-12] Move customer profile Edit action into Profile details section header
- Context: Product requested relocating the customer profile `Edit` button from the page-level heading area into the `Profile details` section.
- Decision: In `CustomerProfile.tsx`, remove the top-right page-header edit action and render the same outline `Edit` button in the `CardHeader` row of the `Profile details` section, preserving the existing `!isEditing` visibility and edit-toggle behavior.
- Why: Placing the action in the section it edits improves affordance and keeps page heading cleaner.
- Impact: `Edit` now appears inside `Profile details` when not editing; save/cancel flow and form behavior remain unchanged.
- Revisit trigger: If section headers are standardized with shared action slots, migrate this one-off header action placement to that shared pattern.

## [2026-03-12] Apply separator-first section styling to checkout page
- Context: Product requested the same light-blue separator styling used on vendor/customer dashboard surfaces for the Book Now checkout flow page.
- Decision: In `Checkout.tsx`, remove outer border outlines from major checkout sections (`Billing Details`, `Event`, `Notes and Questions`, `Payment Information`, and `Order Summary`) and insert light-blue horizontal separators between major sections; update order-summary internal horizontal rules to the same light-blue divider color (`rgba(74,106,125,0.22)`).
- Why: This keeps visual language consistent between checkout and the rest of the updated dashboard surfaces.
- Impact: Checkout now uses divider-based section framing instead of heavy section card outlines, while preserving all form fields, payment controls, and booking submission behavior.
- Revisit trigger: If checkout receives a shared section-layout primitive later, migrate local divider markup to the shared component/token system.

## [2026-03-12] Move checkout card-entry collection into Order Summary under Total
- Context: Product requested placing payment information collection directly in the `Order Summary` panel between `Total` and the `Pay [total]` button.
- Decision: In `Checkout.tsx`, remove the standalone left-column `Payment Information` section and render the card input block (`CardElement`, test-card helper text, and payment/config error messaging) immediately below the total row and above the pay button in the right summary column.
- Why: This tightens checkout flow by keeping pricing and payment action elements together in one section.
- Impact: Users now enter card details directly in the order summary before submitting payment; booking submission/payment behavior remains unchanged.
- Revisit trigger: If checkout step sequencing is later split into a multi-step flow, reassess whether card entry should stay in summary or move into a dedicated payment step.

## [2026-03-12] Compact checkout spacing and lock layout to one-screen, non-scroll desktop viewport
- Context: Product requested the checkout page fit on one screen without scrolling.
- Decision: In `Checkout.tsx`, switch the page shell to fixed viewport height with `overflow-hidden`, reduce top/between-section spacing, tighten section padding, reduce selected field heights, and shorten notes/question textareas so the full checkout composition fits within the available viewport.
- Why: Compact spacing plus fixed-height layout removes page scrolling while preserving checkout content order and behavior.
- Impact: Checkout now renders as a one-screen flow (no page scroll) on desktop-sized viewports, with all sections still present and functional.
- Revisit trigger: If additional required checkout fields are added later, reevaluate compact spacing or introduce conditional progressive disclosure to keep one-screen fit.

## [2026-03-12] Add explicit Google OAuth callback handler and redirect to existing vendor account route
- Context: Google OAuth returned to `/api/google/oauth/callback?code=...`, but no backend callback route existed, so users landed on the SPA NotFound page.
- Decision: Add `GET /api/google/oauth/callback` in `server/routes.ts` to exchange authorization code for tokens via Google's token endpoint, then redirect success/failure to `/vendor/account` with query status (`google_calendar=connected|error`).
- Why: Handling the callback server-side prevents 404 behavior and keeps redirect target on an existing app route with the smallest scoped change.
- Impact: OAuth callback now completes token exchange and sends users to a valid page instead of a dead callback URL.
- Revisit trigger: If calendar integration persists tokens per vendor, replace query-only status redirects with authenticated persistence and user-visible integration state.

## [2026-03-12] Scope APP_URL base inside Google OAuth callback to prevent backend crash
- Context: During Google callback handling, server logs showed `ReferenceError: appUrl is not defined`, which crashed the backend process and dropped port `5001`.
- Decision: Define `appUrl` inside the `/api/google/oauth/callback` handler scope (instead of the `/api/google/oauth/start` handler) before callback redirect logic uses it.
- Why: Callback redirect paths must reference a variable available in the callback closure to avoid runtime exceptions.
- Impact: Callback requests no longer crash Express, so backend stays online on `5001` while processing OAuth redirects.
- Revisit trigger: If OAuth redirect URL composition is reused elsewhere, extract a shared helper to avoid route-local variable scope mistakes.

## [2026-03-12] Persist vendor Google OAuth connection on vendor_accounts via signed OAuth state
- Context: Google OAuth callback began exchanging codes for tokens successfully, but the app still discarded those tokens and had no persisted vendor-level Google connection state.
- Decision: Add minimal Google connection columns directly to `vendor_accounts` and pass a short-lived signed vendor account reference through the OAuth `state` parameter so `/api/google/oauth/callback` can update the correct vendor row after token exchange.
- Why: One vendor-to-one Google connection is the current MVP need, and signed state avoids relying on callback-time SPA bearer auth that is not naturally present after Google's redirect.
- Impact: Successful Google OAuth callbacks now persist token credentials and connection status for the owning vendor account without introducing calendar sync yet.
- Revisit trigger: If vendors need multiple Google connections, encrypted token storage, or real calendar selection/sync, move this data into a dedicated integrations table/service.

## [2026-03-12] Start Google OAuth only through authenticated frontend fetch
- Context: Direct browser navigation to `/api/google/oauth/start` omitted the Auth0 bearer token, so the backend could not sign OAuth state and the callback always returned `google_calendar=error`.
- Decision: Make `/api/google/oauth/start` return JSON `{ url }` only after authenticated vendor verification, and have the vendor account frontend fetch that URL with the Auth0 bearer token before redirecting the browser to Google.
- Why: The signed state must be created server-side from authenticated vendor context before the external OAuth redirect happens.
- Impact: Google connect now preserves vendor identity across the OAuth roundtrip without changing the callback route.
- Revisit trigger: If server-side session-based OAuth is introduced later, reassess whether this prefetch-and-redirect pattern is still necessary.

## [2026-03-12] Remove legacy VendorAccount route and place Google Calendar connect on the real vendor dashboard
- Context: The app had both `/vendor/dashboard` and a separate legacy `/vendor/account` page, which created duplicate dashboard-like surfaces and caused the Google Calendar connect UI to land on the wrong page.
- Decision: Delete the unused `VendorAccount` page and route, move the Google Calendar connect card into `VendorDashboard` directly beneath `Complete Your Setup`, and redirect Google OAuth callback success/error back to `/vendor/dashboard`.
- Why: MVP vendor workflows should center on one canonical dashboard, and the calendar connect action belongs with other setup tasks on that main surface.
- Impact: Vendors now complete Stripe and Google Calendar setup from the same dashboard, and OAuth returns to the active dashboard instead of a legacy page.
- Revisit trigger: If a true vendor account/settings page is later reintroduced with a distinct purpose, reevaluate whether integrations should live there or remain on the dashboard.

## [2026-03-13] Add condensed Google Calendar connect card to Bookings & Jobs filters row
- Context: Vendors also need a convenient calendar-connect entry point while managing bookings, specifically near the status filters on `VendorBookings`.
- Decision: Reuse the existing Google OAuth connect flow in `VendorBookings.tsx` and place a condensed integration card to the right of the status tabs on large screens, with natural stacking on smaller screens.
- Why: This keeps calendar setup close to the scheduling workflow without introducing a new page or redesigning the booking management layout.
- Impact: Vendors can initiate Google Calendar connection directly from `Bookings & Jobs`, while the main dashboard setup card remains available.
- Revisit trigger: If integration state, sync status, or calendar conflict warnings become richer, replace the lightweight card with a fuller bookings-side integration panel.

## [2026-03-13] Add vendor Google calendar attachment layer with token refresh, calendar list, selection, and create
- Context: Google OAuth connection was working and persisted tokens on `vendor_accounts`, but vendors still had no way to attach a specific Google calendar for future booking sync.
- Decision: Add a shared backend Google helper in `server/google.ts` to load the vendor account, validate connection state, refresh access tokens when expired, and reuse that helper for `GET /api/google/calendars`, `POST /api/google/calendars/select`, and `POST /api/google/calendars/create`; expose Google connection state via `/api/vendor/me`; and extend the dashboard Google card to show connected status, list calendars, save the selected calendar, and create an `EventHub Bookings` calendar.
- Why: This is the minimum shippable attachment layer that keeps the existing OAuth flow intact and persists a calendar choice without building sync/import logic yet.
- Impact: Connected vendors can now pick or create the Google calendar EventHub should target later, and refreshed Google access tokens are persisted automatically when needed.
- Revisit trigger: When booking push/import or availability blocking starts, reevaluate whether encrypted token storage, per-profile calendars, or a dedicated integrations service/table is needed.

## [2026-03-13] Add dashboard review panel for unmatched Google events with manual listing mapping
- Context: Backend support for unmatched selected-calendar Google events and manual event-to-listing mappings existed, but vendors had no dashboard UI to review those events and attach them to a listing.
- Decision: Extend the existing `VendorDashboard` Google Calendar card with a simple unmatched-events section that appears only when Google is connected and a calendar is selected, fetches `GET /api/google/events/unmatched`, loads the vendor’s listings, and allows per-event manual mapping through `POST /api/google/events/map`.
- Why: This keeps the review workflow close to the existing calendar connection surface and adds the minimum vendor-facing control needed to turn unmatched Google events into future listing-level blockers without introducing a new dashboard area.
- Impact: Vendors can now review unmatched Google events, assign them to a listing directly from the dashboard, and have those mappings participate in future conflict prevention immediately after save.
- Revisit trigger: If vendors need to audit, edit, or clear mappings in bulk, add a dedicated mapped-events management surface instead of expanding the compact dashboard panel further.

## [2026-03-13] Add one-booking Google sync reconciliation repair flow in dashboard
- Context: The app could already detect Google booking sync drift through `/api/google/bookings/reconciliation`, but vendors had no repair action for missing, stale, or wrong-calendar booking events.
- Decision: Normalize reconciliation results around explicit issue codes (`sync_failed`, `missing_google_event_id`, `missing_in_selected_calendar`, `calendar_mismatch`), add a vendor-auth one-booking repair route that reuses the existing booking sync helper while forcing the vendor’s currently selected calendar, and surface those issues plus per-booking `Repair Sync` actions inside the existing dashboard Google Calendar card.
- Why: This is the smallest safe repair loop that lets vendors recover broken Google booking sync state without background jobs, bulk operations, or a separate admin surface.
- Impact: Vendors can now see actionable Google booking sync issues on the dashboard and repair them one booking at a time, with refreshed booking sync metadata written back after each repair attempt.
- Revisit trigger: If repair volume grows or recurring drift appears, move this from dashboard-triggered repair into a queued/background reconciliation system with bulk repair controls.

## [2026-03-13] Add process-local recurring Google sync verification foundation
- Context: Google sync drift could only be discovered through manual dashboard checks and on-demand reconciliation calls, which left the system without any periodic detection path.
- Decision: Reuse the existing booking reconciliation and Google event-matching logic to add a per-vendor verification helper, expose a vendor-auth `GET /api/google/bookings/verification/run` entry point returning normalized verification summary data, and schedule recurring verification with the existing process-local `setInterval` pattern already used for chat cleanup.
- Why: This adds background-safe drift detection with the smallest possible infrastructure change and avoids introducing a new job framework before launch.
- Impact: Connected vendors with a selected Google calendar are now periodically verified for Google sync drift by the app process, and operators can also trigger the same verification logic on demand through a dedicated endpoint.
- Revisit trigger: If verification volume grows, if multiple app instances need coordinated execution, or if repair automation is added, move this timer-based approach into a real queued/cron-backed job system with persisted run history.

## [2026-03-13] No existing booking time-change route to harden yet; preserve conflict checks at creation only
- Context: Product requested applying the same listing-level conflict protection to booking reschedules or time changes, but the current codebase does not expose a route that edits `event_date`, `event_start_time`, `booking_start_at`, or `booking_end_at` after booking creation.
- Decision: Audit existing booking update paths and leave runtime conflict logic unchanged for this slice because the only real update routes are vendor status transitions (`PATCH /api/vendor/bookings/:id`) and customer event reassignment (`PATCH /api/customer/bookings/:id/event`), neither of which changes availability timing.
- Why: Inventing a new reschedule/update path would expand product scope beyond the requested “apply to real existing paths only” constraint and risk destabilizing the booking flow close to launch.
- Impact: Same-listing EventHub and matched-Google conflict checks still run on booking creation, while status changes and customer event relinking continue unchanged; when a real reschedule path is introduced later, it should reuse the existing `checkListingAvailabilityForBookingRequest` helper with `excludeBookingId`.
- Revisit trigger: Add the same conflict and Google fail-safe validation immediately when a vendor/customer/admin booking time-edit route is introduced.

## [2026-03-13] Treat brand-new empty selected Google calendars as clean success for dashboard verification panels
- Context: After selecting a new empty Google calendar, the dashboard `Unmatched Google Events` and `Google Booking Sync Issues` panels could hit the backend error path instead of rendering empty states.
- Decision: Make the Google event list helper safely default to `[]` for null or missing `items`, return `{ events: [] }` immediately from `/api/google/events/unmatched` when the selected calendar has zero events, and short-circuit reconciliation unmatched-event counting to `0` when the selected calendar read succeeds but returns no events.
- Why: An empty selected calendar is a valid starting point and should not run extra matching work or surface a false failure state.
- Impact: New empty calendars now render clean empty states in both dashboard panels instead of backend 500 errors.
- Revisit trigger: If Google verification responses are standardized further, consolidate these empty-success shapes into shared response serializers for all Google dashboard routes.

## [2026-03-13] Short-circuit Google booking reconciliation for vendors with zero active bookings
- Context: A vendor selecting a brand-new empty Google calendar can legitimately have no EventHub bookings yet, and reconciliation should return a clean empty result in that state.
- Decision: In `buildGoogleBookingReconciliationForVendorAccount`, return early with zero counts and an empty `issues` list when there are no active bookings, while preserving the already-computed Google read status and unmatched-event count.
- Why: This avoids unnecessary downstream reconciliation work for a valid no-bookings state and keeps the dashboard sync-issues panel aligned with the expected empty state.
- Impact: Vendors with a new empty calendar and no active bookings now see `No Google sync issues` instead of a backend error.
- Revisit trigger: If reconciliation later needs historical cancelled/completed booking auditing, revisit the early return to distinguish “no active bookings” from “no bookings at all.”

## [2026-03-13] Guard Google booking reconciliation against legacy bookings tables missing sync columns
- Context: The `GET /api/google/bookings/reconciliation` route still 500ed after empty-calendar fixes, because its raw SQL candidate query selected booking-side Google sync columns unconditionally.
- Decision: Detect the live `bookings` table’s reconciliation columns through `information_schema.columns`, cache that result, and have `listGoogleSyncReconciliationCandidatesForVendorAccount` substitute typed `NULL` expressions for any missing columns instead of querying absent fields directly; include a lightweight `bookingSchemaStatus`/`bookingSchemaMissingColumns` marker in the reconciliation payload.
- Why: This makes reconciliation safe against legacy or partially migrated bookings schemas without changing sync behavior or broader booking logic.
- Impact: Reconciliation now returns normalized empty/safe results instead of 500ing when the selected calendar is valid but the live bookings table is missing one or more Google sync metadata columns.
- Revisit trigger: Once all environments are fully migrated, this fallback can be removed and replaced with a strict startup schema assertion if desired.

## [2026-03-13] Confirm Google calendar selection before optional backfill of existing EventHub bookings
- Context: Vendors expect selecting or switching the Google calendar in EventHub to optionally push their existing EventHub bookings into that calendar, not just affect future bookings.
- Decision: Keep calendar selection and historical backfill as separate steps behind one dashboard confirmation dialog: selecting/switching a calendar now prompts `Sync / Don't Sync`, `Don't Sync` only saves the selected calendar, and `Sync` saves the selected calendar then backfills existing `pending`, `confirmed`, and `completed` bookings through a dedicated `POST /api/google/calendars/sync-existing` route that reuses the existing booking-to-Google sync helper with the selected calendar as the target.
- Why: This gives vendors explicit control over whether historical EventHub bookings should be copied into the selected Google calendar, while preserving the existing future-booking sync behavior and avoiding silent mass writes on calendar changes.
- Impact: Vendors now see a confirmation popup on calendar selection/switch, can opt into backfilling existing eligible bookings into the selected Google calendar, and all future bookings continue syncing to that selected calendar afterward.
- Revisit trigger: If vendors need more granular migration controls later, replace the simple binary popup with a fuller calendar-switch migration flow that previews which bookings will be copied.

## [2026-03-14] Use direct DB cleanup flow to reset a single vendor onboarding test account
- Context: A test user needed to rerun signup and vendor onboarding from scratch with the same email, without changing frontend or backend behavior.
- Decision: Perform a one-off, transaction-scoped delete for `cassidymalm21@gmail.com` across linked relational rows (`vendor_profiles`, `vendor_accounts`, `users`, and dependent telemetry rows such as `web_traffic`) in FK-safe order, and verify zero remaining matches by email and prior Auth0 subject in local tables.
- Why: This is the fastest, lowest-risk launch-path reset for onboarding QA when the goal is email reuse and clean account state, not feature work.
- Impact: The email is now reusable for a fresh signup/onboarding run in EventHub local data, with no app code changes.
- Revisit trigger: If account resets become frequent, add an internal admin-only account reset tool with explicit guardrails/audit logging instead of manual SQL.

## [2026-03-15] Phase 3 canonical booking data cutover with migration-owned schema/backfill
- Context: Booking/vendor/google flows were still carrying runtime schema-repair logic and column-existence routing, with operational linkage sometimes inferred from `booking_items`/`item_data` instead of canonical `bookings` fields.
- Decision: Remove runtime schema mutation from booking/google/vendor paths, add startup-only canonical bookings schema validation, add migration `0014_phase3_canonical_booking_cleanup` to create/guarantee `booking_items` and `google_calendar_event_mappings` objects plus canonical indexes/FKs, and backfill canonical booking ownership/linkage/snapshot/timing fields with deterministic rules.
- Why: Launch reliability requires migration-owned schema, stable canonical reads, and reduced dependence on legacy fallback branches that vary by environment.
- Impact: Core booking reads now prefer canonical `bookings.vendor_account_id`, `bookings.vendor_profile_id`, `bookings.listing_id`, `bookings.booking_start_at`, and `bookings.booking_end_at`; Google sync loading uses canonical linkage first; GET booking routes no longer mutate booking status; compatibility fallback remains only when canonical fields are missing on legacy rows.
- Revisit trigger: After Phase 4 completes full legacy deprecation, remove remaining `booking_items` fallback reads and enforce stricter `NOT NULL` constraints on canonical booking ownership/timing fields.

## [2026-03-15] Phase 4 launch hardening for vendor-timezone canonical booking and Google sync
- Context: After Phase 3, canonical writes/reads were in place but booking-time computation and Google event payload generation still had UTC/default-timezone behavior in key paths, and a small set of compatibility fallbacks remained for older rows.
- Decision: Make vendor profile `operating_timezone` (IANA) the canonical operating timezone, persist `bookings.vendor_timezone_snapshot`, compute `booking_start_at` / `booking_end_at` from customer local wall-time inputs in that timezone, and build Google event start/end values from canonical booking windows in the same vendor timezone. Add migration `0015_phase4_timezone_and_constraints` for timezone columns/defaults/backfill plus low-risk checks/indexes/defaults, and add a lightweight vendor-auth launch verification endpoint `GET /api/internal/launch/smoke-summary`.
- Why: Launch reliability depends on one explicit timezone rule across booking blocking and Google sync, plus practical observability for manual launch smoke runs.
- Impact: Booking window computation, conflict checks, and Google writes now share the same vendor-local timezone model; onboarding captures browser timezone for profile persistence; Google booking descriptions include timezone context; reconciliation metadata no longer depends on schema-column fallback markers; compatibility fallback is now isolated to legacy cases where canonical booking linkage is still null (`bookings.listing_id` / `bookings.vendor_account_id` on old rows).
- Revisit trigger: Phase 5 should remove the remaining legacy fallback joins to `booking_items` once null canonical linkage rows are remediated and then enforce stricter `NOT NULL`/FK guarantees for booking ownership/linkage/timing fields.

### Phase 4 Manual Launch Smoke Checklist
- Onboard a vendor and confirm `vendor_profiles` saves `operating_timezone`, business identity fields, address/home-base coordinates, and visibility toggles.
- Create/publish a listing and verify canonical listing fields persist (`instant_book_enabled`, `pricing_unit`, location/radius/mode, travel/delivery/setup fields).
- Open listing detail and confirm CTA label matches canonical `instant_book_enabled` (`Book Now` vs `Request to Book`).
- Run checkout for both pricing modes and submit valid timing input; confirm booking row writes canonical timing fields and `vendor_timezone_snapshot`.
- Attempt an overlapping booking for the same listing and verify EventHub conflict blocking still triggers.
- With Google connected, create/update/cancel a booking and confirm the Google event times match vendor local timezone behavior.
- Use unmatched mapping UI flow (`/api/google/events/unmatched` + map/clear) and confirm mapping persists in `google_calendar_event_mappings`.
- Run reconciliation/repair flow (`/api/google/bookings/reconciliation` + repair route) and confirm issue codes/repair behavior remain stable.
- Run `GET /api/internal/launch/smoke-summary` for the vendor and verify canonical-ready checks pass.

## [2026-03-17] Match vendor onboarding left sidebar interaction model to dashboard icon rail
- Context: Vendor onboarding used a custom numbered text sidebar with a darker divider and no hover discoverability, while vendor dashboard/my events used an icon rail with tooltip-style labels and lighter divider treatment.
- Decision: Replace the onboarding step sidebar with a dashboard-style icon rail using icon buttons for `Business Details` and `Confirm`, add hover tooltip cards with step name + short description, keep completed-step check icon behavior, and set the sidebar divider to the same lighter blue border (`rgba(74,106,125,0.22)`).
- Why: This unifies navigation language across vendor surfaces and makes onboarding step intent readable without permanent text labels.
- Impact: Onboarding now visually matches dashboard-side navigation patterns, including hover affordances and divider color consistency, while preserving existing step progression behavior.
- Revisit trigger: If onboarding expands beyond two steps or mobile hover behavior needs refinement, introduce a responsive labeled variant for touch-first devices.

## [2026-03-17] Hide manual address fields until onboarding location picker selection
- Context: Vendor onboarding previously showed street/city/state/zip inputs before a location was selected, which encouraged manual entry before map-verified address selection and made the first-step UI busier.
- Decision: In onboarding `Business Details`, render only the location picker first; show street/city/state/zip fields only after the user selects a location (or existing address data is already present), and continue auto-filling those fields from picker selection.
- Why: This enforces the intended verification-first flow while preserving editability after selection and keeping the initial form simpler.
- Impact: Users now see a cleaner address experience at first load, with address component inputs revealed and prefilled after picker selection; business phone/email remain visible and unchanged.
- Revisit trigger: If vendors need a deliberate “manual address entry” fallback, add an explicit toggle instead of always revealing fields by default.

## [2026-03-17] Add onboarding “About the Owner” step mapped directly to My Hub owner-profile fields
- Context: Vendors could fill owner/profile personality fields on `My Hub`, but onboarding did not collect them, so profile completion was split across two flows.
- Decision: Add a new onboarding step between `Business Details` and `Confirm` named `About the Owner`, using the same field labels as My Hub (`Tagline`, `In Business Since (Year)`, `Specialties`, `Events Served (Starting Count)`, `Hobbies`, `Home State`, `Fun Facts`) and persist them during onboarding into `vendor_profiles.online_profiles` using the existing My Hub keys (`shopTagline`, `inBusinessSinceYear`, `specialties`, `eventsServedBaseline`, `hobbies`, `homeState`, `funFacts`).
- Why: This keeps onboarding and My Hub aligned while allowing vendors to complete more profile content in one pass without adding a separate storage model.
- Impact: Answers entered during onboarding now auto-appear on My Hub and vendor public profile reads that already consume these `online_profiles` keys; onboarding step navigation now includes a dedicated owner-profile section.
- Revisit trigger: If these fields become required for launch quality, add explicit validation rules in onboarding instead of keeping them optional.

## [2026-03-17] Normalize onboarding business name to title case per word with apostrophe support
- Context: Onboarding business name input allowed raw casing and special characters at entry time, which could produce inconsistent display names before persistence.
- Decision: Normalize business name as the user types to letters/numbers/spaces plus apostrophes only, and title-case each word (including apostrophe-separated segments), while keeping backend onboarding account writes aligned to the same normalized profile name.
- Why: This enforces a consistent, customer-facing business name format early in onboarding and avoids unnormalized fallback values in vendor account records.
- Impact: Vendor onboarding now auto-capitalizes each business-name word and strips unsupported characters in the input itself; persisted account/profile names remain consistent with this rule.
- Revisit trigger: If future brand requirements need broader punctuation support (for example `&` or `-`), expand both client and server normalization rules together.

## [2026-03-17] Move onboarding “About you” input from Business Details to About the Owner step
- Context: Onboarding collected `About you` under `Business Details`, while owner-personality fields were grouped under the newer `About the Owner` step.
- Decision: Remove the `About you (optional)` textarea from `Business Details` and render it in `About the Owner`, keeping the same `aboutVendor` field binding and persistence path.
- Why: This aligns question grouping by intent and keeps business-operational details separate from owner-profile details.
- Impact: Vendors now answer `About you` in the owner-focused step, and existing save behavior remains unchanged because the backing field is the same.
- Revisit trigger: If onboarding question grouping changes again, keep all owner/profile narrative fields in one dedicated section for consistency.

## [2026-03-17] Add My Hub-style profile and cover photo inputs to onboarding About the Owner step
- Context: Vendors could set profile and cover photos in My Hub, but onboarding had no equivalent media inputs, which delayed completion of vendor-facing branding until after onboarding.
- Decision: Add profile photo and cover photo upload sections to onboarding `About the Owner`, using the same image type/size constraints and optimization pattern as My Hub (client-side optimize to compact data URL), store selected images in onboarding form state, and persist them during `/api/vendor/onboarding/complete` by decoding the data URLs and saving files under `/uploads/vendor-shops`.
- Why: Onboarding occurs before a vendor account/profile is guaranteed, so direct reuse of the authenticated My Hub upload endpoint is not reliable in-step; persisting at onboarding completion guarantees clean canonical storage while keeping UX close to My Hub.
- Impact: Vendors can now upload/change/remove profile and cover photos during onboarding, and the saved URLs are written to `online_profiles.shopProfileImageUrl` / `shopCoverImageUrl` (with cover position), so My Hub and Vendor Hub display those photos immediately after onboarding.
- Revisit trigger: If onboarding should support full drag-position editors identical to My Hub, extract shared photo-editor components and use direct authenticated upload once vendor account bootstrap timing is standardized.

## [2026-03-17] Use a two-column About the Owner onboarding layout with optional photo emphasis
- Context: The onboarding `About the Owner` step stacked all inputs and photo cards in a single column, leaving excessive blank space on wider screens and burying profile media prompts.
- Decision: Render `About the Owner` as a responsive two-column layout with owner text inputs on the left and profile/cover photo cards on the right, and add recommendation copy `Customize your hub with some photos!` while keeping photo uploads optional.
- Why: This reduces perceived whitespace, improves scanability, and reinforces photo completion as highly recommended without adding required-field friction.
- Impact: Desktop onboarding uses available horizontal space more efficiently; mobile still stacks sections naturally; photo persistence behavior remains unchanged.
- Revisit trigger: If analytics or QA show lower step completion on smaller screens, test moving the recommendation card or collapsing photo cards behind an accordion on mobile.

## [2026-03-17] Add drag-and-zoom photo editing to onboarding About the Owner profile and cover uploads
- Context: Vendors could upload profile/cover images during onboarding, but there was no in-step edit control for zooming and repositioning inside the preview frames.
- Decision: Add onboarding photo editor dialogs for both profile and cover with drag-to-reposition and zoom slider controls, then persist the edited result by generating cropped data URLs before storing them in onboarding form state.
- Why: This matches expected My Hub editing behavior without requiring additional onboarding schema fields or runtime media mutation logic.
- Impact: Vendors can now control crop/framing during onboarding, and saved photos carry the edited framing into My Hub/Vendor Hub immediately after onboarding completion.
- Revisit trigger: If onboarding needs non-destructive re-edit fidelity later, store transform metadata separately in addition to cropped image output.

## [2026-03-17] Move business profile enrichment fields from About the Owner to Business Details right column
- Context: Onboarding needed `Tagline`, `In Business Since (Year)`, `Specialties`, and `Events Served (Starting Count)` grouped with `About the business`, and the Business Details layout needed to match About the Owner spacing/gutters.
- Decision: Move those four fields from `Step3_AboutOwner` into the right column of `Step2_BusinessDetails` with `About the business`, keep core business/contact/address/visibility questions on the left, and apply the same two-column spacing pattern used in About the Owner.
- Why: This aligns business-level narrative/profile enrichment with business details instead of owner persona details and makes the two onboarding sections visually consistent.
- Impact: Business Details now uses the wider two-column layout and contains `About the business` + the four moved fields on the right; About the Owner now focuses on owner bio/hobbies/home-state/fun-facts plus photo setup.
- Revisit trigger: If onboarding completion drops due to information density in Business Details, split the right column into collapsible sub-sections without changing field ownership.

## [2026-03-17] Unlock onboarding sidebar icon navigation based on completed sections
- Context: Sidebar icons only allowed navigation to `step.id <= currentStep`, forcing progression via `Next`/`Back` even when earlier sections were already complete.
- Decision: Add section completion tracking to onboarding state and use completion-aware icon reachability: `Business Details` icon unlocks `About the Owner` once business details are valid, and `Confirm` unlocks after the owner step has been completed.
- Why: This allows users to switch between completed onboarding sections directly from the icon rail while preserving guardrails for incomplete sections.
- Impact: Sidebar icons now support practical section toggling without bypassing required business-details validation; completion state is persisted in onboarding local storage for continuity across refreshes.
- Revisit trigger: If future steps gain strict validation rules, centralize each step’s completion predicate to avoid duplicated gating logic.

## [2026-03-17] Reorder confirm summary to match onboarding section scan order
- Context: The confirm card mixed fields from different onboarding sections, causing items like `About you` to appear out of expected sequence.
- Decision: Render confirm values in sectioned, row-paired order (`Business Details`, then `About the Owner`) using top-to-bottom, left-to-right row scanning aligned with onboarding layouts.
- Why: This makes confirmation review predictable and reduces mismatches between what users entered and where they expect to verify it.
- Impact: Confirm view now shows business-left/business-right pairs first, followed by owner-left/owner-right pairs, including photo presence status.
- Revisit trigger: If onboarding sections are renamed or reordered again, update the confirm row maps in one place to preserve scan-order parity.

## [2026-03-18] Replace Cloud Dancer `#f0eee9` surfaces with white `#ffffff` in client UI
- Context: Product requested all UI usages of `#f0eee9` / `#F0EEE9` to be switched to white.
- Decision: Perform a client-wide replacement in `client/src` from `#f0eee9` and `#F0EEE9` to `#ffffff`.
- Why: This standardizes target surfaces on white without changing structure or behavior.
- Impact: Onboarding and other pages/components previously using the cream surface now render white backgrounds.
- Revisit trigger: If the design system introduces semantic surface tokens for these areas, migrate hardcoded whites to tokenized variables.

## [2026-03-18] Make onboarding cover-photo editor responsive to Vendor Hub cover ratio and keep modal visually centered
- Context: The onboarding `About the Owner` cover-photo edit popup could render a crop frame that visually overflowed or mismatched available modal space on some viewport sizes, and its preview ratio did not consistently track the Vendor Hub hero ratio.
- Decision: Update `Step3_AboutOwner` to compute cover preview/output dimensions from the same Vendor Hub hero-height formula (`clamp(280px, 42vw, 520px)`), use a viewport-responsive crop frame width, apply that ratio to the inline cover preview, and constrain the dialog content width for stable centered presentation.
- Why: Keeping one shared ratio model between onboarding editing and Vendor Hub display improves framing predictability while preventing oversized crop UI from spilling outside the modal.
- Impact: Cover-photo editing in onboarding now scales within the popup across desktop/mobile widths, preserves Vendor Hub ratio behavior, and keeps the edit dialog centered more reliably.
- Revisit trigger: If cover editing is unified across onboarding and My Hub into shared components, move this ratio/frame sizing logic into a single reusable utility and remove duplicated viewport calculations.

## [2026-03-18] Align Confirm step header position with other onboarding steps while preserving readable summary width
- Context: On the onboarding `Confirm` step, the step counter and section title were horizontally offset compared with `Business Details` and `About the Owner` because the main content container switched to a narrower `max-w-4xl`.
- Decision: Keep the onboarding page shell width consistent at `max-w-[1400px]` across steps so header anchors match, and constrain only `Step4_Confirm` body content to `max-w-4xl` for summary readability.
- Why: This fixes header alignment without forcing the confirm summary card/buttons to span overly wide desktop layouts.
- Impact: The `Step 3 of 3` counter and `Confirm` title now appear in the same left position as previous onboarding steps, while confirm content retains a compact, readable width.
- Revisit trigger: If onboarding introduces per-step layout presets, centralize step-width policy in one config object instead of inline width conditions.

## [2026-03-18] Increase Confirm summary section header size to 25px
- Context: On the vendor onboarding `Confirm` step, section headings (for example `Business Details`) needed to be larger for clearer visual hierarchy.
- Decision: Set `Step4_Confirm` section heading typography from `text-base` to explicit `text-[25px]` with tight leading for both `Business Details` and `About the Owner`.
- Why: This applies the requested visual emphasis directly at the section-header level while keeping summary row content unchanged.
- Impact: Confirm section headers now render at 25px and stand out more clearly above the detail rows.
- Revisit trigger: If onboarding typography is tokenized globally, replace ad-hoc pixel sizes with semantic heading scale tokens.

## [2026-03-18] Adjust Confirm summary section headers from 25px to 18px
- Context: After increasing Confirm section headers to 25px, final UI preference was a smaller heading size.
- Decision: Update `Step4_Confirm` section headings (`Business Details`, `About the Owner`) to `text-[18px]` while keeping existing weight and spacing.
- Why: This preserves hierarchy over row text but reduces visual dominance in the confirm summary card.
- Impact: Confirm section headers now render at 18px.
- Revisit trigger: If a global onboarding type scale is introduced, replace per-component pixel sizes with shared semantic heading tokens.

## [2026-03-18] Set Confirm summary key-value typography to 13px labels and 12.5px values
- Context: Confirm-step summary rows needed tighter typography control for label/value hierarchy (`Label: Value`) without changing section headers.
- Decision: In `Step4_Confirm`, set key labels (`leftLabel`/`rightLabel`) to `text-[13px]` and values (`leftValue`/`rightValue`) to `text-[12.5px]`, applied consistently across Business Details and About the Owner summary rows.
- Why: This keeps labels visually distinguished while reducing overall text density in the confirmation card.
- Impact: Confirm key-value rows now render with 13px bold labels and 12.5px values.
- Revisit trigger: If onboarding typography gets centralized into design tokens, replace inline pixel classes with shared semantic text styles.

## [2026-03-18] Apply global typography baseline of 13px for input controls and 18px for section headers
- Context: Product requested site-wide typography consistency with input-box text at 13px and section-header text at 18px.
- Decision: Add global base rules in `client/src/index.css` to force text-entry controls (`input` excluding checkbox/radio/file/range, `textarea`, `select`, and `[role="combobox"]`) to `13px`, set semantic `h2` headings to `18px`, and align shared `CardTitle` primitive to `18px`.
- Why: Centralized typography rules provide broad consistency faster than page-by-page overrides and keep launch momentum.
- Impact: Form control text now normalizes to 13px across the app, and section-style headings rendered as `h2`/card titles normalize to 18px unless explicitly overridden elsewhere.
- Revisit trigger: If a formal design-token typography scale is introduced, replace global `!important` baselines with token-driven component variants and remove hard-coded pixel rules.

## [2026-03-18] Use fixed bottom onboarding action rail on Confirm step to match previous steps
- Context: Confirm-step actions were rendered inline beneath the summary card, so `Back` and completion actions did not align with the fixed bottom navigation pattern used in onboarding steps 1 and 2.
- Decision: Update `Step4_Confirm` to use the same fixed bottom action rail structure as other onboarding steps (`fixed bottom-0 left-24 right-0`, shared container paddings, and large button sizing), placing `Back` on the left and `Continue to dashboard` + `Create first listing` grouped on the right.
- Why: Matching the established onboarding navigation pattern improves consistency and makes next/exit controls easier to find.
- Impact: Confirm now has bottom-left/back and bottom-right/completion controls in the same screen positions as prior onboarding steps.
- Revisit trigger: If onboarding mobile action layout changes (for example stacked buttons on small viewports), extract a shared onboarding footer-action component with responsive variants.

## [2026-03-18] Split Confirm summary into two side-by-side cards by section
- Context: Confirm rendered `Business Details` and `About the Owner` inside one combined bordered container, making section separation less explicit.
- Decision: Render two separate bordered cards in a two-column grid on Confirm: `Business Details` on the left and `About the Owner` on the right, while preserving existing row typography and spacing and leaving the fixed bottom action bar unchanged.
- Why: This improves scanability by matching the onboarding section model directly in the confirmation layout.
- Impact: Confirm now presents the same summary fields in two distinct side-by-side section cards with unchanged label/value styling.
- Revisit trigger: If mobile confirm readability drops, add a breakpoint-specific stacked-card variant while preserving desktop side-by-side layout.

## [2026-03-18] Remove contact-visibility summary rows from onboarding Confirm business card
- Context: The Confirm business summary still displayed contact visibility fields (`Show phone`, `Show email`, `Show address`) that are no longer applicable to the current onboarding confirmation requirements.
- Decision: Remove those three rows from `Step4_Confirm` business summary mapping and keep other business fields unchanged.
- Why: This reduces outdated noise in confirm review and keeps only currently relevant business data.
- Impact: Confirm no longer shows the deprecated contact-visibility rows; `Events served` remains visible in business details.
- Revisit trigger: If contact visibility returns as a launch requirement, reintroduce those fields from the canonical onboarding source with updated wording.

## [2026-03-18] Use one-column field layout inside each Confirm section card
- Context: Each Confirm card still rendered row pairs in a two-column internal layout, while product requested each card show a single vertical column of fields.
- Decision: Update `Step4_Confirm` row rendering so both `Business Details` and `About the Owner` cards display one field line per column flow (left label/value first, optional right label/value directly beneath it) instead of a two-column grid.
- Why: A single-column list improves scan order and avoids split attention within each section card.
- Impact: Both Confirm cards now show all fields in one vertical column while preserving existing typography and card/footer positioning.
- Revisit trigger: If desktop density needs to increase later, add an optional compact two-column variant behind a responsive breakpoint or feature flag.

## [2026-03-18] Style hobby pills with brand coral in onboarding About the Owner and My Hub
- Context: Product requested hobby pills use coral `#E07A6A` with white text, limited to the hobby sections on onboarding `About the Owner` and `My Hub`.
- Decision: Add optional styling props to shared `HobbyPillInput` for pill and remove-button classes, and apply those props only in `Step3_AboutOwner` and `myhub`.
- Why: This keeps the requested visual update scoped to the two intended surfaces without forcing global hobby-pill color changes.
- Impact: Hobby pills in onboarding `About the Owner` and `My Hub` now render with `#E07A6A` background/border and `#ffffff` text, including white-toned remove icons; other potential `HobbyPillInput` usages remain unchanged unless explicitly styled.
- Revisit trigger: If hobby pills should be branded consistently app-wide, move these colors into default `HobbyPillInput` styles or a shared semantic token.

## [2026-03-18] Align onboarding About the Owner photo panel higher with About you input line
- Context: In onboarding `About the Owner`, the photo panel started lower than the `About you` input area because the recommendation card rendered above profile/cover cards.
- Decision: Move the recommendation card below the profile/cover cards and apply a small desktop-only upward offset to the right photo column (`lg:-mt-6`) while keeping sticky behavior.
- Why: This raises the profile/cover area so the profile photo outline aligns more closely with the top border line of the `About you` input box, matching requested visual alignment.
- Impact: On desktop, the photo area begins higher and better lines up with the left input column; mobile stacking behavior remains unchanged.
- Revisit trigger: If future spacing updates change left-column input heights, re-tune the desktop offset or replace it with a shared baseline alignment utility.

## [2026-03-18] Set non-outline photo action buttons to `#4A6A7D` in onboarding and My Hub
- Context: Product requested non-outline photo action buttons (`Edit/Remove photo`, `Edit/Remove cover` equivalents) use the same slate color treatment.
- Decision: Add explicit text color classes (`text-[#4A6A7D] hover:text-[#4A6A7D]`) to ghost-variant photo action buttons in `Step3_AboutOwner` and `myhub`.
- Why: This applies the requested color consistently without changing button variants, sizing, or action behavior.
- Impact: Relevant non-outline photo action buttons in onboarding and My Hub now render with `#4A6A7D` text/icon color.
- Revisit trigger: If button color is tokenized globally later, replace hardcoded hex classes with semantic design-token utilities.

## [2026-03-18] Match About the Owner step card shells and field outlines to Business Details styling
- Context: Onboarding `About the Owner` had uncarded left fields and nested right-side cards with different border treatment than `Business Details`.
- Decision: Restructure `Step3_AboutOwner` into the same two-column section-card shell pattern as `Step2_BusinessDetails` (left card + right card) and set both outer card borders to `rgba(154,172,180,0.55)`. Keep existing input components so field outline styling continues to use the shared onboarding input border color.
- Why: This aligns visual structure and border language between onboarding steps while preserving existing photo edit controls and content.
- Impact: `About the Owner` now displays left/right content inside matching section cards, and input outline colors remain consistent with `About the business` fields.
- Revisit trigger: If onboarding adopts a shared step-layout component, move these duplicated card-shell classes into that shared component.

## [2026-03-18] Place onboarding photo recommendation copy above Profile photo section title
- Context: In onboarding `About the Owner`, recommendation copy (`Customize your hub with some photos!`) rendered below the cover-photo section, but product requested it appear before the `Profile photo` section.
- Decision: Move the recommendation copy block to the top of the right-side card, directly above the `Profile photo` section heading.
- Why: This sets expectation/context before vendors interact with profile/cover photo actions.
- Impact: Recommendation text now appears above `Profile photo` in the right-side About the Owner card.
- Revisit trigger: If onboarding content strategy changes, consider making this recommendation a reusable section intro component.

## [2026-03-18] Match About the Owner Add/Change photo controls to landing Search button color
- Context: Product requested the onboarding `About the Owner` buttons (`Add`, `Change photo`, `Change cover`) use the same color treatment as the landing hero `Search` button.
- Decision: Reuse existing `editorial-search-btn` styling on those onboarding controls by adding a scoped `addButtonClassName` hook to `HobbyPillInput` and applying `editorial-search-btn` to the profile/cover outline action buttons in `Step3_AboutOwner`.
- Why: This reuses a proven style token/class instead of introducing another duplicate color definition.
- Impact: Onboarding `Add`, `Change photo`, and `Change cover` now render with the same background/border/text colors as landing `Search`.
- Revisit trigger: If this style should become a reusable button variant, promote `editorial-search-btn` to an explicit `Button` variant in the shared UI primitive.

## [2026-03-18] Set About the Owner Add/Change button text color to white
- Context: After matching onboarding `Add`, `Change photo`, and `Change cover` controls to the landing `Search` button color treatment, product requested white text/icons inside those buttons.
- Decision: Add a scoped helper class `editorial-search-btn-white-text` in `index.css` and apply it (with `editorial-search-btn`) to the three targeted About the Owner buttons.
- Why: This preserves the requested search-style background/border while forcing text/icon contrast to white only for those controls.
- Impact: `Add`, `Change photo`, and `Change cover` on onboarding `About the Owner` now render `#ffffff` text/icon color.
- Revisit trigger: If search-style buttons with white text are needed in more places, fold this into a dedicated reusable button variant instead of per-surface class composition.

## [2026-03-18] Replace per-field "(optional)" copy on About the Owner with one page subheading
- Context: About the Owner showed field-level optional copy while product wanted one consolidated optionality message near the section header.
- Decision: Remove `(optional)` from the `Tell your customers about yourself!` label and add a subheading beneath `About the Owner`: `Optional but highly recommended!`.
- Why: This keeps optional guidance clear without repeating parenthetical optional tags in field labels.
- Impact: About the Owner now presents optionality once at the top, and the primary bio label no longer includes `(optional)`.
- Revisit trigger: If onboarding validation rules change to required fields, replace this subheading with explicit per-field required/optional indicators tied to validation state.

## [2026-03-18] Set About the Owner optionality subheading to 14px
- Context: The newly added About the Owner optionality subheading needed a precise typography size update.
- Decision: Change the `Optional but highly recommended!` subheading text size to `14px`.
- Why: This aligns with requested visual scale for supportive page-level guidance text.
- Impact: About the Owner optionality subheading now renders at 14px.
- Revisit trigger: If onboarding heading/subheading typography is tokenized centrally, replace ad-hoc pixel sizing with the shared token scale.

## [2026-03-18] Vertically center hobby Add button within input row
- Context: The hobby input row showed the `Add` button slightly off-center relative to the text input.
- Decision: Set the shared hobby input row container to `items-center` in `HobbyPillInput`.
- Why: Centering at the row container level is the smallest safe fix and automatically applies to all current hobby-input surfaces.
- Impact: The `Add` button is now vertically centered on the hobby input bar.
- Revisit trigger: If button/input heights diverge further across breakpoints, add explicit height alignment tokens for hobby-row controls.

## [2026-03-18] Match About the Owner photo section headings to bio label typography
- Context: Onboarding About the Owner had mixed heading typography in the right photo card (`Customize your hub with some photos!`, `Profile photo`, `Cover photo`) that did not match the left-side `Tell your customers about yourself!` label style.
- Decision: In `Step3_AboutOwner`, render those three right-card headings with the shared `Label` primitive default typography instead of custom `font-semibold`/`text-base` overrides.
- Why: Reusing the same label primitive guarantees exact family/size/weight consistency and keeps the change scoped to the About the Owner onboarding screen.
- Impact: The three targeted headings now visually match `Tell your customers about yourself!` exactly on About the Owner, with no changes to My Hub or other pages.
- Revisit trigger: If onboarding introduces a formal heading token for section-intro copy, migrate all page-local heading text to that tokenized style.

## [2026-03-18] Increase Confirm card typography by 8px across section headings and row text
- Context: Product requested larger text inside both Confirm section cards.
- Decision: In `Step4_Confirm`, increase typography by `8px` for card content: section headings `18px -> 26px`, row value text `12.5px -> 20.5px`, and row label text `13px -> 21px` in both `Business Details` and `About the Owner` cards.
- Why: This applies the requested magnitude consistently to all text shown inside the two cards.
- Impact: Confirm card content now renders significantly larger while preserving existing layout structure and bottom action bar placement.
- Revisit trigger: If readability or wrapping degrades on smaller desktop widths, tune card spacing/line-length or use responsive type scaling for Confirm only.

## [2026-03-18] Double bottom button-to-screen spacing on onboarding footer bars
- Context: Product requested more breathing room between fixed footer action buttons and the bottom edge of the screen on the three onboarding pages with fixed action bars.
- Decision: Update footer inner container padding from `py-4` to `pt-4 pb-8` in `Step2_BusinessDetails`, `Step3_AboutOwner`, and `Step4_Confirm`.
- Why: This doubles only the bottom spacing under the buttons while keeping top spacing and overall footer layout behavior consistent.
- Impact: Back/next or completion buttons now sit higher from the screen bottom on all three targeted onboarding pages.
- Revisit trigger: If footer height creates content overlap at smaller viewport heights, increase page bottom padding or make footer padding responsive.

## [2026-03-18] Use pill-style specialties input with hobby constraints in Business Details
- Context: Business Details `Specialties` was a plain text input while product requested matching pill behavior/style to the hobbies section.
- Decision: Replace the `Specialties` text input in `Step2_BusinessDetails` with the shared `HobbyPillInput`, including the same coral pill/white text styling and search-style Add button classes used for hobbies.
- Why: Reusing the existing pill component applies the same normalization and max-item constraints without introducing a second specialty-specific input system.
- Impact: Specialties now uses add/remove pills with the same interaction constraints and visual style as hobbies.
- Revisit trigger: If specialties and hobbies need different limits or token rules, split `HobbyPillInput` into a generic tag-input with configurable validators/limits.

## [2026-03-18] Cap In Business Since year input at current year
- Context: Business Details allowed future years in the `In Business Since (Year)` field.
- Decision: Add `normalizeInBusinessSinceYearInput` in `Step2_BusinessDetails` to keep numeric-only input at four digits and clamp full years to the runtime current year.
- Why: Preventing future years improves data validity without changing field layout or introducing extra validation UI.
- Impact: Users can no longer enter a year later than the current year in onboarding Business Details.
- Revisit trigger: If this field moves to a shared form schema, migrate this rule into shared validation so create/edit flows stay consistent.

## [2026-03-18] Tune Confirm card typography: body down 4px, section titles up 2px
- Context: After increasing Confirm card typography, product requested finer balance: smaller row text and slightly larger section titles.
- Decision: In `Step4_Confirm`, reduce row value text `20.5px -> 16.5px` and row label text `21px -> 17px`, while increasing section titles `26px -> 28px`.
- Why: This restores readability density for field rows while reinforcing section hierarchy.
- Impact: Confirm cards now show larger section headings with less dominant row text.
- Revisit trigger: If line wrapping or card height becomes an issue on narrower desktops, apply responsive type scaling for Confirm rows.

## [2026-03-18] Align Confirm field coverage and ordering strictly to Step 2 + Step 3 inputs
- Context: Confirm needed to show only fields from the previous two onboarding steps and preserve the same input ordering/label wording from those steps.
- Decision: Refactor `Step4_Confirm` field mapping to ordered single-field lists per card: `Business Details` now mirrors Step 2 labels/order, `About the Owner` mirrors Step 3 labels/order, and Step 1-only content (`Vendor type`) was removed.
- Why: This keeps confirmation review aligned with the exact data entry flow users just completed.
- Impact: Confirm now displays only Step 2 and Step 3 inputs in source-page order with matching label text.
- Revisit trigger: If step forms are reordered or labels are renamed, update confirm mappings in the same change to maintain one-to-one alignment.

## [2026-03-18] Increase Confirm section card titles by 4px
- Context: Product requested larger section headings in the Confirm cards.
- Decision: Update Confirm section card title size from `28px` to `32px` for both `Business Details` and `About the Owner`.
- Why: This increases section hierarchy emphasis while keeping body text unchanged.
- Impact: Confirm card headings now render 4px larger.
- Revisit trigger: If heading size causes crowding at smaller widths, use responsive heading sizes for Confirm cards.

## [2026-03-18] Increase Confirm section card titles by an additional 6px
- Context: After the prior heading increase, product requested another title-size bump.
- Decision: Update Confirm section card title size from `32px` to `38px` for both `Business Details` and `About the Owner`.
- Why: This further emphasizes section headings while preserving all existing body typography and layout behavior.
- Impact: Confirm card headings now render 6px larger than the immediate previous state.
- Revisit trigger: If heading wrapping/crowding appears at narrower widths, apply responsive heading sizing on Confirm.

## [2026-03-18] Force Confirm section title size override to ensure visible 6px increase
- Context: Confirm title size changes were not visually taking effect due competing heading styles.
- Decision: Set `Business Details` and `About the Owner` title classes in `Step4_Confirm` to `!text-[44px]`, explicitly overriding lower-priority/global heading size rules.
- Why: This guarantees the exact two requested titles render larger by another 6px.
- Impact: Confirm section titles now visibly increase in size as requested.
- Revisit trigger: If global heading styles are refactored, remove `!` overrides and rely on shared tokenized heading variants.

## [2026-03-18] Set Confirm section titles to visible +3px from 32px baseline
- Context: Product requested `Business Details` and `About the Owner` be increased by 3px.
- Decision: Update both titles in `Step4_Confirm` to `!text-[35px]` so they are exactly +3px from the 32px baseline and reliably override global heading rules.
- Why: This applies the requested increment while ensuring the change is visible.
- Impact: Confirm section titles now render at 35px.
- Revisit trigger: If heading typography is centralized, replace `!` class overrides with a shared variant token.

## [2026-03-18] Reduce Confirm section title size by 1.5px
- Context: Product requested a fine-tuned decrease to the `Business Details` and `About the Owner` title sizes.
- Decision: Update both Confirm section title classes from `!text-[35px]` to `!text-[33.5px]`.
- Why: This applies the requested `-1.5px` adjustment while keeping the explicit override for reliable rendering.
- Impact: Confirm section titles now render at 33.5px.
- Revisit trigger: If sub-pixel typography causes inconsistent rendering across browsers, round to the nearest whole-pixel token and validate visually.

## [2026-03-18] Reduce Confirm section title size by an additional 1px
- Context: Product requested one more incremental reduction to `Business Details` and `About the Owner` title size.
- Decision: Update both Confirm title classes from `!text-[33.5px]` to `!text-[32.5px]`.
- Why: This applies the requested `-1px` adjustment while keeping the explicit override intact.
- Impact: Confirm section titles now render at 32.5px.
- Revisit trigger: If finer-grain sizing is no longer needed, consolidate to whole-pixel typography tokens for headings.

## [2026-03-18] Set Confirm section titles to 25px
- Context: Product requested `Business Details` and `About the Owner` title text be reduced from 32.5px to 25px.
- Decision: Update both Confirm title classes in `Step4_Confirm` to `!text-[25px]`.
- Why: This directly matches the requested target size while preserving existing body typography and layout.
- Impact: Confirm section titles now render at 25px.
- Revisit trigger: If heading scale is standardized across onboarding steps, migrate these explicit pixel overrides to shared typography tokens.

## [2026-03-18] Set black text usage to `#16222D` globally
- Context: Product requested black fonts across the website use `#16222D`.
- Decision: Update light-mode foreground-related theme tokens in `client/src/index.css` (`--foreground`, `--card-foreground`, `--sidebar-foreground`, `--popover-foreground`, `--secondary-accent-foreground`) to `hsl(209 34% 13%)` (`#16222D`) and add a `.text-black` override to enforce the same color for explicit Tailwind black text utilities.
- Why: Centralizing the color at theme-token level applies consistently across most UI text surfaces while also catching direct `text-black` usages.
- Impact: Site-wide dark/black text now resolves to `#16222D` in light mode.
- Revisit trigger: If typography tokens are refactored, move this color mapping into a single semantic text token and remove utility-class overrides.

## [2026-03-18] Set Confirm row labels and values to 14.5px
- Context: Product requested both label and value text in Confirm section rows be adjusted from 14px to 14.5px while keeping labels bold.
- Decision: Update row value text classes and label text classes in `Step4_Confirm` from `text-[14px]` to `text-[14.5px]`; keep label weight `font-semibold`.
- Why: This applies the exact requested size change without affecting section titles or other onboarding screens.
- Impact: Confirm card row labels and values now render at 14.5px.
- Revisit trigger: If sub-pixel typography introduces browser rendering variance, round to a whole-pixel type scale.

## [2026-03-18] Rename Confirm completion action to My Hub and route there
- Context: On vendor onboarding Confirm, product requested replacing `Continue to dashboard` with `Go To My Hub`, and this action should send vendors to My Hub.
- Decision: Update `Step4_Confirm` button text to `Go To My Hub` and call `onComplete(false, "myHub")`; extend `VendorOnboarding` completion handler to support an optional destination parameter and route non-listing completion to `/vendor/shop` when destination is `myHub`.
- Why: This keeps the requested behavior scoped to the Confirm button while preserving other completion paths for upcoming onboarding/listing-intro work.
- Impact: Clicking the renamed Confirm button now completes onboarding and lands on My Hub (`/vendor/shop`) instead of vendor dashboard.
- Revisit trigger: When the one-time My Hub introduction is implemented, route this action (and listing-save completion) through the shared intro gate before final destination.

## [2026-03-18] Style onboarding completion success toast as white with no outline
- Context: Clicking `Go To My Hub` or `Create first listing` shows the onboarding success toast (`Vendor profile created`), and product requested white background, `#16222D` text, and no outline.
- Decision: In `VendorOnboarding`, set the success `toast(...)` call `className` to `bg-[#ffffff] text-[#16222D] border-0 outline-none ring-0 shadow-none`.
- Why: This scopes the visual override to the specific popup tied to onboarding completion without changing all toasts site-wide.
- Impact: Onboarding completion toast now renders white text surface, dark slate text color, and no border/outline.
- Revisit trigger: If multiple toast styles are needed by surface, introduce semantic toast variants instead of per-call class strings.

## [2026-03-18] Align Create Listing wizard shell and styling with Vendor Onboarding layout system
- Context: Product requested listing creation feel visually consistent with vendor onboarding (sidebar treatment, typography scale, spacing rhythm, fixed footer button placement, and section/input styling) without changing step content or field coverage.
- Decision: Refactor `CreateListingWizard` to use an onboarding-style page shell (`swap-dashboard-whites` + `Navigation`, narrow icon-based left sidebar with hover labels, onboarding surface container spacing, fixed bottom action rail) and update step heading/section heading sizes to onboarding equivalents; add scoped `.listing-onboarding-parity .shadcn-card` style in `index.css` for onboarding-like card border/radius/background/shadow.
- Why: A shell-level parity update gives the requested consistency quickly while preserving existing listing step logic and inputs.
- Impact: Listing creation now matches vendor onboarding visual language more closely across layout, hierarchy, and control positioning, with all existing listing inputs retained.
- Revisit trigger: If onboarding/listing share more shells in future, extract a single reusable wizard layout component instead of parallel page-level class structures.

## [2026-03-18] Remove save/close icon buttons from create-listing left sidebar
- Context: Product requested removing the two icon buttons (save and close) from the create-listing wizard left sidebar.
- Decision: Delete the save/close icon button block from `CreateListingWizard` sidebar and keep step navigation icons unchanged.
- Why: This matches the requested cleaner onboarding-parity sidebar presentation.
- Impact: The left sidebar now shows only step navigation icons; save/close controls are no longer present there.
- Revisit trigger: If explicit close/save controls are needed again, reintroduce them in a dedicated top-level action area rather than inside the step rail.

## [2026-03-19] Execute 0020 FK cleanup through canonical migration runner
- Context: `0020_booking_listing_fk_cleanup.ts` existed but `scripts/run-migration.ts` still ended at `0019`, leaving live DB FK cleanup outside the standard migration execution path.
- Decision: Add `../migrations/0020_booking_listing_fk_cleanup.ts` to `migrationModules` and apply migrations via `npx tsx scripts/run-migration.ts up`; then verify FK behavior and lifecycle integrity with read-only SQL checks.
- Why: Running through the existing runner preserves the project migration process and avoids ad-hoc manual SQL for lifecycle-critical FK behavior.
- Impact: Live DB now has a single canonical `bookings.listing_id` FK with `ON DELETE SET NULL`, and `booking_items.listing_id` is also `ON DELETE SET NULL`; row counts and preserved orphan bookings remained unchanged.
- Revisit trigger: If migrations move to an ordered tracked table or drizzle-kit pipeline, retire manual module lists in `run-migration.ts` to avoid future version drift.

## [2026-03-20] Sync Vendor Hub avatar size with title offset to prevent overlap
- Context: On `/shop/:vendorId` (accessed from My Hub customer-mode flow), the profile avatar overlapped the vendor business name in the hero section.
- Decision: Introduce `vendor-hub-hero` CSS variable `--vendor-hub-avatar-size` and use it for both `.vendor-hub-avatar` dimensions and `.vendor-hub-hero-content` top padding; update `vendorhub.tsx` to use these classes.
- Why: Tying spacing to one size token prevents future regressions when avatar size changes and fixes overlap without redesigning the header.
- Impact: Vendor name now renders below the avatar footprint across breakpoints; public shop header visual style remains unchanged.
- Revisit trigger: If avatar size becomes user-configurable, compute these values from runtime styles or container queries instead of fixed breakpoint tokens.

## [2026-03-20] Cap Vendor Hub/My Hub listing card widths to prevent stretched single-card layouts
- Context: Vendor Hub (`/shop/:vendorId`) and My Hub (`/vendor/shop`) listing sections could render a single listing card at full container width, which looked oversized and inconsistent with browse/home card sizing.
- Decision: Apply `MasonryListingGrid` width controls on both pages: `minCardWidthPx=240`, `cardMaxWidthPx=290`, and `singleColumnCardMaxWidthPx=340`.
- Why: Reusing the existing listing grid sizing contract keeps card proportions consistent without introducing page-specific CSS hacks.
- Impact: Listing cards in Vendor Hub/My Hub now cap at 290px in multi-column layouts and 340px in single-column layouts.
- Revisit trigger: If vendor shop pages need a distinct card scale, introduce a shared “shop card size” preset in `MasonryListingGrid` props.

## [2026-03-20] Reduce Vendor Hub profile avatar by 10% while preserving anchor and name spacing contract
- Context: Product requested the vendor hub profile circle appear 10% smaller while keeping its placement and the visual spacing relationship to the business name.
- Decision: Update `--vendor-hub-avatar-size` tokens in `index.css` from `200px -> 180px` and `240px -> 216px`, while keeping the existing `vendor-hub-hero-content` padding formula based on `var(--vendor-hub-avatar-size)`.
- Why: The shared sizing formula keeps the avatar anchored at the same hero seam behavior and preserves the same gap contract between avatar bottom and heading.
- Impact: Vendor hub profile photo is 10% smaller on all breakpoints without overlap regressions.
- Revisit trigger: If avatar scale needs per-page customization, split hero/avatar size tokens by surface (`vendorhub` vs editor previews).

## [2026-03-20] Hide empty Vendor Hub cover/profile regions and collapse spacing
- Context: Vendor Hub showed a placeholder hero/initials avatar structure even when no cover/profile photo existed, leaving unnecessary empty space above the business content.
- Decision: In `vendorhub.tsx`, render the cover hero block only when a real cover image exists; render the avatar only when a real profile image exists; switch header top spacing between `vendor-hub-hero-content` (cover+avatar) and compact `pt-8 sm:pt-10` spacing otherwise; move “Exit Customer Mode” button into the content header when cover is absent.
- Why: This preserves margins/padding rhythm while removing visually empty media regions so content shifts upward naturally.
- Impact: No-cover/no-profile shops now start content higher with no blank hero/avatar placeholders, while shops with media keep the original styled layout.
- Revisit trigger: If product later wants placeholder media surfaces back, add an explicit “show placeholder media” feature flag instead of implicit fallbacks.

## [2026-03-20] Hide empty photo preview frames in My Hub editor while keeping upload controls
- Context: My Hub settings always rendered empty cover/profile preview placeholders, which consumed space before a vendor uploaded media.
- Decision: In `myhub.tsx`, conditionally render the cover preview frame only when `coverPhotoSource` exists and the profile circle preview only when `shopPhotoSource` exists; keep upload/edit/remove controls visible and collapse top spacing when previews are absent.
- Why: Vendors can still upload media immediately, but empty visual blocks no longer create unnecessary vertical space.
- Impact: My Hub form sections compact when photos are missing and expand naturally once photos are added.
- Revisit trigger: If product wants explicit placeholder guidance back, add helper text blocks without restoring fixed-height empty frames.

## [2026-03-20] Standardize listing card max width to 290px in all Masonry surfaces
- Context: Listing card grids used a dual-width rule (`290px` multi-column and `340px` single-column), which created inconsistent card scale across Home, Browse, Vendor Hub, and My Hub.
- Decision: Remove `singleColumnCardMaxWidthPx` from `MasonryListingGrid` and all callsites; keep `cardMaxWidthPx=290` as the only max-width rule.
- Why: A single max width simplifies behavior and keeps card sizing consistent regardless of column count.
- Impact: Listing cards now cap at `290px` in both single-column and multi-column Masonry layouts on all pages using this grid.
- Revisit trigger: If a specific page needs intentionally larger cards, add an explicit page-level size preset instead of a layout-dependent single-column override.

## [2026-03-20] Apply simplified Vendor Hub typography hierarchy and unified listing-card scale targets
- Context: Product requested a tighter text hierarchy on Vendor Hub (64/30/20/18 pattern) plus consistent listing-card title/price visual targets across Home, Browse, Vendor Hub, and My Hub.
- Decision: Update `vendorhub.tsx` to set rating line text to 18px, body paragraphs to 20px, quick-info labels to 18px and values to 20px semibold, view-all link to 18px, average rating to 64px, review count/rating rows to 18px; update `ListingCard.tsx` `oneAndHalf` title size to `43px` CSS (`2.6875rem`) and `double` price size to `49px` CSS (`3.0625rem`), and remove Home/Browse custom override classes so defaults apply across surfaces.
- Why: Centralizing card typography in `ListingCard` prevents per-page drift and matches the requested visual hierarchy under the existing card zoom behavior.
- Impact: Vendor Hub copy hierarchy now reflects the requested size bands, and listing-card title/price proportions are consistent across Home/Browse/Vendor Hub/My Hub.
- Revisit trigger: If the global card zoom factor changes from `0.70`, recompute CSS text sizes to maintain visual targets.

## [2026-03-20] Lock product to light mode only for launch
- Context: Product requested disabling dark mode across the app and shipping light mode only.
- Decision: Force light theme at boot in `main.tsx` (always remove `dark` class, persist `eventhub-theme=light`, set `color-scheme: light`) and remove theme toggle UI/state from `Navigation.tsx`.
- Why: This removes user-facing dark-mode behavior with minimal risk and avoids broad style refactors late in launch prep.
- Impact: Users can no longer toggle dark mode, and persisted dark preferences are overridden to light on load.
- Revisit trigger: If dark mode is reintroduced, add a controlled theme system behind a feature flag and restore nav/theme controls intentionally.

## [2026-03-20] Suppress non-actionable destructive toasts globally
- Context: Many destructive toasts surfaced technical/system/background errors that users cannot fix (for example stack-ish/network/internal messages), causing noisy UX.
- Decision: Add centralized gating in `use-toast.ts` so destructive toasts only render when content is actionable (validation/input/auth/permission/payment/booking flow actions, or explicit toast action buttons). Suppress generic and developer-oriented failures by default.
- Why: Enforcing this at the toast pipeline prevents drift across many pages and avoids one-off per-screen filtering.
- Impact: Users now see fewer error toasts, focused on items requiring user input or behavior changes; technical/background failures are suppressed.
- Revisit trigger: If a suppressed error needs user visibility, convert that toast copy to explicit actionable guidance or attach a toast action button.

## [2026-03-20] Prevent Auth0 secure-origin crash on LAN preview URLs
- Context: Opening the app over LAN HTTP URLs (for phone testing) triggered `auth0-spa-js must run on a secure origin`, causing Vite runtime overlay crashes on both Mac and phone.
- Decision: In `main.tsx`, gate real `Auth0Provider` behind secure-origin detection (`window.isSecureContext` or localhost). For insecure preview origins, mount `Auth0Context.Provider` with a safe non-authenticated fallback context that avoids startup crashes and returns actionable auth errors only when login is attempted.
- Why: This keeps LAN preview usable for UI testing without introducing HTTPS/tunnel setup as a hard requirement.
- Impact: App now loads on LAN HTTP URLs without crashing; authentication actions are intentionally unavailable there and return a user-actionable message.
- Revisit trigger: If phone preview needs live auth, switch preview to HTTPS/tunnel and remove or feature-flag this insecure-origin fallback.

## [2026-03-20] Set hero search-bar typography to explicit product sizes
- Context: Product requested exact CSS text sizes for hero search fields and button labels.
- Decision: Update `Hero.tsx` and `index.css` so labels are `15px` base / `22px` lg, field values/placeholders are `12px` base / `25px` lg, and search button text is `22px` base / `28px` lg.
- Why: Explicit fixed sizes remove ambiguity from prior rem-based values and align with current visual tuning requests.
- Impact: Hero search text now follows the requested numeric scale at both base and lg breakpoints.
- Revisit trigger: If the hero `zoom` scale changes, revalidate perceived sizes and adjust CSS values to preserve visual intent.

## [2026-03-20] Retune hero search typography to 18/20 labels and 15/20 values
- Context: Product requested updated hero search sizing after prior explicit sizing pass.
- Decision: In `Hero.tsx` and `index.css`, set field labels to `18px` base / `20px` lg, field values/placeholders to `15px` base / `20px` lg, and search button text to `22px` base / `26px` lg.
- Why: This tightens hierarchy and keeps label/value/button scale aligned to the latest design direction.
- Impact: Hero search bar now renders the revised typography scale across all four fields and the search CTA.
- Revisit trigger: If search bar zoom/layout changes again, rebalance typography with the same explicit px strategy.

## [2026-03-20] Adjust hero value text to 21.43px at lg for visual 15px under zoom
- Context: Hero search values needed to render visually at 15px while retaining `landing-hero-search-scale-down` zoom of `0.7`.
- Decision: Set lg value text size to `21.43px` (Location input CSS + Event Type/Date/Category trigger classes), keeping base value size unchanged.
- Why: `21.43px * 0.7 ≈ 15px`, matching requested perceived size without changing the container zoom system.
- Impact: On fullscreen/`lg`, hero values now appear ~15px visually.
- Revisit trigger: If zoom factor changes from `0.7`, recompute this size with `targetVisualSize / zoom`.

## [2026-03-20] Tune hero fullscreen search text to visual 13px labels and 17px values
- Context: Product requested labels render ~1px smaller at fullscreen and value text increase to ~17px visual while keeping zoom at `0.7`.
- Decision: Set lg label size to `18.57px` and lg value size to `24.29px` in `Hero.tsx` + `index.css` overrides.
- Why: `18.57 * 0.7 ≈ 13px` and `24.29 * 0.7 ≈ 17px`, meeting the requested rendered targets without changing layout zoom.
- Impact: On fullscreen/`lg`, labels now appear ~13px and values ~17px.
- Revisit trigger: If hero zoom factor changes, recompute these lg px values using `targetVisual / zoom`.

## [2026-03-20] Standardize shell/header/sidebar backgrounds to pure white
- Context: Product requested page backgrounds, top headers, and left sidebars render as `#ffffff`, while avoiding a broad restyle of section-card and input-specific fills.
- Decision: Set the base `--background` token to white, set `vendor-dashboard-parity` base surface to white, add explicit white header backgrounds in dashboard shells, and replace remaining explicit tinted page-shell backgrounds (login, not-found, planner, vendor hub cover fallback, hero search container) with `#ffffff`.
- Why: This gives consistent white app shells across vendor/customer/public surfaces with a small, launch-safe patch.
- Impact: Primary page backgrounds, sticky/top headers, and sidebar surfaces now render white across the app; section cards and input styling logic remain otherwise unchanged.
- Revisit trigger: If brand surfaces (for example hero search panel or vendor hub hero fallback) need non-white accents again, reintroduce them as explicit component-level variants rather than shared shell defaults.

## [2026-03-20] Increase hero field-value typography by 1.5px for location/event/date/category
- Context: Product reported the hero search field values (`Any city`, selected event type, date, category) were too small and requested a `+1.5px` size increase.
- Decision: In `Hero.tsx` and `index.css`, increase value text sizes from `15px -> 16.5px` (base) and from `24.29px -> 25.79px` (`lg`) for Location, Event Type, Date, and Category field values, with labels unchanged.
- Why: A targeted value-only typography bump improves readability while preserving the existing label hierarchy and search-bar layout.
- Impact: Hero value text now renders larger across all four fields without changing field labels, spacing structure, or search behavior.
- Revisit trigger: If product requests visual-size tuning under the `0.7` hero zoom system, convert requested rendered sizes to zoom-adjusted CSS values before applying.

## [2026-03-20] Default Vendor Bookings to List View and use filled active status tabs
- Context: Product requested the Bookings & Jobs page open in `List view` by default and wanted stronger selected-state visibility for the status tabs (`All`, `Upcoming`, `Pending`, `Completed`, `Cancelled`).
- Decision: In `VendorBookings.tsx`, set `viewMode` initial state to `list` and add a shared active-state class override on each status `TabsTrigger` to use the filled primary style (matching the active view-toggle button style).
- Why: This improves immediate scanability for booking rows and makes the selected status filter visually explicit.
- Impact: Vendor Bookings now loads in list mode and the active status tab displays as a filled primary button-style state.
- Revisit trigger: If status filters move to a different control pattern (chips/dropdown), preserve an equally strong selected-state contrast.

## [2026-03-20] Move Vendor Dashboard deactivation control below Profile Info at page bottom
- Context: Product requested the `Danger Zone` deactivation control appear at the bottom of Vendor Dashboard, below profile info fields, instead of above profile info.
- Decision: In `VendorDashboard.tsx`, move the existing `Danger Zone` block and `Deactivate Account` button from its prior position above the `Profile Info` heading to the end of the `Profile Details` section, after profile edit actions.
- Why: This keeps profile editing as the primary workflow while preserving access to deactivation as a lower-priority destructive action.
- Impact: Vendors now see `Danger Zone` at the bottom of the dashboard profile section, directly below Profile Info content.
- Revisit trigger: If account-settings IA gets its own dedicated page, relocate `Danger Zone` there with the same confirmation flow.

## [2026-03-20] Replace account-deactivation product flow with profile lifecycle controls and final account deletion
- Context: Product required lifecycle refactor: no account deactivation as a product concept, reversible profile deactivate/reactivate, and final account deletion that preserves historical booking/payment integrity.
- Decision: Add canonical `vendor_profiles.active` + `vendor_profiles.deactivated_at` lifecycle fields and `vendor_accounts.deleted_at`; add profile lifecycle APIs (`POST /api/vendor/profiles/:id/deactivate`, `POST /api/vendor/profiles/:id/reactivate`); add final account deletion API (`POST /api/vendor/me/delete`) that inactivates listings/profiles, clears auth/integration linkage, anonymizes account identity fields, and preserves historical booking records; deprecate `POST /api/vendor/me/deactivate` with `410`; update Vendor Dashboard danger zone UI to profile deactivate/reactivate plus separate delete-account flow; enforce public listing visibility as `account active + profile active + listing active` in public listing/shop/recommendation and booking-entry queries.
- Why: Separating reversible profile offboarding from irreversible account exit matches multi-profile account architecture and keeps historical data integrity intact for launch-critical booking/payment/audit records.
- Impact: Vendors can now pause/resume individual profiles without losing setup data; full account exit is explicit and final; deleted accounts cannot continue vendor access; inactive profiles are removed from public/booking eligibility while preserved for reactivation.
- Revisit trigger: If legal/compliance policy requires stronger PII anonymization on account deletion, extend deletion job to scrub profile-level personally identifiable fields while keeping financial/audit references intact.

## [2026-03-20] Align Create Listing Wizard header to Vendor Dashboard top/height rhythm
- Context: Product reported the listing-creation wizard header appeared too low and requested exact top/height alignment parity with Vendor Dashboard while keeping existing wizard nav actions.
- Decision: Add an opt-in `vendorDashboardAligned` mode to `Navigation` that uses Vendor Dashboard-like header spacing/wordmark sizing, and enable it only in `CreateListingWizard`.
- Why: A scoped navigation variant fixes wizard header vertical alignment without changing header behavior on other surfaces.
- Impact: Create Listing Wizard (including subsequent step pages) now renders header at the top with Vendor Dashboard-matched vertical rhythm while preserving current wizard nav buttons/menus.
- Revisit trigger: If additional vendor wizard surfaces need the same parity, standardize on this alignment mode across those pages.

## [2026-03-21] Match listing-wizard shell structure to Vendor Dashboard header baseline
- Context: Header parity remained inconsistent because listing wizard used `min-h-screen` flow and sticky-nav behavior that did not mirror Vendor Dashboard shell structure exactly.
- Decision: Update `CreateListingWizard` outer layout to `h-screen` + `min-h-0` shell semantics and update `Navigation` `vendorDashboardAligned` mode to use dashboard-equivalent `p-4` header rhythm with non-sticky positioning.
- Why: Matching container semantics and header structure removes vertical drift introduced by differing page flow/sticky behavior.
- Impact: Wizard header now anchors at the top with the same spacing structure as Vendor Dashboard across the screenshot page and subsequent wizard steps.
- Revisit trigger: If future wizard routes need sticky headers for long-page navigation, add a separate explicit sticky mode rather than overloading dashboard alignment mode.

## [2026-03-21] Move vendor lifecycle danger actions into Account Settings modal
- Context: Product requested that profile/account destructive lifecycle actions be accessed from avatar dropdown `Account settings` instead of appearing inline under Vendor Dashboard profile details.
- Decision: Add an `onOpenAccountSettings` hook to `VendorShell` and use it on `VendorDashboard` to open a new `Account Settings` modal containing `Deactivate/Reactivate Profile` and `Delete Account` sections. Remove the inline dashboard danger-zone block and keep existing confirmation dialogs/mutations for lifecycle execution.
- Why: This keeps destructive actions discoverable from account controls while reducing clutter in the profile editing surface.
- Impact: On Vendor Dashboard, selecting `Account settings` now opens a modal with lifecycle actions; profile details page no longer shows inline deactivate/delete cards.
- Revisit trigger: If product needs these actions available from all vendor pages (not only dashboard-opened modal), centralize lifecycle dialog state and API wiring fully inside `VendorShell`.

## [2026-03-21] Apply vendor profile lifecycle schema migration to resolve public-listings outage
- Context: Live DB was missing `vendor_profiles.active`, but current schema/runtime expected it and `/api/listings/public` filtered by `vendor_profiles.active = true`, causing listing load failures on Home.
- Decision: Apply migration `0021_vendor_profile_lifecycle_and_account_deletion` directly (targeted run, not full chain) to add `vendor_profiles.active`, `vendor_profiles.deactivated_at`, `vendor_accounts.deleted_at`, and `idx_vendor_profiles_account_active`.
- Why: This restores schema/runtime parity and unblocks launch-critical listing visibility while keeping migration scope bounded to the canonical lifecycle migration.
- Impact: Public listings endpoint now returns successfully, profile lifecycle fields exist in DB, and active listings are again eligible for landing-page rendering.
- Revisit trigger: If deployment flow can skip migrations, add startup schema checks/fail-fast or migration gating in release process to prevent future schema drift.

## [2026-03-21] Canonicalize checkout to booking-create then Stripe intent confirmation with persisted retry context
- Context: Checkout previously showed `Pay` but only created a booking and payment method placeholder without guaranteed payment confirmation, leaving duplicate/orphan risks during refresh/retry.
- Decision: Make checkout use one primary flow: create booking with idempotency key (`/api/bookings`) -> initialize deposit intent (`/api/bookings/:bookingId/payments/:scheduleId`) -> confirm card payment (`stripe.confirmCardPayment`); persist pending booking/schedule + idempotency key in local storage to safely resume interrupted attempts.
- Why: This is the smallest launch-safe change that makes payment execution explicit and retryable without broad architecture rewrites.
- Impact: Payment outcome now reflects real Stripe confirmation, duplicate submit risk is reduced via idempotent booking creation and deterministic payment-intent idempotency, and refresh interruptions can resume.
- Revisit trigger: If final-payment collection moves into the same checkout session, introduce a dedicated checkout session table to track multi-intent progress server-side.

## [2026-03-21] Enforce manual payout-hold policy and expand payment/webhook state coverage
- Context: Existing Stripe intent creation used destination charges, implicitly transferring vendor funds immediately despite lacking explicit payout eligibility enforcement.
- Decision: Switch payment-intent creation to platform-held funds (no destination transfer on charge), add webhook handling for `payment_intent.payment_failed`, `charge.dispute.created`, and `charge.refunded`, and introduce explicit `failed/disputed/expired` lifecycle statuses via migration `0022_payment_and_booking_state_hardening`.
- Why: Launch safety requires conservative fund custody and explicit failure/dispute observability before automating payout release.
- Impact: Payments now retain held-funds semantics until manual release, webhook retries remain idempotent, booking/payment records surface failure/dispute/refund outcomes, and stale pending bookings auto-expire.
- Revisit trigger: When automated payouts are introduced, add explicit payout ledger tables and release jobs keyed by completed-event eligibility checks.

---

## [2026-03-21] Standardize Stripe Connect Express flow on separate charges and delayed manual transfers
- Context: Marketplace launch needed an explicit EventHub-held-funds model with payout release after event end + buffer, plus robust reconciliation for refunds/disputes before vendor payout.
- Decision: Expand canonical payment/payout schema (`0023_connect_express_separate_charges_transfers`) and booking/payment runtime to store immutable amount snapshots, charge linkage, payout eligibility fields, and payout blocking reasons; keep Connect Express payout schedule manual; confirm payments on platform PaymentIntents; and add admin payout execution endpoint (`POST /api/admin/payouts/process`) that transfers eligible vendor net amounts using `source_transaction` and idempotency keys.
- Why: Separate charges + transfers is the Stripe model that allows delayed, policy-driven vendor payout while retaining platform fee and preventing premature disbursement.
- Impact: Booking payment success now sets explicit payout readiness state; webhook paths reconcile failed/refunded/disputed outcomes into payout blocks/cancellations; and vendor payout is only created by an explicit post-eligibility workflow.
- Revisit trigger: If payout volume grows or multiple installment models are reintroduced, move payout execution to a dedicated worker/queue with a payout ledger and per-booking multi-payment aggregation rules.

## [2026-03-21] Unify admin protection with Auth0-backed identity/role resolution
- Context: Admin frontend gating used Auth0/customer role while backend admin routes only trusted legacy JWT `type=admin`, causing authorization mismatch risk.
- Decision: Update `requireAdminAuth` to accept legacy admin JWTs and otherwise resolve Auth0-backed customer identity then verify `users.role = 'admin'` before allowing `/api/admin/*`.
- Why: A single launch-safe admin source of truth avoids hidden lockouts and role drift between FE and BE.
- Impact: Admin routes now align with current Auth0-based auth flows while preserving backward compatibility for legacy tokens.
- Revisit trigger: If role/permission needs expand beyond admin/customer/vendor, replace middleware branching with explicit RBAC policy layer.
