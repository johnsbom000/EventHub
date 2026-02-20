# Event Hub Project Brief

Last updated: February 20, 2026

## Vision
Event Hub is a marketplace for event vendors, starting with a focused MVP for small-to-mid-size vendors offering rentals as a service.

Primary vision:
- Replace the need for fragmented event-planning workflows by becoming the booking infrastructure vendors and customers rely on.
- Start with rentals, while preserving a clear path to services in a future phase.
- Provide vendors platform they can manage their business from.

## Core Problem
Small event vendors and event planners lose time and money across disconnected tools and manual coordination.

Event Hub should reduce operational friction by centralizing:
- Vendor discovery
- Availability and listing management
- Booking requests and confirmations
- In-app communication

## Target Users
Primary users for MVP:
- Small to mid-size event vendors that offer rentals

Secondary users:
- Brides
- Event planners
- Corporate event organizers
- Party hosts
- Musicians

## MVP Outcome Definition
MVP is considered launched when real vendors can use Event Hub for managing their business and event planners can book from the platform.

Meaningful success indicators:
- 20 vendors onboarded
- 40 listings live
- 2+ real booking requests created
- Vendors use dashboard for responses and communication
- Deposits are collected when required
- Platform payout behavior is working for vendor payments

## Timeline and Capacity
- Target launch window: 1.5 weeks
- Team: solo founder-developer
- Capacity: ~50 hours/week

Week 1 priorities:
- Lock booking flow
- Make booking deposit requirement work end-to-end
- Confirm booking writes correctly to database
- Ensure vendor dashboard shows booking state clearly

Final 3 to 5 days:
- Remove unstable features
- Execute launch test checklist
- Deploy
- Manually onboard 3 to 5 initial vendors

## Constraints
- Solo development
- Beginner-level engineering experience
- Limited budget
- No dedicated design team

Stack:
(If there's something in the stack that you identify as not scale-able, let me know)
- React + TypeScript
- Express backend
- Neon Postgres
- Drizzle ORM
- Auth0
- Stripe (partially integrated)
- Tailwind CSS

Working principle:
- Ship value over sophistication
- Avoid over-architecture and perfectionism
- Keep codebase clean enough to move fast

## Biggest Risks / Blockers
1. Overbuilding
- Risk of building long-term architecture before proving demand.

2. Booking flow complexity
- Coordinating payments, notifications, and state transitions can stall launch.

3. Vendor acquisition
- Marketplace quality depends on initial vendor supply.

4. Scope creep
- Temptation to add non-essential features before launch.

5. Time pressure
- 1.5 weeks is tight for a solo beginner without strict prioritization.

## Non-Goals (Current MVP)
- Perfect UX polish
- Advanced ranking or personalization
- Broad multi-segment support beyond rental-focused vendors
- Complex automation that does not directly improve booking conversion
