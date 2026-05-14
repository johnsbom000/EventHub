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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have a pending booking request on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export type ReminderCadence = "6pm" | "9am" | "24h";

export interface PendingRequestReminderParams {
  recipientName: string;
  customerName: string;
  listingTitle: string;
  eventDate: string;
  totalAmountCents: number;
  cadence: ReminderCadence;
  serverUrl: string;
}

export function pendingRequestReminderTemplate(params: PendingRequestReminderParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, customerName, listingTitle, eventDate, totalAmountCents, cadence, serverUrl } = params;

  const cadenceLabel: Record<ReminderCadence, string> = {
    "6pm": "this evening",
    "9am": "this morning",
    "24h": "24 hours ago",
  };

  const subject = `EventHub: Still waiting on your response — booking request from ${customerName}`;

  const urgencyMessage: Record<ReminderCadence, string> = {
    "6pm": "You still have time to respond today. Customers are more likely to book when vendors respond quickly.",
    "9am": "Good morning — don't let this request go stale. Responding early in the day keeps customers engaged.",
    "24h": "This request has been waiting 24 hours. Customers who don't hear back often look elsewhere.",
  };

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Pending Booking Request</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      <strong>${customerName}</strong> sent you a booking request <strong>${cadenceLabel[cadence]}</strong> and is still waiting for your response.
    </p>
    <div style="background:#fff8f0;border-left:3px solid ${CORAL};padding:12px 16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#b45309;font-weight:600;">${urgencyMessage[cadence]}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Service</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${listingTitle}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Event Date</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${eventDate}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#666;">Total</td><td style="padding:8px 0;font-size:14px;font-weight:700;text-align:right;color:${CORAL};">${formatCents(totalAmountCents)}</td></tr>
    </table>
    <a href="${serverUrl}/vendor/bookings" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Confirm or Decline</a>
  `;

  const text = [
    `Pending Booking Request`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `${customerName} sent you a booking request ${cadenceLabel[cadence]} and is waiting for your response.`,
    ``,
    urgencyMessage[cadence],
    ``,
    `Service: ${listingTitle}`,
    `Event Date: ${eventDate}`,
    `Total: ${formatCents(totalAmountCents)}`,
    ``,
    `Confirm or decline: ${serverUrl}/vendor/bookings`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
