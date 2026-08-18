import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

/**
 * Privacy Policy.
 *
 * ENGLISH IS CANONICAL. Every word on this page comes from the `privacy`
 * namespace in client/src/locales/{en,es,pt}.json — nothing is hardcoded here.
 * The three locales are the SAME disclosure, translated: same sections, same
 * clause order, same numbers. If you change en.json, change es.json and pt.json
 * in the same commit, or Spanish- and Portuguese-speaking users are told
 * something different about how their data is handled than the text you edited.
 *
 * This page previously hardcoded English with zero t() calls, so every user of
 * the es/pt locales was served English privacy disclosures — independent
 * statutory exposure under CCPA/CPRA (see the California section) and, for the
 * pt locale, Brazil's LGPD.
 *
 * Structure is data-driven and mirrors Terms.tsx exactly, so the three locales
 * are structural mirrors and a missing block fails visibly instead of silently
 * dropping a disclosure. Sub-headings are `p` blocks whose entire text is
 * bolded rather than a separate block type, so the two legal pages share one
 * block vocabulary.
 *
 * Rich text uses a deliberate **double-asterisk** convention for bold rather
 * than embedded HTML, so translations stay plain text and nothing needs
 * dangerouslySetInnerHTML. Bare http(s) URLs in the copy are auto-linked for
 * the same reason — a translator never has to touch markup.
 */

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

type Section = {
  id: string;
  label: string;
  heading: string;
  blocks: Block[];
};

/** The date this policy took effect, rendered in the reader's locale. */
const EFFECTIVE_DATE = new Date(Date.UTC(2026, 5, 3));

const DATE_LOCALES: Record<string, string> = { en: "en-US", es: "es-US", pt: "pt-BR" };

const URL_PATTERN = /(https?:\/\/[^\s)]+)/g;

/** Auto-links bare URLs inside an already-plain run of text. */
function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        // Odd indices are the captured URLs.
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {part.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

/** Renders **bold** spans. Static, translator-authored copy only — never user input. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        // Odd indices are the captured groups, i.e. the bolded runs.
        i % 2 === 1 ? (
          <strong key={i}>
            <Linkify text={part} />
          </strong>
        ) : (
          <Linkify key={i} text={part} />
        )
      )}
    </>
  );
}

export default function PrivacyPolicy() {
  const { t, i18n } = useTranslation();
  const sections = t("privacy.sections", { returnObjects: true }) as Section[];
  const intro = t("privacy.intro", { returnObjects: true }) as string[];

  const dateLocale = DATE_LOCALES[i18n.language?.split("-")[0] ?? "en"] ?? "en-US";
  const effectiveDate = new Intl.DateTimeFormat(dateLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(EFFECTIVE_DATE);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/" className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("privacy.backToEventHub")}
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("privacy.pageTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("privacy.effective", { date: effectiveDate })} · {t("privacy.meta")}
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
          {/* Sidebar TOC */}
          <nav className="hidden lg:block">
            <div className="sticky top-8 space-y-1">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("privacy.contents")}
              </p>
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="prose prose-sm max-w-none text-foreground [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-medium [&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-3 [&_ul]:space-y-1 [&_li]:text-muted-foreground">

            {intro.map((text, i) => (
              <p key={i}>
                <Rich text={text} />
              </p>
            ))}

            {sections.map((s) => (
              <section key={s.id} id={s.id}>
                <h2>{s.heading}</h2>
                {s.blocks.map((b, i) =>
                  b.type === "ul" ? (
                    <ul key={i}>
                      {b.items.map((item, j) => (
                        <li key={j}>
                          <Rich text={item} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p key={i}>
                      <Rich text={b.text} />
                    </p>
                  )
                )}
              </section>
            ))}

          </div>
        </div>
      </div>
    </div>
  );
}
