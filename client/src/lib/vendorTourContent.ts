export type TourStep = {
  title: string;
  body: string;
  primaryBtn?: string;
  nextUp?: { label: string; href: string };
  highlightSelector?: string;
};

export type PageTour = {
  steps: TourStep[];
};

export const VENDOR_TOURS: Record<string, PageTour> = {
  "my-hub": {
    steps: [
      {
        title: "Welcome to Your Vendor Dashboard",
        body: "This is your home base. Everything you need to run your event services business is here. Let's walk you through what's available so you can hit the ground running.",
      },
      {
        title: "Your Public Shop Page",
        body: "My Hub is your public-facing shop page. Customers browsing EventHub will land here to see your listings, read your reviews, and book you. Think of it as your storefront.",
        highlightSelector: "[data-testid='link-vendor-myHub']",
      },
      {
        title: "Your Profile and Listings",
        body: "Your business name, description, and photos appear here. Once you create listings, they'll show up on this page. A complete profile builds trust and converts more browsers into bookings.",
      },
      {
        title: "Reviews Build Your Reputation",
        body: "After each completed booking, customers can leave a review. Reviews appear right on your Hub page. Strong reviews are the fastest way to grow your bookings on EventHub.",
      },
      {
        title: "You're All Set",
        body: "Now let's get your listings in front of customers. Head to your Dashboard to see an overview of your account, or jump straight to Listings to create your first service.",
        nextUp: { label: "Go to Dashboard", href: "/vendor/dashboard" },
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
        title: "Bookings and Revenue",
        body: "At a glance you can see how many bookings you have coming up, how much you've earned, and whether any bookings need your attention.",
      },
      {
        title: "Stripe Payouts",
        body: "EventHub processes payments through Stripe. Once you connect your Stripe account, your earnings are paid out automatically on a rolling schedule.",
        highlightSelector: "[data-testid='link-vendor-payments']",
      },
      {
        title: "Keep Your Profile Complete",
        body: "Listings with complete profiles, good photos, and clear descriptions rank higher in search results. Use the Dashboard to spot anything missing from your account.",
        nextUp: { label: "Go to Listings", href: "/vendor/listings" },
      },
    ],
  },

  bookings: {
    steps: [
      {
        title: "Manage Your Bookings",
        body: "Every booking a customer makes with you appears here. You can see the date, the customer, and the status of each booking in one place.",
        highlightSelector: "[data-testid='link-vendor-bookings']",
      },
      {
        title: "Booking Statuses",
        body: "Bookings move through statuses: Pending, Confirmed, Completed, and Cancelled. Keep an eye on pending bookings so customers aren't left waiting.",
        nextUp: { label: "Go to Listings", href: "/vendor/listings" },
      },
    ],
  },

  listings: {
    steps: [
      {
        title: "Your Service Listings",
        body: "Listings are the services you offer on EventHub. Each listing has its own title, description, photos, price, and availability. Customers book specific listings, not just your profile.",
        highlightSelector: "[data-testid='link-vendor-listings']",
      },
      {
        title: "Create Your First Listing",
        body: "Hit \"New Listing\" to get started. Add a clear title, describe exactly what's included, and upload at least one photo. Listings with photos get significantly more views.",
        nextUp: { label: "Go to Messages", href: "/vendor/messages" },
      },
    ],
  },

  messages: {
    steps: [
      {
        title: "Messages",
        body: "Once a customer books you, they can message you directly through EventHub. All your customer conversations are here, organized by booking.",
        highlightSelector: "[data-testid='link-vendor-messages']",
      },
      {
        title: "Respond Quickly",
        body: "Fast response times improve your standing on the platform and lead to better reviews. You'll get a notification badge on the sidebar when you have unread messages.",
        nextUp: { label: "Go to Payments", href: "/vendor/payments" },
      },
    ],
  },

  payments: {
    steps: [
      {
        title: "Payments and Payouts",
        body: "This page shows your earnings history and payout schedule. EventHub collects payment from customers at checkout and pays you out through Stripe after the booking is complete.",
        highlightSelector: "[data-testid='link-vendor-payments']",
      },
      {
        title: "Connect Stripe to Get Paid",
        body: "If you haven't connected your Stripe account yet, do it now. You won't receive payouts until Stripe is connected. The setup only takes a few minutes.",
        nextUp: { label: "Go to Discounts", href: "/vendor/discounts" },
      },
    ],
  },

  discounts: {
    steps: [
      {
        title: "Discount Codes",
        body: "You can create discount codes for your listings. Share them with returning customers, at events, or on social media to drive bookings.",
        highlightSelector: "[data-testid='link-vendor-discounts']",
      },
      {
        title: "Set Limits and Expiry",
        body: "Each discount can have a percentage or flat amount off, a usage limit, and an expiry date. Discounts are a great way to fill slow periods or reward loyal customers.",
        nextUp: { label: "Go to Reviews", href: "/vendor/reviews" },
      },
    ],
  },

  reviews: {
    steps: [
      {
        title: "Customer Reviews",
        body: "After a booking is completed, customers can leave a review. All your reviews are collected here. Reviews appear publicly on your My Hub page.",
        highlightSelector: "[data-testid='link-vendor-reviews']",
      },
      {
        title: "Reviews Drive Bookings",
        body: "A strong review average is one of the most powerful signals for new customers. Deliver a great experience and ask happy customers to leave a review.",
        nextUp: { label: "Go to Notifications", href: "/vendor/notifications" },
      },
    ],
  },

  notifications: {
    steps: [
      {
        title: "Notifications",
        body: "You'll be notified here about new bookings, messages, reviews, and payout updates. Stay on top of your account so nothing slips through the cracks.",
        highlightSelector: "[data-testid='link-vendor-notifications']",
        nextUp: { label: "Go to Disputes", href: "/vendor/disputes" },
      },
    ],
  },

  disputes: {
    steps: [
      {
        title: "Disputes",
        body: "If a customer opens a dispute about a booking, it appears here. Disputes are rare when communication is clear and services are delivered as described.",
        highlightSelector: "[data-testid='link-vendor-disputes']",
      },
      {
        title: "Resolve Quickly",
        body: "EventHub reviews disputes and may involve both parties. Respond promptly and professionally. Most disputes are resolved without escalation.",
        nextUp: { label: "Back to My Hub", href: "/vendor/my-hub" },
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

export function hasTourBeenSeen(key: string): boolean {
  return window.localStorage.getItem(`eh:tour:${key}`) === "1";
}

export function markTourSeen(key: string): void {
  window.localStorage.setItem(`eh:tour:${key}`, "1");
}
