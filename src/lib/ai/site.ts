// Reads a client's public website: text of the main pages plus objective technical findings (spec 9.4).
// Pure parsing helpers are exported for tests; fetchSite() does the network work (server only).

export interface PageInfo {
  url: string;
  title: string;
  description: string;
  headings: string[];
  text: string;
}

export interface SiteSignals {
  https: boolean;
  ga4: boolean;
  gtm: boolean;
  metaPixel: boolean;
  googleAds: boolean;
  tiktokPixel: boolean;
  linkedinInsight: boolean;
  hotjarOrClarity: boolean;
  whatsapp: boolean;
  phoneLink: boolean;
  forms: number;
  viewport: boolean;
  cms: string | null;
  socialLinks: string[];
}

export interface SiteScan {
  url: string;
  ok: boolean;
  error?: string;
  pages: PageInfo[];
  signals: SiteSignals | null;
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const clean = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export function parsePage(url: string, html: string, maxText = 5000): PageInfo {
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const description = decode(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] ?? "").trim();
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const headings = Array.from(body.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi))
    .map((m) => `H${m[1]}: ${clean(m[2])}`)
    .filter((h) => h.length > 4)
    .slice(0, 30);
  const text = clean(body).slice(0, maxText);
  return { url, title, description, headings, text };
}

export function detectSignals(url: string, htmls: string[]): SiteSignals {
  const all = htmls.join("\n");
  const has = (re: RegExp) => re.test(all);
  const socials = new Set<string>();
  for (const m of all.matchAll(/https?:\/\/(?:www\.)?(facebook|instagram|tiktok|linkedin|youtube|twitter|x)\.com\/[^"'\s<>]+/gi)) socials.add(m[1].toLowerCase());
  let cms: string | null = null;
  if (has(/wp-content|wp-includes/i)) cms = has(/elementor/i) ? "WordPress (Elementor)" : "WordPress";
  else if (has(/wixstatic|wix\.com/i)) cms = "Wix";
  else if (has(/cdn\.shopify|shopify/i)) cms = "Shopify";
  else if (has(/squarespace/i)) cms = "Squarespace";
  else if (has(/webflow/i)) cms = "Webflow";
  else if (has(/__next|_next\/static/i)) cms = "Next.js";
  return {
    https: url.startsWith("https://"),
    ga4: has(/gtag\/js\?id=G-|['"]G-[A-Z0-9]{6,}['"]/),
    gtm: has(/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/),
    metaPixel: has(/connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/),
    googleAds: has(/['"]AW-\d{6,}/),
    tiktokPixel: has(/analytics\.tiktok\.com/),
    linkedinInsight: has(/snap\.licdn\.com|_linkedin_partner_id/),
    hotjarOrClarity: has(/static\.hotjar\.com|clarity\.ms/),
    whatsapp: has(/wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i),
    phoneLink: has(/href=["']tel:/i),
    forms: (all.match(/<form[\s>]/gi) ?? []).length,
    viewport: has(/<meta[^>]+name=["']viewport["']/i),
    cms,
    socialLinks: Array.from(socials),
  };
}

const KEY_PAGES = /(about|services?|service|solutions|products?|pricing|contact|team|clients|portfolio|אודות|שירות|מוצר|מחיר|צור-קשר|צרו-קשר|קשר|לקוחות|תיק-עבודות|עלינו)/i;

export function pickInternalLinks(base: URL, html: string, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>([base.pathname.replace(/\/$/, "") || "/"]);
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(decode(m[1]), base);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4)$/i.test(u.pathname)) continue;
    const path = u.pathname.replace(/\/$/, "") || "/";
    if (seen.has(path)) continue;
    let p = path;
    try {
      p = decodeURIComponent(path);
    } catch {
      // keep raw
    }
    if (!KEY_PAGES.test(p)) continue;
    seen.add(path);
    out.push(`${u.origin}${u.pathname}`);
    if (out.length >= max) break;
  }
  return out;
}

/** Blocks obviously internal targets (basic SSRF guard). */
export function isPublicHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  if (h.includes(":")) return false; // IPv6 literals
  return h.includes(".");
}

async function get(url: string, timeoutMs: number): Promise<{ url: string; html: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DigitalEffectiveProposalBot/1.0)", "Accept-Language": "he,en;q=0.8" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const finalUrl = res.url || url;
    if (!isPublicHost(new URL(finalUrl).hostname)) return null;
    const html = (await res.text()).slice(0, 1_500_000);
    return { url: finalUrl, html };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchSite(website: string): Promise<SiteScan> {
  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  } catch {
    return { url: website, ok: false, error: "כתובת אתר לא תקינה", pages: [], signals: null };
  }
  if (!isPublicHost(base.hostname)) return { url: website, ok: false, error: "כתובת אתר לא ציבורית", pages: [], signals: null };

  const home = (await get(base.toString(), 10000)) ?? (base.protocol === "https:" ? await get(base.toString().replace("https:", "http:"), 8000) : null);
  if (!home) return { url: base.toString(), ok: false, error: "האתר לא נטען (חסום, איטי או לא קיים)", pages: [], signals: null };

  const homeUrl = new URL(home.url);
  const links = pickInternalLinks(homeUrl, home.html, 5);
  const others = (await Promise.all(links.map((l) => get(l, 8000)))).filter(Boolean) as { url: string; html: string }[];
  const pages = [parsePage(home.url, home.html, 6000), ...others.map((o) => parsePage(o.url, o.html, 3500))];
  return { url: home.url, ok: true, pages, signals: detectSignals(home.url, [home.html, ...others.map((o) => o.html)]) };
}

/** Human-readable (Hebrew) list of objective findings, fed to the model as facts. */
export function signalsSummary(s: SiteSignals): string[] {
  const yes = (b: boolean, on: string, off: string) => (b ? on : off);
  return [
    yes(s.https, "האתר מאובטח (HTTPS).", "האתר לא מאובטח (אין HTTPS)."),
    yes(s.ga4, "מותקן Google Analytics 4.", "לא זוהה Google Analytics 4."),
    yes(s.gtm, "מותקן Google Tag Manager.", "לא זוהה Google Tag Manager."),
    yes(s.metaPixel, "מותקן פיקסל מטא (פייסבוק).", "לא זוהה פיקסל מטא (פייסבוק)."),
    yes(s.googleAds, "מותקן תג המרות של Google Ads.", "לא זוהה תג המרות של Google Ads."),
    yes(s.tiktokPixel, "מותקן פיקסל טיקטוק.", "לא זוהה פיקסל טיקטוק."),
    yes(s.linkedinInsight, "מותקן LinkedIn Insight Tag.", "לא זוהה LinkedIn Insight Tag."),
    yes(s.hotjarOrClarity, "מותקן כלי הקלטת גולשים (Hotjar/Clarity).", "לא זוהה כלי הקלטת גולשים."),
    yes(s.whatsapp, "יש קישור לוואטסאפ.", "לא נמצא קישור לוואטסאפ."),
    yes(s.phoneLink, "יש קישור חיוג ישיר (tel).", "לא נמצא קישור חיוג ישיר."),
    s.forms > 0 ? `נמצאו ${s.forms} טפסים בעמודים שנסרקו.` : "לא נמצאו טפסי יצירת קשר בעמודים שנסרקו.",
    yes(s.viewport, "האתר מוגדר לתצוגה בנייד (viewport).", "חסרה הגדרת תצוגה לנייד (viewport)."),
    s.cms ? `פלטפורמת האתר: ${s.cms}.` : "פלטפורמת האתר לא זוהתה.",
    s.socialLinks.length ? `קישורים לרשתות: ${s.socialLinks.join(", ")}.` : "לא נמצאו קישורים לרשתות חברתיות.",
  ];
}
