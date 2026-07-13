import { useTranslation } from "react-i18next";

/* ---------------------------------------------------------------------------
   Shared "Free vs Pro" section used by every free-first landing variant.
   Free card (coral highlight) vs Pro card (animated .deal-outline palette ring
   + .deal-highlight text/checkmarks). Copy is in the shared top-level `plans`
   i18n block; the Pro feature list mirrors the real $29/mo Pro plan. Each page
   passes its own vendor-signup handler via `onSignup`. Edit here once, all
   variants update.
--------------------------------------------------------------------------- */

export default function FreeVsProSection({ onSignup }: { onSignup: () => void }) {
  const { t } = useTranslation();
  const freeFeatures = [1, 2, 3, 4, 5].map((i) => t(`plans.free.f${i}`));
  const proFeatures = [1, 2, 3, 4, 5, 6].map((i) => t(`plans.pro.f${i}`));

  return (
    <section className="border-t border-[rgba(74,106,125,0.08)] bg-[#f8fafb]">
      <div className="mx-auto max-w-[1240px] px-5 py-24 lg:px-10 lg:py-28">
        <div className="mb-14 max-w-2xl">
          <p className="mb-4 font-sans text-[0.75rem] font-semibold uppercase tracking-[0.22em] text-[#e07a6a]">
            {t("plans.eyebrow")}
          </p>
          <h2 className="font-heading text-[2.4rem] font-light leading-[1.1] text-[#2a3a42] lg:text-[3rem]">
            {t("plans.title")}
          </h2>
          <p className="mt-4 font-sans text-[1.15rem] leading-[1.6] text-[#4a6a7d]">{t("plans.subtitle")}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* FREE — emphasized */}
          <div className="relative flex flex-col rounded-[22px] border-2 border-[#e07a6a] bg-white p-8 shadow-[0_20px_50px_rgba(224,122,106,0.10)] lg:p-10">
            <span className="mb-5 inline-flex w-fit items-center rounded-full bg-[#fdeee9] px-3 py-1 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#e07a6a]">
              {t("plans.free.badge")}
            </span>
            <h3 className="font-heading text-[2.2rem] font-normal leading-none text-[#2a3a42]">{t("plans.free.title")}</h3>
            <p className="mt-2 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">{t("plans.free.tagline")}</p>
            <ul className="mt-7 space-y-3.5">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 font-sans text-[1.02rem] leading-snug text-[#2a3a42]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fdeee9] text-[0.7rem] font-bold text-[#e07a6a]">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <button
                type="button"
                onClick={onSignup}
                className="w-full rounded-full bg-[#e07a6a] px-7 py-4 font-sans text-[1.05rem] font-semibold text-white transition-colors hover:bg-[#c96959]"
              >
                {t("plans.free.cta")}
              </button>
            </div>
          </div>

          {/* PRO — selectable upgrade, animated palette ring */}
          <div className="deal-outline [--ring:2.5px] flex flex-col rounded-[22px] bg-white p-8 shadow-[0_20px_50px_rgba(74,106,125,0.10)] lg:p-10">
            <span className="deal-highlight mb-5 inline-flex w-fit items-center rounded-full bg-[#f0f4f7] px-3 py-1 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#4a6a7d]">
              {t("plans.pro.badge")}
            </span>
            <h3 className="font-heading text-[2.2rem] font-normal leading-none text-[#2a3a42]">{t("plans.pro.title")}</h3>
            <p className="mt-2 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">{t("plans.pro.tagline")}</p>
            <p className="mt-7 font-sans text-[0.85rem] font-semibold uppercase tracking-[0.1em] text-[#9aacb4]">{t("plans.pro.plus")}</p>
            <ul className="mt-3 space-y-3.5">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-3 font-sans text-[1.02rem] leading-snug text-[#2a3a42]">
                  <span className="deal-highlight mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fdeee9] text-[0.7rem] font-bold text-[#e07a6a]">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <button
                type="button"
                onClick={onSignup}
                className="deal-outline deal-highlight [--ring:2px] w-full rounded-full bg-white px-7 py-4 font-sans text-[1.05rem] font-semibold text-[#e07a6a] transition-colors hover:bg-[#fdeee9]"
              >
                {t("plans.pro.cta")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
