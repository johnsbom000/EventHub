import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation, Trans } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import BrandWordmark from "@/components/BrandWordmark";
import AuthModal from "@/components/AuthModal";
import { trackBoth } from "@/lib/tracking";
import { initEngagement } from "@/lib/engagement";
import { captureAttribution, readAttribution } from "@/lib/landingAttribution";
import { readPricingModel, type PricingModel } from "@/hooks/usePricingModel";

/* ---------------------------------------------------------------------------
   Shared sign-up flow for the free-first landing variants (A–E).

   ACCOUNT-CREATION CONTRACT (single source of truth for all five pages):
   - Every marketing CTA opens the vendor-only SignupDialog and routes through
     `startSignup`, which sets the vendor-intent flag + returns the user to
     `/vendor/provision` → the "What's your business called?" step → a VENDOR
     account. There is no path here that creates a customer account.
   - "Log in" opens AuthModal (login). AuthModal now forces an explicit
     vendor/customer choice on its Sign-up tab, so even the login → sign-up
     detour can't silently mint a customer account.

   PRO-TRIAL ("Try Pro free") — subscription model only:
   A "Try Pro free" click starts a 30-day Pro trial after the vendor account is
   created. Two treatments exist (see `PRO_TRIAL_TREATMENT`):
     - card-upfront: VendorProvision hands off to Stripe Checkout to collect a
       card, then the trial auto-charges at day 30. Currently PAUSED.
     - no-card: VendorProvision calls /billing/start-trial to begin a card-free
       trial that downgrades to Free at day 30 unless a card is added. In use.
   The chosen treatment is passed to VendorProvision via `eh:pro-trial-mode`.
--------------------------------------------------------------------------- */

const VENDOR_INTENT_RETURN_TO = "/vendor/provision";

type SignupIntent = "free" | "pro";

// Pro-trial treatment. The card-upfront arm is PAUSED, so every landing page
// starts a no-card trial. The card path (Stripe Checkout) remains built and
// dormant in VendorProvision; to re-enable the card-vs-no-card A/B, branch on
// the landing style here and write "card" for the chosen pages.
type ProTrialTreatment = "card" | "nocard";
const PRO_TRIAL_TREATMENT: ProTrialTreatment = "nocard";

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
  const k = (key: string) => `landingSignup.${key}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] p-0">
        <DialogTitle className="sr-only">{t(k("dialogTitle"))}</DialogTitle>
        <DialogDescription className="sr-only">{t(k("dialogDescription"))}</DialogDescription>
        <div className="px-9 pb-9 pt-10 text-center">
          <BrandWordmark
            className="mb-6 text-[2.4rem] leading-none"
            eventClassName="text-[#e07a6a] font-normal italic"
            hubClassName="text-[#4a6a7d] font-normal"
          />
          <h2 className="font-heading text-[2rem] font-normal leading-[1.15] text-[#2a3a42]">{t(k("title"))}</h2>
          <p className="mt-2 mb-7 font-sans text-[1.05rem] leading-[1.5] text-[#4a6a7d]">{t(k("subtitle"))}</p>
          <button
            type="button"
            onClick={() => onStart("google")}
            className="mb-3 flex w-full items-center justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white py-3.5 font-sans text-[1.05rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center font-bold text-[#4285F4]">G</span>
            {t(k("continueGoogle"))}
          </button>
          <div className="my-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
            <span className="font-sans text-[0.85rem] font-medium text-[#7c8095]">{t(k("or"))}</span>
            <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
          </div>
          <button
            type="button"
            onClick={() => onStart("email")}
            className="mb-4 w-full rounded-[14px] bg-[#2a3a42] py-3.5 font-sans text-[1.1rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
          >
            {t(k("continueEmail"))}
          </button>
          <p className="mb-4 font-sans text-[0.85rem] leading-[1.4] text-[#6e7590]">
            <Trans
              i18nKey={k("termsAgreement")}
              components={{
                terms: <a href="/terms" className="text-[#4a6a7d] hover:underline" />,
                privacy: <a href="/privacy" className="text-[#4a6a7d] hover:underline" />,
              }}
            />
          </p>
          <p className="font-sans text-[0.92rem] text-[#9aacb4]">
            {t(k("alreadyHaveAccount"))}{" "}
            <button type="button" onClick={onLoginInstead} className="font-semibold text-[#4a6a7d] hover:underline">
              {t(k("logIn"))}
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Central controller for a landing page's signup + login flow. `ns` is the
// page's i18n namespace (e.g. "landingFreeA"). Returns CTA handlers plus the
// modal element to render once near the page root.
//
// `model` is the pricing-model arm the visitor was randomised into. Under
// "commission" there is no Pro tier at all, so this hook withholds the Pro CTA
// (typed optional, so calling it on a commission page is a compile error) and
// never stamps a Pro-trial treatment.
export function useLandingSignup(_ns: string, model: PricingModel) {
  const { t } = useTranslation();
  const { loginWithRedirect } = useAuth0();
  const { toast } = useToast();

  const [signupOpen, setSignupOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  // Which CTA opened the dialog — carried into analytics; drives the (deferred)
  // Pro-trial branch in startSignup.
  const [intent, setIntent] = useState<SignupIntent>("free");

  // Capture ?ref= referral codes, mirroring the control page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;
    localStorage.setItem("eventhub:pending-referral", ref.trim().toUpperCase());
    const clean = new URLSearchParams(params);
    clean.delete("ref");
    const qs = clean.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  // Fires vendor_engaged once on 25% scroll or 30s dwell.
  useEffect(() => initEngagement(), []);

  // First-touch ad attribution: capture on mount so a visitor who navigates
  // around before clicking a CTA is still attributed to the ad that brought
  // them (no-op if already captured this session).
  useEffect(() => captureAttribution(), []);

  // Stop the page rubber-band scrolling past the footer. On macOS/trackpad,
  // overscroll past the bottom exposes the white <body> background below the
  // slate footer, which reads as "scrolling past the footer into empty space".
  // Scoped to landing pages: the previous value is restored on unmount so the
  // rest of the app (chat, dashboards) keeps its native overscroll behaviour.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = "none";
    return () => {
      root.style.overscrollBehaviorY = prev;
    };
  }, []);

  // Mid-funnel signal for Meta ad-set learning: completed signups alone are
  // too sparse pre-launch to exit the learning phase (~50 conversions/week
  // needed), so the dialog-open moment (a proxy for "opens the signup
  // dialog" — every CTA here opens it immediately after this fires) also
  // reports as a Lead. pricing_model is read LIVE (PostHog flag, resolved by
  // the time a visitor reaches a CTA click) rather than stored, matching the
  // single source of truth used at the signup_completed conversion in
  // tracking.ts. landing_style is the first-touch value captured on landing
  // mount (null for organic "/" traffic, by design).
  const leadProps = (ctaId: string, intentValue: SignupIntent) => ({
    cta_id: ctaId,
    intent: intentValue,
    pricing_model: readPricingModel(),
    landing_style: readAttribution()?.landingStyle ?? null,
    source: ctaId,
  });

  // All signup CTAs route through here so the click is attributed
  // (PostHog signup_cta_click + Meta Lead) with a per-button cta_id + intent.
  const handleSignupCta = (ctaId: string) => {
    setIntent("free");
    trackBoth("signup_cta_click", leadProps(ctaId, "free"), { event: "Lead", standard: true });
    setSignupOpen(true);
  };

  // "Try Pro free" — deferred: opens the same vendor signup, tagged pro.
  const handleProCta = (ctaId: string) => {
    setIntent("pro");
    trackBoth("signup_cta_click", leadProps(ctaId, "pro"), { event: "Lead", standard: true });
    setSignupOpen(true);
  };

  const openLogin = () => setAuthModalOpen(true);

  // Free-first pages are vendor-only: always carry vendor intent and land on
  // /vendor/provision so the existing provisioning flow runs unchanged.
  const startSignup = async (method: "google" | "email") => {
    // captureAttribution() is a no-op by the time this runs — the mount
    // effect above lives in this same hook instance, so it has already fired
    // for any caller reachable here. Kept as a cheap, harmless safety net
    // only in case a future refactor exposes startSignup without mounting
    // the effect first; it is not doing real work today.
    captureAttribution();
    sessionStorage.setItem("eh:after-auth-intent", "vendor");
    // Pro-trial: a "Try Pro free" click (intent === "pro") starts a trial after
    // the account is created, using the currently-selected treatment.
    // A plain "Start free" click clears any stale flags so it can never inherit a
    // Pro trial. These are read (and cleared) by VendorProvision post-provision.
    // A commission vendor never starts a Pro trial (there is no Pro tier), so
    // the trial flags are cleared rather than written even if `intent` were
    // somehow "pro" — belt-and-braces alongside the withheld handleProCta.
    if (intent === "pro" && model === "subscription") {
      sessionStorage.setItem("eh:pro-trial-intent", "1");
      sessionStorage.setItem("eh:pro-trial-interval", "monthly");
      sessionStorage.setItem("eh:pro-trial-mode", PRO_TRIAL_TREATMENT);
    } else {
      sessionStorage.removeItem("eh:pro-trial-intent");
      sessionStorage.removeItem("eh:pro-trial-interval");
      sessionStorage.removeItem("eh:pro-trial-mode");
    }

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
        title: t("landingSignup.signupFailedTitle"),
        description: err?.message || t("landingSignup.signupFailedFallback"),
        variant: "destructive",
      });
    }
  };

  // Rendered once per page near the root.
  const modals = (
    <>
      <SignupDialog
        open={signupOpen}
        onOpenChange={setSignupOpen}
        onStart={startSignup}
        onLoginInstead={() => {
          setSignupOpen(false);
          setAuthModalOpen(true);
        }}
      />
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} defaultTab="login" returnTo="/post-login" />
    </>
  );

  return {
    handleSignupCta,
    // Commission pages have no Pro tier, so no Pro CTA exists to click.
    handleProCta: model === "subscription" ? handleProCta : undefined,
    openLogin,
    modals,
    intent,
  };
}
