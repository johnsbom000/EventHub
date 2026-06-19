export type TourStep = {
  title: string;
  body: string;
  // Pathname this step is shown on. The tour navigates here when advancing to
  // this step, so a step always renders on the page it describes.
  page: string;
  primaryBtn?: string;
  highlightSelector?: string;
};

export type PageTour = {
  steps: TourStep[];
  overlay?: boolean;
  allowClose?: boolean;
};

// A single one-time onboarding tour shown on the vendor's first dashboard visit.
// It walks across the real vendor pages — the bookings step happens on the
// bookings page, the listings step on the listings page, and so on — so each
// step is shown in the context it describes. Progress is persisted in
// localStorage (see vendorTourProgress) so it survives the per-page VendorShell
// remounts, and completion is recorded server-side
// (vendor_accounts.dashboard_tour_completed_at) so it shows once per account and
// never again. See VendorShell.
//
// NOTE: Copy/visual polish is a /web-design + product follow-up — this is the
// functional baseline.
export const DASHBOARD_PATH = "/vendor/dashboard";
export const BOOKINGS_PATH = "/vendor/bookings";
export const LISTINGS_PATH = "/vendor/listings";
export const MESSAGES_PATH = "/vendor/messages";

export const ONBOARDING_TOUR: PageTour = {
  allowClose: true,
  steps: [
    {
      title: "Welcome to Your Vendor Workspace",
      body: "This is your home base. Everything you need to run your event services business is here. Let's take a quick walk through what's available so you can hit the ground running.",
      page: DASHBOARD_PATH,
    },
    {
      title: "Get Paid with Stripe",
      body: "EventHub processes payments through Stripe. Once you connect your Stripe account, your earnings are paid out automatically on a rolling schedule after each booking is complete.",
      page: DASHBOARD_PATH,
      highlightSelector: "[data-testid='section-stripe-setup']",
    },
    {
      title: "Connect Your Calendar",
      body: "Every booking a customer makes appears on the Google Calendar you connect here. Edits you make on Google Calendar sync automatically back to EventHub.",
      page: DASHBOARD_PATH,
      highlightSelector: "[data-testid='section-google-calendar']",
    },
    {
      title: "Manage Your Bookings",
      body: "This is your bookings page. Every booking a customer makes with you lives here — the date, the customer, and the status of each, all in one place.",
      page: BOOKINGS_PATH,
    },
    {
      title: "Your Service Listings",
      body: "This is your listings page. Listings are the services you offer — each has its own title, description, photos, price, and availability. Customers book specific listings, not just your profile.",
      page: LISTINGS_PATH,
    },
    {
      title: "Message Your Customers",
      body: "This is your messages page. Once a customer books you, you can message them directly here. Your payments, discount codes, reviews, and notifications each have their own section in the sidebar — explore them any time.",
      page: MESSAGES_PATH,
    },
    {
      title: "You're All Set",
      body: "That's the tour. Complete your profile and connect Stripe to start taking bookings. You can find everything again from the sidebar whenever you need it.",
      page: DASHBOARD_PATH,
      primaryBtn: "Got it — let's go",
    },
  ],
};
