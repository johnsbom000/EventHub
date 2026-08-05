import { useTranslation, Trans } from "react-i18next";
import { Bar, Header, Footer, Eyebrow, PrimaryButton, GhostButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import ListingWizardDemo from "@/pages/landing/ListingWizardDemo";
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
      <section className="grid lg:grid-cols-2">
        <div className="order-1 flex flex-col justify-center bg-[#2a3a42] px-6 py-16 lg:px-12 lg:py-24 xl:px-20">
          <div className="mx-auto w-full max-w-[540px]">
            <Eyebrow className="text-[#9dd4cc]">{t(`${NS}.hero.eyebrow`)}</Eyebrow>
            <h1 className="mt-4 font-heading text-[clamp(2.6rem,5.4vw,4.3rem)] font-light leading-[1.02] text-[#f5f0e8]">
              <Trans i18nKey={`${NS}.hero.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h1>
            <p className="mt-6 max-w-md font-sans text-[1.2rem] leading-[1.6] text-[rgba(245,240,232,0.82)]">
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
        </div>
        <div className="order-2 flex items-center bg-[#f8fafb] px-6 py-16 lg:py-24">
          <div className="mx-auto w-full max-w-[480px]">
            <VendorDashboardDemo still />
          </div>
        </div>
      </section>

      {/* How you set up — features the listing wizard */}
      <section className="border-y border-[rgba(74,106,125,0.08)] bg-[#f5f0e8]">
        <div className="mx-auto max-w-[1320px] px-5 py-20 lg:px-10 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="order-2 mx-auto w-full max-w-[520px] lg:order-1">
              <ListingWizardDemo />
            </div>
            <div className="order-1 lg:order-2">
              <span className="font-sans text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-[#9aacb4]">
                {t(`${NS}.setup.eyebrow`)}
              </span>
              <h2 className="mt-4 font-heading text-[clamp(2.1rem,4vw,3.1rem)] font-light leading-[1.08] text-[#2a3a42]">
                <Trans i18nKey={`${NS}.setup.title`} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
              </h2>
              <p className="mt-5 max-w-lg font-sans text-[1.08rem] leading-[1.6] text-[#4a6a7d]">{t(`${NS}.setup.body`)}</p>
              <div className="mt-8">
                <PrimaryButton onClick={() => handleSignupCta("setup_create_storefront")} className="!text-[1.05rem]">
                  {t(`${NS}.setup.cta`)}
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} />
      <Testimonials theme="light" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />
      <FreeVsProSection
        onStartFree={() => handleSignupCta("pricing_start_free")}
        onTryPro={() => handleProCta("pricing_try_pro")}
      />
      <Footer />

      {modals}
    </div>
  );
}
