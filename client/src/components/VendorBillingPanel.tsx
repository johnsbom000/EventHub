import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import type { VendorMeState } from "@/lib/vendorState";
import KeepProModal from "@/components/KeepProModal";
import {
  Check,
  Sparkles,
  Loader2,
  CalendarClock,
  BarChart3,
  LayoutGrid,
  AlertTriangle,
  FileText,
  Upload,
  Trash2,
  MessageSquareText,
  Tag,
  Star,
  Plus,
} from "lucide-react";

type AiSettings = {
  hasProFeatures: boolean;
  enabled: boolean;
  overageEnabled: boolean;
  includedPerPeriod: number;
  used: number;
  remaining: number;
  periodResetsAt: string;
  overagePriceCents: number;
};

type FaqMeta = { filename: string | null; charCount: number; pageCount: number | null; updatedAt: string } | null;

type BillingInterval = "monthly" | "annual";

const PRO_MONTHLY_LABEL = "$29";
const PRO_ANNUAL_LABEL = "$290";
const PRO_MONTHLY_STRUCK = "$39";
const PRO_ANNUAL_STRUCK = "$390";

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Whole days from now until `value` (negative if past). null if missing/invalid. */
function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Self-contained Billing & Plan panel — plan cards, status banner, upgrade
 * (Stripe Checkout) and manage (Stripe Billing Portal) actions. Rendered inline
 * on the vendor dashboard. Reads /api/vendor/me for entitlement state and the
 * `?checkout=success` query param for the post-checkout confirmation.
 */
export default function VendorBillingPanel() {
  const { t } = useTranslation();
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [location] = useLocation();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const [busy, setBusy] = useState<null | "checkout" | "portal">(null);
  const [error, setError] = useState<string | null>(null);
  const [keepProOpen, setKeepProOpen] = useState(false);

  const checkoutResult = new URLSearchParams(location.split("?")[1] ?? "").get("checkout");

  const { data: me } = useQuery<VendorMeState>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated,
  });

  // isPro reflects an actual paid/trialing/comp SUBSCRIPTION — this panel is the
  // subscription/billing UI, so its plan cards, banners, and manage-subscription
  // actions correctly stay keyed on isPro throughout. hasProFeatures gates the AI
  // Assistant capability card below (available to commission vendors too), and
  // showUpgradePrompts hides the Free/Pro comparison + upsell for commission
  // vendors, who have no subscription to buy.
  const isPro = Boolean(me?.isPro);
  const hasProFeatures = Boolean(me?.hasProFeatures);
  const showUpgradePrompts = me?.showUpgradePrompts !== false;
  const status = me?.subscriptionStatus ?? "none";
  const reason = me?.subscriptionReason ?? "free";
  const hasStripeSub = status === "active" || status === "trialing" || status === "past_due";
  const periodEnd = formatDate(me?.subscriptionCurrentPeriodEnd);
  const compEnd = formatDate(me?.compEndsAt);
  // Only surface the "Subscribe" upsell to comp vendors in the final week of
  // their complimentary Pro — before that, the grant is presented as a gift with
  // no ask. `null` end date (missing) falls back to showing it, to be safe.
  const compDaysLeft = daysUntil(me?.compEndsAt);
  const showCompSubscribe = compDaysLeft === null || compDaysLeft <= 7;

  // After returning from Stripe Checkout (?checkout=success), the cached
  // /api/vendor/me is stale. Refetch it — which also updates the header Pro badge
  // and every gate, since they share this query key — and poll briefly to absorb
  // webhook latency (the customer.subscription.created event may land a moment
  // after the redirect). Stops as soon as the vendor reads as Pro, or after a cap.
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(checkoutResult === "success");
  const polledRef = useRef(false);

  useEffect(() => {
    if (checkoutResult !== "success" || polledRef.current) return;
    polledRef.current = true;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      await qc.refetchQueries({ queryKey: ["/api/vendor/me"] });
      attempts += 1;
      const data = qc.getQueryData<VendorMeState>(["/api/vendor/me"]);
      if (data?.isPro || attempts >= 8) {
        setConfirming(false);
        // Strip the ?checkout param so a manual refresh doesn't re-run this.
        try { window.history.replaceState(null, "", window.location.pathname); } catch {}
        return;
      }
      setTimeout(poll, 2000); // note: setInterval is shadowed by state setter; use setTimeout
    };
    void poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutResult]);

  async function startCheckout(chosen: BillingInterval) {
    setBusy("checkout");
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/vendor/billing/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ interval: chosen }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.message || json.error || "Could not start checkout");
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/vendor/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.message || json.error || "Could not open billing portal");
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  function StatusBanner() {
    // Just returned from Checkout but the Pro status hasn't landed yet — show a
    // confirming state while we poll /api/vendor/me. Once isPro flips, the real
    // "You're an EventHub Pro" banner below takes over automatically.
    if (confirming && !isPro) {
      return (
        <Banner tone="info" icon={<Loader2 className="h-5 w-5 animate-spin" />}>
          <p className="font-semibold">Confirming your subscription…</p>
          <p className="mt-0.5 text-sm">This only takes a moment.</p>
        </Banner>
      );
    }
    if (reason === "past_due") {
      return (
        <Banner tone="warning" icon={<AlertTriangle className="h-5 w-5" />}>
          <p className="font-semibold">Your payment failed</p>
          <p className="mt-0.5 text-sm">Update your card to keep Pro. Your features stay active while we retry.</p>
          <Button size="sm" className="mt-3" onClick={openPortal} disabled={busy !== null}>
            {busy === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update card"}
          </Button>
        </Banner>
      );
    }
    if (reason === "comp") {
      return (
        <Banner tone="info" icon={<Sparkles className="h-5 w-5" />}>
          <p className="font-semibold">You have complimentary Pro{compEnd ? ` until ${compEnd}` : ""}</p>
          <p className="mt-0.5 text-sm">
            {showCompSubscribe
              ? "Subscribe before it ends to keep unlimited listings, analytics, and calendar sync."
              : "Enjoy unlimited listings, analytics, and calendar sync — on us."}
          </p>
          {showCompSubscribe ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => setInterval("monthly")}
                  className={`rounded-full px-3 py-1 ${interval === "monthly" ? "bg-[#4a6a7d] text-[#f5f0e8]" : "text-muted-foreground"}`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setInterval("annual")}
                  className={`rounded-full px-3 py-1 ${interval === "annual" ? "bg-[#4a6a7d] text-[#f5f0e8]" : "text-muted-foreground"}`}
                >
                  Annual
                </button>
              </div>
              <Button
                size="sm"
                className="bg-[#4a6a7d] hover:bg-[#3f5c6d] text-[#f5f0e8]"
                onClick={() => startCheckout(interval)}
                disabled={busy !== null}
              >
                {busy === "checkout"
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : `Subscribe (${interval === "monthly" ? `${PRO_MONTHLY_LABEL}/mo` : `${PRO_ANNUAL_LABEL}/yr`})`}
              </Button>
            </div>
          ) : null}
        </Banner>
      );
    }
    if (reason === "trialing") {
      // Reverse-trial vendor with NO card yet: nothing will be charged at day 30 —
      // they'll simply downgrade unless they add a card. Prompt them to keep Pro.
      if (me?.reverseTrial && !me.reverseTrial.cardCaptured) {
        const daysLeft = me.reverseTrial.daysLeft ?? 0;
        return (
          <Banner tone="info" icon={<Sparkles className="h-5 w-5" />}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {daysLeft > 0
                    ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} of Pro left`
                    : "Your Pro trial ends today"}
                </p>
                <p className="mt-0.5 text-sm">
                  Add a card to keep unlimited listings, analytics, and calendar sync. You won't be
                  charged until your free trial ends — cancel anytime before then.
                </p>
              </div>
              <Button size="sm" className="shrink-0" onClick={() => setKeepProOpen(true)}>
                Add a card to keep Pro
              </Button>
            </div>
          </Banner>
        );
      }
      // Reverse-trial vendor who HAS added a card, or a normal card-first trial:
      // the card will be charged at trial end.
      return (
        <Banner tone="info" icon={<Sparkles className="h-5 w-5" />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">You're an EventHub Pro</p>
              <p className="mt-0.5 text-sm">
                {me?.reverseTrial?.cardCaptured
                  ? `Your card is saved — Pro continues${periodEnd ? ` on ${periodEnd}` : " when your trial ends"}.`
                  : `Free trial${periodEnd ? ` until ${periodEnd}` : ""} — your card will be charged when it ends unless you cancel.`}
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={openPortal} disabled={busy !== null}>
              {busy === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Manage subscription"}
            </Button>
          </div>
        </Banner>
      );
    }
    if (reason === "active") {
      return (
        <Banner tone="success" icon={<Check className="h-5 w-5" />}>
          <p className="font-semibold">You're on Pro</p>
          <p className="mt-0.5 text-sm">
            {me?.subscriptionCancelAtPeriodEnd
              ? `Your plan is set to cancel${periodEnd ? ` on ${periodEnd}` : ""}.`
              : `Renews${periodEnd ? ` on ${periodEnd}` : ""}.`}
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={openPortal} disabled={busy !== null}>
            {busy === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Manage subscription"}
          </Button>
        </Banner>
      );
    }
    return null;
  }

  return (
    <div className="space-y-5">
      <KeepProModal
        open={keepProOpen}
        onOpenChange={setKeepProOpen}
        daysLeft={me?.reverseTrial?.daysLeft ?? null}
        trialEndsAt={me?.reverseTrial?.trialEndsAt ?? null}
      />
      <div>
        <h2 className="font-heading text-[20px] leading-none tracking-tight mb-2">Billing &amp; Plan</h2>
        <p className="text-sm text-muted-foreground">
          {t("vendorDashboard.billingIntro")}
        </p>
      </div>

      <StatusBanner />

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {(showUpgradePrompts && !isPro && !confirming) ? (
      <div className="grid gap-5 md:grid-cols-2">
        {/* Free plan */}
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-semibold">Free</h3>
            {!isPro ? <Badge variant="outline">Current plan</Badge> : null}
          </div>
          <p className="mt-1 text-3xl font-bold">$0</p>
          <p className="text-sm text-muted-foreground">Everything you need to get started.</p>
          <ul className="mt-5 space-y-2.5 text-sm">
            <Feature ok>List, take bookings, and get paid — no EventHub commission</Feature>
            <Feature ok>1 active listing at a time</Feature>
            <Feature ok>Lifetime totals (bookings &amp; revenue)</Feature>
            <Feature>Add-on listings (bookable upgrades)</Feature>
            <Feature>AI reply assistant for messages</Feature>
            <Feature>Discounts &amp; promo codes</Feature>
            <Feature>Reputation management &amp; review replies</Feature>
            <Feature>Advanced analytics &amp; trends</Feature>
            <Feature>Google Calendar sync</Feature>
          </ul>
        </div>

        {/* Pro plan */}
        <div className="deal-outline rounded-2xl bg-card p-6 flex flex-col relative" style={{ ["--ring" as any]: "2.5px" }}>
          <div className="absolute -top-3 left-6">
            <Badge className="bg-[#4a6a7d] text-[#f5f0e8] gap-1">
              <Sparkles className="h-3 w-3" /> Recommended
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-semibold">Pro</h3>
            {isPro ? <Badge className="bg-[#4a6a7d] text-[#f5f0e8]">Current plan</Badge> : null}
          </div>

          {/* Monthly / annual toggle */}
          <div className="mt-3 inline-flex rounded-full border border-border p-0.5 text-sm self-start">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={`rounded-full px-3 py-1 ${interval === "monthly" ? "bg-[#4a6a7d] text-[#f5f0e8]" : "text-muted-foreground"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval("annual")}
              className={`rounded-full px-3 py-1 ${interval === "annual" ? "bg-[#4a6a7d] text-[#f5f0e8]" : "text-muted-foreground"}`}
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
            <Feature ok>Everything in Free</Feature>
            <Feature ok icon={<LayoutGrid className="h-4 w-4" />}>Unlimited active listings</Feature>
            <Feature ok icon={<Plus className="h-4 w-4" />}>Add-on listings (bookable upgrades)</Feature>
            <Feature ok icon={<MessageSquareText className="h-4 w-4" />}>AI reply assistant for messages</Feature>
            <Feature ok icon={<Tag className="h-4 w-4" />}>Discounts &amp; promo codes</Feature>
            <Feature ok icon={<Star className="h-4 w-4" />}>Reputation management &amp; review replies</Feature>
            <Feature ok icon={<BarChart3 className="h-4 w-4" />}>Advanced analytics &amp; trends</Feature>
            <Feature ok icon={<CalendarClock className="h-4 w-4" />}>Google Calendar sync</Feature>
          </ul>

          <div className="mt-6 mt-auto pt-6">
            {isPro ? (
              hasStripeSub ? (
                <Button className="w-full" variant="outline" onClick={openPortal} disabled={busy !== null}>
                  {busy === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Manage subscription"}
                </Button>
              ) : (
                <Button
                  className="w-full bg-[#4a6a7d] hover:bg-[#3f5c6d] text-[#f5f0e8]"
                  onClick={() => startCheckout(interval)}
                  disabled={busy !== null}
                >
                  {busy === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe to keep Pro"}
                </Button>
              )
            ) : (
              <Button
                className="deal-fill w-full border-0 text-[#f5f0e8] hover:opacity-95"
                onClick={() => startCheckout(interval)}
                disabled={busy !== null}
              >
                {busy === "checkout" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start 30-day free trial"}
              </Button>
            )}
            {!isPro ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                30 days free, then {interval === "monthly" ? `${PRO_MONTHLY_LABEL}/month` : `${PRO_ANNUAL_LABEL}/year`}. Cancel anytime.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}

      <AiAssistantCard hasProFeatures={hasProFeatures} />
    </div>
  );
}

function AiAssistantCard({ hasProFeatures }: { hasProFeatures: boolean }) {
  const { t } = useTranslation();
  const { getAccessTokenSilently } = useAuth0();
  const fileRef = useRef<HTMLInputElement>(null);
  const [savingToggle, setSavingToggle] = useState<null | "enabled" | "overage">(null);
  const [uploading, setUploading] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const { data: ai, refetch: refetchAi } = useQuery<AiSettings>({
    queryKey: ["/api/vendor/ai/settings"],
    enabled: hasProFeatures,
  });
  const { data: faq, refetch: refetchFaq } = useQuery<FaqMeta>({
    queryKey: ["/api/vendor/ai/faq"],
    enabled: hasProFeatures,
  });

  if (!hasProFeatures) return null;

  const saveSetting = async (
    patch: { enabled?: boolean; overageEnabled?: boolean },
    which: "enabled" | "overage"
  ) => {
    setSavingToggle(which);
    setCardError(null);
    try {
      await apiRequest("POST", "/api/vendor/ai/settings", patch);
      await refetchAi();
    } catch {
      setCardError(t("ai.error"));
    } finally {
      setSavingToggle(null);
    }
  };

  const onPickFile = () => fileRef.current?.click();

  const onUpload = async (file: File) => {
    setUploading(true);
    setCardError(null);
    try {
      const token = await getAccessTokenSilently();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/vendor/ai/faq", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || body?.error || "upload_failed");
      }
      await refetchFaq();
    } catch (err: any) {
      setCardError(err?.message === "no_text" ? t("ai.faq.noText") : t("ai.faq.uploadError"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRemove = async () => {
    setCardError(null);
    try {
      await apiRequest("DELETE", "/api/vendor/ai/faq");
      await refetchFaq();
    } catch {
      setCardError(t("ai.error"));
    }
  };

  const enabled = ai?.enabled ?? false;
  const overageEnabled = ai?.overageEnabled ?? true;
  const included = ai?.includedPerPeriod ?? 0;
  const used = ai?.used ?? 0;
  const resets = formatDate(ai?.periodResetsAt);
  const price = ((ai?.overagePriceCents ?? 0) / 100).toFixed(2);
  const meterPct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[#4a6a7d]">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h3 className="font-serif text-lg font-semibold">{t("ai.assistant.title")}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("ai.assistant.desc")}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => saveSetting({ enabled: v }, "enabled")}
          disabled={savingToggle !== null}
          aria-label={t("ai.assistant.enableLabel")}
        />
      </div>

      {enabled ? (
        <div className="mt-5 space-y-5">
          {/* Credit meter */}
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {t("ai.assistant.meter", { used, included })}
              </span>
              {resets ? (
                <span className="text-muted-foreground">{t("ai.assistant.resets", { date: resets })}</span>
              ) : null}
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[#4a6a7d] transition-all"
                style={{ width: `${meterPct}%` }}
              />
            </div>
          </div>

          {/* Pay-as-you-go overage */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t("ai.assistant.overageLabel")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {overageEnabled
                  ? t("ai.assistant.overageHint", { price })
                  : t("ai.assistant.hardStopHint", { included })}
              </p>
            </div>
            <Switch
              checked={overageEnabled}
              onCheckedChange={(v) => saveSetting({ overageEnabled: v }, "overage")}
              disabled={savingToggle !== null}
              aria-label={t("ai.assistant.overageLabel")}
            />
          </div>

          {/* FAQ document */}
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-[#4a6a7d]" />
              {t("ai.faq.title")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("ai.faq.desc")}</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {faq?.filename ? (
                <>
                  <Badge variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" />
                    {faq.filename}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={onPickFile} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("ai.faq.replace")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onRemove} disabled={uploading}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={onPickFile} disabled={uploading}>
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="mr-1.5 h-4 w-4" />
                      {t("ai.faq.upload")}
                    </>
                  )}
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("ai.faq.pdfOnly")}</p>
          </div>
        </div>
      ) : null}

      {cardError ? <p className="mt-3 text-sm text-destructive">{cardError}</p> : null}
    </div>
  );
}

function Feature({
  children,
  ok = false,
  icon,
}: {
  children: React.ReactNode;
  ok?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "" : "text-muted-foreground/70"}`}>
      <span className={ok ? "deal-highlight text-[#4a6a7d]" : "text-muted-foreground/40"}>
        {ok ? icon ?? <Check className="h-4 w-4" /> : <span className="inline-block h-4 w-4 text-center">–</span>}
      </span>
      {children}
    </li>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "success" | "warning" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-[#4a6a7d]/25 bg-[#4a6a7d]/8 text-[#2a3a42]";
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${toneClass}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
