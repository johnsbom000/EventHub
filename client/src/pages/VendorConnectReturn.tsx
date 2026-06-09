import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function VendorConnectReturn() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Stripe Connect onboarding complete (or exited) — redirect back to payments
    // so the vendor can see their updated connect status.
    setLocation("/vendor/payments?stripe_setup=success");
  }, [setLocation]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Redirecting…</p>
      </div>
    </div>
  );
}
