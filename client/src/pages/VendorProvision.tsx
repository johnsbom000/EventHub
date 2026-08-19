import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFreshAccessToken } from "@/lib/authToken";
import { apiRequest, notifyEmailUnverified } from "@/lib/queryClient";
import { phCapture } from "@/lib/posthog";
import { trackSignupCompletedOnce } from "@/lib/tracking";
import { resolvePricingModelForWrite } from "@/hooks/usePricingModel";
import { readAttribution, clearAttribution } from "@/lib/landingAttribution";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type VendorMeState } from "@/lib/vendorState";

export default function VendorProvision() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth0();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [businessName, setBusinessName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Create the users row immediately on landing so the account exists in Neon
  // even if the user closes the tab before submitting the business name form.
  useQuery({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    staleTime: Infinity,
  });

  // If they already have a vendor account, skip straight to my-hub.
  const { data: vendorMe, isLoading: isVendorLoading } = useQuery<VendorMeState>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (isAuthLoading || isVendorLoading) return;
    if (!isAuthenticated) {
      setLocation("/");
      return;
    }
    // Don't hijack the navigation while a provision submit is in flight — that
    // handler invalidates /api/vendor/me (flipping hasVendorAccount to true) and
    // owns the post-provision redirect itself (which may hand off to Stripe
    // checkout for the "Try Pro" cohort).
    if (isSubmitting) return;
    if (vendorMe?.hasVendorAccount) {
      // Returning vendor who already has an account: drop any pending pro-trial
      // intent so it can't fire on a later provision. They upgrade via the
      // in-dashboard Pro CTA instead — this flow targets brand-new signups.
      sessionStorage.removeItem("eh:pro-trial-intent");
      sessionStorage.removeItem("eh:pro-trial-interval");
      // Un-toured vendors land on the dashboard so the onboarding tour can fire;
      // vendors who've already seen it keep going to My Hub.
      const tourCompleted = Boolean(vendorMe?.dashboardTourCompletedAt);
      setLocation(tourCompleted ? "/vendor/my-hub" : "/vendor/dashboard");
    }
  }, [isAuthLoading, isAuthenticated, isVendorLoading, isSubmitting, vendorMe, setLocation]);

  useEffect(() => {
    if (!isAuthLoading && !isVendorLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAuthLoading, isVendorLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = businessName.trim();
    if (trimmed.length < 2) {
      setNameError("Please enter at least 2 characters.");
      return;
    }
    setNameError(null);
    setIsSubmitting(true);

    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error("auth_required");

      const attribution = readAttribution();

      // Wait for PostHog flags before stamping the immutable pricing_model
      // column. readPricingModel() alone returns "subscription" for a real
      // assignment, an unresolved flag, AND a failed /decide — indistinguishable,
      // and unrecoverable because the column is never mutated. Times out quickly
      // so a PostHog outage degrades to the safe default rather than blocking signup.
      const { model: pricingModel, resolved: pricingModelResolved } =
        await resolvePricingModelForWrite();

      const res = await fetch("/api/vendor/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessName: trimmed,
          // Read live (and flag-gated above), not from the first-touch
          // sessionStorage record: on paid traffic's first visit the PostHog
          // /decide round trip is very likely still in flight, so a value
          // captured at landing would be the "subscription" pre-resolution
          // placeholder, frozen forever by first-touch.
          pricingModel,
          landingStyle: attribution?.landingStyle,
          utmSource: attribution?.utmSource,
          utmMedium: attribution?.utmMedium,
          utmCampaign: attribution?.utmCampaign,
          utmContent: attribution?.utmContent,
          fbclid: attribution?.fbclid,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any));
        if (res.status === 403 && err?.error === "email_not_verified") {
          // Hand off to the EmailVerificationGate, which auto-detects
          // verification and reloads back to this page.
          notifyEmailUnverified();
          return;
        }
        if (res.status === 409 && err?.code === "business_name_taken") {
          setNameError("A vendor with this name already exists. Try a different name.");
          return;
        }
        throw new Error(err?.error || "Failed to create vendor account");
      }

      // Reverse-trial experiment: the server auto-enrolls every new vendor in a
      // card-free 30-day Pro trial at provision (no client hand-off needed).
      const provisionData = await res.json().catch(() => ({} as any));
      const reverseTrial: boolean = Boolean(provisionData?.reverseTrial);

      // Primary conversion event for the landing test: a brand-new vendor account
      // was just created. Tagged with the first-touch landing style so PostHog can
      // attribute the conversion back to the page the visitor actually landed on.
      // pricing_model_resolved=false means the flag never loaded and this vendor
      // was stamped with the safe default — filter those out when analysing the
      // pricing experiment, they are not a real assignment.
      const landingStyle = attribution?.landingStyle ?? null;
      phCapture("vendor_provisioned", {
        landing_style: landingStyle,
        pricing_model_resolved: pricingModelResolved,
      });
      // Reverse-trial cohort marker (server also logs reverse_trial_started to
      // event_log). Captured here with the landing style for PostHog attribution.
      if (reverseTrial) {
        phCapture("reverse_trial_started", { landing_style: landingStyle });
      }
      // The vendor account was just created — this is the ad campaign's primary
      // conversion. Mirror it to PostHog (signup_completed) and the Meta Pixel
      // (CompleteRegistration) so the funnel and Meta both register the signup.
      // Once-per-session guard (in the helper) dedupes against the App.tsx
      // post-login path; `user.email` rides only to the server-side CAPI copy.
      // `alreadyExisted` is the server's own answer to "did this request create
      // the account?" — provision is reachable by an EXISTING vendor (it returns
      // early with alreadyExisted: true), so authentication alone is not proof of
      // a signup. Absent field is treated as not-new: better to undercount a
      // conversion than to teach Meta that logins are registrations.
      trackSignupCompletedOnce({
        isNewAccount: provisionData?.alreadyExisted === false,
        props: { role: "vendor", landing_style: landingStyle },
        email: user?.email,
      });

      // Clear any stale "Try Pro" flags from an older landing flow — enrollment now
      // happens server-side at provision, so there is no client-side trial hand-off.
      sessionStorage.removeItem("eh:pro-trial-intent");
      sessionStorage.removeItem("eh:pro-trial-interval");
      sessionStorage.removeItem("eh:pro-trial-mode");
      // Only clear attribution once the provision request has actually
      // succeeded — clearing it on failure would lose the attribution on retry.
      clearAttribution();

      await qc.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      await qc.invalidateQueries({ queryKey: ["/api/customer/me"] });

      // A freshly provisioned vendor has never seen the tour — send them to the
      // dashboard so the timezone modal + onboarding tour fire. They arrive already
      // on Pro (trialing) from the server-side reverse-trial enrollment.
      setLocation("/vendor/dashboard");
    } catch (err: any) {
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only ever render the business-name form for an authenticated user who does
  // NOT yet have a vendor account — the one legitimate case. Everyone else (still
  // loading, unauthenticated, or already a vendor) gets the loader while the
  // redirect effect above runs, so an established vendor never even flashes the
  // form. The isSubmitting exception keeps the form up during a provision submit,
  // when the handler itself flips hasVendorAccount and owns the redirect.
  if (
    isAuthLoading ||
    isVendorLoading ||
    (!isSubmitting && (!isAuthenticated || vendorMe?.hasVendorAccount))
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf8f5] px-4">
      <div className="w-full max-w-md">

        <div className="rounded-2xl border border-[#e8e0d0] bg-white p-8 shadow-sm">
          <h1 className="font-playfair text-2xl font-semibold text-[#16222D] mb-1">
            What's your business called?
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            You can update this anytime.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                ref={inputRef}
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="e.g. Petal & Bloom Events"
                className="h-11 text-base"
                disabled={isSubmitting}
                maxLength={120}
              />
              {nameError && (
                <p className="mt-1.5 text-sm text-destructive">{nameError}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold bg-[#16222D] hover:bg-[#243341] text-white"
              disabled={isSubmitting || businessName.trim().length < 2}
            >
              {isSubmitting ? "Creating your account…" : "Get started →"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          You'll complete your full vendor profile before publishing listings.
        </p>
      </div>
    </div>
  );
}
