# Event Hub Design Guidelines

## Design Approach: Reference-Based (Marketplace Experience)

Drawing inspiration from successful event and service marketplaces (Airbnb, Eventbrite, Thumbtack), this design prioritizes visual discovery, trust-building, and seamless booking experiences.

**Brand Identity:**
- Company Name: Event Hub
- Primary Color: Emerald Green (HSL: 160 84% 39%)
- Design Philosophy: Airbnb-inspired minimal aesthetic with generous whitespace

**Core Principles:**
- Visual-first discovery to inspire and engage
- Clear trust signals throughout the experience
- Effortless navigation between browsing and booking
- Role-specific interfaces that feel purposeful

---

## Typography System

**Font Families:**
- Primary: Inter or DM Sans (modern, clean, excellent at all sizes)
- Accent: Playfair Display or Lora (for hero headlines and emotional moments)

**Hierarchy:**
- Hero Headline: 3xl to 6xl, accent font, font-semibold
- Section Headers: 2xl to 4xl, primary font, font-bold
- Card Titles: lg to xl, font-semibold
- Body Text: base, font-normal, leading-relaxed
- Captions/Meta: sm to xs, font-medium

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, 16, 20, 24, 32**

**Consistent Application:**
- Component padding: p-4 to p-6 (mobile), p-6 to p-8 (desktop)
- Section spacing: py-12 to py-16 (mobile), py-20 to py-32 (desktop)
- Card gaps: gap-4 to gap-6 (mobile), gap-6 to gap-8 (desktop)
- Container padding: px-4 (mobile), px-6 to px-8 (desktop)

**Container Strategy:**
- Max-width: max-w-7xl for main content areas
- Full-width sections with nested max-w-7xl containers
- Form containers: max-w-md for auth, max-w-2xl for booking

---

## Component Library

### Navigation
**Top Navigation Bar:**
- Sticky positioning with subtle shadow on scroll
- Logo left-aligned, h-8 to h-10
- Primary nav links center or right-aligned, flex gap-8
- "Become a Vendor" as outlined button
- "Login/Sign up" as solid button
- Mobile: Hamburger menu, full-screen overlay navigation

### Landing Page (5-7 Sections)

**1. Hero Section (80-90vh):**
- Large background image showing vibrant event scene (wedding, corporate event, or party)
- Center-aligned content with generous vertical spacing
- Headline: accent font, 4xl to 6xl
- Subheadline: 1-2 sentence value proposition, lg to xl
- Primary CTA: "Find Your Perfect Vendor" (large, prominent)
- Secondary CTA: "Browse by Category" (outlined)
- Search bar component with location + event type dropdowns
- Buttons with backdrop-blur-md background over hero image

**2. Featured Categories (2-column md, 4-column lg):**
- Grid of category cards with images
- Each card: Image overlay with gradient, icon, category name
- Hover: Slight scale and shadow increase
- Categories: Venues, Catering, Photography, Entertainment, Planning, Decor

**3. How It Works (3-column layout):**
- Step-by-step process visualization
- Icon/number → Title → Description format
- Steps: "Browse & Compare" → "Connect & Book" → "Celebrate Your Event"

**4. Featured Vendors (3-column lg, 2-column md, 1-column mobile):**
- Vendor cards with square image (aspect-ratio-1)
- Vendor name, category badge, rating stars, location
- Starting price indicator
- "View Profile" link
- Card hover: Shadow and border accent

**5. Trust Section:**
- 4-column stats display (responsive to 2-col)
- Large numbers with descriptive labels
- Examples: "10,000+ Events Planned", "500+ Trusted Vendors", "4.9★ Average Rating", "100% Satisfaction"

**6. Testimonials (2-column layout):**
- Customer testimonial cards with photo
- Quote text, customer name, event type
- Authentic photos showing real events

**7. CTA Section:**
- Centered content, py-24
- Compelling headline and supporting text
- Dual CTAs: "Sign Up Free" (primary) + "Explore Vendors" (secondary)

### Vendor Browsing Page

**Filter Sidebar (desktop) / Drawer (mobile):**
- Category checkboxes with counts
- Location filter with autocomplete
- Price range slider
- Rating filter
- Availability calendar picker
- "Apply Filters" sticky button at bottom

**Main Content Area:**
- Breadcrumb navigation
- Sort dropdown (Price, Rating, Popularity)
- Grid of vendor cards: 3-column lg, 2-column md
- Pagination or infinite scroll
- "No results" state with illustration and filter reset option

### Vendor Profile Page

**Hero Banner:**
- Large cover image (aspect-ratio-21/9)
- Profile photo overlapping banner (absolute positioning)
- Vendor name, category, location, rating

**Two-Column Layout:**
- **Left Column (wider, 2/3):**
  - About section with full description
  - Photo gallery grid (masonry or 3-column)
  - Services/packages with pricing cards
  - Reviews section with filtering
  
- **Right Column (sticky, 1/3):**
  - Quick info card (response time, availability)
  - Pricing starting at display
  - "Request Quote" prominent button
  - "Message Vendor" secondary button
  - Contact information
  - Share buttons

### Authentication Pages

**Layout:**
- Centered card (max-w-md)
- Logo at top
- Form with generous spacing (gap-6)
- Social login options (if applicable)
- Link to switch between login/signup
- Background: Subtle pattern or gradient

**Form Elements:**
- Labels: font-medium, mb-2
- Inputs: p-3, rounded-lg, border with focus ring
- Buttons: Full-width, py-3, font-semibold
- Error messages: text-sm below inputs

### Dashboard Layouts (Vendor & Admin)

**Structure:**
- Left sidebar navigation (fixed, 240-280px wide)
- Main content area with top bar
- Top bar: Page title, user menu, notifications icon

**Sidebar:**
- Logo/brand at top
- Navigation items with icons
- Active state with background accent
- Logout at bottom

**Main Content:**
- Page header with title and action buttons
- Content cards with rounded corners, shadow-sm
- Data tables with hover rows
- Empty states with illustrations and CTAs

### Booking Flow

**Multi-step wizard:**
- Progress indicator at top (step 1 of 4)
- Each step in centered card (max-w-2xl)
- "Back" and "Continue" navigation
- Summary sidebar showing selection (sticky on desktop)
- Final confirmation with all details review

---

## Form Components

**Input Fields:**
- Consistent height: h-12
- Padding: px-4
- Border radius: rounded-lg
- Focus state: ring-2 offset-0
- Labels always above inputs, font-medium

**Buttons:**
- Primary: Solid background, px-6 py-3, rounded-lg, font-semibold
- Secondary: Outlined, same sizing
- Sizes: Small (px-4 py-2), Medium (px-6 py-3), Large (px-8 py-4)

**Cards:**
- Rounded: rounded-xl
- Shadow: shadow-sm default, shadow-md on hover
- Padding: p-6
- Borders: Optional subtle border for definition

---

## Images

**Hero Image:**
- Large, high-quality image showing joyful event scene
- Professional photography with people celebrating
- Good lighting and vibrant atmosphere

**Vendor Cards:**
- Square portfolio images (1:1 aspect ratio)
- Showcase their best work
- Professional, well-composed shots

**Category Cards:**
- Lifestyle images representing each category
- Warm, inviting, aspirational

**Profile Pages:**
- Cover image: Wide panoramic shot of vendor's work
- Gallery: Mix of detail shots and wide angles
- Authentic, professional photography throughout

---

## Responsive Behavior

**Breakpoints:**
- Mobile: < 768px (single column, stacked navigation)
- Tablet: 768px - 1024px (2-column grids)
- Desktop: > 1024px (3-4 column grids, sidebars visible)

**Navigation:**
- Mobile: Hamburger → full-screen menu
- Desktop: Horizontal nav with all links visible

**Grids:**
- Always start mobile-first with single column
- Scale to 2-col md, 3-col lg, 4-col xl where appropriate