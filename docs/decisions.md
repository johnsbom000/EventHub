# Event Hub Decisions Log

Last updated: March 6, 2026

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
