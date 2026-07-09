# EventHub — Claude Instructions

## Skills

### `/project-manager`
**Trigger:** `/project-manager` or natural language like "let's plan this", "spec out this feature", "break this down", "I want to build X", "scope this change"
**Description:** Guides development from idea to delivery through structured phases: Brainstorm → Technical Spec → Implementation Plan → Task Breakdown → Execution → Verification. Enforces approval gates between phases and delegates implementation to appropriate skills.
**Output:** `.claude/specs/[feature-name].md` + task list + delivery summary

### `/web-design`
**Trigger:** `/web-design` or natural language like "design this component", "style this page", "make this look less generic"
**Description:** Designs React + Tailwind components in EventHub's modern-classic marketplace style. Audits the existing component, presents 3 design directions, shows a code preview + browser-ready HTML preview, then waits for approval before editing any files.
**Output:** Edited source file(s) + `.claude/design-specs/[component-name].md`

### `/database-engineer`
**Trigger:** `/database-engineer` or natural language like "audit the schema", "design this table", "plan a migration", "is this query efficient", "fix this constraint", "normalize this", "add an index"
**Description:** Acts as the project's dedicated database expert. Audits PostgreSQL schema correctness, normalization, indexes, foreign keys, and query efficiency. Produces structured reports (Current State → Problem → Risk → Recommended Structure → Migration Plan → Backward Compatibility Impact) and writes migration files only after user approval.
**Output:** Structured analysis report + optional `migrations/NNNN_[name].ts`

### `/marketing-specialist`
**Trigger:** `/marketing-specialist` or natural language like "will vendors adopt this", "is this good for growth", "what's the positioning", "evaluate this feature's value", "draft landing page copy", "does this reduce friction", "monetization opportunity", "is this feature worth building"
**Description:** Evaluates product decisions through the lens of vendor adoption, retention, monetization, and market positioning. Identifies adoption friction, activation risks, and missed growth opportunities. Produces structured analysis (Opportunity → Impact → Why It Matters → Suggested Improvement → Expected Benefit) and copy direction. Does not design UI or write backend logic.
**Output:** Structured marketing analysis + optional copy (headlines, value props, CTAs)

### `/system-architect`
**Trigger:** `/system-architect` or natural language like "audit the architecture", "is this over-engineered", "review our API structure", "where are the scaling risks", "is this the right pattern", "do we have technical debt", "review data flow", "is this too complex", "should we refactor this"
**Description:** Evaluates architecture decisions, identifies complexity and scalability risks, enforces technical consistency, and ensures clean integration between frontend, backend, database, auth, and payments. Produces structured reviews (Current Structure → Risk → Architectural Concern → Recommended Structure → Why Better → Migration Impact). Does not fix bugs, write features, or do UI work.
**Output:** Structured architecture review report

### `/security`
**Trigger:** `/security` or natural language like "audit security", "check for vulnerabilities", "is this safe", "review auth", "check for injection", "payment bypass risk", "run a security audit"
**Description:** Audits the codebase for vulnerabilities across auth, authorization, data exposure, input validation, API abuse, payment safety, and database security. Reads actual source code — does not speculate. Produces structured findings (Attack Scenario → Severity → Exploitation Path → Recommended Fix → Priority) grouped Critical → High → Medium → Low.
**Output:** Structured security report with confirmed-safe summary

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools directly.

Available gstack skills: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/setup-gbrain`, `/retro`, `/investigate`, `/document-release`, `/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## Stack

- TypeScript monorepo, React + Vite (frontend), Express + Node (backend)
- PostgreSQL + Drizzle ORM (on Neon)
- Auth0 for auth, Stripe Connect (separate charges & transfers model) for payments
- Mapbox for location, Railway for deploy, AWS S3 for file storage
- Stream Chat for in-app messaging
- Design system: Playfair Display + DM Sans, modern pastel/glam aesthetic
- UI: Radix UI primitives + Tailwind CSS + shadcn-style components
- i18n: react-i18next with en/es/pt locales

## Conventions

- Use Drizzle ORM exclusively — never raw SQL
- All money handling goes through Stripe Connect; never touch balances directly
- Migrations live in `migrations/NNNN_name.ts` — always check the highest existing number before creating a new one (collisions have happened at 0030, 0032, 0035, 0042, 0048, 0082)
- All migrations must be idempotent (migration 0091 had to be fixed post-merge for this)
- Server lives in `server/`, frontend in `client/src/`, shared types in `shared/`
- Events instrumentation will flow through `server/lib/events.ts` (not yet wired)

## Running locally

```bash
npm run dev          # starts both Express server + Vite client concurrently
npm run dev:server   # Express server only (tsx watch, reads .env)
npm run dev:client   # Vite frontend only
npm run migrate      # run pending migrations against Neon
npm run typecheck    # TypeScript check (no emit)
npm run build        # production build (Vite + esbuild for server + all migrations)
npm start            # serve production build
```

Requires a `.env` file with Neon DB URL, Auth0, Stripe, Mapbox, and S3 credentials.

## Gotchas

- **Migration numbering collisions**: several migration numbers were used twice in the same batch (0030, 0032, 0035, 0042, 0048, 0082). Always `ls migrations/` before picking the next number.
- **react-leaflet was removed** (commit 51dced9) because it caused Railway build failures — do not re-add it. Use Mapbox GL JS directly.
- **Double-booking prevention is application-level, not DB-level**: an advisory lock + in-transaction recount in the single booking-insert path. Migration 0094 added performance indexes only — it does NOT enforce conflicts. Don't bypass or add booking-insert paths around the server's conflict checks.
- **Security deposit refund trigger** (post-dispute-window auto-refund) has schema in place (migration 0068) but the background job trigger has NOT been built yet.
- **Google tokens are encrypted** at rest (migration 0093) — don't log or expose them.
- **Vendor slugs are unique** (migration 0088 + unique constraint). Slug generation must handle collisions gracefully.
- **Stripe Connect** uses the separate charges & transfers model (not direct charges). Payout eligibility logic lives in `server/payoutEligibility.ts`.
- **Founding/Marquee vendor programs** are live (migrations 0089, 0090). Fee tiers differ from standard vendors — check before any payment flow changes.
- The build script in `package.json` bundles migrations via a glob (`esbuild migrations/[0-9]*.ts`) — new migration files are picked up automatically; no build-script edit is needed.
