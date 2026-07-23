import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Check, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePaywallVariant } from "@/hooks/usePaywallVariant";
import { PaywallPitch } from "@/components/paywalls/PaywallVariants";
import { phCapture } from "@/lib/posthog";

// Same publishable-key resolution as the booking checkout flow. Returns a promise
// of null when the key isn't configured, so <Elements> renders harmlessly.
const stripePromise = (() => {
  const key = ((import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) || "").trim();
  return key.startsWith("pk_") ? loadStripe(key) : Promise.resolve(null);
})();

type Step = "pitch" | "card" | "done";

/**
 * "Keep Pro" modal for the reverse-trial experiment. A/B tested across five
 * presentation variants (1a–1e, assigned by a PostHog flag independent of the
 * landing variant): first a persuasion PITCH screen, then a shared in-app card
 * CAPTURE step (Stripe SetupIntent — no charge now) so the trial converts to paid
 * Pro at day 30 instead of downgrading. The pitch differs per variant; the capture
 * mechanism is identical, so the test isolates presentation, not price.
 */
export default function KeepProModal({
  open,
  onOpenChange,
  onCaptured,
  daysLeft,
  trialEndsAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured?: () => void;
  daysLeft?: number | null;
  trialEndsAt?: string | null;
}) {
  const variant = usePaywallVariant();
  const { getAccessTokenSilently } = useAuth0();
  const persistedRef = useRef(false);

  // Persist the resolved variant server-side (sticky) the first time this vendor
  // sees the modal, so the admin per-variant breakdown can attribute them. Also
  // mirror the exposure to PostHog.
  useEffect(() => {
    if (!open || persistedRef.current) return;
    persistedRef.current = true;
    phCapture("paywall_shown", { variant });
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        await fetch("/api/vendor/billing/paywall-variant", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ variant }),
        });
      } catch {
        /* best-effort — analytics attribution only */
      }
    })();
  }, [open, variant, getAccessTokenSilently]);

  // Reset the "persisted" guard when the modal fully closes so a later re-open
  // re-fires the exposure ping (server-side write stays a no-op once set).
  useEffect(() => {
    if (!open) persistedRef.current = false;
  }, [open]);

  const trialEndsLabel = formatTrialEnds(trialEndsAt);
  const days = typeof daysLeft === "number" ? Math.max(0, daysLeft) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="sr-only">
          <DialogTitle>Keep EventHub Pro</DialogTitle>
        </DialogHeader>
        <Elements stripe={stripePromise}>
          <KeepProFlow
            open={open}
            variant={variant}
            daysLeft={days}
            trialEndsLabel={trialEndsLabel}
            onDone={() => onOpenChange(false)}
            onCaptured={onCaptured}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  );
}

function formatTrialEnds(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function KeepProFlow({
  open,
  variant,
  daysLeft,
  trialEndsLabel,
  onDone,
  onCaptured,
}: {
  open: boolean;
  variant: string;
  daysLeft: number;
  trialEndsLabel: string | null;
  onDone: () => void;
  onCaptured?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { getAccessTokenSilently } = useAuth0();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("pitch");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to the pitch step whenever the modal re-opens.
  useEffect(() => {
    if (open) {
      setStep("pitch");
      setError(null);
    }
  }, [open]);

  // Lazily create a SetupIntent when the vendor advances to the card step (so
  // people who bounce at the pitch never mint one).
  useEffect(() => {
    if (step !== "card" || clientSecret) return;
    let cancelled = false;
    (async () => {
      setLoadingIntent(true);
      setError(null);
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch("/api/vendor/billing/setup-intent", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.clientSecret) {
          throw new Error(json.message || json.error || "Could not start card setup");
        }
        if (!cancelled) setClientSecret(json.clientSecret);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Something went wrong. Please try again.");
      } finally {
        if (!cancelled) setLoadingIntent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, clientSecret, getAccessTokenSilently]);

  const handleSave = async () => {
    if (!stripe || !elements || !clientSecret) return;
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (result.error) {
      setError(result.error.message ?? "Could not save your card. Please try again.");
      setSubmitting(false);
      return;
    }

    // Card saved. The setup_intent.succeeded webhook attaches it to the
    // subscription server-side; refetch /api/vendor/me so the UI reflects it.
    setStep("done");
    setSubmitting(false);
    phCapture("paywall_card_captured", { variant });
    await qc.refetchQueries({ queryKey: ["/api/vendor/me"] });
    onCaptured?.();
  };

  if (step === "pitch") {
    return (
      <PaywallPitch
        variant={variant}
        daysLeft={daysLeft}
        trialEndsLabel={trialEndsLabel}
        onContinue={() => {
          phCapture("paywall_cta_clicked", { variant });
          setStep("card");
        }}
        onDismiss={onDone}
      />
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-4 py-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <div>
          <p className="font-semibold">You're all set</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your card is saved. Your Pro plan continues automatically after your free trial ends —
            you won't lose your listings, analytics, or the AI Assistant.
          </p>
        </div>
        <Button className="w-full" onClick={onDone}>Done</Button>
      </div>
    );
  }

  // step === "card"
  return (
    <div className="space-y-4">
      <div>
        <p className="font-heading text-lg font-semibold">Add a card to keep Pro</p>
        <p className="mt-1 text-sm text-muted-foreground">
          <strong>You won't be charged today</strong> — billing only starts when your trial ends
          {trialEndsLabel ? ` on ${trialEndsLabel}` : ""}, and you can cancel anytime before then.
        </p>
      </div>
      <div className="rounded-md border p-3">
        {loadingIntent ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing secure card form…
          </div>
        ) : (
          <CardElement
            options={{
              style: {
                base: { fontSize: "14px", color: "#1a1a1a", "::placeholder": { color: "#9ca3af" } },
              },
            }}
          />
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={submitting || loadingIntent || !stripe || !clientSecret}
          className="flex-1"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save card & keep Pro"}
        </Button>
        <Button variant="outline" onClick={onDone} disabled={submitting}>Not now</Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> Secured by Stripe. We never store your card details.
      </p>
    </div>
  );
}
