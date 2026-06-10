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
};

export const VENDOR_TOURS: Record<string, PageTour> = {
  "my-hub": {
    overlay: true,
    steps: [
      {
        title: "Welcome to Your Vendor Workspace",
        body: "This is your home base. Everything you need to run your event services business is here. Let's walk you through what's available so you can hit the ground running.",
        nextUp: { label: "Next", href: "/vendor/dashboard" },
      },
    ],
  },

  dashboard: {
    steps: [
      {
        title: "Your Dashboard Overview",
        body: "This page gives you a snapshot of how your business is doing: revenue, upcoming bookings, and account health all in one place.",
        highlightSelector: "[data-testid='link-vendor-dashboard']",
      },
      {
        title: "Stripe Payouts",
        body: "EventHub processes payments through Stripe. Once you connect your Stripe account, your earnings are paid out automatically on a rolling schedule.",
        highlightSelector: "[data-testid='button-complete-setup']",
      },
      {
        title: "Connect Your Calendar",
        body: "Every booking a customer makes will appear on the Google Calendar you connect here. Making edits to events on the Google Calendar will automatically update on EventHub.",
        highlightSelector: "[data-testid='section-google-calendar']",
        nextUp: { label: "Next", href: "/vendor/bookings" },
      },
    ],
  },

  bookings: {
    steps: [
      {
        title: "Manage Your Bookings",
        body: "Every booking a customer makes with you appears here. You can see the date, the customer, and the status of each booking in one place.",
        highlightSelector: "[data-testid='link-vendor-bookings']",
        nextUp: { label: "Next", href: "/vendor/listings" },
      },
    ],
  },

  listings: {
    steps: [
      {
        title: "Your Service Listings",
        body: "Listings are the services you offer on EventHub. Each listing has its own title, description, photos, price, and availability. Customers book specific listings, not just your profile.",
        highlightSelector: "[data-testid='link-vendor-listings']",
        nextUp: { label: "Next", href: "/vendor/messages" },
      },
    ],
  },

  messages: {
    steps: [
      {
        title: "Messages",
        body: "Once a customer books you, they can message you directly through EventHub. All your customer conversations are here, organized by booking.",
        highlightSelector: "[data-testid='link-vendor-messages']",
        nextUp: { label: "Next", href: "/vendor/payments" },
      },
    ],
  },

  payments: {
    steps: [
      {
        title: "Payments and Payouts",
        body: "This page shows your earnings history and payout schedule. EventHub collects payment from customers at checkout and pays you out through Stripe after the booking is complete.",
        highlightSelector: "[data-testid='link-vendor-payments']",
        nextUp: { label: "Next", href: "/vendor/discounts" },
      },
    ],
  },

  discounts: {
    steps: [
      {
        title: "Discount Codes",
        body: "You can create discount codes for your listings. Share them with returning customers, at events, or on social media to drive bookings.",
        highlightSelector: "[data-testid='link-vendor-discounts']",
        nextUp: { label: "Next", href: "/vendor/reviews" },
      },
    ],
  },

  reviews: {
    steps: [
      {
        title: "Customer Reviews",
        body: "After a booking is completed, customers can leave a review. All your reviews are collected here. Reviews appear publicly on your My Hub page.",
        highlightSelector: "[data-testid='link-vendor-reviews']",
        nextUp: { label: "Next", href: "/vendor/notifications" },
      },
    ],
  },

  notifications: {
    steps: [
      {
        title: "Notifications",
        body: "You'll be notified here about new bookings, messages, reviews, and payout updates. Stay on top of your account so nothing slips through the cracks.",
        highlightSelector: "[data-testid='link-vendor-notifications']",
        nextUp: { label: "Next", href: "/vendor/disputes" },
      },
    ],
  },

  disputes: {
    steps: [
      {
        title: "Disputes",
        body: "When you or a customer open a dispute about a booking, it appears here. Disputes are rare when communication is clear and services are delivered as described. Disputes are reviewed and resolved by the support team.",
        highlightSelector: "[data-testid='link-vendor-disputes']",
      },
    ],
  },
};

const PATH_TO_TOUR_KEY: [string, string][] = [
  ["/vendor/shop", "my-hub"],
  ["/vendor/my-hub", "my-hub"],
  ["/my-hub", "my-hub"],
  ["/vendor/dashboard", "dashboard"],
  ["/vendor/bookings", "bookings"],
  ["/vendor/listings", "listings"],
  ["/vendor/messages", "messages"],
  ["/vendor/payments", "payments"],
  ["/vendor/discounts", "discounts"],
  ["/vendor/reviews", "reviews"],
  ["/vendor/notifications", "notifications"],
  ["/vendor/disputes", "disputes"],
];

export function getTourKey(pathname: string): string | null {
  const path = pathname.split("?")[0].split("#")[0];
  for (const [prefix, key] of PATH_TO_TOUR_KEY) {
    if (path === prefix || path.startsWith(prefix + "/")) return key;
  }
  return null;
}

export function hasTourBeenSeen(key: string, accountId?: string | null): boolean {
  const prefix = accountId ? `${accountId}:` : "";
  return window.localStorage.getItem(`eh:tour:${prefix}${key}`) === "1";
}

export function markTourSeen(key: string, accountId?: string | null): void {
  const prefix = accountId ? `${accountId}:` : "";
  window.localStorage.setItem(`eh:tour:${prefix}${key}`, "1");
}
