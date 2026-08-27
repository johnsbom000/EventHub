import { useTranslation, Trans } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { Bar, Header, Closing, Footer, PrimaryButton } from "@/pages/landing/primitives";
import { useLandingSignup } from "@/pages/landing/signup";
import { Reveal, fadeUp, fadeUpBlur, stagger, EASE } from "@/pages/landing/motion";
import HowItWorks from "@/pages/landing/HowItWorks";
import Testimonials from "@/pages/landing/Testimonials";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import CommissionPlanSection from "@/pages/landing/CommissionPlanSection";
import FaqSection from "@/pages/landing/FaqSection";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import VendorDashboardDemo from "@/pages/landing/VendorDashboardDemo";
import type { PricingModel } from "@/hooks/usePricingModel";

/* Direction A — "Show, don't tell": watching the product build itself drives
   signups. Two-column hero with the live listing wizard beside the headline.

   Animation prototype (Direction A only): hero elements cascade in on load, the
   wizard demo drifts gently, CTAs lift on hover, and downstream sections reveal
   on scroll. All motion is gated behind prefers-reduced-motion. */

const NS = "landingFreeA";

export default function TemporaryLandingFreeA({ model }: { model: PricingModel }) {
  const { t } = useTranslation();
  const { handleSignupCta, handleProCta, openLogin, modals } = useLandingSignup(NS, model);
  // Commission copy lives in the `…Comm` sibling namespace, which holds ONLY the
  // strings that differ (top bar, trust line, Pro-flavoured CTAs). Everything it
  // omits falls back to the base namespace, so the two arms stay identical
  // apart from the money story.
  const k = (key: string): string[] =>
    model === "commission" ? [`${NS}Comm.${key}`, `${NS}.${key}`] : [`${NS}.${key}`];
  const reduced = useReducedMotion();

  // Hero entrance: a stagger container whose children rise + fade in sequence.
  // Under reduced motion we spread nothing, so everything paints instantly.
  const containerProps = reduced ? {} : { initial: "hidden" as const, animate: "show" as const, variants: stagger };
  const itemProps = reduced ? {} : { variants: fadeUp };
  const headlineProps = reduced ? {} : { variants: fadeUpBlur };

  return (
    <div className="min-h-screen bg-white">
      <div className="sticky top-0 z-40">
        <Bar theme="blue">
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9dd4cc]" />
            {t(k("bar.text"))}
          </span>
        </Bar>
        <Header cta={t(k("header.getStarted"))} onSignup={() => handleSignupCta("header_get_started")} onLogin={openLogin} />
      </div>

      {/* Hero */}
      <section>
        <div className="mx-auto grid max-w-[1320px] items-center gap-12 px-5 py-16 lg:min-h-[calc(100svh-90px)] lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-10 lg:py-24">
          {/* Mobile: the copy fills the first screen (centered) and the demo
              starts below the fold, mirroring direction D. */}
          <motion.div
            className="flex min-h-[calc(100svh-60px)] flex-col justify-center text-center lg:block lg:min-h-0 lg:text-left"
            {...containerProps}
          >
            <motion.h1
              {...headlineProps}
              className="font-heading text-[clamp(2.6rem,5.4vw,4.3rem)] font-light leading-[1.02] text-[#2a3a42]"
            >
              <Trans i18nKey={k("hero.title")} components={{ accent: <em className="italic text-[#e07a6a]" />, br: <br /> }} />
            </motion.h1>
            <motion.p
              {...itemProps}
              className="mx-auto mt-6 max-w-[34rem] font-sans text-[1.15rem] leading-[1.55] text-[#4a6a7d] lg:mx-0"
            >
              {t(k("hero.subtitle"))}
            </motion.p>
            <motion.div {...itemProps} className="mt-9 flex max-w-[34rem] flex-wrap items-center justify-center gap-3">
              <motion.span
                className="inline-flex"
                whileHover={reduced ? undefined : { y: -2 }}
                whileTap={reduced ? undefined : { y: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <PrimaryButton
                  onClick={() => handleSignupCta("hero_primary")}
                  className="!px-8 !py-4 !text-[1.1rem] shadow-[0_12px_34px_-12px_rgba(224,122,106,0.65)]"
                >
                  {t(k("hero.ctaPrimary"))}
                </PrimaryButton>
              </motion.span>
            </motion.div>
          </motion.div>

          <motion.div
            className="mx-auto w-full max-w-[560px]"
            initial={reduced ? false : { opacity: 0, y: 28 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
          >
            {reduced ? (
              <VendorDashboardDemo />
            ) : (
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
                <VendorDashboardDemo />
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      <Reveal>
        <HowItWorks onSignup={() => handleSignupCta("how_it_works")} className="border-t-transparent" />
      </Reveal>
      <Reveal>
        <Testimonials theme="light" layout="cards" eyebrowKey={`${NS}.testimonials.eyebrow`} />
      </Reveal>
      <Reveal>
        <CustomerExperienceSection visual="hub" />
      </Reveal>
      {/* Pricing. Each arm gets its own section and never both: the Free-vs-Pro
          table for subscription, the one-plan section for commission. The
          commission arm used to get nothing here, which left it with no pricing
          surface at all. */}
      {model === "subscription" && handleProCta && (
        <Reveal>
          <FreeVsProSection
            animated
            onStartFree={() => handleSignupCta("pricing_start_free")}
            onTryPro={() => handleProCta("pricing_try_pro")}
          />
        </Reveal>
      )}
      {model === "commission" && (
        <Reveal>
          <CommissionPlanSection animated onStartFree={() => handleSignupCta("pricing_start_free")} />
        </Reveal>
      )}
      <Reveal>
        <FaqSection />
      </Reveal>
      <Reveal>
        <FaqSection />
      </Reveal>
      <Reveal>
        <Closing
          onSignup={() => handleSignupCta("closing_cta")}
          theme="dark"
          title={<Trans i18nKey={k("closing.title")} components={{ accent: <em className="italic text-[#e07a6a]" /> }} />}
          subtitle={t(k("closing.subtitle"))}
        />
      </Reveal>
      <Footer />

      {modals}
    </div>
  );
}
