import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Eyebrow } from "@/pages/landing/primitives";

/* ---------------------------------------------------------------------------
   Commission-arm pricing section — the Model B counterpart to
   FreeVsProSection.

   Why this exists: every landing page gated FreeVsProSection behind
   `model === "subscription"` on the reasoning that "there is one tier, so the
   section is omitted". One tier still has a price, and omitting it left the
   commission arm with NO pricing surface anywhere on the page. That is both a
   disclosure gap and an experiment-validity problem: the subscription arm was
   shown a full priced comparison while the commission arm was shown nothing,
   so the test would partly have measured disclosure rather than pricing
   preference.

   Copy rules (enforced by tests/landing-commission-copy.test.ts):
     • No "Pro", no "upgrade", no subscription price — none of that exists here.
     • The commission RATE is deliberately not printed. Subscription prices and
       "Free" are fine to state; the rate is not. So the footnote points at
       /terms, which states every rate exactly — without it the section names no
       fee figure at all and a visitor has no route to one before signing up.
     • No unqualified perpetual promises ("ever", "forever", "always") — the
       Terms reserve the right to change fees.

   Copy lives in the shared `landingShared.commissionPlan` block, which the copy
   guard scans, rather than being duplicated into each page's `…Comm` namespace.
--------------------------------------------------------------------------- */

const POINTS = ["noCard", "noCommitment", "noBookingNoPay"] as const;

export default function CommissionPlanSection({
  onStartFree,
  animated = false,
}: {
  onStartFree: () => void;
  // When true, applies the landing "moving palette" ring, matching the
  // launch-deal animation FreeVsProSection uses on the animated pages.
  animated?: boolean;
}) {
  const { t } = useTranslation();
  const b = (key: string) => t(`landingShared.commissionPlan.${key}`);

  return (
    <section className="border-t border-[rgba(74,106,125,0.08)] bg-[#f8fafb]">
      <div className="mx-auto max-w-[920px] px-5 py-16 lg:px-10 lg:py-20">
        <div className="mx-auto mb-7 max-w-2xl text-center">
          <Eyebrow>{b("eyebrow")}</Eyebrow>
          <h2 className="mt-4 font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">
            {b("title")}
          </h2>
          <p className="mt-4 font-sans text-[1.15rem] leading-[1.6] text-[#4a6a7d]">{b("subtitle")}</p>
        </div>

        <div
          className={`overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_rgba(74,106,125,0.10)] ${
            animated ? "deal-outline" : "border border-[rgba(74,106,125,0.14)]"
          }`}
          style={animated ? ({ ["--ring" as any]: "2.5px" }) : undefined}
        >
          {/* What the vendor pays, stated as the three things that are true of
              it — no rate, no monthly line. */}
          <div className="grid gap-4 px-5 py-8 sm:grid-cols-3 sm:px-8">
            {POINTS.map((key) => (
              <div key={key} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e6f3f1] text-[0.7rem] font-bold text-[#3f7d75]">
                  ✓
                </span>
                <span className="font-sans text-[1rem] leading-snug text-[#2a3a42]">{b(`points.${key}`)}</span>
              </div>
            ))}
          </div>

          {/* Customer-side disclosure: the service fee is added at checkout and
              is the customer's, not the vendor's. */}
          <div className="border-t border-[rgba(74,106,125,0.1)] bg-[#f8fafb] px-5 py-4 sm:px-8">
            <p className="font-sans text-[0.95rem] leading-snug text-[#4a6a7d]">{b("customerFee")}</p>
          </div>

          {/* Fee footnote. This section deliberately prints no rate; Terms state
              every rate exactly, so this is the visitor's route to the figures
              before they sign up. Mirrors plans.feeNote in FreeVsProSection. */}
          <div className="border-t border-[rgba(74,106,125,0.1)] px-5 pt-3 sm:px-8">
            <p className="font-sans text-[0.78rem] leading-snug text-[#9aacb4]">
              {b("feeNote")}{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-[#4a6a7d]"
              >
                {b("feeNoteLink")}
              </a>
              .
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 px-5 py-6 sm:flex-row sm:justify-between sm:px-8">
            <p className="font-sans text-[0.95rem] leading-snug text-[#4a6a7d]">{b("reassurance")}</p>
            <button
              type="button"
              onClick={onStartFree}
              className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-6 py-3 font-sans text-[0.98rem] font-semibold text-white ${
                animated ? "deal-fill" : "bg-[#e07a6a] transition-colors hover:bg-[#c96959]"
              }`}
            >
              {b("cta")}
              <ChevronRight className="h-[1.05em] w-[1.05em]" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
