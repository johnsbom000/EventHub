# Event Hub - Event Vendor Marketplace

## Overview
Event Hub is an event vendor marketplace connecting customers with professional event vendors (venues, catering, photography, DJ, florists, prop rentals, etc.). The platform aims to streamline event planning by enabling customers to search, browse, and book vendors, while providing vendors with a platform to offer their services. It features an Airbnb-inspired design with emerald green branding and supports three user roles: customers, vendors, and administrators. The core purpose is to simplify vendor discovery and booking, enhance event planning efficiency, and provide a curated marketplace experience with significant market potential in the event planning industry.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology**: React 18+ with TypeScript, bundled by Vite.
- **UI/UX**: Utilizes shadcn/ui components (based on Radix UI) and Tailwind CSS.
  - **Design System**: Mint green primary color (#9EDBC0), Playfair Display for headings, Inter for body text, responsive design. Dark mode included.
  - **Interaction**: Custom `hover-elevate` and `active-elevate-2` utility classes.
- **State Management**: TanStack Query for server state, React hooks for local UI state.
- **Form Handling**: React Hook Form with Zod validation.
- **Routing**: Lightweight client-side routing using Wouter, with role-specific paths.

### Backend
- **Technology**: Node.js Express server using ES modules.
- **API**: RESTful API endpoints with Zod schema validation.
- **Data Layer**: Abstracted storage interface for flexible storage implementations.
- **Error Handling**: Centralized, typed error handling.

### Data Storage
- **Database**: PostgreSQL via Neon serverless.
- **ORM**: Drizzle ORM for type-safe database interactions.
- **Schema Design**: Tables for `users`, `events`, `vendors`, `vendor_accounts`, `bookings`, `payment_schedules`, `payments`, `messages`, `notifications`, `review_replies`. Uses PostgreSQL enums for type safety.
- **Migrations**: Drizzle Kit manages schema changes.
- **Type Safety**: Drizzle-zod integration for end-to-end type consistency.

### Authentication & Authorization
- **Roles**: Customer, Vendor, and Admin roles with role-based access control.
- **Authentication**: Separate JWT-based authentication systems for customers and vendors (bcrypt password hashing). Tokens stored in localStorage.
- **Unified Signup Flow**: Allows users to sign up as a customer or initiate vendor onboarding.

### Key Features
- **Hero Search Bar**: Prominent search with dynamic category filtering, auto-closing date picker, filter persistence via URL parameters, and smart navigation to `/browse` page.
- **Multi-Step Event Planning Intake**: Comprehensive questionnaire system (`/planner`) for collecting event details, offering paths for direct vendor browsing or curated recommendations.
- **Intelligent Vendor Ranking & Recommendation System**: 4-dimension weighted scoring algorithm (Availability, Budget, Service Match, Location) with labels like "Best match" and "Budget friendly". Presents recommendations in a Netflix-style UI.
- **Vendor Portal**:
  - **Authentication**: Vendor signup, login, and JWT-based authentication with smart login redirect based on onboarding status.
  - **6-Step Onboarding Wizard**: Comprehensive vendor profile creation flow (`/vendor/onboarding`) with sidebar progress tracking:
    - **Step 1 - Service Type**: Grid selection of 9 service categories (catering, hair-styling, makeup, DJ, nails, florist, photography, videography, prop-rental)
    - **Step 2 - About You**: Business info with new video introduction field, social media links
    - **Step 3 - Location**: City, state, service radius with geolocation support
    - **Step 4 - Portfolio**: Image upload with cover image selection
    - **Step 5 - Service Description**: Service headline and detailed description
    - **Step 6 - Completion**: Choice to create listing immediately or visit dashboard
  - **Entry Points**: New vendor signup → onboarding wizard; Customer "Become a Vendor" → onboarding wizard
  - **Dashboard UI**: Complete dashboard with sidebar navigation, stats cards, onboarding status, and quick actions.
  - **Feature Pages (UI Complete)**: Bookings, Listings (create/edit/delete, publish draft functionality), Messages, Calendar, Payments, Reviews, Notifications.

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
  - **Account Types**: Supports Express and Standard.
  - **Onboarding Flow**: Automated Stripe Connect account creation and onboarding.
  - **Payment Intent Creation**: Creates payment intents with platform fee and vendor destination.
  - **Payment Schedules**: Supports down payment + final payment with custom strategies.
  - **Refund Policy**: 48-hour refund window enforced for deposits.
  - **Vendor Dashboard Access**: Login links to Stripe Dashboard for vendors.