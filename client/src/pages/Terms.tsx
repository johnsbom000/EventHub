import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";

import { TERMS_VERSION } from "@shared/termsVersion";

/**
 * Terms of Service.
 *
 * ENGLISH IS CANONICAL. Every word on this page comes from the `terms` namespace
 * in client/src/locales/{en,es,pt}.json — nothing is hardcoded here. The three
 * locales are the SAME contract, translated: same sections, same clause order,
 * same numbers. If you change en.json, change es.json and pt.json in the same
 * commit or Spanish- and Portuguese-speaking users are bound by different terms
 * than the ones you edited.
 *
 * This page previously hardcoded English while a SECOND, contradictory copy of
 * the Terms sat unused in the locale files under `terms.s1..s14` — different
 * section count, Florida instead of Utah, a 48-hour dispute window instead of
 * 72. Those keys are gone. Do not reintroduce a parallel copy.
 *
 * Structure is data-driven so the three locales are exact structural mirrors and
 * a missing block fails visibly instead of silently dropping a clause.
 *
 * Rich text uses a deliberate **double-asterisk** convention for bold rather than
 * embedded HTML, so translations stay plain text and nothing needs
 * dangerouslySetInnerHTML.
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

/** Renders **bold** spans. Static, translator-authored copy only — never user input. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        // Odd indices are the captured groups, i.e. the bolded runs.
        i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  );
}

export default function TermsOfService() {
  const { t } = useTranslation();
  const sections = t("terms.sections", { returnObjects: true }) as Section[];
  const contactEmail = t("terms.contactEmail");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/" className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("terms.backToEventHub")}
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t("terms.pageTitle")}</h1>
          {/* The effective date shown here is the same TERMS_VERSION stamped onto
              a user's record when they accept, so "which Terms did they agree
              to" resolves to a document you can actually point at. */}
          <p className="mt-2 text-sm text-muted-foreground">
            {t("terms.effective", { version: TERMS_VERSION })} · {t("terms.meta")}
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
          {/* Sidebar TOC */}
          <nav className="hidden lg:block">
            <div className="sticky top-8 space-y-1">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("terms.contents")}</p>
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

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t("terms.notice")}
            </div>

            {sections.map((s, idx) => (
              <Fragment key={s.id}>
                <section id={s.id}>
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
                {idx < sections.length - 1 ? <div className="border-t border-border" /> : null}
              </Fragment>
            ))}

            <div className="border-t border-border" />

            <p className="text-xs text-muted-foreground">
              {t("terms.footerBefore")}{" "}
              <a href={`mailto:${contactEmail}`} className="underline hover:text-foreground">
                {contactEmail}
              </a>
              {t("terms.footerAfter")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
