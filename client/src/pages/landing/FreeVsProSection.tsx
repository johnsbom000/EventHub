import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Eyebrow } from "@/pages/landing/primitives";

/* ---------------------------------------------------------------------------
   Shared "Free vs Pro" pricing section (comparison-table layout with a
   monthly/annual toggle). Two CTAs:
     • Start free   → onStartFree  (free vendor account)
     • Try Pro free → onTryPro     (DEFERRED: currently a free vendor account
                                    too, tagged pro; see landing/signup.tsx)
   Copy lives in the shared `plans` i18n block; prices mirror the real Pro plan
   ($29/mo, $24/mo annual = $290/yr). Verify figures against billing before any
   real Pro-trial wiring.
--------------------------------------------------------------------------- */

// free/pro cell value: true = included, false = not, or a string label.
type CellValue = boolean | string;

const ROWS: { key: string; free: CellValue; pro: CellValue }[] = [
  { key: "storefront", free: true, pro: true },
  { key: "bookings", free: true, pro: true },
  { key: "messaging", free: true, pro: true },
  { key: "payouts", free: true, pro: true },
  { key: "reminders", free: true, pro: true },
  { key: "listings", free: "1", pro: "unlimited" },
  { key: "ai", free: false, pro: true },
  { key: "discounts", free: false, pro: true },
  { key: "reputation", free: false, pro: true },
  { key: "analytics", free: false, pro: true },
  { key: "calendar", free: false, pro: true },
];

// Risk-reduction strip. The second item is treatment-specific: the no-card arm
// (B/D) truthfully advertises "no credit card required"; the card-upfront arm
// (A/C/E) must NOT — instead it reassures that we'll remind them before the trial
// renews, so the copy always matches what the flow actually does.
const RISK_KEYS_NOCARD = ["trial", "noCard", "cancel", "keepFree"] as const;
const RISK_KEYS_CARD = ["trial", "reminder", "cancel", "keepFree"] as const;

export default function FreeVsProSection({
  onStartFree,
  onTryPro,
  animated = false,
  treatment = "nocard",
}: {
  onStartFree: () => void;
  onTryPro: () => void;
  // When true, applies the landing "moving palette" treatment (deal-outline ring
  // on the comparison card + deal-fill gradient on the Try Pro button), matching
  // the launch-deal animation on the original TemporaryLanding page.
  animated?: boolean;
  // Which Pro-trial arm this page is in — drives the reassurance copy. The
  // card-upfront arm is paused, so this defaults to "nocard" (no-card promise
  // shown). Set to "card" only if the card-vs-no-card A/B is re-enabled.
  treatment?: "card" | "nocard";
}) {
  const { t } = useTranslation();
  const [annual, setAnnual] = useState(true);
  const riskKeys = treatment === "nocard" ? RISK_KEYS_NOCARD : RISK_KEYS_CARD;

  const Cell = ({ v, pro }: { v: CellValue; pro?: boolean }) => {
    if (v === true)
      return (
        <span
          className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[0.68rem] font-bold ${
            pro ? "bg-[#e07a6a] text-white" : "bg-[#fdeee9] text-[#e07a6a]"
          }`}
        >
          ✓
        </span>
      );
    if (v === false) return <span className="font-sans text-[1.1rem] text-[#c3cfd6]">–</span>;
    const label = v === "unlimited" ? t("plans.unlimited") : v;
    return (
      <span className={`font-sans text-[0.95rem] font-semibold ${pro ? "text-[#2a3a42]" : "text-[#4a6a7d]"}`}>
        {label}
      </span>
    );
  };

  return (
    <section className="border-t border-[rgba(74,106,125,0.08)] bg-[#f8fafb]">
      <div className="mx-auto max-w-[920px] px-5 py-16 lg:px-10 lg:py-20">
        <div className="mx-auto mb-7 max-w-2xl text-center">
          <Eyebrow>{t("plans.eyebrow")}</Eyebrow>
          <h2 className="mt-4 font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">
            {t("plans.title")}
          </h2>
          {t("plans.subtitle") && (
            <p className="mt-4 font-sans text-[1.15rem] leading-[1.6] text-[#4a6a7d]">{t("plans.subtitle")}</p>
          )}
        </div>

        {/* Billing toggle */}
        <div className="mb-6 flex items-center justify-center">
          <div className="inline-flex items-center rounded-full border border-[rgba(74,106,125,0.18)] bg-white p-1 shadow-[0_4px_16px_rgba(74,106,125,0.06)]">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 font-sans text-[0.92rem] font-semibold transition-colors ${
                !annual ? "bg-[#2a3a42] text-white" : "text-[#4a6a7d] hover:text-[#2a3a42]"
              }`}
            >
              {t("plans.toggle.monthly")}
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 rounded-full px-5 py-2 font-sans text-[0.92rem] font-semibold transition-colors ${
                annual ? "bg-[#2a3a42] text-white" : "text-[#4a6a7d] hover:text-[#2a3a42]"
              }`}
            >
              {t("plans.toggle.annual")}
              <span
                className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.06em] ${
                  annual ? "bg-[#9dd4cc] text-[#2a3a42]" : "bg-[#e6f3f1] text-[#3f7d75]"
                }`}
              >
                {t("plans.toggle.save")}
              </span>
            </button>
          </div>
        </div>

        {/* Comparison table */}
        <div
          className={`overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_rgba(74,106,125,0.10)] ${
            animated ? "deal-outline" : "border border-[rgba(74,106,125,0.14)]"
          }`}
          style={animated ? ({ ["--ring" as any]: "2.5px" }) : undefined}
        >
          {/* Plan header row */}
          <div className="grid grid-cols-[1.6fr_1fr_1fr] items-end gap-2 border-b border-[rgba(74,106,125,0.1)] px-5 py-4 sm:grid-cols-[2fr_1fr_1fr] sm:px-8">
            <div className="hidden sm:block">
              <p className="font-sans text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-[#9aacb4]">
                {t("plans.compare")}
              </p>
            </div>
            <div className="text-center">
              <p className="font-heading text-[1.3rem] font-normal text-[#2a3a42]">{t("plans.free.title")}</p>
              <p className="mt-0.5 font-heading text-[1.65rem] font-light leading-none text-[#2a3a42]">$0</p>
              <p className="mt-0.5 font-sans text-[0.75rem] text-[#9aacb4]">{t("plans.free.note")}</p>
            </div>
            <div className="relative rounded-[16px] bg-[#fdeee9] px-2 py-2.5 text-center">
              <span className="mb-0.5 inline-block rounded-full bg-[#e07a6a] px-2.5 py-0.5 font-sans text-[0.62rem] font-bold uppercase tracking-[0.1em] text-white">
                {t("plans.pro.badge")}
              </span>
              <p className="font-heading text-[1.3rem] font-normal text-[#2a3a42]">{t("plans.pro.title")}</p>
              <p className="mt-0.5 font-heading text-[1.65rem] font-light leading-none text-[#2a3a42]">
                ${annual ? "24" : "29"}
                <span className="font-sans text-[0.8rem] font-normal text-[#4a6a7d]">{t("plans.perMonth")}</span>
              </p>
              <p className="mt-0.5 font-sans text-[0.75rem] font-medium text-[#e07a6a]">
                {t("plans.perDay", { amount: annual ? "0.79" : "0.95" })}
              </p>
              <p className="font-sans text-[0.7rem] text-[#9aacb4]">
                {annual ? t("plans.billedAnnual") : t("plans.billedMonthly")}
              </p>
            </div>
          </div>

          {/* Feature rows */}
          <div>
            {ROWS.map((r, i) => (
              <div
                key={r.key}
                className={`grid grid-cols-[1.6fr_1fr_1fr] items-center gap-2 px-5 py-2 sm:grid-cols-[2fr_1fr_1fr] sm:px-8 ${
                  i % 2 ? "bg-[#f8fafb]" : "bg-white"
                }`}
              >
                <span className="font-sans text-[0.92rem] leading-snug text-[#2a3a42]">{t(`plans.rows.${r.key}`)}</span>
                <span className="text-center">
                  <Cell v={r.free} />
                </span>
                <span className="bg-[#fdeee9]/40 py-1 text-center">
                  <Cell v={r.pro} pro />
                </span>
              </div>
            ))}
          </div>

          {/* CTA row */}
          <div className="grid grid-cols-1 gap-3 border-t border-[rgba(74,106,125,0.1)] px-5 py-5 sm:grid-cols-[2fr_1fr_1fr] sm:items-center sm:px-8">
            <p className="hidden font-sans text-[0.95rem] leading-snug text-[#4a6a7d] sm:block">
              {t("plans.reassurance")}
            </p>
            <button
              type="button"
              onClick={onStartFree}
              className="rounded-full border-2 border-[#4a6a7d]/30 bg-white px-5 py-3 font-sans text-[0.98rem] font-semibold text-[#4a6a7d] transition-colors hover:border-[#4a6a7d] hover:bg-[#f0f4f7]"
            >
              {t("plans.free.cta")}
            </button>
            <button
              type="button"
              onClick={onTryPro}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 font-sans text-[0.98rem] font-semibold text-white ${
                animated
                  ? "deal-fill"
                  : "bg-[#e07a6a] transition-colors hover:bg-[#c96959]"
              }`}
            >
              {t("plans.pro.cta")}
              <ChevronRight className="h-[1.05em] w-[1.05em]" />
            </button>
          </div>

          {/* Risk-reduction strip */}
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t border-[rgba(74,106,125,0.1)] bg-[#f8fafb] px-5 py-4 sm:px-8">
            {riskKeys.map((k) => (
              <span key={k} className="flex items-center gap-2 font-sans text-[0.95rem] font-medium text-[#4a6a7d]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e6f3f1] text-[0.65rem] font-bold text-[#3f7d75]">
                  ✓
                </span>
                {t(`plans.risk.${k}`)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
