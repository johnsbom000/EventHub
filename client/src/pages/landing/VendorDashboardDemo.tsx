import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  LayoutDashboard,
  ClipboardList,
  TicketPercent,
  MessageSquare,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Plus,
  Pencil,
  Megaphone,
  Send,
  ChevronLeft,
  ChevronRight,
  Pause,
} from "lucide-react";
import { VARIED_STOREFRONT_IMAGES } from "@/pages/landing/BookingFlowDemo";

/* ---------------------------------------------------------------------------
   Stylized "your vendor dashboard" demo for the Direction A hero. A sibling to
   ListingWizardDemo: same card shell, left icon rail, fixed-height body, auto-
   advance + press-to-pause, reduced-motion, and prev/next dot controls — but it
   tours the vendor's command center instead of the create-listing wizard.

   Self-contained (its own Shell + Sample tag), all copy hardcoded (not i18n,
   matching the other landing demos). Story: lots of bookings, real money. The
   Messages thread is intentionally event-specific only — nothing the storefront
   already answers (price, availability, what's included).
--------------------------------------------------------------------------- */

function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`select-none overflow-hidden rounded-[18px] border border-[rgba(74,106,125,0.16)] bg-white shadow-[0_24px_60px_rgba(74,106,125,0.16)] ${className}`}
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

// Nav rail order == tour order, so the active highlight moves cleanly. Titles/
// subs resolve from i18n at render (demoDashboard.nav.<key>) so the demo follows
// the language toggle.
const NAV = [
  { key: "bookings", Icon: CalendarCheck },
  { key: "overview", Icon: LayoutDashboard },
  { key: "listings", Icon: ClipboardList },
  { key: "discounts", Icon: TicketPercent },
  { key: "messages", Icon: MessageSquare },
] as const;

const DEMO_TOTAL = NAV.length;

const LISTINGS = [
  { img: VARIED_STOREFRONT_IMAGES[0], title: "Backyard Bounce House", price: "$350/day" },
  { img: VARIED_STOREFRONT_IMAGES[1], title: "Water Slide Combo", price: "$420/day" },
  { img: VARIED_STOREFRONT_IMAGES[3], title: "Obstacle Course", price: "From $600" },
] as const;

// name = sample data (kept as-is); eventKey resolves via demoDashboard.events,
// date stays literal. Rendered as "<event> · <date>".
const CONVOS = [
  { name: "Jordan M.", eventKey: "backyardParty", date: "Jun 14", unread: "2" },
  { name: "Priya S.", eventKey: "wedding", date: "Jun 20", unread: null },
  { name: "Marcus L.", eventKey: "companyPicnic", date: "Jun 22", unread: "1" },
  { name: "Dana W.", eventKey: "birthdayBash", date: "Jun 24", unread: null },
  { name: "Alex R.", eventKey: "graduation", date: "Jun 28", unread: null },
  { name: "Sofia T.", eventKey: "babyShower", date: "Jul 2", unread: "3" },
  { name: "Ethan K.", eventKey: "blockParty", date: "Jul 5", unread: null },
  { name: "Maya P.", eventKey: "anniversary", date: "Jul 9", unread: null },
] as const;

// DEV-ONLY: pin a specific slide via ?demoStep=N for layout verification.
const DEMO_PINNED_STEP: number | null = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("demoStep");
  return raw != null && /^[0-4]$/.test(raw) ? Number(raw) : null;
})();

// Exported so decorative reuses of the booking row (e.g. ScatteredBookings on
// Direction D) share this pill rather than duplicating it.
export function StatusBadge({ status }: { status: "Confirmed" | "Pending" }) {
  const { t } = useTranslation();
  const pending = status === "Pending";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-sans text-[0.58rem] font-semibold uppercase tracking-wide ${
        pending ? "bg-[#faf1e2] text-[#b9822f]" : "bg-[#e8f3f0] text-[#2f7a6b]"
      }`}
    >
      {t(pending ? "demoDashboard.status.pending" : "demoDashboard.status.confirmed")}
    </span>
  );
}

export default function VendorDashboardDemo({ still = false }: { still?: boolean } = {}) {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  // `still` freezes the card on the Bookings (booking-confirmations) screen with
  // no auto-advance, controls, or nav interaction — a static hero panel.
  const [phase, setPhase] = useState(still ? 0 : (DEMO_PINNED_STEP ?? 0));
  const [paused, setPaused] = useState(false);

  const goBy = (dir: number) => setPhase((p) => (((p + dir) % DEMO_TOTAL) + DEMO_TOTAL) % DEMO_TOTAL);
  const goTo = (next: number) => setPhase(((next % DEMO_TOTAL) + DEMO_TOTAL) % DEMO_TOTAL);

  // Reduced motion: hold the Overview screen (the "making money" frame) once on
  // mount. The visitor can still click through manually afterwards.
  const reducedPinnedRef = useRef(false);
  useEffect(() => {
    if (reduced && !reducedPinnedRef.current && !still) {
      reducedPinnedRef.current = true;
      setPhase(1);
    }
  }, [reduced, still]);

  // Auto-advance every 3.4s. Keyed on `phase` so a manual click reschedules a
  // full interval; press-and-hold sets `paused` to cancel the pending advance.
  useEffect(() => {
    if (still || reduced || paused || DEMO_PINNED_STEP != null) return;
    const id = window.setTimeout(() => setPhase((p) => (p + 1) % DEMO_TOTAL), 3400);
    return () => window.clearTimeout(id);
  }, [phase, paused, reduced, still]);

  const active = phase;
  const nav = NAV[active];

  return (
    <Shell className="w-full">
      {/* Press-and-hold anywhere pauses the auto-advance; release resumes.
          In `still` mode there's nothing to pause, so no hold handlers. */}
      <div
        className="relative"
        {...(still
          ? {}
          : {
              onMouseDown: () => setPaused(true),
              onMouseUp: () => setPaused(false),
              onMouseLeave: () => setPaused(false),
              onTouchStart: () => setPaused(true),
              onTouchEnd: () => setPaused(false),
            })}
      >
        <div className="flex">
          {/* Left nav rail — mirrors the vendor sidebar (click to jump) */}
          <div
            className={`flex w-14 shrink-0 flex-col items-center gap-2 border-r border-[rgba(74,106,125,0.22)] bg-white py-4 ${
              still ? "pointer-events-none" : ""
            }`}
          >
            {NAV.map((n, i) => {
              const isActive = i === active;
              const Icon = n.Icon;
              return (
                <button
                  type="button"
                  key={n.key}
                  aria-label={t("demoShared.goTo", { name: t(`demoDashboard.nav.${n.key}.title`) })}
                  onClick={() => goTo(i)}
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl transition-colors ${
                    isActive ? "bg-[#4a6a7d] text-[#f5f0e8]" : "text-[#9aacb4] hover:bg-[#f0f4f7]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          {/* Content column */}
          <div className="relative min-w-0 flex-1">
            {/* Page header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
              <div className="min-w-0">
                <h3 className="font-sans text-[1.5rem] font-semibold tracking-tight text-[#2a3a42]">{t(`demoDashboard.nav.${nav.key}.title`)}</h3>
                <p className="mt-1 line-clamp-2 h-[2.3rem] font-sans text-[0.82rem] leading-snug text-[#9aacb4]">
                  {t(`demoDashboard.nav.${nav.key}.sub`)}
                </p>
              </div>
              <SampleTag />
            </div>

            {/* Body (fixed height so the card doesn't jump between screens) */}
            <div className="px-5 pb-5">
              <div className="relative h-[368px] overflow-hidden rounded-[14px] border border-[rgba(74,106,125,0.16)] bg-white p-4">
                {/* 0 — Bookings */}
                {active === 0 && (
                  <div className="space-y-2.5">
                    <div className="flex gap-1.5">
                      {(["all", "upcoming", "pending", "completed"] as const).map((tab, i) => (
                        <span
                          key={tab}
                          className={`rounded-full px-3 py-1 font-sans text-[0.72rem] font-medium ${
                            i === 1 ? "bg-[#4a6a7d] text-[#f5f0e8]" : "border border-[rgba(74,106,125,0.2)] text-[#4a6a7d]"
                          }`}
                        >
                          {t(`demoDashboard.tabs.${tab}`)}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ["statUpcoming", "14"],
                        ["statThisMonth", "$9.4k"],
                        ["statPending", "5"],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-[rgba(74,106,125,0.16)] bg-[#f8fafb] px-3 py-2 text-center"
                        >
                          <p className="font-heading text-[1.25rem] font-light leading-none text-[#2a3a42]">{value}</p>
                          <p className="mt-1 font-sans text-[0.66rem] text-[#9aacb4]">{t(`demoDashboard.bookings.${label}`)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-[rgba(224,122,106,0.35)] bg-[#fdf6f4] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-sans text-[0.78rem] font-semibold text-[#2a3a42]">Wedding Tent 20×40</p>
                        <StatusBadge status="Pending" />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className="font-sans text-[0.7rem] text-[#9aacb4]">Fri, Jun 20 · {t("demoDashboard.bookings.allDay")}</p>
                        <p className="font-sans text-[0.7rem] font-semibold text-[#4a6a7d]">{t("demoDashboard.bookings.estPayout")} $1,240</p>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <span className="rounded-lg bg-[#2f7a6b] px-3 py-1 font-sans text-[0.7rem] font-semibold text-white">
                          {t("demoDashboard.bookings.accept")}
                        </span>
                        <span className="rounded-lg border border-[rgba(74,106,125,0.28)] px-3 py-1 font-sans text-[0.7rem] font-medium text-[#4a6a7d]">
                          {t("demoDashboard.bookings.decline")}
                        </span>
                      </div>
                    </div>
                    {[
                      ["Backyard Bounce House", "Sat, Jun 14 · 2:00–8:00 PM", "$315"],
                      ["Table & Chair Package", "Sun, Jun 15 · 10:00 AM", "$180"],
                      ["Water Slide Combo", "Sat, Jun 21 · 12:00–6:00 PM", "$420"],
                      ["Obstacle Course", "Sun, Jun 22 · 1:00 PM", "$600"],
                      ["360 Photo Booth", "Fri, Jun 27 · 5:00–9:00 PM", "$500"],
                    ].map(([title, when, payout]) => (
                      <div key={title} className="rounded-xl border border-[rgba(74,106,125,0.16)] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-sans text-[0.78rem] font-semibold text-[#2a3a42]">{title}</p>
                          <StatusBadge status="Confirmed" />
                        </div>
                        <div className="mt-0.5 flex items-center justify-between">
                          <p className="font-sans text-[0.7rem] text-[#9aacb4]">{when}</p>
                          <p className="font-sans text-[0.7rem] font-semibold text-[#4a6a7d]">{t("demoDashboard.bookings.estPayout")} {payout}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 1 — Overview */}
                {active === 1 && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { labelKey: "totalBookings", value: "128", subKey: "subBookings", Icon: Calendar },
                        { labelKey: "revenue", value: "$8,540", subKey: "subRevenue", Icon: DollarSign },
                        { labelKey: "profileViews", value: "2,310", subKey: "subViews", Icon: Users },
                      ].map(({ labelKey, value, subKey, Icon }) => (
                        <div key={labelKey} className="rounded-xl border border-[rgba(74,106,125,0.16)] bg-[#f8fafb] p-3">
                          <div className="flex items-center justify-between">
                            <p className="font-sans text-[0.64rem] font-medium text-[#9aacb4]">{t(`demoDashboard.overview.${labelKey}`)}</p>
                            <Icon className="h-3.5 w-3.5 text-[#9aacb4]" />
                          </div>
                          <p className="mt-1.5 font-heading text-[1.5rem] font-light leading-none text-[#2a3a42]">
                            {value}
                          </p>
                          <p className="mt-1 flex items-center gap-1 font-sans text-[0.62rem] font-medium text-[#2f7a6b]">
                            <TrendingUp className="h-3 w-3" />
                            {t(`demoDashboard.overview.${subKey}`)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div>
                      <p className="mb-1.5 font-sans text-[0.72rem] font-semibold text-[#2a3a42]">{t("demoDashboard.overview.upcoming")}</p>
                      <div className="space-y-1.5">
                        {[
                          ["Jordan M.", "backyardParty", "Jun 14", "Confirmed"],
                          ["Priya S.", "wedding", "Jun 20", "Confirmed"],
                          ["Marcus L.", "companyPicnic", "Jun 22", "Pending"],
                          ["Dana W.", "birthdayBash", "Jun 24", "Confirmed"],
                          ["Alex R.", "graduation", "Jun 28", "Confirmed"],
                          ["Sofia T.", "babyShower", "Jul 2", "Pending"],
                        ].map(([name, eventKey, date, status]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between rounded-lg border border-[rgba(74,106,125,0.14)] px-3 py-2"
                          >
                            <div>
                              <p className="font-sans text-[0.76rem] font-medium text-[#2a3a42]">{name}</p>
                              <p className="font-sans text-[0.68rem] text-[#9aacb4]">{t(`demoDashboard.events.${eventKey}`)} · {date}</p>
                            </div>
                            <StatusBadge status={status as "Confirmed" | "Pending"} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2 — Listings */}
                {active === 2 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoDashboard.listings.activeCount", { n: 3 })}</p>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e07a6a] px-3 py-1.5 font-sans text-[0.72rem] font-semibold text-white">
                        <Plus className="h-3.5 w-3.5" /> {t("demoDashboard.listings.createListing")}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {LISTINGS.map(({ img, title, price }) => (
                        <div key={title} className="overflow-hidden rounded-xl border border-[rgba(74,106,125,0.16)]">
                          <div className="relative h-[4.5rem] w-full bg-[#f5f0e8]">
                            <img src={img} alt="" className="h-full w-full object-cover" />
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-1.5 py-0.5 font-sans text-[0.55rem] font-semibold uppercase tracking-wide text-[#2f7a6b]">
                              {t("demoDashboard.listings.active")}
                            </span>
                          </div>
                          <div className="p-2">
                            <p className="line-clamp-1 font-sans text-[0.7rem] font-medium text-[#2a3a42]">{title}</p>
                            <p className="mt-0.5 font-sans text-[0.74rem] font-semibold text-[#e07a6a]">{price}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-[rgba(74,106,125,0.14)] px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-[0.76rem] font-medium text-[#2a3a42]">Table &amp; Chair Package</span>
                        <StatusBadge status="Confirmed" />
                      </div>
                      <span className="inline-flex items-center gap-1.5 font-sans text-[0.68rem] font-medium text-[#4a6a7d]">
                        <Pencil className="h-3.5 w-3.5" /> {t("demoDashboard.listings.edit")}
                      </span>
                    </div>
                  </div>
                )}

                {/* 3 — Discounts & Promos */}
                {active === 3 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1.5">
                        {(["tabActive", "tabScheduled", "tabExpired"] as const).map((tab, i) => (
                          <span
                            key={tab}
                            className={`rounded-full px-3 py-1 font-sans text-[0.7rem] font-medium ${
                              i === 0
                                ? "bg-[#4a6a7d] text-[#f5f0e8]"
                                : "border border-[rgba(74,106,125,0.2)] text-[#4a6a7d]"
                            }`}
                          >
                            {t(`demoDashboard.discounts.${tab}`)}
                          </span>
                        ))}
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e07a6a] px-3 py-1.5 font-sans text-[0.72rem] font-semibold text-white">
                        <Plus className="h-3.5 w-3.5" /> {t("demoDashboard.discounts.newDiscount")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-[rgba(74,106,125,0.16)] bg-white p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f5f0e8] text-[#4a6a7d]">
                        <TicketPercent className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[0.8rem] font-semibold text-[#2a3a42]">SUMMER20</span>
                          <span className="rounded-full bg-[#e07a6a] px-2 py-0.5 font-sans text-[0.6rem] font-bold text-white">
                            20% OFF
                          </span>
                        </div>
                        <p className="mt-0.5 font-sans text-[0.66rem] text-[#9aacb4]">{t("demoDashboard.discounts.summerMeta")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-[rgba(74,106,125,0.16)] bg-white p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f5f0e8] text-[#4a6a7d]">
                        <Megaphone className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-[0.8rem] font-semibold text-[#2a3a42]">{t("demoDashboard.discounts.summerSale")}</span>
                          <span className="rounded-full bg-[#e07a6a] px-2 py-0.5 font-sans text-[0.6rem] font-bold text-white">
                            15% OFF
                          </span>
                          <span className="rounded-full border border-[rgba(74,106,125,0.2)] px-2 py-0.5 font-sans text-[0.58rem] font-medium text-[#9aacb4]">
                            {t("demoDashboard.discounts.saleTag")}
                          </span>
                        </div>
                        <p className="mt-0.5 font-sans text-[0.66rem] text-[#9aacb4]">{t("demoDashboard.discounts.summerSaleMeta")}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4 — Messages */}
                {active === 4 && (
                  <div className="flex h-full gap-2">
                    <div className="relative w-[38%] shrink-0 overflow-hidden border-r border-[rgba(74,106,125,0.14)] pr-2">
                      <div className="space-y-1">
                        {CONVOS.map((c, i) => (
                          <div key={c.name} className={`rounded-lg px-2 py-1.5 ${i === 0 ? "bg-[#e6f6fa]" : ""}`}>
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate font-sans text-[0.72rem] font-semibold text-[#2a3a42]">{c.name}</p>
                              {c.unread && (
                                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#0891b2] px-1 font-sans text-[0.56rem] font-bold text-white">
                                  {c.unread}
                                </span>
                              )}
                            </div>
                            <p className="truncate font-sans text-[0.62rem] text-[#9aacb4]">{t(`demoDashboard.events.${c.eventKey}`)} · {c.date}</p>
                          </div>
                        ))}
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="border-b border-[rgba(74,106,125,0.12)] pb-1.5 font-sans text-[0.74rem] font-semibold text-[#2a3a42]">
                        Jordan M.
                      </p>
                      <div className="flex-1 space-y-2 overflow-hidden py-2.5">
                        <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-[#f0f4f7] px-3 py-1.5 font-sans text-[0.68rem] leading-snug text-[#2a3a42]">
                          {t("demoDashboard.messages.bubble1")}
                        </div>
                        <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-sm bg-[#e07a6a] px-3 py-1.5 font-sans text-[0.68rem] leading-snug text-white">
                          {t("demoDashboard.messages.bubble2")}
                        </div>
                        <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-[#f0f4f7] px-3 py-1.5 font-sans text-[0.68rem] leading-snug text-[#2a3a42]">
                          {t("demoDashboard.messages.bubble3")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-full border border-[rgba(74,106,125,0.2)] px-3 py-1.5">
                        <span className="flex-1 font-sans text-[0.66rem] text-[#9aacb4]">{t("demoDashboard.messages.placeholder")}</span>
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4a6a7d] text-white">
                          <Send className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fade hint that the list keeps going — a busy calendar */}
                {(active === 0 || active === 1) && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-[14px] bg-gradient-to-t from-white to-transparent" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Prev / next controls + dots (auto-advance keeps running).
            Hidden in `still` mode — the panel is a single frozen frame. */}
        {!still && (
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
            {NAV.map((n, i) => (
              <span
                key={n.key}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? "w-4 bg-[#e07a6a]" : "w-1.5 bg-[rgba(74,106,125,0.25)]"
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
        )}

        {/* Paused indicator (press-and-hold) */}
        {paused && !reduced && !still && (
          <div className="absolute left-1/2 top-2.5 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#2a3a42]/90 px-2.5 py-1 font-sans text-[0.66rem] font-semibold uppercase tracking-wide text-white">
            <Pause className="h-3 w-3" /> {t("demoShared.paused")}
          </div>
        )}
      </div>
    </Shell>
  );
}
