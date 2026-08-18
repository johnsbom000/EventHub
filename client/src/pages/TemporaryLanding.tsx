import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation, Trans } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import BrandWordmark from "@/components/BrandWordmark";
import AuthModal from "@/components/AuthModal";
import { trackBoth } from "@/lib/tracking";
import { initEngagement } from "@/lib/engagement";
import VendorHubStill from "@/pages/landing/VendorHubStill";
import { CustomerBullets } from "@/pages/landing/primitives";
import HowItWorks from "@/pages/landing/HowItWorks";
import { Reveal } from "@/pages/landing/motion";

type AuthTab = "login" | "signup";
type SignupRole = "vendor" | "customer";

const VENDOR_INTENT_RETURN_TO = "/vendor/provision";
const SUPPORT_EMAIL = "support@eventhubglobal.com";
const SUPPORT_PHONE = "801-410-0092";
const FAQ_KEYS = ["q1", "q2", "q3"] as const;

// All imagery + copy below is illustrative sample content for the public
// marketing page. It never reflects real vendors, listings, bookings, or users;
// the actual product lives behind authentication. Titles are resolved through
// the landing.sampleListings.* locale keys at render time.
const FAKE_LISTINGS = [
  { titleKey: "bouncyCastle", price: "$350",   photo: "https://images.unsplash.com/photo-1633846802535-75fafbcf9043?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { titleKey: "luxuryArch",   price: "$1,200", photo: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=530&fit=crop",  aspect: "4/5"  },
  { titleKey: "weddingDj",    price: "$950",   photo: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&h=280&fit=crop",  aspect: "10/7" },
  { titleKey: "rusticBarn",   price: "$3,200", photo: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400&h=560&fit=crop",  aspect: "5/7"  },
  { titleKey: "cottonCandy",  price: "$180",   photo: "https://images.unsplash.com/photo-1759974166601-0801712345ae?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { titleKey: "beverageBar",  price: "$720",   photo: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=500&fit=crop",  aspect: "4/5"  },
  { titleKey: "tablesChairs", price: "$450",   photo: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=400&h=480&fit=crop",  aspect: "5/6"  },
  { titleKey: "edisonLights", price: "$380",   photo: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { titleKey: "wineBarrel",   price: "$220",   photo: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=420&fit=crop", aspect: "20/21"},
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
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f0e8] px-2.5 py-1 font-sans text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#9aacb4]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#e07a6a]" />
      {t("landing.sampleTag")}
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
  const { t } = useTranslation();
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">{t("landing.mockDashboard.title")}</span>
        <SampleTag />
      </div>
      <div className="grid grid-cols-3 gap-3 p-5">
        {[
          { label: t("landing.mockDashboard.thisMonth"), value: "$4,820" },
          { label: t("landing.mockDashboard.bookings"), value: "12" },
          { label: t("landing.mockDashboard.responseRate"), value: "98%" },
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
        <p className="mt-3 font-sans text-[0.8rem] text-[#9aacb4]">{t("landing.mockDashboard.earningsCaption")}</p>
      </div>
    </MockShell>
  );
}

function ListingsMock() {
  const { t } = useTranslation();
  const items = [FAKE_LISTINGS[1], FAKE_LISTINGS[2], FAKE_LISTINGS[6]];
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">{t("landing.mockListings.title")}</span>
        <span className="rounded-[8px] bg-[#2a3a42] px-3 py-1.5 font-sans text-[0.78rem] font-semibold text-white">{t("landing.mockListings.newListing")}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 p-5">
        {items.map((l) => (
          <div key={l.titleKey} className="overflow-hidden rounded-[12px] border border-[rgba(74,106,125,0.12)]">
            <img src={l.photo} alt="" loading="lazy" className="block h-20 w-full object-cover" />
            <div className="px-2.5 py-2">
              <p className="font-heading text-[0.85rem] leading-tight text-[#2a3a42]">{t(`landing.sampleListings.${l.titleKey}`)}</p>
              <p className="mt-1 font-heading text-[0.9rem] font-bold text-[#e07a6a]">{l.price}</p>
            </div>
          </div>
        ))}
      </div>
    </MockShell>
  );
}

function BookingsMock() {
  const { t } = useTranslation();
  const rows = [
    { name: t("landing.mockBookings.row1Name"), date: t("landing.mockBookings.row1Date"), status: t("landing.mockBookings.statusConfirmed"), tone: "bg-[#dff0ec] text-[#2f7a6b]" },
    { name: t("landing.mockBookings.row2Name"), date: t("landing.mockBookings.row2Date"), status: t("landing.mockBookings.statusPending"), tone: "bg-[#fdeee9] text-[#c4654f]" },
    { name: t("landing.mockBookings.row3Name"), date: t("landing.mockBookings.row3Date"), status: t("landing.mockBookings.statusConfirmed"), tone: "bg-[#dff0ec] text-[#2f7a6b]" },
  ];
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">{t("landing.mockBookings.title")}</span>
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
  const { t } = useTranslation();
  const payouts = [
    { label: t("landing.mockPayouts.item1"), amount: "+ $427.50" },
    { label: t("landing.mockPayouts.item2"), amount: "+ $1,140.00" },
    { label: t("landing.mockPayouts.item3"), amount: "+ $902.50" },
  ];
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">{t("landing.mockPayouts.title")}</span>
        <SampleTag />
      </div>
      <div className="px-5 py-4">
        <p className="font-sans text-[0.72rem] uppercase tracking-wide text-[#9aacb4]">{t("landing.mockPayouts.availableBalance")}</p>
        <p className="mt-1 font-heading text-[2rem] text-[#2a3a42]">$2,470.00</p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#f5f0e8] px-3 py-1 font-sans text-[0.72rem] font-medium text-[#4a6a7d]">
          {t("landing.mockPayouts.securedByStripe")}
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
  const { t } = useTranslation();
  return (
    <MockShell>
      <div className="flex items-center justify-between border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-5 py-3">
        <span className="font-heading text-[1.05rem] text-[#2a3a42]">{t("landing.mockChat.title")}</span>
        <SampleTag />
      </div>
      <div className="space-y-3 px-5 py-5">
        <div className="max-w-[80%] rounded-[14px] rounded-tl-[4px] bg-[#f0f4f7] px-4 py-2.5">
          <p className="font-sans text-[0.92rem] text-[#2a3a42]">{t("landing.mockChat.msg1")}</p>
        </div>
        <div className="ml-auto max-w-[80%] rounded-[14px] rounded-tr-[4px] bg-[#2a3a42] px-4 py-2.5">
          <p className="font-sans text-[0.92rem] text-white">{t("landing.mockChat.msg2")}</p>
        </div>
        <div className="max-w-[80%] rounded-[14px] rounded-tl-[4px] bg-[#f0f4f7] px-4 py-2.5">
          <p className="font-sans text-[0.92rem] text-[#2a3a42]">{t("landing.mockChat.msg3")}</p>
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
  body?: string;
  bullets?: string[];
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? "lg:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="font-heading text-[2rem] font-light leading-[1.15] text-[#2a3a42] lg:text-[2.4rem]">{title}</h3>
        {body && <p className="mt-4 font-sans text-[1.1rem] leading-[1.6] text-[#4a6a7d]">{body}</p>}
        {bullets && bullets.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 font-sans text-[1rem] text-[#2a3a42]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e07a6a]" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={reverse ? "lg:order-1" : ""}>{visual}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Customer preview (illustrative search + showcase grid)
--------------------------------------------------------------------------- */

function CustomerPreview() {
  const { t } = useTranslation();
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
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">{t("landing.search.anyCity")}</div>
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">{t("landing.search.eventType")}</div>
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">{t("landing.search.selectDate")}</div>
          <div className="flex min-h-[52px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 md:border-b-0 md:border-r font-sans text-[1rem] text-[#9aacb4]">{t("landing.search.rentals")}</div>
          <div className="flex items-center justify-center px-3 py-2">
            <div className="editorial-search-btn flex h-[44px] w-full items-center justify-center rounded-lg font-sans text-[1rem] font-semibold">{t("landing.search.button")}</div>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none flex gap-4">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-1 flex-col gap-4">
            {col.map((l) => (
              <div key={l.titleKey} className="w-full overflow-hidden rounded-[12px] bg-white shadow-[0_4px_24px_rgba(74,106,125,0.10)]">
                <img src={l.photo} alt="" loading="lazy" className="block w-full object-cover" style={{ aspectRatio: l.aspect }} />
                <div className="flex items-start justify-between gap-2 px-2.5 py-2.5">
                  <span className="font-heading text-[1.05rem] leading-snug text-[#2a3a42]">{t(`landing.sampleListings.${l.titleKey}`)}</span>
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
  const { t } = useTranslation();
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
        {/* Screen-reader-only title/description — Radix requires both on every
            dialog; the visible heading changes per step so a stable hidden one
            is used instead. */}
        <DialogTitle className="sr-only">{t("landing.signup.dialogTitle")}</DialogTitle>
        <DialogDescription className="sr-only">{t("landing.signup.dialogDescription")}</DialogDescription>
        <div className="relative px-9 pb-9 pt-10 text-center">
          {role !== null && initialRole === null && (
            <button
              type="button"
              onClick={() => setRole(null)}
              className="absolute left-5 top-5 flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[0.95rem] text-[#4a6a7d] hover:bg-[#f0f4f7]"
            >
              ← {t("landing.signup.back")}
            </button>
          )}

          <BrandWordmark
            className="mb-6 text-[2.4rem] leading-none"
            eventClassName="text-[#e07a6a] font-normal italic"
            hubClassName="text-[#4a6a7d] font-normal"
          />

          {role === null ? (
            <>
              <h2 className="font-heading text-[2rem] font-normal leading-[1.15] text-[#2a3a42]">{t("landing.signup.roleTitle")}</h2>
              <p className="mt-2 mb-7 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">{t("landing.signup.roleSubtitle")}</p>

              <RoleChoiceButton
                title={t("landing.signup.vendorChoiceTitle")}
                subtitle={t("landing.signup.vendorChoiceSubtitle")}
                onClick={() => setRole("vendor")}
              />
              <RoleChoiceButton
                title={t("landing.signup.customerChoiceTitle")}
                subtitle={t("landing.signup.customerChoiceSubtitle")}
                onClick={() => setRole("customer")}
              />
            </>
          ) : (
            <>
              <h2 className="font-heading text-[2rem] font-normal leading-[1.15] text-[#2a3a42]">
                {role === "vendor" ? t("landing.signup.vendorTitle") : t("landing.signup.customerTitle")}
              </h2>
              <p className="mt-2 mb-7 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">
                {role === "vendor" ? t("landing.signup.vendorSubtitle") : t("landing.signup.customerSubtitle")}
              </p>

              <button
                type="button"
                onClick={() => onStart(role, "google")}
                className="mb-3 flex w-full items-center justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white py-3.5 font-sans text-[1.05rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center font-bold text-[#4285F4]">G</span>
                {t("landing.signup.continueGoogle")}
              </button>

              <div className="my-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
                <span className="font-sans text-[0.85rem] font-medium text-[#7c8095]">{t("landing.signup.or")}</span>
                <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
              </div>

              <button
                type="button"
                onClick={() => onStart(role, "email")}
                className="mb-4 w-full rounded-[14px] bg-[#2a3a42] py-3.5 font-sans text-[1.1rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
              >
                {t("landing.signup.continueEmail")}
              </button>

              <p className="mb-4 font-sans text-[0.85rem] leading-[1.4] text-[#6e7590]">
                <Trans
                  i18nKey="landing.signup.termsAgreement"
                  components={{
                    terms: <a href="/terms" className="text-[#4a6a7d] hover:underline" />,
                    privacy: <a href="/privacy" className="text-[#4a6a7d] hover:underline" />,
                  }}
                />
              </p>
            </>
          )}

          <p className="font-sans text-[0.92rem] text-[#9aacb4]">
            {t("landing.signup.alreadyHaveAccount")}{" "}
            <button type="button" onClick={onLoginInstead} className="font-semibold text-[#4a6a7d] hover:underline">
              {t("landing.signup.logIn")}
            </button>
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
  const { t } = useTranslation();

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
  const { loginWithRedirect } = useAuth0();
  const { toast } = useToast();

  // Engagement detector: fires vendor_engaged once when the visitor scrolls 25%
  // or dwells 30s. Returns cleanup so the listeners/timer are torn down on unmount.
  useEffect(() => initEngagement(), []);

  // role = null opens the dialog on the "vendor or customer?" choice step;
  // a role pre-selects it and jumps straight to the sign-up methods.
  const openSignup = (role: SignupRole | null = null) => {
    setSignupRole(role);
    setSignupOpen(true);
  };

  // Every above/below-the-fold signup CTA routes through here so the click is
  // attributed (PostHog signup_cta_click + Meta Lead) with a per-button cta_id
  // before the signup dialog opens.
  const handleSignupCta = (ctaId: string, role: SignupRole | null = null) => {
    trackBoth("signup_cta_click", { cta_id: ctaId }, { event: "Lead", standard: true });
    openSignup(role);
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
        title: t("landing.toast.signupFailedTitle"),
        description: err?.message || t("landing.toast.signupFailedFallback"),
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
              <span className="mx-1.5 font-semibold text-[#e07a6a]">{t("landing.bar.price")}</span>
              <span className="text-[rgba(245,240,232,0.55)] line-through">$39</span>
              <span className="mx-1.5 text-[rgba(245,240,232,0.4)]">·</span>
              <span className="text-[rgba(245,240,232,0.85)]">{t("landing.bar.noFees")}</span>
            </span>
            <button
              type="button"
              onClick={() => handleSignupCta("sticky_bar", "vendor")}
              className="rounded-full bg-[#e07a6a] px-3.5 py-1 font-sans text-[0.85rem] font-semibold text-white transition-colors hover:bg-[#c96959]"
            >
              {t("landing.bar.cta")}
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
                {t("landing.header.logIn")}
              </button>
              <button
                type="button"
                onClick={() => handleSignupCta("header_get_started")}
                className="rounded-[10px] bg-[#2a3a42] px-4 py-2 font-sans text-[0.98rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
              >
                {t("landing.header.getStarted")}
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#f8fafb] to-white">
        <div className="mx-auto grid min-h-[calc(100svh-95px)] max-w-[1320px] items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-24">
          <div>
            <h1 className="font-heading text-[clamp(2.6rem,6vw,4rem)] font-light leading-[1.05] text-[#2a3a42]">
              <Trans
                i18nKey="landing.hero.title"
                components={{ accent: <em className="italic text-[#e07a6a]" /> }}
              />
            </h1>
            <p className="mt-6 max-w-xl font-sans text-[1.2rem] leading-[1.6] text-[#4a6a7d]">
              {t("landing.hero.subtitle")}
            </p>
            {/* CTA is centered on the trust line beneath it */}
            <div className="mt-8 inline-flex flex-col items-center">
              <PrimaryButton onClick={() => handleSignupCta("hero_primary", "vendor")} className="!px-7 !py-3.5 !text-[1.1rem]">{t("landing.hero.ctaVendor")}</PrimaryButton>
              <p className="mt-5 font-sans text-[0.95rem] text-[#9aacb4]">{t("landing.hero.trustLine")}</p>
            </div>
          </div>
          <div className="lg:pl-6">
            <DashboardMock />
          </div>
        </div>
      </section>

      {/* How it works — shared 4-step section (same as the free-first variants) */}
      <HowItWorks onSignup={() => handleSignupCta("how_it_works", "vendor")} className="border-t-transparent" />

      {/* Vendor experience */}
      <section className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Eyebrow>{t("landing.vendorSection.eyebrow")}</Eyebrow>
          <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">
            {t("landing.vendorSection.title")}
          </h2>
          <p className="mt-4 font-sans text-[1.15rem] leading-[1.6] text-[#4a6a7d]">
            {t("landing.vendorSection.subtitle")}
          </p>
        </div>

        {/* Each row fades up as it scrolls into view. Reveal degrades to
            instantly-visible under prefers-reduced-motion. */}
        <div className="space-y-24">
          <Reveal strict y={64} duration={1}>
            <FeatureRow
              eyebrow={t("landing.vendorSection.listings.eyebrow")}
              title={t("landing.vendorSection.listings.title")}
              visual={<ListingsMock />}
            />
          </Reveal>
          <Reveal strict y={64} duration={1}>
            <FeatureRow
              reverse
              eyebrow={t("landing.vendorSection.bookings.eyebrow")}
              title={t("landing.vendorSection.bookings.title")}
              visual={<BookingsMock />}
            />
          </Reveal>
          <Reveal strict y={64} duration={1}>
            <FeatureRow
              eyebrow={t("landing.vendorSection.payments.eyebrow")}
              title={t("landing.vendorSection.payments.title")}
              visual={<PayoutsMock />}
            />
          </Reveal>
          <Reveal strict y={64} duration={1}>
            <FeatureRow
              reverse
              eyebrow={t("landing.vendorSection.messaging.eyebrow")}
              title={t("landing.vendorSection.messaging.title")}
              visual={<ChatMock />}
            />
          </Reveal>
        </div>
      </section>

      {/* Customer experience */}
      <section className="border-y border-[rgba(74,106,125,0.08)] bg-[#f8fafb]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10 lg:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow>{t("landing.customerSection.eyebrow")}</Eyebrow>
              <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">
                {t("landing.customerSection.title")}
              </h2>
              <CustomerBullets className="mt-6" />
              <PrimaryButton
                onClick={() => handleSignupCta("customer_section", "vendor")}
                className="mt-7 !px-7 !py-3.5 !text-[1.1rem]"
              >
                {t("landing.header.getStarted")}
              </PrimaryButton>
            </div>
            <div className="mx-auto w-full max-w-[520px]">
              <VendorHubStill />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — native <details> accordion (no JS state); first item open. */}
      <section className="border-t border-[rgba(74,106,125,0.08)] bg-white">
        <div className="mx-auto max-w-[820px] px-5 py-20 lg:px-10 lg:py-24">
          <div className="mb-10 text-center">
            <Eyebrow>{t("landing.faq.eyebrow")}</Eyebrow>
            <h2 className="mt-3 font-heading text-[2.2rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[2.9rem]">
              {t("landing.faq.title")}
            </h2>
          </div>
          <div className="space-y-3">
            {FAQ_KEYS.map((k, i) => (
              <details
                key={k}
                open={i === 0}
                className="group rounded-[16px] border border-[rgba(74,106,125,0.14)] bg-white px-6 py-5 transition-shadow open:shadow-[0_14px_40px_rgba(74,106,125,0.08)]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans text-[1.08rem] font-semibold text-[#2a3a42]">
                  {t(`landing.faq.${k}.q`)}
                  <ChevronDown className="h-5 w-5 shrink-0 text-[#4a6a7d] transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="mt-4 font-sans text-[1.02rem] leading-[1.65] text-[#4a6a7d]">
                  {t(`landing.faq.${k}.a`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-[#2a3a42]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 text-center lg:px-10">
          <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-white lg:text-[3.2rem]">
            {t("landing.closing.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-sans text-[1.15rem] leading-[1.6] text-[rgba(245,240,232,0.8)]">
            {t("landing.closing.subtitle")}
          </p>
          {/* Launch-deal panel with the moving palette outline */}
          <div
            className="deal-outline mx-auto mt-10 max-w-2xl rounded-2xl bg-[rgba(245,240,232,0.04)] p-8 text-left lg:p-10"
            style={{ ["--ring" as any]: "2.5px" }}
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#e07a6a] px-2.5 py-0.5 font-sans text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-white">
                {t("landing.closing.launchOffer")}
              </span>
            </div>
            <h3 className="mt-4 font-heading text-[1.9rem] font-light leading-tight text-white">
              {t("landing.closing.dealTitle")}
            </h3>
            <p className="mt-3 font-sans text-[1.05rem] leading-[1.6] text-[rgba(245,240,232,0.82)]">
              <Trans
                i18nKey="landing.closing.dealPricing"
                components={{
                  struck: <span className="text-[rgba(245,240,232,0.5)] line-through" />,
                  strong: <span className="font-semibold text-white" />,
                  muted: <span className="text-[rgba(245,240,232,0.7)]" />,
                }}
              />
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#e07a6a]">✓</span> {t("landing.closing.deal1")}
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#9dd4cc]">✓</span> {t("landing.closing.deal2")}
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#c9a06a]">✓</span> {t("landing.closing.deal3")}
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#e07a6a]">✓</span> {t("landing.closing.deal4")}
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#9dd4cc]">✓</span> {t("landing.closing.deal5")}
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#c9a06a]">✓</span> {t("landing.closing.deal6")}
              </li>
              <li className="flex items-start gap-2.5 font-sans text-[0.98rem] text-[rgba(245,240,232,0.92)]">
                <span className="mt-0.5 text-[#e07a6a]">✓</span> {t("landing.closing.deal7")}
              </li>
            </ul>
            <div className="mt-8 inline-flex flex-col items-center">
              <button
                type="button"
                onClick={() => handleSignupCta("closing_cta", "vendor")}
                className="rounded-[12px] bg-[#e07a6a] px-8 py-4 font-sans text-[1.1rem] font-semibold text-white transition-colors hover:bg-[#c96959]"
              >
                {t("landing.closing.cta")}
              </button>
              <p className="mt-4 font-sans text-[0.9rem] text-[rgba(245,240,232,0.6)]">
                {t("landing.closing.trustLine")}
              </p>
            </div>
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
                {t("landing.footer.description")}
              </p>
            </div>

            <div>
              <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t("landing.footer.company")}</h3>
              <ul className="space-y-2.5">
                <li><a href="/terms" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">{t("landing.footer.terms")}</a></li>
                <li><a href="/privacy" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">{t("landing.footer.privacy")}</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t("landing.footer.contact")}</h3>
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
              {t("landing.footer.copyright", { year: new Date().getFullYear() })}
            </p>
            <div className="flex gap-6">
              <a href="/terms" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">{t("landing.footer.termsShort")}</a>
              <a href="/privacy" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">{t("landing.footer.privacyShort")}</a>
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
    </div>
  );
}
