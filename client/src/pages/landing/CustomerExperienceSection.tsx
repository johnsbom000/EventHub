import { useTranslation, Trans } from "react-i18next";
import { Eye, CalendarCheck, Sparkles } from "lucide-react";
import BookingFlowDemo from "@/pages/landing/BookingFlowDemo";
import VendorHubStill from "@/pages/landing/VendorHubStill";

/* ---------------------------------------------------------------------------
   Shared "Customer Experience" section used by every free-first landing
   variant. Shows the customer-side BookingFlowDemo beside three pillars —
   transparency, independence, ease. Self-contained styling (its own cream
   band + typography) so it drops into any page and stays consistent. Copy is
   in the shared `customerExp` i18n block. Edit here once, all variants update.
--------------------------------------------------------------------------- */

const PILLARS = [
  { key: "transparency", Icon: Eye },
  { key: "independence", Icon: CalendarCheck },
  { key: "ease", Icon: Sparkles },
] as const;

export default function CustomerExperienceSection({
  storefrontImages,
  visual = "booking",
}: {
  storefrontImages?: string[];
  // Which artwork sits beside the pillars. "booking" is the animated
  // customer-side BookingFlowDemo; "hub" is the static vendor-hub poster.
  // Variants whose hero already shows the hub still keep "booking" here so the
  // same artwork never appears twice on one page.
  visual?: "booking" | "hub";
} = {}) {
  const { t } = useTranslation();

  return (
    <section className="border-y border-[rgba(74,106,125,0.08)] bg-[#f5f0e8]">
      <div className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          {/* Left — copy + three pillars */}
          <div>
            <span className="font-sans text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-[#9aacb4]">
              {t("customerExp.eyebrow")}
            </span>
            <h2 className="mt-4 font-heading text-[clamp(2.1rem,4vw,3.1rem)] font-light leading-[1.08] text-[#2a3a42]">
              <Trans i18nKey="customerExp.title" components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h2>
            {t("customerExp.subtitle") && (
              <p className="mt-5 max-w-lg font-sans text-[1.08rem] leading-[1.6] text-[#4a6a7d]">
                {t("customerExp.subtitle")}
              </p>
            )}

            <ul className="mt-9 space-y-6">
              {PILLARS.map(({ key, Icon }) => (
                <li key={key} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#4a6a7d] shadow-[0_4px_16px_rgba(74,106,125,0.12)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-sans text-[1.02rem] font-semibold text-[#2a3a42]">
                      {t(`customerExp.${key}.title`)}
                    </p>
                    <p className="mt-1 font-sans text-[0.95rem] leading-[1.55] text-[#4a6a7d]">
                      {t(`customerExp.${key}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — booking demo, or the vendor-hub still */}
          <div className="mx-auto w-full max-w-[520px]">
            {visual === "hub" ? <VendorHubStill /> : <BookingFlowDemo storefrontImages={storefrontImages} />}
          </div>
        </div>
      </div>
    </section>
  );
}
