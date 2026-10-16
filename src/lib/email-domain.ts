// Classifies a contact email as personal (free mail provider) or business, and guesses the company website (spec 9.3).

export const DEFAULT_FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "walla.co.il",
  "walla.com",
  "hotmail.com",
  "hotmail.co.il",
  "outlook.com",
  "outlook.co.il",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.il",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zahav.net.il",
  "012.net.il",
  "013.net",
  "013net.net",
  "bezeqint.net",
  "netvision.net.il",
  "smile.net.il",
  "inter.net.il",
  "barak.net.il",
  "nana.co.il",
  "nana10.co.il",
];

export type EmailKind = "business" | "personal" | "invalid";

export interface EmailClassification {
  kind: EmailKind;
  domain: string | null;
  websiteGuess: string | null;
}

const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export function classifyEmail(email: string, freeDomains: string[] = DEFAULT_FREE_EMAIL_DOMAINS): EmailClassification {
  const m = EMAIL_RE.exec((email ?? "").trim().toLowerCase());
  if (!m) return { kind: "invalid", domain: null, websiteGuess: null };
  let domain = m[1].replace(/\.$/, "");
  const free = new Set(freeDomains.map((d) => d.trim().toLowerCase()));
  if (free.has(domain)) return { kind: "personal", domain, websiteGuess: null };
  // mail.acme.co.il → acme.co.il
  domain = domain.replace(/^(mail|email|smtp|mx)\./, "");
  return { kind: "business", domain, websiteGuess: `https://${domain}` };
}

/** Normalizes user input like "acme.co.il" or "www.acme.co.il/" into "https://www.acme.co.il" */
export function normalizeWebsite(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes(".")) return null;
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return null;
  }
}
