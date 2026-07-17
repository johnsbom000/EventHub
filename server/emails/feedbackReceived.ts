const CORAL = "#E07A6A";
const SLATE = "#4A6A7D";
const BG = "#FAF9F7";
const TEXT = "#1C1C1C";
const AMBER = "#B45309";
const GREEN = "#15803D";

function baseWrapper(body: string, accent: string): string {
  return `
<div style="background:${BG};padding:40px 0;font-family:'DM Sans',Arial,sans-serif;color:${TEXT};">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:${accent};padding:28px 32px;">
      <span style="font-family:'Playfair Display',Georgia,serif;font-size:24px;color:#fff;font-weight:700;letter-spacing:0.5px;">EventHub</span>
    </div>
    <div style="padding:32px;">
      ${body}
    </div>
    <div style="padding:20px 32px;border-top:1px solid #f0eeec;text-align:center;">
      <p style="margin:0;font-size:12px;color:#999;">Internal alert — sent only to you because a user submitted feedback on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface FeedbackReceivedParams {
  /** 'feature_request' | 'bug_report' */
  type: "feature_request" | "bug_report";
  title: string;
  description: string;
  /** Who submitted it — 'customer' | 'vendor' */
  submitterRole: string;
  submitterName: string | null;
  submitterEmail: string | null;
  /** Optional uploaded attachment URL. */
  attachmentUrl?: string | null;
  /** ISO / display timestamp of submission. */
  submittedAt: string;
  /** Base app URL for the admin dashboard link. */
  serverUrl: string;
}

export function feedbackReceivedTemplate(params: FeedbackReceivedParams): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    type,
    title,
    description,
    submitterRole,
    submitterName,
    submitterEmail,
    attachmentUrl,
    submittedAt,
    serverUrl,
  } = params;

  const isBug = type === "bug_report";
  const accent = isBug ? AMBER : GREEN;
  const badgeBg = isBug ? "#FFFBEB" : "#F0FDF4";
  const badgeBorder = isBug ? "#FDE68A" : "#BBF7D0";
  const typeLabel = isBug ? "Bug Report" : "Feature Request";
  const emoji = isBug ? "🐛" : "💡";

  const subject = isBug
    ? `🐛 New bug report: ${title}`
    : `💡 New feature request: ${title}`;

  const submitter = submitterName || submitterEmail || "An EventHub user";
  const roleLabel = submitterRole === "vendor" ? "Vendor" : "Customer";
  const dashboardUrl = `${serverUrl}/admin/feedback`;

  const contactLine = submitterEmail
    ? `<a href="mailto:${submitterEmail}" style="color:${SLATE};text-decoration:none;font-weight:600;">${submitterEmail}</a>`
    : `<span style="color:#999;">no email on file</span>`;

  const attachmentBlock = attachmentUrl
    ? `<tr><td style="padding:8px 0;font-size:14px;color:#666;">Attachment</td><td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;"><a href="${attachmentUrl}" style="color:${SLATE};text-decoration:none;">View file</a></td></tr>`
    : "";

  const body = `
    <div style="background:${badgeBg};border:1px solid ${badgeBorder};border-radius:6px;padding:14px 18px;margin-bottom:24px;">
      <p style="margin:0;font-size:13px;color:${accent};font-weight:700;letter-spacing:0.3px;">${emoji} New ${typeLabel}</p>
    </div>
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};line-height:1.3;">${title}</h2>
    <div style="background:#F8F7F5;border-radius:6px;padding:16px 18px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">What they said</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#333;white-space:pre-wrap;">${description}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">From</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;font-weight:600;text-align:right;">${submitter} <span style="color:#999;font-weight:400;">(${roleLabel})</span></td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;color:#666;">Contact</td><td style="padding:8px 0;border-bottom:1px solid #f0eeec;font-size:14px;text-align:right;">${contactLine}</td></tr>
      <tr><td style="padding:8px 0;${attachmentBlock ? "border-bottom:1px solid #f0eeec;" : ""}font-size:14px;color:#666;">Submitted</td><td style="padding:8px 0;${attachmentBlock ? "border-bottom:1px solid #f0eeec;" : ""}font-size:14px;font-weight:600;text-align:right;">${submittedAt}</td></tr>
      ${attachmentBlock}
    </table>
    <a href="${dashboardUrl}" style="display:inline-block;background:${CORAL};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;">Open in Admin</a>
  `;

  const text = [
    `${emoji} New ${typeLabel}`,
    ``,
    title,
    ``,
    `What they said:`,
    description,
    ``,
    `From: ${submitter} (${roleLabel})`,
    `Contact: ${submitterEmail || "no email on file"}`,
    `Submitted: ${submittedAt}`,
    attachmentUrl ? `Attachment: ${attachmentUrl}` : "",
    ``,
    `Open in Admin: ${dashboardUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html: baseWrapper(body, accent), text };
}
