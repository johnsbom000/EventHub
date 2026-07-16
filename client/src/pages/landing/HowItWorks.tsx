import { useTranslation, Trans } from "react-i18next";
import { Store, ClipboardList, Link as LinkIcon, Zap } from "lucide-react";
import { Eyebrow, PrimaryButton } from "@/pages/landing/primitives";

/* ---------------------------------------------------------------------------
   Shared "How it works" section — on every free-first variant. Four steps from
   sign-up to booked, then a single vendor-signup CTA. Copy lives in the shared
   `howItWorks` i18n block. `onSignup` starts vendor signup (→ vendor account).
--------------------------------------------------------------------------- */

const STEPS = [
  { key: "profile", Icon: Store },
  { key: "listing", Icon: ClipboardList },
  { key: "share", Icon: LinkIcon },
  { key: "admin", Icon: Zap },
] as const;

export default function HowItWorks({ onSignup }: { onSignup: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="border-y border-[rgba(74,106,125,0.08)] bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-10 lg:py-24">
        <div className="mb-12 text-center">
          <Eyebrow>{t("howItWorks.eyebrow")}</Eyebrow>
          <h2 className="mt-3 font-heading text-[2.2rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[2.9rem]">
            <Trans i18nKey="howItWorks.title" components={{ accent: <em className="italic text-[#e07a6a]" /> }} />
          </h2>
        </div>
        <ol className="grid gap-8 md:grid-cols-4 md:gap-5">
          {STEPS.map((s, i) => (
            <li key={s.key} className="relative flex flex-col items-start">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fdeee9] text-[#e07a6a]">
                  <s.Icon className="h-6 w-6" />
                </span>
                <span className="font-heading text-[2rem] font-light leading-none text-[#c3cfd6]">{i + 1}</span>
              </div>
              <h3 className="mt-5 font-sans text-[1.08rem] font-semibold leading-snug text-[#2a3a42]">
                {t(`howItWorks.${s.key}.title`)}
              </h3>
              <p className="mt-2 font-sans text-[0.95rem] leading-[1.55] text-[#4a6a7d]">
                {t(`howItWorks.${s.key}.body`)}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex justify-center">
          <PrimaryButton onClick={onSignup} className="!px-8 !py-4 !text-[1.1rem]">
            {t("howItWorks.cta")}
          </PrimaryButton>
        </div>
      </div>
    </section>
  );
}
