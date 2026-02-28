import { useAuth0 } from "@auth0/auth0-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  const title = useMemo(() => {
    return activeTab === "login" ? "Sign in to your account" : "Create your account";
  }, [activeTab]);

  const description = useMemo(() => {
    return activeTab === "login"
      ? "Continue with Google, Facebook, or email."
      : "Create an account with Google, Facebook, or email.";
  }, [activeTab]);

  const safeLoginHint = email?.trim() ? email.trim() : undefined;

  const startLogin = async (opts: Parameters<typeof loginWithRedirect>[0]) => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const redirectOptions = {
      ...opts,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrandWordmark className="text-[1.85rem]" />
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>

          {/* LOGIN TAB */}
          <TabsContent value="login" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-login">Email (optional)</Label>
              <Input
                id="email-login"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This only prefills Auth0. Password entry happens securely on Auth0.
              </p>
            </div>

            <div className="space-y-2">
              <Button type="button" className="w-full" onClick={continueWithGoogle}>
                Continue with Google
              </Button>

              {/* Optional: only works if Facebook connection is enabled in Auth0 */}
              <Button type="button" variant="outline" className="w-full" onClick={continueWithFacebook}>
                Continue with Facebook
              </Button>
            </div>

            <Alert>
              <AlertDescription>
                We’ll open secure Auth0 sign-in in the same tab and bring you back here after login.
              </AlertDescription>
            </Alert>
          </TabsContent>

          {/* SIGNUP TAB */}
          <TabsContent value="signup" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name-signup">Name (optional)</Label>
              <Input
                id="name-signup"
                type="text"
                placeholder="Your name"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-signup">Email (optional)</Label>
              <Input
                id="email-signup"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This only prefills Auth0. Password creation happens securely on Auth0.
              </p>
            </div>

            <div className="space-y-2">
              <Button type="button" className="w-full" onClick={continueWithGoogle}>
                Continue with Google
              </Button>

              {/* Optional: only works if Facebook connection is enabled in Auth0 */}
              <Button type="button" variant="outline" className="w-full" onClick={continueWithFacebook}>
                Continue with Facebook
              </Button>
            </div>

            <Alert>
              <AlertDescription>
                We’ll open Auth0 account creation in the same tab and bring you back here after login.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
