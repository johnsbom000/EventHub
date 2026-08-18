import { useTranslation, Trans } from "react-i18next";
import { Bar, Header, Footer, PrimaryButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import FaqSection from "@/pages/landing/FaqSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import VendorDashboardDemo from "@/pages/landing/VendorDashboardDemo";

/* Direction E — "Demand-led": showing customer demand (the booking flow they'll
   follow) motivates vendors. Split hero: dark copy left + booking demo right. */

const NS = "landingFreeE";

export default function TemporaryLandingFreeE() {
  const { t } = useTranslation();
  const { handleSignupCta, handleProCta, openLogin, modals } = useLandingSignup(NS);

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40">
        <Bar theme="dark">
          <span>
            <span className="font-semibold text-[#9dd4cc]">{t(`${NS}.bar.lead`)}</span> {t(`${NS}.bar.text`)}
          </span>
        </Bar>
        <Header cta={t(`${NS}.header.getStarted`)} onSignup={() => handleSignupCta("header_get_started")} onLogin={openLogin} />
      </div>

      {/* Split hero */}
      <section className="grid min-h-[calc(100svh-90px)] lg:grid-cols-2">
        <div className="order-1 flex flex-col justify-center bg-[#2a3a42] px-6 py-16 lg:px-12 lg:py-24 xl:px-20">
          <div className="mx-auto w-full max-w-[540px]">
            <h1 className="font-heading text-[clamp(2.6rem,5.4vw,4.3rem)] font-light leading-[1.02] text-[#f5f0e8]">
              <Trans i18nKey={`${NS}.hero.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h1>
            <p className="mt-6 max-w-md font-sans text-[1.2rem] leading-[1.6] text-[rgba(245,240,232,0.82)]">
              {t(`${NS}.hero.subtitle`)}
            </p>
            {/* CTA is centered on the trust line beneath it */}
            <div className="mt-9 inline-flex flex-col items-center">
              <PrimaryButton onClick={() => handleSignupCta("hero_primary")} className="!text-[1.1rem]">
                {t(`${NS}.hero.ctaPrimary`)}
              </PrimaryButton>
              <p className="mt-6 font-sans text-[0.95rem] text-[rgba(245,240,232,0.6)]">{t(`${NS}.hero.trust`)}</p>
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
      <FreeVsProSection
        onStartFree={() => handleSignupCta("pricing_start_free")}
        onTryPro={() => handleProCta("pricing_try_pro")}
      />
      <FaqSection />
      <Footer />

      {modals}
    </div>
  );
}
