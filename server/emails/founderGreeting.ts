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
      <p style="margin:0;font-size:12px;color:#999;">© EventHub. You received this because you created an account on EventHub.</p>
    </div>
  </div>
</div>`.trim();
}

export interface FounderGreetingParams {
  /** Recipient's first name; omit for the generic greeting. */
  recipientName?: string | null;
}

export function founderGreetingTemplate(params: FounderGreetingParams = {}): {
  subject: string;
  html: string;
  text: string;
} {
  const name = params.recipientName?.trim();
  const greeting = name ? `Hi ${name}, this is Bo Johnson.` : `Hi, this is Bo Johnson.`;

  const subject = `A hello from Bo, EventHub's founder`;

  const body = `
    <h2 style="margin:0 0 16px;font-family:'Playfair Display',Georgia,serif;font-size:22px;color:${SLATE};">Thanks for signing up — I'd love to hear from you</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
      I built EventHub to make your life easier and to give your customers the best
      possible experience. The fact you took the time to make an account means there
      was something you felt we could help you with.
    </p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
      I would love to give you a call (yes, a phone call) to learn how I can best
      serve you. The product is still growing and changing and I would love for it
      to change in a way that best meets your needs!
    </p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
      Just respond to this email and I'll be in touch. I'm excited to meet!
    </p>
    <p style="margin:0;font-size:15px;line-height:1.6;">Best,</p>
    <p style="margin:0 0 2px;font-family:'Playfair Display',Georgia,serif;font-size:18px;color:${SLATE};">Bo Johnson</p>
    <p style="margin:0;font-size:13px;color:#999;">Founder of EventHub</p>
  `;

  const text = [
    greeting,
    ``,
    `I built EventHub to make your life easier and to give your customers the best possible experience. The fact you took the time to make an account means there was something you felt we could help you with.`,
    ``,
    `I would love to give you a call (yes, a phone call) to learn how I can best serve you. The product is still growing and changing and I would love for it to change in a way that best meets your needs!`,
    ``,
    `Just respond to this email and I'll be in touch. I'm excited to meet!`,
    ``,
    `Best,`,
    `Bo Johnson`,
    `Founder of EventHub`,
  ].join("\n");

  return { subject, html: baseWrapper(body), text };
}
