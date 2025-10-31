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
  - **Design System**: Emerald green primary color (#10B981), Nunito Sans for body text, Playfair Display for headlines, and responsive design following Tailwind defaults.
  - **Interaction**: Custom `hover-elevate` and `active-elevate-2` utility classes.
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
  - `users`: Basic authentication.
  - `events`: Stores comprehensive event details, including vendor-specific requirements as JSONB fields (e.g., `photographerDetails`, `cateringDetails`).
  - `vendors`: Stores vendor profiles with details for matching and scoring (e.g., category, location, pricing, availability, service offerings).
- **Migrations**: Drizzle Kit manages schema changes.
- **Type Safety**: Drizzle-zod integration generates Zod schemas from Drizzle table definitions for end-to-end type consistency.

### Authentication & Authorization
- **Roles**: Supports Customer, Vendor, and Admin roles with planned role-based access control.
- **Session Management**: Designed for session-based authentication using `connect-pg-simple` (dependency present).

### Key Features

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
- **Stripe**: Planned for vendor deposit collection.

### Future Integrations
- **Google Maps API**: Location autocomplete.
- **Geolocation API**: Browser-based location detection.
- **Email Service**: Notifications.
- **File Upload Service**: Media uploads.