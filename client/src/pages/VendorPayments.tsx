import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import VendorShell from "@/components/VendorShell";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";

type VendorPaymentHistoryItem = {
  id: string;
  netAmount?: number | null;
  grossAmount?: number | null;
  status?: string | null;
  eventDate?: string | null;
  createdAt?: string | null;
};
type VendorPaymentsResponse = {
  totalNetEarned?: number | null;
  upcomingNetPayout?: number | null;
  payoutReleaseMode?: string | null;
  payoutPolicyNote?: string | null;
  history?: VendorPaymentHistoryItem[];
};

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

export default function VendorPayments() {
  const { isAuthenticated } = useAuth0();

  const { data } = useQuery<VendorPaymentsResponse>({
    queryKey: ["/api/vendor/payments"],
    enabled: isAuthenticated,
  });
  const history = Array.isArray(data?.history) ? data!.history! : [];
  const totalNetEarned = Number(data?.totalNetEarned ?? 0);
  const upcomingNetPayout = Number(data?.upcomingNetPayout ?? 0);
  const payoutPolicyNote =
    typeof data?.payoutPolicyNote === "string" && data.payoutPolicyNote.trim().length > 0
      ? data.payoutPolicyNote.trim()
      : "Payouts are released manually after eligibility checks.";

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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-0">
          <section className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">Net Earned</h2>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-4 text-2xl font-bold" data-testid="stat-total-earned">
              {formatUsdFromCents(totalNetEarned)}
            </div>
            <p className="text-xs text-muted-foreground">All time earnings net of fees</p>
          </section>

          <div className="hidden px-2 md:flex md:items-center md:justify-center" aria-hidden>
            <div className="h-16 w-px bg-[var(--dashboard-divider-blue)]" />
          </div>

          <section className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">Upcoming Net Payout</h2>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-4 text-2xl font-bold" data-testid="stat-upcoming-net-payout">
              {formatUsdFromCents(upcomingNetPayout)}
            </div>
            <p className="text-xs text-muted-foreground">Eligible completed jobs pending manual release</p>
          </section>
        </div>

        <p className="text-xs text-muted-foreground">{payoutPolicyNote}</p>

        <div className="h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />

        <section className="px-4 py-2">
          <h2 className="font-heading text-[32px] leading-none tracking-tight">Payment History</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Detailed list of all payments and transactions
          </p>

          {history.length === 0 ? (
            <div className="py-12 text-center">
              <DollarSign className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No payments yet</h3>
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
            <div className="space-y-3">
              {history.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
                  <div>
                    <div className="font-medium">Booking #{payment.id.slice(0, 8)}</div>
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
        </section>
      </div>
    </VendorShell>
  );
}
