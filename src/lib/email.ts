import "server-only";

// Transactional email through Resend (https://resend.com). Configure in Vercel:
//   RESEND_API_KEY  – required to send
//   EMAIL_FROM      – e.g. "דיגיטל אפקטיב <proposals@digitaleffective.co.il>" (domain must be verified in Resend).
//                     Until a domain is verified, Resend only delivers to the Resend account owner's address.

export interface EmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
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

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const recipients = (Array.isArray(to) ? to : [to]).map((x) => x.trim()).filter(Boolean);
  if (!recipients.length) return { ok: false, skipped: true, error: "no recipients" };
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set – skipped:", subject);
    return { ok: false, skipped: true, error: "email not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Digital Effective <onboarding@resend.dev>", to: recipients, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[email] send failed", res.status, text);
      return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] send error", e);
    return { ok: false, error: String(e) };
  }
}
