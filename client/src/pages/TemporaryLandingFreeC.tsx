import { useTranslation, Trans } from "react-i18next";
import { Bar, Header, Closing, Footer, PrimaryButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import CommissionPlanSection from "@/pages/landing/CommissionPlanSection";
import FaqSection from "@/pages/landing/FaqSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import VendorHubStill from "@/pages/landing/VendorHubStill";
import { VARIED_STOREFRONT_IMAGES } from "@/pages/landing/BookingFlowDemo";
import type { PricingModel } from "@/hooks/usePricingModel";

/* Direction C — "Proof-first": product-trust signals (clear pricing, live
   availability, secure Stripe) convert best. Cream→white gradient hero. */

const NS = "landingFreeC";

export default function TemporaryLandingFreeC({ model }: { model: PricingModel }) {
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
        <Bar theme="cream">
          <span>
            <span className="font-semibold text-[#e07a6a]">{t(k("bar.lead"))}</span> {t(k("bar.text"))}
          </span>
        </Bar>
        <Header cta={t(k("header.getStarted"))} onSignup={() => handleSignupCta("header_get_started")} onLogin={openLogin} />
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#f5f0e8] to-white">
        <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 py-16 lg:min-h-[calc(100svh-90px)] lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:py-8">
          {/* Mobile: the copy fills the first screen (centered) and the storefront
              still starts below the fold, mirroring direction D. */}
          <div className="flex min-h-[calc(100svh-60px)] flex-col justify-center text-center lg:block lg:min-h-0">
            <h1 className="font-heading text-[clamp(2.6rem,5.6vw,4.3rem)] font-light leading-[1.02] text-[#2a3a42]">
              <Trans i18nKey={k("hero.title")} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
            </h1>
            <p className="mx-auto mt-6 max-w-lg font-sans text-[1.2rem] leading-[1.6] text-[#4a6a7d]">{t(k("hero.subtitle"))}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <PrimaryButton onClick={() => handleSignupCta("hero_primary")} className="!text-[1.1rem]">
                {t(k("hero.ctaPrimary"))}
              </PrimaryButton>
            </div>
          </div>
          <div>
            <VendorHubStill />
          </div>
        </div>
      </section>

      <HowItWorks onSignup={() => handleSignupCta("how_it_works")} className="border-t-transparent" />
      <Testimonials theme="cream" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />
      <CustomerExperienceSection storefrontImages={VARIED_STOREFRONT_IMAGES} />
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
      <Closing
        onSignup={() => handleSignupCta("closing_cta")}
        theme="dark"
        title={<Trans i18nKey={k("closing.title")} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />}
        subtitle={t(k("closing.subtitle"))}
      />
      <Footer />

      {modals}
    </div>
  );
}
