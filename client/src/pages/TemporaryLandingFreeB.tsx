import { useTranslation, Trans } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Bar, Header, Footer, Eyebrow, PrimaryButton, GhostButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import BookingFlowDemo, { VARIED_STOREFRONT_IMAGES } from "@/pages/landing/BookingFlowDemo";

/* Direction B — "Money & zero fees": the financial payoff (keep 100%, 0%
   commission) is the strongest driver. Dark hero + three stat cards. */

const NS = "landingFreeB";
const FAQ_KEYS = ["q1", "q2", "q3"] as const;

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
            <BookingFlowDemo storefrontImages={VARIED_STOREFRONT_IMAGES} />
          </div>
        </div>
      </section>

      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} />
      <CustomerExperienceSection storefrontImages={VARIED_STOREFRONT_IMAGES} />
      <FreeVsProSection
        treatment="nocard"
        onStartFree={() => handleSignupCta("pricing_start_free")}
        onTryPro={() => handleProCta("pricing_try_pro")}
      />
      <Testimonials theme="dark" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />

      {/* FAQ — replaces the closing CTA band for this variant. Native <details>
          accordion (no JS state); first item open for discoverability. */}
      <section className="border-y border-[rgba(74,106,125,0.08)] bg-white">
        <div className="mx-auto max-w-[820px] px-5 py-20 lg:px-10 lg:py-24">
          <div className="mb-10 text-center">
            <Eyebrow>{t(`${NS}.faq.eyebrow`)}</Eyebrow>
            <h2 className="mt-3 font-heading text-[2.2rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[2.9rem]">
              {t(`${NS}.faq.title`)}
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
                  {t(`${NS}.faq.${k}.q`)}
                  <ChevronDown className="h-5 w-5 shrink-0 text-[#4a6a7d] transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="mt-4 font-sans text-[1.02rem] leading-[1.65] text-[#4a6a7d]">
                  {t(`${NS}.faq.${k}.a`)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />

      {modals}
    </div>
  );
}
