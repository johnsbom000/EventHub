# EventHub Pre-Launch Audit Report

**Date:** 2026-05-13  
**Branch audited:** `feature/dispute-case-system`  
**Auditor:** Claude Sonnet 4.6 (automated deep-read audit)

---

## Executive Summary

**Findings by severity:**

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 9 |
| Medium | 14 |
| Low | 8 |
| Polish | 5 |
| **Total** | **41** |

### Top 5 things to fix before launch

1. **[CRITICAL] Real credentials stored in local `.env` file** — The `.env` file on disk contains live Stripe test keys, a real Neon database connection string, Mapbox secret token, Google OAuth client secret, Stream Chat secret, and Google Translate API key. While `.env` is gitignored and has never been committed, any accidental commit, leak, or CI artifact exposure would be catastrophic.

2. **[CRITICAL] No HTTPS enforcement / HSTS header at the application layer** — The server does not redirect HTTP to HTTPS nor set a `Strict-Transport-Security` header programmatically. While Railway may handle TLS termination, there is no application-level guarantee.

3. **[HIGH] Auth0 tokens cached in `localStorage`** — `cacheLocation="localstorage"` in `Auth0Provider` exposes tokens to XSS attacks. `memory` cache is safer; `localstorage` should only be used if there is a documented reason.

4. **[HIGH] Vendor reviews endpoints are stubbed / non-functional** — `GET /api/vendor/reviews` always returns `[]` and `POST /api/vendor/reviews/:id/reply` always returns `{ success: true }` without any database operation. If reviews are a promised feature, this is a launch blocker.

5. **[HIGH] No Privacy Policy page or link** — There is no Privacy Policy route in `App.tsx`, no link in the Footer, and no mention of privacy in the Checkout flow or signup — required for GDPR, CCPA, and Stripe compliance.

---

## Section 1: Repository Hygiene & Build Health

### CRIT-001: Sensitive credentials exist in local `.env` file
**Severity:** Critical  
**Category:** Secrets Management  
**File:** `.env` (repo root, gitignored)  
**Description:** The `.env` file on disk contains real credentials:
- `DATABASE_URL` with username/password for a Neon PostgreSQL database
- `STRIPE_SECRET_KEY=sk_test_51SOPAZ...` (real Stripe test key)
- `STRIPE_WEBHOOK_SECRET=whsec_48b6f6...` (real webhook signing secret)
- `JWT_SECRET=22cde7fd...` (real 64-byte hex JWT secret)
- `MAPBOX_SECRET_TOKEN=sk.eyJ1Ijoi...` (real Mapbox secret token — server-side only)
- `GOOGLE_CLIENT_SECRET=GOCSPX-iwVG...` (real Google OAuth client secret)
- `STREAM_API_SECRET=wrwps9qn...` (real Stream Chat API secret)
- `GOOGLE_TOKEN_ENCRYPTION_KEY=e607dc53...` (real AES-256 encryption key for stored OAuth tokens)
- `GOOGLE_TRANSLATE_API_KEY=AIzaSyAu...` (real Google Translate key)

While `.env` is correctly gitignored and has never been committed to the git history, these are real credentials that should be treated as potentially compromised. If they were ever accidentally committed or leaked via environment debugging endpoints, they would expose the full production database and payment system.

**Recommended fix:**
1. Rotate ALL credentials immediately before launch — treat the current values as compromised.
2. Store production secrets only in Railway's Variables tab, never on developer machines in plaintext files.
3. Add a pre-commit hook (`git secrets` or `gitleaks`) to block accidental credential commits.

---

### CRIT-002: Firebase env variables in example files but unused in code
**Severity:** Low  
**Category:** Configuration Debt  
**File:** `.env.development.example` lines 96-102, `.env.production.example` lines 110-117  
**Description:** Seven `VITE_FIREBASE_*` environment variables are documented in both example env files, but zero references to these variables exist anywhere in `client/src`. Firebase is listed as a `firebase.json` hosting target but a comment inside that file explicitly states it is NOT the production host. These variables create confusion and waste developer time.

**Recommended fix:** Remove the `VITE_FIREBASE_*` block from both example env files. Keep `firebase.json` with its explanatory comment if Firebase Hosting might be used for static CDN later.

---

### MED-001: `tmp_post_norm_audit.ts` committed to repo root
**Severity:** Medium  
**Category:** Repository Hygiene  
**File:** `tmp_post_norm_audit.ts` (repo root, 7.6KB, dated 2026-03-27)  
**Description:** A temporary audit/script file exists in the repo root. It appears to be a one-off migration audit script not meant to ship to production.

**Recommended fix:** Delete the file or move it to a `scripts/` directory with an explanatory name.

---

### MED-002: `console.log` in production `vite.ts` server file
**Severity:** Medium  
**Category:** Repository Hygiene  
**File:** `server/vite.ts` line 19  
**Description:** `console.log` is used directly in the Vite dev server helper instead of the structured Pino logger. In production this sends unstructured output to stdout that bypasses Railway's log parser.

**Recommended fix:** Replace with `logger.info(...)` from `server/lib/logger`.

---

### MED-003: `console.error` in `server/routes.ts` webhook handler
**Severity:** Low  
**Category:** Repository Hygiene  
**File:** `server/routes.ts` line 13731  
**Description:** One `console.error` call slipped past the structured logging system inside the booking creation error handler (`[POST /api/bookings] Unexpected error at stage=...`).

**Recommended fix:** Replace with `logger.error(...)`.

---

### LOW-001: Build script includes many migration files, but not the latest ones
**Severity:** Low  
**Category:** Build Health  
**File:** `package.json` (build script)  
**Description:** The `build` script in `package.json` enumerates migration files through `0031_add_whats_not_included.ts`, but the repo contains migrations up through `0080_schema_cleanup.ts`. The newer migrations (0032–0080) are not included in the production bundle. This means `npm run start` (production) cannot run the newer migrations unless they are applied separately via `tsx` or `drizzle-kit`.

**Recommended fix:** Remove the explicit migration list from the build script and run migrations via `npm run migrate` (which uses `server/migrate.ts`) as a separate pre-start step, which is already the deployment pattern. If bundling migrations for some reason, automate the list with a glob.

---

## Section 2: Authentication & Authorization

### HIGH-001: Auth0 tokens cached in `localStorage` (XSS risk)
**Severity:** High  
**Category:** Authentication  
**File:** `client/src/main.tsx` line 145  
**Description:** `Auth0Provider` is configured with `cacheLocation="localstorage"`. Auth0 tokens stored in `localStorage` are accessible to any JavaScript running on the page, including injected XSS payloads. This is the highest-risk Auth0 configuration.

**Recommended fix:** Change to `cacheLocation="memory"` (default). If cross-tab session persistence is required, use `cacheLocation="localstorage"` only with documented justification and a robust CSP. Alternatively, use refresh token rotation with `useRefreshTokens={true}` with `memory` cache — the SDK will handle token renewal invisibly.

Note: `useRefreshTokens={true}` is already set, which is good — but it still uses `localstorage` for the cache, which is the concern.

---

### MED-004: `requireDualAuthAuth0` allows unauthenticated pass-through (`auth0Only`)
**Severity:** Medium  
**Category:** Authorization  
**File:** `server/auth.ts` lines 517-519  
**Description:** `requireDualAuthAuth0` sets `req.auth0Only = true` and calls `next()` when no matching local account is found. Routes using `requireDualAuthAuth0` that don't explicitly check for `req.vendorAuth` or `req.customerAuth` presence may silently allow unregistered users to proceed. This is by design for onboarding flows, but it means the middleware does NOT guarantee authorization for all consuming routes.

**Observed correctly:** Most consuming routes do check `if (!vendorAuth)` → 403. However, the implicit pass-through for unauthenticated-but-Auth0-valid users is subtle and could lead to future authorization gaps if new routes forget the secondary check.

**Recommended fix:** Document this behavior prominently on `requireDualAuthAuth0`. Consider adding a stricter variant (e.g. `requireAnyLocalAccount`) that 401s when no local account exists.

---

### MED-005: Vendor reviews endpoint always returns empty — potential data leak if fixed naively
**Severity:** Medium (as a secondary concern to HIGH-002 below)  
**Category:** Authorization  
**File:** `server/routes.ts` lines 11134-11147  
**Description:** See HIGH-002. When this stub is implemented, care must be taken to ensure the query filters `listing_reviews` by `vendorAccountId` to avoid IDOR.

---

### LOW-002: IDOR protection verified as correct on primary listing/booking endpoints
**Severity:** Informational  
**Category:** Authorization  
**Description:** All checked vendor listing mutation endpoints (`PATCH /api/vendor/listings/:id`, `DELETE /api/vendor/listings/:id`, `PATCH /api/vendor/listings/:id/publish`, etc.) correctly filter with `eq(vendorListings.accountId, vendorAuth.id)`, preventing one vendor from modifying another's listings. Booking access is similarly scoped. No IDOR vulnerabilities found in the primary flows.

---

### MED-006: Duplicate route definition for `POST /api/admin/disputes/:id/note`
**Severity:** Medium  
**Category:** API Correctness  
**File:** `server/routes.ts` lines 12280 and 16196  
**Description:** The same route `POST /api/admin/disputes/:id/note` is registered twice. Express will match the first registration and ignore the second, making the second version dead code. If they have different behavior, one version is silently ignored.

**Recommended fix:** Remove the duplicate. Determine which version is the canonical one (likely the one in the admin/disputes section around line 16196 which appears to be newer) and remove the other.

---

## Section 3: Payments (Stripe Connect)

### HIGH-002: Commission rates (`VENDOR_FEE_RATE`, `CUSTOMER_FEE_RATE`) not set in `.env`
**Severity:** High  
**Category:** Payments  
**File:** `server/lib/constants.ts` lines 3-4; `.env` (missing)  
**Description:** The platform's fee rates default to 8% vendor fee and 5% customer fee if not set via environment variables. The `.env` file on disk does NOT set `VENDOR_FEE_RATE` or `CUSTOMER_FEE_RATE`, which means the server runs with the hard-coded defaults. If the business wants to change fee rates (e.g. to 10% for launch), there is no reminder to set these in production. If the Railway production deployment also omits these, the platform silently uses defaults.

**Recommended fix:** Add `VENDOR_FEE_RATE=0.08` and `CUSTOMER_FEE_RATE=0.05` to `.env.development.example` and `.env.production.example` with explicit values and a note that they must be set in Railway. Confirm these are set in the Railway Variables dashboard.

---

### CRIT-003: Stripe webhook: `rawBody` fallback could silently bypass signature verification
**Severity:** Critical  
**Category:** Payments / Security  
**File:** `server/routes.ts` lines 14311-14314  
**Description:** The Stripe webhook handler uses:
```javascript
const rawBody =
  req.rawBody instanceof Buffer
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}));
```
If `req.rawBody` is not a Buffer (which can happen if the raw body middleware didn't run, or if the request passes through a middleware that consumes the body first), the handler reconstructs the body from `req.body` using `JSON.stringify`. This reconstructed body may have different whitespace/ordering than the original, causing Stripe signature verification to fail — OR, an attacker who crafts a request with a body that serializes identically could bypass verification. The same pattern appears in the Stream Chat webhook handler (line 10703-10705).

**Verified:** The global `verify` middleware in `server/index.ts` lines 178-182 does set `req.rawBody = buf` for all JSON requests. However, the route `POST /api/stripe/webhook` is preceded by `express.json({ limit: "10kb" })` applied narrowly to `/api/events` and `/api/track` (line 173), then the 6MB global parser. The order of middleware registration matters. If the route-specific size-limited parser fires before the global one for `/api/stripe/webhook`, `rawBody` should still be set because both parsers use the same `verify` callback. This needs careful verification.

**Recommended fix:** Add an explicit assertion at the top of the webhook handler: `if (!(req.rawBody instanceof Buffer)) { return res.status(400).json({ error: "Raw body not available" }); }`. Never fall back to reconstructing the body.

---

### MED-007: No validation that Stripe webhook `livemode` matches `NODE_ENV`
**Severity:** Medium  
**Category:** Payments  
**File:** `server/routes.ts` around line 14329  
**Description:** The webhook handler records `livemode: Boolean(event.livemode)` but does not reject test-mode events in production or live-mode events in staging. An attacker with access to test Stripe keys could replay test-mode events against a production endpoint if the webhook secret is also compromised.

**Recommended fix:** In production, add a check: if `NODE_ENV === "production" && !event.livemode`, reject with 400. In staging/dev, optionally warn on live-mode events.

---

### MED-008: Security deposit refund job uses `payment_type IN ('security_deposit', 'deposit')` — legacy `deposit` type may cause unintended refunds
**Severity:** Medium  
**Category:** Payments  
**File:** `server/routes.ts` line 3862  
**Description:** The auto-refund job for security deposits queries for `payment_type IN ('security_deposit', 'deposit')`. The `deposit` type is documented as a legacy value (schema.ts line 45: "Legacy values — still in DB for existing rows; new rows use 'booking' instead of 'deposit'"). However, old `deposit` payments may not be security deposits — they were part of an old installment billing system. Matching legacy `deposit` rows for security-deposit refunds could trigger unintended refunds.

**Recommended fix:** Restrict the refund job to `payment_type = 'security_deposit'` only. For legacy `deposit` rows, evaluate case-by-case via the admin panel.

---

### LOW-003: `createCheckoutSession` (Stripe Checkout) uses destination charges — different payout model than PaymentIntents
**Severity:** Low  
**Category:** Payments  
**File:** `server/stripe.ts` lines 504-549  
**Description:** The `createCheckoutSession` function uses `transfer_data.destination` (destination charges), meaning funds flow immediately to the vendor minus the application fee. This bypasses the 72-hour hold and dispute window logic implemented for `createBookingPaymentIntent`. If both payment flows are active simultaneously, vendors could receive payouts before dispute windows close on Checkout-session-originated bookings.

**Recommended fix:** Confirm the Checkout Session flow is only used for the simple direct-purchase path (not regular bookings). If all bookings go through `createBookingPaymentIntent`, document why `createCheckoutSession` exists and either remove it or add explicit payout hold logic to it.

---

## Section 4: Data Layer

### HIGH-003: `checkListingAvailabilityForBookingRequest` runs OUTSIDE the transaction, then the transaction re-checks
**Severity:** High  
**Category:** Data Integrity / Race Condition  
**File:** `server/routes.ts` lines 13120-13181 (pre-transaction check), 13327-13376 (in-transaction re-check)  
**Description:** The booking creation flow runs an availability check before the database transaction starts (around line 13135). This pre-check is non-atomic and subject to TOCTOU (time-of-check-time-of-use) races — two concurrent requests could both pass the pre-check and then both proceed to insert conflicting bookings.

**However, this is mitigated:** The transaction itself (starting line 13327) re-checks availability inside a `pg_advisory_xact_lock(hashtext(listingRow.id))` at line 13329. The advisory lock serializes concurrent booking attempts for the same listing, and the in-transaction overlap query at line 13331 is the authoritative check.

**Residual risk:** If the advisory lock is not available (e.g. DB connection error), the `failClosed: true` bookingRateLimiter returns 503, but the pre-transaction check is still a false sense of security. The pre-check's 409 response (line 13150) is correct but not the authoritative one.

**Recommended fix:** This is a medium risk in practice due to the in-transaction re-check, but for code clarity, consider removing the non-atomic pre-check or clearly documenting it as an optimization only, with a comment that the in-transaction check is the authoritative gate.

---

### MED-009: N+1 query risk in vendor booking list
**Severity:** Medium  
**Category:** Performance  
**File:** `server/routes.ts` around lines 10034-10103 (`GET /api/vendor/bookings`)  
**Description:** The vendor bookings endpoint loads bookings with related listing and customer data. A review of the query structure shows it uses raw SQL with joins, which should be fine. However, the Google Calendar sync status check and unread count lookups for each booking (if done per-booking) could cause N+1 patterns as booking lists grow.

**Recommended fix:** Audit the specific query at this endpoint to confirm all data is loaded with a single query. If per-booking Google Calendar lookups occur, batch them.

---

### MED-010: `listing_reviews` table exists in DB but Drizzle schema does not define it
**Severity:** Medium  
**Category:** Schema Consistency  
**File:** `server/routes.ts` lines 11805, 8472, 9115 (raw SQL references `listing_reviews`)  
**Description:** The review system inserts into `listing_reviews` via raw SQL (`drizzleSql`), but this table is not defined in `shared/schema.ts`. This means the table is invisible to Drizzle's type system, no Drizzle query builder can be used on it, and it cannot be tracked by `drizzle-kit` for future migrations.

**Recommended fix:** Add `listingReviews` to `shared/schema.ts` with full column definitions and foreign key references. Use the Drizzle ORM instead of raw SQL for review queries.

---

### LOW-004: Many foreign key references use `varchar` without explicit length
**Severity:** Low  
**Category:** Schema  
**File:** `shared/schema.ts` throughout  
**Description:** IDs are defined as `varchar("id")` without a length parameter. PostgreSQL allows this (unlimited varchar), but it is inconsistent with best practices and could cause issues with certain tools.

**Recommended fix:** Consider using `uuid` or `text` types for IDs consistently. Low priority.

---

## Section 5: API Surface

### HIGH-004: No rate limiting on Auth0 token verification — per-request JWKS calls possible
**Severity:** High  
**Category:** API Abuse  
**File:** `server/auth0.ts` line 14-22  
**Description:** The JWKS client is configured with `cacheMaxAge: 10 * 60 * 1000` (10 minutes) and `rateLimit: true` with `jwksRequestsPerMinute: 10`. However, if the JWKS cache is cold (first request, or after 10-minute TTL), every concurrent API call will attempt to fetch keys from Auth0. Under high traffic, this could exhaust the `jwksRequestsPerMinute` limit and cause 401 errors for legitimate users.

**Recommended fix:** The JWKS client configuration looks correct for moderate traffic. Increase `cacheMaxAge` to at least 30-60 minutes and add `cacheMaxEntries: 10`. Monitor Auth0 rate limit errors during load testing.

---

### MED-011: `POST /api/discounts/validate-code` is a public endpoint (no auth required)
**Severity:** Medium  
**Category:** API Abuse  
**File:** `server/routes.ts` line 17707  
**Description:** The promo code validation endpoint is intentionally public (no auth required) with a `socialRateLimiter` (5 req/min per IP). An attacker could enumerate valid promo codes by brute-forcing the `code` field. The rate limit of 5 per minute is quite low, but still allows ~7,200 attempts per 24 hours from a single IP.

**Recommended fix:** This is likely acceptable for a low-volume marketplace. To harden: require authentication OR add a more aggressive rate limiter (1 req/min per IP). The current `socialRateLimiter` at 5/min is borderline acceptable.

---

### MED-012: Stack traces could leak through error handler in development
**Severity:** Medium  
**Category:** API Security  
**File:** `server/index.ts` lines 216-227  
**Description:** The global error handler at the bottom of `server/index.ts` sends `err.message` in the response in development mode (`isDev ? err?.message || "Internal Server Error" : "Internal Server Error"`). This is correctly scoped to dev only. However, Zod validation errors in routes that use `.parse()` (instead of `.safeParse()`) throw `ZodError` instances — and some routes catch these and return them directly (e.g., `if (error?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: error.errors })`), which leaks the full validation error structure to any environment.

**Recommended fix:** Zod validation errors sent to the client are acceptable for 400 responses — the field paths and error messages are useful to the caller. Ensure no unhandled `ZodError` reaches the 500 error handler in production. This is informational.

---

### LOW-005: `PATCH /api/user/language` and `PUT /api/users/me/location` are unauthenticated
**Severity:** Low  
**Category:** Authorization  
**File:** `server/routes.ts` lines 4542, 4607  
**Description:** Both endpoints are intentionally unauthenticated — they silently fall back to "no-op" for unauthenticated users. This is by design (language preference stored client-side for guests). The `mutationRateLimiter` (20/min) provides minimal abuse protection.

**Assessment:** Acceptable design. The endpoints write nothing for unauthenticated users. No fix needed, but note that these endpoints respond with `200 { ok: true, persisted: false }` for unauthenticated requests, which could confuse developers.

---

### MED-013: `/api/internal/launch/smoke-summary` is accessible to any authenticated vendor
**Severity:** Medium  
**Category:** Information Disclosure  
**File:** `server/routes.ts` line 5449  
**Description:** `GET /api/internal/launch/smoke-summary` is protected with `requireVendorAuth0` (any authenticated vendor), not `requireAdminAuth`. This endpoint may expose internal system health data to regular vendors.

**Recommended fix:** Either gate with `requireAdminAuth` or remove it if it was a temporary debug tool.

---

## Section 6: Core User Flows

### HIGH-005: Vendor reviews endpoint is a non-functional stub
**Severity:** High  
**Category:** Feature Completeness  
**File:** `server/routes.ts` lines 11134-11156  
**Description:** 
- `GET /api/vendor/reviews` always returns `[]` (empty array) regardless of actual reviews in the database.
- `POST /api/vendor/reviews/:id/reply` always returns `{ success: true }` without writing anything to the database.

This means the Vendor Reviews page in the dashboard will always show empty, and reply functionality is silently broken. If reviews are being written by customers (`POST /api/customer/bookings/:id/review` does correctly insert into `listing_reviews`), vendors cannot see them through the dashboard.

**Recommended fix:** Implement `GET /api/vendor/reviews` to query `listing_reviews` filtered by vendor account ID. Implement `POST /api/vendor/reviews/:id/reply` to store a vendor reply. This is a high-priority feature gap.

---

### MED-014: Booking availability pre-check and in-transaction check use different conflict models
**Severity:** Medium  
**Category:** Data Integrity  
**File:** `server/routes.ts` lines 2542-2586 (pre-check) vs 13331-13375 (in-transaction)  
**Description:** The pre-transaction availability check (`checkListingAvailabilityForBookingRequest`) uses a separate helper function that queries the database outside the transaction. The in-transaction re-check uses a different raw SQL query with `pg_advisory_xact_lock`. If the two queries don't count reserved units identically (e.g., one may miss `booking_items`-based bookings while the other catches them), false "available" results could escape the pre-check and be caught only by the in-transaction check — causing the user to see a 409 after their payment form loads.

**Recommended fix:** Ensure both pre-check and in-transaction check use identical overlap logic. Ideally consolidate into one code path.

---

### LOW-006: Security deposit refund confirmed implemented (memory note was outdated)
**Severity:** Informational  
**File:** `server/routes.ts` lines 3829-3950  
**Description:** The memory note says "the post-dispute-window refund trigger has NOT been built yet." This is outdated — the security deposit auto-refund job is fully implemented at lines 3829-3950. It runs every hour with distributed locking and correctly checks for open dispute cases before refunding. The memory note should be updated.

---

## Section 7: Frontend

### HIGH-006: No Privacy Policy page exists
**Severity:** High  
**Category:** Legal / Compliance  
**Files:** `client/src/App.tsx`, `client/src/components/Footer.tsx`  
**Description:** There is no Privacy Policy route in `App.tsx` and no Privacy Policy link in the Footer component. The Footer only links to Terms of Service. A Privacy Policy is legally required in most jurisdictions (GDPR, CCPA, COPPA) and is required by Stripe for marketplace integrations. The Terms of Service contact lists `legal@eventhub.com` but no privacy contact.

**Recommended fix:** Create a `/privacy` route with a Privacy Policy page. Add the link to the Footer alongside the Terms of Service link. Link from the signup/checkout flow ("By continuing you agree to our Terms of Service and Privacy Policy").

---

### MED-015: Footer missing Privacy Policy link
**Severity:** Medium  
**Category:** Legal  
**File:** `client/src/components/Footer.tsx` lines 59-67  
**Description:** The Legal section in the Footer only contains "Terms of Service." Privacy Policy, Cookie Policy, and DMCA/Takedown are all absent.

**Recommended fix:** Add Privacy Policy link once the page exists. Consider adding a Contact link.

---

### MED-016: Checkout page links to Terms of Service but not Privacy Policy
**Severity:** Medium  
**Category:** Legal  
**File:** `client/src/pages/Checkout.tsx` lines 1795-1799  
**Description:** The checkout disclaimer references Terms of Service but not the Privacy Policy. Payment processors (Stripe) require both to be linked at the point of payment collection.

**Recommended fix:** Update the disclaimer to link both Terms of Service and Privacy Policy.

---

### LOW-007: `Terms.tsx` references `legal@eventhub.com` which may not be set up
**Severity:** Low  
**Category:** Operations  
**File:** `client/src/pages/Terms.tsx` line 28  
**Description:** The Terms of Service page lists the contact email as `legal@eventhub.com`. Confirm this email address is configured and monitored before launch.

---

### MED-017: Error boundary in `main.tsx` swallows error details in production
**Severity:** Medium  
**Category:** Observability  
**File:** `client/src/main.tsx` lines 66-92  
**Description:** The top-level `ErrorBoundary` component calls `console.error` but has no integration with error tracking (Sentry or equivalent). If a React rendering error occurs in production, it will show a generic "We hit a temporary issue" message with no visibility into what went wrong.

**Recommended fix:** Integrate Sentry (or equivalent) error tracking. Call `Sentry.captureException(error)` in `componentDidCatch`.

---

## Section 8: Maps (Mapbox)

### MED-018: `VITE_MAPBOX_TOKEN` is a public token — correctly used, but token scoping should be verified
**Severity:** Medium  
**Category:** Security  
**Files:** `client/src/features/vendor/create-listing/CreateListingWizard.tsx` lines 42-44, `steps/ServiceAreaStep.tsx` lines 10-12  
**Description:** `VITE_MAPBOX_TOKEN` (a `pk.*` public token) is correctly used client-side for maps and geocoding. A `sk.*` secret token (`MAPBOX_SECRET_TOKEN`) exists in `.env` and should remain server-side only — it does not appear to be referenced in any client code.

**Concern:** Mapbox public tokens are restricted by allowed URLs in the Mapbox dashboard. If the token's allowed URLs are not restricted to `eventhubglobal.com`, any third party could use the token for free Mapbox API calls.

**Recommended fix:** In the Mapbox dashboard, restrict the `pk.*` token to the production domain (`eventhubglobal.com`) only. Confirm `sk.*` is never passed to the client.

---

### LOW-008: Mapbox error handling exists but shows technical messages
**Severity:** Low  
**Category:** UX  
**File:** `client/src/features/vendor/create-listing/CreateListingWizard.tsx` line 1196  
**Description:** On Mapbox load failure, the error message shown is `"Map failed to load. Check your Mapbox token and allowed URL settings."` — a technical message a vendor would not understand.

**Recommended fix:** Use a user-friendly fallback message like "Map is unavailable. You can still enter your address manually."

---

## Section 9: Email / Notifications

### HIGH-007: No unsubscribe links in any transactional emails
**Severity:** High  
**Category:** Legal / Email Compliance  
**Files:** `server/emails/*.ts` (all 18 templates)  
**Description:** None of the 18 transactional email templates contain an unsubscribe link. While transactional emails (booking confirmations, payment receipts) are generally exempt from CAN-SPAM/GDPR unsubscribe requirements, marketing-adjacent emails like `reviewPrompt.ts`, `pendingRequestReminder.ts`, and `eventDayReminder.ts` could be classified as commercial emails requiring an opt-out mechanism. Additionally, `accountSuspended.ts` and `circumventionWarning.ts` are operational emails that should include a contact link for disputes.

**Recommended fix:**
1. Add a footer to all emails with: "You're receiving this because you have an account on EventHub. [Manage notifications] [Contact support]"
2. For promotional/reminder emails (reviewPrompt, pendingRequestReminder, eventDayReminder), add a clear "Unsubscribe from reminders" link.

---

### MED-019: Email sending failures are logged but do not raise alerts
**Severity:** Medium  
**Category:** Observability  
**File:** `server/email.ts` lines 71-78  
**Description:** When Resend returns an error, the function logs a warning and returns `{ sent: false, skipped: false, reason: ... }`, but callers typically fire-and-forget (using `void` or async wrappers). A failed booking confirmation email to a customer would be silently lost with no alert or retry mechanism.

**Recommended fix:** Add a monitoring alert (Sentry, Railway alerts, or PagerDuty) when email failure rate exceeds a threshold. Consider a simple retry queue for critical emails (booking_confirmed, payment_receipt).

---

### LOW-009: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` not set in local `.env` — emails silently skipped
**Severity:** Low  
**Category:** Configuration  
**File:** `server/index.ts` lines 246-249; `.env` (missing Resend config)  
**Description:** The server logs a startup warning when Resend is not configured, but the `.env` file shows these keys are commented out. This means transactional emails are silently skipped in the development environment. Bugs in email templates would not be caught locally.

**Recommended fix:** Set up a Resend sandbox API key for development with emails forwarded to a dev inbox. Uncomment the Resend config in `.env`.

---

## Section 10: Legal & Policy

### CRIT-004: No Privacy Policy page — required by law and by Stripe
**Severity:** Critical  
**Category:** Legal Compliance  
**Description:** See HIGH-006. This is elevated to Critical because Stripe explicitly requires a Privacy Policy be linked from the payment page before they approve production access. Without it, Stripe may decline to enable live payments.

---

### MED-020: Terms of Service uses `eventhub.com` as contact domain but production domain is `eventhubglobal.com`
**Severity:** Medium  
**Category:** Legal  
**File:** `client/src/pages/Terms.tsx` line 28  
**Description:** The ToS lists `legal@eventhub.com` but the production domain is `eventhubglobal.com`. If `eventhub.com` is not owned or controlled by EventHub, this is a legal issue and creates customer confusion.

**Recommended fix:** Change the contact email to `legal@eventhubglobal.com` and confirm the email address is monitored.

---

## Section 11: Observability

### HIGH-008: No server-side error tracking (Sentry or equivalent)
**Severity:** High  
**Category:** Observability  
**Files:** `server/index.ts`, all route files  
**Description:** The server uses Pino for structured logging, which is good for log aggregation in Railway. However, there is no integration with an error tracking service (Sentry, Datadog, Rollbar, etc.). Unhandled errors, payment failures, and webhook errors are logged to stdout but no alerts are generated. In production, a spike in 500 errors could go unnoticed for hours.

**Recommended fix:** Add `@sentry/node` to the server and initialize it before routes. Capture unhandled exceptions and promise rejections. Add `Sentry.captureException(err)` in the global error handler. Similarly add `@sentry/react` to the frontend.

---

### MED-021: No webhook failure monitoring for Stripe or Stream Chat
**Severity:** Medium  
**Category:** Observability  
**File:** `server/routes.ts` webhook handlers  
**Description:** When the Stripe webhook handler encounters an error (DB write failure, logic exception), it logs the error but Stripe will retry the webhook up to 3 days. If the application has a systematic bug (e.g., a DB migration hasn't run), the retries will all fail silently and payment records will be out of sync.

**Recommended fix:** Add a Sentry or alerting integration specifically for webhook processing failures. Consider implementing a dead-letter queue for failed webhook events.

---

## Section 12: Deployment

### CRIT-005: No HTTPS enforcement at the application layer
**Severity:** Critical  
**Category:** Deployment / Security  
**File:** `server/index.ts`  
**Description:** The server does not redirect HTTP requests to HTTPS, and Helmet's `strictTransportSecurity` is not explicitly configured. Helmet enables HSTS by default, but the default settings may not be optimal (default `maxAge` is 15552000 = 180 days, no `includeSubDomains`, no `preload`). More critically, if Railway terminates TLS at the load balancer and passes HTTP to the app server, the app relies entirely on Railway's HTTPS enforcement. There is no application-level check for `X-Forwarded-Proto: https`.

**Recommended fix:**
1. Add explicit HSTS configuration to the `helmet()` call:
   ```javascript
   hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
   ```
2. Add a middleware that redirects HTTP to HTTPS using `req.headers['x-forwarded-proto']` in production.
3. Verify Railway is configured to enforce HTTPS.

---

### MED-022: `Access-Control-Allow-Credentials: true` set for all cross-origin requests
**Severity:** Medium  
**Category:** Security  
**File:** `server/index.ts` line 144  
**Description:** `Access-Control-Allow-Credentials: true` is set for all requests from allowed origins. Since the app uses Bearer token authentication (not cookies), this header is technically unnecessary. However, it is set unconditionally alongside the dynamic `Access-Control-Allow-Origin`, which is the correct pattern for credentialed requests. The CORS origin allowlist correctly rejects unlisted origins.

**Assessment:** No immediate vulnerability, but the header is unnecessary for a Bearer-token-only API. Low priority cleanup.

---

### LOW-010: Firebase hosting config exists but is documented as unused — potential confusion
**Severity:** Low  
**Category:** Deployment  
**File:** `firebase.json`  
**Description:** See CRIT-002. The `firebase.json` file and `firebase-debug.log` in the repo root could confuse new contributors who might attempt to deploy via Firebase Hosting.

**Recommended fix:** Add a `DEPLOYMENT.md` documenting the correct deployment target (Railway). Keep `firebase.json` with its note, or remove it entirely.

---

## Polish / UX

### POLISH-001: Admin auto-redirect fires on every session start, adds latency
**Severity:** Polish  
**File:** `client/src/App.tsx` lines 92-118  
**Description:** The `AdminAutoRedirect` component queries `GET /api/admin/me` once per browser session for ALL authenticated users. For non-admin users, this is a wasted API call that returns 403 on every session start. The result is cached via `sessionStorage`, so subsequent page loads don't repeat it.

**Recommended fix:** Gate the admin check more narrowly. Consider checking `user.email` client-side against a known admin domain pattern before hitting the API.

---

### POLISH-002: `VendorReviews` page has no data to show (stub backend)
**Severity:** High (same as HIGH-005)  
**File:** `client/src/pages/VendorReviews.tsx`  
**Description:** The Vendor Reviews page in the dashboard will always be empty due to the stub backend. This is embarrassing to show real vendors.

---

### POLISH-003: `GET /api/vendor/reviews` returns empty array but no indication it's a stub
**Severity:** Polish  
**File:** `server/routes.ts` line 11142  
**Description:** Returns `[]` silently. If a vendor asks support why they have no reviews despite receiving them, the empty response gives no diagnostic information.

---

### POLISH-004: `POST /api/vendor/reviews/:id/reply` returns success without doing anything
**Severity:** Polish  
**File:** `server/routes.ts` lines 11149-11156  
**Description:** The reply endpoint always returns `{ success: true }`. A vendor who tries to reply to a review will see a success message but nothing will be saved.

---

### POLISH-005: `tmp_post_norm_audit.ts` in repo root is unprofessional for a production codebase
**Severity:** Polish  
**File:** `tmp_post_norm_audit.ts`  
**Description:** Leftover debug/audit script. Delete before any demo or repository sharing.

---

## Did Not Audit

The following areas were not audited in this pass:

1. **TypeScript compilation errors** — Did not run `tsc --noEmit`. Compilation status unknown.
2. **All 80 migration files** — Only reviewed `0078` and `0080`. Migrations 0001-0077 were not reviewed for correctness, ordering, or data safety.
3. **Google Calendar webhook handler** (`server/googleWebhookHandler.ts`) — Not reviewed in detail.
4. **Translation service** (`server/translationService.ts`) — Not reviewed for injection risks or API key exposure.
5. **Stream Chat integration security** (`server/streamChat.ts`) — Token generation logic not fully reviewed.
6. **All frontend pages beyond Checkout and App.tsx** — Loading states, error states, and empty states for most pages not reviewed.
7. **Object storage (Cloudflare R2) configuration** — Bucket ACLs and public URL configuration not verified.
8. **Railway deployment configuration** (`railway.json`) — Not reviewed.
9. **Worker locks implementation** (`server/lib/workerLocks.ts`) — Not reviewed for correctness.
10. **The discount system end-to-end** — Only reviewed the validate-code endpoint; the full discount lifecycle was not traced.
11. **Automated tests** — The `tests/` directory contains a dispute-payout eligibility test; test coverage was not assessed.
12. **Mobile responsiveness** — No visual audit of responsive layouts.
13. **Accessibility (a11y)** — No accessibility audit performed.
14. **Dependency security audit** — `npm audit` was not run; known CVEs in dependencies were not checked.
15. **Performance profiling** — No load testing or query plan analysis was performed.

---

*Report generated by automated code audit. All findings are based on static code analysis. Dynamic testing (running the application) was not performed.*
