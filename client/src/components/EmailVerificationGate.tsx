import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";
import { getFreshAccessToken } from "@/lib/authToken";
import { setGlobalEmailUnverifiedCallback } from "@/lib/queryClient";

/**
 * Full-app recovery screen for sessions whose Auth0 email is unverified.
 *
 * The server rejects every protected request from an unverified identity with
 * 403 email_not_verified (account-takeover protection). Without this gate, such
 * a session sees a broken app with no logout button and no way forward — the
 * queryClient fires the global callback on the first such response, and this
 * component swaps the entire route tree for clear instructions.
 *
 * "I've verified" force-mints a fresh Auth0 token (email_verified is baked into
 * the token at issuance, so the cached one keeps saying false) and probes the
 * API before reloading into the normal app.
 */
export default function EmailVerificationGate({ children }: { children: React.ReactNode }) {
  const { logout, user } = useAuth0();
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillUnverified, setStillUnverified] = useState(false);

  useEffect(() => {
    setGlobalEmailUnverifiedCallback(() => setBlocked(true));
    return () => setGlobalEmailUnverifiedCallback(null);
  }, []);

  if (!blocked) return <>{children}</>;

  const handleContinue = async () => {
    setChecking(true);
    setStillUnverified(false);
    try {
      const token = await getFreshAccessToken({ forceRefresh: true });
      if (!token) throw new Error("no_token");
      const res = await fetch("/api/customer/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        // Fresh token is verified — reload so the whole app restarts clean.
        window.location.reload();
        return;
      }
      setStillUnverified(true);
    } catch {
      setStillUnverified(true);
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = () => {
    logout({ logoutParams: { returnTo: window.location.origin } });
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
          Click the link in that email (check spam too), then come back and continue.
        </p>

        {stillUnverified && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Your email still shows as unverified. Make sure you clicked the link in the
            verification email, then try again.
          </div>
        )}

        <div className="space-y-3">
          <Button
            onClick={handleContinue}
            disabled={checking}
            className="w-full h-11 text-base font-semibold bg-[#16222D] hover:bg-[#243341] text-white"
          >
            {checking ? "Checking…" : "I've verified my email — continue →"}
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full h-11 text-base"
          >
            Log out / use a different account
          </Button>
        </div>
      </div>
    </div>
  );
}
