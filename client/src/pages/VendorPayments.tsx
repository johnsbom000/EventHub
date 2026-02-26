import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useState } from "react";

import VendorShell from "@/components/VendorShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { redirectVendorToStripeSetup } from "@/lib/vendorStripe";

type VendorPaymentHistoryItem = {
  id: string;
  itemTitle?: string | null;
  netAmount?: number | null;
  grossAmount?: number | null;
  status?: string | null;
  eventDate?: string | null;
  createdAt?: string | null;
};
type VendorPaymentsResponse = {
  totalNetEarned?: number | null;
  upcomingNetPayout?: number | null;
  history?: VendorPaymentHistoryItem[];
};

type VendorMe = {
  stripeOnboardingComplete?: boolean | null;
};

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

export default function VendorPayments() {
  const { isAuthenticated } = useAuth0();
  const { toast } = useToast();
  const [isStripeSetupLoading, setIsStripeSetupLoading] = useState(false);

  const { data: vendorAccount } = useQuery<VendorMe>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated,
  });

  const { data } = useQuery<VendorPaymentsResponse>({
    queryKey: ["/api/vendor/payments"],
    enabled: isAuthenticated,
  });
  const history = Array.isArray(data?.history) ? data!.history! : [];
  const totalNetEarned = Number(data?.totalNetEarned ?? 0);
  const upcomingNetPayout = Number(data?.upcomingNetPayout ?? 0);
  const showPaymentSetupCard = vendorAccount?.stripeOnboardingComplete === false;

  const handleCompletePaymentSetup = async () => {
    try {
      setIsStripeSetupLoading(true);
      await redirectVendorToStripeSetup();
    } catch (error: any) {
      setIsStripeSetupLoading(false);
      toast({
        title: "Unable to open Stripe setup",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <VendorShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Payments
          </h1>
          <p className="text-muted-foreground">
            Track your earnings and payment history
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-[20px]">Net Earned</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-earned">
                {formatUsdFromCents(totalNetEarned)}
              </div>
              <p className="text-xs text-muted-foreground">All time earnings net of fees</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-[20px]">Upcoming Net Payout</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-upcoming-net-payout">
                {formatUsdFromCents(upcomingNetPayout)}
              </div>
              <p className="text-xs text-muted-foreground">Confirmed future jobs</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>
              Detailed list of all payments and transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No payments yet</h3>
                <p className="text-muted-foreground">
                  Your payment history will appear here once you receive bookings.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((payment) => (
                  <div key={payment.id} className="rounded-lg border p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{payment.itemTitle || `Booking #${payment.id.slice(0, 8)}`}</div>
                      <div className="text-sm text-muted-foreground">
                        {payment.eventDate || "Date not set"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm capitalize text-muted-foreground">{payment.status || "pending"}</div>
                      <div className="font-medium">{formatUsdFromCents(Number(payment.netAmount ?? 0))}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {showPaymentSetupCard && (
          <Card className="border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)]">
            <CardHeader>
              <CardTitle className="text-[20px]">Complete Your Setup</CardTitle>
              <CardDescription>
                Connect your Stripe account to start accepting payments from customers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                data-testid="button-setup-stripe"
                onClick={handleCompletePaymentSetup}
                disabled={isStripeSetupLoading}
              >
                {isStripeSetupLoading ? "Opening Stripe..." : "Complete Payment Setup"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </VendorShell>
  );
}
