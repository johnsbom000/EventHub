import { useAuth0 } from "@auth0/auth0-react";
import { useState } from "react";
import { Facebook } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import BrandWordmark from "@/components/BrandWordmark";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { toast } = useToast();
  const { loginWithRedirect } = useAuth0();

  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");

  // We keep an email field ONLY to prefill Auth0 (login_hint).
  const [email, setEmail] = useState("");

  // Optional: keep name field for your own UX, but Auth0 won’t use it unless you later add custom claims / Actions.
  const [signupName, setSignupName] = useState("");

  const safeLoginHint = email?.trim() ? email.trim() : undefined;

  const startLogin = async (opts: Parameters<typeof loginWithRedirect>[0]) => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
        returnTo,
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

  const continueWithFacebook = async () => {
    await startLogin({
      authorizationParams: {
        connection: "facebook",
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

  const isLogin = activeTab === "login";
  const primaryButtonLabel = isLogin ? "Continue with email" : "Create account";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96vh] overflow-y-auto border-[2px] border-[rgba(74,106,125,0.35)] bg-background p-0 shadow-xl sm:max-w-[560px] sm:rounded-[16px] [&>button]:right-5 [&>button]:top-5 [&>button]:h-7 [&>button]:w-7 [&>button]:rounded-full [&>button]:opacity-100 [&>button]:text-[#6e7590] [&>button]:ring-0 [&>button]:ring-offset-0 [&>button]:hover:bg-transparent [&>button]:hover:text-[#4a6a7d]">
        <div className="px-5 pb-4 pt-7 sm:px-7 sm:pb-5 sm:pt-8">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="sr-only">Authentication</DialogTitle>
            <BrandWordmark
              className="text-[2.7rem] leading-none"
              eventClassName="text-[#e07a6a] font-normal"
              hubClassName="text-[#4a6a7d] font-normal"
            />
            <DialogDescription className="font-sans text-[1.5rem] text-[#6e7590]">
              Continue with Google, Facebook, or email.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value === "signup" ? "signup" : "login")} className="mt-6">
            <TabsList className="grid h-12 w-full grid-cols-2 rounded-[14px] bg-[rgba(74,106,125,0.12)] p-1">
              <TabsTrigger
                value="login"
                className="h-full rounded-[11px] font-sans text-[1.55rem] font-semibold text-[#6f7690] shadow-none data-[state=active]:bg-[hsl(var(--card))] data-[state=active]:text-[#20243d] data-[state=active]:shadow-[0_4px_10px_rgba(74,106,125,0.16)]"
              >
                Login
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="h-full rounded-[11px] font-sans text-[1.55rem] font-semibold text-[#6f7690] shadow-none data-[state=active]:bg-[hsl(var(--card))] data-[state=active]:text-[#20243d] data-[state=active]:shadow-[0_4px_10px_rgba(74,106,125,0.16)]"
              >
                Create account
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-7 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="auth-email" className="font-sans text-[1.45rem] text-[#20243d]">
                <span className="font-bold uppercase">Email</span> <span className="font-medium normal-case">(optional)</span>
              </Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-[12px] border-[2px] border-[rgba(74,106,125,0.22)] bg-[hsl(var(--card))] px-4 font-sans text-[1.35rem] text-foreground placeholder:text-[#a4a09a] focus-visible:ring-2 focus-visible:ring-[#4a6a7d]/35"
              />
              <p className="font-sans text-[1.2rem] leading-[1.4] text-[#6e7590]">
                This only prefills Auth0. Password entry happens securely on Auth0.
              </p>
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="auth-full-name" className="font-sans text-[1.45rem] font-bold uppercase text-[#20243d]">
                  Full Name
                </Label>
                <Input
                  id="auth-full-name"
                  type="text"
                  placeholder="Jane Smith"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  className="h-12 rounded-[12px] border-[2px] border-[rgba(74,106,125,0.22)] bg-[hsl(var(--card))] px-4 font-sans text-[1.35rem] text-foreground placeholder:text-[#a4a09a] focus-visible:ring-2 focus-visible:ring-[#4a6a7d]/35"
                />
              </div>
            )}

            {isLogin && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto min-h-0 p-0 font-sans text-[1.3rem] font-medium text-[#3f5f8a] hover:bg-transparent hover:text-[#2f4f78]"
                  onClick={continueWithEmail}
                >
                  Forgot password?
                </Button>
              </div>
            )}

            <Button
              type="button"
              className="h-12 w-full rounded-[14px] border border-primary-border font-sans text-[1.65rem] font-semibold text-primary-foreground"
              onClick={continueWithEmail}
            >
              {primaryButtonLabel}
            </Button>

            <div className="flex items-center gap-3 pt-0.5">
              <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
              <span className="font-sans text-[1.2rem] font-medium text-[#7c8095]">or</span>
              <div className="h-px flex-1 bg-[rgba(74,106,125,0.22)]" />
            </div>

            <div className="space-y-2.5">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-[hsl(var(--card))] font-sans text-[1.5rem] font-medium text-[#20243d] hover:bg-[hsl(var(--card))]"
                onClick={continueWithGoogle}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--card))] font-sans text-[1.4rem] font-bold leading-none text-[#4285F4]"
                >
                  G
                </span>
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-center gap-3 rounded-[14px] border-[2px] border-[rgba(74,106,125,0.22)] bg-[hsl(var(--card))] font-sans text-[1.5rem] font-medium text-[#20243d] hover:bg-[hsl(var(--card))]"
                onClick={continueWithFacebook}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#1c74e9] text-[#ffffff]"
                >
                  <Facebook className="h-3.5 w-3.5" />
                </span>
                Continue with Facebook
              </Button>
            </div>

            <div className="rounded-[14px] border-[2px] border-[rgba(74,106,125,0.2)] bg-transparent px-4 py-3">
              <p className="font-sans text-[1.2rem] leading-[1.4] text-[#6e7590]">
                We&apos;ll open a secure Auth0 sign-in in the same tab and bring you back here after login.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
