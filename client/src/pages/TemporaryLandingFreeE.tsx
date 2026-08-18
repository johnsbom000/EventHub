import { useTranslation, Trans } from "react-i18next";
import { Bar, Header, Footer, PrimaryButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import CommissionPlanSection from "@/pages/landing/CommissionPlanSection";
import FaqSection from "@/pages/landing/FaqSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import VendorDashboardDemo from "@/pages/landing/VendorDashboardDemo";
import type { PricingModel } from "@/hooks/usePricingModel";

/* Direction E — "Demand-led": showing customer demand (the booking flow they'll
   follow) motivates vendors. Split hero: dark copy left + booking demo right. */

const NS = "landingFreeE";

export default function TemporaryLandingFreeE({ model }: { model: PricingModel }) {
  const { t } = useTranslation();
  const { handleSignupCta, handleProCta, openLogin, modals } = useLandingSignup(NS, model);
  // Commission copy lives in the `…Comm` sibling namespace, which holds ONLY the
  // strings that differ (top bar, trust line, Pro-flavoured CTAs). Everything it
  // omits falls back to the base namespace, so the two arms stay identical
  // apart from the money story.
  const k = (key: string): string[] =>
    model === "commission" ? [`${NS}Comm.${key}`, `${NS}.${key}`] : [`${NS}.${key}`];

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40">
        <Bar theme="dark">
          <span>
            <span className="font-semibold text-[#9dd4cc]">{t(k("bar.lead"))}</span> {t(k("bar.text"))}
          </span>
        </Bar>
        <Header cta={t(k("header.getStarted"))} onSignup={() => handleSignupCta("header_get_started")} onLogin={openLogin} />
      </div>

      {/* Split hero */}
      <section className="grid min-h-[calc(100svh-90px)] lg:grid-cols-2">
        <div className="order-1 flex flex-col justify-center bg-[#2a3a42] px-6 py-16 lg:px-12 lg:py-24 xl:px-20">
          <div className="mx-auto w-full max-w-[540px]">
            <h1 className="font-heading text-[clamp(2.6rem,5.4vw,4.3rem)] font-light leading-[1.02] text-[#f5f0e8]">
              <Trans i18nKey={k("hero.title")} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h1>
            <p className="mt-6 max-w-md font-sans text-[1.2rem] leading-[1.6] text-[rgba(245,240,232,0.82)]">
              {t(k("hero.subtitle"))}
            </p>
            {/* CTA is centered on the trust line beneath it */}
            <div className="mt-9 inline-flex flex-col items-center">
              <PrimaryButton onClick={() => handleSignupCta("hero_primary")} className="!text-[1.1rem]">
                {t(k("hero.ctaPrimary"))}
              </PrimaryButton>
              <p className="mt-6 font-sans text-[0.95rem] text-[rgba(245,240,232,0.6)]">{t(k("hero.trust"))}</p>
            </div>
          </div>
        </div>
        <div className="order-2 flex items-center bg-[#f8fafb] px-6 py-16 lg:py-24">
          <div className="mx-auto w-full max-w-[480px]">
            <VendorDashboardDemo still />
          </div>
        </div>
      </section>

      {/* First thing below the fold. No top rule — the hero ends on this
          section's white edge. */}
      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} className="border-t-transparent" />

      <CustomerExperienceSection visual="hub" />
      <Testimonials theme="light" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />
      {/* Pricing. Each arm gets its own section and never both: the Free-vs-Pro
          table for subscription, the one-plan section for commission. The
          commission arm used to get nothing here, which left it with no pricing
          surface at all. */}
      {model === "subscription" && handleProCta && (
        <FreeVsProSection
          onStartFree={() => handleSignupCta("pricing_start_free")}
          onTryPro={() => handleProCta("pricing_try_pro")}
        />
      )}
      {model === "commission" && (
        <CommissionPlanSection onStartFree={() => handleSignupCta("pricing_start_free")} />
      )}
      <FaqSection />
      <Footer />

      {modals}
    </div>
  );
}
