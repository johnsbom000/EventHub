import { Fragment } from "react";
import { Check, ChevronRight, Bell, CalendarDays, Star, ShieldCheck, Minus } from "lucide-react";

/**
 * Paywall A/B test variants (1a–1e) for the reverse-trial "keep Pro" modal.
 *
 * All five share the SAME offer ($29/mo or $290/yr) and the SAME underlying card
 * capture (Stripe SetupIntent, wired by KeepProModal) — only the presentation /
 * persuasion strategy differs, so the test isolates presentation, not price.
 * Assigned independently of the landing variant via a PostHog flag.
 *
 * Ported from the design handoff, adapted to render as modal content over the
 * real dashboard (mockup phone/browser chrome dropped) and corrected so nothing
 * fabricated ships to real vendors: no invented vendor counts / ratings, real Pro
 * feature names only, the true free-tier cap (1 active listing), and one real
 * testimonial. `onContinue` advances to the shared card-entry step; `onDismiss`
 * closes the modal (moves the vendor to the free "Starter" plan at trial end).
 */

export type PaywallVariantKey = "1a" | "1b" | "1c" | "1d" | "1e";
export const PAYWALL_VARIANTS: PaywallVariantKey[] = ["1a", "1b", "1c", "1d", "1e"];

export interface PaywallPitchProps {
  daysLeft: number;
  /** Human date the trial ends, e.g. "August 21". */
  trialEndsLabel: string | null;
  onContinue: () => void;
  onDismiss: () => void;
}

// ── Design tokens (mirror EventHub's DS; used inline for pixel fidelity) ───────
const T = "hsl(202 26% 39%)"; // primary teal
const TF = "hsl(37 39% 94%)"; // primary-foreground cream
const CORAL = "hsl(8 66% 65%)";
const MINT = "hsl(171 39% 72%)";
const GOLD = "hsl(34 47% 55%)";
const INK = "hsl(209 34% 13%)";
const MUTED = "hsl(198 18% 50%)";
const MUTED2 = "hsl(198 18% 46%)";
const SURF = "hsl(37 30% 96%)";
const HEAD = "'Cormorant Garamond', Georgia, serif";
const CTA_SHADOW = "0 6px 16px -6px hsl(202 26% 39% / .6)";

const trialEnds = (label: string | null) => label ?? "when your trial ends";

// Struck-through pre-discount list price. The launch offer permanently discounts
// $39→$29 / $390→$290, so anchoring on the list price is truthful.
function Was({ price }: { price: string }) {
  return <span style={{ textDecoration: "line-through", color: MUTED, fontWeight: 400 }}>{price}</span>;
}

// Shared primary CTA (full-width, right-chevron — a deliberate, research-backed
// detail from the handoff). Keep the "Cancel anytime · Nothing charged today"
// subtitle where the design has it.
function CTA({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: T, color: TF, border: "none", borderRadius: 10, padding: "16px 20px",
        cursor: "pointer", boxShadow: CTA_SHADOW, fontWeight: 600, fontSize: 16,
      }}
    >
      {label}
      <ChevronRight size={18} strokeWidth={2.6} />
    </button>
  );
}

function Ghost({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, fontSize: 14 }}
    >
      {label}
    </button>
  );
}

function Subtitle({ text }: { text: string }) {
  return <p style={{ textAlign: "center", fontSize: 13, color: MUTED, margin: "12px 0 0" }}>{text}</p>;
}

// The real top-3 Pro benefits (used across variants for the persuasion copy).
const TOP_BENEFITS: { name: string; blurb: string }[] = [
  { name: "Unlimited listings", blurb: "list every package, venue and add-on" },
  { name: "Advanced Analytics", blurb: "see views, leads and which packages convert" },
  { name: "AI Assistant", blurb: "auto-drafts replies to every lead in seconds" },
  { name: "Google Calendar sync", blurb: "bookings land on your calendar automatically" },
  { name: "Review replies", blurb: "respond to every review from one place" },
];

// ── 1a · Trial Timeline (risk reduction) ──────────────────────────────────────
function PaywallTimeline({ daysLeft, trialEndsLabel, onContinue, onDismiss }: PaywallPitchProps) {
  const node = (icon: React.ReactNode, filled: boolean, title: string, body: React.ReactNode) => (
    <div style={{ position: "relative" }}>
      <span style={{
        position: "absolute", left: -34, top: 0, width: 26, height: 26, borderRadius: "50%",
        background: filled ? T : "#fff", border: filled ? "none" : `2px solid ${MINT}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{icon}</span>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
  return (
    <div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "hsl(171 39% 72% / .3)", color: "hsl(202 26% 32%)", fontSize: 13, fontWeight: 600, padding: "7px 13px", borderRadius: 999 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD }} />
        {daysLeft} {daysLeft === 1 ? "day" : "days"} left in your Pro trial
      </span>
      <h2 style={{ fontFamily: HEAD, fontWeight: 600, fontSize: "clamp(24px, 5.5vw, 32px)", lineHeight: 1.12, letterSpacing: "-0.4px", margin: "16px 0 8px" }}>
        Keep the tools that are winning you bookings.
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: MUTED2, margin: "0 0 26px" }}>
        Your Pro trial ends soon. Here's exactly what happens next — no surprises.
      </p>
      <div style={{ position: "relative", paddingLeft: 34, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ position: "absolute", left: 12, top: 8, bottom: 8, width: 2, background: `linear-gradient(${MINT}, hsl(203 26% 39% / .25))` }} />
        {node(<Check size={14} color={TF} strokeWidth={3} />, true, "Today · full Pro access",
          <>Unlimited listings, analytics and the AI Assistant — <strong style={{ color: INK }}>$0 charged now.</strong></>)}
        {node(<Bell size={13} color={T} strokeWidth={2.2} />, false, "Before it ends · we'll remind you",
          "An email and push notice 3 days before billing. Cancel in one tap.")}
        {node(<CalendarDays size={13} color={MUTED} strokeWidth={2.2} />, false, `${trialEnds(trialEndsLabel)} · your trial ends`,
          <>Continue for <Was price="$39" /> <strong style={{ color: INK }}>$29/mo</strong>, or move to Free — your choice.</>)}
      </div>
      <div style={{ marginTop: 30 }}>
        <CTA label="Keep EventHub Pro" onClick={onContinue} />
        <Subtitle text="Cancel anytime · Nothing charged today" />
        <p style={{ textAlign: "center", margin: "16px 0 0" }}><Ghost label="Remind me later" onClick={onDismiss} /></p>
      </div>
    </div>
  );
}

// ── 1b · Comparison Table (loss framing) ──────────────────────────────────────
function PaywallComparison({ daysLeft, trialEndsLabel, onContinue, onDismiss }: PaywallPitchProps) {
  const rows: [string, string, React.ReactNode][] = [
    ["Active listings", "1", <strong style={{ fontSize: 13 }}>Unlimited</strong>],
    ["Booking analytics", "Basic", <strong style={{ fontSize: 13 }}>Advanced</strong>],
    ["AI Assistant replies", "", <Check size={16} color={T} strokeWidth={2.6} style={{ display: "inline" }} />],
    ["Google Calendar sync", "", <Check size={16} color={T} strokeWidth={2.6} style={{ display: "inline" }} />],
  ];
  const cell: React.CSSProperties = { padding: "12px 12px", textAlign: "center", borderTop: "1px solid hsl(203 26% 39% / .12)" };
  return (
    <div>
      <div style={{ textAlign: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "hsl(8 66% 65% / .14)", color: "hsl(8 55% 48%)", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999 }}>
          TRIAL ENDS IN {daysLeft} {daysLeft === 1 ? "DAY" : "DAYS"}
        </span>
        <h2 style={{ fontFamily: HEAD, fontWeight: 600, fontSize: "clamp(23px, 5.5vw, 32px)", letterSpacing: "-0.4px", margin: "14px 0 6px" }}>
          Here's what changes {trialEndsLabel ? `on ${trialEndsLabel}` : "when your trial ends"}.
        </h2>
        <p style={{ fontSize: 14.5, color: MUTED2, margin: "0 0 18px", lineHeight: 1.5 }}>
          Keep Pro and nothing changes. Move to Free and you'll lose the highlighted tools.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", border: "1px solid hsl(203 26% 39% / .16)", borderRadius: 12, overflow: "hidden", fontSize: 14 }}>
        <div style={{ padding: "12px 16px", background: "hsl(37 30% 97%)" }} />
        <div style={{ padding: "12px", textAlign: "center", fontWeight: 600, color: "hsl(198 18% 45%)", background: "hsl(37 30% 97%)" }}>Free</div>
        <div style={{ padding: "12px", textAlign: "center", fontWeight: 700, color: TF, background: T }}>Pro</div>
        {rows.map(([label, free, pro], i) => (
          <Fragment key={i}>
            <div style={{ padding: "12px 16px", borderTop: "1px solid hsl(203 26% 39% / .12)" }}>{label}</div>
            <div style={{ ...cell, color: MUTED }}>{free || <Minus size={15} color="hsl(198 18% 62%)" strokeWidth={2.4} style={{ display: "inline" }} />}</div>
            <div style={{ ...cell, background: "hsl(171 39% 72% / .16)" }}>{pro}</div>
          </Fragment>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginTop: 22, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: HEAD }}>
            <Was price="$390" /> $290<span style={{ fontSize: 15, color: MUTED, fontWeight: 400, fontFamily: "inherit" }}>/yr</span>
          </div>
          <div style={{ fontSize: 12.5, color: MUTED }}>Just $24/mo, billed yearly · or <Was price="$39" /> $29 monthly</div>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Ghost label="Move to Free" onClick={onDismiss} />
          <div style={{ minWidth: 160 }}><CTA label="Stay on Pro" onClick={onContinue} /></div>
        </div>
      </div>
    </div>
  );
}

// ── 1c · Outcome & Anchor (value framing + price anchoring + testimonial) ──────
function PaywallOutcome({ onContinue, onDismiss }: PaywallPitchProps) {
  return (
    <div>
      <div style={{ background: T, color: TF, borderRadius: 16, padding: "28px 24px", textAlign: "center", margin: "0 0 22px" }}>
        <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: "clamp(46px, 12vw, 64px)", lineHeight: 0.95, letterSpacing: "-1px" }}>
          $0.95<span style={{ fontSize: "0.47em" }}>/day</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, marginTop: 6, color: "hsl(171 60% 85%)" }}>for the tools that win you bookings</div>
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "hsl(37 39% 94% / .82)", margin: "12px auto 0", maxWidth: 380 }}>
          Keep unlimited listings, Advanced Analytics and the AI Assistant working for you.
        </p>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: HEAD, fontSize: "clamp(30px, 8vw, 40px)", fontWeight: 600, letterSpacing: "-0.5px", display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10 }}>
          <span style={{ fontSize: "0.6em", color: MUTED, fontWeight: 400, textDecoration: "line-through" }}>$39</span>
          <span>$29<span style={{ fontSize: "0.45em", color: MUTED, fontWeight: 400, fontFamily: "inherit" }}>/month</span></span>
        </div>
        <div style={{ fontSize: 14.5, color: MUTED2, marginTop: 2 }}>Launch price — less than <strong style={{ color: INK }}>one booking</strong>, about $0.95 a day.</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, color: MUTED, border: "1px solid hsl(203 26% 39% / .2)", padding: "6px 11px", borderRadius: 999 }}>≈ a coffee</span>
          <span style={{ fontSize: 12.5, color: MUTED, border: "1px solid hsl(203 26% 39% / .2)", padding: "6px 11px", borderRadius: 999 }}>or $290/yr — save $58</span>
        </div>
      </div>
      <div style={{ marginTop: 22, background: SURF, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", gap: 3, color: GOLD }}>
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={16} fill="currentColor" strokeWidth={0} />)}
        </div>
        <p style={{ margin: "10px 0 12px", fontFamily: HEAD, fontSize: 18, fontStyle: "italic", lineHeight: 1.45, color: "hsl(209 34% 18%)" }}>
          "My side hustle was never this hands off before."
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", background: MINT, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13, color: "hsl(202 26% 32%)" }}>BJ</span>
          <div style={{ fontSize: 12.5 }}><div style={{ fontWeight: 600 }}>B. Johnson</div><div style={{ color: MUTED }}>EventHub vendor</div></div>
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        <CTA label="Continue with Pro" onClick={onContinue} />
        <Subtitle text="Cancel anytime · Keep every booking you've won" />
        <p style={{ textAlign: "center", margin: "12px 0 0" }}><Ghost label="Move to Free" onClick={onDismiss} /></p>
      </div>
    </div>
  );
}

// ── 1d · Pay Ramp (frictionless, single action) ───────────────────────────────
function PaywallPayRamp({ trialEndsLabel, onContinue, onDismiss }: PaywallPitchProps) {
  return (
    <div style={{ textAlign: "center", padding: "12px 8px" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T, fontWeight: 600, background: "hsl(171 39% 72% / .28)", padding: "7px 14px", borderRadius: 999 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "hsl(171 45% 45%)" }} />
        Your Pro trial is active
      </div>
      <h2 style={{ fontFamily: HEAD, fontWeight: 600, fontSize: "clamp(28px, 7.5vw, 42px)", letterSpacing: "-1px", lineHeight: 1.05, margin: "14px auto 0", maxWidth: 460 }}>
        Keep Pro on your account.
      </h2>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: MUTED2, margin: "16px auto 0", maxWidth: 440 }}>
        No forms, no decisions today. Unlimited listings, Advanced Analytics and the AI Assistant stay exactly where they are.
      </p>
      <div style={{ marginTop: 30, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
        <CTA label="Keep my Pro benefits" onClick={onContinue} />
      </div>
      <p style={{ fontSize: 13.5, color: MUTED, margin: "16px auto 0", maxWidth: 420, lineHeight: 1.5 }}>
        Free until {trialEnds(trialEndsLabel)}, then <Was price="$39" /> $29/mo. Cancel anytime in one tap — we'll remind you first.
      </p>
      <p style={{ marginTop: 20 }}><Ghost label="Move to the free plan" onClick={onDismiss} /></p>
    </div>
  );
}

// ── 1e · Long-form Squeeze (dense, day-30 last chance) ─────────────────────────
function PaywallSqueeze({ onContinue, onDismiss }: PaywallPitchProps) {
  const bullet = (name: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, lineHeight: 1.4 }}>
      <Check size={15} color="hsl(171 45% 40%)" strokeWidth={3} style={{ flexShrink: 0 }} />
      <span style={{ fontWeight: 600 }}>{name}</span>
    </div>
  );
  return (
    <div>
      <div style={{ background: CORAL, color: "#fff", textAlign: "center", fontSize: 13, fontWeight: 600, padding: 9, borderRadius: 10, letterSpacing: ".2px", margin: "0 0 18px" }}>
        Your Pro trial ends today — don't lose your data
      </div>
      <h2 style={{ fontFamily: HEAD, fontWeight: 600, fontSize: "clamp(23px, 5.5vw, 30px)", lineHeight: 1.1, letterSpacing: "-0.3px", margin: "0 0 8px" }}>
        Keep everything you built.
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: MUTED2, margin: "0 0 18px" }}>
        If you switch to Free you keep just <strong style={{ color: INK }}>1 active listing</strong> — you'll lose your analytics history and the AI Assistant.<br />
        Continue with Pro and keep it all!
      </p>
      <div style={{ border: `2px solid ${T}`, borderRadius: 14, padding: "14px 16px", background: "hsl(37 30% 97%)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: HEAD, fontSize: 24, fontWeight: 400, color: MUTED, textDecoration: "line-through" }}>$390</span>
          <span style={{ fontFamily: HEAD, fontSize: 34, fontWeight: 700, color: "hsl(202 26% 34%)" }}>$290</span>
          <span style={{ fontSize: 13, color: MUTED }}>/year</span>
          <span style={{ marginLeft: "auto", background: "hsl(171 45% 45%)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 8px", borderRadius: 6 }}>SAVE $100</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Just $24/mo billed yearly · or <Was price="$39" /> $29/mo — cancel anytime.</div>
      </div>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "hsl(198 18% 45%)" }}>Everything you keep</div>
        {TOP_BENEFITS.map((b) => <div key={b.name}>{bullet(b.name)}</div>)}
      </div>
      <div style={{ marginTop: 16, borderTop: "1px solid hsl(203 26% 39% / .14)", paddingTop: 14 }}>
        <div style={{ display: "flex", gap: 3, color: GOLD }}>
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={13} fill="currentColor" strokeWidth={0} />)}
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.45, color: MUTED2, margin: "8px 0 0", fontStyle: "italic" }}>
          "My side hustle was never this hands off before." — B. Johnson
        </p>
      </div>
      <div style={{ marginTop: 16 }}>
        <CTA label="Keep EventHub Pro" onClick={onContinue} />
        <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textAlign: "center", fontSize: 12, color: MUTED, margin: "9px 0 0" }}>
          <ShieldCheck size={13} /> Cancel anytime · Nothing charged today
        </p>
        <p style={{ textAlign: "center", margin: "10px 0 0" }}><Ghost label="Move to the free plan instead" onClick={onDismiss} /></p>
      </div>
      <div style={{ marginTop: 16, borderTop: "1px solid hsl(203 26% 39% / .14)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5 }}><strong>Can I cancel?</strong> <span style={{ color: MUTED2 }}>Yes, anytime in Settings — it takes one tap.</span></div>
        <div style={{ fontSize: 12.5 }}><strong>Do I keep my data?</strong> <span style={{ color: MUTED2 }}>Every listing and message stays exactly as it is.</span></div>
      </div>
    </div>
  );
}

const REGISTRY: Record<PaywallVariantKey, (p: PaywallPitchProps) => JSX.Element> = {
  "1a": PaywallTimeline,
  "1b": PaywallComparison,
  "1c": PaywallOutcome,
  "1d": PaywallPayRamp,
  "1e": PaywallSqueeze,
};

/** Renders the pitch screen for the given paywall variant (defaults to 1a). */
export function PaywallPitch({ variant, ...props }: { variant: string } & PaywallPitchProps) {
  const key = (PAYWALL_VARIANTS.includes(variant as PaywallVariantKey) ? variant : "1a") as PaywallVariantKey;
  const Component = REGISTRY[key];
  return <Component {...props} />;
}
