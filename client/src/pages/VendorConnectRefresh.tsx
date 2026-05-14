import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function VendorConnectRefresh() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Stripe Connect onboarding link expired — redirect back to payments
    // where the vendor can generate a new onboarding link.
    setLocation("/vendor/payments");
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
