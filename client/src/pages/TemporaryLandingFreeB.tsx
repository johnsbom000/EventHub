import { useTranslation, Trans } from "react-i18next";
import { Bar, Header, Footer, PrimaryButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import FaqSection from "@/pages/landing/FaqSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import VendorDashboardDemo from "@/pages/landing/VendorDashboardDemo";
import type { PricingModel } from "@/hooks/usePricingModel";

/* Direction B — "More bookings, less work": the earnings payoff is the
   strongest driver. Dark hero + storefront demo.

   NOTE: this page's pitch was originally built on a zero-fee promise ("keep
   100%", "0% commission"). That premise is false now that free-tier vendors pay
   the 8% commission, so the fee claims were removed. Rewriting Direction B's
   money story into something both accurate and compelling is a marketing
   decision that has NOT been made — the copy here is currently neutral. */

const NS = "landingFreeB";

export default function TemporaryLandingFreeB({ model }: { model: PricingModel }) {
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
        <Bar theme="dark">{t(k("bar.text"))}</Bar>
        <Header cta={t(k("header.getStarted"))} onSignup={() => handleSignupCta("header_get_started")} onLogin={openLogin} />
      </div>

      {/* Hero */}
      <section className="bg-[#2a3a42]">
        <div className="mx-auto grid min-h-[calc(100svh-90px)] max-w-[1320px] items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-24">
          <div>
            <h1 className="font-heading text-[clamp(2.7rem,5.8vw,4.5rem)] font-light leading-[1.02] text-[#f5f0e8]">
              <Trans i18nKey={k("hero.title")} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h1>
            <p className="mt-6 max-w-lg font-sans text-[1.2rem] leading-[1.6] text-[rgba(245,240,232,0.82)]">
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
          <div>
            <VendorDashboardDemo still />
          </div>
        </div>
      </section>

      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} />
      <CustomerExperienceSection visual="hub" />
      {/* Free-vs-Pro pricing has no meaning under the commission model: there is
          one tier, so the section is omitted rather than restated. */}
      {model === "subscription" && handleProCta && (
        <FreeVsProSection
          treatment="nocard"
          onStartFree={() => handleSignupCta("pricing_start_free")}
          onTryPro={() => handleProCta("pricing_try_pro")}
        />
      )}
      <FaqSection />
      <Testimonials theme="dark" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />

      <Footer />

      {modals}
    </div>
  );
}
