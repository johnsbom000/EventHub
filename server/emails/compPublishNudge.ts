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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have complimentary Pro on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface CompPublishNudgeParams {
  recipientName: string;
  businessName: string;
  daysLeft: number;
  deadline: Date;
  graceApplied: boolean;
  serverUrl: string;
}

export function compPublishNudgeTemplate(params: CompPublishNudgeParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, businessName, daysLeft, deadline, graceApplied, serverUrl } = params;
  const dayLabel = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  const deadlineLabel = deadline.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const subject = `Publish a listing in the next ${dayLabel} to keep your 6 months of free Pro`;

  const graceNote = graceApplied
    ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:${SLATE};">
        Because you've started setting up your payment account, we've added 3 extra days to your deadline so Stripe has time to finish verifying you.
      </p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Don't lose your launch spot</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">
      You claimed one of our 50 launch spots — <strong>6 months of Pro, free</strong> — for <strong>${businessName}</strong>.
      To keep it, publish your first listing by <strong>${deadlineLabel}</strong> (${dayLabel} from now).
      If no listing is published by then, your spot is released to the next vendor in line and your account moves to the Free plan.
    </p>
    ${graceNote}
    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${SLATE};">Publishing takes three steps:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;line-height:1.5;">
          <strong>1. Complete your vendor profile</strong> — business details, photos, and address.
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0eeec;font-size:14px;line-height:1.5;">
          <strong>2. Set up payments</strong> — connect Stripe so customers can book you.
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;line-height:1.5;">
          <strong>3. Publish your listing</strong> — hit Publish and you're live. Your 6 months of Pro is locked in.
        </td>
      </tr>
    </table>
    <a href="${serverUrl}/vendor/dashboard" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Publish My First Listing</a>
  `;

  const text = [
    `Don't lose your launch spot`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `You claimed one of our 50 launch spots — 6 months of Pro, free — for ${businessName}. To keep it, publish your first listing by ${deadlineLabel} (${dayLabel} from now). If no listing is published by then, your spot is released to the next vendor in line and your account moves to the Free plan.`,
    ...(graceApplied
      ? [
          ``,
          `Because you've started setting up your payment account, we've added 3 extra days to your deadline so Stripe has time to finish verifying you.`,
        ]
      : []),
    ``,
    `Publishing takes three steps:`,
    `1. Complete your vendor profile — business details, photos, and address.`,
    `2. Set up payments — connect Stripe so customers can book you.`,
    `3. Publish your listing — hit Publish and you're live. Your 6 months of Pro is locked in.`,
    ``,
    `Publish your first listing: ${serverUrl}/vendor/dashboard`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
