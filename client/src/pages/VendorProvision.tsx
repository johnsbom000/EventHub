import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFreshAccessToken } from "@/lib/authToken";
import { apiRequest, notifyEmailUnverified } from "@/lib/queryClient";
import { phCapture } from "@/lib/posthog";
import { trackSignupCompletedOnce } from "@/lib/tracking";
import { readLandingVariant } from "@/hooks/useLandingVariant";
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

      const res = await fetch("/api/vendor/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ businessName: trimmed }),
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

      // Primary conversion event for the landing A/B/n experiment: a brand-new
      // vendor account was just created. Tagged with the sticky landing variant
      // so PostHog can attribute the conversion back to the arm the visitor saw.
      phCapture("vendor_provisioned", { variant: readLandingVariant() });
      // The vendor account was just created — this is the ad campaign's primary
      // conversion. Mirror it to PostHog (signup_completed) and the Meta Pixel
      // (CompleteRegistration) so the funnel and Meta both register the signup.
      // Once-per-session guard (in the helper) dedupes against the App.tsx
      // post-login path; `user.email` rides only to the server-side CAPI copy.
      trackSignupCompletedOnce(
        { role: "vendor", variant: readLandingVariant() },
        user?.email,
      );

      // Read the "Try Pro" cohort flags BEFORE invalidating /api/vendor/me: that
      // refetch flips hasVendorAccount to true and fires the early-redirect
      // effect, which would otherwise clear these flags before we get here.
      const proTrialIntent = sessionStorage.getItem("eh:pro-trial-intent");
      const proTrialInterval =
        sessionStorage.getItem("eh:pro-trial-interval") === "annual" ? "annual" : "monthly";
      sessionStorage.removeItem("eh:pro-trial-intent");
      sessionStorage.removeItem("eh:pro-trial-interval");

      await qc.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      await qc.invalidateQueries({ queryKey: ["/api/customer/me"] });

      // "Try Pro" cohort: now that the vendor account exists, hand off to Stripe
      // Checkout to collect a card and start the 30-day trial. Stripe returns to
      // /vendor/dashboard (timezone modal + tour fire there) on both success and
      // cancel; cancelling simply leaves them on the default freemium plan. Any
      // failure falls through to the dashboard so onboarding is never blocked.
      if (proTrialIntent) {
        try {
          const checkoutRes = await fetch("/api/vendor/billing/checkout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ interval: proTrialInterval }),
          });
          const checkoutJson = await checkoutRes.json().catch(() => ({} as any));
          if (checkoutRes.ok && checkoutJson?.url) {
            window.location.href = checkoutJson.url;
            return;
          }
        } catch {
          // fall through to the dashboard below
        }
      }

      // A freshly provisioned vendor has never seen the tour — send them to the
      // dashboard so the timezone modal + onboarding tour fire.
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
