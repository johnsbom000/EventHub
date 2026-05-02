import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useToast } from "@/hooks/use-toast";
import BrandWordmark from "@/components/BrandWordmark";
import { useLocation } from "wouter";

type Step = "question" | "signup" | "signin";
type LandingIntent = "vendor-signup" | "vendor-signin" | "customer";

const RETURN_TO_BY_INTENT: Record<LandingIntent, string> = {
  "vendor-signup": "/?intent=vendor-signup",
  "vendor-signin": "/?intent=vendor-signin",
  customer: "/?intent=customer",
};

function getCurrentIntent(): LandingIntent | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("intent");
  if (raw === "vendor-signup" || raw === "vendor-signin" || raw === "customer") {
    return raw;
  }
  return null;
}

function clearIntentFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("intent");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

function normalizeEmail(value: string | undefined | null): string {
  return String(value || "").trim().toLowerCase();
}

function getExpectedEmailFromUrl(): string {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("expectedEmail");
  return normalizeEmail(raw);
}

type MismatchError = { expectedEmail: string; actualEmail: string };

function getMismatchErrorFromUrl(): MismatchError | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("signInError") !== "email_mismatch") return null;
  return {
    expectedEmail: normalizeEmail(params.get("expectedEmail")),
    actualEmail: normalizeEmail(params.get("actualEmail")),
  };
}

function clearMismatchErrorFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("signInError");
  url.searchParams.delete("expectedEmail");
  url.searchParams.delete("actualEmail");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}` || "/");
}

function buildReturnTo(intent: LandingIntent, expectedEmail?: string): string {
  const url = new URL(RETURN_TO_BY_INTENT[intent], "http://localhost");
  const normalizedExpectedEmail = normalizeEmail(expectedEmail);
  if (normalizedExpectedEmail) {
    url.searchParams.set("expectedEmail", normalizedExpectedEmail);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

// ---------------------------------------------------------------------------
// Fake listing card data for the blurry background
// Photos: loremflickr.com/{w}/{h}/{keywords} — returns real keyword-matched
// Flickr photos. Varied aspect ratios create natural masonry staggering.
// ---------------------------------------------------------------------------
const FAKE_LISTINGS = [
  // col 0
  { title: "Bouncy Castle Rental",            price: "$350",   photo: "https://loremflickr.com/400/300/bouncy,castle,inflatable?lock=11", aspect: "4/3"  },
  { title: "Luxury Floral Wood Arch",         price: "$1,200", photo: "https://loremflickr.com/400/530/wedding,arch,floral,wood?lock=2",  aspect: "4/5"  },
  // col 1
  { title: "Wedding DJ & Sound Package",      price: "$950",   photo: "https://loremflickr.com/400/280/dj,wedding,party?lock=4",          aspect: "10/7" },
  // col 2
  { title: "Rustic Barn Venue Rental",        price: "$3,200", photo: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400&h=560&fit=crop", aspect: "5/7"  },
  // col 3
  { title: "Cotton Candy Machine Rental",     price: "$180",   photo: "https://loremflickr.com/400/300/cotton,candy,machine?lock=9",     aspect: "4/3"  },
  { title: "Mobile Beverage & Bar Service",   price: "$720",   photo: "https://loremflickr.com/400/500/cocktail,bar,wedding?lock=8",      aspect: "4/5"  },
  // col 4
  { title: "Photo Booth + Props Package",     price: "$450",   photo: "https://loremflickr.com/400/480/photo,booth,party,wedding?lock=9", aspect: "5/6"  },
  { title: "Edison String Light Canopy",      price: "$380",   photo: "https://loremflickr.com/400/300/string,lights,wedding?lock=10",    aspect: "4/3"  },
  { title: "Wine Barrel Rental",              price: "$220",   photo: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=420&fit=crop", aspect: "20/21"},
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QuestionStep({
  onYes,
  onNo,
  onSignIn,
  showEmailMismatch,
  expectedEmailForMismatch,
  actualEmailForMismatch,
}: {
  onYes: () => void;
  onNo: () => void;
  onSignIn: () => void;
  showEmailMismatch: boolean;
  expectedEmailForMismatch: string;
  actualEmailForMismatch: string;
}) {
  return (
    <>
      <BrandWordmark
        className="mb-7 text-[2.7rem] leading-none"
        eventClassName="text-[#e07a6a] font-normal italic"
        hubClassName="text-[#4a6a7d] font-normal"
      />
      <p className="mt-2 mb-8 font-sans text-[1.5rem] leading-[1.55] text-[#4a6a7d]">
        Join all the vendors making the switch to Event Hub!<br />
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          type="button"
          onClick={onNo}
          className="rounded-[10px] border-[1.5px] border-[rgba(74,106,125,0.2)] bg-white px-0 py-4 font-sans text-[1.65rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
        >
          Plan an Event
        </button>
        <button
          type="button"
          onClick={onYes}
          className="rounded-[10px] bg-[#2a3a42] px-0 py-4 font-sans text-[1.65rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
        >
          Become a Vendor
        </button>
      </div>
      <p className="font-sans text-[1.2rem] text-[#9aacb4]">
        Already a vendor?{" "}
        <button type="button" onClick={onSignIn} className="font-semibold text-[#4a6a7d] hover:underline">
          Sign in
        </button>
      </p>
      {showEmailMismatch ? (
        <div className="mt-4 rounded-[10px] border border-[rgba(224,122,106,0.35)] bg-[rgba(224,122,106,0.08)] px-4 py-3 text-left">
          <p className="font-sans text-[1.05rem] text-[#2a3a42]">
            You signed in as <strong>{actualEmailForMismatch || "a different account"}</strong>, but expected{" "}
            <strong>{expectedEmailForMismatch}</strong>.
          </p>
        </div>
      ) : null}
    </>
  );
}

function SignInStep({
  onBack,
  onGoogle,
  onEmail,
  signInEmail,
  onSignInEmailChange,
  showMissingVendorAccount,
  onCreateVendorAccount,
}: {
  onBack: () => void;
  onGoogle: () => void;
  onEmail: () => void;
  signInEmail: string;
  onSignInEmailChange: (value: string) => void;
  showMissingVendorAccount: boolean;
  onCreateVendorAccount: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="absolute left-5 top-5 flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[1.2rem] text-[#4a6a7d] hover:bg-[#f0f4f7]"
      >
        ← Back
      </button>
      <BrandWordmark
        className="mb-7 mt-2 text-[2.7rem] leading-none"
        eventClassName="text-[#e07a6a] font-normal italic"
        hubClassName="text-[#4a6a7d] font-normal"
      />
      <h2 className="font-heading text-[2.4rem] font-normal leading-[1.15] text-[#2a3a42]">
        Sign in to your account
      </h2>
      <p className="mt-2 mb-6 font-sans text-[1.35rem] leading-[1.5] text-[#4a6a7d]">
        Use the same method you signed up with.
      </p>

      <div className="mb-5 text-left">
        <label
          htmlFor="temporary-signin-email"
          className="mb-1.5 block font-sans text-[1.05rem] font-medium text-[#4a6a7d]"
        >
          Email <span className="font-normal text-[#9aacb4]">(optional — helps prefill)</span>
        </label>
        <input
          id="temporary-signin-email"
          type="email"
          autoComplete="email"
          value={signInEmail}
          onChange={(e) => onSignInEmailChange(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-[10px] border border-[rgba(74,106,125,0.3)] px-3 py-2.5 font-sans text-[1.05rem] text-[#2a3a42] outline-none focus:border-[#4a6a7d]"
        />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        className="mb-3 flex w-full items-center justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white py-3.5 font-sans text-[1.5rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center font-bold text-[#4285F4]">G</span>
        Continue with Google
      </button>

      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
        <span className="font-sans text-[1.2rem] font-medium text-[#7c8095]">or</span>
        <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
      </div>

      <button
        type="button"
        onClick={onEmail}
        className="mb-4 w-full rounded-[14px] bg-[#2a3a42] py-3.5 font-sans text-[1.65rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
      >
        Continue with email
      </button>

      {showMissingVendorAccount ? (
        <div className="mt-2 rounded-[10px] border border-[rgba(224,122,106,0.35)] bg-[rgba(224,122,106,0.08)] px-4 py-3 text-left">
          <p className="font-sans text-[1.15rem] text-[#2a3a42]">
            We couldn't find your vendor account.
          </p>
          <button
            type="button"
            onClick={onCreateVendorAccount}
            className="mt-2 font-sans text-[1.1rem] font-semibold text-[#4a6a7d] hover:underline"
          >
            Create account instead
          </button>
        </div>
      ) : null}
    </>
  );
}

function SignupStep({
  onBack,
  onGoogle,
  onEmail,
  signupEmail,
  onSignupEmailChange,
}: {
  onBack: () => void;
  onGoogle: () => void;
  onEmail: () => void;
  signupEmail: string;
  onSignupEmailChange: (value: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="absolute left-5 top-5 flex items-center gap-1 rounded-md px-2 py-1 font-sans text-[1.2rem] text-[#4a6a7d] hover:bg-[#f0f4f7]"
      >
        ← Back
      </button>
      <BrandWordmark
        className="mb-7 mt-2 text-[2.7rem] leading-none"
        eventClassName="text-[#e07a6a] font-normal italic"
        hubClassName="text-[#4a6a7d] font-normal"
      />
      <h2 className="font-heading text-[2.4rem] font-normal leading-[1.15] text-[#2a3a42]">
        Create your account
      </h2>
      <p className="mt-2 mb-7 font-sans text-[1.5rem] leading-[1.5] text-[#4a6a7d]">
        Sign up with Google or email — we'll take you straight to vendor onboarding.
      </p>
      <div className="mb-4">
        <label
          htmlFor="temporary-signup-email"
          className="mb-1.5 block text-left font-sans text-[1.05rem] font-medium text-[#4a6a7d]"
        >
          Account email
        </label>
        <input
          id="temporary-signup-email"
          type="email"
          autoComplete="email"
          value={signupEmail}
          onChange={(e) => onSignupEmailChange(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-[10px] border border-[rgba(74,106,125,0.3)] px-3 py-2.5 font-sans text-[1.05rem] text-[#2a3a42] outline-none focus:border-[#4a6a7d]"
        />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        className="mb-3 flex w-full items-center justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white py-3.5 font-sans text-[1.5rem] font-semibold text-[#2a3a42] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center font-bold text-[#4285F4]">G</span>
        Continue with Google
      </button>

      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
        <span className="font-sans text-[1.2rem] font-medium text-[#7c8095]">or</span>
        <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
      </div>

      <button
        type="button"
        onClick={onEmail}
        className="mb-4 w-full rounded-[14px] bg-[#2a3a42] py-3.5 font-sans text-[1.65rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
      >
        Continue with email
      </button>

      <p className="font-sans text-[1.2rem] leading-[1.4] text-[#6e7590]">
        By signing up you agree to our{" "}
        <a href="#" className="text-[#4a6a7d] hover:underline">Terms</a>{" "}
        &amp;{" "}
        <a href="#" className="text-[#4a6a7d] hover:underline">Privacy Policy</a>
      </p>
    </>
  );
}

function FakeBackground() {
  const columns: (typeof FAKE_LISTINGS)[] = [[], [], [], [], []];
  const [bouncyCastle, luxuryArch, weddingDJ, rusticBarn, cottonCandy, beverage, photoBooth, edisonLights, wineBarrel] = FAKE_LISTINGS;
  columns[0].push(bouncyCastle, beverage);
  columns[1].push(luxuryArch, photoBooth);
  columns[2].push(weddingDJ, edisonLights);
  columns[3].push(rusticBarn);
  columns[4].push(cottonCandy, wineBarrel);

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden bg-white"
      style={{ filter: "blur(3px)" }}
      aria-hidden="true"
    >
      <nav className="sticky top-0 z-50 bg-white">
        <div className="w-full px-6 lg:px-10">
          <div className="flex min-h-16 items-center py-2">
            <BrandWordmark
              className="text-[2.72rem] leading-none tracking-tight"
              eventClassName="text-[#e07a6a] font-normal"
              hubClassName="text-[#4a6a7d] font-normal"
            />
          </div>
        </div>
      </nav>

      <div className="bg-white">
        <div className="mx-auto w-full max-w-[1320px] px-4 pt-10 pb-10 sm:px-6 lg:px-4 lg:pt-[3rem] lg:pb-[3rem]">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="text-[clamp(2.754rem,5.8905vw,4.913rem)] font-heading font-light leading-[1.05] text-[#2a3a42] lg:text-[clamp(3.6461rem,7.7907vw,6.5004rem)]">
              Event <em className="text-[#e07a6a] italic">Vendors,</em>
              <br />
              All in One Place.
            </h1>
          </div>
          <div className="landing-hero-search-scale-down mx-auto mt-12 w-full max-w-[1320px] rounded-[12px] border-[1.5px] border-[rgba(74,106,125,0.2)] bg-white p-3 lg:mt-[3.9675rem] lg:rounded-[15.87px] lg:p-[0.8rem]">
            <div className="grid grid-cols-1 gap-0 md:grid-cols-[3fr_1.7fr_1.25fr_1.1fr_1.3fr] md:gap-[0.42rem] lg:grid-cols-[3.4fr_1.955fr_1.2fr_1fr_1.345fr]">
              <div className="flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[0.84rem] lg:py-[0.55rem] font-sans text-[16.75px] text-[#9aacb4] lg:text-[26.04px]">Any city</div>
              <div className="flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] font-sans text-[16.75px] text-[#9aacb4] lg:text-[26.04px]">Wedding, Party…</div>
              <div className="flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] font-sans text-[16px] text-[#9aacb4] lg:text-[25.29px]">Select date</div>
              <div className="flex min-h-[58px] items-center border-b border-[rgba(74,106,125,0.14)] px-4 py-2 md:min-h-0 md:border-b-0 lg:border-r lg:border-[rgba(74,106,125,0.12)] lg:px-[1.3225rem] font-sans text-[16.75px] text-[#9aacb4] lg:text-[26.04px]">Rentals</div>
              <div className="flex items-center justify-center px-3 pt-3 pb-2 md:justify-end md:pt-2 lg:px-[0.9919rem] lg:py-[0.6613rem]">
                <div className="editorial-search-btn h-[54px] w-full max-w-[210px] rounded-lg flex items-center justify-center font-sans text-[22px] font-semibold lg:h-[71.415px] lg:max-w-[277.725px] lg:text-[26px]">Search</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="w-full px-4 sm:px-6 lg:px-12 py-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-heading !text-[32px] font-normal text-[#2a3a42]">Featured Listings</h2>
          <span className="font-sans text-[1.25rem] font-medium uppercase tracking-[0.1em] text-[#e07a6a]">View all</span>
        </div>

        <div className="flex gap-4">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-1 flex-col gap-4">
              {col.map((l) => (
                <div
                  key={l.title}
                  className="w-full overflow-hidden rounded-[12px] bg-white shadow-[0_4px_24px_rgba(74,106,125,0.10)]"
                >
                  <img
                    src={l.photo}
                    alt=""
                    className="block w-full object-cover"
                    style={{ aspectRatio: l.aspect }}
                    loading="eager"
                  />
                  <div className="flex items-start justify-between gap-2 px-2.5 py-2.5">
                    <span className="font-heading text-[1.15rem] leading-snug text-[#2a3a42]">{l.title}</span>
                    <span className="shrink-0 font-heading text-[1.2rem] font-bold text-[#e07a6a]">{l.price}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[rgba(245,240,232,0.12)] bg-[#4a6a7d]">
        <div className="w-full px-6 lg:px-10 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="mb-4">
                <BrandWordmark
                  className="text-[2.54rem]"
                  eventClassName="text-[#f5f0e8] font-normal"
                  hubClassName="text-[#9dd4cc] font-normal"
                />
              </div>
              <p className="mb-4 max-w-md font-sans text-[1.05rem] text-[rgba(245,240,232,0.85)]">
                Your trusted platform for finding and booking the perfect event vendors.
              </p>
            </div>
            <div>
              <h3 className="mb-4 font-sans text-[0.84rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">For Customers</h3>
              <ul className="space-y-2">
                <li><span className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)]">Browse Vendors</span></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 font-sans text-[0.84rem] font-medium uppercase tracking-[0.1em] text-[#9dd4cc]">For Vendors</h3>
              <ul className="space-y-2">
                <li><span className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)]">Become a Vendor</span></li>
                <li><span className="font-sans text-[0.98rem] text-[rgba(245,240,232,0.85)]">Vendor Dashboard</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-[rgba(245,240,232,0.16)] pt-8 text-center">
            <p className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.3)]">© 2025 Event Hub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function TemporaryLanding() {
  const [step, setStep] = useState<Step>("question");
  const [isRoutingIntent, setIsRoutingIntent] = useState(false);
  const [showMissingVendorAccount, setShowMissingVendorAccount] = useState(false);
  const [showEmailMismatch, setShowEmailMismatch] = useState(false);
  const [expectedEmailForMismatch, setExpectedEmailForMismatch] = useState("");
  const [actualEmailForMismatch, setActualEmailForMismatch] = useState("");
  const [signInEmail, setSignInEmail] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user, loginWithRedirect, getAccessTokenSilently, logout } = useAuth0();
  const { toast } = useToast();

  const triggerAuth = async (
    intent: LandingIntent,
    opts?: Parameters<typeof loginWithRedirect>[0],
    expectedEmail?: string
  ) => {
    try {
      setShowMissingVendorAccount(false);
      setShowEmailMismatch(false);
      await loginWithRedirect({
        ...(opts || {}),
        appState: {
          ...(opts?.appState || {}),
          returnTo: buildReturnTo(intent, expectedEmail),
        },
      });
    } catch (err: any) {
      toast({
        title: "Authentication failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const resolveIntent = useCallback(
    async (intent: LandingIntent) => {
      if (!isAuthenticated) return;
      setIsRoutingIntent(true);

      try {
        const expectedEmail = getExpectedEmailFromUrl();
        const actualEmail = normalizeEmail(user?.email);

        if (expectedEmail && actualEmail && expectedEmail !== actualEmail) {
          clearIntentFromUrl();
          // logout() redirects the browser immediately, so we can't show state —
          // encode the mismatch in the returnTo URL and read it back on mount.
          const returnTo =
            `${window.location.origin}/?signInError=email_mismatch` +
            `&expectedEmail=${encodeURIComponent(expectedEmail)}` +
            `&actualEmail=${encodeURIComponent(actualEmail)}`;
          await logout({ logoutParams: { returnTo } });
          return;
        }

        const token = await getAccessTokenSilently({
          authorizationParams: {
            audience: "https://eventhub-api",
            scope: "openid profile email",
          },
        });

        if (!token) {
          throw new Error("Missing access token");
        }

        if (intent === "customer") {
          const customerRes = await fetch("/api/customer/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          });

          if (!customerRes.ok) {
            throw new Error(`Failed to load customer account (${customerRes.status})`);
          }

          setLocation("/dashboard");
          return;
        }

        const vendorRes = await fetch("/api/vendor/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

        if (vendorRes.status === 404) {
          if (intent === "vendor-signin") {
            clearIntentFromUrl();
            setStep("signin");
            setShowMissingVendorAccount(true);
            setShowEmailMismatch(false);
            return;
          }
          setLocation("/vendor/onboarding");
          return;
        }

        if (!vendorRes.ok) {
          throw new Error(`Failed to load vendor account (${vendorRes.status})`);
        }

        const vendorData = await vendorRes.json();
        const hasAnyVendorProfiles = Boolean(vendorData?.hasAnyVendorProfiles ?? vendorData?.profileComplete);

        setLocation(hasAnyVendorProfiles ? "/vendor/dashboard" : "/vendor/onboarding");
      } catch (err: any) {
        toast({
          title: "Unable to finish sign in",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsRoutingIntent(false);
      }
    },
    [getAccessTokenSilently, isAuthenticated, logout, setLocation, toast, user?.email]
  );

  // On first render, restore a mismatch error that was encoded in the URL by the
  // logout redirect (since logout() navigates away before any state can be shown).
  useEffect(() => {
    const mismatch = getMismatchErrorFromUrl();
    if (!mismatch) return;
    clearMismatchErrorFromUrl();
    setShowEmailMismatch(true);
    setExpectedEmailForMismatch(mismatch.expectedEmail);
    setActualEmailForMismatch(mismatch.actualEmail);
    if (mismatch.expectedEmail) setSignInEmail(mismatch.expectedEmail);
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const intent = getCurrentIntent();
    if (!intent) return;
    void resolveIntent(intent);
  }, [isAuthenticated, isLoading, resolveIntent]);

  const handleBecomeVendor = async () => {
    if (isAuthenticated) {
      await resolveIntent("vendor-signup");
      return;
    }
    setStep("signup");
    setShowMissingVendorAccount(false);
    setShowEmailMismatch(false);
    if (!signupEmail && signInEmail) {
      setSignupEmail(signInEmail);
    }
  };

  const handlePlanEvent = async () => {
    if (isAuthenticated) {
      await resolveIntent("customer");
      return;
    }
    await triggerAuth(
      "customer",
      {
        authorizationParams: {
          screen_hint: "signup",
        },
      },
      signInEmail
    );
  };

  const handleSignIn = () => {
    setStep("signin");
    setShowMissingVendorAccount(false);
    setShowEmailMismatch(false);
  };

  const handleSignInGoogle = () => {
    const hint = normalizeEmail(signInEmail) || undefined;
    return triggerAuth(
      "vendor-signin",
      {
        authorizationParams: {
          connection: "google-oauth2",
          prompt: "login",
          ...(hint ? { login_hint: hint } : {}),
        },
      },
      hint
    );
  };

  const handleSignInEmail = () => {
    const hint = normalizeEmail(signInEmail) || undefined;
    return triggerAuth(
      "vendor-signin",
      {
        authorizationParams: {
          prompt: "login",
          ...(hint ? { login_hint: hint } : {}),
        },
      },
      hint
    );
  };

  const requireSignupEmail = (): string | null => {
    const normalizedEmail = normalizeEmail(signupEmail);
    if (normalizedEmail) {
      return normalizedEmail;
    }
    toast({
      title: "Email required",
      description: "Enter your account email before continuing.",
      variant: "destructive",
    });
    return null;
  };

  const handleGoogle = () => {
    const expectedEmail = requireSignupEmail();
    if (!expectedEmail) return;
    return triggerAuth(
      "vendor-signup",
      {
        authorizationParams: {
          connection: "google-oauth2",
          screen_hint: "signup",
          prompt: "select_account",
          login_hint: expectedEmail,
        },
      },
      expectedEmail
    );
  };

  const handleEmail = () => {
    const expectedEmail = requireSignupEmail();
    if (!expectedEmail) return;
    return triggerAuth(
      "vendor-signup",
      {
        authorizationParams: {
          screen_hint: "signup",
          login_hint: expectedEmail,
        },
      },
      expectedEmail
    );
  };

  return (
    <div className="relative h-screen overflow-hidden bg-white">
      <FakeBackground />

      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="relative w-full max-w-[560px] rounded-[20px] bg-white px-11 pb-11 pt-12 text-center shadow-[0_24px_80px_rgba(42,58,66,0.28)]">
          {isRoutingIntent ? (
            <div className="py-12">
              <p className="font-sans text-[1.45rem] text-[#4a6a7d]">Finishing sign in...</p>
            </div>
          ) : (
            <>
              {step === "question" && (
                <QuestionStep
                  onYes={handleBecomeVendor}
                  onNo={handlePlanEvent}
                  onSignIn={handleSignIn}
                  showEmailMismatch={showEmailMismatch}
                  expectedEmailForMismatch={expectedEmailForMismatch}
                  actualEmailForMismatch={actualEmailForMismatch}
                />
              )}
              {step === "signin" && (
                <SignInStep
                  onBack={() => {
                    setStep("question");
                    setShowMissingVendorAccount(false);
                  }}
                  onGoogle={handleSignInGoogle}
                  onEmail={handleSignInEmail}
                  signInEmail={signInEmail}
                  onSignInEmailChange={setSignInEmail}
                  showMissingVendorAccount={showMissingVendorAccount}
                  onCreateVendorAccount={() => {
                    setShowMissingVendorAccount(false);
                    if (!signupEmail && signInEmail) setSignupEmail(signInEmail);
                    setStep("signup");
                  }}
                />
              )}
              {step === "signup" && (
                <SignupStep
                  onBack={() => {
                    setStep("question");
                    setShowMissingVendorAccount(false);
                  }}
                  onGoogle={handleGoogle}
                  onEmail={handleEmail}
                  signupEmail={signupEmail}
                  onSignupEmailChange={setSignupEmail}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
