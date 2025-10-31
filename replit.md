# Event Hub - Event Vendor Marketplace

## Overview

Event Hub is an event vendor marketplace platform that connects customers planning events with professional vendors. The application features an Airbnb-inspired design with emerald green branding, enabling customers to search, browse, and book event vendors across multiple categories (venues, catering, photography, DJ, florists, prop rentals, etc.). The platform supports three user roles: customers who plan events, vendors who offer services, and administrators who manage vendor approvals.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**React SPA with Vite**: The client is built as a single-page application using React 18+ with TypeScript, bundled via Vite for fast development and optimized production builds.

**Routing Strategy**: Uses Wouter for lightweight client-side routing. All routes are defined in `client/src/App.tsx` with role-specific paths for customers, vendors, and admins.

**UI Component System**: Built on shadcn/ui components with Radix UI primitives, providing accessible and customizable components. The design system uses Tailwind CSS with custom theme variables defined in `client/src/index.css` following the "new-york" style from shadcn.

**State Management**: Uses TanStack Query (React Query) for server state management with optimistic updates. Local UI state is managed with React hooks. Query client configuration in `client/src/lib/queryClient.ts` includes custom error handling and credential inclusion for authentication.

**Design System**: 
- Primary color: Emerald green (#10B981)
- Typography: Nunito Sans for body text, Playfair Display for headlines
- Spacing uses Tailwind units (2, 4, 6, 8, 12, 16, 20, 24, 32)
- Responsive breakpoints following Tailwind defaults
- Custom elevation system with `hover-elevate` and `active-elevate-2` utility classes

**Form Handling**: Uses React Hook Form with Zod validation via `@hookform/resolvers`. Schema definitions are shared between client and server from `shared/schema.ts`.

### Backend Architecture

**Express Server**: Node.js server built with Express, using ES modules (type: "module"). Server entry point at `server/index.ts` handles API routes and serves the Vite-built frontend in production.

**API Structure**: RESTful API endpoints prefixed with `/api`. Current implementation includes event management endpoints (`/api/events`) with CRUD operations. Routes are registered in `server/routes.ts`.

**Data Layer Abstraction**: Storage interface (`IStorage`) defined in `server/storage.ts` allows switching between in-memory storage (current: `MemStorage`) and database implementations without changing application logic. This follows the repository pattern.

**Request Logging**: Custom middleware logs all API requests with timing, method, path, status code, and response preview (truncated to 80 characters).

**Error Handling**: Centralized error handling with typed error responses. Validation errors return 400, not found returns 404, server errors return 500.

### Data Storage

**Database**: PostgreSQL via Neon serverless (@neondatabase/serverless), configured for websocket connections using the `ws` library for compatibility with serverless environments.

**ORM**: Drizzle ORM for type-safe database queries. Schema definitions in `shared/schema.ts` are shared between client and server, ensuring type consistency across the stack.

**Schema Design**:
- `users` table: Basic authentication with username/password
- `events` table: Stores event planning data with embedded JSON fields for vendor-specific requirements (photographer, videographer, florist, catering, DJ, prop/decor details)
- Vendor-specific details use typed schemas (e.g., `photographerDetailsSchema`) validated with Zod

**Migrations**: Drizzle Kit manages migrations with output to `./migrations` directory. Schema changes are pushed using `npm run db:push`.

**Type Safety**: Drizzle-zod integration generates Zod schemas from Drizzle table definitions, creating `InsertEvent`, `Event`, `InsertUser`, `User` types that are used across the application.

### Authentication & Authorization

**Session Management**: Placeholder for session-based authentication. Infrastructure suggests future implementation using `connect-pg-simple` for PostgreSQL session storage (already in dependencies).

**Role-Based Access**: Three user roles planned (customer, vendor, admin) with role-specific dashboards and routing logic in Navigation component. Current implementation has role checks but no active authentication.

**Protected Routes**: Conditional navigation based on login state and user role, with vendor prompts for unauthenticated users trying to access vendor features.

## External Dependencies

### Third-Party UI Libraries

- **Radix UI**: Comprehensive set of unstyled, accessible UI primitives (accordion, alert-dialog, avatar, checkbox, dialog, dropdown-menu, popover, select, tabs, toast, tooltip, etc.)
- **shadcn/ui**: Component library configuration ("new-york" style) building on Radix UI
- **Tailwind CSS**: Utility-first CSS framework with custom theme configuration
- **Embla Carousel**: Carousel/slider functionality for vendor recommendations
- **Lucide React**: Icon library used throughout the application

### Data & State Management

- **TanStack Query v5**: Server state management, caching, and data fetching
- **React Hook Form**: Form state management and validation
- **Zod**: Schema validation and TypeScript type inference
- **Drizzle-Zod**: Bridges Drizzle ORM schemas with Zod validators

### Database & Storage

- **Neon Serverless PostgreSQL**: Cloud-hosted PostgreSQL database
- **Drizzle ORM**: Type-safe SQL query builder and ORM
- **connect-pg-simple**: PostgreSQL session store for Express (dependency present, not yet implemented)

### Build Tools & Development

- **Vite**: Frontend build tool and dev server with HMR
- **TypeScript**: Type safety across the entire stack
- **esbuild**: Server-side bundling for production builds
- **Replit Plugins**: Runtime error modal, cartographer, and dev banner for Replit environment

### Routing & HTTP

- **Wouter**: Lightweight client-side routing (~1KB)
- **Express**: Web server framework for API and static file serving

### Utilities

- **clsx**: Utility for constructing className strings
- **class-variance-authority**: Type-safe variant styling (used in component variants)
- **date-fns**: Date manipulation and formatting
- **nanoid**: Unique ID generation

### Payment Processing

**Stripe**: Payment infrastructure planned for vendor deposit collection (mentioned in attached requirements but not yet implemented in codebase).

### Future Integrations

Based on attached requirements and component placeholders:
- **Google Maps API**: Location autocomplete for event and vendor location inputs
- **Geolocation API**: Browser-based location detection for smart vendor recommendations
- **Email Service**: Notification system for bookings and payments (mentioned but not implemented)
- **File Upload Service**: Vendor media uploads and customer inspiration boards