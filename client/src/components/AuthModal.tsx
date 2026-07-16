import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import BrandWordmark from "@/components/BrandWordmark";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "login" | "signup";
  returnTo?: string;
}

function getSafeReturnTo(rawReturnTo: string | undefined, fallback: string): string {
  const candidate = typeof rawReturnTo === "string" ? rawReturnTo.trim() : "";
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/vendor/login")) {
    return fallback;
  }
  return candidate;
}

export default function AuthModal({
  open,
  onOpenChange,
  defaultTab = "login",
  returnTo,
}: AuthModalProps) {
  const { toast } = useToast();
  const { loginWithRedirect } = useAuth0();

  const [activeTab, setActiveTab] = useState<"login" | "signup">(defaultTab === "signup" ? "signup" : "login");
  // Signup tab forces an explicit account-type choice before continuing, so a
  // vendor who reaches signup via "Log in" can't silently create a customer
  // account. null = nothing picked yet (buttons disabled on the signup tab).
  const [signupRole, setSignupRole] = useState<"vendor" | "customer" | null>(null);

  const normalizedDefaultTab = defaultTab === "signup" ? "signup" : "login";

  useEffect(() => {
    if (open) {
      setActiveTab(normalizedDefaultTab);
      setSignupRole(null);
    }
  }, [open, normalizedDefaultTab]);

  // We keep an email field ONLY to prefill Auth0 (login_hint).
  const [email, setEmail] = useState("");

  // Optional: keep name field for your own UX, but Auth0 won't use it unless you later add custom claims / Actions.
  const [signupName, setSignupName] = useState("");

  const safeLoginHint = email?.trim() ? email.trim() : undefined;

  const startLogin = async (opts: Parameters<typeof loginWithRedirect>[0]) => {
    const fallbackReturnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const resolvedReturnTo = getSafeReturnTo(returnTo, fallbackReturnTo);
    // Route root sign-ins through /post-login so vendor/customer redirect
    // happens in a freshly-mounted component after the Auth0 callback fires.
    let finalReturnTo = resolvedReturnTo === "/" ? "/post-login" : resolvedReturnTo;

    // Signup tab: honor the explicit account-type choice. Vendor signups carry
    // the vendor-intent flag and land on /vendor/provision (→ vendor account);
    // customer signups clear the flag and fall through to /post-login (→ /dashboard).
    if (activeTab === "signup") {
      if (signupRole === "vendor") {
        sessionStorage.setItem("eh:after-auth-intent", "vendor");
        finalReturnTo = "/vendor/provision";
      } else {
        sessionStorage.removeItem("eh:after-auth-intent");
      }
    }
    const normalizedPrompt = (opts?.authorizationParams?.prompt ?? "login") as
      | "login"
      | "none"
      | "consent"
      | "select_account";
    const normalizedAuthorizationParams = {
      ...(opts?.authorizationParams || {}),
      prompt: normalizedPrompt,
    };
    const redirectOptions = {
      ...opts,
      authorizationParams: normalizedAuthorizationParams,
      appState: {
        ...(opts?.appState || {}),
        returnTo: finalReturnTo,
      },
    };

    try {
      // Close the modal immediately so the UI feels responsive.
      onOpenChange(false);
      await loginWithRedirect(redirectOptions);
    } catch (err: any) {
      // Re-open modal so user can try again
      onOpenChange(true);
      toast({
        title: "Login failed",
        description: err?.message || "Something went wrong starting the login flow.",
        variant: "destructive",
      });
    }
  };

  const continueWithGoogle = async () => {
    await startLogin({
      authorizationParams: {
        connection: "google-oauth2",
        prompt: "select_account",
        login_hint: safeLoginHint,
      },
    });
  };

  const continueWithEmail = async () => {
    await startLogin({
      authorizationParams: {
        // Auth0 will show the email/password login page.
        // For signup tab, we hint Auth0 to show signup first.
        screen_hint: activeTab === "signup" ? "signup" : undefined,
        login_hint: safeLoginHint,
      },
    });
  };

  const [isSendingReset, setIsSendingReset] = useState(false);

  // Trigger Auth0's password-reset email via the public Authentication API
  // change_password endpoint. This actually resets the password, unlike the
  // previous behavior (which just restarted a normal login).
  const handleForgotPassword = async () => {
    const targetEmail = email?.trim();
    if (!targetEmail) {
      toast({
        title: "Enter your email first",
        description:
          "Type the email for your account in the field above, then click “Forgot password?” again.",
        variant: "destructive",
      });
      return;
    }

    const domain = String(import.meta.env.VITE_AUTH0_DOMAIN || "").trim();
    const clientId = String(import.meta.env.VITE_AUTH0_CLIENT_ID || "").trim();
    const connection = String(
      import.meta.env.VITE_AUTH0_DB_CONNECTION || "Username-Password-Authentication"
    ).trim();

    if (!domain || !clientId) {
      toast({
        title: "Password reset unavailable",
        description: "Authentication isn’t configured. Please contact support.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingReset(true);
    try {
      const res = await fetch(`https://${domain}/dbconnections/change_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, email: targetEmail, connection }),
      });
      if (!res.ok) {
        throw new Error((await res.text().catch(() => "")) || "reset_failed");
      }
      // Neutral copy — never reveal whether an account exists for the email.
      toast({
        title: "Check your email",
        description:
          "If an account exists for that email, a password reset link is on its way.",
      });
    } catch (err: any) {
      toast({
        title: "Couldn’t send reset email",
        description:
          typeof err?.message === "string" && err.message !== "reset_failed"
            ? err.message.slice(0, 200)
            : "Something went wrong. Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const isLogin = activeTab === "login";
  const primaryButtonLabel = isLogin ? "Log in" : "Create account";
  // On the signup tab, block the auth buttons until an account type is chosen.
  const signupNeedsRole = !isLogin && signupRole === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Keep Safari from auto-focusing email and opening saved-email suggestions on modal open.
          event.preventDefault();
        }}
        className="max-h-[96vh] overflow-y-auto border-[2px] border-[rgba(74,106,125,0.35)] bg-background p-0 shadow-xl sm:max-w-[420px] sm:rounded-[16px] [&>button]:right-4 [&>button]:top-4 [&>button]:h-7 [&>button]:w-7 [&>button]:rounded-full [&>button]:opacity-100 [&>button]:text-[#6e7590] [&>button]:ring-0 [&>button]:ring-offset-0 [&>button]:hover:bg-transparent [&>button]:hover:text-[#4a6a7d]"
      >
        <div className="px-7 pb-7 pt-8">
          {/* Header */}
          <DialogHeader className="mb-6 space-y-1.5 text-left">
            <DialogTitle className="sr-only">Authentication</DialogTitle>
            <BrandWordmark
              className="text-[2.4rem] leading-none"
              eventClassName="text-[#e07a6a] font-normal"
              hubClassName="text-[#4a6a7d] font-normal"
            />
            <DialogDescription className="font-sans text-[1.35rem] text-[#6e7590]">
              {isLogin ? "Welcome back" : "Create your account"}
            </DialogDescription>
          </DialogHeader>

          {/* Segmented tab control */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="mb-6 flex h-11 rounded-[12px] bg-[rgba(74,106,125,0.1)] p-1"
          >
            <button
              role="tab"
              type="button"
              aria-selected={isLogin}
              onClick={() => setActiveTab("login")}
              className={`flex-1 rounded-[9px] font-sans text-[1.4rem] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4a6a7d]/40 ${
                isLogin
                  ? "bg-[hsl(var(--card))] text-[#20243d] shadow-[0_2px_8px_rgba(74,106,125,0.18)]"
                  : "text-[#6f7690] hover:text-[#20243d]"
              }`}
            >
              Log in
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={!isLogin}
              onClick={() => setActiveTab("signup")}
              className={`flex-1 rounded-[9px] font-sans text-[1.4rem] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4a6a7d]/40 ${
                !isLogin
                  ? "bg-[hsl(var(--card))] text-[#20243d] shadow-[0_2px_8px_rgba(74,106,125,0.18)]"
                  : "text-[#6f7690] hover:text-[#20243d]"
              }`}
            >
              Sign up
            </button>
          </div>

          {/* Account-type choice — signup only, required before continuing */}
          {!isLogin && (
            <div className="mb-5">
              <p className="mb-2 font-sans text-[1.3rem] font-semibold text-[#20243d]">I'm signing up as…</p>
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Account type">
                {([
                  { value: "vendor", title: "A vendor", sub: "List & get booked" },
                  { value: "customer", title: "A customer", sub: "Book vendors" },
                ] as const).map((opt) => {
                  const selected = signupRole === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSignupRole(opt.value)}
                      className={`rounded-[12px] border-[2px] px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "border-[#4a6a7d] bg-[rgba(74,106,125,0.06)]"
                          : "border-[rgba(74,106,125,0.22)] bg-[hsl(var(--card))] hover:border-[rgba(74,106,125,0.4)]"
                      }`}
                    >
                      <span className="block font-sans text-[1.3rem] font-semibold text-[#20243d]">{opt.title}</span>
                      <span className="block font-sans text-[1.05rem] text-[#6e7590]">{opt.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Google button — secondary, outlined */}
          <Button
            type="button"
            variant="outline"
            disabled={signupNeedsRole}
            className="h-11 w-full justify-center gap-2.5 rounded-[12px] border-[2px] border-[rgba(74,106,125,0.25)] bg-[hsl(var(--card))] font-sans text-[1.4rem] font-medium text-[#20243d] hover:bg-[rgba(74,106,125,0.04)] hover:border-[rgba(74,106,125,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={continueWithGoogle}
          >
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 items-center justify-center font-sans text-[1.25rem] font-bold leading-none text-[#4285F4]"
            >
              G
            </span>
            Continue with Google
          </Button>

          {/* "or" divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[rgba(74,106,125,0.2)]" />
            <span className="font-sans text-[1.2rem] font-medium text-[#7c8095]">or</span>
            <div className="h-px flex-1 bg-[rgba(74,106,125,0.2)]" />
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            {!isLogin && (
              <div className="space-y-1.5">
                <Label htmlFor="auth-full-name" className="font-sans text-[1.3rem] font-semibold text-[#20243d]">
                  Full name
                </Label>
                <Input
                  id="auth-full-name"
                  type="text"
                  placeholder="Jane Smith"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  className="h-11 rounded-[10px] border-[1.5px] border-[rgba(74,106,125,0.22)] bg-[hsl(var(--card))] px-3.5 font-sans text-[1.35rem] text-foreground placeholder:text-[#b0aaa4] focus-visible:ring-2 focus-visible:ring-[#4a6a7d]/30"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="auth-email" className="font-sans text-[1.3rem] font-semibold text-[#20243d]">
                Email
              </Label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-[10px] border-[1.5px] border-[rgba(74,106,125,0.22)] bg-[hsl(var(--card))] px-3.5 font-sans text-[1.35rem] text-foreground placeholder:text-[#b0aaa4] focus-visible:ring-2 focus-visible:ring-[#4a6a7d]/30"
              />
            </div>

            {isLogin && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-h-0 p-0 font-sans text-[1.25rem] font-medium text-[#3f5f8a] hover:bg-transparent hover:text-[#2f4f78] hover:underline"
                  onClick={handleForgotPassword}
                  disabled={isSendingReset}
                >
                  {isSendingReset ? "Sending…" : "Forgot password?"}
                </Button>
              </div>
            )}

            {/* Primary submit — dominant element */}
            <Button
              type="button"
              disabled={signupNeedsRole}
              className="h-11 w-full rounded-[12px] border border-primary-border font-sans text-[1.55rem] font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={continueWithEmail}
            >
              {primaryButtonLabel}
            </Button>
          </div>

          {/* Mode-toggle text link */}
          <p className="mt-5 text-center font-sans text-[1.25rem] text-[#6e7590]">
            {isLogin ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("signup")}
                  className="font-semibold text-[#3f5f8a] hover:text-[#2f4f78] hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("login")}
                  className="font-semibold text-[#3f5f8a] hover:text-[#2f4f78] hover:underline focus-visible:outline-none focus-visible:underline"
                >
                  Log in
                </button>
              </>
            )}
          </p>

          {/* Legal */}
          <p className="mt-3 text-center font-sans text-[1.1rem] leading-[1.4] text-[#9aacb4]">
            By continuing, you agree to our{" "}
            <a href="/terms" className="underline underline-offset-2 hover:text-[#4a6a7d]">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-[#4a6a7d]">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
