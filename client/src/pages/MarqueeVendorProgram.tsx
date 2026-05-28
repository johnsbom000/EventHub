import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Timer } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import BrandWordmark from "@/components/BrandWordmark";
import { Badge } from "@/components/ui/badge";

const valueProps = [
  {
    title: "Keep more",
    description: "A fee holiday to start, then a rate that stays below standard.",
  },
  {
    title: "Book more",
    description: "Top placement and a marketing spotlight while you grow.",
  },
  {
    title: "Belong",
    description: "A seat in the Insider Circle, with first access to everything new.",
  },
];

const benefits = [
  {
    title: "Fee Holiday: 0% platform fee",
    description:
      "Keep 100% of your earliest bookings. No platform commission while the holiday is active.",
    tag: "Ends at 20 bookings or 30 days, whichever comes last",
  },
  {
    title: "The Marquee Rate: 6% instead of 8%",
    description:
      "After the holiday, your platform fee settles at just 6% for 24 months. After 24 months, your fee returns to the normal platform rate.",
    tag: "Lasts 24 months, then returns to standard",
  },
  {
    title: "Lower Fees for Your Customers: 2.5% vs 5%",
    description:
      'Your listings carry a "Lower Fees" badge, so you are the better deal when couples compare.',
    tag: "Runs your first 12 months, then returns to standard",
  },
  {
    title: "Launch Visibility: top placement + spotlight",
    description:
      "Guaranteed top placement in your area's search, plus a feature to our email list and socials.",
    tag: "Runs your first 12 months, then converts to merit placement, giving you a head start",
  },
  {
    title: "White-Glove Onboarding",
    description:
      "We offer to build your first listing and sync your calendar with you. Setup takes about 10 minutes.",
    tag: "One-time · on the house",
  },
  {
    title: "Insider Circle",
    description: "Early access to features and a say in the roadmap.",
    tag: "While active, in accordance with EventHub's other terms of use",
  },
  {
    title: "Refer a Vendor, Earn Free Bookings",
    description:
      "For every vendor you refer who publishes a listing, earn 5 additional bookings at half the normal fee.",
    tag: "Available during the enrollment window only",
  },
];

const finePrint = [
  "Marquee benefits apply only to bookings completed on the EventHub platform, in line with our Terms of Service.",
  "The Marquee deal is available only to vendors personally invited by EventHub, up to 20 total. Vendors who join through a referral participate under standard terms, not Marquee terms.",
  "The Marquee rate requires an active account: a published listing and at least 5 bookings per month. Two consecutive inactive months returns your account to standard rates.",
  "The fee holiday is a single window per vendor and is not transferable.",
  "EventHub early adopter benefits will not be available to new accounts once the 20-vendor cap or a market booking-volume target is reached.",
  "Rates and windows shown reflect the program at launch and apply to Marquee vendors enrolled during the offer period.",
];

export default function MarqueeVendorProgram() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();

  const { data: vendorAccount, isLoading: isVendorLoading, isError } = useQuery<{
    isMarqueeVendor?: boolean | null;
  }>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    staleTime: 0,
  });

  const isLoading = isAuthLoading || isVendorLoading;
  const isMarqueeVendor = vendorAccount?.isMarqueeVendor === true;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || isError || !isMarqueeVendor) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, isError, isMarqueeVendor, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (!isMarqueeVendor) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff]">
      <div className="print:hidden">
        <Navigation showBottomBorder={false} />
      </div>

      <main className="flex-1">
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
              LAUNCH OFFER · BY INVITATION
            </p>
            <h1 className="text-foreground mb-4">
              The Marquee Vendor Program
            </h1>
            <div
              className="mx-auto mb-5 h-px w-16"
              style={{ background: "linear-gradient(90deg, transparent, #C9A84C, transparent)" }}
              aria-hidden="true"
            />
            <p className="font-sans text-base text-muted-foreground leading-relaxed mb-7 max-w-xl mx-auto">
              You helped shape EventHub. Now claim the best deal we will ever
              offer, built to put more bookings, and more of each booking, in
              your pocket.
            </p>
            <div className="inline-flex items-center gap-2.5 font-sans text-sm text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: "rgb(34 197 94)" }}
                aria-hidden="true"
              />
              By invitation only. Reserved for the first 20 vendors we invite.
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
                  Enrollment is by invitation only and closes once all 20 invited
                  spots are claimed.
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
    </div>
  );
}
