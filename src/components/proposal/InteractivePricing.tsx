"use client";

import { useMemo, useState } from "react";
import { applySelection, computePricing } from "@/lib/pricing/engine";
import type { PricingItemInput } from "@/lib/pricing/types";
import type { PublicItem } from "@/lib/public-proposal";
import { ils } from "@/lib/format";

export function InteractivePricing(props: {
  items: PublicItem[];
  mediaBudget: number | null;
  commitmentMonths: number;
  globalDiscountPercent: number;
  showList: boolean;
  vatRate: number;
  rounding: number;
  token?: string;
  interactive: boolean;
}) {
  const [inputs, setInputs] = useState<PricingItemInput[]>(() =>
    props.items.map((i) => ({ id: i.id, name: i.name, model: i.pricing_model, params: i.params, quantity: i.quantity, discount: i.discount, kind: i.kind, groupKey: i.group_key, selected: i.selected })),
  );
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(
    () => computePricing(inputs, { vatRate: props.vatRate, rounding: props.rounding, mediaBudget: props.mediaBudget, commitmentMonths: props.commitmentMonths, globalDiscountPercent: props.globalDiscountPercent }),
    [inputs, props.vatRate, props.rounding, props.mediaBudget, props.commitmentMonths, props.globalDiscountPercent],
  );
  const line = (id: string) => result.lines.find((l) => l.id === id)!;
  const t = result.totals;

  async function toggle(id: string, selected: boolean) {
    if (!props.interactive) return;
    const prev = inputs;
    setInputs(applySelection(inputs, id, selected));
    if (!props.token) return; // preview mode: local only
    setError(null);
    const res = await fetch(`/api/p/${props.token}/select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: id, selected }) });
    if (!res.ok) {
      setInputs(prev);
      setError("לא הצלחנו לשמור את הבחירה. נסו שוב.");
    }
  }

  const required = inputs.filter((i) => i.kind === "required");
  const optional = inputs.filter((i) => i.kind === "optional");
  const groups = Array.from(new Set(inputs.filter((i) => i.kind === "alternative").map((i) => i.groupKey ?? i.id)));
  const hasMedia = result.lines.some((l) => l.mediaBudgetUsed !== null || l.breakEvenBudget !== null);

  const Price = ({ id }: { id: string }) => {
    const l = line(id);
    return (
      <div className="text-left">
        {props.showList && l.discountAmount > 0 && <div className="num text-xs text-muted line-through">{ils(l.listPrice)}</div>}
        <div className="num font-bold">{ils(l.net)}</div>
        <div className="text-xs text-muted">{l.billing === "monthly" ? "לחודש" : "חד-פעמי"}</div>
      </div>
    );
  };
  const Explain = ({ id }: { id: string }) => {
    const l = line(id);
    const item = inputs.find((i) => i.id === id)!;
    const milestones = item.params.milestones?.filter((m) => m.percent > 0) ?? [];
    return (
      <div className="text-xs text-muted">
        {l.explanation}
        {l.mediaBudgetUsed !== null && item.model !== "media_tiers" && ` · לפי תקציב מדיה משוער של ${ils(l.mediaBudgetUsed)} לחודש`}
        {milestones.length > 0 && ` · תשלומים: ${milestones.map((m) => `${m.label} ${m.percent}%`).join(", ")}`}
      </div>
    );
  };

  return (
    <section className="card space-y-5">
      <h2>ההשקעה</h2>

      <div className="divide-y divide-line">
        {required.map((i) => (
          <div key={i.id} className="flex items-start justify-between gap-4 py-3">
            <div>
              <div className="font-medium">{i.name}</div>
              <Explain id={i.id} />
            </div>
            <Price id={i.id} />
          </div>
        ))}
      </div>

      {groups.map((g) => {
        const alts = inputs.filter((i) => i.kind === "alternative" && (i.groupKey ?? i.id) === g);
        return (
          <div key={g} className="space-y-2">
            <div className="text-sm font-bold">{props.interactive ? "בחרו אחת מהאפשרויות:" : "אפשרויות:"}</div>
            {alts.map((i) => (
              <label key={i.id} className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-3 ${i.selected ? "border-brand bg-brand-soft" : "border-line"}`}>
                <div className="flex items-start gap-2">
                  <input type="radio" className="mt-1" name={`g-${g}`} checked={i.selected} disabled={!props.interactive} onChange={() => toggle(i.id, true)} />
                  <div>
                    <div className="font-medium">{i.name}</div>
                    <Explain id={i.id} />
                  </div>
                </div>
                <Price id={i.id} />
              </label>
            ))}
          </div>
        );
      })}

      {optional.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-bold">תוספות אפשריות:</div>
          {optional.map((i) => (
            <label key={i.id} className={`flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-3 ${i.selected ? "border-brand bg-brand-soft" : "border-line"}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={i.selected} disabled={!props.interactive} onChange={(e) => toggle(i.id, e.target.checked)} />
                <div>
                  <div className="font-medium">{i.name}</div>
                  <Explain id={i.id} />
                </div>
              </div>
              <Price id={i.id} />
            </label>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        {t.monthlyNet > 0 && (
          <div>
            <div className="text-sm text-muted">תשלום חודשי</div>
            <div className="num text-2xl font-bold text-brand">{ils(t.monthlyNet)}</div>
            <div className="text-xs text-muted">
              + מע״מ ({ils(t.monthlyWithVat)} כולל מע״מ){props.commitmentMonths > 1 ? ` · התחייבות ל-${props.commitmentMonths} חודשים` : ""}
            </div>
            {t.globalDiscountMonthly > 0 && <div className="text-xs text-green-700">כולל הנחה של {props.globalDiscountPercent}%</div>}
          </div>
        )}
        {t.oneTimeNet > 0 && (
          <div>
            <div className="text-sm text-muted">תשלום חד-פעמי</div>
            <div className="num text-2xl font-bold text-brand">{ils(t.oneTimeNet)}</div>
            <div className="text-xs text-muted">+ מע״מ ({ils(t.oneTimeWithVat)} כולל מע״מ)</div>
            {t.globalDiscountOneTime > 0 && <div className="text-xs text-green-700">כולל הנחה של {props.globalDiscountPercent}%</div>}
          </div>
        )}
      </div>
      {hasMedia && <p className="text-xs text-muted">תקציב המדיה משולם ישירות לפלטפורמות הפרסום ואינו כלול בסכומים. דמי הניהול בפועל מחושבים לפי תקציב המדיה בפועל בכל חודש.</p>}
    </section>
  );
}
