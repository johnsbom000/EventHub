import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/pages/landing/VendorDashboardDemo";

/* ---------------------------------------------------------------------------
   Decorative booking-confirmation cards scattered around Direction D's hero.

   The card is the same row used in the "still" Bookings panel
   (VendorDashboardDemo), lifted out onto the page with a width, a translucent
   background and a soft shadow so it reads standalone over the hero gradient.

   Purely ornamental: aria-hidden, pointer-events-none, and desktop-only —
   below `lg` a 260px card can't scatter without colliding with the copy.
   Titles/dates are hardcoded to match the existing demo; the payout label and
   status pill come from the shared `demoDashboard` i18n block, so es/pt work.
--------------------------------------------------------------------------- */

type ScatterCard = {
  title: string;
  when: string;
  payout: string;
  status: "Confirmed" | "Pending";
  // Ring positions leave a clear center channel (x 26–74%, y 30–70%) for the
  // headline, CTA and trust line. Two cards sit at negative offsets so they
  // bleed off the viewport edge (the hero clips them via overflow-hidden).
  pos: CSSProperties;
  rot: number;
  scale: number;
  opacity: number;
  dur: number;
  delay: number;
};

const CARDS: ScatterCard[] = [
  { title: "Backyard Bounce House", when: "Sat, Jun 14 · 2–8 PM",  payout: "$315", status: "Confirmed", pos: { top: "7%",  left: "4%" },   rot: -7, scale: 0.96, opacity: 0.92, dur: 8.5, delay: 0 },
  { title: "360 Photo Booth",       when: "Fri, Jun 27 · 5–9 PM",  payout: "$500", status: "Confirmed", pos: { top: "5%",  right: "6%" },  rot: 6,  scale: 0.92, opacity: 0.88, dur: 9.5, delay: 1.2 },
  { title: "Dirty Soda Bar",        when: "Sun, Jun 15 · 11 AM",   payout: "$240", status: "Confirmed", pos: { top: "21%", left: "17%" },  rot: 4,  scale: 0.86, opacity: 0.72, dur: 7.5, delay: 2.4 },
  { title: "Flower Wall Backdrop",  when: "Sat, Jun 21 · All day", payout: "$180", status: "Confirmed", pos: { top: "18%", right: "15%" }, rot: -5, scale: 0.88, opacity: 0.76, dur: 10,  delay: 0.6 },
  { title: "LED Dance Floor",       when: "Sat, Jul 12 · 6–11 PM", payout: "$700", status: "Confirmed", pos: { top: "40%", left: "-2%" },  rot: -4, scale: 1,    opacity: 0.95, dur: 9,   delay: 1.8 },
  { title: "Taco Cart",             when: "Fri, Jul 4 · 4–9 PM",   payout: "$390", status: "Pending",   pos: { top: "44%", right: "-3%" }, rot: 5,  scale: 0.98, opacity: 0.92, dur: 8,   delay: 3 },
  { title: "Balloon Garland",       when: "Sun, Jun 22 · 9 AM",    payout: "$150", status: "Confirmed", pos: { top: "62%", left: "8%" },   rot: 7,  scale: 0.9,  opacity: 0.8,  dur: 9.5, delay: 0.9 },
  { title: "Cotton Candy Cart",     when: "Sun, Jul 13 · 1–5 PM",  payout: "$120", status: "Confirmed", pos: { top: "66%", right: "9%" },  rot: -6, scale: 0.92, opacity: 0.84, dur: 7,   delay: 2.1 },
  { title: "Mechanical Bull",       when: "Sat, Jul 19 · 3–8 PM",  payout: "$450", status: "Pending",   pos: { top: "80%", left: "22%" },  rot: -3, scale: 0.84, opacity: 0.66, dur: 10,  delay: 1.5 },
  { title: "Kids Table & Chairs",   when: "Sun, Jul 20 · 10 AM",   payout: "$95",  status: "Confirmed", pos: { top: "83%", right: "20%" }, rot: 4,  scale: 0.86, opacity: 0.7,  dur: 8.5, delay: 2.7 },
];

export default function ScatteredBookings() {
  const { t } = useTranslation();
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 hidden lg:block">
      {CARDS.map((c) => (
        // Three nested layers: position, then rotation/scale/depth, then the
        // drift animation — so the keyframe's transform can't clobber the tilt.
        <div key={c.title} className="absolute" style={c.pos}>
          <div style={{ transform: `rotate(${c.rot}deg) scale(${c.scale})`, opacity: c.opacity }}>
            <div
              className="landing-card-drift"
              style={{ animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
            >
              <div className="w-[260px] rounded-xl border border-[rgba(74,106,125,0.16)] bg-white/90 p-2.5 text-left shadow-[0_12px_34px_rgba(74,106,125,0.10)] backdrop-blur-[2px]">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-sans text-[0.78rem] font-semibold leading-snug text-[#2a3a42]">{c.title}</p>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="font-sans text-[0.7rem] text-[#9aacb4]">{c.when}</p>
                  <p className="whitespace-nowrap font-sans text-[0.7rem] font-semibold text-[#4a6a7d]">
                    {t("demoDashboard.bookings.estPayout")} {c.payout}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
