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
}

export function bookingConfirmedTemplate(params: BookingConfirmedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, counterpartName, eventDate, listingTitle, totalAmountCents, role, serverUrl } = params;
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

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Booking Confirmed</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Total</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${CORAL};">${formatCents(totalAmountCents)}</td></tr>
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Booking</a>
  `;

  const text = `Booking Confirmed\n\nHi ${recipientName},\n\n${role === "customer" ? `Your booking with ${counterpartName} has been confirmed.` : `You confirmed a booking from ${counterpartName}.`}\n\nService: ${listingTitle}\nEvent Date: ${eventDate}\nTotal: ${formatCents(totalAmountCents)}\n\nView your booking: ${dashboardUrl}`;

  return { subject, html: baseWrapper(body), text };
}
