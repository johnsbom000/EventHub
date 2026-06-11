import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFreshAccessToken } from "@/lib/authToken";
import { apiRequest, notifyEmailUnverified } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type VendorMeState } from "@/lib/vendorState";

const FOUNDING_TOKEN_KEY = "eventhub:founding-invite-token";
const MARQUEE_TOKEN_KEY = "eventhub:marquee-invite-token";

type TokenState = "checking" | "valid" | "invalid" | "none";

export default function VendorProvision() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [businessName, setBusinessName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const foundingToken = typeof window !== "undefined" ? localStorage.getItem(FOUNDING_TOKEN_KEY) : null;
  const marqueeToken  = typeof window !== "undefined" ? localStorage.getItem(MARQUEE_TOKEN_KEY)  : null;
  const activeToken   = marqueeToken || foundingToken;
  const activeType    = marqueeToken ? "marquee" : foundingToken ? "founding" : null;

  const [tokenState, setTokenState] = useState<TokenState>(activeToken ? "checking" : "none");

  useEffect(() => {
    if (!activeToken || !activeType) return;
    fetch(`/api/invite/validate?token=${encodeURIComponent(activeToken)}&type=${activeType}`)
      .then((r) => r.json())
      .then((data: { valid: boolean }) => setTokenState(data.valid ? "valid" : "invalid"))
      .catch(() => setTokenState("invalid"));
  }, []);

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
    if (vendorMe?.hasVendorAccount) {
      setLocation("/vendor/my-hub");
    }
  }, [isAuthLoading, isAuthenticated, isVendorLoading, vendorMe, setLocation]);

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

      await qc.invalidateQueries({ queryKey: ["/api/vendor/me"] });
      await qc.invalidateQueries({ queryKey: ["/api/customer/me"] });

      setLocation("/vendor/my-hub");
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

  if (isAuthLoading || isVendorLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf8f5] px-4">
      <div className="w-full max-w-md">
        {/* Invite badge — shows validity once the server confirms the token */}
        {tokenState === "checking" && (
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-sm font-medium text-stone-500">
              Checking invite…
            </span>
          </div>
        )}
        {tokenState === "valid" && (
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              ★ {activeType === "marquee" ? "Marquee" : "Founding"} Vendor invite active
            </span>
          </div>
        )}
        {tokenState === "invalid" && (
          <div className="mb-6 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
              ⚠ Invite link is inactive or expired
            </span>
          </div>
        )}

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
