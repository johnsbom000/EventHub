# Event Hub Decisions Log

Last updated: February 20, 2026

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
