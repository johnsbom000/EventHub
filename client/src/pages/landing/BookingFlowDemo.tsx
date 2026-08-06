import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Store,
  Tag,
  CalendarCheck,
  CreditCard,
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  MapPin,
  Star,
  Minus,
  Plus,
  Heart,
  LayoutGrid,
  ShieldCheck,
} from "lucide-react";

/* ---------------------------------------------------------------------------
   Shared interactive "how a customer books you" demo. Companion to
   ListingWizardDemo — same shell + controls, but this walks the CUSTOMER side:
   Vendor Hub → Listing detail → Make selections → Checkout → Booking confirmed.
   Self-contained (own card shell + sample tag) so it drops into any page.
--------------------------------------------------------------------------- */

function Shell({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      aria-hidden={interactive ? undefined : "true"}
      className={`${interactive ? "select-none" : "pointer-events-none select-none"} overflow-hidden rounded-[18px] border border-[rgba(74,106,125,0.16)] bg-white shadow-[0_24px_60px_rgba(74,106,125,0.16)] ${className}`}
    >
      {children}
    </div>
  );
}

function SampleTag() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5f0e8] px-2.5 py-1 font-sans text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[#9aacb4]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#e07a6a]" />
      {t("demoShared.sample")}
    </span>
  );
}

// Same red bounce house as the listing-wizard demo — four focal-point crops read
// as different angles of one item, matching the demo listing below.
const DEMO_PHOTO_BASE = "https://images.unsplash.com/photo-1765947389722-2e96d8c0aad9";
const DEMO_PHOTOS = [
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.52&fp-y=0.46&fp-z=1.05`,
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.40&fp-y=0.42&fp-z=1.9`,
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.56&fp-y=0.48&fp-z=1.9`,
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.72&fp-y=0.46&fp-z=2.1`,
];

const DEMO_TITLE = "Backyard Bounce House Rental";
const DEMO_VENDOR = "Bounce Bash Rentals";
const DEMO_DATE = "Sat, Aug 16";

// The six storefront listing cards (titles + prices are fixed; photos are
// swappable via the `storefrontImages` prop so a page can opt into distinct
// per-listing photos without changing the shared default).
const STOREFRONT_CARDS = [
  { title: DEMO_TITLE, price: "$650" },
  { title: "Water Slide Combo", price: "$725" },
  { title: "Toddler Play Zone", price: "$480" },
  { title: "Obstacle Course", price: "$840" },
  { title: "Princess Castle", price: "$690" },
  { title: "Sports Arena", price: "$760" },
];

// Default: crops of the one demo bounce house (same photo repeated).
const DEFAULT_STOREFRONT_IMAGES = [
  DEMO_PHOTOS[0],
  DEMO_PHOTOS[1],
  DEMO_PHOTOS[2],
  DEMO_PHOTOS[3],
  DEMO_PHOTOS[1],
  DEMO_PHOTOS[2],
];

// Distinct per-listing photos — real Unsplash bounce-house / inflatable shots,
// one per listing. Card 1 stays the red house that the listing-detail slide
// uses, so tapping it reads as opening that same listing.
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=320&h=240&fit=crop`;
export const VARIED_STOREFRONT_IMAGES = [
  DEMO_PHOTOS[0], // Backyard Bounce House Rental
  U("1631394255828-6a1e12f0e626"), // Water Slide Combo — child on a slide
  U("1633846740410-c874b0d5e9c1"), // Toddler Play Zone — soft character inflatables
  U("1753274864759-a15a45ecb424"), // Obstacle Course — large multi-feature inflatable
  U("1663797184266-20c14bfee71a"), // Princess Castle — turreted castle bounce house
  U("1632765471084-9f2ab98365bf"), // Sports Arena — inflatable with a ball
];

// The four customer screens the demo walks through. Titles/subs are resolved
// from i18n at render (demoBooking.screens.<key>) so the demo follows the toggle.
const SCREENS = [
  { key: "storefront", Icon: Store },
  { key: "listing", Icon: Tag },
  { key: "selections", Icon: CalendarCheck },
  { key: "checkout", Icon: CreditCard },
] as const;

// Phases: 0..3 = the four screens, 4 = placing order, 5 = confirmed. Then loops.
const DEMO_TOTAL = 6;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return reduced;
}

// DEV-ONLY: pin a specific slide via ?demoStep=N for layout verification.
// Compiled out of production builds (import.meta.env.DEV).
const DEMO_PINNED_STEP: number | null = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("bookStep");
  return raw != null && /^[0-5]$/.test(raw) ? Number(raw) : null;
})();

function Stars({ rating = "4.9", count = "24" }: { rating?: string; count?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="h-3 w-3 fill-[#d26f41] text-[#d26f41]" />
        ))}
      </div>
      <span className="font-sans text-[0.74rem] font-semibold text-[#2a3a42]">{rating}</span>
      <span className="font-sans text-[0.72rem] text-[#9aacb4]">{t("demoBooking.reviews", { count })}</span>
    </div>
  );
}

// A tiny storefront listing card (mirrors ListingCard: image, title, price/Day).
function MiniCard({ src, title, price }: { src: string; title: string; price: string }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-[10px] border border-[rgba(74,106,125,0.14)] bg-white">
      <img src={src} alt="" className="h-[3.4rem] w-full object-cover" />
      <div className="flex items-start justify-between gap-1 px-2 py-1.5">
        <p className="line-clamp-2 font-heading text-[0.68rem] font-semibold leading-tight text-[#2a3a42]">{title}</p>
        <p className="shrink-0 font-heading text-[0.72rem] font-bold text-[#e07a6a]">
          {price}
          <span className="text-[0.6em] font-medium text-[#9aacb4]">{t("demoBooking.perDay")}</span>
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, muted = false, accent = false }: { label: string; value: string; muted?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between font-sans text-[0.74rem]">
      <span className={muted ? "text-[#9aacb4]" : "text-[#4a6a7d]"}>{label}</span>
      <span className={`font-medium ${accent ? "text-[#e07a6a]" : "text-[#2a3a42]"}`}>{value}</span>
    </div>
  );
}

export default function BookingFlowDemo({ storefrontImages }: { storefrontImages?: string[] } = {}) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const cardImages = storefrontImages ?? DEFAULT_STOREFRONT_IMAGES;
  const [phase, setPhase] = useState(DEMO_PINNED_STEP ?? 0);
  const [paused, setPaused] = useState(false);

  // Manual navigation (buttons + rail). Wraps around the phases.
  const goBy = (dir: number) => setPhase((p) => ((p + dir) % DEMO_TOTAL + DEMO_TOTAL) % DEMO_TOTAL);
  const goTo = (next: number) => setPhase(((next % DEMO_TOTAL) + DEMO_TOTAL) % DEMO_TOTAL);

  // Reduced motion: hold the finished ("confirmed") state once on mount.
  const reducedPinnedRef = useRef(false);
  useEffect(() => {
    if (reduced && !reducedPinnedRef.current) {
      reducedPinnedRef.current = true;
      setPhase(5);
    }
  }, [reduced]);

  // Auto-advance every 3s (checkout→placing→confirmed slightly quicker so the
  // pay animation reads). Keyed on `phase`; press-and-hold sets `paused`.
  useEffect(() => {
    if (reduced || paused || DEMO_PINNED_STEP != null) return;
    const delay = phase === 4 ? 1100 : 3500;
    const id = window.setTimeout(() => setPhase((p) => (p + 1) % DEMO_TOTAL), delay);
    return () => window.clearTimeout(id);
  }, [phase, paused, reduced]);

  const active = Math.min(phase, 3);
  const placing = phase === 4;
  const confirmed = phase >= 5;
  const isLast = active === 3;
  const screen = SCREENS[active];

  // Footer CTA label per screen.
  const ctaLabel = confirmed
    ? t("demoBooking.cta.booked")
    : placing
      ? t("demoBooking.cta.placing")
      : active === 0
        ? t("demoBooking.cta.viewListing")
        : active === 1
          ? t("demoBooking.cta.bookNow")
          : active === 2
            ? t("demoBooking.cta.continueCheckout")
            : t("demoBooking.cta.placeOrder");

  return (
    <Shell interactive className="w-full">
      <div
        className="relative"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <div className="relative">
          {/* Screen header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <h3 className="font-sans text-[1.5rem] font-semibold tracking-tight text-[#2a3a42]">
                {confirmed ? t("demoBooking.screens.confirmed.title") : t(`demoBooking.screens.${screen.key}.title`)}
              </h3>
              <p className="mt-1 line-clamp-2 h-[2.3rem] font-sans text-[0.82rem] leading-snug text-[#9aacb4]">
                {confirmed ? t("demoBooking.screens.confirmed.sub") : t(`demoBooking.screens.${screen.key}.sub`)}
              </p>
            </div>
            <SampleTag />
          </div>

          {/* Screen body (fixed height so the card never jumps between screens) */}
          <div className="px-5 pb-4">
            <div className="h-[368px] overflow-hidden rounded-[14px] border border-[rgba(74,106,125,0.16)] bg-white">
              {/* Faux browser chrome */}
              <div className="flex items-center gap-2 border-b border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-3 py-2">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-[rgba(74,106,125,0.25)]" />
                  <span className="h-2 w-2 rounded-full bg-[rgba(74,106,125,0.25)]" />
                  <span className="h-2 w-2 rounded-full bg-[rgba(74,106,125,0.25)]" />
                </div>
                <div className="ml-1 flex h-4 flex-1 items-center rounded-[5px] bg-white px-2 font-sans text-[0.6rem] text-[#9aacb4]">
                  eventhub.com{active === 0 ? "/shop/bounce-bash" : active === 1 || active === 2 ? "/listing/backyard-bounce" : "/checkout"}
                </div>
              </div>

              <div className="h-[calc(368px-33px)] overflow-hidden p-3">
                {/* STAGE 0 — Vendor Hub / storefront */}
                {active === 0 && (
                  <div>
                    <div className="relative mb-6 h-14 rounded-[10px] bg-gradient-to-r from-[#4a6a7d] via-[#5f7f90] to-[#9dd4cc]">
                      <div className="absolute -bottom-5 left-4 flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white bg-[#f5f0e8] font-heading text-[1.1rem] font-semibold text-[#4a6a7d] shadow-sm">
                        BB
                      </div>
                    </div>
                    <div className="mb-3 pl-1">
                      <h4 className="font-heading text-[1.35rem] font-semibold leading-tight text-[#2a3a42]">{DEMO_VENDOR}</h4>
                      <div className="mt-1">
                        <Stars />
                      </div>
                    </div>
                    <p className="mb-2 font-heading text-[0.92rem] font-semibold text-[#2a3a42]">{t("demoBooking.availableRentals")}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {STOREFRONT_CARDS.map((c, i) => (
                        <MiniCard key={c.title} src={cardImages[i]} title={c.title} price={c.price} />
                      ))}
                    </div>
                  </div>
                )}

                {/* STAGE 1 — Listing detail */}
                {active === 1 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center font-sans text-[0.72rem] font-medium text-[#4a6a7d]">
                        <ChevronLeft className="h-3.5 w-3.5" /> {t("demoShared.back")}
                      </span>
                      <Heart className="h-4 w-4 text-[#9aacb4]" />
                    </div>
                    {/* Photo collage: hero + 2x2 */}
                    <div className="mb-3 flex gap-1.5">
                      <img src={DEMO_PHOTOS[0]} alt="" className="h-[7.5rem] flex-1 rounded-l-[10px] object-cover" />
                      <div className="grid w-[42%] grid-cols-2 gap-1.5">
                        <img src={DEMO_PHOTOS[1]} alt="" className="h-[3.6rem] w-full object-cover" />
                        <img src={DEMO_PHOTOS[2]} alt="" className="h-[3.6rem] w-full rounded-tr-[10px] object-cover" />
                        <img src={DEMO_PHOTOS[3]} alt="" className="h-[3.6rem] w-full object-cover" />
                        <div className="relative h-[3.6rem] w-full overflow-hidden rounded-br-[10px]">
                          <img src={DEMO_PHOTOS[0]} alt="" className="h-full w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center gap-1 bg-[#1a2530]/45 font-sans text-[0.6rem] font-semibold text-white">
                            <LayoutGrid className="h-3 w-3" /> All
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-heading text-[1.15rem] font-bold leading-tight text-[#2a3a42]">{DEMO_TITLE}</h4>
                        <div className="mt-1 flex items-center gap-2 font-sans text-[0.72rem] text-[#9aacb4]">
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" /> Salt Lake City, UT
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-[#d26f41] text-[#d26f41]" /> 4.9 (24)
                          </span>
                        </div>
                      </div>
                      <p className="shrink-0 font-heading text-[1.15rem] font-bold text-[#e07a6a]">
                        $650<span className="text-[0.55em] font-medium text-[#9aacb4]">/day</span>
                      </p>
                    </div>
                    <div className="my-2.5 border-t border-[rgba(74,106,125,0.14)]" />
                    <p className="mb-2 line-clamp-2 font-sans text-[0.74rem] leading-snug text-[#4a6a7d]">
                      {t("demoBooking.description")}
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {(["a", "b", "c", "d"] as const).map((k) => (
                        <span key={k} className="flex items-center gap-1.5 font-sans text-[0.72rem] text-[#2a3a42]">
                          <Check className="h-3 w-3 shrink-0 text-[#2f7a6b]" /> {t(`demoBooking.included.${k}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* STAGE 2 — Make selections (reservation card + live price breakdown) */}
                {active === 2 && (
                  <div className="space-y-2.5">
                    <div className="flex items-baseline justify-between">
                      <p className="font-heading text-[1.15rem] font-semibold text-[#2a3a42]">
                        $650 <span className="font-sans text-[0.72rem] font-normal text-[#9aacb4]">{t("demoBooking.perDayLong")}</span>
                      </p>
                      <span className="font-sans text-[0.7rem] font-medium text-[#2f7a6b]">{t("demoBooking.available")}</span>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[0.72rem] font-medium text-[#2a3a42]">{t("demoBooking.eventDate")}</p>
                      <div className="flex h-8 items-center justify-between rounded-md border border-input bg-background px-3 font-sans text-[0.78rem] text-[#2a3a42]">
                        {DEMO_DATE}
                        <CalendarCheck className="h-3.5 w-3.5 text-[#9aacb4]" />
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[0.72rem] font-medium text-[#2a3a42]">{t("demoBooking.addOns")}</p>
                      <div className="flex items-center justify-between rounded-lg border border-primary bg-primary/5 px-2.5 py-1.5">
                        <span className="flex items-center gap-1.5 font-sans text-[0.74rem] text-[#2a3a42]">
                          <Check className="h-3.5 w-3.5 text-[#2f7a6b]" /> {t("demoBooking.setupStyling")}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-sans text-[0.72rem] text-[#9aacb4]">$120</span>
                          <span className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(74,106,125,0.3)] text-[#4a6a7d]">
                              <Minus className="h-3 w-3" />
                            </span>
                            <span className="font-sans text-[0.74rem] font-medium text-[#2a3a42]">1</span>
                            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(74,106,125,0.3)] text-[#4a6a7d]">
                              <Plus className="h-3 w-3" />
                            </span>
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5 rounded-xl border border-[rgba(74,106,125,0.16)] bg-[#f8fafb] p-3">
                      <p className="font-sans text-[0.72rem] font-semibold text-[#2a3a42]">{t("demoBooking.priceBreakdown")}</p>
                      <Row label={t("demoBooking.basePrice")} value="$650" />
                      <Row label={t("demoBooking.setupStylingQty")} value="$120" />
                      <Row label={t("demoBooking.securityDeposit")} value="$200" muted />
                      <div className="border-t border-[rgba(74,106,125,0.16)] pt-1.5">
                        <div className="flex items-center justify-between font-sans text-[0.82rem] font-bold text-[#2a3a42]">
                          <span>{t("demoBooking.total")}</span>
                          <span>$970</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md bg-[#e07a6a] py-2 text-center font-sans text-[0.82rem] font-semibold text-white">
                      {t("demoBooking.bookNowBtn")}
                    </div>
                  </div>
                )}

                {/* STAGE 3 — Checkout */}
                {active === 3 && (
                  <div className="space-y-2">
                    <p className="font-sans text-[0.8rem] font-semibold text-[#2a3a42]">{t("demoBooking.billingDetails")}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex h-7 items-center rounded-md border border-input bg-background px-2.5 font-sans text-[0.72rem] text-[#2a3a42]">
                        Jamie Rivera
                      </div>
                      <div className="flex h-7 items-center rounded-md border border-input bg-background px-2.5 font-sans text-[0.72rem] text-[#2a3a42]">
                        jamie@email.com
                      </div>
                    </div>
                    <div className="flex h-7 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 font-sans text-[0.72rem] text-[#2a3a42]">
                      <MapPin className="h-3 w-3 text-[#9aacb4]" /> 812 Maple Ave, Salt Lake City, UT
                    </div>

                    <div className="rounded-xl border border-[rgba(74,106,125,0.16)] bg-[#f8fafb] p-2.5">
                      <div className="mb-1.5 flex items-center gap-2">
                        <img src={DEMO_PHOTOS[0]} alt="" className="h-8 w-8 rounded-[6px] object-cover" />
                        <div className="min-w-0">
                          <p className="truncate font-sans text-[0.72rem] font-semibold text-[#2a3a42]">{DEMO_TITLE}</p>
                          <p className="flex items-center gap-1 font-sans text-[0.66rem] text-[#9aacb4]">
                            <CalendarCheck className="h-2.5 w-2.5" /> {DEMO_DATE} · {t("demoBooking.qty", { n: 1 })}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1 border-t border-[rgba(74,106,125,0.14)] pt-1.5">
                        <Row label={t("demoBooking.subtotal")} value="$650" />
                        <Row label={t("demoBooking.setupStylingQty")} value="$120" />
                        <Row label={t("demoBooking.logistics")} value="$40" />
                        <Row label={t("demoBooking.securityDeposit")} value="$200" muted />
                        <div className="flex items-center justify-between border-t border-[rgba(74,106,125,0.16)] pt-1.5">
                          <span className="font-sans text-[0.78rem] font-semibold text-[#2a3a42]">{t("demoBooking.total")}</span>
                          <span className="font-heading text-[1.15rem] font-bold text-[#2a3a42]">$1,010</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 font-sans text-[0.7rem] font-medium text-[#2a3a42]">{t("demoBooking.cardNumber")}</p>
                      <div className="flex h-7 items-center justify-between rounded-md border border-input bg-background px-2.5 font-sans text-[0.72rem] text-[#2a3a42]">
                        <span>4242 4242 4242 4242</span>
                        <CreditCard className="h-3.5 w-3.5 text-[#9aacb4]" />
                      </div>
                    </div>
                    <p className="flex items-center gap-1 font-sans text-[0.64rem] text-[#9aacb4]">
                      <ShieldCheck className="h-3 w-3 text-[#4a6a7d]" /> {t("demoBooking.depositNote")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer nav — mirrors the wizard's Back / primary CTA */}
          <div className="flex items-center justify-between gap-2 border-t border-[rgba(74,106,125,0.12)] px-5 py-3">
            <span className="flex items-center rounded-[10px] border border-[rgba(74,106,125,0.28)] px-4 py-1.5 font-sans text-[0.8rem] font-medium text-[#4a6a7d]">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </span>
            <div className="flex items-center gap-2.5">
              <span className="font-sans text-[0.78rem] text-[#9aacb4]">{isLast ? t("demoBooking.secureCheckout") : t("demoBooking.sampleView")}</span>
              <span
                className={`rounded-[10px] px-4 py-1.5 font-sans text-[0.82rem] font-semibold text-white transition-all duration-300 ${
                  isLast ? "bg-[#e07a6a]" : "bg-primary text-primary-foreground"
                } ${placing ? "scale-[0.97] brightness-95" : ""}`}
              >
                {ctaLabel}
              </span>
            </div>
          </div>

          {/* Confirmed overlay */}
          {confirmed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/95 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2f7a6b] text-white">
                <Check className="h-6 w-6" />
              </div>
              <p className="font-heading text-[1.4rem] leading-tight text-[#2a3a42]">{t("demoBooking.confirmedOverlay")}</p>
              <p className="font-sans text-[0.84rem] text-[#9aacb4]">{DEMO_TITLE} · {DEMO_DATE}</p>
            </div>
          )}
        </div>

        {/* Prev / next controls below the slideshow (auto-advance keeps running) */}
        <div className="flex items-center justify-center gap-3 border-t border-[rgba(74,106,125,0.12)] bg-[#f8fafb] px-4 py-2.5">
          <button
            type="button"
            aria-label={t("demoShared.prev")}
            onClick={() => goBy(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(74,106,125,0.2)] bg-white text-[#4a6a7d] transition hover:border-[#4a6a7d]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1.5">
            {SCREENS.map((s, i) => (
              <button
                type="button"
                key={s.key}
                aria-label={t("demoShared.goTo", { name: t(`demoBooking.screens.${s.key}.title`) })}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  !confirmed && i === active
                    ? "w-4 bg-[#e07a6a]"
                    : i < active || confirmed
                      ? "w-1.5 bg-[#4a6a7d]"
                      : "w-1.5 bg-[rgba(74,106,125,0.25)]"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label={t("demoShared.next")}
            onClick={() => goBy(1)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(74,106,125,0.2)] bg-white text-[#4a6a7d] transition hover:border-[#4a6a7d]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Paused indicator (press-and-hold) */}
        {paused && !reduced && (
          <div className="absolute left-1/2 top-2.5 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#2a3a42]/90 px-2.5 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-wide text-white">
            <Pause className="h-3 w-3" /> {t("demoShared.paused")}
          </div>
        )}
      </div>
    </Shell>
  );
}
