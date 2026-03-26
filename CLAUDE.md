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
