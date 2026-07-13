import { useEffect, useState, type ReactNode } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation, Trans } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import BrandWordmark from "@/components/BrandWordmark";
import AuthModal from "@/components/AuthModal";
import { trackBoth } from "@/lib/tracking";
import { initEngagement } from "@/lib/engagement";
import ListingWizardDemo from "@/pages/landing/ListingWizardDemo";
import CustomerExperienceSection from "@/pages/landing/CustomerExperienceSection";
import FreeVsProSection from "@/pages/landing/FreeVsProSection";
import { VARIED_STOREFRONT_IMAGES } from "@/pages/landing/BookingFlowDemo";

const NS = "landingFreeA";
const VENDOR_INTENT_RETURN_TO = "/vendor/provision";
const SUPPORT_EMAIL = "support@eventhubglobal.com";
const SUPPORT_PHONE = "801-410-0092";

/* ---------------------------------------------------------------------------
   Small shared primitives — restrained editorial styling
--------------------------------------------------------------------------- */

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 font-sans text-[0.75rem] font-semibold uppercase tracking-[0.22em] text-[#e07a6a]">
      {children}
    </p>
  );
}

function PrimaryButton({ onClick, children, className = "" }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full bg-[#e07a6a] px-7 py-3.5 font-sans text-[1.05rem] font-semibold text-white transition-colors hover:bg-[#c96959] ${className}`}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, className = "" }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-6 py-3.5 font-sans text-[1.05rem] font-semibold text-[#4a6a7d] transition-colors hover:text-[#2a3a42] ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Vendor signup dialog (vendor-only)
--------------------------------------------------------------------------- */

function SignupDialog({
  open,
  onOpenChange,
  onStart,
  onLoginInstead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (method: "google" | "email") => void;
  onLoginInstead: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] p-0">
        <DialogTitle className="sr-only">{t(`${NS}.signup.dialogTitle`)}</DialogTitle>
        <DialogDescription className="sr-only">{t(`${NS}.signup.dialogDescription`)}</DialogDescription>
        <div className="px-9 pb-9 pt-10 text-center">
          <BrandWordmark
            className="mb-6 text-[2.4rem] leading-none"
            eventClassName="text-[#e07a6a] font-normal italic"
            hubClassName="text-[#4a6a7d] font-normal"
          />
          <h2 className="font-heading text-[2rem] font-normal leading-[1.15] text-[#2a3a42]">{t(`${NS}.signup.title`)}</h2>
          <p className="mt-2 mb-7 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">{t(`${NS}.signup.subtitle`)}</p>
          <button
            type="button"
            onClick={() => onStart("google")}
            className="mb-3 flex w-full items-center justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white py-3.5 font-sans text-[1.05rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center font-bold text-[#4285F4]">G</span>
            {t(`${NS}.signup.continueGoogle`)}
          </button>
          <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
            <span className="font-sans text-[0.85rem] font-medium text-[#7c8095]">{t(`${NS}.signup.or`)}</span>
            <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
          </div>
          <button
            type="button"
            onClick={() => onStart("email")}
            className="mb-4 w-full rounded-[14px] bg-[#2a3a42] py-3.5 font-sans text-[1.1rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
          >
            {t(`${NS}.signup.continueEmail`)}
          </button>
          <p className="mb-4 font-sans text-[0.85rem] leading-[1.4] text-[#6e7590]">
            <Trans
              i18nKey={`${NS}.signup.termsAgreement`}
              components={{
                terms: <a href="/terms" className="text-[#4a6a7d] hover:underline" />,
                privacy: <a href="/privacy" className="text-[#4a6a7d] hover:underline" />,
              }}
            />
          </p>
          <p className="font-sans text-[0.92rem] text-[#9aacb4]">
            {t(`${NS}.signup.alreadyHaveAccount`)}{" "}
            <button type="button" onClick={onLoginInstead} className="font-semibold text-[#4a6a7d] hover:underline">
              {t(`${NS}.signup.logIn`)}
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Page
--------------------------------------------------------------------------- */

export default function TemporaryLandingFreeA() {
  const { t } = useTranslation();
  const { loginWithRedirect } = useAuth0();
  const { toast } = useToast();

  // Capture ?ref= referral codes exactly like the control page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) localStorage.setItem("eventhub:pending-referral", ref.trim().toUpperCase());
    if (ref) {
      const clean = new URLSearchParams(params);
      clean.delete("ref");
      const qs = clean.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const [signupOpen, setSignupOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const openSignup = () => setSignupOpen(true);
  // Fires vendor_engaged once on 25% scroll or 30s dwell; returns cleanup.
  useEffect(() => initEngagement(), []);

  // All signup CTAs route through here so the click is attributed
  // (PostHog signup_cta_click + Meta Lead) with a per-button cta_id.
  const handleSignupCta = (ctaId: string) => {
    trackBoth("signup_cta_click", { cta_id: ctaId }, { event: "Lead", standard: true });
    openSignup();
  };
  const openLogin = () => setAuthModalOpen(true);

  // Free-first pages are vendor-only: always carry vendor intent and land on
  // /vendor/provision so the existing provisioning flow runs unchanged.
  const startSignup = async (method: "google" | "email") => {
    sessionStorage.setItem("eh:after-auth-intent", "vendor");
    // Never let a stale "Try Pro" intent from the control page leak in.
    sessionStorage.removeItem("eh:pro-trial-intent");
    sessionStorage.removeItem("eh:pro-trial-interval");

    const authorizationParams: Record<string, string> = { screen_hint: "signup" };
    if (method === "google") {
      authorizationParams.connection = "google-oauth2";
      authorizationParams.prompt = "select_account";
    }
    try {
      await loginWithRedirect({
        authorizationParams,
        appState: { returnTo: VENDOR_INTENT_RETURN_TO },
      });
    } catch (err: any) {
      sessionStorage.removeItem("eh:after-auth-intent");
      toast({
        title: t(`${NS}.toast.signupFailedTitle`),
        description: err?.message || t(`${NS}.toast.signupFailedFallback`),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky bar + header */}
      <div className="sticky top-0 z-40">
        {/* Slim free bar */}
        <div className="bg-[#f8fafb] text-[#4a6a7d]">
          <div className="mx-auto flex max-w-[1240px] items-center justify-center gap-2 px-5 py-2 text-center lg:px-10">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9dd4cc]" />
            <span className="font-sans text-[0.9rem] leading-tight">{t(`${NS}.bar.text`)}</span>
          </div>
        </div>

        {/* Header */}
        <header className="border-b border-[rgba(74,106,125,0.1)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 lg:px-10">
            <BrandWordmark
              className="text-[1.9rem] leading-none tracking-tight lg:text-[2.2rem]"
              eventClassName="text-[#e07a6a] font-normal"
              hubClassName="text-[#4a6a7d] font-normal"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openLogin}
                className="rounded-full px-4 py-2 font-sans text-[0.98rem] font-semibold text-[#4a6a7d] transition-colors hover:text-[#2a3a42]"
              >
                {t(`${NS}.header.logIn`)}
              </button>
              <button
                type="button"
                onClick={() => handleSignupCta("header_get_started")}
                className="rounded-full bg-[#e07a6a] px-5 py-2 font-sans text-[0.98rem] font-semibold text-white transition-colors hover:bg-[#c96959]"
              >
                {t(`${NS}.header.getStarted`)}
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Hero */}
      <section>
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-5 py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:px-10 lg:py-28">
          <div>
            <Eyebrow>{t(`${NS}.hero.eyebrow`)}</Eyebrow>
            <h1 className="font-heading text-[clamp(2.8rem,6.5vw,4.6rem)] font-light leading-[1.02] text-[#2a3a42]">
              <Trans
                i18nKey={`${NS}.hero.title`}
                components={{ accent: <em className="italic text-[#e07a6a]" /> }}
              />
            </h1>
            <p className="mt-7 max-w-lg font-sans text-[1.2rem] leading-[1.65] text-[#4a6a7d]">
              {t(`${NS}.hero.subtitle`)}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-2">
              <PrimaryButton onClick={() => handleSignupCta("hero_primary")} className="!text-[1.1rem]">{t(`${NS}.hero.ctaVendor`)}</PrimaryButton>
              <GhostButton onClick={openLogin} className="!text-[1.1rem]">{t(`${NS}.hero.logIn`)}</GhostButton>
            </div>
            <p className="mt-6 font-sans text-[0.95rem] text-[#9aacb4]">{t(`${NS}.hero.trustLine`)}</p>
          </div>
          <div className="rounded-[28px] bg-[#f5f0e8] p-8 lg:p-12">
            <ListingWizardDemo />
          </div>
        </div>
      </section>

      {/* What your customers see when they book you */}
      <CustomerExperienceSection storefrontImages={VARIED_STOREFRONT_IMAGES} />

      {/* Free vs Pro — what the vendor gets */}
      <FreeVsProSection onSignup={() => handleSignupCta("free_vs_pro")} />

      {/* Closing band — calm contrast moment */}
      <section className="bg-[#2a3a42]">
        <div className="mx-auto max-w-[1240px] px-5 py-24 text-center lg:px-10 lg:py-28">
          <h2 className="mx-auto max-w-3xl font-heading text-[2.6rem] font-light leading-[1.08] text-[#f5f0e8] lg:text-[3.4rem]">
            <Trans
              i18nKey={`${NS}.closing.title`}
              components={{ accent: <em className="italic text-[#e07a6a]" /> }}
            />
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-sans text-[1.15rem] leading-[1.65] text-[rgba(245,240,232,0.8)]">
            {t(`${NS}.closing.subtitle`)}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <PrimaryButton onClick={() => handleSignupCta("closing_cta")} className="!px-8 !py-4 !text-[1.1rem]">{t(`${NS}.closing.cta`)}</PrimaryButton>
            <button
              type="button"
              onClick={openLogin}
              className="rounded-full px-6 py-4 font-sans text-[1.1rem] font-semibold text-[#f5f0e8] transition-colors hover:text-white"
            >
              {t(`${NS}.closing.logIn`)}
            </button>
          </div>
          <p className="mt-6 font-sans text-[0.9rem] text-[rgba(245,240,232,0.6)]">
            {t(`${NS}.closing.trustLine`)}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#4a6a7d]">
        <div className="mx-auto max-w-[1240px] px-5 py-14 lg:px-10">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="col-span-1 md:col-span-2">
              <BrandWordmark
                className="mb-4 text-[2.4rem]"
                eventClassName="text-[#f5f0e8] font-normal"
                hubClassName="text-[#9dd4cc] font-normal"
              />
              <p className="max-w-md font-sans text-[1.02rem] leading-[1.6] text-[rgba(245,240,232,0.85)]">
                {t(`${NS}.footer.description`)}
              </p>
            </div>

            <div>
              <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t(`${NS}.footer.company`)}</h3>
              <ul className="space-y-2.5">
                <li><a href="/terms" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">{t(`${NS}.footer.terms`)}</a></li>
                <li><a href="/privacy" className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">{t(`${NS}.footer.privacy`)}</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-4 font-sans text-[0.82rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">{t(`${NS}.footer.contact`)}</h3>
              <ul className="space-y-2.5">
                <li>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">
                    {SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <a href={`tel:${SUPPORT_PHONE.replace(/[^0-9]/g, "")}`} className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)] hover:text-white">
                    {SUPPORT_PHONE}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[rgba(245,240,232,0.16)] pt-8 sm:flex-row">
            <p className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.45)]">
              {t(`${NS}.footer.copyright`, { year: new Date().getFullYear() })}
            </p>
            <div className="flex gap-6">
              <a href="/terms" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">{t(`${NS}.footer.termsShort`)}</a>
              <a href="/privacy" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.6)] hover:text-white">{t(`${NS}.footer.privacyShort`)}</a>
            </div>
          </div>
        </div>
      </footer>

      <SignupDialog
        open={signupOpen}
        onOpenChange={setSignupOpen}
        onStart={startSignup}
        onLoginInstead={() => {
          setSignupOpen(false);
          openLogin();
        }}
      />
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultTab="login"
        returnTo="/post-login"
      />
    </div>
  );
}
