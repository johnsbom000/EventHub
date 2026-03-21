import { useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { loginWithPopupFirst } from "@/lib/auth0Login";

const POPUP_GUARD_KEY = "vendor-auth0-popup-attempt";
const POPUP_GUARD_WINDOW_MS = 5000;

function getSafeReturnTo() {
  if (typeof window === "undefined") {
    return "/vendor/dashboard";
  }

  const requested = new URLSearchParams(window.location.search).get("returnTo")?.trim() || "";
  if (!requested.startsWith("/") || requested.startsWith("//") || requested.startsWith("/vendor/login")) {
    return "/vendor/dashboard";
  }

  return requested;
}

function isRecentPopupAttempt(returnTo: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const raw = window.sessionStorage.getItem(POPUP_GUARD_KEY);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw) as { returnTo?: string; startedAt?: number };
    return (
      parsed.returnTo === returnTo &&
      typeof parsed.startedAt === "number" &&
      Date.now() - parsed.startedAt < POPUP_GUARD_WINDOW_MS
    );
  } catch {
    return false;
  }
}

function markPopupAttempt(returnTo: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    POPUP_GUARD_KEY,
    JSON.stringify({
      returnTo,
      startedAt: Date.now(),
    }),
  );
}

function clearPopupAttempt() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(POPUP_GUARD_KEY);
}

export default function VendorLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    loginWithPopup,
    loginWithRedirect,
  } = useAuth0();
  const [isStartingLogin, setIsStartingLogin] = useState(true);

  const returnTo = useMemo(() => getSafeReturnTo(), []);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (isAuthenticated) {
      clearPopupAttempt();
      setLocation(returnTo);
      return;
    }

    if (isRecentPopupAttempt(returnTo)) {
      setIsStartingLogin(false);
      return;
    }

    markPopupAttempt(returnTo);
    setIsStartingLogin(true);

    void (async () => {
      try {
        const loginResult = await loginWithPopupFirst({
          loginWithPopup,
          loginWithRedirect,
          popupOptions: {
            authorizationParams: {
              prompt: "login",
            },
          },
          redirectOptions: {
            appState: { returnTo },
            authorizationParams: {
              prompt: "login",
            },
          },
        });

        if (loginResult === "cancelled") {
          clearPopupAttempt();
          setIsStartingLogin(false);
        }
      } catch (error: any) {
        clearPopupAttempt();
        setIsStartingLogin(false);
        toast({
          variant: "destructive",
          title: "Unable to start sign in",
          description: error?.message || "Please try again.",
        });
      }
    })();
  }, [
    isAuthLoading,
    isAuthenticated,
    loginWithPopup,
    loginWithRedirect,
    returnTo,
    setLocation,
    toast,
  ]);

  const retryLogin = async () => {
    clearPopupAttempt();
    setIsStartingLogin(true);

    try {
      markPopupAttempt(returnTo);
      const loginResult = await loginWithPopupFirst({
        loginWithPopup,
        loginWithRedirect,
        popupOptions: {
          authorizationParams: {
            prompt: "login",
          },
        },
        redirectOptions: {
          appState: { returnTo },
          authorizationParams: {
            prompt: "login",
          },
        },
      });

      if (loginResult === "cancelled") {
        clearPopupAttempt();
        setIsStartingLogin(false);
      }
    } catch (error: any) {
      clearPopupAttempt();
      setIsStartingLogin(false);
      toast({
        variant: "destructive",
        title: "Unable to start sign in",
        description: error?.message || "Please try again.",
      });
    }
  };

  if (isAuthLoading || isStartingLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Redirecting to Auth0</CardTitle>
            <CardDescription>
              Reopening secure vendor sign in and returning you to your portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>Starting sign in...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Continue vendor sign in</CardTitle>
          <CardDescription>
            Your session ended before we could finish opening Auth0.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={retryLogin} data-testid="button-retry-vendor-login">
            Try sign in again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
