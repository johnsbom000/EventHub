import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardList,
  Sparkles,
  DollarSign,
  MapPin,
  Truck,
  Image as ImageIcon,
  Paperclip,
  Check,
  Upload,
  Plus,
  ChevronLeft,
  ChevronRight,
  Pause,
} from "lucide-react";

/* ---------------------------------------------------------------------------
   Shared interactive "create a listing" demo used in every free-first landing
   variant (Directions A/B/C). Self-contained: its own card shell + sample tag,
   so it drops into any page. Edit here once and all three update.
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

// Illustrative sample photos "uploaded" during the Photos step. All four are the
// SAME red bounce house, each framing a different section (full unit, slide end,
// mid graphics, castle-tower end) so they read as different angles of one item —
// matching the demo listing "Backyard Bounce House Rental". (Free stock has no
// true multi-angle set of one house; focal-point crops are the faithful stand-in.)
const DEMO_PHOTO_BASE = "https://images.unsplash.com/photo-1765947389722-2e96d8c0aad9";
const DEMO_PHOTOS = [
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.52&fp-y=0.46&fp-z=1.05`,
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.40&fp-y=0.42&fp-z=1.9`,
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.56&fp-y=0.48&fp-z=1.9`,
  `${DEMO_PHOTO_BASE}?w=280&h=210&fit=crop&crop=focalpoint&fp-x=0.72&fp-y=0.46&fp-z=2.1`,
];
const DEMO_TITLE = "Backyard Bounce House Rental";
// Phases: 0..6 = the seven wizard steps, 7 = publishing, 8 = live. Then loops.
const DEMO_TOTAL = 9;

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

// Mirrors the real wizard's SINGLE_STEPS + STEP_META. Titles/subs resolve from
// i18n at render (demoWizard.steps.<key>) so the demo follows the toggle.
const WIZARD_STEPS = [
  { key: "basics", Icon: ClipboardList },
  { key: "perfectFor", Icon: Sparkles },
  { key: "pricing", Icon: DollarSign },
  { key: "serviceArea", Icon: MapPin },
  { key: "logistics", Icon: Truck },
  { key: "photos", Icon: ImageIcon },
  { key: "addons", Icon: Paperclip },
] as const;

// DEV-ONLY: pin a specific slide via ?demoStep=N for layout verification.
// Compiled out of production builds (import.meta.env.DEV).
const DEMO_PINNED_STEP: number | null = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("demoStep");
  return raw != null && /^[0-8]$/.test(raw) ? Number(raw) : null;
})();

export default function ListingWizardDemo() {
  const { t } = useTranslation();
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(DEMO_PINNED_STEP ?? 0);
  const [typed, setTyped] = useState(0);
  const [paused, setPaused] = useState(false);

  // Manual navigation (buttons + rail). Wraps around the 9 phases.
  const goBy = (dir: number) => setPhase((p) => ((p + dir) % DEMO_TOTAL + DEMO_TOTAL) % DEMO_TOTAL);
  const goTo = (next: number) => setPhase(((next % DEMO_TOTAL) + DEMO_TOTAL) % DEMO_TOTAL);

  // Reduced motion: hold the finished ("live") state once on mount. Still lets
  // the visitor click through manually afterward.
  const reducedPinnedRef = useRef(false);
  useEffect(() => {
    if (reduced && !reducedPinnedRef.current) {
      reducedPinnedRef.current = true;
      setPhase(8);
    }
  }, [reduced]);

  // Auto-advance every 3s. Keyed on `phase` so a manual click reschedules a full
  // interval; press-and-hold sets `paused` which cancels the pending advance
  // (released → a fresh interval starts). Disabled under reduced motion.
  useEffect(() => {
    if (reduced || paused || DEMO_PINNED_STEP != null) return;
    const id = window.setTimeout(() => setPhase((p) => (p + 1) % DEMO_TOTAL), 3000);
    return () => window.clearTimeout(id);
  }, [phase, paused, reduced]);

  // Typewriter for the listing title on the Basics step.
  useEffect(() => {
    if (reduced || phase !== 0) {
      setTyped(DEMO_TITLE.length);
      return;
    }
    setTyped(0);
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setTyped(n);
      if (n >= DEMO_TITLE.length) window.clearInterval(id);
    }, 55);
    return () => window.clearInterval(id);
  }, [phase, reduced]);

  const active = Math.min(phase, 6);
  const publishing = phase === 7;
  const live = phase >= 8;
  const isLast = active === 6;
  const step = WIZARD_STEPS[active];

  return (
    <Shell interactive className="w-full">
      {/* Press-and-hold anywhere pauses the auto-advance; release resumes. */}
      <div
        className="relative"
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
      <div className="flex">
        {/* Left step rail — mirrors the wizard's vertical icon nav (click to jump) */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-[rgba(74,106,125,0.22)] bg-white py-4">
          {WIZARD_STEPS.map((s, i) => {
            const isActive = i === active && !live;
            const isComplete = i < active || live;
            const Icon = s.Icon;
            return (
              <button
                type="button"
                key={s.key}
                aria-label={t("demoShared.goTo", { name: t(`demoWizard.steps.${s.key}.title`) })}
                onClick={() => goTo(i)}
                className={`flex h-9 w-9 items-center justify-center rounded-2xl transition-colors ${
                  isActive
                    ? "bg-[#4a6a7d] text-[#f5f0e8]"
                    : isComplete
                      ? "text-[#2f7a6b] hover:bg-[#eef4f2]"
                      : "text-[#9aacb4] hover:bg-[#f0f4f7]"
                }`}
              >
                {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </button>
            );
          })}
        </div>

        {/* Content column */}
        <div className="relative min-w-0 flex-1">
          {/* Step header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0">
              <h3 className="font-sans text-[1.5rem] font-semibold tracking-tight text-[#2a3a42]">
                {live ? t("demoWizard.liveTitle") : t(`demoWizard.steps.${step.key}.title`)}
              </h3>
              <p className="mt-1 line-clamp-2 h-[2.3rem] font-sans text-[0.82rem] leading-snug text-[#9aacb4]">
                {live ? t("demoWizard.liveSub") : t(`demoWizard.steps.${step.key}.sub`)}
              </p>
            </div>
            <SampleTag />
          </div>

          {/* Step body (fixed min-height so the card doesn't jump between steps) */}
          <div className="px-5 pb-4">
            <div className="h-[368px] overflow-hidden rounded-[14px] border border-[rgba(74,106,125,0.16)] bg-white p-4">
              {active === 0 && (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.category")}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(["rental", "service", "venue", "caterer"] as const).map((c, i) => (
                        <div
                          key={c}
                          className={`rounded-xl border px-2 py-1.5 text-center font-sans text-[0.7rem] font-medium ${
                            i === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-[#4a6a7d]"
                          }`}
                        >
                          {t(`demoWizard.categories.${c}`)}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.titleLabel")}</p>
                    <div className="flex h-8 items-center rounded-md border border-input bg-background px-3 font-sans text-[0.82rem] text-[#2a3a42]">
                      {DEMO_TITLE.slice(0, typed)}
                      {!reduced && typed < DEMO_TITLE.length && (
                        <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[#e07a6a] align-middle" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.included")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["a", "b", "c"] as const).map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-sans text-[0.72rem] text-[#2a3a42]">
                          <span aria-hidden>•</span>
                          {t(`demoWizard.includedChips.${k}`)}
                          <span className="text-[#9aacb4]">×</span>
                        </span>
                      ))}
                      <span className="inline-flex items-center rounded-lg border border-dashed border-[rgba(74,106,125,0.35)] px-2.5 py-1 font-sans text-[0.72rem] text-[#9aacb4]">
                        {t("demoWizard.includedPlaceholder")}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.notIncluded")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(["a", "b"] as const).map((k) => (
                        <span key={k} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 font-sans text-[0.72rem] text-[#2a3a42]">
                          <span aria-hidden>•</span>
                          {t(`demoWizard.notIncludedChips.${k}`)}
                          <span className="text-[#9aacb4]">×</span>
                        </span>
                      ))}
                      <span className="inline-flex items-center rounded-lg border border-dashed border-[rgba(74,106,125,0.35)] px-2.5 py-1 font-sans text-[0.72rem] text-[#9aacb4]">
                        {t("demoWizard.notIncludedPlaceholder")}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {active === 1 && (
                <div>
                  <p className="mb-2 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.perfectForLabel")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      ["💍", "weddings", true],
                      ["🏢", "corporate", true],
                      ["🍼", "babyShowers", true],
                      ["📸", "photoshoots", false],
                      ["🎂", "birthdays", true],
                      ["👰", "bridalShowers", false],
                      ["🎓", "graduations", false],
                      ["🎉", "holidayParties", true],
                      ["🎵", "concert", false],
                      ["💐", "proposal", false],
                      ["🍻", "bachelorParty", false],
                      ["💃", "bacheloretteParty", false],
                      ["❤️", "anniversary", false],
                      ["🎈", "genderReveal", true],
                      ["👑", "quinceanera", false],
                      ["🙏", "baptism", false],
                      ["🕊️", "funeral", false],
                      ["🤝", "reunion", false],
                      ["🗂️", "conference", false],
                      ["🏅", "sporting", false],
                      ["🪩", "schoolDance", false],
                      ["✨", "other", false],
                    ] as const).map(([emo, key, on]) => (
                      <span
                        key={key}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[0.74rem] font-medium ${
                          on ? "border-primary bg-primary/10 text-[#2a3a42]" : "border-border bg-background text-[#4a6a7d]"
                        }`}
                      >
                        <span>{emo}</span> {t(`demoWizard.events.${key}`)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {active === 2 && (
                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.bookingType")}</p>
                    <div className="flex gap-2">
                      <span className="rounded-md bg-primary px-3 py-1.5 font-sans text-[0.74rem] font-medium text-primary-foreground">{t("demoWizard.instantBook")}</span>
                      <span className="rounded-md border border-input px-3 py-1.5 font-sans text-[0.74rem] font-medium text-[#4a6a7d]">{t("demoWizard.requestToBook")}</span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.ratePerDay")}</p>
                    <div className="relative max-w-[160px]">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-sans text-[0.82rem] text-[#9aacb4]">$</span>
                      <div className="flex h-8 items-center rounded-md border border-input bg-background pl-7 pr-3 font-sans text-[0.82rem] text-[#2a3a42]">350</div>
                    </div>
                  </div>
                  <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-sans text-[0.78rem] font-semibold text-[#2a3a42]">{t("demoWizard.requireDeposit")}</p>
                      <span className="flex h-4 w-7 items-center justify-end rounded-full bg-[#4a6a7d] px-0.5">
                        <span className="h-3 w-3 rounded-full bg-white" />
                      </span>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[0.72rem] font-medium text-[#4a6a7d]">{t("demoWizard.depositAmount")}</p>
                      <div className="relative max-w-[160px]">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-sans text-[0.82rem] text-[#9aacb4]">$</span>
                        <div className="flex h-8 items-center rounded-md border border-input bg-background pl-7 pr-3 font-sans text-[0.82rem] text-[#2a3a42]">200</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {active === 3 && (
                <div className="space-y-3.5">
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.location")}</p>
                    <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 font-sans text-[0.84rem] text-[#2a3a42]">
                      <MapPin className="h-3.5 w-3.5 text-[#9aacb4]" /> Salt Lake City, UT
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.serviceRadius")}</p>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 rounded-full bg-[#eef4f2]">
                        <div className="h-1.5 w-3/5 rounded-full bg-[#4a6a7d]" />
                      </div>
                      <span className="font-sans text-[0.78rem] font-medium text-[#4a6a7d]">30 mi</span>
                    </div>
                  </div>
                </div>
              )}

              {active === 4 && (
                <div className="space-y-2.5">
                  <div className="space-y-2 rounded-xl border border-border p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-sans text-[0.8rem] text-[#2a3a42]">{t("demoWizard.doYouSetup")}</span>
                      <span className="inline-flex overflow-hidden rounded-lg border border-border font-sans text-[0.72rem] font-medium">
                        <span className="bg-primary px-3 py-1 text-primary-foreground">{t("demoWizard.yes")}</span>
                        <span className="border-l border-border bg-background px-3 py-1 text-[#9aacb4]">{t("demoWizard.no")}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-sans text-[0.8rem] text-[#2a3a42]">{t("demoWizard.isSetupFee")}</span>
                      <span className="inline-flex overflow-hidden rounded-lg border border-border font-sans text-[0.72rem] font-medium">
                        <span className="bg-primary px-3 py-1 text-primary-foreground">{t("demoWizard.yes")}</span>
                        <span className="border-l border-border bg-background px-3 py-1 text-[#9aacb4]">{t("demoWizard.no")}</span>
                      </span>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[0.72rem] font-medium text-[#4a6a7d]">{t("demoWizard.setupFee")}</p>
                      <div className="relative max-w-[140px]">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-sans text-[0.82rem] text-[#9aacb4]">$</span>
                        <div className="flex h-8 items-center rounded-md border border-input bg-background pl-7 pr-3 font-sans text-[0.82rem] text-[#2a3a42]">75</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 font-sans text-[0.76rem] font-semibold text-[#2a3a42]">{t("demoWizard.cancellationPolicy")}</p>
                    <div className="space-y-1">
                      {([
                        ["anytime", true],
                        ["window", false],
                        ["none", false],
                      ] as const).map(([key, on]) => (
                        <div
                          key={key}
                          className={`rounded-lg border p-2 ${on ? "border-primary bg-primary/5" : "border-border"}`}
                        >
                          <p className="font-sans text-[0.76rem] font-medium text-[#2a3a42]">{t(`demoWizard.policies.${key}.label`)}</p>
                          <p className="font-sans text-[0.7rem] leading-snug text-[#9aacb4]">{t(`demoWizard.policies.${key}.desc`)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {active === 5 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-sans text-[0.76rem] font-medium text-primary-foreground">
                      <Upload className="h-3.5 w-3.5" /> {t("demoWizard.addPhotos")}
                    </span>
                    <span className="font-sans text-[0.76rem] text-[#9aacb4]">{t("demoWizard.photosUploaded", { n: 4 })}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_PHOTOS.map((src) => (
                      <img key={src} src={src} alt="" className="h-[4.75rem] w-full rounded-md object-cover" />
                    ))}
                  </div>
                </div>
              )}

              {active === 6 && (
                <div className="space-y-3">
                  <p className="font-sans text-[0.76rem] font-medium text-[#9aacb4]">{t("demoWizard.attachedAddons")}</p>
                  {(["setupStyling", "extraHour"] as const).map((key) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(74,106,125,0.16)] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Check className="h-4 w-4 shrink-0 text-[#2f7a6b]" />
                        <div>
                          <p className="font-sans text-[0.8rem] font-medium text-[#2a3a42]">{t(`demoWizard.addons.${key}.name`)}</p>
                          <p className="font-sans text-[0.7rem] text-[#9aacb4]">{t(`demoWizard.addons.${key}.meta`)}</p>
                        </div>
                      </div>
                      <span className="font-sans text-[1.05rem] leading-none text-[#9aacb4]">×</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 font-sans text-[0.76rem] font-medium text-[#4a6a7d]">
                      <Plus className="h-3.5 w-3.5" /> {t("demoWizard.attachExisting")}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-sans text-[0.76rem] font-medium text-primary-foreground">
                      <Plus className="h-3.5 w-3.5" /> {t("demoWizard.createNew")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer nav — mirrors the wizard's Back / Save draft / Continue-Publish */}
          <div className="flex items-center justify-between gap-2 border-t border-[rgba(74,106,125,0.12)] px-5 py-3">
            <span className="rounded-[10px] border border-[rgba(74,106,125,0.28)] px-4 py-1.5 font-sans text-[0.8rem] font-medium text-[#4a6a7d]">{t("demoShared.back")}</span>
            <div className="flex items-center gap-2.5">
              <span className="font-sans text-[0.78rem] text-[#9aacb4]">{t("demoWizard.draftSaved")}</span>
              <span
                className={`rounded-[10px] px-4 py-1.5 font-sans text-[0.82rem] font-semibold text-white transition-all duration-300 ${
                  isLast ? "bg-[#e07a6a]" : "bg-primary text-primary-foreground"
                } ${publishing ? "scale-[0.97] brightness-95" : ""}`}
              >
                {isLast ? (publishing ? t("demoWizard.publishing") : t("demoWizard.publish")) : t("demoWizard.continue")}
              </span>
            </div>
          </div>

          {/* Published overlay */}
          {live && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-white/95 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2f7a6b] text-white">
                <Check className="h-6 w-6" />
              </div>
              <p className="font-heading text-[1.4rem] leading-tight text-[#2a3a42]">{t("demoWizard.liveOverlay")}</p>
              <p className="font-sans text-[0.84rem] text-[#9aacb4]">{DEMO_TITLE} · $350/day</p>
            </div>
          )}
        </div>
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
            {WIZARD_STEPS.map((s, i) => (
              <span
                key={s.key}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  !live && i === active
                    ? "w-4 bg-[#e07a6a]"
                    : i < active || live
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
