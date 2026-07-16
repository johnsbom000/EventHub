import { useTranslation, Trans } from "react-i18next";
import { Bar, Header, Closing, Footer, Eyebrow, PrimaryButton, GhostButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import ListingWizardDemo from "@/pages/landing/ListingWizardDemo";
import { VARIED_STOREFRONT_IMAGES } from "@/pages/landing/BookingFlowDemo";

/* Direction B — "Money & zero fees": the financial payoff (keep 100%, 0%
   commission) is the strongest driver. Dark hero + three stat cards. */

const NS = "landingFreeB";
const STAT_KEYS = ["commission", "payouts", "start"] as const;

export default function TemporaryLandingFreeB() {
  const { t } = useTranslation();
  const { handleSignupCta, handleProCta, openLogin, modals } = useLandingSignup(NS);

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40">
        <Bar theme="dark">{t(`${NS}.bar.text`)}</Bar>
        <Header cta={t(`${NS}.header.getStarted`)} onSignup={() => handleSignupCta("header_get_started")} onLogin={openLogin} />
      </div>

      {/* Hero */}
      <section className="bg-[#2a3a42]">
        <div className="mx-auto grid max-w-[1320px] items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-24">
          <div>
            <Eyebrow className="text-[#9dd4cc]">{t(`${NS}.hero.eyebrow`)}</Eyebrow>
            <h1 className="mt-4 font-heading text-[clamp(2.7rem,5.8vw,4.5rem)] font-light leading-[1.02] text-[#f5f0e8]">
              <Trans i18nKey={`${NS}.hero.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h1>
            <p className="mt-6 max-w-lg font-sans text-[1.2rem] leading-[1.6] text-[rgba(245,240,232,0.82)]">
              {t(`${NS}.hero.subtitle`)}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={() => handleSignupCta("hero_primary")} className="!text-[1.1rem]">
                {t(`${NS}.hero.ctaPrimary`)}
              </PrimaryButton>
              <GhostButton
                onClick={openLogin}
                className="border-[1.5px] border-[rgba(245,240,232,0.4)] text-[#f5f0e8] hover:bg-[rgba(245,240,232,0.08)]"
              >
                {t("landingShared.logIn")}
              </GhostButton>
            </div>
            <p className="mt-6 font-sans text-[0.95rem] text-[rgba(245,240,232,0.6)]">{t(`${NS}.hero.trust`)}</p>
          </div>
          <div>
            <ListingWizardDemo />
          </div>
        </div>
        <div className="mx-auto grid max-w-[1240px] gap-4 px-5 pb-20 sm:grid-cols-3 lg:px-10">
          {STAT_KEYS.map((k) => (
            <div key={k} className="rounded-[18px] border border-[rgba(245,240,232,0.14)] bg-[#33454f] p-6 text-center">
              <p className="font-heading text-[2.6rem] font-light leading-none text-[#9dd4cc]">{t(`${NS}.stats.${k}.big`)}</p>
              <p className="mt-2 font-sans text-[0.95rem] text-[rgba(245,240,232,0.75)]">{t(`${NS}.stats.${k}.label`)}</p>
            </div>
          ))}
        </div>
      </section>

      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} />
      <CustomerExperienceSection storefrontImages={VARIED_STOREFRONT_IMAGES} />
      <FreeVsProSection
        onStartFree={() => handleSignupCta("pricing_start_free")}
        onTryPro={() => handleProCta("pricing_try_pro")}
      />
      <Testimonials theme="dark" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />
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
