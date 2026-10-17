import { describe, expect, it } from "vitest";
import { detectSignals, isPublicHost, parsePage, pickInternalLinks, signalsSummary } from "./site";

const html = `<!doctype html><html><head><title>קליניקה אקמה | טיפולי פנים</title>
<meta name="description" content="טיפולי פנים ולייזר ברמת גן">
<meta name="viewport" content="width=device-width">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>
<style>.x{color:red}</style></head>
<body><h1>טיפולי פנים &amp; לייזר</h1><h2>למה אנחנו</h2>
<p>קליניקה   מובילה ברמת גן</p>
<a href="/about">אודות</a><a href="/%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99%D7%9D/">שירותים</a><a href="https://other.com/x">חיצוני</a>
<a href="/blog/post-1">בלוג</a><a href="tel:031234567">חייגו</a><a href="https://wa.me/972500000000">וואטסאפ</a>
<a href="https://www.instagram.com/acme">ig</a><form action="/send"></form>
<script>console.log("hidden")</script></body></html>`;

describe("site parsing", () => {
  it("parsePage extracts title, description, headings and visible text", () => {
    const p = parsePage("https://acme.co.il/", html);
    expect(p.title).toBe("קליניקה אקמה | טיפולי פנים");
    expect(p.description).toBe("טיפולי פנים ולייזר ברמת גן");
    expect(p.headings).toEqual(["H1: טיפולי פנים & לייזר", "H2: למה אנחנו"]);
    expect(p.text).toContain("קליניקה מובילה ברמת גן");
    expect(p.text).not.toContain("hidden");
    expect(p.text).not.toContain("color:red");
  });

  it("detectSignals finds tracking and contact options", () => {
    const s = detectSignals("https://acme.co.il/", [html]);
    expect(s).toMatchObject({ https: true, ga4: true, gtm: false, metaPixel: false, whatsapp: true, phoneLink: true, forms: 1, viewport: true });
    expect(s.socialLinks).toEqual(["instagram"]);
    expect(signalsSummary(s)).toContain("לא זוהה פיקסל מטא (פייסבוק).");
  });

  it("pickInternalLinks keeps key same-site pages only", () => {
    const links = pickInternalLinks(new URL("https://www.acme.co.il/"), html);
    expect(links).toEqual(["https://www.acme.co.il/about", "https://www.acme.co.il/%D7%A9%D7%99%D7%A8%D7%95%D7%AA%D7%99%D7%9D/"]);
  });

  it("isPublicHost blocks internal targets", () => {
    expect(isPublicHost("acme.co.il")).toBe(true);
    expect(isPublicHost("localhost")).toBe(false);
    expect(isPublicHost("127.0.0.1")).toBe(false);
    expect(isPublicHost("192.168.1.5")).toBe(false);
    expect(isPublicHost("10.0.0.1")).toBe(false);
    expect(isPublicHost("8.8.8.8")).toBe(true);
  });
});
