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

export interface BookingRequestedParams {
  recipientName: string;
  counterpartName: string;
  eventDate: string;
  listingTitle: string;
  totalAmountCents: number;
  role: "customer" | "vendor";
  isInstant: boolean;
  serverUrl: string;
  addOns?: Array<{ title: string; priceCents: number }>;
  packageName?: string | null;
  outsideServiceRadius?: boolean | null;
  feeLabel?: "delivery fee" | "travel fee";
  basePriceCents?: number | null;
  deliveryFeeAmountCents?: number | null;
  setupFeeAmountCents?: number | null;
  travelFeeAmountCents?: number | null;
  discountAmountCents?: number | null;
  serviceFeeAmountCents?: number | null;
  securityDepositCents?: number | null;
}

export function bookingRequestedTemplate(params: BookingRequestedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, counterpartName, eventDate, listingTitle, totalAmountCents, role, isInstant, serverUrl, addOns } = params;

  const dashboardUrl = role === "vendor"
    ? `${serverUrl}/vendor/bookings`
    : `${serverUrl}/dashboard/events`;

  const subject = role === "customer"
    ? isInstant
      ? "Your EventHub booking is confirmed"
      : "EventHub: Booking request sent"
    : isInstant
      ? "EventHub: New instant booking"
      : "EventHub: New booking request";

  const heading = role === "customer"
    ? isInstant ? "Booking Confirmed" : "Booking Request Sent"
    : isInstant ? "New Instant Booking" : "New Booking Request";

  const intro = role === "customer"
    ? isInstant
      ? `Your booking with <strong>${counterpartName}</strong> is confirmed. No action needed.`
      : `Your booking request with <strong>${counterpartName}</strong> has been sent. You'll hear back once they confirm.`
    : isInstant
      ? `You have a new instant booking from <strong>${counterpartName}</strong>. No action needed — it's confirmed.`
      : `You have a new booking request from <strong>${counterpartName}</strong>. Please confirm or decline from your dashboard.`;

  const urgencyBanner = role === "vendor" && !isInstant
    ? `<div style="background:#fff8f0;border-left:3px solid ${CORAL};padding:12px 16px;border-radius:4px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#b45309;font-weight:600;">Action required — please accept or decline within 7 days. If no response is received, the booking will be automatically cancelled and the customer refunded.</p>
      </div>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">${heading}</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    ${urgencyBanner}
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      ${(addOns ?? []).map(a => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">${a.title}</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;text-align:right;">${formatCents(a.priceCents)}</td></tr>`).join("")}
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Total</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${CORAL};">${formatCents(totalAmountCents)}</td></tr>
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">${role === "vendor" && !isInstant ? "View & Respond" : "View Booking"}</a>
  `;

  const text = [
    `${heading}`,
    ``,
    `Hi ${recipientName},`,
    ``,
    role === "customer"
      ? isInstant
        ? `Your booking with ${counterpartName} is confirmed.`
        : `Your booking request with ${counterpartName} has been sent.`
      : isInstant
        ? `New instant booking from ${counterpartName}.`
        : `New booking request from ${counterpartName}. Please accept or decline within 7 days or the booking will be automatically cancelled.`,
    ``,
    `Service: ${listingTitle}`,
    ...(addOns ?? []).map(a => `${a.title}: ${formatCents(a.priceCents)}`),
    `Event Date: ${eventDate}`,
    `Total: ${formatCents(totalAmountCents)}`,
    ``,
    `View booking: ${dashboardUrl}`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
