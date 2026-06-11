import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFreshAccessToken } from "@/lib/authToken";
import { setGlobalEmailUnverifiedCallback } from "@/lib/queryClient";

// Poll conservatively and also re-check when the tab regains focus (the user
// returning after verifying in their inbox / on their phone).
const POLL_INTERVAL_MS = 15_000;
const RESEND_COOLDOWN_MS = 60_000;

/**
 * Full-app recovery screen for sessions whose Auth0 email is unverified.
 *
 * The server rejects every protected request from an unverified identity with
 * 403 email_not_verified (account-takeover protection). The queryClient fires
 * the global callback on the first such response and this component swaps the
 * entire route tree for instructions.
 *
 * Verification is detected automatically: /userinfo reflects the user's LIVE
 * profile (unlike token claims, which are frozen at issuance), so we poll it
 * until email_verified flips to true, then force-mint a fresh token and reload.
 */
export default function EmailVerificationGate({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth0();
  const [blocked, setBlocked] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "unavailable" | "failed">("idle");
  const lastResendAtRef = useRef(0);
  const checkingRef = useRef(false);

  useEffect(() => {
    setGlobalEmailUnverifiedCallback(() => setBlocked(true));
    return () => setGlobalEmailUnverifiedCallback(null);
  }, []);

  useEffect(() => {
    if (!blocked) return;

    let cancelled = false;

    const checkVerified = async () => {
      if (checkingRef.current || cancelled) return;
      checkingRef.current = true;
      try {
        // Mint a FRESH token (email_verified is frozen in the token at issuance,
        // so the cached one still says false) and ask the SERVER directly. We
        // only reload when the server actually accepts the request — that
        // guarantees the reloaded app won't immediately 403 again, which is what
        // caused the reload loop when we keyed off Auth0's /userinfo instead.
        const token = await getFreshAccessToken({ forceRefresh: true });
        if (!token || cancelled) return;
        const res = await fetch("/api/customer/me", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (cancelled || !res.ok) return;

        setContinuing(true);
        window.location.reload();
      } catch {
        // Network hiccup — next poll retries.
      } finally {
        checkingRef.current = false;
      }
    };

    void checkVerified();
    const interval = window.setInterval(() => void checkVerified(), POLL_INTERVAL_MS);
    const onFocus = () => void checkVerified();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [blocked]);

  if (!blocked) return <>{children}</>;

  const handleResend = async () => {
    const now = Date.now();
    if (now - lastResendAtRef.current < RESEND_COOLDOWN_MS) return;
    lastResendAtRef.current = now;
    setResendState("sending");
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error("no_token");
      const res = await fetch("/api/auth/resend-verification-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        setResendState("sent");
        return;
      }
      setResendState(res.status === 503 ? "unavailable" : "failed");
    } catch {
      setResendState("failed");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf8f5] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#e8e0d0] bg-white p-8 shadow-sm">
        <h1 className="font-playfair text-2xl font-semibold text-[#16222D] mb-2">
          Verify your email
        </h1>
        <p className="text-sm text-muted-foreground mb-1">
          We sent a verification link to{" "}
          <span className="font-medium text-[#16222D]">{user?.email || "your inbox"}</span>.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Click the link in that email (check spam too) — this page will continue
          automatically once you're verified.
        </p>

        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {continuing ? "Verified! Taking you in…" : "Waiting for verification…"}
        </div>
        <p className="mb-6 text-xs text-muted-foreground">
          Already verified and still stuck?{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline hover:text-[#16222D]"
          >
            Refresh this page
          </button>
          .
        </p>

        {resendState === "sent" && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            Verification email re-sent. It can take a few minutes to arrive.
          </div>
        )}
        {(resendState === "unavailable" || resendState === "failed") && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            We couldn't re-send the email automatically. Check your spam folder, or
            contact <a className="underline" href="mailto:support@eventhubglobal.com">support@eventhubglobal.com</a>.
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleResend}
            disabled={resendState === "sending" || resendState === "sent"}
            variant="outline"
            className="w-full h-11 text-base"
          >
            {resendState === "sending" ? "Sending…" : "I didn't receive an email — resend"}
          </Button>
          <Button
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            variant="ghost"
            className="w-full h-11 text-base text-muted-foreground"
          >
            Log out / use a different account
          </Button>
        </div>
      </div>
    </div>
  );
}
