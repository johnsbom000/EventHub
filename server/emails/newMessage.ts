const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";

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

export interface NewMessageParams {
  recipientName: string;
  senderName: string;
  /** Event date for booking conversations. Omitted for pre-booking inquiries (no booking yet). */
  eventDate?: string | null;
  messagePreview: string;
  serverUrl: string;
  /** Set for booking conversations. Omitted for pre-booking inquiries. */
  bookingId?: string | null;
  /** Set for pre-booking inquiries so the customer deep-links back into the inquiry thread. */
  vendorAccountId?: string | null;
  recipientRole: "customer" | "vendor";
}

export function newMessageTemplate(params: NewMessageParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, senderName, eventDate, messagePreview, serverUrl, bookingId, vendorAccountId, recipientRole } = params;

  const conversationUrl = recipientRole === "vendor"
    ? bookingId
      ? `${serverUrl}/vendor/messages?bookingId=${encodeURIComponent(bookingId)}`
      : `${serverUrl}/vendor/messages`
    : bookingId
      ? `${serverUrl}/dashboard/messages?bookingId=${encodeURIComponent(bookingId)}`
      : vendorAccountId
        ? `${serverUrl}/dashboard/messages?vendorId=${encodeURIComponent(vendorAccountId)}`
        : `${serverUrl}/dashboard/messages`;

  const subject = `New message from ${senderName} on EventHub`;

  const preview = messagePreview.length > 200
    ? messagePreview.slice(0, 197) + "..."
    : messagePreview;

  const aboutHtml = eventDate
    ? `<strong>${senderName}</strong> sent you a message about your event on <strong>${eventDate}</strong>.`
    : `<strong>${senderName}</strong> sent you a message.`;
  const aboutText = eventDate
    ? `${senderName} sent you a message about your event on ${eventDate}:`
    : `${senderName} sent you a message:`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">New Message</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${aboutHtml}</p>
    <div style="background:#faf9f7;border-left:3px solid ${CORAL};padding:12px 16px;border-radius:4px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:#444;font-style:italic;">"${preview}"</p>
    </div>
    <a href="${conversationUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">View Conversation</a>
  `;

  const text = `New Message from ${senderName}\n\nHi ${recipientName},\n\n${aboutText}\n\n"${preview}"\n\nReply here: ${conversationUrl}`;

  return { subject, html: baseWrapper(body), text };
}
