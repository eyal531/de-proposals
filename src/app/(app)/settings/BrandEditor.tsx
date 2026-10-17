"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { BRAND_FONTS, DEFAULT_BRAND, type Brand, type CoverStyle } from "@/lib/types";
import { CoverPreview } from "@/components/proposal/Cover";

const COVERS: { key: CoverStyle; label: string }[] = [
  { key: "dark", label: "שחור" },
  { key: "accent", label: "צבע המותג" },
  { key: "light", label: "בהיר" },
];

export function BrandEditor({ brand, onChange }: { brand: Brand; onChange: (b: Brand) => void }) {
  const set = (patch: Partial<Brand>) => onChange({ ...brand, ...patch });
  const file = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(f: File) {
    setErr(null);
    if (!/^image\/(png|svg\+xml|jpeg|webp)$/.test(f.type)) return setErr("יש להעלות קובץ PNG, SVG, JPG או WEBP");
    if (f.size > 2 * 1024 * 1024) return setErr("הקובץ גדול מ-2MB");
    setUploading(true);
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const sb = createClient();
    const { error } = await sb.storage.from("branding").upload(path, f, { contentType: f.type, upsert: false });
    setUploading(false);
    if (error) return setErr(`ההעלאה נכשלה: ${error.message}`);
    set({ logo_url: sb.storage.from("branding").getPublicUrl(path).data.publicUrl });
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-bold">מיתוג ועיצוב ההצעה</h2>
        <p className="text-sm text-muted">כך תיראה כל הצעה שהלקוח מקבל. השינויים חלים על כל ההצעות אחרי השמירה.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <div>
            <label className="label">לוגו</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-12 w-48 items-center justify-center rounded-lg border border-line bg-white px-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logo_url || DEFAULT_BRAND.logo_url} alt="לוגו" className="max-h-8 max-w-full" />
              </div>
              <button type="button" className="btn btn-sm" disabled={uploading} onClick={() => file.current?.click()}>
                {uploading ? "מעלה…" : "העלאת לוגו"}
              </button>
              {brand.logo_url !== DEFAULT_BRAND.logo_url && (
                <button type="button" className="btn btn-sm" onClick={() => set({ logo_url: DEFAULT_BRAND.logo_url })}>
                  חזרה ללוגו המקורי
                </button>
              )}
              <input ref={file} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
            {err && <p className="mt-1 text-sm text-red-700">{err}</p>}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={brand.logo_on_dark === "invert"} onChange={(e) => set({ logo_on_dark: e.target.checked ? "invert" : "as_is" })} />
              להציג את הלוגו בלבן על רקע כהה
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">צבע מותג</label>
              <div className="flex gap-2">
                <input type="color" className="h-10 w-12 cursor-pointer rounded border border-line" value={brand.accent} onChange={(e) => set({ accent: e.target.value })} />
                <input className="input num" value={brand.accent} onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && set({ accent: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">גופן</label>
              <select className="select" value={brand.font} onChange={(e) => set({ font: e.target.value })}>
                {BRAND_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">רקע עמוד השער</label>
            <div className="flex gap-2">
              {COVERS.map((c) => (
                <button type="button" key={c.key} className={`btn btn-sm ${brand.cover === c.key ? "btn-primary" : ""}`} onClick={() => set({ cover: c.key })}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">טלפון</label>
              <input className="input" dir="ltr" value={brand.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div>
              <label className="label">אימייל</label>
              <input className="input" dir="ltr" value={brand.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
            <div>
              <label className="label">אתר</label>
              <input className="input" dir="ltr" value={brand.website} onChange={(e) => set({ website: e.target.value })} />
            </div>
          </div>
        </div>

        <div>
          <div className="label">תצוגה מקדימה</div>
          <CoverPreview brand={brand} />
        </div>
      </div>
    </section>
  );
}
