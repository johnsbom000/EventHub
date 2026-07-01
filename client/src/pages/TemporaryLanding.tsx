import { useEffect, useState, type ReactNode } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import BrandWordmark from "@/components/BrandWordmark";
import AuthModal from "@/components/AuthModal";

type AuthTab = "login" | "signup";
type SignupRole = "vendor" | "customer";

const VENDOR_INTENT_RETURN_TO = "/vendor/provision";
const SUPPORT_EMAIL = "support@eventhubglobal.com";
const SUPPORT_PHONE = "801-410-0092";

// All imagery + copy below is illustrative sample content for the public
// marketing page. It never reflects real vendors, listings, bookings, or users;
// the actual product lives behind authentication.
const FAKE_LISTINGS = [
  { title: "Bouncy Castle Rental",          price: "$350",   photo: "https://images.unsplash.com/photo-1633846802535-75fafbcf9043?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { title: "Luxury Floral Wood Arch",       price: "$1,200", photo: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=530&fit=crop",  aspect: "4/5"  },
  { title: "Wedding DJ & Sound Package",    price: "$950",   photo: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&h=280&fit=crop",  aspect: "10/7" },
  { title: "Rustic Barn Venue Rental",      price: "$3,200", photo: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400&h=560&fit=crop",  aspect: "5/7"  },
  { title: "Cotton Candy Machine Rental",   price: "$180",   photo: "https://images.unsplash.com/photo-1759974166601-0801712345ae?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { title: "Mobile Beverage & Bar Service", price: "$720",   photo: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=500&fit=crop",  aspect: "4/5"  },
  { title: "Tables & Chairs + Decor",       price: "$450",   photo: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=400&h=480&fit=crop",  aspect: "5/6"  },
  { title: "Edison String Light Canopy",    price: "$380",   photo: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { title: "Wine Barrel Rental",            price: "$220",   photo: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=420&fit=crop", aspect: "20/21"},
];

/* ---------------------------------------------------------------------------
   Small shared primitives
--------------------------------------------------------------------------- */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 font-sans text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-[#e07a6a]">
      {children}
    </p>
  );
}

// Signals to visitors (and reviewers) that a UI panel is an illustrative
// preview rather than a live screen.
function SampleTag() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f0e8] px-2.5 py-1 font-sans text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#9aacb4]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#e07a6a]" />
      Sample preview
    </span>
  );
}

function PrimaryButton({ onClick, children, className = "" }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] bg-[#2a3a42] px-6 py-3 font-sans text-[1.05rem] font-semibold text-white transition-colors hover:bg-[#3a4f59] ${className}`}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, className = "" }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] border-[1.5px] border-[rgba(74,106,125,0.3)] bg-white px-6 py-3 font-sans text-[1.05rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb] ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Illustrative mock UIs (non-interactive: aria-hidden, pointer-events-none)
--------------------------------------------------------------------------- */

function MockShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none select-none overflow-hidden rounded-[18px] border border-[rgba(74,106,125,0.16)] bg-white shadow-[0_24px_60px_rgba(74,106,125,0.16)] ${className}`}
    >
      {children}
    </div>
  );
}

function DashboardMock() {
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">Vendor dashboard</span>
        <SampleTag />
      </div>
      <div className="grid grid-cols-3 gap-3 p-5">
        {[
          { label: "This month", value: "$4,820" },
          { label: "Bookings", value: "12" },
          { label: "Response rate", value: "98%" },
        ].map((s) => (
          <div key={s.label} className="rounded-[12px] bg-[#f5f0e8] px-3 py-3">
            <p className="font-sans text-[0.72rem] uppercase tracking-wide text-[#9aacb4]">{s.label}</p>
            <p className="mt-1 font-heading text-[1.55rem] text-[#2a3a42]">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="px-5 pb-5">
        <div className="flex items-end gap-2.5">
          {[42, 58, 35, 70, 64, 88, 76].map((h, i) => (
            <div key={i} className="flex-1 rounded-t-[5px] bg-[#9dd4cc]" style={{ height: `${h}px` }} />
          ))}
        </div>
        <p className="mt-3 font-sans text-[0.8rem] text-[#9aacb4]">Earnings · last 7 weeks</p>
      </div>
    </MockShell>
  );
}

function ListingsMock() {
  const items = [FAKE_LISTINGS[1], FAKE_LISTINGS[2], FAKE_LISTINGS[6]];
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">My listings</span>
        <span className="rounded-[8px] bg-[#2a3a42] px-3 py-1.5 font-sans text-[0.78rem] font-semibold text-white">+ New listing</span>
      </div>
      <div className="grid grid-cols-3 gap-3 p-5">
        {items.map((l) => (
          <div key={l.title} className="overflow-hidden rounded-[12px] border border-[rgba(74,106,125,0.12)]">
            <img src={l.photo} alt="" loading="lazy" className="block h-20 w-full object-cover" />
            <div className="px-2.5 py-2">
              <p className="font-heading text-[0.85rem] leading-tight text-[#2a3a42]">{l.title}</p>
              <p className="mt-1 font-heading text-[0.9rem] font-bold text-[#e07a6a]">{l.price}</p>
            </div>
          </div>
        ))}
      </div>
    </MockShell>
  );
}

function BookingsMock() {
  const rows = [
    { name: "Garden wedding · 120 guests", date: "Sat, Jul 12", status: "Confirmed", tone: "bg-[#dff0ec] text-[#2f7a6b]" },
    { name: "Corporate gala · downtown", date: "Fri, Jul 25", status: "Pending", tone: "bg-[#fdeee9] text-[#c4654f]" },
    { name: "Birthday party · backyard", date: "Sun, Aug 03", status: "Confirmed", tone: "bg-[#dff0ec] text-[#2f7a6b]" },
  ];
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">Upcoming bookings</span>
        <SampleTag />
      </div>
      <div className="divide-y divide-[rgba(74,106,125,0.1)]">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div>
              <p className="font-sans text-[0.95rem] font-medium text-[#2a3a42]">{r.name}</p>
              <p className="font-sans text-[0.8rem] text-[#9aacb4]">{r.date}</p>
            </div>
            <span className={`rounded-full px-3 py-1 font-sans text-[0.72rem] font-semibold ${r.tone}`}>{r.status}</span>
          </div>
        ))}
      </div>
    </MockShell>
  );
}

function PayoutsMock() {
  const payouts = [
    { label: "Photo Booth + Props", amount: "+ $427.50" },
    { label: "Floral Wood Arch", amount: "+ $1,140.00" },
    { label: "DJ & Sound Package", amount: "+ $902.50" },
  ];
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">Payouts</span>
        <SampleTag />
      </div>
      <div className="px-5 py-4">
        <p className="font-sans text-[0.72rem] uppercase tracking-wide text-[#9aacb4]">Available balance</p>
        <p className="mt-1 font-heading text-[2rem] text-[#2a3a42]">$2,470.00</p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#f5f0e8] px-3 py-1 font-sans text-[0.72rem] font-medium text-[#4a6a7d]">
          Secured by Stripe
        </div>
      </div>
      <div className="divide-y divide-[rgba(74,106,125,0.1)] border-t border-[rgba(74,106,125,0.1)]">
        {payouts.map((p) => (
          <div key={p.label} className="flex items-center justify-between px-5 py-3">
            <span className="font-sans text-[0.92rem] text-[#2a3a42]">{p.label}</span>
            <span className="font-sans text-[0.92rem] font-semibold text-[#2f7a6b]">{p.amount}</span>
          </div>
        ))}
      </div>
    </MockShell>
  );
}

function ChatMock() {
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">Messages · Emma R.</span>
        <SampleTag />
      </div>
      <div className="space-y-3 px-5 py-5">
        <div className="max-w-[80%] rounded-[14px] rounded-tl-[4px] bg-[#f0f4f7] px-4 py-2.5">
          <p className="font-sans text-[0.92rem] text-[#2a3a42]">Just booked the photo booth for July 12th! The event will be on the 2nd floor</p>
        </div>
        <div className="ml-auto max-w-[80%] rounded-[14px] rounded-tr-[4px] bg-[#2a3a42] px-4 py-2.5">
          <p className="font-sans text-[0.92rem] text-white">Great, we'll arrive at 2pm to set up. Will someone be there to show us where to put the booth?</p>
        </div>
        <div className="max-w-[80%] rounded-[14px] rounded-tl-[4px] bg-[#f0f4f7] px-4 py-2.5">
          <p className="font-sans text-[0.92rem] text-[#2a3a42]">Yes, I'll make sure someone is there to coordinate. Thank you!</p>
        </div>
      </div>
    </MockShell>
  );
}

/* ---------------------------------------------------------------------------
   Feature row (alternating mock + copy)
--------------------------------------------------------------------------- */

function FeatureRow({
  eyebrow,
  title,
  body,
  bullets,
  visual,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? "lg:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="font-heading text-[2rem] font-light leading-[1.15] text-[#2a3a42] lg:text-[2.4rem]">{title}</h3>
        <p className="mt-4 font-sans text-[1.1rem] leading-[1.6] text-[#4a6a7d]">{body}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 font-sans text-[1rem] text-[#2a3a42]">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e07a6a]" />
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "lg:order-1" : ""}>{visual}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Customer preview (illustrative search + showcase grid)
--------------------------------------------------------------------------- */

function CustomerPreview() {
  const columns: (typeof FAKE_LISTINGS)[] = [[], [], [], [], []];
  const [bouncyCastle, luxuryArch, weddingDJ, rusticBarn, cottonCandy, beverage, tablesChairs, edisonLights, wineBarrel] = FAKE_LISTINGS;
  columns[0].push(bouncyCastle, beverage);
  columns[1].push(luxuryArch, tablesChairs);
  columns[2].push(weddingDJ, edisonLights);
  columns[3].push(rusticBarn);
  columns[4].push(cottonCandy, wineBarrel);

  return (
    <div>
      <div
        aria-hidden="true"
        className="pointer-events-none mx-auto mb-10 w-full max-w-[920px] rounded-[14px] border-[1.5px] border-[rgba(74,106,125,0.2)] bg-white p-2.5 shadow-[0_12px_40px_rgba(74,106,125,0.12)]"
      >
        <div className="grid grid-cols-1 gap-0 md:grid-cols-[3fr_1.7fr_1.25fr_1.1fr_1.3fr]">
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">Any city</div>
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">Wedding, Party…</div>
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">Select date</div>
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">Rentals</div>
          <div className="flex items-center justify-center px-3 py-2">
            <div className="editorial-search-btn flex h-[44px] w-full items-center justify-center rounded-lg font-sans text-[1rem] font-semibold">Search</div>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none flex gap-4">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-1 flex-col gap-4">
            {col.map((l) => (
              <div key={l.title} className="w-full overflow-hidden rounded-[12px] bg-white shadow-[0_4px_24px_rgba(74,106,125,0.10)]">
                <img src={l.photo} alt="" loading="lazy" className="block w-full object-cover" style={{ aspectRatio: l.aspect }} />
                <div className="flex items-start justify-between gap-2 px-2.5 py-2.5">
                  <span className="font-heading text-[1.05rem] leading-snug text-[#2a3a42]">{l.title}</span>
                  <span className="shrink-0 font-heading text-[1.1rem] font-bold text-[#e07a6a]">{l.price}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Vendor signup dialog (Google / email; preserves vendor-intent funnel)
--------------------------------------------------------------------------- */

function RoleChoiceButton({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 flex w-full flex-col items-center gap-1 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white px-4 py-4 transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
    >
      <span className="font-sans text-[1.15rem] font-semibold text-[#2a3a42]">{title}</span>
      <span className="font-sans text-[0.92rem] font-normal text-[#9aacb4]">{subtitle}</span>
    </button>
  );
}

function SignupDialog({
  open,
  onOpenChange,
  initialRole,
  onStart,
  onLoginInstead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRole: SignupRole | null;
  onStart: (role: SignupRole, method: "google" | "email") => void;
  onLoginInstead: () => void;
}) {
  const [role, setRole] = useState<SignupRole | null>(initialRole);

  // Sync the starting step each time the dialog opens: a generic "Get started"
  // opens on the role-choice step (initialRole = null); a "Get started as a
  // vendor" CTA jumps straight to the vendor sign-up methods.
  useEffect(() => {
    if (open) setRole(initialRole);
  }, [open, initialRole]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] p-0">
        <div className="relative px-9 pb-9 pt-10 text-center">
          {role !== null && initialRole === null && (
            <button
              type="button"
              onClick={() => setRole(null)}
              className="absolute left-5 top-5 flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[0.95rem] text-[#4a6a7d] hover:bg-[#f0f4f7]"
            >
              ← Back
            </button>
          )}

          <BrandWordmark
            className="mb-6 text-[2.4rem] leading-none"
            eventClassName="text-[#e07a6a] font-normal italic"
            hubClassName="text-[#4a6a7d] font-normal"
          />

          {role === null ? (
            <>
              <h2 className="font-heading text-[2rem] font-normal leading-[1.15] text-[#2a3a42]">How do you want to use EventHub?</h2>
              <p className="mt-2 mb-7 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">Choose how you'd like to get started.</p>

              <RoleChoiceButton
                title="List my services"
                subtitle="Create a vendor account"
                onClick={() => setRole("vendor")}
              />
              <RoleChoiceButton
                title="Book event vendors"
                subtitle="Create a customer account"
                onClick={() => setRole("customer")}
              />
            </>
          ) : (
            <>
              <h2 className="font-heading text-[2rem] font-normal leading-[1.15] text-[#2a3a42]">
                {role === "vendor" ? "Create your vendor account" : "Create your customer account"}
              </h2>
              <p className="mt-2 mb-7 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">
                {role === "vendor"
                  ? "Sign up to start listing your services on EventHub."
                  : "Sign up to discover and book vendors for your event."}
              </p>

              <button
                type="button"
                onClick={() => onStart(role, "google")}
                className="mb-3 flex w-full items-center justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white py-3.5 font-sans text-[1.05rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center font-bold text-[#4285F4]">G</span>
                Continue with Google
              </button>

              <div className="my-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
                <span className="font-sans text-[0.85rem] font-medium text-[#7c8095]">or</span>
                <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
              </div>

              <button
                type="button"
                onClick={() => onStart(role, "email")}
                className="mb-4 w-full rounded-[14px] bg-[#2a3a42] py-3.5 font-sans text-[1.1rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
              >
                Continue with email
              </button>

              <p className="mb-4 font-sans text-[0.85rem] leading-[1.4] text-[#6e7590]">
                By signing up you agree to our{" "}
                <a href="/terms" className="text-[#4a6a7d] hover:underline">Terms</a> &amp;{" "}
                <a href="/privacy" className="text-[#4a6a7d] hover:underline">Privacy Policy</a>
              </p>
            </>
          )}

          <p className="font-sans text-[0.92rem] text-[#9aacb4]">
            Already have an account?{" "}
            <button type="button" onClick={onLoginInstead} className="font-semibold text-[#4a6a7d] hover:underline">
              Log in
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Pro free-trial promo modal (auto-opens after a delay on the landing page)
--------------------------------------------------------------------------- */

const PRO_TRIAL_FEATURES = [
  "Unlimited active listings",
  "AI reply assistant for messages",
  "Discounts & promo codes",
  "Reputation Management",
  "Advanced analytics & booking trends",
  "Google Calendar sync",
];

function ProTrialModal({
  open,
  onOpenChange,
  onStart,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onStart: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md overflow-hidden border-0 p-0"
        data-testid="pro-trial-modal"
      >
        {/* Header banner */}
        <div className="deal-outline bg-[#2a3a42] px-8 pb-8 pt-9 text-center text-[#f5f0e8]" style={{ ["--ring" as any]: "2px" }}>
          <span className="inline-block rounded-full bg-[rgba(224,122,106,0.18)] px-3 py-1 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#e07a6a]">
            Limited-time offer
          </span>
          <h2 className="mt-4 font-heading text-[2rem] font-light leading-[1.1]">
            Try <span className="italic text-[#e07a6a]">Pro</span> for{" "}
            <span className="font-normal">30 days free</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xs font-sans text-[0.98rem] leading-[1.55] text-[rgba(245,240,232,0.8)]">
            Get everything you need to run your event business, on us for a full
            month. No booking fees, cancel anytime.
          </p>
          <div className="mt-5 flex items-baseline justify-center gap-2">
            <span className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.8)]">Then:</span>
            <span className="font-sans text-[1.15rem] font-medium text-[rgba(245,240,232,0.45)] line-through">
              $39/mo
            </span>
            <span className="font-heading text-[2.2rem] font-normal leading-none text-[#e07a6a]">
              $29
            </span>
            <span className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.8)]">/month</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 pb-8 pt-6">
          <ul className="space-y-2.5">
            {PRO_TRIAL_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5 font-sans text-[0.98rem] text-[#2a3a42]">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[rgba(74,106,125,0.12)] text-[#4a6a7d]">
                  ✓
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onStart}
            className="deal-fill mt-6 w-full rounded-[12px] border-0 px-6 py-3.5 font-sans text-[1.05rem] font-semibold text-[#f5f0e8] transition-opacity hover:opacity-95"
            data-testid="pro-trial-modal-start"
          >
            Try Pro for 30 days free →
          </button>
          <p className="mt-3 text-center font-sans text-[0.85rem] text-[#9aacb4]">
            Cancel anytime, no commitment.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Page
--------------------------------------------------------------------------- */

export default function TemporaryLanding() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) localStorage.setItem("eventhub:pending-referral", ref.trim().toUpperCase());
    if (ref) {
      const clean = new URLSearchParams(params);
      clean.delete("ref");
      const qs = clean.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const [signupOpen, setSignupOpen] = useState(false);
  const [signupRole, setSignupRole] = useState<SignupRole | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<AuthTab>("login");
  const [proTrialOpen, setProTrialOpen] = useState(false);
  const { loginWithRedirect } = useAuth0();
  const { toast } = useToast();

  // Auto-surface the "Try Pro for 30 days free" promo 5s after landing — once
  // per browser session so returning/scrolling visitors aren't nagged.
  useEffect(() => {
    if (sessionStorage.getItem("eh:pro-trial-promo-seen")) return;
    const timer = window.setTimeout(() => {
      setProTrialOpen(true);
      sessionStorage.setItem("eh:pro-trial-promo-seen", "1");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, []);

  // role = null opens the dialog on the "vendor or customer?" choice step;
  // a role pre-selects it and jumps straight to the sign-up methods.
  const openSignup = (role: SignupRole | null = null) => {
    setSignupRole(role);
    setSignupOpen(true);
  };
  const openLogin = () => {
    setAuthModalTab("login");
    setAuthModalOpen(true);
  };

  const startSignup = async (role: SignupRole, method: "google" | "email") => {
    // Vendor sign-ups carry the vendor-intent flag and land on /vendor/provision;
    // customer sign-ups go through /post-login, which routes them to /dashboard.
    if (role === "vendor") sessionStorage.setItem("eh:after-auth-intent", "vendor");
    else sessionStorage.removeItem("eh:after-auth-intent");

    const authorizationParams: Record<string, string> = { screen_hint: "signup" };
    if (method === "google") {
      authorizationParams.connection = "google-oauth2";
      authorizationParams.prompt = "select_account";
    }

    try {
      await loginWithRedirect({
        authorizationParams,
        appState: { returnTo: role === "vendor" ? VENDOR_INTENT_RETURN_TO : "/post-login" },
      });
    } catch (err: any) {
      if (role === "vendor") sessionStorage.removeItem("eh:after-auth-intent");
      toast({
        title: "Sign up failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky bar + header pinned together so they never overlap */}
      <div className="sticky top-0 z-40">
        {/* Launch-deal announcement bar (always shown) */}
        <div className="deal-outline relative bg-[#2a3a42] text-[#f5f0e8]" style={{ ["--ring" as any]: "2px" }}>
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2 text-center lg:px-10">
            <span className="font-sans text-[0.92rem] leading-tight">
              <span className="font-semibold">EventHub Pro</span>
              <span className="mx-1.5 font-semibold text-[#e07a6a]">$29/mo</span>
              <span className="text-[rgba(245,240,232,0.55)] line-through">$39</span>
              <span className="mx-1.5 text-[rgba(245,240,232,0.4)]">·</span>
              <span className="text-[rgba(245,240,232,0.85)]">No booking fees, ever.</span>
            </span>
            <button
              type="button"
              onClick={() => openSignup("vendor")}
              className="rounded-full bg-[#e07a6a] px-3.5 py-1 font-sans text-[0.85rem] font-semibold text-white transition-colors hover:bg-[#c96959]"
            >
              Start free →
            </button>
          </div>
        </div>

        {/* Header */}
        <header className="border-b border-[rgba(74,106,125,0.1)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-3 lg:px-10">
            <BrandWordmark
              className="text-[1.9rem] leading-none tracking-tight lg:text-[2.2rem]"
              eventClassName="text-[#e07a6a] font-normal"
              hubClassName="text-[#4a6a7d] font-normal"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openLogin}
                className="rounded-[10px] px-4 py-2 font-sans text-[0.98rem] font-semibold text-[#2a3a42] transition-colors hover:bg-[#f0f4f7]"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => openSignup()}
                className="rounded-[10px] bg-[#2a3a42] px-4 py-2 font-sans text-[0.98rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
              >
                Get started
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Hero */}
      <section className="border-b border-[rgba(74,106,125,0.08)] bg-gradient-to-b from-[#f8fafb] to-white">
        <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-24">
          <div>
            <Eyebrow>For event vendors</Eyebrow>
            <h1 className="font-heading text-[clamp(2.6rem,6vw,4rem)] font-light leading-[1.05] text-[#2a3a42]">
              Run your event business, <em className="italic text-[#e07a6a]">all in one place.</em>
            </h1>
            <p className="mt-6 max-w-xl font-sans text-[1.2rem] leading-[1.6] text-[#4a6a7d]">
              EventHub is the marketplace where event vendors list their services, manage bookings,
              message customers, and get paid securely, without spreadsheets, scattered DMs, or chasing invoices.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <PrimaryButton onClick={() => openSignup("vendor")} className="!px-7 !py-3.5 !text-[1.1rem]">Get started as a vendor</PrimaryButton>
              <GhostButton onClick={openLogin} className="!px-7 !py-3.5 !text-[1.1rem]">Log in</GhostButton>
            </div>
            <p className="mt-5 font-sans text-[0.95rem] text-[#9aacb4]">Free to list · Secure payouts via Stripe · Cancel anytime</p>
          </div>
          <div className="lg:pl-6">
            <DashboardMock />
          </div>
        </div>
      </section>

      {/* Vendor experience */}
      <section className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Eyebrow>The vendor experience</Eyebrow>
          <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">
            Everything you need to grow your event business
          </h2>
          <p className="mt-4 font-sans text-[1.15rem] leading-[1.6] text-[#4a6a7d]">
            From your first listing to your next payout, EventHub gives you the tools to run a professional event business.
          </p>
        </div>

        <div className="space-y-24">
          <FeatureRow
            eyebrow="Listings"
            title="Create and showcase your services"
            body="Build beautiful listings with photos, pricing, and availability in minutes. Your storefront is ready to take bookings the moment you publish."
            bullets={["Rich photo galleries and descriptions", "Flexible pricing and packages", "Your own shareable vendor page"]}
            visual={<ListingsMock />}
          />
          <FeatureRow
            reverse
            eyebrow="Bookings"
            title="Manage every booking and date"
            body="See requests, confirmations, and your calendar in one place. EventHub blocks double-bookings automatically so you never get caught out."
            bullets={["Accept or decline requests in a tap", "Automatic double-booking protection", "A clear view of what's coming up"]}
            visual={<BookingsMock />}
          />
          <FeatureRow
            eyebrow="Payments"
            title="Get paid securely, on time"
            body="Customers pay through EventHub and funds are paid out to your bank via Stripe. No invoices to chase, no awkward money conversations."
            bullets={["Secure checkout powered by Stripe", "Automatic payouts to your bank", "Track earnings and payout history"]}
            visual={<PayoutsMock />}
          />
          <FeatureRow
            reverse
            eyebrow="Messaging"
            title="Nail down the details in one inbox"
            body="Customers book straight from your listing, so messaging is where you sort out the specifics afterward, like setup times, special requests, and logistics, all tied to the booking."
            bullets={["In-app chat tied to every booking", "Clarify setup, timing, and special requests", "Notifications so you never miss a message"]}
            visual={<ChatMock />}
          />
        </div>
      </section>

      {/* Customer experience */}
      <section className="border-y border-[rgba(74,106,125,0.08)] bg-[#f8fafb]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10 lg:py-28">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <Eyebrow>The customer experience</Eyebrow>
            <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">
              And customers love the other side
            </h2>
            <p className="mt-4 font-sans text-[1.15rem] leading-[1.6] text-[#4a6a7d]">
              Hosts discover trusted vendors, compare options, and book everything for their event in one place,
              which means more qualified bookings landing in your inbox.
            </p>
          </div>
          <CustomerPreview />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10 lg:py-24">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">Live in three steps</h2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { n: "1", t: "List your services", d: "Create your vendor profile and publish your first listing in minutes." },
            { n: "2", t: "Get booked", d: "Customers find you, message you, and request bookings on your dates." },
            { n: "3", t: "Get paid", d: "Take secure payments and receive automatic payouts via Stripe." },
          ].map((s) => (
            <div key={s.n} className="rounded-[18px] border border-[rgba(74,106,125,0.12)] bg-white p-8 text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#f5f0e8] font-heading text-[1.4rem] text-[#e07a6a]">
                {s.n}
              </div>
              <h3 className="font-heading text-[1.5rem] font-normal text-[#2a3a42]">{s.t}</h3>
              <p className="mt-3 font-sans text-[1.02rem] leading-[1.55] text-[#4a6a7d]">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-[#2a3a42]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 text-center lg:px-10">
          <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-white lg:text-[3.2rem]">
            Ready to grow your event business?
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-[1.15rem] leading-[1.6] text-[rgba(245,240,232,0.8)]">
            Join EventHub and start taking bookings for your services today.
          </p>
          {/* Launch-deal panel with the moving palette outline */}
          <div
            className="deal-outline mx-auto mt-10 max-w-2xl rounded-2xl bg-[rgba(245,240,232,0.04)] p-8 text-left lg:p-10"
            style={{ ["--ring" as any]: "2.5px" }}
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#e07a6a] px-2.5 py-0.5 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white">
                Launch offer
              </span>
            </div>
            <h3 className="mt-4 font-heading text-[1.9rem] font-light leading-tight text-white">
              Go Pro at our launch price.
            </h3>
            <p className="mt-3 font-sans text-[1.05rem] leading-[1.6] text-[rgba(245,240,232,0.82)]">
              <span className="text-[rgba(245,240,232,0.5)] line-through">$39/mo</span>
              <span className="font-semibold text-white"> $29/mo</span>, or{" "}
              <span className="font-semibold text-white">$290/year</span>{" "}
              <span className="text-[rgba(245,240,232,0.5)] line-through">$390</span>
              <span className="text-[rgba(245,240,232,0.7)]"> + 2 months free.</span>
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#e07a6a]">✓</span> Keep 100% of every booking — we never take a cut
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#9dd4cc]">✓</span> Unlimited listings + advanced analytics
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#c9a06a]">✓</span> AI reply assistant for customer messages
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#e07a6a]">✓</span> Discounts &amp; promo codes to drive bookings
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#9dd4cc]">✓</span> Reputation management &amp; review replies
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#c9a06a]">✓</span> Google Calendar sync — never double-book
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#e07a6a]">✓</span> 30 days free, cancel anytime
              </li>
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => openSignup("vendor")}
                className="rounded-[12px] bg-[#e07a6a] px-8 py-4 font-sans text-[1.1rem] font-semibold text-white transition-colors hover:bg-[#c96959]"
              >
                Start your 30-day free trial — $29/mo
              </button>
              <button
                type="button"
                onClick={openLogin}
                className="rounded-[12px] border-[1.5px] border-[rgba(245,240,232,0.4)] px-8 py-4 font-sans text-[1.1rem] font-semibold text-[#f5f0e8] transition-colors hover:bg-[rgba(245,240,232,0.08)]"
              >
                Log in
              </button>
            </div>
            <p className="mt-4 font-sans text-[0.9rem] text-[rgba(245,240,232,0.6)]">
              No booking fees · Secure payouts via Stripe · Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#4a6a7d]">
        <div className="mx-auto max-w-[1320px] px-5 py-14 lg:px-10">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="col-span-1 md:col-span-2">
              <BrandWordmark
                className="mb-4 text-[2.4rem]"
                eventClassName="text-[#f5f0e8] font-normal"
                hubClassName="text-[#9dd4cc] font-normal"
              />
              <p className="max-w-md font-sans text-[1.02rem] leading-[1.6] text-[rgba(245,240,232,0.85)]">
                The all-in-one platform for event vendors to list services, manage bookings, and get paid.
                It's also where hosts find and book the perfect vendors for any event.
              </p>
            </div>

            <div>
              <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">Company</h3>
              <ul className="space-y-2.5">
                <li><a href="/terms" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">Terms of Service</a></li>
                <li><a href="/privacy" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">Privacy Policy</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">Contact &amp; support</h3>
              <ul className="space-y-2.5">
                <li>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <a href={`tel:${SUPPORT_PHONE.replace(/[^0-9]/g, "")}`} className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">
                    {SUPPORT_PHONE}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[rgba(245,240,232,0.16)] pt-8 sm:flex-row">
            <p className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.45)]">
              © {new Date().getFullYear()} EventHub. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a href="/terms" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">Terms</a>
              <a href="/privacy" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">Privacy</a>
            </div>
          </div>
        </div>
      </footer>

      <SignupDialog
        open={signupOpen}
        onOpenChange={setSignupOpen}
        initialRole={signupRole}
        onStart={startSignup}
        onLoginInstead={() => {
          setSignupOpen(false);
          openLogin();
        }}
      />

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultTab={authModalTab}
        returnTo="/post-login"
      />

      <ProTrialModal
        open={proTrialOpen}
        onOpenChange={setProTrialOpen}
        onStart={() => {
          setProTrialOpen(false);
          openSignup("vendor");
        }}
      />
    </div>
  );
}
