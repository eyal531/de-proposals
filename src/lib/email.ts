import "server-only";

// Transactional email. Two providers are supported; the first one configured wins:
//   Brevo  – BREVO_API_KEY  (https://app.brevo.com → SMTP & API → API Keys). Sender must be a verified sender/domain in Brevo.
//   Resend – RESEND_API_KEY (https://resend.com)
// EMAIL_FROM – sender, e.g. "דיגיטל אפקטיב <proposals@digitaleffective.co.il>" (required for Brevo).

export interface EmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

type Provider = "brevo" | "resend" | null;

export function emailProvider(): Provider {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export function emailConfigured(): boolean {
  return emailProvider() !== null;
}

/** "Name <a@b.com>" → {name, email}; "a@b.com" → {email} */
export function parseFrom(from: string): { name?: string; email: string } | null {
  const s = from.trim();
  const m = /^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(s);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || undefined, email: m[2] };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { email: s };
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Simple RTL email layout. `lines` are plain text paragraphs (escaped). */
export function emailHtml(opts: { title: string; lines: string[]; buttonText?: string; buttonUrl?: string; footer?: string }): string {
  const paragraphs = opts.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.6">${esc(l).replace(/\n/g, "<br>")}</p>`).join("");
  const button =
    opts.buttonText && opts.buttonUrl
      ? `<p style="margin:20px 0"><a href="${esc(opts.buttonUrl)}" style="background:#1f4e79;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:bold">${esc(opts.buttonText)}</a></p>`
      : "";
  return `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e4e7ec;border-radius:12px;padding:24px;direction:rtl;text-align:right">
<h2 style="margin:0 0 16px;color:#1f4e79;font-size:20px">${esc(opts.title)}</h2>${paragraphs}${button}
<p style="margin:24px 0 0;font-size:12px;color:#667085">${esc(opts.footer ?? "הודעה אוטומטית ממערכת ההצעות של דיגיטל אפקטיב")}</p>
</div></body></html>`;
}

async function sendBrevo(to: string[], subject: string, html: string): Promise<EmailResult> {
  const sender = parseFrom(process.env.EMAIL_FROM ?? "");
  if (!sender) return { ok: false, error: "EMAIL_FROM חסר או לא תקין (נדרש עבור Brevo)" };
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender, to: to.map((email) => ({ email })), subject, htmlContent: html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[email:brevo] send failed", res.status, text);
    const hint = /unrecognised IP|unauthorized ip/i.test(text) ? " – יש לבטל את חסימת כתובות ה-IP ב-Brevo" : "";
    return { ok: false, error: `${res.status}: ${text.slice(0, 200)}${hint}` };
  }
  return { ok: true };
}

async function sendResend(to: string[], subject: string, html: string): Promise<EmailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Digital Effective <onboarding@resend.dev>", to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[email:resend] send failed", res.status, text);
    return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<EmailResult> {
  const recipients = Array.from(new Set((Array.isArray(to) ? to : [to]).map((x) => x.trim()).filter(Boolean)));
  if (!recipients.length) return { ok: false, skipped: true, error: "no recipients" };
  const provider = emailProvider();
  if (!provider) {
    console.warn("[email] no provider configured – skipped:", subject);
    return { ok: false, skipped: true, error: "email not configured" };
  }
  try {
    return provider === "brevo" ? await sendBrevo(recipients, subject, html) : await sendResend(recipients, subject, html);
  } catch (e) {
    console.error("[email] send error", e);
    return { ok: false, error: String(e) };
  }
}
