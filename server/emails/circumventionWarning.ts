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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you have an account on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface CircumventionWarningParams {
  recipientName: string;
  warningNumber: 1 | 2 | 3;
  flaggedMessageSnippet?: string;
  serverUrl: string;
}

export function circumventionWarningTemplate(params: CircumventionWarningParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { recipientName, warningNumber, flaggedMessageSnippet, serverUrl } = params;

  const subject = warningNumber === 3
    ? "EventHub: Final warning — account at risk of suspension"
    : `EventHub: Policy warning (${warningNumber} of 3)`;

  const isFinal = warningNumber === 3;

  const bannerColor = isFinal ? "#fef2f2" : "#fff8f0";
  const bannerBorder = isFinal ? "#dc2626" : CORAL;
  const bannerTextColor = isFinal ? "#991b1b" : "#b45309";
  const bannerMessage = isFinal
    ? "This is your final warning. Another violation will result in immediate account suspension."
    : `Warning ${warningNumber} of 3. A third violation will result in account suspension.`;

  const snippetBlock = flaggedMessageSnippet
    ? `<div style="background:#f9f9f9;border-left:3px solid #ddd;padding:12px 16px;border-radius:4px;margin:16px 0;font-size:14px;color:#555;font-style:italic;">"${flaggedMessageSnippet}"</div>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Policy Violation Warning</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${recipientName},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Our system detected a message that appears to direct a customer to communicate or pay outside of EventHub. This violates our platform policy.
    </p>
    ${snippetBlock}
    <div style="background:${bannerColor};border-left:3px solid ${bannerBorder};padding:12px 16px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:${bannerTextColor};font-weight:600;">${bannerMessage}</p>
    </div>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555;">
      All communication and payments must go through EventHub to protect both you and your customers.
      Off-platform transactions are not covered by our dispute resolution or payment protection.
    </p>
    <a href="${serverUrl}/vendor/messages" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Review Your Messages</a>
  `;

  const text = [
    `Policy Violation Warning`,
    ``,
    `Hi ${recipientName},`,
    ``,
    `Our system flagged a message that appears to direct communication or payment outside of EventHub.`,
    ``,
    flaggedMessageSnippet ? `Flagged content: "${flaggedMessageSnippet}"` : "",
    ``,
    bannerMessage,
    ``,
    `All communication and payments must stay on EventHub to protect you and your customers.`,
    ``,
    `Review your messages: ${serverUrl}/vendor/messages`,
  ].filter(line => line !== undefined).join("\n");

  return { subject, html: baseWrapper(body), text };
}
