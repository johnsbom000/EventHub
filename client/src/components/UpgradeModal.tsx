import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Sparkles,
  Loader2,
  LayoutGrid,
  BarChart3,
  CalendarClock,
  MessageSquareText,
  Tag,
  Star,
  Plus,
} from "lucide-react";

type BillingInterval = "monthly" | "annual";

const PRO_MONTHLY_LABEL = "$29";
const PRO_ANNUAL_LABEL = "$290";
const PRO_MONTHLY_STRUCK = "$39";
const PRO_ANNUAL_STRUCK = "$390";

/**
 * Shared "Upgrade to Pro" modal. Opened from the various Pro-feature CTAs across
 * the vendor dashboard (header pill, listing cap banner, Google Calendar gates).
 * Shows only the monthly/annual plan options and starts Stripe Checkout — the
 * full Billing & Plan panel (with Free/Pro comparison and manage-subscription)
 * still lives on the dashboard's billing section.
 */
const UpgradeModalContext = createContext<{ open: () => void }>({ open: () => {} });

export function useUpgradeModal() {
  return useContext(UpgradeModalContext);
}

export { UpgradeModalContext };

/**
 * Hosts the shared Upgrade modal and exposes `open()` via context. Must sit
 * ABOVE every component that renders an upgrade CTA — the vendor pages call
 * `useUpgradeModal()` in their own bodies, so the provider lives at the router
 * level (above the pages), not inside VendorShell (which the pages render as a
 * child, and which would therefore be below them in the tree).
 */
export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <UpgradeModal open={open} onOpenChange={setOpen} />
    </UpgradeModalContext.Provider>
  );
}

export function UpgradeModal({
  open,
  onOpenChange,
  title = "Upgrade to Pro",
  description = "Unlock unlimited listings, advanced analytics, and Google Calendar sync.",
  onBeforeCheckout,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title?: string;
  description?: string;
  /** Called right before redirecting to Stripe Checkout — lets a host suppress
   *  navigation guards (e.g. the create-listing wizard's beforeunload prompt). */
  onBeforeCheckout?: () => void;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/vendor/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.message || json.error || "Could not start checkout");
      onBeforeCheckout?.();
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="upgrade-modal">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="deal-outline rounded-2xl bg-card p-6" style={{ ["--ring" as any]: "2.5px" }}>
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-semibold">Pro</h3>
            <Badge className="bg-[#4a6a7d] text-[#f5f0e8] gap-1">
              <Sparkles className="h-3 w-3" /> Recommended
            </Badge>
          </div>

          {/* Monthly / annual toggle */}
          <div className="mt-3 inline-flex rounded-full border border-border p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={`rounded-full px-3 py-1 ${interval === "monthly" ? "bg-[#4a6a7d] text-[#f5f0e8]" : "text-muted-foreground"}`}
              data-testid="upgrade-modal-interval-monthly"
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("annual")}
              className={`rounded-full px-3 py-1 ${interval === "annual" ? "bg-[#4a6a7d] text-[#f5f0e8]" : "text-muted-foreground"}`}
              data-testid="upgrade-modal-interval-annual"
            >
              Annual
            </button>
          </div>

          <p className="mt-3 text-3xl font-bold">
            <span className="mr-2 align-middle text-2xl font-semibold text-muted-foreground line-through">
              {interval === "monthly" ? PRO_MONTHLY_STRUCK : PRO_ANNUAL_STRUCK}
            </span>
            <span className="deal-highlight">
              {interval === "monthly" ? PRO_MONTHLY_LABEL : PRO_ANNUAL_LABEL}
            </span>
            <span className="text-base font-normal text-muted-foreground">
              {interval === "monthly" ? "/month" : "/year"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {interval === "annual" ? "2 months free vs. monthly" : "Billed monthly"}
          </p>

          <ul className="mt-5 space-y-2.5 text-sm">
            <Feature icon={<LayoutGrid className="h-4 w-4" />}>Unlimited active listings</Feature>
            <Feature icon={<Plus className="h-4 w-4" />}>Add-on listings (bookable upgrades)</Feature>
            <Feature icon={<MessageSquareText className="h-4 w-4" />}>AI reply assistant for messages</Feature>
            <Feature icon={<Tag className="h-4 w-4" />}>Discounts &amp; promo codes</Feature>
            <Feature icon={<Star className="h-4 w-4" />}>Reputation management &amp; review replies</Feature>
            <Feature icon={<BarChart3 className="h-4 w-4" />}>Advanced analytics &amp; trends</Feature>
            <Feature icon={<CalendarClock className="h-4 w-4" />}>Google Calendar sync</Feature>
          </ul>

          <div className="mt-6">
            <Button
              className="deal-fill w-full border-0 text-[#f5f0e8] hover:opacity-95"
              onClick={startCheckout}
              disabled={busy}
              data-testid="upgrade-modal-subscribe"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start 30-day free trial"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              30 days free, then {interval === "monthly" ? `${PRO_MONTHLY_LABEL}/month` : `${PRO_ANNUAL_LABEL}/year`}. Cancel anytime.
            </p>
          </div>

          {error ? (
            <p className="mt-3 text-center text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Feature({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-[#4a6a7d]">{icon ?? <Check className="h-4 w-4" />}</span>
      {children}
    </li>
  );
}
