export type TourStep = {
  title: string;
  body: string;
  primaryBtn?: string;
  nextUp?: { label: string; href: string };
  highlightSelector?: string;
};

export type PageTour = {
  steps: TourStep[];
  overlay?: boolean;
  allowClose?: boolean;
};

// A single one-time onboarding tour shown on the vendor's first dashboard visit.
// It stays on the dashboard (no cross-page navigation) and walks through what each
// area does, highlighting elements that are present on the dashboard. Completion is
// recorded server-side (vendor_accounts.dashboard_tour_completed_at) so it shows
// once per account and never again. See VendorShell.
//
// NOTE: This consolidates the previous per-page tour copy. Final copy/visual polish
// is a /web-design + product follow-up — this is the functional baseline.
export const ONBOARDING_TOUR: PageTour = {
  allowClose: true,
  steps: [
    {
      title: "Welcome to Your Vendor Workspace",
      body: "This is your home base. Everything you need to run your event services business is here. Let's take a quick walk through what's available so you can hit the ground running.",
    },
    {
      title: "Get Paid with Stripe",
      body: "EventHub processes payments through Stripe. Once you connect your Stripe account, your earnings are paid out automatically on a rolling schedule after each booking is complete.",
      highlightSelector: "[data-testid='section-stripe-setup']",
    },
    {
      title: "Connect Your Calendar",
      body: "Every booking a customer makes appears on the Google Calendar you connect here. Edits you make on Google Calendar sync automatically back to EventHub.",
      highlightSelector: "[data-testid='section-google-calendar']",
    },
    {
      title: "Manage Your Bookings",
      body: "Every booking a customer makes with you lives here — the date, the customer, and the status of each, all in one place.",
      highlightSelector: "[data-testid='link-vendor-bookings']",
    },
    {
      title: "Your Service Listings",
      body: "Listings are the services you offer. Each has its own title, description, photos, price, and availability. Customers book specific listings, not just your profile.",
      highlightSelector: "[data-testid='link-vendor-listings']",
    },
    {
      title: "Messages, Payments & More",
      body: "Once a customer books you, you can message them directly. Your payments, discount codes, reviews, and notifications each have their own section in the sidebar — explore them any time.",
      highlightSelector: "[data-testid='link-vendor-messages']",
    },
    {
      title: "You're All Set",
      body: "That's the tour. Complete your profile and connect Stripe to start taking bookings. You can find everything again from the sidebar whenever you need it.",
      primaryBtn: "Got it — let's go",
    },
  ],
};
