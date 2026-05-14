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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you completed vendor onboarding on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface VendorWelcomeParams {
  recipientName: string;
  businessName: string;
  serverUrl: string;
}

export function vendorWelcomeTemplate(params: VendorWelcomeParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, businessName, serverUrl } = params;

  const subject = `Welcome to EventHub, ${businessName}!`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">You're live on EventHub</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
      Welcome to EventHub! Your vendor account for <strong>${businessName}</strong> is set up and ready to go.
      Customers in your area can now find and book your services.
    </p>
    <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:${SLATE};">Your next steps:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;">
          <strong style="color:${CORAL};">1.</strong>&nbsp; Create your first listing
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;">
          <strong style="color:${CORAL};">2.</strong>&nbsp; Add photos and a detailed description
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;">
          <strong style="color:${CORAL};">3.</strong>&nbsp; Connect your bank account to receive payouts
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;">
          <strong style="color:${CORAL};">4.</strong>&nbsp; Respond to booking requests quickly — fast responses get more bookings
        </td>
      </tr>
    </table>
    <a href="${serverUrl}/vendor/dashboard" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Go to Your Dashboard</a>
  `;

  const text = [
    `You're live on EventHub`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Welcome to EventHub! Your vendor account for ${businessName} is set up and ready to go.`,
    ``,
    `Your next steps:`,
    `1. Create your first listing`,
    `2. Add photos and a detailed description`,
    `3. Connect your bank account to receive payouts`,
    `4. Respond to booking requests quickly`,
    ``,
    `Go to your dashboard: ${serverUrl}/vendor/dashboard`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
