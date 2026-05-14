import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      : "Payouts are automatically released 72 hours after your event date, once eligibility is confirmed.";

  return (
    <VendorShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            {t("vendorPayments.pageTitle")}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-0">
          <section className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorPayments.netEarned")}</h2>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-4 text-2xl font-bold" data-testid="stat-total-earned">
              {formatUsdFromCents(totalNetEarned)}
            </div>
            <p className="text-sm text-muted-foreground">{t("vendorPayments.netEarnedDesc")}</p>
          </section>

          <div className="hidden px-2 md:flex md:items-center md:justify-center" aria-hidden>
            <div className="h-16 w-px bg-[var(--dashboard-divider-blue)]" />
          </div>

          <section className="px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorPayments.upcomingPayout")}</h2>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-4 text-2xl font-bold" data-testid="stat-upcoming-net-payout">
              {formatUsdFromCents(upcomingNetPayout)}
            </div>
            <p className="text-sm text-muted-foreground">{t("vendorPayments.upcomingPayoutDesc")}</p>
          </section>
        </div>

        <p className="text-sm text-muted-foreground">{payoutPolicyNote}</p>

        <div className="h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />

        <section className="px-4 py-2">
          <h2 className="text-2xl font-semibold text-foreground">{t("vendorPayments.paymentHistory")}</h2>

          {history.length === 0 ? (
            <div className="py-12 text-center">
              <DollarSign className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">{t("vendorPayments.noPayments")}</h3>
              <p className="text-muted-foreground">
                {t("vendorPayments.noPaymentsDesc")}
              </p>

              <div className="mt-6 flex justify-center">
                <Button data-testid="button-setup-stripe">
                  {t("vendorPayments.setupStripe")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{t("vendorPayments.bookingNumber", { id: payment.id.slice(0, 8) })}</div>
                    <div className="text-sm text-muted-foreground">
                      {payment.eventDate || t("vendorPayments.dateNotSet")}
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
