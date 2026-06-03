import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Timer } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import BrandWordmark from "@/components/BrandWordmark";
import { Badge } from "@/components/ui/badge";
import { loginWithPopupFirst } from "@/lib/auth0Login";

const FOUNDING_TOKEN_STORAGE_KEY = "eventhub:founding-invite-token";

const valueProps = [
  {
    title: "Keep more",
    description: "A fee holiday to start, then a founding rate that stays below standard.",
  },
  {
    title: "Book more",
    description: "Top placement and a marketing spotlight while you grow.",
  },
  {
    title: "Belong",
    description: "A permanent Founding Vendor badge and early access to everything new.",
  },
];

const benefits = [
  {
    title: "Fee Holiday: 0% platform fee",
    description:
      "Keep 100% of your first 10 bookings. No platform commission while the holiday is active.",
    tag: "Ends at 10 bookings or 30 days, whichever comes last",
  },
  {
    title: "The Founding Rate: 6% instead of 8%",
    description:
      "After the holiday, your platform fee settles at just 6% for 12 months. After 12 months, your fee returns to the normal platform rate.",
    tag: "Lasts 12 months, then returns to standard",
  },
  {
    title: "Launch Visibility: top placement + spotlight",
    description:
      "Guaranteed top placement in your area's search, plus a feature to our email list and socials.",
    tag: "Runs your first 12 months, then converts to merit placement",
  },
  {
    title: "White-Glove Onboarding",
    description:
      "We offer to build your first listing and sync your calendar with you. Setup takes about 10 minutes.",
    tag: "One-time · on the house",
  },
  {
    title: "Founding Vendor Badge",
    description:
      "A permanent badge on your shop marking you as one of the original EventHub vendors.",
    tag: "Permanent · displayed on all your listings",
  },
  {
    title: "Refer a Vendor, Earn Free Bookings",
    description:
      "For every vendor you refer who publishes a listing, earn 5 additional bookings at half the normal fee.",
    tag: "Available during the enrollment window only",
  },
];

const finePrint = [
  "Founding Vendor benefits apply only to bookings completed on the EventHub platform, in line with our Terms of Service.",
  "The Founding Vendor deal is available only to vendors personally invited by EventHub. Vendors who join through a referral participate under standard terms, not Founding Vendor terms.",
  "The Founding rate requires an active account: a published listing and at least 5 bookings per month. Two consecutive inactive months returns your account to standard rates.",
  "The fee holiday is a single window per vendor and is not transferable.",
  "EventHub early adopter benefits will not be available to new accounts once the enrollment window or a market booking-volume target is reached.",
  "Rates and windows shown reflect the program at launch and apply to Founding Vendors enrolled during the offer period.",
];

export default function FoundingVendorProgram() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading, loginWithPopup, loginWithRedirect } = useAuth0();
  const [isClaiming, setIsClaiming] = useState(false);

  // Detect invite token before first render (URL param OR existing localStorage value)
  const [hasToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("fv")) || Boolean(localStorage.getItem(FOUNDING_TOKEN_STORAGE_KEY));
  });

  // Capture URL token to localStorage and strip from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fv = params.get("fv");
    if (fv) {
      localStorage.setItem(FOUNDING_TOKEN_STORAGE_KEY, fv.trim());
      params.delete("fv");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const { data: vendorAccount, isLoading: isVendorLoading } = useQuery<{
    isFoundingVendor?: boolean | null;
  }>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    staleTime: 0,
  });

  const isLoading = isAuthLoading || isVendorLoading;
  const isFoundingVendor = vendorAccount?.isFoundingVendor === true;

  // Redirect to / only if: authenticated, not a founding vendor, and no invite token
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && !isFoundingVendor && !hasToken) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, isFoundingVendor, hasToken, setLocation]);

  const handleClaim = async () => {
    if (isAuthenticated) {
      setLocation("/vendor/onboarding");
      return;
    }
    setIsClaiming(true);
    try {
      sessionStorage.setItem("eh:after-auth-intent", "vendor");
      const result = await loginWithPopupFirst({
        loginWithPopup,
        loginWithRedirect,
        popupOptions: { authorizationParams: { prompt: "login" } },
        redirectOptions: {
          appState: { returnTo: "/vendor/onboarding" },
          authorizationParams: { prompt: "login" },
        },
      });
      if (result === "popup") {
        setLocation("/vendor/onboarding");
      }
    } catch {
      sessionStorage.removeItem("eh:after-auth-intent");
    } finally {
      setIsClaiming(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  // Not in member mode or invite mode — useEffect will redirect
  if (!isFoundingVendor && !hasToken) return null;

  const isInviteMode = !isFoundingVendor;

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff]">
      <div className="print:hidden">
        <Navigation showBottomBorder={false} />
      </div>

      <main className={`flex-1${isInviteMode ? " pb-24" : ""}`}>
        {/* Hero */}
        <section
          className="border-b border-border/50 py-16 sm:py-24 text-center px-4 sm:px-6 lg:px-8"
          style={{ background: "#ffffff" }}
        >
          <div className="mx-auto max-w-2xl">
            <BrandWordmark
              className="text-3xl mb-7 justify-center"
              eventClassName="text-primary"
              hubClassName="text-[#C9A84C]"
            />
            <p className="font-sans text-xs font-medium uppercase tracking-[0.15em] text-[#9B7A1A] mb-5">
              FOUNDING OFFER · BY INVITATION
            </p>
            <h1 className="text-foreground mb-4">
              The Founding Vendor Program
            </h1>
            <div
              className="mx-auto mb-5 h-px w-16"
              style={{ background: "linear-gradient(90deg, transparent, #C9A84C, transparent)" }}
              aria-hidden="true"
            />
            <p className="font-sans text-base text-muted-foreground leading-relaxed mb-7 max-w-xl mx-auto">
              {isInviteMode
                ? "Join EventHub as a founding vendor and claim the best deal we will ever offer — built to put more bookings, and more of each booking, in your pocket."
                : "You're one of EventHub's original vendors. Here are the terms of the program you're a part of."}
            </p>
            <div className="inline-flex items-center gap-2.5 font-sans text-sm text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: "rgb(34 197 94)" }}
                aria-hidden="true"
              />
              By invitation only.
            </div>
          </div>
        </section>

        {/* Value props */}
        <section className="border-b border-border/50 py-14 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8 text-center sm:text-left">
            {valueProps.map((vp) => (
              <div key={vp.title}>
                <h3 className="text-foreground mb-2">{vp.title}</h3>
                <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                  {vp.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section className="border-b border-border/50 py-14 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-foreground mb-8">Your Benefits &amp; Their Terms</h2>
            <ol className="space-y-4" role="list">
              {benefits.map((b, i) => (
                <li
                  key={b.title}
                  className="flex gap-5 rounded-xl border border-border/60 bg-card p-5 shadow-2xs"
                >
                  <span
                    className="font-heading text-xl text-[#C9A84C] flex-shrink-0 w-7 leading-none pt-0.5 text-right select-none opacity-80"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-foreground mb-1.5">{b.title}</h4>
                    <p className="font-sans text-sm text-muted-foreground leading-relaxed mb-3">
                      {b.description}
                    </p>
                    <Badge variant="outline" className="text-xs font-normal whitespace-normal text-left h-auto py-1" style={{ borderColor: "rgba(201,168,76,0.45)" }}>
                      {b.tag}
                    </Badge>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Sunset */}
        <section className="border-b border-border/50 py-14 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-foreground mb-7">How the Program Sunsets</h2>
            <div className="space-y-5">
              <div className="flex gap-4">
                <Lock className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                  Enrollment is by invitation only and closes once all spots are claimed.
                </p>
              </div>
              <div className="flex gap-4">
                <Timer className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
                <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                  Each benefit has its own runway, set by bookings, by time, or by
                  your market reaching healthy booking volume.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Fine print */}
        <section className="border-b border-border/50 py-14 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-foreground mb-6">The Fine Print</h2>
            <ul className="space-y-3">
              {finePrint.map((item) => (
                <li key={item} className="flex gap-3">
                  <span
                    className="font-sans text-muted-foreground/50 flex-shrink-0 mt-px select-none"
                    aria-hidden="true"
                  >
                    &bull;
                  </span>
                  <p className="font-sans text-xs text-muted-foreground leading-relaxed">
                    {item}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <div className="print:hidden">
        <Footer />
      </div>

      {/* Sticky CTA bar — invite mode only */}
      {isInviteMode && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-border/60 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-4xl flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="hidden sm:block">
              <p className="font-sans text-sm font-semibold text-foreground">Ready to claim your spot?</p>
              <p className="font-sans text-xs text-muted-foreground">By invitation only · Limited spots available</p>
            </div>
            <button
              type="button"
              onClick={handleClaim}
              disabled={isClaiming}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-sans text-sm font-semibold text-[#1C1100] transition-opacity disabled:opacity-60"
              style={{ background: "#C9A84C", border: "1px solid #B0882C" }}
            >
              {isClaiming ? "Opening…" : "Claim your Founding spot →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
