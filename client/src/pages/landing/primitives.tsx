import { type ReactNode } from "react";
import { ChevronRight, Star, Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import BrandWordmark from "@/components/BrandWordmark";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSection } from "@/components/LanguageSection";
import { useLanguage } from "@/context/LanguageContext";

// Globe dropdown that switches the site language. Reuses the app-wide
// LanguageSection + LanguageProvider so the choice persists (localStorage +
// server) exactly like everywhere else. Styled for the landing header; the
// light tone fits the slate footer, where the switch lives on mobile.
export function LanguageMenu({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("nav.language.label")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-sans text-[0.98rem] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e07a6a]/40",
          tone === "light" ? "text-[rgba(245,240,232,0.75)] hover:text-white" : "text-[#4a6a7d] hover:text-[#2a3a42]",
        )}
      >
        <Globe className="h-[1.15em] w-[1.15em]" />
        <span className="uppercase">{language}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        <LanguageSection />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------------------
   Shared presentational primitives for the free-first landing variants (A–E).
   Kept here so every direction pulls from one styling source — coral accent
   #e07a6a, slate #4a6a7d, ink #2a3a42, cream #f5f0e8.
--------------------------------------------------------------------------- */

export function Eyebrow({ children, className = "text-[#e07a6a]" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-sans text-[0.75rem] font-semibold uppercase tracking-[0.22em] ${className}`}>{children}</p>
  );
}

// The four customer-side proof points shown under the customer-experience
// heading. Shared so the control page and Direction E render one implementation.
const CUSTOMER_BULLET_KEYS = ["transparent", "professional", "easy", "noBackAndForth"] as const;

export function CustomerBullets({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {CUSTOMER_BULLET_KEYS.map((k) => (
        <li key={k} className="flex items-center gap-2.5 font-sans text-[1.05rem] text-[#2a3a42]">
          <Check className="h-[1.05rem] w-[1.05rem] shrink-0 text-[#e07a6a]" />
          {t(`landingShared.customerBullets.${k}`)}
        </li>
      ))}
    </ul>
  );
}

// Reusable 5-star row — no numeric rating, matching the prototype spec.
export function Stars({ size = "h-4 w-4", className = "" }: { size?: string; className?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className={`${size} text-[#d26f41]`} fill="#d26f41" strokeWidth={0} />
      ))}
    </span>
  );
}

export function PrimaryButton({
  onClick,
  children,
  className = "",
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-[#e07a6a] px-7 py-3.5 font-sans text-[1.05rem] font-semibold text-white transition-colors hover:bg-[#c96959] ${className}`}
    >
      {children}
      <ChevronRight className="h-[1.05em] w-[1.05em]" />
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  className = "",
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-6 py-3.5 font-sans text-[1.05rem] font-semibold transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

// Slim announcement bar sitting above the header. theme controls the palette.
// Desktop-only: on mobile the page goes straight to the header so the hero
// gets the full first screen.
export function Bar({ theme = "cream", children }: { theme?: "cream" | "blue" | "dark"; children: ReactNode }) {
  const cls =
    theme === "dark"
      ? "bg-[#2a3a42] text-[rgba(245,240,232,0.9)]"
      : theme === "blue"
        ? "bg-[#f8fafb] text-[#4a6a7d]"
        : "bg-[#f5f0e8] text-[#4a6a7d]";
  return (
    <div className={cn("hidden lg:block", cls)}>
      <div className="mx-auto flex max-w-[1320px] items-center justify-center gap-2 px-5 py-2 text-center lg:px-10">
        <span className="font-sans text-[0.9rem] leading-tight">{children}</span>
      </div>
    </div>
  );
}

// Shared sticky header. `minimal` (variant D) hides the Log in link.
export function Header({
  onSignup,
  onLogin,
  cta,
  minimal = false,
  className,
}: {
  onSignup: () => void;
  onLogin: () => void;
  cta: string;
  minimal?: boolean;
  // Per-variant bar styling (e.g. a landing page that wants the header to melt
  // into its hero background instead of the default white). Merged last, so
  // bg/border utilities here win over the defaults.
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <header className={cn("border-b border-[rgba(74,106,125,0.1)] bg-white/95 backdrop-blur", className)}>
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-3.5 lg:px-10">
        <BrandWordmark
          className="text-[1.9rem] leading-none lg:text-[2.2rem]"
          eventClassName="text-[#e07a6a] font-normal"
          hubClassName="text-[#4a6a7d] font-normal"
        />
        <div className="flex items-center gap-2">
          {/* On mobile the language switch lives in the footer instead */}
          <div className="hidden lg:block">
            <LanguageMenu />
          </div>
          {!minimal && (
            <button
              type="button"
              onClick={onLogin}
              className="whitespace-nowrap rounded-full px-4 py-2 font-sans text-[0.98rem] font-semibold text-[#4a6a7d] transition-colors hover:text-[#2a3a42]"
            >
              {t("landingShared.logIn")}
            </button>
          )}
          <button
            type="button"
            onClick={onSignup}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#e07a6a] px-5 py-2 font-sans text-[0.98rem] font-semibold text-white transition-colors hover:bg-[#c96959]"
          >
            {cta}
            <ChevronRight className="h-[1.05em] w-[1.05em]" />
          </button>
        </div>
      </div>
    </header>
  );
}

const SUPPORT_EMAIL = "support@eventhubglobal.com";
const SUPPORT_PHONE = "801-410-0092";

// Shared footer (slate) used by every free-first variant.
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-[#4a6a7d]">
      <div className="mx-auto max-w-[1320px] px-5 py-14 lg:px-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="col-span-1 md:col-span-2">
            <BrandWordmark
              className="mb-4 text-[2.4rem]"
              eventClassName="text-[#f5f0e8] font-normal"
              hubClassName="text-[#9dd4cc] font-normal"
            />
            <p className="max-w-md font-sans text-[1.02rem] leading-[1.6] text-[rgba(245,240,232,0.85)]">
              {t("landingShared.footer.description")}
            </p>
          </div>
          <div>
            <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">
              {t("landingShared.footer.company")}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a href="/terms" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">
                  {t("landingShared.footer.terms")}
                </a>
              </li>
              <li>
                <a href="/privacy" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">
                  {t("landingShared.footer.privacy")}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">
              {t("landingShared.footer.contact")}
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white"
                >
                  {SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={`tel:${SUPPORT_PHONE.replace(/[^0-9]/g, "")}`}
                  className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white"
                >
                  {SUPPORT_PHONE}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[rgba(245,240,232,0.16)] pt-8 sm:flex-row">
          <p className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.45)]">
            {t("landingShared.footer.copyright", { year: new Date().getFullYear() })}
          </p>
          <div className="flex items-center gap-6">
            <a href="/terms" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">
              {t("landingShared.footer.terms")}
            </a>
            <a href="/privacy" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">
              {t("landingShared.footer.privacy")}
            </a>
            {/* Mobile home of the language switch (the header hides it below lg) */}
            <div className="lg:hidden">
              <LanguageMenu tone="light" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Shared closing band. theme = dark (slate) or cream.
export function Closing({
  onSignup,
  theme = "dark",
  title,
  subtitle,
}: {
  onSignup: () => void;
  theme?: "dark" | "cream";
  title: ReactNode;
  subtitle: ReactNode;
}) {
  const { t } = useTranslation();
  const dark = theme === "dark";
  return (
    <section className={dark ? "bg-[#2a3a42]" : "bg-[#f5f0e8]"}>
      <div className="mx-auto max-w-[1240px] px-5 py-24 text-center lg:px-10 lg:py-28">
        <h2
          className={`mx-auto max-w-3xl font-heading text-[2.6rem] font-light leading-[1.08] lg:text-[3.4rem] ${
            dark ? "text-[#f5f0e8]" : "text-[#2a3a42]"
          }`}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mx-auto mt-5 max-w-xl font-sans text-[1.15rem] leading-[1.65] ${
              dark ? "text-[rgba(245,240,232,0.8)]" : "text-[#4a6a7d]"
            }`}
          >
            {subtitle}
          </p>
        )}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <PrimaryButton onClick={onSignup} className="!px-8 !py-4 !text-[1.1rem]">
            {t("landingShared.closingCta")}
          </PrimaryButton>
        </div>
        <p className={`mt-6 font-sans text-[0.9rem] ${dark ? "text-[rgba(245,240,232,0.6)]" : "text-[#9aacb4]"}`}>
          {t("landingShared.freeToJoin")}
        </p>
      </div>
    </section>
  );
}
