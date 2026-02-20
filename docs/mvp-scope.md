# Event Hub MVP Scope

Last updated: February 20, 2026

## In Scope (Must Have)

### Vendor
- Sign up and log in (Auth0)
- Complete onboarding flow
- Create a listing
- Publish listing
- Share listing link
- Receive booking requests
- See incoming bookings in vendor dashboard
- See business performance metrics in dashboard
- Receive payouts
- Message customers in-app

### Customer
- Sign up and log in (Auth0)
- Browse listings
- Filter listings
- Open listing detail page
- See vendor profile and other listings
- Select event date
- Click "Book Now / Request To Book"
- Create pending booking record
- See and manage bookings in customer dashboard
- Message vendor in-app
- Receive confirmation communication after completed booking

### System / Platform
- Store web traffic and key use data
- Provide admin visibility of website metrics
- Save bookings reliably in database
- Include booking status update states
- Support deposits when required
- Notify vendor and customer on key booking transitions
- Apply transaction fee model:
  - Vendor fee: 8%
  - Customer service fee: 5%

## Out of Scope (For This MVP)
- Full expansion to non-rental service providers
- Perfect visual polish
- Advanced vendor ranking logic
- Complex vendor payout edge-case automation
- Enterprise-level analytics implementation
- Non-essential dashboard modules not tied to booking flow

## Launch Gate (Definition of Done)
MVP is launch-ready when all of these are true:
- Vendors can onboard and publish listings without manual engineering help
- Customers can make or request bookings from live listings
- Booking records persist correctly in database
- Booking status changes are visible to both sides in dashboards
- Required deposit collection is functioning for target booking scenarios
- Vendor and customer can communicate in-app around bookings only after booking is made
- Platform fees are being applied correctly in transaction flow
- Customers receive email confirmation of their booking

## Week-1 Critical Checklist
- End-to-end booking flow functional
- Deposit logic enforced in the intended flow
- Database booking writes verified
- Vendor dashboard reflects booking lifecycle correctly

## Final 3 to 5 Days Checklist
- Disable or remove unstable features
- Run launch smoke tests
- Deploy production version
- Manually onboard 3 to 5 real vendors
