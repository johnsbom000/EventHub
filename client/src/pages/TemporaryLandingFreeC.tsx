import { useTranslation, Trans } from "react-i18next";
import { Bar, Header, Closing, Footer, PrimaryButton, GhostButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import ListingWizardDemo from "@/pages/landing/ListingWizardDemo";
import { VARIED_STOREFRONT_IMAGES } from "@/pages/landing/BookingFlowDemo";

/* Direction C — "Proof-first": product-trust signals (clear pricing, live
   availability, secure Stripe) convert best. Cream→white gradient hero. */

const NS = "landingFreeC";

export default function TemporaryLandingFreeC() {
  const { t } = useTranslation();
  const { handleSignupCta, handleProCta, openLogin, modals } = useLandingSignup(NS);

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40">
        <Bar theme="cream">
          <span>
            <span className="font-semibold text-[#e07a6a]">{t(`${NS}.bar.lead`)}</span> {t(`${NS}.bar.text`)}
          </span>
        </Bar>
        <Header cta={t(`${NS}.header.getStarted`)} onSignup={() => handleSignupCta("header_get_started")} onLogin={openLogin} />
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#f5f0e8] to-white">
        <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-20">
          <div>
            <h1 className="font-heading text-[clamp(2.6rem,5.6vw,4.3rem)] font-light leading-[1.02] text-[#2a3a42]">
              <Trans i18nKey={`${NS}.hero.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h1>
            <p className="mt-6 max-w-lg font-sans text-[1.2rem] leading-[1.6] text-[#4a6a7d]">{t(`${NS}.hero.subtitle`)}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={() => handleSignupCta("hero_primary")} className="!text-[1.1rem]">
                {t(`${NS}.hero.ctaPrimary`)}
              </PrimaryButton>
              <GhostButton onClick={openLogin} className="text-[#4a6a7d] hover:text-[#2a3a42]">
                {t("landingShared.logIn")}
              </GhostButton>
            </div>
          </div>
          <div>
            <ListingWizardDemo />
          </div>
        </div>
      </section>

      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} />
      <Testimonials theme="cream" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />
      <CustomerExperienceSection storefrontImages={VARIED_STOREFRONT_IMAGES} />
      <FreeVsProSection
        onStartFree={() => handleSignupCta("pricing_start_free")}
        onTryPro={() => handleProCta("pricing_try_pro")}
      />
      <Closing
        onSignup={() => handleSignupCta("closing_cta")}
        onLogin={openLogin}
        theme="dark"
        title={<Trans i18nKey={`${NS}.closing.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />}
        subtitle={t(`${NS}.closing.subtitle`)}
      />
      <Footer />

      {modals}
    </div>
  );
}
