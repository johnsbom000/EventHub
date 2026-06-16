import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useToast } from "@/hooks/use-toast";
import BrandWordmark from "@/components/BrandWordmark";
import AuthModal from "@/components/AuthModal";

type Step = "question" | "signup";
type AuthTab = "login" | "signup";

const VENDOR_INTENT_RETURN_TO = "/vendor/provision";
const ROOT_RETURN_TO = "/";

const FAKE_LISTINGS = [
  // col 0
  { title: "Bouncy Castle Rental",            price: "$350",   photo: "https://images.unsplash.com/photo-1633846802535-75fafbcf9043?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { title: "Luxury Floral Wood Arch",         price: "$1,200", photo: "https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=530&fit=crop",  aspect: "4/5"  },
  // col 1
  { title: "Wedding DJ & Sound Package",      price: "$950",   photo: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&h=280&fit=crop",  aspect: "10/7" },
  // col 2
  { title: "Rustic Barn Venue Rental",        price: "$3,200", photo: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=400&h=560&fit=crop",  aspect: "5/7"  },
  // col 3
  { title: "Cotton Candy Machine Rental",     price: "$180",   photo: "https://images.unsplash.com/photo-1759974166601-0801712345ae?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { title: "Mobile Beverage & Bar Service",   price: "$720",   photo: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=500&fit=crop",  aspect: "4/5"  },
  // col 4
  { title: "Photo Booth + Props Package",     price: "$450",   photo: "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=400&h=480&fit=crop",  aspect: "5/6"  },
  { title: "Edison String Light Canopy",      price: "$380",   photo: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=400&h=300&fit=crop",  aspect: "4/3"  },
  { title: "Wine Barrel Rental",              price: "$220",   photo: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=420&fit=crop", aspect: "20/21"},
];

function QuestionStep({
  onVendor,
  onCustomer,
  onSignIn,
}: {
  onVendor: () => void;
  onCustomer: () => void;
  onSignIn: () => void;
}) {
  return (
    <>
      <BrandWordmark
        className="mb-7 text-[2.7rem] leading-none"
        eventClassName="text-[#e07a6a] font-normal italic"
        hubClassName="text-[#4a6a7d] font-normal"
      />
      <p className="mt-2 mb-8 font-sans text-[1.5rem] leading-[1.55] text-[#4a6a7d]">
        List your event services on EventHub.
      </p>
      <button
        type="button"
        onClick={onVendor}
        className="mb-3 flex w-full flex-col items-center gap-1.5 rounded-[10px] bg-[#2a3a42] px-3 py-5 font-sans text-[1.5rem] font-semibold text-white transition-colors hover:bg-[#3a4f59]"
      >
        Get started as a vendor
        <span className="text-[1.1rem] font-normal text-[rgba(255,255,255,0.65)]">List your services</span>
      </button>
      <button
        type="button"
        onClick={onCustomer}
        className="mb-4 flex w-full flex-col items-center gap-1 rounded-[10px] border-[2px] border-[rgba(74,106,125,0.22)] bg-white px-3 py-4 font-sans text-[1.35rem] font-semibold text-[#4a6a7d] transition-colors hover:border-[#4a6a7d] hover:bg-[#f8fafb]"
      >
        Plan an Event
        <span className="text-[1rem] font-normal text-[#9aacb4]">Find &amp; book vendors</span>
      </button>
      <p className="font-sans text-[1.2rem] text-[#9aacb4]">
        Already have an account?{" "}
        <button type="button" onClick={onSignIn} className="font-semibold text-[#4a6a7d] hover:underline">
          Sign in
        </button>
      </p>
    </>
  );
}

function SignupStep({
  onBack,
  onGoogle,
  onEmail,
}: {
  onBack: () => void;
  onGoogle: () => void;
  onEmail: () => void;
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
        Create your vendor account
      </h2>
      <p className="mt-2 mb-7 font-sans text-[1.5rem] leading-[1.5] text-[#4a6a7d]">
        Sign up to start listing your services on EventHub.
      </p>

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
        <a href="/terms" className="text-[#4a6a7d] hover:underline">Terms</a>{" "}
        &amp;{" "}
        <a href="/privacy" className="text-[#4a6a7d] hover:underline">Privacy Policy</a>
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
          <div className="mt-8 border-t border-[rgba(245,240,232,0.16)] pt-8 text-center space-y-2">
            <div className="flex justify-center gap-6">
              <a href="/terms" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.55)] hover:text-[rgba(245,240,232,0.9)]">Terms of Service</a>
              <a href="/privacy" className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.55)] hover:text-[rgba(245,240,232,0.9)]">Privacy Policy</a>
            </div>
            <p className="font-sans text-[0.87rem] text-[rgba(245,240,232,0.3)]">© {new Date().getFullYear()} Event Hub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function TemporaryLanding() {
  const [step, setStep] = useState<Step>("question");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    const mv = params.get("mv");
    const fv = params.get("fv");
    if (ref) localStorage.setItem("eventhub:pending-referral", ref.trim().toUpperCase());
    if (mv) localStorage.setItem("eventhub:marquee-invite-token", mv.trim());
    if (fv) localStorage.setItem("eventhub:founding-invite-token", fv.trim());
    if (ref || mv || fv) {
      const clean = new URLSearchParams(params);
      clean.delete("ref");
      clean.delete("mv");
      clean.delete("fv");
      const qs = clean.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<AuthTab>("login");
  const [authModalReturnTo, setAuthModalReturnTo] = useState<string>(ROOT_RETURN_TO);
  const { loginWithRedirect } = useAuth0();
  const { toast } = useToast();

  const openAuthModal = (tab: AuthTab, returnTo: string) => {
    setAuthModalTab(tab);
    setAuthModalReturnTo(returnTo);
    setAuthModalOpen(true);
  };

  const triggerAuth = async (opts: Parameters<typeof loginWithRedirect>[0]) => {
    sessionStorage.setItem("eh:after-auth-intent", "vendor");
    try {
      await loginWithRedirect({
        ...opts,
        appState: { returnTo: VENDOR_INTENT_RETURN_TO },
      });
    } catch (err: any) {
      sessionStorage.removeItem("eh:after-auth-intent");
      toast({
        title: "Sign up failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGoogle = () =>
    triggerAuth({
      authorizationParams: {
        connection: "google-oauth2",
        screen_hint: "signup",
        prompt: "select_account",
      },
    });

const handleEmail = () =>
    triggerAuth({
      authorizationParams: {
        screen_hint: "signup",
      },
    });

  // Customers reuse the shared AuthModal (same component used at checkout). No
  // vendor intent flag is set, so no vendor account is created — routing to "/"
  // sends them through /post-login, which detects them as a non-vendor and lands
  // them on /dashboard.
  const handleCustomer = () => openAuthModal("signup", ROOT_RETURN_TO);

  // Route sign-in through /post-login (via "/") so it detects vendor vs customer:
  // existing vendors land on /vendor/my-hub, existing customers on /dashboard.
  const handleSignIn = () => openAuthModal("login", ROOT_RETURN_TO);

  return (
    <div className="relative h-screen overflow-hidden bg-white">
      <FakeBackground />

      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4">
        <div className="relative w-full max-w-[560px] rounded-[20px] bg-white px-11 pb-11 pt-12 text-center shadow-[0_24px_80px_rgba(42,58,66,0.28)]">
          {step === "question" && (
            <QuestionStep
              onVendor={() => setStep("signup")}
              onCustomer={handleCustomer}
              onSignIn={handleSignIn}
            />
          )}
          {step === "signup" && (
            <SignupStep
              onBack={() => setStep("question")}
              onGoogle={handleGoogle}
              onEmail={handleEmail}
            />
          )}
        </div>
        <div className="flex gap-5">
          <a href="/privacy" className="font-sans text-[1.1rem] text-[#4a6a7d] hover:underline">Privacy Policy</a>
          <a href="/terms" className="font-sans text-[1.1rem] text-[#4a6a7d] hover:underline">Terms of Service</a>
        </div>
      </div>

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultTab={authModalTab}
        returnTo={authModalReturnTo}
      />
    </div>
  );
}
