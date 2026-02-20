import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import VendorShell from "@/components/VendorShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";

type VendorPayment = {
  id: string;
  amount?: number | null;
  status?: string | null;
  createdAt?: string | null;
  // minimal shape for typing only
};

export default function VendorPayments() {
  const { isAuthenticated } = useAuth0();

  const { data: payments = [] } = useQuery<VendorPayment[]>({
    queryKey: ["/api/vendor/payments"],
    enabled: isAuthenticated,
  });

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-earned">
                $0.00
              </div>
              <p className="text-xs text-muted-foreground">All time earnings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Fees</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-platform-fees">
                $0.00
              </div>
              <p className="text-xs text-muted-foreground">15% service fee</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Payout</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-net-payout">
                $0.00
              </div>
              <p className="text-xs text-muted-foreground">After fees</p>
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
            {payments.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No payments yet</h3>
                <p className="text-muted-foreground">
                  Your payment history will appear here once you receive bookings.
                </p>

                <div className="mt-6 flex justify-center">
                  <Button data-testid="button-setup-stripe">
                    Set Up Stripe For Payment
                  </Button>
                </div>
              </div>
            ) : (
              <div>{/* Payment table will be rendered here later */}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </VendorShell>
  );
}
