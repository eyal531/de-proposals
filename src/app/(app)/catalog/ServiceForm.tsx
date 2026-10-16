"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ParamsEditor } from "@/components/ParamsEditor";
import { MODEL_LABEL } from "@/lib/pricing/meta";
import { listPrice } from "@/lib/pricing/engine";
import type { PricingModel, PricingParams } from "@/lib/pricing/types";
import { dateTimeHe, ils } from "@/lib/format";
import type { Service } from "@/lib/types";
import { saveService } from "./actions";

const AI_PROFILES: Record<string, string> = {
  "": "ללא",
  media_google: "מדיה – גוגל (הערכת תקציב PPC)",
  media_social: "מדיה – סושיאל (קהלים וקריאייטיב)",
  seo: "SEO (ניתוח ביטויים)",
  website: "בניית אתר (חלופות ותבניות)",
  landing: "עמוד נחיתה",
  cro: "CRO",
  dashboard: "דשבורד",
  consulting: "ייעוץ",
  social: "ניהול סושיאל",
};

export function ServiceForm({ service, categories, history = [] }: { service?: Service; categories: string[]; history?: Record<string, unknown>[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState({
    category: service?.category ?? categories[0] ?? "",
    name: service?.name ?? "",
    client_name: service?.client_name ?? "",
    description: service?.description ?? "",
    deliverables: (service?.deliverables ?? []).join("\n"),
    exclusions: (service?.exclusions ?? []).join("\n"),
    pricing_model: (service?.pricing_model ?? "fixed_monthly") as PricingModel,
    params: (service?.params ?? {}) as PricingParams,
    floor_price: service?.floor_price ?? null,
    min_commitment_months: service?.min_commitment_months ?? null,
    ai_profile: service?.ai_profile ?? "",
    active: service?.active ?? true,
    sort: service?.sort ?? 999,
  });
  const set = (patch: Partial<typeof s>) => setS((x) => ({ ...x, ...patch }));
  const preview = listPrice(s.pricing_model, s.params, 1, 30000);

  function submit() {
    setErr(null);
    start(async () => {
      const r = await saveService({
        id: service?.id,
        ...s,
        deliverables: s.deliverables.split("\n"),
        exclusions: s.exclusions.split("\n"),
        params: s.params as Record<string, unknown>,
        floor_price: s.floor_price === null ? null : Number(s.floor_price),
        min_commitment_months: s.min_commitment_months === null ? null : Number(s.min_commitment_months),
        ai_profile: s.ai_profile || null,
      });
      if (r.ok) router.push("/catalog");
      else setErr(r.error);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">{service ? `עריכת שירות: ${service.name}` : "שירות חדש"}</h1>
      <section className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">קטגוריה</label>
            <input className="input" list="cats" value={s.category} onChange={(e) => set({ category: e.target.value })} />
            <datalist id="cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">שם פנימי</label>
            <input className="input" value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <label className="label">שם ללקוח</label>
            <input className="input" value={s.client_name} onChange={(e) => set({ client_name: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">תיאור שיווקי</label>
          <textarea className="textarea" value={s.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">מה כלול (שורה לכל תוצר)</label>
            <textarea className="textarea" value={s.deliverables} onChange={(e) => set({ deliverables: e.target.value })} />
          </div>
          <div>
            <label className="label">מה לא כלול</label>
            <textarea className="textarea" value={s.exclusions} onChange={(e) => set({ exclusions: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">תמחור</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">מודל תמחור</label>
            <select className="select" value={s.pricing_model} onChange={(e) => set({ pricing_model: e.target.value as PricingModel })}>
              {(Object.keys(MODEL_LABEL) as PricingModel[]).map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">מחיר רצפה (₪)</label>
            <input className="input num" type="number" value={s.floor_price ?? ""} onChange={(e) => set({ floor_price: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">התחייבות מינימלית (חודשים)</label>
            <input className="input num" type="number" value={s.min_commitment_months ?? ""} onChange={(e) => set({ min_commitment_months: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
        </div>
        <ParamsEditor model={s.pricing_model} params={s.params} onChange={(params) => set({ params })} />
        <p className="text-xs text-muted">
          דוגמה (תקציב מדיה 30,000 ₪): {ils(preview.list)} · {preview.explanation}
        </p>
      </section>

      <section className="card grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">ניתוח AI שהשירות מפעיל</label>
          <select className="select" value={s.ai_profile} onChange={(e) => set({ ai_profile: e.target.value })}>
            {Object.entries(AI_PROFILES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">סדר תצוגה</label>
          <input className="input num" type="number" value={s.sort} onChange={(e) => set({ sort: Number(e.target.value) })} />
        </div>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.active} onChange={(e) => set({ active: e.target.checked })} />
          שירות פעיל
        </label>
      </section>

      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={() => router.back()}>
          ביטול
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={submit}>
          {pending ? "שומר…" : "שמירה"}
        </button>
      </div>

      {history.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">היסטוריית מחירים</h2>
          <ul className="space-y-1 text-xs text-muted">
            {history.map((h) => (
              <li key={String(h.id)}>
                {dateTimeHe(String(h.changed_at))} · {MODEL_LABEL[h.pricing_model as PricingModel]} · <span className="num">{JSON.stringify(h.params)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
