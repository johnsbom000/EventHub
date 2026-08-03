import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import VendorShell from "@/components/VendorShell";
import { Button } from "@/components/ui/button";
import { CheckCircle2, DollarSign, ExternalLink, Loader2 } from "lucide-react";

type VendorPaymentHistoryItem = {
  id: string;
  netAmount?: number | null;
  grossAmount?: number | null;
  grossPayoutAmount?: number | null;
  stripeProcessingFeeAmount?: number | null;
  travelFeeAmount?: number | null;
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
type ConnectStatusResponse = {
  connected: boolean;
  complete?: boolean;
  detailsSubmitted?: boolean;
  chargesEnabled?: boolean;
};

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

/**
 * UI-ONLY render test. These rows are generated in the browser and are NEVER
 * persisted or fetched from the server — they exist purely to verify that the
 * payment history list renders correctly with many cards. Activated only when
 * BOTH conditions hold: the signed-in account is the owner test account AND the
 * page is loaded with `?uiTest=1`. It has no effect for any other user or URL.
 */
const UI_TEST_ACCOUNT_EMAIL = "johnsbom000@gmail.com";
const UI_TEST_AMOUNTS_CENTS = [35000, 1000, 7500, 15000]; // $350, $10, $75, $150

function buildUiTestHistory(): VendorPaymentHistoryItem[] {
  return Array.from({ length: 30 }, (_, i) => {
    const amount = UI_TEST_AMOUNTS_CENTS[i % UI_TEST_AMOUNTS_CENTS.length];
    // Deterministic, unique 8-char hex id per card so each booking number
    // (rendered from id.slice(0, 8)) is distinct and looks like a real one.
    const id = (0x10000000 + i * 0x1a2b3d).toString(16);
    return {
      id,
      netAmount: amount,
      grossPayoutAmount: amount,
      status: i % 3 === 0 ? "pending" : "paid",
      eventDate: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
    };
  });
}

export default function VendorPayments() {
  const { t } = useTranslation();
  const { isAuthenticated, getAccessTokenSilently, user } = useAuth0();
  const [location] = useLocation();
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const searchParams = new URLSearchParams(location.split("?")[1] ?? "");
  const fromStripeReturn = searchParams.get("stripe_setup") === "success";

  // UI-only render test — see buildUiTestHistory() above. Gated to the owner
  // test account AND an explicit ?uiTest=1 query param so it never appears on a
  // normal page load or for any other user.
  const uiTestActive =
    searchParams.get("uiTest") === "1" && user?.email === UI_TEST_ACCOUNT_EMAIL;

  const { data } = useQuery<VendorPaymentsResponse>({
    queryKey: ["/api/vendor/payments"],
    enabled: isAuthenticated,
  });

  const { data: connectStatus, isLoading: connectLoading } = useQuery<ConnectStatusResponse>({
    queryKey: ["/api/vendor/connect/status"],
    enabled: isAuthenticated,
  });

  const history = uiTestActive
    ? buildUiTestHistory()
    : Array.isArray(data?.history)
      ? data!.history!
      : [];
  const totalNetEarned = Number(data?.totalNetEarned ?? 0);
  const upcomingNetPayout = Number(data?.upcomingNetPayout ?? 0);
  const payoutPolicyNote =
    typeof data?.payoutPolicyNote === "string" && data.payoutPolicyNote.trim().length > 0
      ? data.payoutPolicyNote.trim()
      : "Payouts are automatically released 72 hours after your event date, once eligibility is confirmed.";

  const stripeConnected = connectStatus?.connected && connectStatus?.complete;
  const stripeIncomplete = connectStatus?.connected && !connectStatus?.complete;

  async function handleSetupStripe() {
    setSetupLoading(true);
    setSetupError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/vendor/connect/setup-link", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Could not generate Stripe link");
      window.location.href = json.url;
    } catch (err: any) {
      setSetupError(err.message || "Something went wrong. Please try again.");
      setSetupLoading(false);
    }
  }

  async function handleViewDashboard() {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/vendor/connect/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Could not open Stripe dashboard");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      // fail silently — user can retry
    }
  }

  return (
    <VendorShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            {t("vendorPayments.pageTitle")}
          </h1>
        </div>

        {/* Stripe connection status */}
        {!connectLoading && (
          <>
            {stripeConnected ? (
              <div className={`rounded-lg border p-4 flex items-start gap-3 ${fromStripeReturn ? "border-green-300 bg-green-50" : "border-border bg-muted/40"}`}>
                <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${fromStripeReturn ? "text-green-600" : "text-green-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${fromStripeReturn ? "text-green-900" : "text-foreground"}`}>
                    {fromStripeReturn ? t("vendorPayments.stripeSetupSuccess") : t("vendorPayments.stripeConnected")}
                  </p>
                  <p className={`text-sm mt-0.5 ${fromStripeReturn ? "text-green-800" : "text-muted-foreground"}`}>
                    {t("vendorPayments.stripeConnectedDesc")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={handleViewDashboard}
                >
                  {t("vendorPayments.stripeViewDashboard")}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : stripeIncomplete ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
                <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-amber-500 flex items-center justify-center">
                  <span className="block h-1.5 w-1.5 rounded-full bg-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-amber-900">{t("vendorPayments.stripeIncomplete")}</p>
                  <p className="text-sm mt-0.5 text-amber-800">{t("vendorPayments.stripeIncompleteDesc")}</p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={handleSetupStripe}
                  disabled={setupLoading}
                >
                  {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("vendorPayments.stripeCompleteSetup")}
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border p-4 flex items-start gap-3 bg-muted/40">
                <DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{t("vendorPayments.stripeNotConnected")}</p>
                  <p className="text-sm mt-0.5 text-muted-foreground">{t("vendorPayments.stripeNotConnectedDesc")}</p>
                  {setupError && <p className="text-sm mt-1 text-red-600">{setupError}</p>}
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={handleSetupStripe}
                  disabled={setupLoading}
                  data-testid="button-setup-stripe"
                >
                  {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("vendorPayments.setupStripe")}
                </Button>
              </div>
            )}
          </>
        )}

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
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((payment) => {
                const stripeFeeCents = Number(payment.stripeProcessingFeeAmount ?? 0);
                const travelFeeCents = Number(payment.travelFeeAmount ?? 0);
                const grossPayoutCents = Number(
                  payment.grossPayoutAmount ?? payment.netAmount ?? 0
                );
                const showBreakdown = stripeFeeCents > 0 || travelFeeCents > 0;
                return (
                  <div key={payment.id} className="flex items-start justify-between gap-3 rounded-lg border p-4">
                    <div>
                      <div className="font-medium">{t("vendorPayments.bookingNumber", { id: payment.id.slice(0, 8) })}</div>
                      <div className="text-sm text-muted-foreground">
                        {payment.eventDate || t("vendorPayments.dateNotSet")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm capitalize text-muted-foreground">{payment.status || "pending"}</div>
                      {showBreakdown && (
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <div className="flex justify-between gap-4">
                            <span>{t("vendorPayments.bookingTotal")}</span>
                            <span>{formatUsdFromCents(grossPayoutCents)}</span>
                          </div>
                          {travelFeeCents > 0 && (
                            <div className="flex justify-between gap-4">
                              <span>{t("vendorPayments.travelFee")}</span>
                              <span>+ {formatUsdFromCents(travelFeeCents)}</span>
                            </div>
                          )}
                          {stripeFeeCents > 0 && (
                            <div className="flex justify-between gap-4">
                              <span>{t("vendorPayments.stripeProcessingFee")}</span>
                              <span>− {formatUsdFromCents(stripeFeeCents)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-1 font-medium">{formatUsdFromCents(Number(payment.netAmount ?? 0))}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </VendorShell>
  );
}
