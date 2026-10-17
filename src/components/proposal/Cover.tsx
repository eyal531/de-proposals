import type { Brand } from "@/lib/types";
import { DEFAULT_BRAND } from "@/lib/types";

const FONT_WEIGHTS: Record<string, string> = {
  "IBM Plex Sans Hebrew": "100;200;300;400;500;600;700",
  Heebo: "100;200;300;400;500;600;700;800",
  Rubik: "300;400;500;600;700;800",
  Assistant: "200;300;400;500;600;700;800",
  "Noto Sans Hebrew": "100;200;300;400;500;600;700;800",
  "Frank Ruhl Libre": "300;400;500;600;700;800",
};

/** Google Fonts stylesheet for the brand font (rendered inside the document; React hoists <link>). */
export function BrandFont({ font }: { font: string }) {
  const weights = FONT_WEIGHTS[font];
  if (!weights) return null;
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@${weights}&display=swap`;
  return <link rel="stylesheet" href={href} precedence="default" />;
}

/** CSS variables for a proposal document. */
export function brandVars(brand: Brand): React.CSSProperties {
  const thin = brand.font === "Rubik" || brand.font === "Frank Ruhl Libre" ? 300 : 200;
  return {
    ["--accent" as string]: brand.accent || DEFAULT_BRAND.accent,
    ["--doc-font" as string]: `"${brand.font}", "Heebo", system-ui, sans-serif`,
    ["--thin" as string]: String(thin),
  };
}

function coverColors(brand: Brand) {
  if (brand.cover === "light") return { bg: "#ffffff", fg: "#000000", soft: "rgba(0,0,0,.55)", rule: "rgba(0,0,0,.18)", dark: false };
  if (brand.cover === "accent") return { bg: brand.accent, fg: "#ffffff", soft: "rgba(255,255,255,.72)", rule: "rgba(255,255,255,.3)", dark: true };
  return { bg: "#000000", fg: "#ffffff", soft: "rgba(255,255,255,.62)", rule: "rgba(255,255,255,.22)", dark: true };
}

export function BrandLogo({ brand, onDark, className }: { brand: Brand; onDark: boolean; className?: string }) {
  const url = brand.logo_url || DEFAULT_BRAND.logo_url;
  const isDefault = url === DEFAULT_BRAND.logo_url;
  const src = onDark && isDefault ? "/brand/logo-white.png" : url;
  const invert = onDark && !isDefault && brand.logo_on_dark === "invert";
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="דיגיטל אפקטיב" className={className} style={invert ? { filter: "brightness(0) invert(1)" } : undefined} />;
}

/** Split "הצעה לניהול X עבור אקמה" into a heavy line and a thin client line. */
export function splitTitle(title: string, company: string | null): [string, string | null] {
  const c = (company ?? "").trim();
  if (c && title.endsWith(` עבור ${c}`)) return [title.slice(0, -(` עבור ${c}`).length), c];
  return [title, c || null];
}

export function Cover({
  brand,
  greeting,
  title,
  company,
  meta,
}: {
  brand: Brand;
  greeting: string[] | null;
  title: string;
  company: string | null;
  meta: { label: string; value: string }[];
}) {
  const c = coverColors(brand);
  const [main, client] = splitTitle(title, company);
  const showMark = (brand.logo_url || DEFAULT_BRAND.logo_url) === DEFAULT_BRAND.logo_url;
  return (
    <header className={`pdoc-cover ${c.dark ? "" : "is-light"}`} style={{ background: c.bg, color: c.fg }}>
      {showMark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.dark ? "/brand/mark-white.png" : "/brand/mark.png"} alt="" aria-hidden className="pdoc-cover-mark" />
      )}
      <div className="pdoc-cover-inner">
        <BrandLogo brand={brand} onDark={c.dark} className="pdoc-cover-logo" />

        <div className="pdoc-cover-body">
          {greeting && (
            <div className="pdoc-greeting">
              <div style={{ color: c.soft }}>{greeting[0]}</div>
              {greeting.slice(1).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
          <h1 className="pdoc-title">
            <span className="pdoc-title-main">{main}</span>
            {client && <span className="pdoc-title-client">{client}</span>}
          </h1>
        </div>

        <dl className="pdoc-cover-meta" style={{ borderColor: c.rule }}>
          {meta.map((m) => (
            <div key={m.label}>
              <dt style={{ color: c.soft }}>{m.label}</dt>
              <dd className="num">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

/** Small scaled cover for the branding settings screen. */
export function CoverPreview({ brand }: { brand: Brand }) {
  return (
    <div className="pdoc pdoc-preview overflow-hidden rounded-xl border border-line" style={brandVars(brand)}>
      <BrandFont font={brand.font} />
      <Cover
        brand={brand}
        greeting={["לכבוד", 'ישראל ישראלי, מנכ"ל', 'אקמה בע"מ']}
        title='הצעה לניהול שיווק דיגיטלי עבור אקמה בע"מ'
        company='אקמה בע"מ'
        meta={[
          { label: "הצעה", value: "2026-0007" },
          { label: "תאריך", value: "17.10.2026" },
          { label: "בתוקף עד", value: "31.10.2026" },
        ]}
      />
    </div>
  );
}
