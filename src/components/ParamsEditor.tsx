"use client";

import { MODEL_FIELDS } from "@/lib/pricing/meta";
import type { MediaTier, Milestone, PricingModel, PricingParams, VolumeDiscount } from "@/lib/pricing/types";

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function ParamsEditor({ model, params, onChange, compact = false }: { model: PricingModel; params: PricingParams; onChange: (p: PricingParams) => void; compact?: boolean }) {
  const fields = MODEL_FIELDS[model];
  const set = (patch: Partial<PricingParams>) => onChange({ ...params, ...patch });

  return (
    <div className={`grid gap-2 ${compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"}`}>
      {fields.map((f) => {
        if (f.type === "number") {
          const v = params[f.key];
          return (
            <div key={f.key}>
              <label className="label">
                {f.label}
                {f.suffix ? ` (${f.suffix})` : ""}
              </label>
              <input
                className="input num"
                type="number"
                step="any"
                value={v === null || v === undefined ? "" : String(v)}
                onChange={(e) => set({ [f.key]: num(e.target.value) } as Partial<PricingParams>)}
              />
            </div>
          );
        }
        if (f.type === "text")
          return (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <input className="input" value={params.unitLabel ?? ""} onChange={(e) => set({ unitLabel: e.target.value })} />
            </div>
          );
        if (f.type === "billing")
          return (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              <select className="select" value={params.hourlyBilling ?? "one_time"} onChange={(e) => set({ hourlyBilling: e.target.value as "monthly" | "one_time" })}>
                <option value="one_time">חד-פעמי</option>
                <option value="monthly">חודשי</option>
              </select>
            </div>
          );
        if (f.type === "tiers") return <TiersEditor key={f.key} tiers={params.tiers ?? []} onChange={(tiers) => set({ tiers })} />;
        if (f.type === "milestones") return <MilestonesEditor key={f.key} items={params.milestones ?? []} onChange={(milestones) => set({ milestones })} />;
        if (f.type === "volume") return <VolumeEditor key={f.key} items={params.volumeDiscounts ?? []} onChange={(volumeDiscounts) => set({ volumeDiscounts })} />;
        return null;
      })}
    </div>
  );
}

function TiersEditor({ tiers, onChange }: { tiers: MediaTier[]; onChange: (t: MediaTier[]) => void }) {
  return (
    <div className="sm:col-span-2">
      <label className="label">מדרגות (תקציב מדיה עד ← עמלה)</label>
      {tiers.map((t, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <input className="input num" type="number" placeholder="עד (ריק = ללא תקרה)" value={t.upTo ?? ""} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, upTo: num(e.target.value) } : x)))} />
          <input className="input num" type="number" placeholder="עמלה" value={t.fee} onChange={(e) => onChange(tiers.map((x, j) => (j === i ? { ...x, fee: Number(e.target.value) } : x)))} />
          <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(tiers.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...tiers, { upTo: null, fee: 0 }])}>
        + מדרגה
      </button>
    </div>
  );
}

function MilestonesEditor({ items, onChange }: { items: Milestone[]; onChange: (m: Milestone[]) => void }) {
  const total = items.reduce((a, m) => a + (Number(m.percent) || 0), 0);
  return (
    <div className="sm:col-span-2">
      <label className="label">פריסת תשלומים (אופציונלי){items.length > 0 && total !== 100 && <span className="text-red-700"> · סה&quot;כ {total}%</span>}</label>
      {items.map((m, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <input className="input" placeholder="שלב" value={m.label} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <input className="input num w-28" type="number" placeholder="%" value={m.percent} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))} />
          <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...items, { label: "", percent: 0 }])}>
        + שלב תשלום
      </button>
    </div>
  );
}

function VolumeEditor({ items, onChange }: { items: VolumeDiscount[]; onChange: (m: VolumeDiscount[]) => void }) {
  return (
    <div className="sm:col-span-2">
      <label className="label">הנחות כמות (מכמות ← %)</label>
      {items.map((m, i) => (
        <div key={i} className="mb-1 flex gap-2">
          <input className="input num" type="number" placeholder="מכמות" value={m.minQty} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, minQty: Number(e.target.value) } : x)))} />
          <input className="input num" type="number" placeholder="%" value={m.percent} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))} />
          <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...items, { minQty: 2, percent: 5 }])}>
        + הנחת כמות
      </button>
    </div>
  );
}
