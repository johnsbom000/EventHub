import { useTranslation, Trans } from "react-i18next";
import { Header, Closing, Footer, PrimaryButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import FaqSection from "@/pages/landing/FaqSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import ScatteredBookings from "@/pages/landing/ScatteredBookings";

/* Direction D — "Frictionless" (Hick's law): removing choices (one CTA, minimal
   page) wins. Minimal header, centered single-column hero. */

const NS = "landingFreeD";

export default function TemporaryLandingFreeD() {
  const { t } = useTranslation();
  const { handleSignupCta, handleProCta, openLogin, modals } = useLandingSignup(NS);

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40">
        <Header
          cta={t(`${NS}.header.getStarted`)}
          onSignup={() => handleSignupCta("header_get_started")}
          onLogin={openLogin}
          className="border-transparent bg-[#f5f0e8]"
        />
      </div>

      {/* Hero — min-height fills the viewport below the 60px sticky header, so
          "How it works" stays below the fold at any screen height. The column
          centers the copy vertically in that space. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#f5f0e8] to-white">
        <ScatteredBookings />
        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-60px)] max-w-[820px] flex-col justify-center px-5 py-20 text-center lg:py-28">
          <h1 className="mx-auto max-w-[16ch] font-heading text-[clamp(2.9rem,6.4vw,4.9rem)] font-light leading-[1.02] text-[#2a3a42]">
            <Trans i18nKey={`${NS}.hero.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
          </h1>
          <p className="mx-auto mt-6 max-w-[42ch] font-sans text-[1.25rem] leading-[1.55] text-[#4a6a7d]">
            {t(`${NS}.hero.subtitle`)}
          </p>
          <div className="mt-9 flex justify-center">
            <PrimaryButton onClick={() => handleSignupCta("hero_primary")} className="!px-10 !py-4 !text-[1.15rem]">
              {t(`${NS}.hero.ctaPrimary`)}
            </PrimaryButton>
          </div>
          <p className="mt-5 font-sans text-[0.95rem] text-[#9aacb4]">{t(`${NS}.hero.trust`)}</p>
        </div>
      </section>

      {/* No top rule — the hero above already fades to this section's white. */}
      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} className="border-t-transparent" />
      <CustomerExperienceSection visual="hub" />
      <Testimonials theme="light" layout="stacked" eyebrowKey={`${NS}.testimonials.eyebrow`} />
      <FreeVsProSection
        treatment="nocard"
        onStartFree={() => handleSignupCta("pricing_start_free")}
        onTryPro={() => handleProCta("pricing_try_pro")}
      />
      <FaqSection />
      <Closing
        onSignup={() => handleSignupCta("closing_cta")}
        theme="cream"
        title={<Trans i18nKey={`${NS}.closing.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />}
        subtitle={t(`${NS}.closing.subtitle`)}
      />
      <Footer />

      {modals}
    </div>
  );
}
