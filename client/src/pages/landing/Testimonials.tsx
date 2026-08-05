import { useTranslation } from "react-i18next";
import { Eyebrow, Stars } from "@/pages/landing/primitives";

/* ---------------------------------------------------------------------------
   Shared "What vendors are saying" testimonials. Three unattributed quotes +
   star rows (no numeric rating, no names — intentional). theme + layout vary
   per variant; the eyebrow is passed in. Quotes live in the shared
   `testimonials` i18n block.
--------------------------------------------------------------------------- */

const QUOTE_KEYS = ["q1", "q2", "q3"] as const;

export default function Testimonials({
  theme = "light",
  layout = "cards",
  eyebrowKey,
}: {
  theme?: "light" | "dark" | "cream";
  layout?: "cards" | "stacked";
  eyebrowKey: string;
}) {
  const { t } = useTranslation();
  const dark = theme === "dark";
  const bg = dark ? "bg-[#2a3a42]" : theme === "cream" ? "bg-[#f5f0e8]" : "bg-white";
  const headText = dark ? "text-[#f5f0e8]" : "text-[#2a3a42]";
  const cardBg = dark ? "bg-[#33454f]" : "bg-white";
  const cardBorder = dark ? "border-[rgba(245,240,232,0.12)]" : "border-[rgba(74,106,125,0.14)]";
  const quoteText = dark ? "text-[#f5f0e8]" : "text-[#2a3a42]";

  const Card = ({ text, big }: { text: string; big?: boolean }) => (
    <figure
      className={`flex flex-col rounded-[20px] border ${cardBorder} ${cardBg} p-7 ${
        dark ? "" : "shadow-[0_14px_40px_rgba(74,106,125,0.08)]"
      }`}
    >
      <Stars size="h-4 w-4" />
      <blockquote
        className={`mt-4 flex-1 font-heading ${
          big ? "text-[1.6rem] lg:text-[1.9rem]" : "text-[1.25rem]"
        } font-light italic leading-[1.3] ${quoteText}`}
      >
        “{text}”
      </blockquote>
    </figure>
  );

  return (
    <section className={`border-y border-[rgba(74,106,125,0.08)] ${bg}`}>
      <div className="mx-auto max-w-[1240px] px-5 py-20 lg:px-10 lg:py-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            {t(eyebrowKey) && <Eyebrow>{t(eyebrowKey)}</Eyebrow>}
            <h2 className={`mt-3 font-heading text-[2.2rem] font-light leading-[1.1] lg:text-[2.9rem] ${headText}`}>
              {t("testimonials.title")}
            </h2>
          </div>
          <Stars size="h-5 w-5" className="mb-1" />
        </div>
        {layout === "stacked" ? (
          <div className="mx-auto grid max-w-[760px] gap-5">
            {QUOTE_KEYS.map((k) => (
              <Card key={k} text={t(`testimonials.${k}`)} big />
            ))}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {QUOTE_KEYS.map((k) => (
              <Card key={k} text={t(`testimonials.${k}`)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
