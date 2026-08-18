import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Eyebrow } from "@/pages/landing/primitives";

/* ---------------------------------------------------------------------------
   Shared FAQ section — sits directly under the "Upgrade to Pro" pricing block
   on every free-first variant. Native <details> accordion (no JS state); the
   first item starts open for discoverability.

   Copy lives in the shared `landingShared.faq` block (en/es/pt), so editing it
   once updates every direction.
--------------------------------------------------------------------------- */

const FAQ_KEYS = ["q1", "q2", "q3"] as const;

export default function FaqSection({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <section className={`border-y border-[rgba(74,106,125,0.08)] bg-white ${className}`}>
      <div className="mx-auto max-w-[820px] px-5 py-20 lg:px-10 lg:py-24">
        <div className="mb-10 text-center">
          <Eyebrow>{t("landingShared.faq.eyebrow")}</Eyebrow>
          <h2 className="mt-3 font-heading text-[2.2rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[2.9rem]">
            {t("landingShared.faq.title")}
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
                {t(`landingShared.faq.${k}.q`)}
                <ChevronDown className="h-5 w-5 shrink-0 text-[#4a6a7d] transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="mt-4 font-sans text-[1.02rem] leading-[1.65] text-[#4a6a7d]">
                {t(`landingShared.faq.${k}.a`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
