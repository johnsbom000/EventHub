const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function baseWrapper(body: string): string {
  return `
<div style="background:${BG};padding:40px 0;font-family:'DM Sans',Arial,sans-serif;color:${TEXT};">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:${CORAL};padding:28px 32px;">
      <span style="font-family:'Playfair Display',Georgia,serif;font-size:24px;color:#fff;font-weight:700;letter-spacing:0.5px;">EventHub</span>
    </div>
    <div style="padding:32px;">
      ${body}
    </div>
    <div style="padding:20px 32px;border-top:1px solid #f0eeec;text-align:center;">
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have a booking on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface BookingConfirmedParams {
  recipientName: string;
  counterpartName: string;
  eventDate: string;
  listingTitle: string;
  totalAmountCents: number;
  role: "customer" | "vendor";
  serverUrl: string;
  addOns?: Array<{ title: string; priceCents: number }>;
  // Vendor-only payout breakdown. When the vendor bears Stripe's processing fee,
  // pass the estimated fee and their resulting net payout so the email shows the
  // deduction transparently. Omitted (or fee <= 0) => no breakdown is rendered.
  stripeProcessingFeeCents?: number;
  vendorNetPayoutCents?: number;
}

export function bookingConfirmedTemplate(params: BookingConfirmedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, counterpartName, eventDate, listingTitle, totalAmountCents, role, serverUrl, addOns } = params;
  const dashboardUrl = role === "vendor"
    ? `${serverUrl}/vendor/bookings`
    : `${serverUrl}/dashboard/events`;

  const intro =
    role === "customer"
      ? `Your booking with <strong>${counterpartName}</strong> has been confirmed.`
      : `You confirmed a booking from <strong>${counterpartName}</strong>.`;

  const subject = role === "customer"
    ? "Your EventHub booking is confirmed"
    : "EventHub: Booking confirmed";

  // Vendor payout breakdown: show the booking total, Stripe's processing fee
  // deduction, and the resulting net payout. Only when the vendor bears the fee
  // (fee > 0 and a net payout is supplied) — otherwise fall back to a plain Total.
  const feeCents = Math.max(0, Math.round(params.stripeProcessingFeeCents ?? 0));
  const showVendorPayout =
    role === "vendor" && feeCents > 0 && typeof params.vendorNetPayoutCents === "number";
  const netPayoutCents = Math.max(0, Math.round(params.vendorNetPayoutCents ?? 0));

  const totalsRows = showVendorPayout
    ? `
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Booking total</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${formatCents(totalAmountCents)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Stripe Processing Fee</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;text-align:right;color:#666;">− ${formatCents(feeCents)}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Your net payout</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${CORAL};">${formatCents(netPayoutCents)}</td></tr>`
    : `<tr><td style="padding:8px 0;font-size:14px;color:#666;">Total</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${CORAL};">${formatCents(totalAmountCents)}</td></tr>`;

  const payoutNote = showVendorPayout
    ? `<p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#999;">EventHub takes no commission. The only deduction is Stripe's standard payment-processing fee (2.9% + $0.30) for handling the card payment. This is an estimate — your final payout reflects Stripe's actual fee.</p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Booking Confirmed</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${payoutNote ? "12px" : "24px"};">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      ${(addOns ?? []).map(a => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">${a.title}</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;text-align:right;">${formatCents(a.priceCents)}</td></tr>`).join("")}
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      ${totalsRows}
    </table>
    ${payoutNote}
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Booking</a>
  `;

  const addonLines = (addOns ?? []).map(a => `${a.title}: ${formatCents(a.priceCents)}`).join("\n");
  const totalsText = showVendorPayout
    ? `Booking total: ${formatCents(totalAmountCents)}\nStripe Processing Fee: - ${formatCents(feeCents)}\nYour net payout: ${formatCents(netPayoutCents)}\n\nEventHub takes no commission. The only deduction is Stripe's standard payment-processing fee (2.9% + $0.30). This is an estimate — your final payout reflects Stripe's actual fee.`
    : `Total: ${formatCents(totalAmountCents)}`;
  const text = `Booking Confirmed\n\nHi ${recipientName},\n\n${role === "customer" ? `Your booking with ${counterpartName} has been confirmed.` : `You confirmed a booking from ${counterpartName}.`}\n\nService: ${listingTitle}${addonLines ? "\n" + addonLines : ""}\nEvent Date: ${eventDate}\n${totalsText}\n\nView your booking: ${dashboardUrl}`;

  return { subject, html: baseWrapper(body), text };
}
