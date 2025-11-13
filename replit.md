# Event Hub - Event Vendor Marketplace

## Overview
Event Hub is an event vendor marketplace designed to connect customers with professional event vendors (venues, catering, photography, DJ, florists, prop rentals, etc.). The platform features an Airbnb-inspired design with emerald green branding and supports three user roles: customers, vendors, and administrators. Its core purpose is to streamline event planning by enabling customers to search, browse, and book vendors, while providing vendors with a platform to offer their services. The platform aims to simplify vendor discovery and booking, enhance event planning efficiency, and provide a curated marketplace experience.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology**: React 18+ with TypeScript, bundled by Vite.
- **Routing**: Lightweight client-side routing using Wouter, with role-specific paths.
- **UI/UX**: Utilizes shadcn/ui components (based on Radix UI) and Tailwind CSS.
  - **Design System**: Mint green primary color (#9EDBC0), Inter font for all typography, responsive design following Tailwind defaults.
    - **Colors**: Primary #9EDBC0 (mint), text-primary #222222, text-secondary #717171, background #FFFFFF, surface #F7F7F7, border #E0E0E0
    - **Typography**: Inter font family (16px body, 14px subtext), replaces previous Nunito Sans/Playfair Display
    - **Component Styling**: Buttons use rounded-lg (10px corners), Cards use rounded-xl (12px corners) with shadow-md
    - **Dark Mode**: Darker mint variant (HSL 153 46% 58%) with appropriate contrast for all surfaces and text
  - **Interaction**: Custom `hover-elevate` and `active-elevate-2` utility classes for consistent hover/active states.
- **State Management**: TanStack Query for server state (with optimistic updates), React hooks for local UI state.
- **Form Handling**: React Hook Form with Zod validation, sharing schemas with the backend for type safety.

### Backend
- **Technology**: Node.js Express server using ES modules.
- **API**: RESTful API endpoints (`/api/events`, `/api/vendors`) with Zod schema validation for all routes.
- **Data Layer**: Abstracted storage interface (`IStorage`) allowing flexible storage implementations (currently in-memory, designed for future database integration).
- **Error Handling**: Centralized, typed error handling for consistent responses.

### Data Storage
- **Database**: PostgreSQL via Neon serverless, utilizing `ws` for serverless compatibility.
- **ORM**: Drizzle ORM for type-safe database interactions.
- **Schema Design**:
  - `users`: Customer authentication (basic).
  - `events`: Comprehensive event details with vendor-specific requirements as JSONB fields.
  - `vendors`: Vendor profiles with matching/scoring details, packages, add-ons, reviews, availability.
  - `vendor_accounts`: Separate vendor authentication with Stripe Connect integration.
  - `bookings`: Customer bookings with payment tracking, status management, and platform fees.
  - `payment_schedules`: Tracks deposit and final payment installments per booking.
  - `payments`: Transaction records with Stripe payment intent IDs and platform fees.
  - `messages`: Per-booking chat between customers and vendors.
  - `notifications`: System notifications for vendors and customers.
  - `review_replies`: Vendor responses to customer reviews.
- **Enums**: PostgreSQL enums for type safety (booking_status, payment_status, payment_type, notification_type).
- **Migrations**: Drizzle Kit manages schema changes via `npm run db:push`.
- **Type Safety**: Drizzle-zod integration generates Zod schemas from Drizzle table definitions for end-to-end type consistency.

### Authentication & Authorization
- **Roles**: Supports Customer, Vendor, and Admin roles with role-based access control.
- **Vendor Authentication**: Separate authentication system from customers using bcrypt password hashing and JWT tokens.
  - Routes: `/api/vendor/signup`, `/api/vendor/login`, `/api/vendor/me` (protected)
  - JWT tokens stored in localStorage and attached to all vendor API requests via Authorization header.
- **Customer Authentication**: To be implemented (currently using session-based auth placeholder).
- **Password Security**: Bcrypt with 10 salt rounds for secure password hashing.

### Key Features

- **Hero Search Bar**: Prominent search component on homepage enabling customers to quickly find vendors.
  - **Dynamic Category Filtering**: Vendor categories populate automatically from database via `/api/vendors/meta/categories` endpoint.
  - **Auto-Closing Date Picker**: Date input automatically closes after selection for improved UX.
  - **Filter Persistence**: Selected filters (location, event type, date, vendor categories) persist through navigation via URL parameters.
  - **Smart Navigation**: Search button constructs query params and navigates to `/browse` page with filters applied.
  - Database categories currently include: Catering, DJ, Florist, Photography, Props, Venues, Videography.

- **Multi-Step Event Planning Intake**: A comprehensive questionnaire system (`/planner`) for collecting event details and vendor-specific requirements.
  - Offers "Browse Vendors" path for direct filtering or "Curated List" path for personalized recommendations based on detailed questionnaires (e.g., photographer, catering, DJ requirements).
  - Implemented with React Hook Form, Zod validation, conditional rendering, and comprehensive data-testid attributes for E2E testing.

- **Intelligent Vendor Ranking & Recommendation System**:
  - A 4-dimension weighted scoring algorithm (`server/vendorScoring.ts`) to rank vendors based on customer needs:
    1.  **Availability Score (35%)**: Checks vendor availability for event dates.
    2.  **Budget Score (25%)**: Matches vendor pricing against customer budget.
    3.  **Service Match Score (20%)**: Compares vendor service offerings to customer requirements.
    4.  **Location Score (20%)**: Evaluates vendor proximity and service area.
  - **Label Assignment**: Assigns labels like "Best match," "Budget friendly," and "Popular choice" to top vendors.
  - **Curated Recommendations UI**: Presents recommendations in a Netflix-style layout with horizontal scrolling vendor cards per category, displaying key details, badges, and action buttons.

- **Vendor Portal** (Complete Framework):
  - **Authentication**: Vendor signup, login, and JWT-based authentication (separate from customer auth). Smart login redirect based on onboarding completion status.
  - **Onboarding**: Stripe Connect integration with Express/Standard account options. "Skip for now" option redirects to dashboard.
  - **Dashboard UI**: Complete dashboard with sidebar navigation, stats cards (bookings, revenue, profile views), onboarding status banner, and quick actions.
  - **Sidebar Navigation**: shadcn-based sidebar with 8 main sections: Dashboard, Bookings, Listings, Messages, Calendar, Payments, Reviews, Notifications.
  - **Feature Pages** (UI Complete, Data Integration Pending):
    - **Bookings**: Table view with tabs (all, upcoming, pending, completed, cancelled), booking details, customer info, and action buttons.
    - **Listings**: Create/edit/delete listings, toggle active/inactive, manage pricing/packages/add-ons, preview functionality.
    - **Messages**: Unified inbox with per-booking chat, attachment support, read indicators.
    - **Calendar**: Month/week views, bookings display, date blocking functionality.
    - **Payments**: Payment history table, CSV export, Stripe dashboard link, platform fee tracking.
    - **Reviews**: View ratings/comments, reply functionality, average rating stats, response rate tracking.
    - **Notifications**: Recent alerts, notification preferences with toggles for bookings/messages/reschedules/cancellations/payments.
  - **Backend Routes**: Auth (signup/login/me), Stripe Connect (onboard/status/dashboard), vendor operations (stats/bookings/messages/payments/reviews) - placeholder implementations ready for data integration.
  - **Next Steps**: Implement actual database queries for vendor-specific data retrieval, create vendor profile during onboarding to link vendor_accounts to vendors table.

## External Dependencies

### Third-Party UI Libraries
- **Radix UI**: Unstyled, accessible UI primitives.
- **shadcn/ui**: Configured component library atop Radix UI.
- **Tailwind CSS**: Utility-first CSS framework.
- **Embla Carousel**: Carousel/slider functionality.
- **Lucide React**: Icon library.

### Data & State Management
- **TanStack Query v5**: Server state management.
- **React Hook Form**: Form management.
- **Zod**: Schema validation.
- **Drizzle-Zod**: Drizzle ORM to Zod schema integration.

### Database & Storage
- **Neon Serverless PostgreSQL**: Cloud database.
- **Drizzle ORM**: Type-safe SQL query builder.
- **connect-pg-simple**: PostgreSQL session store (planned).

### Build Tools & Development
- **Vite**: Frontend build tool.
- **TypeScript**: Language.
- **esbuild**: Server-side bundling.

### Routing & HTTP
- **Wouter**: Lightweight client-side router.
- **Express**: Backend web server framework.

### Utilities
- **clsx**: className string utility.
- **class-variance-authority**: Type-safe variant styling.
- **date-fns**: Date manipulation.
- **nanoid**: Unique ID generation.

### Payment Processing  
- **Stripe Connect Marketplace**: Fully implemented for vendor payments with 15% platform fee.
  - **Account Types**: Supports both Express (simplified onboarding) and Standard (link existing account).
  - **Onboarding Flow**: Automated Stripe Connect account creation and onboarding links.
  - **Payment Intent Creation**: Creates payment intents with platform fee (15%) and vendor destination.
  - **Payment Schedules**: Down payment + final payment with custom strategies (immediately, 2 weeks prior, day of event).
  - **Refund Policy**: 48-hour refund window enforced for deposits.
  - **Vendor Dashboard Access**: Login links to Stripe Dashboard for vendors to manage their accounts.
  - **Routes**: 
    - `/api/vendor/connect/onboard` - Create Stripe Connect account
    - `/api/vendor/connect/status` - Check onboarding completion
    - `/api/vendor/connect/dashboard` - Get dashboard login link
    - `/api/bookings` - Create booking with payment schedules
    - `/api/bookings/:id/payments/:scheduleId` - Process payment
    - `/api/bookings/:id/refund` - Request refund

### Future Integrations
- **Google Maps API**: Location autocomplete.
- **Geolocation API**: Browser-based location detection.
- **Email Service**: Notifications.
- **File Upload Service**: Media uploads.