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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have a vendor account on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface CompRevokedParams {
  recipientName: string;
  businessName: string;
  serverUrl: string;
}

export function compRevokedTemplate(params: CompRevokedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, businessName, serverUrl } = params;

  const subject = `Your launch spot was released — you're now on the Free plan`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Your launch spot was released</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
      The 6 months of free Pro you claimed for <strong>${businessName}</strong> required publishing your first listing
      within 7 days of signing up. That window has passed without a published listing, so your spot has been released
      to the next vendor in line.
    </p>
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${SLATE};">What this means:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;line-height:1.5;">
          Your account is now on the <strong>Free plan</strong> — nothing was deleted, and you can still publish
          <strong>1 active listing</strong> and take bookings.
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;line-height:1.5;">
          <strong>Nothing will ever be charged</strong> unless you choose to upgrade.
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;line-height:1.5;">
          Want Pro back (unlimited listings, analytics, Google Calendar sync)? You can
          <strong>upgrade anytime</strong> from your dashboard.
        </td>
      </tr>
    </table>
    <a href="${serverUrl}/vendor/dashboard" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Go to My Dashboard</a>
  `;

  const text = [
    `Your launch spot was released`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `The 6 months of free Pro you claimed for ${businessName} required publishing your first listing within 7 days of signing up. That window has passed without a published listing, so your spot has been released to the next vendor in line.`,
    ``,
    `What this means:`,
    `• Your account is now on the Free plan — nothing was deleted, and you can still publish 1 active listing and take bookings.`,
    `• Nothing will ever be charged unless you choose to upgrade.`,
    `• Want Pro back (unlimited listings, analytics, Google Calendar sync)? You can upgrade anytime from your dashboard.`,
    ``,
    `Go to your dashboard: ${serverUrl}/vendor/dashboard`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
